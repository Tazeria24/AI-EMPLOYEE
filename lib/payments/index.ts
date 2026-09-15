import type { PaymentProvider } from "./types";
import { stubPaymentProvider } from "./stub";

export type * from "./types";
export { stubPaymentProvider };

/**
 * Resolve the configured payment provider.
 *
 * There is deliberately only one implementation today. ADR-010 (Paystack vs
 * Flutterwave) is still open and is the founder's decision, so adding a real
 * provider means adding one file next to `stub.ts` and one case here —
 * everything else in Milestone 11 is provider-agnostic.
 */
export function getPaymentProvider(): PaymentProvider {
  const configured = process.env.PAYMENT_PROVIDER ?? "stub";

  switch (configured) {
    case "stub":
      return stubPaymentProvider;
    default:
      throw new Error(
        `Unknown PAYMENT_PROVIDER "${configured}". Only "stub" is implemented until ADR-010 is decided.`,
      );
  }
}
