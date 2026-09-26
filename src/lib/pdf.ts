import type { StructuredTextItem } from "unpdf";

type TextItem = Pick<StructuredTextItem, "str" | "x" | "y" | "fontSize">;

/**
 * Rebuilds readable lines from positioned PDF text items. Items on the same baseline
 * form a line; a vertical gap noticeably larger than the font size becomes a blank line,
 * which is what the clause segmenter uses as a paragraph boundary.
 */
export function itemsToText(items: TextItem[]): string {
  const visible = items.filter((i) => i.str.trim().length > 0);
  if (visible.length === 0) return "";

  // PDF y grows upwards: sort top-to-bottom, then left-to-right.
  const sorted = [...visible].sort((a, b) => b.y - a.y || a.x - b.x);

  const lines: { y: number; size: number; parts: TextItem[] }[] = [];
  for (const item of sorted) {
    const last = lines.at(-1);
    const tolerance = Math.max(2, (item.fontSize || 10) * 0.4);
    if (last && Math.abs(last.y - item.y) <= tolerance) {
      last.parts.push(item);
    } else {
      lines.push({ y: item.y, size: item.fontSize || 10, parts: [item] });
    }
  }

  const out: string[] = [];
  lines.forEach((line, i) => {
    const text = line.parts
      .sort((a, b) => a.x - b.x)
      .map((p) => p.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (i > 0 && lines[i - 1].y - line.y > line.size * 1.8) out.push("");
    out.push(text);
  });
  return out.join("\n");
}

/** Extracts per-page text from a PDF buffer. Throws on encrypted or corrupt files. */
export async function extractPdfPages(data: Uint8Array): Promise<string[]> {
  const { extractTextItems, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(data);
  const { items } = await extractTextItems(pdf);
  return items.map(itemsToText);
}
