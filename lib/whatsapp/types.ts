/** The Cloud API version this integration is pinned to. */
export const GRAPH_API_VERSION = "v23.0";

export interface WhatsAppIntegrationStatus {
  organization_id: string;
  phone_number_id: string | null;
  waba_id: string | null;
  display_phone_number: string | null;
  enabled: boolean;
  has_verify_token: boolean;
  has_app_secret: boolean;
  has_access_token: boolean;
  updated_at: string;
}

/** A single inbound text message, already reduced to what we act on. */
export interface InboundMessage {
  /** Meta's `wamid...`, the idempotency key for the whole delivery. */
  externalId: string;
  /** The customer's WhatsApp number, as Meta reports it. */
  from: string;
  /** Profile name from `contacts[]`, when Meta includes one. */
  profileName: string | null;
  type: string;
  /** Present only for `type === "text"`. */
  text: string | null;
  timestamp: Date | null;
}

export interface InboundEvent {
  /** Identifies which business the message was sent to. */
  phoneNumberId: string;
  messages: InboundMessage[];
}

export interface IntegrationEvent {
  id: string;
  provider: string;
  external_event_id: string;
  event_type: string | null;
  status: string;
  error: string | null;
  processed_at: string | null;
  created_at: string;
}
