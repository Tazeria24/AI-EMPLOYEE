import type { EmbeddingProvider } from "./types";
import { EMBEDDING_DIMENSIONS, stubEmbeddingProvider } from "./stub-embedder";

export type { EmbeddingProvider };
export { EMBEDDING_DIMENSIONS };

/**
 * Resolve the configured embedding provider.
 *
 * Defaults to the local deterministic stub. A real provider (ADR-008/ADR-009)
 * is added here as another case — product code never imports a vendor SDK
 * directly, so switching providers touches only this module.
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  const configured = process.env.EMBEDDING_PROVIDER ?? "stub";

  switch (configured) {
    case "stub":
      return stubEmbeddingProvider;
    default:
      throw new Error(
        `Unsupported EMBEDDING_PROVIDER "${configured}". Only "stub" is implemented; ` +
          "a production provider is pending ADR-008/ADR-009.",
      );
  }
}
