-- Demo business — "Ada's Closet", a Lagos womenswear retailer.
--
-- What this is for:
--   - a realistic sandbox to click through before touching a real business
--   - the fixture the internal QA script in docs/QA.md walks through
--   - a way to see the dashboard with data in it, which is the only way to
--     judge whether the dashboard is any good
--
-- It is deliberately ordinary: mid-range prices in naira, one item out of
-- stock, policies with awkward edges (a returns window, a delivery exception),
-- and a conversation that ends in an escalation. A demo where everything is in
-- stock and every question is easy teaches you nothing about the product.
--
-- USAGE — against a local test database, after the shim and migrations:
--   psql -d app -f supabase/seed/demo_business.sql
--
-- On a real Supabase project, create the user through Auth first, then set
-- `demo.user_id` below to their id and run the rest.
--
-- SAFE TO RE-RUN: it removes any previous demo organization first.
-- NEVER run this against a database with real customers.

\set ON_ERROR_STOP on

begin;

-- Fixed ids so the script is idempotent and QA can reference them.
select set_config('demo.user_id', '00000000-0000-0000-0000-00000000de00', true);

-- Remove any previous run. The organization must go first and explicitly:
-- deleting the auth user only cascades the membership, leaving the
-- organization and everything hanging off it behind.
delete from public.organizations o
where exists (
  select 1 from public.organization_members m
  where m.organization_id = o.id
    and m.user_id = current_setting('demo.user_id')::uuid
);

delete from auth.users where id = current_setting('demo.user_id')::uuid;

insert into auth.users (id, email) values
  (current_setting('demo.user_id')::uuid, 'demo@adascloset.example');

select set_config('demo.org_id',
  (select organization_id::text from public.organization_members
   where user_id = current_setting('demo.user_id')::uuid), true);

-- ---------------------------------------------------------------------------
-- The business
-- ---------------------------------------------------------------------------
update public.organizations
  set name = 'Ada''s Closet'
where id = current_setting('demo.org_id')::uuid;

update public.business_profiles set
  business_name = 'Ada''s Closet',
  business_type = 'Womenswear retailer',
  website = 'https://adascloset.example',
  phone = '+234 801 234 5678',
  location = 'Lekki Phase 1, Lagos',
  description =
    'Ready-to-wear womenswear, sized 8-20. We sell online and from our Lekki showroom.',
  business_hours =
    '{"mon":"9:00-18:00","tue":"9:00-18:00","wed":"9:00-18:00","thu":"9:00-18:00","fri":"9:00-19:00","sat":"10:00-16:00","sun":"closed"}'::jsonb,
  currency = 'NGN',
  timezone = 'Africa/Lagos'
where organization_id = current_setting('demo.org_id')::uuid;

-- ---------------------------------------------------------------------------
-- Catalogue
-- ---------------------------------------------------------------------------
insert into public.product_categories (id, organization_id, name, description) values
  ('00000000-0000-0000-0000-00000000ca01', current_setting('demo.org_id')::uuid,
   'Dresses', 'Day and occasion dresses'),
  ('00000000-0000-0000-0000-00000000ca02', current_setting('demo.org_id')::uuid,
   'Tops', 'Blouses and shirts'),
  ('00000000-0000-0000-0000-00000000ca03', current_setting('demo.org_id')::uuid,
   'Accessories', 'Bags, belts and scarves');

insert into public.products
  (organization_id, category_id, name, description, price, currency, sku,
   stock_quantity, status)
