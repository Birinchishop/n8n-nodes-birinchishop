import { describe, expect, it } from 'vitest';
import type { IDataObject, IExecuteFunctions } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import { Birinchishop } from '../nodes/Birinchishop/Birinchishop.node';
import { toNodeApiError } from '../nodes/Birinchishop/GenericFunctions';
import { NODE, callOptions, executeContext, mockHttp } from './helpers';

const BASE = 'https://birinchishop.uz/api/v1';
const node = new Birinchishop();

async function run(ctx: ReturnType<typeof executeContext>) {
	return node.execute.call(ctx as unknown as IExecuteFunctions);
}

const order = (id: number): IDataObject => ({
	id,
	status: 'delivered',
	conversion_status: 'sale',
	created_at: '2026-11-18T09:00:00.000Z',
	updated_at: '2026-11-19T09:00:00.000Z',
	offer: { id: 7, name: 'Smart watch' },
	link: { id: 2001, name: 'Reels' },
	customer: { name: 'Aziz', phone_masked: '+998 ** *** 00 00', region: 'Toshkent' },
	customer_price: 199000,
	payout: 50000,
	payout_status: 'earned',
	tracking: { click_id: 'abc', sub1: null },
});

describe('request building', () => {
	it('Account → Get calls GET /me with the credential and JSON accept header', async () => {
		const http = mockHttp([{ body: { data: { id: 1, name: 'Partner' }, request_id: 'req_1' } }]);
		const out = await run(executeContext({ resource: 'account', operation: 'get' }, http));
		expect(http).toHaveBeenCalledTimes(1);
		expect(http.mock.calls[0][0]).toBe('birinchishopApi');
		const o = callOptions(http);
		expect(o).toMatchObject({
			method: 'GET',
			url: `${BASE}/me`,
			json: true,
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
		});
		expect((o.headers as IDataObject).Accept).toBe('application/json');
		expect(o.body).toBeUndefined();
		expect(out[0]).toEqual([{ json: { id: 1, name: 'Partner' }, pairedItem: { item: 0 } }]);
	});

	it('Offer → Get Many sends filters and sort, drops unset values', async () => {
		const http = mockHttp([{ body: { data: [{ id: 1 }], meta: { page: 1, total_pages: 1 } } }]);
		await run(
			executeContext(
				{
					resource: 'offer',
					operation: 'getAll',
					returnAll: false,
					limit: 10,
					filters: {
						search: 'soat',
						in_stock_only: false,
						min_payout: 0,
						min_sale_rate: 25,
						lang: 'en',
					},
					sort: { sort: 'best_selling' },
				},
				http,
			),
		);
		expect(callOptions(http)).toMatchObject({ method: 'GET', url: `${BASE}/offers` });
		expect(callOptions(http).qs).toEqual({
			search: 'soat',
			in_stock_only: false,
			min_sale_rate: 25,
			lang: 'en',
			sort: 'best_selling',
			page: 1,
			limit: 10,
		});
	});

	it('Order → Create posts the body with a deterministic Idempotency-Key', async () => {
		const http = mockHttp([
			{ statusCode: 201, body: { data: { id: 2000000001, status: 'new', test: true } } },
		]);
		const out = await run(
			executeContext(
				{
					resource: 'order',
					operation: 'create',
					linkId: 2001,
					phone: ' +998900000000 ',
					additionalFields: { name: 'Aziz', sub1: 'reels', variant_id: 0, region: '' },
				},
				http,
			),
		);
		const o = callOptions(http);
		expect(o).toMatchObject({ method: 'POST', url: `${BASE}/orders` });
		expect(o.body).toEqual({ link_id: 2001, phone: '+998900000000', name: 'Aziz', sub1: 'reels' });
		const key = (o.headers as IDataObject)['Idempotency-Key'] as string;
		expect(key).toBe(`n8n:exec-42:${NODE.id}:0`);
		expect(key).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
		expect(out[0][0].json).toMatchObject({
			id: 2000000001,
			test: true,
			idempotency_key: key,
			idempotent_replayed: false,
		});
	});

	it('Order → Create uses and sanitizes a custom Idempotency-Key and reports replays', async () => {
		const http = mockHttp([
			{ statusCode: 200, headers: { 'idempotent-replayed': 'true' }, body: { data: { id: 5 } } },
		]);
		const out = await run(
			executeContext(
				{
					resource: 'order',
					operation: 'create',
					linkId: '2001',
					phone: '+998900000000',
					additionalFields: { idempotencyKey: 'lead #12/a' },
				},
				http,
			),
		);
		expect((callOptions(http).headers as IDataObject)['Idempotency-Key']).toBe('lead--12-a');
		expect(callOptions(http).body).toEqual({ link_id: 2001, phone: '+998900000000' });
		expect(out[0][0].json.idempotent_replayed).toBe(true);
	});

	it('Order → Create refuses an empty phone without calling the API', async () => {
		const http = mockHttp([]);
		await expect(
			run(
				executeContext(
					{ resource: 'order', operation: 'create', linkId: 2001, phone: '', additionalFields: {} },
					http,
				),
			),
		).rejects.toThrow("'Phone' is empty");
		expect(http).not.toHaveBeenCalled();
	});

	it('Order → Get Many converts dates and can simplify', async () => {
		const http = mockHttp([{ body: { data: [order(1)], meta: { page: 1, total_pages: 1 } } }]);
		const out = await run(
			executeContext(
				{
					resource: 'order',
					operation: 'getAll',
					returnAll: false,
					limit: 5,
					simplify: true,
					filters: {
						status: 'delivered',
						date_from: '2026-11-01T00:00:00.000+05:00',
						updated_since: '2026-11-18T10:00:00.000Z',
						link_id: 0,
					},
				},
				http,
			),
		);
		expect(callOptions(http).qs).toEqual({
			status: 'delivered',
			date_from: '2026-11-01',
			updated_since: '2026-11-18T10:00:00.000Z',
			page: 1,
			limit: 5,
		});
		expect(out[0][0].json).toEqual({
			id: 1,
			status: 'delivered',
			conversion_status: 'sale',
			payout: 50000,
			payout_status: 'earned',
			offer_name: 'Smart watch',
			customer_name: 'Aziz',
			customer_region: 'Toshkent',
			click_id: 'abc',
			updated_at: '2026-11-19T09:00:00.000Z',
		});
		expect(Object.keys(out[0][0].json).length).toBeLessThanOrEqual(10);
	});

	it('Order → Set Test Status posts to the sandbox endpoint', async () => {
		const http = mockHttp([{ body: { data: { previous_status: 'new' } } }]);
		await run(
			executeContext(
				{ resource: 'order', operation: 'setTestStatus', orderId: 2000000001, status: 'delivered' },
				http,
			),
		);
		expect(callOptions(http)).toMatchObject({
			method: 'POST',
			url: `${BASE}/sandbox/orders/2000000001/status`,
			body: { status: 'delivered' },
		});
	});

	it('Statistic → Get splits rows or returns rows with totals', async () => {
		const body = {
			data: [
				{ date: '2026-11-18', orders: 3 },
				{ date: '2026-11-19', orders: 1 },
			],
			meta: { totals: { orders: 4, clicks: 90 }, clicks_since: '2026-10-01' },
		};
		let http = mockHttp([{ body }]);
		let out = await run(
			executeContext(
				{
					resource: 'stats',
					operation: 'get',
					groupBy: 'day',
					filters: { offer_id: 0 },
					options: {},
				},
				http,
			),
		);
		expect(callOptions(http).qs).toEqual({ group_by: 'day' });
		expect(out[0]).toHaveLength(2);

		http = mockHttp([{ body }]);
		out = await run(
			executeContext(
				{
					resource: 'stats',
					operation: 'get',
					groupBy: 'offer',
					filters: { date_from: '2026-11-01' },
					options: { splitIntoItems: false },
				},
				http,
			),
		);
		expect(out[0]).toHaveLength(1);
		expect(out[0][0].json).toMatchObject({ rows: body.data, totals: { orders: 4, clicks: 90 } });
	});

	it('Webhook → Delete returns { deleted: true }', async () => {
		const http = mockHttp([{ body: { data: { id: 3, deleted: true } } }]);
		const out = await run(
			executeContext({ resource: 'webhook', operation: 'delete', webhookId: 3 }, http),
		);
		expect(callOptions(http)).toMatchObject({ method: 'DELETE', url: `${BASE}/webhooks/3` });
		expect(out[0][0].json).toEqual({ deleted: true });
	});
});

