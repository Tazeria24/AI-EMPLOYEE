/**
 * Provider-agnostic AI interfaces. Product logic depends on these, never on a
 * specific vendor SDK (ADR-006).
 */
export interface EmbeddingProvider {
  /** Stable identifier recorded with stored vectors. */
  readonly id: string;
  /** Vector length this provider emits. Must match the DB vector(n) column. */
  readonly dimensions: number;
  /** Embed a batch of texts, preserving input order. */
  embed(texts: string[]): Promise<number[][]>;
}
