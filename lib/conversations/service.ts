import { createClient } from "@/lib/supabase/server";
import type {
  Conversation,
  ConversationStatus,
  ConversationSummary,
  Message,
} from "./types";

const CONVERSATION_COLUMNS =
  "id, organization_id, customer_id, channel, status, assigned_to, created_at, last_message_at";

export interface ListConversationsFilters {
  search?: string;
  status?: ConversationStatus;
}

/** Escape LIKE wildcards in untrusted input (same approach as products). */
function escapeLike(term: string): string {
  return term.replace(/[%_]/g, (match) => `\\${match}`);
}

/**
 * List the tenant's conversations (RLS-scoped), most recently active first.
 * Search matches the customer's name or any message in the conversation.
 */
export async function listConversations(
  filters: ListConversationsFilters = {},
): Promise<ConversationSummary[]> {
  const supabase = await createClient();

  let matchingIds: string[] | null = null;
  if (filters.search) {
    const term = escapeLike(filters.search);

    const [{ data: byMessage }, { data: byCustomer }] = await Promise.all([
      supabase.from("messages").select("conversation_id").ilike("content", `%${term}%`),
      supabase.from("customers").select("id").ilike("name", `%${term}%`),
    ]);

    const ids = new Set<string>(
      ((byMessage as { conversation_id: string }[] | null) ?? []).map(
        (row) => row.conversation_id,
      ),
    );

    const customerIds = ((byCustomer as { id: string }[] | null) ?? []).map(
      (row) => row.id,
    );
    if (customerIds.length > 0) {
      const { data: byCustomerConversations } = await supabase
        .from("conversations")
        .select("id")
        .in("customer_id", customerIds);
      for (const row of (byCustomerConversations as { id: string }[] | null) ?? []) {
        ids.add(row.id);
      }
    }

    matchingIds = [...ids];
    if (matchingIds.length === 0) return [];
  }

  let query = supabase
    .from("conversations")
    .select(`${CONVERSATION_COLUMNS}, customers(name)`)
    .order("last_message_at", { ascending: false })
    .limit(100);

  if (filters.status) query = query.eq("status", filters.status);
  if (matchingIds) query = query.in("id", matchingIds);

  const { data, error } = await query;
  if (error) throw new Error(error.message);

  type Row = Conversation & {
    // supabase-js types embedded relations as an array; a to-one relation
    // comes back as a single object at runtime. Handle both.
    customers?: { name: string | null } | { name: string | null }[] | null;
  };
  const conversations = (data as unknown as Row[] | null) ?? [];
  if (conversations.length === 0) return [];

  // One extra round-trip for previews, rather than N queries in the list.
  const { data: recent } = await supabase
    .from("messages")
    .select("conversation_id, content, created_at")
    .in("conversation_id", conversations.map((conversation) => conversation.id))
    .order("created_at", { ascending: false });

  const preview = new Map<string, string>();
  for (const row of (recent as { conversation_id: string; content: string }[] | null) ?? []) {
    if (!preview.has(row.conversation_id)) {
      preview.set(row.conversation_id, row.content);
    }
  }

  return conversations.map((conversation) => {
    const related = conversation.customers;
    const customer = Array.isArray(related) ? related[0] : related;
    return {
      ...conversation,
      customer_name: customer?.name ?? null,
      last_message: preview.get(conversation.id) ?? null,
    };
  });
}

export async function getConversation(id: string): Promise<Conversation | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("conversations")
    .select(CONVERSATION_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  return (data as Conversation | null) ?? null;
}

export async function listMessages(conversationId: string): Promise<Message[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_type, content, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as Message[] | null) ?? [];
}
