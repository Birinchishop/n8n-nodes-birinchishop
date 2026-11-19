import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
	INode,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import { BASE_URL, CREDENTIAL_TYPE, ERROR_HINTS } from './constants';

export type BirinchishopContext = IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions;

export interface ApiResponse {
	statusCode: number;
	headers: IDataObject;
	body: IDataObject;
}

export interface RequestOptions {
	qs?: IDataObject;
	body?: IDataObject;
	headers?: IDataObject;
	itemIndex?: number;
}

/** Drops empty values so that unset optional filters are not sent. */
export function cleanQuery(qs: IDataObject = {}): IDataObject {
	const out: IDataObject = {};
	for (const [key, value] of Object.entries(qs)) {
		if (value === undefined || value === null || value === '') continue;
		if (Array.isArray(value)) {
			if (value.length) out[key] = value.join(',');
			continue;
		}
		out[key] = value;
	}
	return out;
}

function parseBody(body: unknown): IDataObject {
	if (body && typeof body === 'object' && !Buffer.isBuffer(body)) return body as IDataObject;
	const text = Buffer.isBuffer(body) ? body.toString('utf8') : typeof body === 'string' ? body : '';
	if (!text) return {};
	try {
		const parsed = JSON.parse(text) as unknown;
		return parsed && typeof parsed === 'object' ? (parsed as IDataObject) : { raw: text };
	} catch {
		return { raw: text.slice(0, 500) };
	}
}

function headerValue(headers: IDataObject, name: string): string | undefined {
	const value = headers[name] ?? headers[name.toLowerCase()];
	if (Array.isArray(value)) return value.length ? String(value[0]) : undefined;
	return value === undefined || value === null ? undefined : String(value);
}

/**
 * Converts an API error envelope `{ error: { code, message, details? }, request_id }`
 * into a NodeApiError. The API code and request id are kept in the message/description
 * and in `error.context` so that "Continue On Fail" output and support requests have them.
 */
export function toNodeApiError(
	node: INode,
	statusCode: number,
	rawBody: unknown,
	headers: IDataObject = {},
	itemIndex?: number,
): NodeApiError {
	const body = parseBody(rawBody);
	const apiError = (body.error && typeof body.error === 'object' ? body.error : {}) as IDataObject;
	const code = typeof apiError.code === 'string' ? apiError.code : `http_${statusCode}`;
	const apiMessage =
		typeof apiError.message === 'string' && apiError.message
			? apiError.message
			: `The Birinchishop API answered with HTTP ${statusCode}`;
	const requestId =
		(typeof body.request_id === 'string' ? body.request_id : undefined) ??
		headerValue(headers, 'x-request-id');
	const retryAfter = headerValue(headers, 'retry-after');
	const details = Array.isArray(apiError.details) ? (apiError.details as IDataObject[]) : [];

	const parts: string[] = [];
	if (ERROR_HINTS[code]) parts.push(ERROR_HINTS[code]);
	if (details.length) {
		parts.push(
			'Details: ' +
				details
					.map((d) =>
						d.field ? `${String(d.field)}: ${String(d.message ?? '')}` : JSON.stringify(d),
					)
					.join('; '),
		);
	}
	if (retryAfter) parts.push(`Retry after ${retryAfter} s.`);
	parts.push(`Code: ${code}.`);
	if (requestId) parts.push(`Request ID: ${requestId} (send it to support if you need help).`);

	const error = new NodeApiError(
		node,
		{ statusCode, code, message: apiMessage, request_id: requestId ?? null } as JsonObject,
		{
			message: `${apiMessage} [${code}]`,
			description: parts.join(' '),
			httpCode: String(statusCode),
			itemIndex,
		},
	);
	error.context.apiErrorCode = code;
	error.context.requestId = requestId ?? null;
	error.context.httpCode = statusCode;
	if (details.length) error.context.details = details;
	return error;
}

/**
 * One authenticated request to the Partner API. Never throws on HTTP status by itself:
 * non-2xx answers are converted to NodeApiError with the API code and request id.
 */
export async function birinchishopApiRequest(
	this: BirinchishopContext,
	method: IHttpRequestMethods,
	endpoint: string,
	{ qs, body, headers, itemIndex }: RequestOptions = {},
): Promise<ApiResponse> {
	const options: IHttpRequestOptions = {
		method,
		url: `${BASE_URL}${endpoint}`,
		headers: { Accept: 'application/json', ...(headers ?? {}) },
		qs: cleanQuery(qs),
		json: true,
		returnFullResponse: true,
		ignoreHttpStatusErrors: true,
	};
	if (body !== undefined) options.body = body;

	let response: IDataObject;
	try {
		response = (await this.helpers.httpRequestWithAuthentication.call(
			this,
			CREDENTIAL_TYPE,
			options,
		)) as IDataObject;
	} catch (error) {
		// Network/timeout failures; an already wrapped NodeApiError is passed through unchanged
		throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex });
	}

	const statusCode = Number(response.statusCode ?? 200);
	const responseHeaders = (response.headers ?? {}) as IDataObject;
	if (statusCode < 200 || statusCode >= 300) {
		throw toNodeApiError(this.getNode(), statusCode, response.body, responseHeaders, itemIndex);
	}
	return { statusCode, headers: responseHeaders, body: parseBody(response.body) };
}

