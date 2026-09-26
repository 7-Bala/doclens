import { analyzeDocument, type Analysis, type ProgressEvent } from "@/lib/analyze";
import { LruCache, hashKey } from "@/lib/cache";
import { generateStructured, modelName } from "@/lib/gemini";
import { handleFailure, parseJson, rateLimited } from "@/lib/http";
import { analyzeRequestSchema } from "@/lib/schemas";

export const maxDuration = 60;

const cache = new LruCache<Analysis>(50);

/** One line of the streamed response (NDJSON). */
export type AnalyzeStreamEvent =
  | ({ type: "progress" } & ProgressEvent)
  | { type: "result"; data: Analysis & { cached: boolean } }
  | { type: "error"; status: number; error: string };

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * POST /api/analyze          -> JSON Analysis
 * POST /api/analyze?stream=1 -> NDJSON: progress events as each step really finishes, then the result.
 * Validation and rate-limit failures are returned as normal HTTP errors before any streaming starts.
 */
export async function POST(request: Request) {
  const parsed = await parseJson(request, analyzeRequestSchema);
  if ("response" in parsed) return parsed.response;
  const input = parsed.data;
  const stream = new URL(request.url).searchParams.get("stream") === "1";

  const key = hashKey("analyze", modelName(), input);
  const cached = cache.get(key);

  if (!cached) {
    const limited = rateLimited(request);
    if (limited) return limited;
  }

  if (!stream) {
    if (cached) return Response.json({ ...cached, cached: true }, { headers: NO_STORE });
    try {
      const analysis = await analyzeDocument(input, generateStructured);
      cache.set(key, analysis);
      return Response.json({ ...analysis, cached: false }, { headers: NO_STORE });
    } catch (error) {
      return handleFailure(error);
    }
  }

  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: AnalyzeStreamEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        if (cached) {
          send({ type: "progress", stage: "verify", status: "done", detail: "Loaded your earlier analysis of this document" });
          send({ type: "result", data: { ...cached, cached: true } });
        } else {
          const analysis = await analyzeDocument(input, generateStructured, (event) => send({ type: "progress", ...event }));
          cache.set(key, analysis);
          send({ type: "result", data: { ...analysis, cached: false } });
        }
      } catch (error) {
        const failure = handleFailure(error);
        const { error: message } = (await failure.json()) as { error: string };
        send({ type: "error", status: failure.status, error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      ...NO_STORE,
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // Stop proxies from buffering, so each event reaches the browser as it happens.
      "X-Accel-Buffering": "no",
    },
  });
}
