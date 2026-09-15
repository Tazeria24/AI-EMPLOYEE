import type { EmbeddingInputType, EmbeddingProvider } from "./types";
import { EMBEDDING_DIMENSIONS } from "./stub-embedder";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const MODEL = "voyage-4";

interface VoyageResponse {
  data?: { embedding: number[]; index: number }[];
  usage?: { total_tokens: number };
}

/**
 * Voyage AI embeddings (ADR-009). Anthropic has no first-party embedding
 * model and recommends Voyage; `voyage-4` emits 1024-dimension, unit-normalized
 * vectors, which is what `knowledge_chunks.embedding` is sized for.
 *
 * `input_type` is passed through deliberately: Voyage prepends a retrieval
 * prompt for queries vs documents, which improves retrieval quality.
 */
export const voyageEmbeddingProvider: EmbeddingProvider = {
  id: "voyage-4",
  dimensions: EMBEDDING_DIMENSIONS,

  async embed(
    texts: string[],
    inputType: EmbeddingInputType,
  ): Promise<number[][]> {
    if (texts.length === 0) return [];

    const apiKey = process.env.VOYAGE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "VOYAGE_API_KEY is not set. Required when EMBEDDING_PROVIDER=voyage.",
      );
    }

    const response = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: texts,
        model: MODEL,
        input_type: inputType,
      }),
    });

    if (!response.ok) {
      // Never surface the provider's raw body: it can echo request content.
      throw new Error(`Voyage embeddings request failed (${response.status}).`);
    }

    const payload = (await response.json()) as VoyageResponse;
    const rows = payload.data;
    if (!rows || rows.length !== texts.length) {
      throw new Error("Voyage returned an unexpected number of embeddings.");
    }

    // Voyage does not guarantee response order; index is authoritative.
    const ordered = new Array<number[]>(texts.length);
    for (const row of rows) {
      if (row.embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Voyage returned ${row.embedding.length}-dim vectors; the schema expects ${EMBEDDING_DIMENSIONS}.`,
        );
      }
      ordered[row.index] = row.embedding;
    }
    if (ordered.some((vector) => vector === undefined)) {
      throw new Error("Voyage response was missing an embedding index.");
    }
    return ordered;
  },
};
