import "server-only";
import { z } from "zod";
import { ConfigError, ModelOutputError } from "./gemini";
import { RateLimiter, clientKey } from "./rateLimit";
import { ServiceBusyError } from "./retry";

/** 10 AI requests per minute per client is plenty for a human and stops scripted abuse. */
const limiter = new RateLimiter(10, 60_000);

export function jsonError(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

export function rateLimited(request: Request): Response | null {
  return limiter.check(clientKey(request))
    ? null
    : jsonError(429, "Too many requests. Please wait a minute and try again.");
}

/** Parses and validates a JSON body; returns either the data or a ready-made 400 response. */
export async function parseJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<{ data: z.infer<T> } | { response: Response }> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { response: jsonError(400, "Request body must be valid JSON.") };
  }
  const result = schema.safeParse(body);
  if (!result.success) {
    return { response: jsonError(400, result.error.issues[0]?.message ?? "Invalid request.") };
  }
  return { data: result.data };
}

/** Maps internal failures to safe user-facing messages without leaking details. */
export function handleFailure(error: unknown): Response {
  if (error instanceof ConfigError) return jsonError(503, "The AI service is not configured yet.");
  if (error instanceof ServiceBusyError) {
    console.warn("[doclens]", error.message);
    return jsonError(
      503,
      error.quotaExhausted
        ? "The AI service has reached its usage limit for now. Please try again in a little while."
        : "The AI service is very busy right now. Please try again in a few seconds.",
    );
  }
  if (error instanceof ModelOutputError) return jsonError(502, "The AI returned an unusable answer. Please try again.");
  console.error("[doclens] request failed:", error instanceof Error ? error.message : "unknown error");
  return jsonError(500, "Something went wrong while analysing the document. Please try again.");
}
