import type { DeliveryChannel, DeliveryProvider } from "./types";
import { conversationDelivery } from "./conversation";
import { emailDelivery } from "./email";
import { whatsappDelivery } from "./whatsapp";

export type * from "./types";
export { conversationDelivery, emailDelivery, whatsappDelivery };

export function getDeliveryProvider(channel: DeliveryChannel): DeliveryProvider {
  switch (channel) {
    case "conversation":
      return conversationDelivery;
    case "email":
      return emailDelivery;
    case "whatsapp":
      return whatsappDelivery;
  }
}