values
  (current_setting('demo.org_id')::uuid, '00000000-0000-0000-0000-00000000ca01',
   'Amara Wrap Dress',
   'Ankara wrap dress with a tie waist. Sizes 8-18.',
   28500, 'NGN', 'ADC-DR-001', 12, 'active'),
  (current_setting('demo.org_id')::uuid, '00000000-0000-0000-0000-00000000ca01',
   'Ngozi Midi Dress',
   'Plain crepe midi with short sleeves. Sizes 10-20.',
   19000, 'NGN', 'ADC-DR-002', 4, 'active'),
  (current_setting('demo.org_id')::uuid, '00000000-0000-0000-0000-00000000ca01',
   'Zara Occasion Gown',
   'Floor-length gown, lined. Sizes 8-16.',
   65000, 'NGN', 'ADC-DR-003', 0, 'active'),  -- out of stock on purpose
  (current_setting('demo.org_id')::uuid, '00000000-0000-0000-0000-00000000ca02',
   'Chiamaka Silk Blouse',
   'Washable silk blouse with a mandarin collar. Sizes 8-18.',
   15500, 'NGN', 'ADC-TP-001', 21, 'active'),
  (current_setting('demo.org_id')::uuid, '00000000-0000-0000-0000-00000000ca02',
   'Simi Cotton Shirt',
   'Oversized cotton shirt. One size.',
   9500, 'NGN', 'ADC-TP-002', 33, 'active'),
  (current_setting('demo.org_id')::uuid, '00000000-0000-0000-0000-00000000ca03',
   'Lekki Tote',
   'Leather tote, fits a 14-inch laptop.',
   42000, 'NGN', 'ADC-AC-001', 7, 'active'),
  (current_setting('demo.org_id')::uuid, '00000000-0000-0000-0000-00000000ca03',
   'Beaded Waist Belt',
   'Hand-beaded belt, adjustable.',
   6500, 'NGN', 'ADC-AC-002', 15, 'active'),
  (current_setting('demo.org_id')::uuid, '00000000-0000-0000-0000-00000000ca01',
   'Harmattan Kaftan (2024)',
   'Last season. No longer restocking.',
   22000, 'NGN', 'ADC-DR-900', 0, 'archived');

-- ---------------------------------------------------------------------------
-- Knowledge
--
-- Left as `pending`: chunking and embedding happen in the application, and a
-- seeded `ready` document with no chunks would be a document the AI cannot
-- actually retrieve. Reindex from /dashboard/knowledge after seeding.
-- ---------------------------------------------------------------------------
insert into public.knowledge_documents
  (organization_id, title, source_type, content, status)
values
  (current_setting('demo.org_id')::uuid, 'Delivery', 'policy',
   'We deliver anywhere in Nigeria. Lagos mainland and island: 1-2 working days, '
   'flat fee 2,500 naira. Other states: 3-5 working days via GIG Logistics, fee '
   'depends on destination and is confirmed before dispatch. Orders placed after '
   '3pm on Friday are dispatched on Monday. We do not deliver on Sundays. '
   'Free delivery within Lagos on orders over 50,000 naira.', 'pending'),

  (current_setting('demo.org_id')::uuid, 'Returns and exchanges', 'policy',
   'Returns are accepted within 7 days of delivery, provided tags are attached '
   'and the item is unworn. Exchanges for a different size are free within Lagos. '
   'Sale items and accessories including belts and scarves are final sale and '
   'cannot be returned. Refunds are processed within 5 working days to the '
   'original payment method. Customers pay return delivery unless the item is '
   'faulty or we sent the wrong thing.', 'pending'),

  (current_setting('demo.org_id')::uuid, 'Payment', 'policy',
   'We accept bank transfer, card payment, and cash on delivery within Lagos only. '
   'Cash on delivery is not available for orders over 100,000 naira. We do not '
   'hold items without payment. Payment plans are not available.', 'pending'),

  (current_setting('demo.org_id')::uuid, 'Sizing', 'faq',
   'Our sizes run true to UK sizing. A UK 12 fits a 36-inch bust and a 30-inch '
   'waist. If you are between sizes we recommend sizing up, particularly in the '
   'wrap dresses. Measurements for each item are on its product page. We do not '
   'currently offer alterations.', 'pending'),

  (current_setting('demo.org_id')::uuid, 'Showroom visits', 'faq',
   'Our Lekki Phase 1 showroom is open Monday to Friday 9am-6pm and Saturday '
   '10am-4pm. Closed Sundays. Appointments are not required but are recommended '
   'on Saturdays. You can try items on before buying.', 'pending');

