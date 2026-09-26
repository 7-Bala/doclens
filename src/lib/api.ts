import type { AnalyzeStreamEvent } from "@/app/api/analyze/route";
import type { Analysis, Answer, ProgressEvent } from "./analyze";
import { NdjsonDecoder } from "./ndjson";
import type { AnalyzeRequest, AskRequest } from "./schemas";

export type AnalysisResponse = Analysis & { cached: boolean };

async function send(url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error("Network error. Check your connection and try again.");
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error ?? `Request failed (${res.status}).`);
  }
  return res;
}

async function request<T>(url: string, init: RequestInit): Promise<T> {
  return (await send(url, init)).json() as Promise<T>;
}

const json = (payload: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

/** Streams the analysis, reporting each real pipeline step through `onProgress`. */
async function analyze(payload: AnalyzeRequest, onProgress: (event: ProgressEvent) => void): Promise<AnalysisResponse> {
  const res = await send("/api/analyze?stream=1", json(payload));
  if (!res.body) throw new Error("The server returned an empty response.");

  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  const decoder = new NdjsonDecoder<AnalyzeStreamEvent>();
  let result: AnalysisResponse | null = null;

  const handle = (event: AnalyzeStreamEvent) => {
    if (event.type === "progress") onProgress(event);
    else if (event.type === "error") throw new Error(event.error);
    else result = event.data;
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    decoder.push(value).forEach(handle);
  }
  decoder.flush().forEach(handle);

  if (!result) throw new Error("The analysis ended unexpectedly. Please try again.");
  return result;
}

export const api = {
  analyze,
  ask: (payload: AskRequest) => request<Answer>("/api/ask", json(payload)),
  extractPdf: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<{ pages: string[] }>("/api/extract", { method: "POST", body: form });
  },
};