describe('pagination', () => {
	it('Return All walks every page until total_pages', async () => {
		const page = (n: number, count: number) => ({
			body: {
				data: Array.from({ length: count }, (_, k) => order(n * 1000 + k)),
				meta: { page: n, limit: 100, total: 250, total_pages: 3 },
			},
		});
		const http = mockHttp([page(1, 100), page(2, 100), page(3, 50)]);
		const out = await run(
			executeContext(
				{ resource: 'order', operation: 'getAll', returnAll: true, filters: {} },
				http,
			),
		);
		expect(http).toHaveBeenCalledTimes(3);
		expect(http.mock.calls.map((c) => (c[1].qs as IDataObject).page)).toEqual([1, 2, 3]);
		expect(http.mock.calls.every((c) => (c[1].qs as IDataObject).limit === 100)).toBe(true);
		expect(out[0]).toHaveLength(250);
		expect(out[0][249].pairedItem).toEqual({ item: 0 });
	});

	it('a limit above the page size fetches only the pages it needs', async () => {
		const page = (n: number) => ({
			body: {
				data: Array.from({ length: 100 }, (_, k) => ({ id: n * 1000 + k })),
				meta: { total_pages: 9 },
			},
		});
		const http = mockHttp([page(1), page(2)]);
		const out = await run(
			executeContext(
				{ resource: 'link', operation: 'getAll', returnAll: false, limit: 150, filters: {} },
				http,
			),
		);
		expect(http).toHaveBeenCalledTimes(2);
		expect(out[0]).toHaveLength(150);
	});

	it('stops on an empty page even without meta', async () => {
		const http = mockHttp([{ body: { data: [] } }]);
		const out = await run(
			executeContext(
				{ resource: 'offer', operation: 'getAll', returnAll: true, filters: {}, sort: {} },
				http,
			),
		);
		expect(http).toHaveBeenCalledTimes(1);
		expect(out[0]).toHaveLength(0);
	});

	it('events follow next_cursor while has_more is true', async () => {
		const http = mockHttp([
			{ body: { data: [{ id: 11 }, { id: 12 }], meta: { next_cursor: 12, has_more: true } } },
			{ body: { data: [{ id: 13 }], meta: { next_cursor: 13, has_more: false } } },
		]);
		const out = await run(
			executeContext(
				{
					resource: 'event',
					operation: 'getAll',
					returnAll: true,
					filters: { after: 10, type: 'order.status_changed', include_order: true },
				},
				http,
			),
		);
		expect(http.mock.calls.map((c) => (c[1].qs as IDataObject).after)).toEqual([10, 12]);
		expect(callOptions(http).qs).toMatchObject({
			limit: 200,
			include_order: true,
			type: 'order.status_changed',
		});
		expect(out[0].map((i) => i.json.id)).toEqual([11, 12, 13]);
	});

	it('events respect the limit', async () => {
		const http = mockHttp([
			{
				body: { data: [{ id: 1 }, { id: 2 }, { id: 3 }], meta: { next_cursor: 3, has_more: true } },
			},
		]);
		const out = await run(
			executeContext(
				{ resource: 'event', operation: 'getAll', returnAll: false, limit: 3, filters: {} },
				http,
			),
		);
		expect(callOptions(http).qs).toMatchObject({ after: 0, limit: 3 });
		expect(http).toHaveBeenCalledTimes(1);
		expect(out[0]).toHaveLength(3);
	});
});

