# Changelog

## 0.1.2

- Re-release for the n8n Creator Portal review. No code changes.

## 0.1.1

- Package metadata only: public access for npm provenance and a monitored author contact address. No code changes.

## 0.1.0

First release.

- **Birinchishop API** credential: API key (`bsk_live_...` / `bsk_test_...`) sent as a Bearer token; credential test via `GET /me`.
- **Birinchishop** node:
  - Account: Get.
  - Offer: Get, Get Many (search, stock, sale rate, payout, IDs, language, sort; Return All / Limit).
  - Link: Create, Get, Get Many.
  - Order: Create (Idempotency-Key, live-order warning), Get, Get Many (filters, incremental sync, Return All / Limit, Simplify), Set Test Status (test keys).
  - Statistic: Get (by day, offer or link).
  - Event: Get Many (cursor pagination).
  - Webhook: Create, Get Many, Update, Delete, Send Test, Get Deliveries.
  - API errors mapped to NodeApiError with the API code and request ID; Continue On Fail support; usable as an AI tool.
- **Birinchishop Trigger** node: automatic webhook registration (checkExists / create / delete) or manual mode with a pasted secret; HMAC-SHA256 signature verification in constant time with timestamp tolerance; event type, status and test-event filters.
