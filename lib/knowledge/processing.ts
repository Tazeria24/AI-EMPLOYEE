import { createClient } from "@/lib/supabase/server";
import { getEmbeddingProvider } from "@/lib/ai/provider";
import { chunkText } from "./chunking";

/** Keep stored error messages short and safe to show to the business. */
function safeError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.slice(0, 500);
}

/**
 * Chunk, embed and store a knowledge document, recording progress in
 * `status`. Failures are captured on the row (status='error' + error text) so
 * they are visible in the UI and the document can be reprocessed.
 *
 * Every write is scoped to organizationId (server-derived) and RLS enforces
 * the same boundary independently.
 */
export async function processDocument(
  documentId: string,
  organizationId: string,
): Promise<{ ok: true; chunks: number } | { ok: false; error: string }> {
  const supabase = await createClient();

  try {
    await supabase
      .from("knowledge_documents")
      .update({ status: "processing", error: null })
      .eq("id", documentId)
      .eq("organization_id", organizationId);

    const { data: document, error: loadError } = await supabase
      .from("knowledge_documents")
      .select("id, content")
      .eq("id", documentId)
      .eq("organization_id", organizationId)
      .maybeSingle();

    if (loadError) throw new Error(loadError.message);
    if (!document) throw new Error("Document not found.");

    const chunks = chunkText((document as { content: string }).content);
    if (chunks.length === 0) {
      throw new Error("Document produced no content to index.");
    }

    const provider = getEmbeddingProvider();
    const embeddings = await provider.embed(chunks);
    if (embeddings.length !== chunks.length) {
      throw new Error("Embedding provider returned an unexpected batch size.");
    }

    // Replace any previous chunks so reprocessing is idempotent.
    const { error: deleteError } = await supabase
      .from("knowledge_chunks")
      .delete()
      .eq("document_id", documentId)
      .eq("organization_id", organizationId);
    if (deleteError) throw new Error(deleteError.message);

    const rows = chunks.map((content, index) => ({
      organization_id: organizationId,
      document_id: documentId,
      chunk_index: index,
      content,
      // pgvector accepts its text form: "[0.1,0.2,...]"
      embedding: JSON.stringify(embeddings[index]),
      metadata: { embedding_provider: provider.id },
    }));

    const { error: insertError } = await supabase
      .from("knowledge_chunks")
      .insert(rows);
    if (insertError) throw new Error(insertError.message);

    const { error: readyError } = await supabase
      .from("knowledge_documents")
      .update({ status: "ready", error: null })
      .eq("id", documentId)
      .eq("organization_id", organizationId);
    if (readyError) throw new Error(readyError.message);

    return { ok: true, chunks: chunks.length };
  } catch (error) {
    const message = safeError(error);
    await supabase
      .from("knowledge_documents")
      .update({ status: "error", error: message })
      .eq("id", documentId)
      .eq("organization_id", organizationId);
    return { ok: false, error: message };
  }
}
