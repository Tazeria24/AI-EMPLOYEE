export interface ChunkOptions {
  /** Maximum characters per chunk. */
  maxChars?: number;
  /** Overlap applied when a single paragraph must be hard-split. */
  overlapChars?: number;
}

export const DEFAULT_MAX_CHARS = 1000;
export const DEFAULT_OVERLAP_CHARS = 150;

/** Hard-split text that exceeds maxChars into overlapping windows. */
function splitLongBlock(
  text: string,
  maxChars: number,
  overlapChars: number,
): string[] {
  const chunks: string[] = [];
  const step = Math.max(1, maxChars - overlapChars);

  for (let start = 0; start < text.length; start += step) {
    chunks.push(text.slice(start, start + maxChars));
    if (start + maxChars >= text.length) break;
  }
  return chunks;
}

/**
 * Split text into retrieval-sized chunks.
 *
 * Prefers paragraph boundaries (semantically clean, so no overlap is needed);
 * only paragraphs longer than maxChars are hard-split, with overlap so a fact
 * spanning the cut is still retrievable.
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
  const maxChars = options.maxChars ?? DEFAULT_MAX_CHARS;
  const overlapChars = Math.min(
    options.overlapChars ?? DEFAULT_OVERLAP_CHARS,
    Math.max(0, maxChars - 1),
  );

  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) return [];

  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    if (current.length > 0) {
      chunks.push(current);
      current = "";
    }
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      flush();
      chunks.push(...splitLongBlock(paragraph, maxChars, overlapChars));
      continue;
    }

    if (current.length === 0) {
      current = paragraph;
    } else if (current.length + 2 + paragraph.length <= maxChars) {
      current = `${current}\n\n${paragraph}`;
    } else {
      flush();
      current = paragraph;
    }
  }
  flush();

  return chunks.map((chunk) => chunk.trim()).filter((chunk) => chunk.length > 0);
}
