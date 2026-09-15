export const dynamic = "force-dynamic";

/**
 * Health check. Returns a small JSON payload used by uptime checks and
 * deployment smoke tests. Exposes no secrets or tenant data.
 */
export function GET() {
  const body = JSON.stringify({
    status: "ok",
    service: "ai-sales-employee",
    timestamp: new Date().toISOString(),
  });

  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}
