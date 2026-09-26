import { jsonError, rateLimited } from "@/lib/http";
import { extractPdfPages } from "@/lib/pdf";
import { LIMITS } from "@/lib/schemas";

export const maxDuration = 30;

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46]; // "%PDF"

/** Accepts a PDF upload and returns its text per page. Nothing is stored. */
export async function POST(request: Request) {
  const limited = rateLimited(request);
  if (limited) return limited;

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, "Expected a file upload.");
  }

  const file = form.get("file");
  if (!(file instanceof File)) return jsonError(400, "No file was uploaded.");
  if (file.size > LIMITS.maxPdfBytes) return jsonError(413, "PDF is too large (max 5 MB).");

  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!PDF_MAGIC.every((b, i) => bytes[i] === b)) return jsonError(415, "Only PDF files are supported.");

  try {
    const pages = await extractPdfPages(bytes);
    if (!pages.join("").trim()) {
      return jsonError(422, "This PDF has no selectable text (it may be a scan). Please paste the text instead.");
    }
    return Response.json({ pages }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return jsonError(422, "Could not read this PDF. It may be encrypted or damaged.");
  }
}
