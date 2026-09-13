export type KnowledgeSourceType = "faq" | "policy" | "document";
export type KnowledgeStatus = "pending" | "processing" | "ready" | "error";

export interface KnowledgeDocument {
  id: string;
  organization_id: string;
  title: string;
  source_type: KnowledgeSourceType;
  source_url: string | null;
  content: string;
  status: KnowledgeStatus;
  error: string | null;
  created_at: string;
  updated_at: string;
}

/** A retrieval hit returned by match_knowledge_chunks. */
export interface KnowledgeMatch {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  similarity: number;
}
