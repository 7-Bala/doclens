import { answerQuestion } from "@/lib/analyze";
import { generateStructured } from "@/lib/gemini";
import { handleFailure, parseJson, rateLimited } from "@/lib/http";
import { askRequestSchema } from "@/lib/schemas";

export const maxDuration = 60;

export async function POST(request: Request) {
  const parsed = await parseJson(request, askRequestSchema);
  if ("response" in parsed) return parsed.response;

  const limited = rateLimited(request);
  if (limited) return limited;

  try {
    const answer = await answerQuestion(parsed.data, generateStructured);
    return Response.json(answer, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return handleFailure(error);
  }
}
