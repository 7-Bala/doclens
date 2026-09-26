import "server-only";
import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { sharedCooldowns, withModelFallback, type FailureKind } from "./retry";

export const DEFAULT_MODEL = "gemini-2.5-flash";
/**
 * Tried in order when a model is overloaded, out of quota or unavailable. Free-tier quotas are
 * per model, so each entry adds daily capacity. Override with GEMINI_FALLBACK_MODELS.
 */
export const DEFAULT_FALLBACKS = [
  "gemini-3-flash-preview",
  "gemini-3.6-flash",
  "gemini-flash-latest",
  "gemini-3.1-flash-lite",
  "gemini-flash-lite-latest",
];

export class ConfigError extends Error {}
export class ModelOutputError extends Error {}

let client: GoogleGenAI | null = null;

function getClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ConfigError("GEMINI_API_KEY is not configured on the server.");
  client ??= new GoogleGenAI({ apiKey });
  return client;
}

export function modelName(): string {
  return process.env.GEMINI_MODEL?.trim() || DEFAULT_MODEL;
}

export function modelChain(): string[] {
  const fallbacks = process.env.GEMINI_FALLBACK_MODELS?.split(",").map((m) => m.trim()).filter(Boolean) ?? DEFAULT_FALLBACKS;
  return [...new Set([modelName(), ...fallbacks])];
}

/**
 * Calls Gemini with a JSON schema derived from a Zod schema, then re-validates the
 * reply with the same Zod schema. The model is never trusted to follow the schema.
 * Transient overloads fall through the model chain (see retry.ts).
 */
export async function generateStructured<T extends z.ZodType>(options: {
  schema: T;
  system: string;
  prompt: string;
  temperature?: number;
  onRetry?: (info: { model: string; nextModel: string | null; kind: FailureKind }) => void;
}): Promise<z.infer<T>> {
  const ai = getClient();
  const jsonSchema = z.toJSONSchema(options.schema);

  const { result: response } = await withModelFallback(
    modelChain(),
    (model, abortSignal) =>
      ai.models.generateContent({
        model,
        contents: options.prompt,
        config: {
          systemInstruction: options.system,
          temperature: options.temperature ?? 0.2,
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchema,
          abortSignal,
          // Extraction does not benefit from long reasoning: measured ~40% faster with equal
          // verbatim-quote accuracy. Only 2.5 models accept a numeric budget.
          ...(model.startsWith("gemini-2.5") ? { thinkingConfig: { thinkingBudget: 0 } } : {}),
        },
      }),
    {
      cooldowns: sharedCooldowns,
      onRetry: ({ model, attempt, nextModel, kind }) => {
        console.warn(`[doclens] ${model} ${kind} (attempt ${attempt + 1}), next: ${nextModel ?? "none"}`);
        if (nextModel) options.onRetry?.({ model, nextModel, kind });
      },
    },
  );

  const raw = response.text;
  if (!raw) throw new ModelOutputError("The AI returned an empty response.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ModelOutputError("The AI returned malformed JSON.");
  }
  const result = options.schema.safeParse(parsed);
  if (!result.success) throw new ModelOutputError("The AI response did not match the expected format.");
  return result.data;
}