/** Returns `data` of the envelope. */
export async function birinchishopApiData(
	this: BirinchishopContext,
	method: IHttpRequestMethods,
	endpoint: string,
	options: RequestOptions = {},
): Promise<IDataObject | IDataObject[]> {
	const { body } = await birinchishopApiRequest.call(this, method, endpoint, options);
	return (body.data ?? {}) as IDataObject | IDataObject[];
}

export const MAX_PAGE_SIZE = 100;
const MAX_PAGES = 1000;

/**
 * Page-number pagination (`page`, `limit`, `meta.total_pages`) used by /offers, /links, /orders.
 * `limit` undefined = return everything.
 */
export async function birinchishopApiRequestAllItems(
	this: BirinchishopContext,
	endpoint: string,
	qs: IDataObject = {},
	limit?: number,
	itemIndex?: number,
): Promise<IDataObject[]> {
	const results: IDataObject[] = [];
	const pageSize =
		limit === undefined ? MAX_PAGE_SIZE : Math.max(1, Math.min(MAX_PAGE_SIZE, limit));
	for (let page = 1; page <= MAX_PAGES; page++) {
		const { body } = await birinchishopApiRequest.call(this, 'GET', endpoint, {
			qs: { ...qs, page, limit: pageSize },
			itemIndex,
		});
		const data = Array.isArray(body.data) ? (body.data as IDataObject[]) : [];
		results.push(...data);
		if (limit !== undefined && results.length >= limit) return results.slice(0, limit);
		const meta = (body.meta ?? {}) as IDataObject;
		const totalPages = typeof meta.total_pages === 'number' ? meta.total_pages : undefined;
		if (data.length === 0 || data.length < pageSize) break;
		if (totalPages !== undefined && page >= totalPages) break;
	}
	return results;
}

export const MAX_EVENTS_PAGE = 200;

/** Cursor pagination of GET /events (`after`, `meta.next_cursor`, `meta.has_more`). */
export async function birinchishopEventsAll(
	this: BirinchishopContext,
	qs: IDataObject = {},
	limit?: number,
	itemIndex?: number,
): Promise<IDataObject[]> {
	const results: IDataObject[] = [];
	let after = Number(qs.after ?? 0) || 0;
	for (let i = 0; i < MAX_PAGES; i++) {
		const remaining = limit === undefined ? MAX_EVENTS_PAGE : limit - results.length;
		const { body } = await birinchishopApiRequest.call(this, 'GET', '/events', {
			qs: { ...qs, after, limit: Math.max(1, Math.min(MAX_EVENTS_PAGE, remaining)) },
			itemIndex,
		});
		const data = Array.isArray(body.data) ? (body.data as IDataObject[]) : [];
		results.push(...data);
		if (limit !== undefined && results.length >= limit) return results.slice(0, limit);
		const meta = (body.meta ?? {}) as IDataObject;
		if (!data.length || meta.has_more !== true) break;
		const next = Number(meta.next_cursor);
		if (!Number.isFinite(next) || next <= after) break;
		after = next;
	}
	return results;
}

/** Idempotency-Key header value: `^[A-Za-z0-9._:-]+$`, max 128 characters. */
export function sanitizeIdempotencyKey(value: string): string {
	return value.replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 128);
}

/**
 * Default key: stable for the same execution, node and item, so "Retry On Fail"
 * and network retries never create a second order.
 */
export function defaultIdempotencyKey(
	executionId: string | undefined,
	nodeId: string | undefined,
	itemIndex: number,
): string {
	return sanitizeIdempotencyKey(`n8n:${executionId ?? 'manual'}:${nodeId ?? 'node'}:${itemIndex}`);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Date filters are calendar days in Asia/Tashkent: accept YYYY-MM-DD or take the date part. */
export function toApiDate(value: unknown): string | undefined {
	if (value === undefined || value === null || value === '') return undefined;
	const text = String(value).trim();
	if (DATE_RE.test(text)) return text;
	const head = text.slice(0, 10);
	if (DATE_RE.test(head)) return head;
	return text; // let the API answer with invalid_request and a clear message
}

/** Flat view of an order with the most used fields (at most 10). */
export function simplifyOrder(order: IDataObject): IDataObject {
	const offer = (order.offer ?? {}) as IDataObject;
	const customer = (order.customer ?? {}) as IDataObject;
	const tracking = (order.tracking ?? {}) as IDataObject;
	return {
		id: order.id,
		status: order.status,
		conversion_status: order.conversion_status,
		payout: order.payout,
		payout_status: order.payout_status,
		offer_name: offer.name ?? null,
		customer_name: customer.name ?? null,
		customer_region: customer.region ?? null,
		click_id: tracking.click_id ?? null,
		updated_at: order.updated_at,
	};
}
