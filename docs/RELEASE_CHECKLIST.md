# Release candidate checklist

Work top to bottom. Anything unticked is a reason not to invite a business.

## Code

- [x] `npm run typecheck` — clean
- [x] `npm run lint` — clean
- [x] `npm test` — 340 passing
- [x] `npm run build` — production build succeeds
- [x] All twelve SQL isolation suites pass on real PostgreSQL 16
- [x] `npm audit` — 0 vulnerabilities
- [ ] **CI enforcing the above on every push** (known issue #15)

## Security — see `docs/SECURITY_AUDIT.md`

- [x] Tenant isolation proved per table, and for RAG, webhooks and billing
- [x] `anon` holds no table privileges anywhere
- [x] Rate limiting on auth routes and the widget
- [x] Webhook signature verification + replay protection, both webhooks
- [x] Secrets: none committed; no server env in a client component
- [x] Security headers, HSTS in production
- [x] Service-role usage enumerated and each site justified (ADR-086)
- [x] NDPR retention and erasure implemented and proved
- [ ] **Privacy notice and consent record** (known issue #3)

## Data

- [ ] Supabase project created, migrations 0001–0012 applied
- [ ] `vector` extension enabled
- [ ] Auth redirect URLs configured
- [ ] Point-in-time recovery / backups enabled
- [ ] `CRON_SECRET` set and both Vercel crons firing

## The product actually working

- [ ] `docs/QA.md` completed end to end on the deployed instance
- [ ] `npm run eval` run, results recorded (known issue #1)
- [ ] The takeover test passed on a real conversation (QA step 18)
- [ ] The widget installed on a real website, not just the preview
- [ ] WhatsApp round trip, if that channel is in scope (known issue #4)

## Commercial

- [ ] ADR-010 decided, adapter written, a test payment taken (known issue #2)
- [ ] Plan limits sanity-checked against what a real business needs
- [ ] What happens at the end of a trial is decided and communicated

## Support

- [x] In-product feedback at `/dashboard/feedback`
- [x] Known issues written down
- [ ] Who answers a beta business, and how fast
- [ ] Where feedback is triaged, and how often

## Decision-boundary stops — need explicit founder approval

- [ ] Deploying to production
- [ ] Connecting production WhatsApp
- [ ] Sending real customer messages
- [ ] Charging a real card

## Before the first business

- [ ] Their catalogue and policies loaded, and checked by them
- [ ] The AI's answers reviewed by the business owner before it goes live
- [ ] They know how to take over a conversation
- [ ] They know how to switch it off
