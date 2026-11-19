import { createHmac } from 'crypto';
import { describe, expect, it, vi } from 'vitest';
import type { IDataObject, IHookFunctions, IWebhookFunctions } from 'n8n-workflow';

import { BirinchishopTrigger, shouldEmit } from '../nodes/Birinchishop/BirinchishopTrigger.node';
import { NODE, mockHttp } from './helpers';

const BASE = 'https://birinchishop.uz/api/v1';
const HOOK_URL = 'https://n8n.example.com/webhook/abc/webhook';
const SECRET = 'whsec_test_only_not_a_real_secret';
const trigger = new BirinchishopTrigger();

function hookContext(
	params: IDataObject,
	http: ReturnType<typeof mockHttp>,
	staticData: IDataObject = {},
) {
	return {
		getNodeParameter: (name: string, fallback?: unknown) => params[name] ?? fallback,
		getNodeWebhookUrl: () => HOOK_URL,
		getWorkflowStaticData: () => staticData,
		getWorkflow: () => ({ id: 'wf1', name: 'Orders to sheet', active: true }),
		getNode: () => NODE,
		logger: { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() },
		helpers: { httpRequestWithAuthentication: http },
	} as unknown as IHookFunctions;
}

const remote = (
	id: number,
	url = HOOK_URL,
	events = ['order.created', 'order.status_changed'],
) => ({
	id,
	kind: 'json',
	url,
	events,
	is_active: true,
});

describe('webhook lifecycle', () => {
	const params = { registration: 'automatic', events: ['order.created', 'order.status_changed'] };

	it('checkExists is true only for the stored, active, unchanged webhook', async () => {
		const staticData: IDataObject = { registrations: { [HOOK_URL]: { id: 7, secret: SECRET } } };
		let http = mockHttp([{ body: { data: [remote(3, 'https://other.example.com'), remote(7)] } }]);
		expect(
			await trigger.webhookMethods.default.checkExists.call(hookContext(params, http, staticData)),
		).toBe(true);
		expect(http.mock.calls[0][1]).toMatchObject({ method: 'GET', url: `${BASE}/webhooks` });

		http = mockHttp([{ body: { data: [remote(7, HOOK_URL, ['order.created'])] } }]);
		expect(
			await trigger.webhookMethods.default.checkExists.call(hookContext(params, http, staticData)),
		).toBe(false);

		http = mockHttp([]);
		expect(
			await trigger.webhookMethods.default.checkExists.call(hookContext(params, http, {})),
		).toBe(false);
		expect(http).not.toHaveBeenCalled();
	});

	it('create removes stale hooks for this URL, registers a JSON webhook and stores id + secret', async () => {
		const staticData: IDataObject = {};
		const http = mockHttp([
			{ body: { data: [remote(4), remote(5, 'https://other.example.com')] } },
			{
				statusCode: 404,
				body: {
					error: { code: 'webhook_not_found', message: 'Webhook not found' },
					request_id: 'r',
				},
			},
			{ statusCode: 201, body: { data: { ...remote(9), secret: SECRET } } },
		]);
		const ok = await trigger.webhookMethods.default.create.call(
			hookContext(params, http, staticData),
		);
		expect(ok).toBe(true);
		expect(http.mock.calls[1][1]).toMatchObject({ method: 'DELETE', url: `${BASE}/webhooks/4` });
		expect(http.mock.calls[2][1]).toMatchObject({
			method: 'POST',
			url: `${BASE}/webhooks`,
			body: {
				url: HOOK_URL,
				kind: 'json',
				events: ['order.created', 'order.status_changed'],
				description: 'n8n: Orders to sheet',
			},
		});
		expect(staticData).toEqual({ registrations: { [HOOK_URL]: { id: 9, secret: SECRET } } });
	});

	it('create surfaces API refusals (e.g. a private URL) as NodeApiError', async () => {
		const http = mockHttp([
			{ body: { data: [] } },
			{
				statusCode: 400,
				body: {
					error: { code: 'invalid_request', message: 'url: must be a public address' },
					request_id: 'r2',
				},
			},
		]);
		await expect(
			trigger.webhookMethods.default.create.call(hookContext(params, http, {})),
		).rejects.toThrow('[invalid_request]');
	});

	it('delete removes the webhook and clears static data (404 = already gone)', async () => {
		const staticData: IDataObject = {
			registrations: {
				[HOOK_URL]: { id: 9, secret: SECRET },
				'https://n8n.example.com/webhook-test/x': { id: 10, secret: 'whsec_t' },
			},
		};
		const http = mockHttp([
			{
				statusCode: 404,
				body: { error: { code: 'webhook_not_found', message: 'x' }, request_id: 'r' },
			},
		]);
		expect(
			await trigger.webhookMethods.default.delete.call(hookContext(params, http, staticData)),
		).toBe(true);
		expect(http.mock.calls[0][1]).toMatchObject({ method: 'DELETE', url: `${BASE}/webhooks/9` });
		expect(staticData).toEqual({
			registrations: { 'https://n8n.example.com/webhook-test/x': { id: 10, secret: 'whsec_t' } },
		});
	});

	it('manual registration never calls the API', async () => {
		const http = mockHttp([]);
		const ctx = hookContext({ registration: 'manual' }, http);
		expect(await trigger.webhookMethods.default.checkExists.call(ctx)).toBe(true);
		expect(await trigger.webhookMethods.default.create.call(ctx)).toBe(true);
		expect(await trigger.webhookMethods.default.delete.call(ctx)).toBe(true);
		expect(http).not.toHaveBeenCalled();
	});
});

