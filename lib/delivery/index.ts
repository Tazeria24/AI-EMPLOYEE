import type { DeliveryChannel, DeliveryProvider } from "./types";
import { conversationDelivery } from "./conversation";
import { emailDelivery } from "./email";

export type * from "./types";
export { conversationDelivery, emailDelivery };

export function getDeliveryProvider(channel: DeliveryChannel): DeliveryProvider {
  switch (channel) {
    case "conversation":
      return conversationDelivery;
    case "email":
      return emailDelivery;
  }
}
