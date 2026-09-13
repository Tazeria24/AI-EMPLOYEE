import { describe, it, expect } from "vitest";
import { checkGrounding } from "@/lib/ai/guardrails/grounding";

const catalogue = JSON.stringify({
  products: [{ name: "Red dress", price: 12500, currency: "NGN", stock_quantity: 3 }],
});

describe("checkGrounding", () => {
  it("allows a price that appears in tool results", () => {
    const result = checkGrounding("The red dress is ₦12,500.", catalogue);
    expect(result.ok).toBe(true);
  });

  it("flags a price that does not appear in tool results", () => {
    const result = checkGrounding("The red dress is ₦9,000.", catalogue);
    expect(result.ok).toBe(false);
    expect(result.violations[0].kind).toBe("price");
    expect(result.violations[0].value).toBe("9000");
  });

  it("flags any price when no tool was called", () => {
    expect(checkGrounding("It costs ₦5,000.", "").ok).toBe(false);
  });

  it("allows a stock count that appears in tool results", () => {
    expect(checkGrounding("We have 3 in stock.", catalogue).ok).toBe(true);
  });

  it("flags an invented stock count", () => {
    const result = checkGrounding("We have 40 in stock.", catalogue);
    expect(result.ok).toBe(false);
    expect(result.violations[0].kind).toBe("stock");
  });

  it("ignores non-price, non-stock numbers", () => {
    // "2 working days" came from a knowledge chunk, and is not a price claim.
    const evidence = "Delivery within Lagos takes 2 working days.";
    expect(checkGrounding("Delivery takes 2 working days.", evidence).ok).toBe(true);
  });

  it("normalizes separators and decimals", () => {
    expect(checkGrounding("₦12500.00", catalogue).ok).toBe(true);
  });

  it("passes a reply with no numeric claims", () => {
    expect(checkGrounding("Let me check that for you.", "").ok).toBe(true);
  });

  it("reports each invented value once", () => {
    const result = checkGrounding("The price is ₦9,000 — yes, ₦9,000.", catalogue);
    expect(result.violations).toHaveLength(1);
  });
});
