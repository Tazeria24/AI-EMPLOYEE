import { describe, it, expect } from "vitest";
import {
  EMBEDDING_DIMENSIONS,
  embedText,
  stubEmbeddingProvider,
} from "@/lib/ai/provider/stub-embedder";
import { getEmbeddingProvider } from "@/lib/ai/provider";

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i += 1) dot += a[i] * b[i];
  return dot; // vectors are unit-normalized
}

describe("stub embedder", () => {
  it("emits vectors of the pinned dimension", () => {
    expect(embedText("hello world")).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(stubEmbeddingProvider.dimensions).toBe(EMBEDDING_DIMENSIONS);
  });

  it("is deterministic", () => {
    expect(embedText("delivery takes 2 days")).toEqual(
      embedText("delivery takes 2 days"),
    );
  });

  it("produces unit-length vectors for non-empty text", () => {
    const norm = Math.sqrt(
      embedText("returns policy").reduce((sum, v) => sum + v * v, 0),
    );
    expect(norm).toBeCloseTo(1, 10);
  });

  it("returns a zero vector for text with no tokens", () => {
    expect(embedText("!!! ???").every((v) => v === 0)).toBe(true);
  });

  it("ranks related text above unrelated text", () => {
    const query = embedText("what is your delivery time in Lagos");
    const related = embedText("Delivery within Lagos takes 2 working days.");
    const unrelated = embedText("Our sneakers are available in size 42.");
    expect(cosine(query, related)).toBeGreaterThan(cosine(query, unrelated));
  });

  it("embeds a batch preserving order", async () => {
    const [first, second] = await stubEmbeddingProvider.embed(["alpha", "beta"]);
    expect(first).toEqual(embedText("alpha"));
    expect(second).toEqual(embedText("beta"));
  });
});

describe("getEmbeddingProvider", () => {
  it("defaults to the stub provider", () => {
    expect(getEmbeddingProvider().id).toBe("stub");
  });

  it("throws for an unsupported provider", () => {
    const previous = process.env.EMBEDDING_PROVIDER;
    process.env.EMBEDDING_PROVIDER = "not-a-provider";
    expect(() => getEmbeddingProvider()).toThrow(/Unsupported EMBEDDING_PROVIDER/);
    process.env.EMBEDDING_PROVIDER = previous;
  });
});
