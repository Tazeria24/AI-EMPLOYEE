import { describe, it, expect } from "vitest";
import { GET } from "@/app/api/health/route";

describe("GET /api/health", () => {
  it("returns a 200 ok payload", async () => {
    const res = GET();
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("ai-sales-employee");
    expect(typeof body.timestamp).toBe("string");
  });
});
