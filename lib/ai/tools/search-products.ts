import { listProducts } from "@/lib/products/service";
import type { AgentTool } from "./types";

const MAX_RESULTS = 5;

export const searchProductsTool: AgentTool = {
  name: "search_products",
  description:
    "Search this business's product catalogue by name or SKU. Use for any question about price, availability, stock or what is sold. Returns only active products.",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "Product name, keyword or SKU to search for.",
      },
    },
    required: ["query"],
    additionalProperties: false,
  },

  async handler(input, context) {
    const query =
      typeof (input as { query?: unknown })?.query === "string"
        ? (input as { query: string }).query.trim()
        : "";
    if (query.length === 0) {
      return { content: "No search query supplied.", isError: true };
    }

    try {
      const products = await listProducts(
        {
          search: query,
          status: "active",
          // Written out, not assumed: with an injected service-role client
          // (the public widget) RLS is not there to catch a mistake.
          organizationId: context.organizationId,
        },
        context.client,
      );
      if (products.length === 0) {
        return {
          content: `No active products matched "${query}". Do not guess a price or availability.`,
        };
      }

      const rows = products.slice(0, MAX_RESULTS).map((product) => ({
        name: product.name,
        price: product.price,
        currency: product.currency,
        stock_quantity: product.stock_quantity,
        sku: product.sku,
        description: product.description,
      }));
      return { content: JSON.stringify({ products: rows }) };
    } catch {
      return {
        content: "The product lookup failed. Tell the customer you cannot confirm this right now and offer a human.",
        isError: true,
      };
    }
  },
};
