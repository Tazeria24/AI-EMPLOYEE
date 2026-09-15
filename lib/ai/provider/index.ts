import type { ChatProvider, EmbeddingProvider } from "./types";
import { EMBEDDING_DIMENSIONS, stubEmbeddingProvider } from "./stub-embedder";
import { voyageEmbeddingProvider } from "./voyage-embedder";
import { createAnthropicChatProvider } from "./anthropic-chat";

export type * from "./types";
export { EMBEDDING_DIMENSIONS };

/**
 * Resolve the configured embedding provider.
 *
 * `voyage` is production (ADR-009); `stub` keeps tests and offline development
 * free and deterministic. Product code never imports a vendor SDK directly, so
 * switching providers touches only this module.
 */
export function getEmbeddingProvider(): EmbeddingProvider {
  const configured = process.env.EMBEDDING_PROVIDER ?? "stub";

  switch (configured) {
    case "stub":
      return stubEmbeddingProvider;
    case "voyage":
      return voyageEmbeddingProvider;
    default:
      throw new Error(
        `Unsupported EMBEDDING_PROVIDER "${configured}". Supported: "voyage", "stub".`,
      );
  }
}

/**
 * Resolve the configured chat provider. Anthropic Claude Sonnet 5 (ADR-008).
 */
export function getChatProvider(): ChatProvider {
  const configured = process.env.AI_PROVIDER ?? "anthropic";

  switch (configured) {
    case "anthropic":
      return createAnthropicChatProvider();
    default:
      throw new Error(
        `Unsupported AI_PROVIDER "${configured}". Supported: "anthropic".`,
      );
  }
}
