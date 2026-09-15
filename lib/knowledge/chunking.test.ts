import { describe, it, expect } from "vitest";
import { chunkText } from "@/lib/knowledge/chunking";

describe("chunkText", () => {
  it("returns no chunks for empty or whitespace input", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n\n  ")).toEqual([]);
  });

  it("returns a single chunk for short text", () => {
    expect(chunkText("We deliver within Lagos in 2 days.")).toEqual([
      "We deliver within Lagos in 2 days.",
    ]);
  });

  it("packs multiple short paragraphs into one chunk", () => {
    const chunks = chunkText("First para.\n\nSecond para.", { maxChars: 100 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe("First para.\n\nSecond para.");
  });

  it("starts a new chunk when the paragraph would overflow", () => {
    const a = "a".repeat(60);
    const b = "b".repeat(60);
    const chunks = chunkText(`${a}\n\n${b}`, { maxChars: 100 });
    expect(chunks).toEqual([a, b]);
  });

  it("hard-splits a paragraph longer than maxChars, respecting the limit", () => {
    const long = "x".repeat(250);
    const chunks = chunkText(long, { maxChars: 100, overlapChars: 20 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(100);
    }
  });

  it("overlaps hard-split chunks so boundary facts stay retrievable", () => {
    const long = "abcdefghij".repeat(30); // 300 chars
    const chunks = chunkText(long, { maxChars: 100, overlapChars: 20 });
    const tail = chunks[0].slice(-20);
    expect(chunks[1].startsWith(tail)).toBe(true);
  });

  it("never emits empty chunks", () => {
    const chunks = chunkText("one\n\n\n\ntwo\n\n   \n\nthree", { maxChars: 5 });
    expect(chunks.every((c) => c.trim().length > 0)).toBe(true);
  });
});
