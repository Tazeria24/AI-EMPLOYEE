import type { KnowledgeSourceType } from "./types";

export interface KnowledgeDocumentValues {
  title: string;
  sourceType: KnowledgeSourceType;
  sourceUrl: string | null;
  content: string;
}

export const SOURCE_TYPES: KnowledgeSourceType[] = ["faq", "policy", "document"];
export const MIN_CONTENT_LENGTH = 10;
export const MAX_CONTENT_LENGTH = 100_000;

function trimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function optional(value: unknown): string | null {
  const s = trimmed(value);
  return s.length > 0 ? s : null;
}

type ParseResult =
  | { ok: true; data: KnowledgeDocumentValues }
  | { ok: false; error: string };

/** Validate and normalize knowledge-document input from an untrusted form. */
export function parseKnowledgeDocument(input: {
  title: unknown;
  sourceType?: unknown;
  sourceUrl?: unknown;
  content?: unknown;
}): ParseResult {
  const title = trimmed(input.title);
  if (title.length < 2) {
    return { ok: false, error: "Title must be at least 2 characters." };
  }
  if (title.length > 200) {
    return { ok: false, error: "Title must be 200 characters or fewer." };
  }

  const rawType = trimmed(input.sourceType);
  const sourceType = (SOURCE_TYPES as string[]).includes(rawType)
    ? (rawType as KnowledgeSourceType)
    : "document";

  const sourceUrl = optional(input.sourceUrl);
  if (sourceUrl && !/^https?:\/\/.+/.test(sourceUrl)) {
    return { ok: false, error: "Source URL must start with http:// or https://" };
  }

  const content = trimmed(input.content);
  if (content.length < MIN_CONTENT_LENGTH) {
    return {
      ok: false,
      error: `Content must be at least ${MIN_CONTENT_LENGTH} characters.`,
    };
  }
  if (content.length > MAX_CONTENT_LENGTH) {
    return {
      ok: false,
      error: `Content must be ${MAX_CONTENT_LENGTH} characters or fewer.`,
    };
  }

  return { ok: true, data: { title, sourceType, sourceUrl, content } };
}