describe('error mapping', () => {
	const duplicate = {
		statusCode: 409,
		headers: { 'x-request-id': 'req_hdr' },
		body: {
			error: {
				code: 'duplicate_order',
				message: 'This phone number already has an order for this offer in the last 24 hours',
			},
			request_id: 'req_abc123',
		},
	};

	it('maps the API error envelope to NodeApiError with code and request id', async () => {
		const http = mockHttp([duplicate]);
		const err = await run(
			executeContext(
				{
					resource: 'order',
					operation: 'create',
					linkId: 2001,
					phone: '+998900000000',
					additionalFields: {},
				},
				http,
			),
		).catch((e: unknown) => e);
		expect(err).toBeInstanceOf(NodeApiError);
		const e = err as NodeApiError;
		expect(e.httpCode).toBe('409');
		expect(e.message).toBe(
			'This phone number already has an order for this offer in the last 24 hours [duplicate_order]',
		);
		expect(e.description).toContain('Do not retry this order');
		expect(e.description).toContain('Code: duplicate_order.');
		expect(e.description).toContain('Request ID: req_abc123');
		expect(e.context).toMatchObject({
			apiErrorCode: 'duplicate_order',
			requestId: 'req_abc123',
			itemIndex: 0,
		});
	});

	it('continueOnFail outputs the code and request id per item and keeps going', async () => {
		const http = mockHttp([
			{
				statusCode: 403,
				body: {
					error: {
						code: 'insufficient_scope',
						message: 'This API key lacks the "orders:read" scope.',
						details: [{ required_scope: 'orders:read' }],
					},
					request_id: 'req_x',
				},
			},
			{ body: { data: order(2) } },
		]);
		const out = await run(
			executeContext({ resource: 'order', operation: 'get', orderId: 2, simplify: false }, http, {
				items: 2,
				continueOnFail: true,
			}),
		);
		expect(out[0]).toHaveLength(2);
		expect(out[0][0].json).toMatchObject({
			code: 'insufficient_scope',
			request_id: 'req_x',
			http_code: 403,
			details: [{ required_scope: 'orders:read' }],
		});
		expect(String(out[0][0].json.error)).toContain('[insufficient_scope]');
		expect(out[0][0].pairedItem).toEqual({ item: 0 });
		expect(out[0][1].json.id).toBe(2);
	});

	it('falls back to the X-Request-Id header, Retry-After and non-JSON bodies', () => {
		const e = toNodeApiError(NODE, 429, '<html>Too Many</html>', {
			'x-request-id': 'req_h',
			'retry-after': '30',
		});
		expect(e.httpCode).toBe('429');
		expect(e.message).toContain('[http_429]');
		expect(e.description).toContain('Retry after 30 s.');
		expect(e.description).toContain('Request ID: req_h');
	});

	it('lists validation details', () => {
		const e = toNodeApiError(NODE, 400, {
			error: {
				code: 'invalid_request',
				message: 'phone: invalid',
				details: [{ field: 'phone', message: 'invalid' }],
			},
			request_id: 'r1',
		});
		expect(e.description).toContain('Details: phone: invalid');
	});

	it('wraps network failures in NodeApiError', async () => {
		const http = mockHttp([]);
		http.mockRejectedValueOnce(
			Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }),
		);
		const err = await run(executeContext({ resource: 'account', operation: 'get' }, http)).catch(
			(e: unknown) => e,
		);
		expect(err).toBeInstanceOf(NodeApiError);
	});
});
