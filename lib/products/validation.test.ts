import { describe, it, expect } from "vitest";
import { parseProduct, parseCategory } from "@/lib/products/validation";

describe("parseProduct", () => {
  it("accepts and normalizes a valid product", () => {
    const result = parseProduct({
      name: "  Red Dress  ",
      description: "",
      price: "2500.50",
      currency: "NGN",
      sku: " RD-01 ",
      stockQuantity: "10",
      status: "active",
      categoryId: "",
    });
    expect(result).toEqual({
      ok: true,
      data: {
        name: "Red Dress",
        description: null,
        price: 2500.5,
        currency: "NGN",
        sku: "RD-01",
        stockQuantity: 10,
        status: "active",
        categoryId: null,
      },
    });
  });

  it("defaults price/stock to 0 and currency to NGN", () => {
    const result = parseProduct({ name: "Basic" });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.price).toBe(0);
      expect(result.data.stockQuantity).toBe(0);
      expect(result.data.currency).toBe("NGN");
      expect(result.data.status).toBe("active");
    }
  });

  it("requires a name of at least 2 characters", () => {
    expect(parseProduct({ name: "A" }).ok).toBe(false);
  });

  it("rejects a negative price", () => {
    expect(parseProduct({ name: "Item", price: "-5" }).ok).toBe(false);
  });

  it("rejects a price with more than 2 decimals", () => {
    expect(parseProduct({ name: "Item", price: "1.005" }).ok).toBe(false);
  });

  it("rejects a non-integer or negative stock", () => {
    expect(parseProduct({ name: "Item", stockQuantity: "1.5" }).ok).toBe(false);
    expect(parseProduct({ name: "Item", stockQuantity: "-2" }).ok).toBe(false);
  });

  it("coerces unknown status to active", () => {
    const result = parseProduct({ name: "Item", status: "weird" });
    expect(result.ok && result.data.status).toBe("active");
  });
});

describe("parseCategory", () => {
  it("accepts a valid category", () => {
    expect(parseCategory({ name: "Dresses" })).toEqual({
      ok: true,
      data: { name: "Dresses", description: null },
    });
  });
  it("rejects a short name", () => {
    expect(parseCategory({ name: "x" }).ok).toBe(false);
  });
});
