# Install and deploy

Setting up a production instance. The parts you cannot skip are marked
**required**; everything else degrades gracefully.

## 1. Supabase — required

1. Create a project. Pick the region closest to your customers (`eu-west-1` is
   usually the best latency for Nigeria today).
2. Enable the `vector` extension: **Database → Extensions → vector**.
3. Apply the migrations in order, through the SQL editor or the CLI:

   ```
   supabase/migrations/0001_multi_tenancy.sql
   supabase/migrations/0002_products.sql
   supabase/migrations/0003_knowledge.sql
   supabase/migrations/0004_embeddings_voyage.sql
   supabase/migrations/0005_agent.sql
   supabase/migrations/0006_conversations.sql
   supabase/migrations/0007_automations.sql
   supabase/migrations/0008_widget.sql
   supabase/migrations/0009_whatsapp.sql
   supabase/migrations/0010_billing.sql
   supabase/migrations/0011_hardening.sql
   supabase/migrations/0012_beta.sql
   ```

   **Do not** run `supabase/tests/00_supabase_shim.sql` — that is a local-only
   stand-in for things Supabase already provides, and running it on a real
   project will conflict.

4. **Auth → URL configuration**: set the site URL, and add
   `https://<your-domain>/auth/confirm` to the redirect allow-list. Email
   verification and password reset both fail silently without this.

## 2. Environment — required

Copy `.env.example`. The three that are genuinely required:

| Variable | Why |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | public |
| `SUPABASE_SERVICE_ROLE_KEY` | **server-only, bypasses RLS** |

Then, for the AI to work at all:

| Variable | Why |
| --- | --- |
| `ANTHROPIC_API_KEY` | the agent |
| `VOYAGE_API_KEY` + `EMBEDDING_PROVIDER=voyage` | knowledge retrieval |

`EMBEDDING_PROVIDER=stub` is a lexical, offline embedder for tests and local
development. It is **not** semantic — never run it in production; the knowledge
base will appear to work and quietly retrieve the wrong things.

Recommended but optional: `CRON_SECRET` (without it the cron endpoints return
401 and follow-ups and the retention sweep never run), `RATE_LIMIT_PEPPER`,
`SENTRY_DSN`, `NEXT_PUBLIC_POSTHOG_KEY`, `RESEND_API_KEY` +
`FOLLOW_UP_FROM_EMAIL`.

## 3. Deploy

Vercel, with the environment variables above. `vercel.json` already declares
both cron jobs:

- `/api/cron/automations` every 15 minutes — follow-ups
- `/api/cron/retention` daily at 03:30 UTC — the NDPR retention sweep

Vercel Cron does not send an `Authorization` header by default; set
`CRON_SECRET` and configure it, or both endpoints will correctly refuse to run.

## 4. Verify the deployment

```bash
curl -s https://<your-domain>/api/health
# {"status":"ok",...}

# Both should be 401 — they are public URLs:
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<your-domain>/api/cron/retention
curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<your-domain>/api/webhooks/payments

# Security headers:
curl -sI https://<your-domain>/login | grep -iE 'strict-transport|x-frame|content-security'
```

Then sign up, and confirm the dashboard shows the setup checklist.

## 5. Optional integrations

**WhatsApp** — per business, from `/dashboard/whatsapp`. Needs a Meta app, a
WhatsApp Business Account and a phone number. The callback URL is
`https://<your-domain>/api/webhooks/whatsapp` with the verify token entered in
the dashboard. The integration ships **off** and refuses to turn on until every
credential is present.

**Payments** — not available yet. ADR-010 (Paystack vs Flutterwave) is
undecided, so `PAYMENT_PROVIDER=stub` is the only valid setting and no money
moves. Everything else about billing — plans, limits, the state machine, the
webhook — is built and tested behind the abstraction.

## 6. Demo data

```bash
psql "<connection string>" -f supabase/seed/demo_business.sql
```

Creates "Ada's Closet" — 7 products, 5 policy documents, a conversation ending
in an escalation, and a lead. Safe to re-run; it removes the previous demo
organization first. **Never run it against a database with real customers.**

The knowledge documents land as `pending`: chunking and embedding happen in the
application, so open `/dashboard/knowledge` and reindex them before expecting
the AI to answer policy questions.
