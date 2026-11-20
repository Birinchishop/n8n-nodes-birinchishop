# n8n-nodes-birinchishop

This is an [n8n](https://n8n.io/) community node package for the **[Birinchi Shop](https://birinchishop.uz) Partner API v1** —
a COD (cash on delivery) CPA affiliate network in Uzbekistan. Partners promote ready products; the network runs the
call center, warehouse and nationwide delivery and pays a fixed amount for every **delivered** order.

It contains two nodes and one credential:

- **Birinchishop** — offers, tracking links, orders, statistics, the event feed and webhooks.
- **Birinchishop Trigger** — starts a workflow when an order is created or changes status (signed webhooks,
  registered automatically).
- **Birinchishop API** credential — a partner API key (`bsk_live_...` or `bsk_test_...`).

No runtime dependencies. API docs: https://birinchishop.uz/api/v1/docs · OpenAPI: https://birinchishop.uz/api/v1/openapi.json ·
Node.js SDK: https://github.com/Birinchishop/birinchishop-node · More examples: https://github.com/Birinchishop/birinchishop-api-examples

[Installation](#installation) · [Credentials](#credentials) · [Operations](#operations) · [Trigger](#birinchishop-trigger) ·
[Test mode](#test-mode) · [Example workflows](#example-workflows) · [Errors](#errors) · [Compatibility](#compatibility) ·
[Development](#development)

## Installation

Follow the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/).
In short: **Settings → Community Nodes → Install**, enter `n8n-nodes-birinchishop`, and confirm.

For self-hosted n8n without the UI installer:

```bash
cd ~/.n8n/nodes   # create it if missing
npm install n8n-nodes-birinchishop
# restart n8n
```

## Credentials

1. Register as a partner at https://birinchishop.uz/register and open **Dashboard → API**.
2. Create an API key with only the scopes your workflow needs:

   | Scope | Needed for |
   |---|---|
   | `account:read` | Account → Get, and the **credential test** |
   | `offers:read` | Offer → Get / Get Many |
   | `links:read` / `links:write` | Link → Get / Get Many / Create (and the link list in Order → Create) |
   | `orders:read` / `orders:write` | Order → Get / Get Many / Create / Set Test Status |
   | `stats:read` | Statistic → Get |
   | `events:read` | Event → Get Many |
   | `webhooks:manage` | Webhook resource, and **automatic registration** in Birinchishop Trigger |

3. In n8n create a **Birinchishop API** credential and paste the key. n8n sends it as `Authorization: Bearer <key>`.
   The **Test** button calls `GET /me`.

The key is a server-side secret: keep it in n8n credentials only. If the key has an IP allowlist, add the IP address of
your n8n server.

**Live vs test keys.** A live key (`bsk_live_...`) acts on your real account. A test key (`bsk_test_...`) reads real
data, but `Create Order` and `Create Link` only run the checks and create nothing. Use a test key while you build and try
workflows — see [Test mode](#test-mode).

## Operations

| Resource | Operation | Endpoint |
|---|---|---|
| Account | Get | `GET /me` — name, balance, API key mode (`live`/`test`) and scopes |
| Offer | Get | `GET /offers/{id}` — variants, images, description, your links (`my_links`) |
| Offer | Get Many | `GET /offers` — search, in stock only, minimum sale rate, minimum payout, IDs, language (uz/ru/en), sort; Return All / Limit |
| Link | Create | `POST /links` — tracking link (landing page with the order form) for an offer |
| Link | Get | `GET /links/{id}` |
| Link | Get Many | `GET /links` — filter by offer; Return All / Limit |
| Order | Create | `POST /orders` — **creates a REAL order with a live key** (see below) |
| Order | Get | `GET /orders/{id}` — optional Simplify |
| Order | Get Many | `GET /orders` — status, status group, created from/to (Asia/Tashkent days), updated since (incremental sync), link, offer, click ID, external ID; Return All / Limit; optional Simplify |
| Order | Set Test Status | `POST /sandbox/orders/{id}/status` — test key only: moves a test order and sends a signed test `order.status_changed` event to your webhooks |
| Statistic | Get | `GET /stats` — orders, approved, delivered, rejected, earnings and clicks grouped by day, offer or link; one item per row, or one item with rows and totals |
| Event | Get Many | `GET /events` — order events after a cursor (`after`), by type, optionally with the order; Return All follows `next_cursor` |
| Webhook | Create / Get Many / Update / Delete | `/webhooks` — signed JSON webhooks or S2S postbacks (Keitaro, Binom...); the signing secret is returned once by Create |
| Webhook | Send Test / Get Deliveries | `POST /webhooks/{id}/test`, `GET /webhooks/{id}/deliveries` |

Money is integer UZS. Date filters are calendar days in Asia/Tashkent (UTC+5); timestamps are ISO 8601 UTC.
Customer phone numbers are always masked. Payout is earned only when an order is **delivered** (`conversion_status = "sale"`).

### Order → Create — read this first

> **With a live key, Create Order submits a REAL order.** A call center phones the customer and a courier delivers the
> product. Send only real customers who asked to order, with their correct phone number.
> **Never send test, sample or fake orders — the account gets blocked.** Use a test key to try workflows.
> Live orders via the API need the `orders:write` scope and an account with at least 3 delivered orders (or approval
> from support).

- **Link** — one of your tracking links (picked from a list); it determines the offer.
- **Phone** — Uzbekistan mobile `+998XXXXXXXXX` (common formats are normalized).
- Additional fields: customer name, region, variant ID, variant type ID, external ID, click ID, sub1–sub5.
- **Idempotency Key** — sent as the `Idempotency-Key` header. Retrying with the same key returns the existing order
  (output `idempotent_replayed: true`) instead of creating a duplicate. Map a stable value from your source (lead ID,
  sheet row ID). If empty, the node uses `n8n:<execution id>:<node id>:<item index>`, which makes **Retry On Fail** safe
  but does not protect a new execution of the same data.

Business rules enforced by the API: one phone number cannot order the same offer twice within 24 hours
(`duplicate_order`), and at most 3 different offers per 24 hours (`customer_order_limit`).

> **One order per input item.** Like every n8n node, Order → Create runs once for each incoming item. If it follows a
> node that returns several items (for example Offer → Get Many), it submits one order per item, and the same phone +
> offer within 24 hours is refused with `duplicate_order`. Pass a single item, or turn on **Settings → Execute Once**.

## Birinchishop Trigger

Outputs the verified event exactly as sent by the platform:

```json
{
  "id": "evt_123",
  "type": "order.status_changed",
  "api_version": "2026-10-23",
  "created_at": "2026-11-19T10:00:00.000Z",
  "data": {
    "id": 123, "order_id": 1001, "type": "order.status_changed",
    "status": "delivered", "previous_status": "shipping", "conversion_status": "sale",
    "order": { "id": 1001, "payout": 50000, "tracking": { "click_id": "abc" }, "...": "..." }
  }
}
```

Test events also have `"test": true`.

**Parameters**

- **Registration**
  - **Automatic** (default): when you activate the workflow (or click *Listen for test event*), the node creates a JSON
    webhook for its URL with `POST /webhooks`, stores the webhook ID and signing secret in the workflow's static data,
    and deletes the webhook with `DELETE /webhooks/{id}` when the workflow is deactivated. The key needs
    `webhooks:manage`. Earlier webhooks registered for the same URL are replaced, so the account limit (10 webhooks) is
    not used up.
  - **Manual**: add the node's **production URL** in the partner panel (**Dashboard → API → Webhooks**, kind *JSON*) and
    paste the signing secret (`whsec_...`) that the panel shows once into **Webhook Signing Secret**. No API key needed.
- **Events** — `order.created`, `order.status_changed`.
- **Options** — only certain order statuses or status groups (e.g. *Sale* = delivered), ignore test events, signature
  tolerance (default 300 s).

**Security.** Every request is verified before the workflow starts: `X-Birinchishop-Signature: t=<unix>,v1=<hex>` is an
HMAC-SHA256 of `"<t>.<raw body>"` with the signing secret, compared in constant time; requests older or newer than the
tolerance are rejected (replay protection). Invalid requests get `401` and do not start the workflow. Events that do not
match your filters are acknowledged with `200` and ignored.

**The webhook URL must be public.** The platform only delivers to public `http(s)` addresses on ports 80, 443, 8080 or
8443. A local n8n on `localhost:5678` is rejected — put n8n behind a domain with HTTPS (set `WEBHOOK_URL` in n8n), or
use n8n Cloud.

Deliveries are retried with backoff (1 min … 24 h) when n8n does not answer 2xx within 10 seconds; the node answers
immediately. Deliveries can arrive twice or out of order: deduplicate by `id` and use `data.order.updated_at`. If you
prefer polling, use **Event → Get Many** with a stored cursor instead.

## Test mode

Create a test key (`bsk_test_...`) in **Dashboard → API**. With it:

- Reads return your real data.
- **Order → Create** and **Link → Create** run every live check (phone, link, stock, duplicates, rate limits,
  Idempotency-Key) but create nothing: no order, no call-center call, no payout. The output has `"test": true`, a fake ID
  ≥ 2000000000 and `live_orders_allowed`.
- Your webhooks (including Birinchishop Trigger) receive signed test events (`"test": true`): `order.created` right after
  a test order, and `order.status_changed` when you run **Order → Set Test Status**.
- Test orders are kept for 24 hours; `Order → Get` returns them, list operations, stats and events do not.

A safe end-to-end check: activate a workflow with Birinchishop Trigger (test key, automatic registration), then in
another workflow run **Order → Create** (test key) followed by **Order → Set Test Status → Delivered**.

## Example workflows

Import from `examples/` (**Workflows → Import from File**), then select your credential:

- [`examples/delivered-orders-to-telegram.json`](examples/delivered-orders-to-telegram.json) — Birinchishop Trigger
  (status group *Sale*) → Telegram message with the order, payout and click ID.
- [`examples/daily-stats-report.json`](examples/daily-stats-report.json) — every day at 9:00, yesterday's statistics by
  offer → offers with a delivery rate under 10%.

## Errors

API errors become n8n errors whose message ends with the API code, e.g.
`This phone number already has an order for this offer in the last 24 hours [duplicate_order]`; the description has a
hint, the code and the `request_id` (send it to support). With **Continue On Fail** the item output is
`{ error, description, code, request_id, http_code, details? }`, so you can branch on `code`.

Common codes: `unauthorized`, `key_revoked`, `key_expired`, `insufficient_scope`, `ip_not_allowed`, `rate_limited`
(120 requests/minute per key, 30 orders/minute per account — enable *Retry On Fail*), `duplicate_order`,
`customer_order_limit`, `orders_write_not_allowed`, `out_of_stock`, `offer_inactive`, `invalid_request`,
`test_mode_only`, `not_available_in_test_mode`.

## Compatibility

Built against n8n 2.x (`n8n-workflow` 2.48, `@n8n/node-cli` 0.57, `n8nNodesApiVersion` 1). Older n8n 1.x versions are
untested. Not included: the AI manager (insights, sale chance) and Meta ads endpoints.

## Development

```bash
npm install
npm run lint     # n8n community node linter
npm run build    # TypeScript → dist/
npm test         # unit tests (mocked HTTP, no network)
npm run dev      # n8n with this package loaded (needs Node.js 22+)
```

Releases are published from GitHub Actions with npm provenance (`.github/workflows/publish.yml`, `npm run release`).

---

Registration is free: https://birinchishop.uz/register?utm_source=n8n&utm_campaign=n8n-node ·
Support: https://t.me/birinchishop_support

## License

[MIT](LICENSE). Using the API itself is subject to the partner agreement on birinchishop.uz.
