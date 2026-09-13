import type { EmbeddingProvider } from "./types";

/**
 * Vector length used by the knowledge base. Pinned in the DB as vector(1536)
 * (ADR-029). A real provider must emit exactly this many dimensions, or the
 * schema must be migrated and all chunks re-embedded.
 */
export const EMBEDDING_DIMENSIONS = 1536;

/**
 * Deterministic local embedder used until a paid provider is chosen
 * (ADR-008/ADR-009 are still open). It is a hashing vectorizer: tokens are
 * hashed into buckets and the vector is L2-normalized, so cosine similarity
 * reflects shared vocabulary. That is enough to exercise chunking, storage,
 * pgvector retrieval and ranking end to end without any network call — but it
 * is lexical, not semantic, and must not be used in production.
 */
function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/** FNV-1a (32-bit) — small, fast and stable across runs. */
function hashToken(token: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export function embedText(
  text: string,
  dimensions: number = EMBEDDING_DIMENSIONS,
): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  for (const token of tokenize(text)) {
    vector[hashToken(token) % dimensions] += 1;
  }

  let sumOfSquares = 0;
  for (const value of vector) sumOfSquares += value * value;
  if (sumOfSquares === 0) return vector; // no tokens — zero vector

  const norm = Math.sqrt(sumOfSquares);
  return vector.map((value) => value / norm);
}

export const stubEmbeddingProvider: EmbeddingProvider = {
  id: "stub",
  dimensions: EMBEDDING_DIMENSIONS,
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((text) => embedText(text));
  },
};