-- ---------------------------------------------------------------------------
-- A customer, a conversation, a lead
--
-- The conversation ends with the AI escalating rather than guessing — which is
-- the behaviour the product is actually selling.
-- ---------------------------------------------------------------------------
insert into public.customers
  (id, organization_id, name, email, phone, external_channel)
values
  ('00000000-0000-0000-0000-00000000c501', current_setting('demo.org_id')::uuid,
   'Folake Adeyemi', 'folake@example.com', '+234 802 111 2222', 'widget');

insert into public.conversations
  (id, organization_id, customer_id, channel, status, last_message_at)
values
  ('00000000-0000-0000-0000-00000000c0f1', current_setting('demo.org_id')::uuid,
   '00000000-0000-0000-0000-00000000c501', 'widget', 'AI_ACTIVE',
   now() - interval '2 hours');

insert into public.messages
  (organization_id, conversation_id, sender_type, content, created_at)
values
  (current_setting('demo.org_id')::uuid, '00000000-0000-0000-0000-00000000c0f1',
   'customer', 'hi, do you have the wrap dress in a 14?',
   now() - interval '2 hours 6 minutes'),
  (current_setting('demo.org_id')::uuid, '00000000-0000-0000-0000-00000000c0f1',
   'ai',
   'Hi! Yes — the Amara Wrap Dress comes in sizes 8 to 18, so a 14 is available. '
   'It is 28,500 naira and we have 12 in stock. Would you like me to note your '
   'details so someone can get it sent out?',
   now() - interval '2 hours 5 minutes'),
  (current_setting('demo.org_id')::uuid, '00000000-0000-0000-0000-00000000c0f1',
   'customer', 'yes please. can i pay in two instalments?',
   now() - interval '2 hours 2 minutes'),
  (current_setting('demo.org_id')::uuid, '00000000-0000-0000-0000-00000000c0f1',
   'ai',
   'I have your details, thank you. On instalments — I do not want to give you '
   'the wrong answer there, so let me get a colleague to confirm what is '
   'possible. Someone will come back to you shortly.',
   now() - interval '2 hours');

insert into public.leads
  (organization_id, customer_id, conversation_id, status, source, score, intent, notes)
values
  (current_setting('demo.org_id')::uuid, '00000000-0000-0000-0000-00000000c501',
   '00000000-0000-0000-0000-00000000c0f1', 'NEW', 'ai_agent', 70,
   'Amara Wrap Dress, size 14',
   'Asked about paying in two instalments — escalated, needs a human answer.');

insert into public.lead_events
  (organization_id, lead_id, event_type, metadata)
select
  current_setting('demo.org_id')::uuid, l.id, 'created',
  jsonb_build_object('source', 'ai_agent', 'intent', 'Amara Wrap Dress, size 14')
from public.leads l
where l.organization_id = current_setting('demo.org_id')::uuid;

-- ---------------------------------------------------------------------------
-- Widget, off by default — turning it on is a deliberate act (ADR-067's rule
-- applies to every public surface).
-- ---------------------------------------------------------------------------
update public.widget_settings set
  greeting = 'Hi! Ask me anything about our dresses, sizing or delivery.',
  theme_color = '#7C2D57'
where organization_id = current_setting('demo.org_id')::uuid;

commit;

\echo ''
\echo 'Demo business seeded: Ada''s Closet'
\echo '  7 active products (one out of stock), 1 archived'
\echo '  5 knowledge documents — status `pending`, reindex from /dashboard/knowledge'
\echo '  1 customer, 1 conversation ending in an escalation, 1 lead'
\echo '  Widget is OFF. Turn it on from /dashboard/widget when you want to test it.'
