import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getEmbeddingProvider } from "@/lib/ai/provider";
import type { KnowledgeDocument, KnowledgeMatch } from "./types";

const DOCUMENT_COLUMNS =
  "id, organization_id, title, source_type, source_url, content, status, error, created_at, updated_at";

/** List the current tenant's knowledge documents (RLS-scoped), newest first. */
export async function listDocuments(): Promise<KnowledgeDocument[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge_documents")
    .select(DOCUMENT_COLUMNS)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data as KnowledgeDocument[] | null) ?? [];
}

export async function getDocument(id: string): Promise<KnowledgeDocument | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("knowledge_documents")
    .select(DOCUMENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return (data as KnowledgeDocument | null) ?? null;
}

/** Count indexed chunks per document for the current tenant (RLS-scoped). */
export async function countChunksByDocument(): Promise<Record<string, number>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("knowledge_chunks")
    .select("document_id");
  if (error) throw new Error(error.message);

  const counts: Record<string, number> = {};
  for (const row of (data as { document_id: string }[] | null) ?? []) {
    counts[row.document_id] = (counts[row.document_id] ?? 0) + 1;
  }
  return counts;
}

/**
 * Semantic search over the organization's knowledge.
 *
 * `organizationId` must come from the server-derived session context, never
 * from client input. RLS independently gates the underlying rows, so a
 * foreign organization id returns nothing rather than leaking.
 */
export async function searchKnowledge(
  organizationId: string,
  query: string,
  matchCount = 5,
  client?: SupabaseClient,
): Promise<KnowledgeMatch[]> {
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 0) return [];

  const provider = getEmbeddingProvider();
  const [queryEmbedding] = await provider.embed([trimmedQuery], "query");

  const supabase = client ?? (await createClient());
  const { data, error } = await supabase.rpc("match_knowledge_chunks", {
    p_organization_id: organizationId,
    p_query_embedding: JSON.stringify(queryEmbedding),
    p_match_count: matchCount,
  });
  if (error) throw new Error(error.message);
  return (data as KnowledgeMatch[] | null) ?? [];
}