function signedRequest(body: string, secret = SECRET, t = Math.floor(Date.now() / 1000)) {
	const sig = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
	return { 'x-birinchishop-signature': `t=${t},v1=${sig}`, 'content-type': 'application/json' };
}

function webhookContext(
	params: IDataObject,
	rawBody: string,
	headers: IDataObject,
	staticData: IDataObject = {},
) {
	const res = { statusCode: 200, payload: undefined as unknown, status: vi.fn(), json: vi.fn() };
	res.status.mockImplementation((code: number) => {
		res.statusCode = code;
		return res;
	});
	res.json.mockImplementation((p: unknown) => {
		res.payload = p;
		return res;
	});
	const ctx = {
		getRequestObject: () => ({ rawBody: Buffer.from(rawBody) }),
		getResponseObject: () => res,
		getHeaderData: () => headers,
		getNodeParameter: (name: string, fallback?: unknown) => params[name] ?? fallback,
		getWorkflowStaticData: () => staticData,
		getNode: () => NODE,
		logger: { debug: vi.fn() },
		helpers: { returnJsonArray: (d: IDataObject) => [{ json: d }] },
	} as unknown as IWebhookFunctions;
	return { ctx, res };
}

const EVENT = {
	id: 'evt_55',
	type: 'order.status_changed',
	api_version: '2026-10-23',
	created_at: '2026-11-19T10:00:00.000Z',
	data: {
		id: 55,
		order_id: 1001,
		status: 'delivered',
		previous_status: 'shipping',
		conversion_status: 'sale',
		order: null,
	},
};
const RAW = JSON.stringify(EVENT);

describe('webhook()', () => {
	const auto = { registration: 'automatic', events: ['order.status_changed'], options: {} };

	it('emits the verified event (secret from static data)', async () => {
		const { ctx, res } = webhookContext(auto, RAW, signedRequest(RAW), {
			registrations: { [HOOK_URL]: { id: 7, secret: SECRET } },
		});
		const out = await trigger.webhook.call(ctx);
		expect(out.workflowData?.[0][0].json).toEqual(EVENT);
		expect(res.status).not.toHaveBeenCalled();
	});

	it('accepts a signature made with any registered secret (test and production URLs)', async () => {
		const staticData = {
			registrations: { a: { id: 1, secret: 'whsec_other' }, b: { id: 2, secret: SECRET } },
		};
		const { ctx } = webhookContext(auto, RAW, signedRequest(RAW), staticData);
		expect((await trigger.webhook.call(ctx)).workflowData).toBeDefined();
	});

	it('uses the node parameter secret in manual mode', async () => {
		const { ctx } = webhookContext(
			{
				registration: 'manual',
				webhookSecret: SECRET,
				events: ['order.status_changed'],
				options: {},
			},
			RAW,
			signedRequest(RAW),
		);
		expect((await trigger.webhook.call(ctx)).workflowData).toBeDefined();
	});

	it('rejects a bad signature with 401 and does not start the workflow', async () => {
		const { ctx, res } = webhookContext(auto, RAW, signedRequest(RAW, 'whsec_wrong'), {
			registrations: { [HOOK_URL]: { id: 7, secret: SECRET } },
		});
		const out = await trigger.webhook.call(ctx);
		expect(out).toEqual({ noWebhookResponse: true });
		expect(res.statusCode).toBe(401);
	});

	it('rejects an old timestamp (replay)', async () => {
		const old = Math.floor(Date.now() / 1000) - 3600;
		const { ctx, res } = webhookContext(auto, RAW, signedRequest(RAW, SECRET, old), {
			registrations: { [HOOK_URL]: { id: 7, secret: SECRET } },
		});
		expect((await trigger.webhook.call(ctx)).workflowData).toBeUndefined();
		expect(res.statusCode).toBe(401);
	});

	it('answers 401 when no secret is known yet', async () => {
		const { ctx, res } = webhookContext(auto, RAW, signedRequest(RAW), {});
		await trigger.webhook.call(ctx);
		expect(res.statusCode).toBe(401);
	});

	it('acknowledges but ignores events that do not match the filters', async () => {
		const body = JSON.stringify({ ...EVENT, type: 'order.created' });
		const { ctx, res } = webhookContext(auto, body, signedRequest(body), {
			registrations: { [HOOK_URL]: { id: 7, secret: SECRET } },
		});
		const out = await trigger.webhook.call(ctx);
		expect(out.workflowData).toBeUndefined();
		expect(res.statusCode).toBe(200);
		expect(res.payload).toEqual({ received: true, ignored: true });
	});
});

describe('shouldEmit', () => {
	it('filters by type, status, conversion status and test flag', () => {
		expect(shouldEmit(EVENT, [], {})).toBe(true);
		expect(shouldEmit(EVENT, ['order.created'], {})).toBe(false);
		expect(shouldEmit(EVENT, [], { statuses: ['delivered'] })).toBe(true);
		expect(shouldEmit(EVENT, [], { statuses: ['returned'] })).toBe(false);
		expect(shouldEmit(EVENT, [], { conversionStatuses: ['sale'] })).toBe(true);
		expect(shouldEmit(EVENT, [], { conversionStatuses: ['lead'] })).toBe(false);
		expect(shouldEmit({ ...EVENT, test: true }, [], { ignoreTestEvents: true })).toBe(false);
		expect(shouldEmit({ ...EVENT, test: true }, [], {})).toBe(true);
	});
});
