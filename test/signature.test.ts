import { createHmac } from 'crypto';
import { describe, expect, it } from 'vitest';

import { parseSignatureHeader, verifyWebhookSignature } from '../nodes/Birinchishop/signature';

const SECRET = 'whsec_test_only_not_a_real_secret';
const NOW = 1_790_000_000;
const BODY = JSON.stringify({
	id: 'evt_1',
	type: 'order.status_changed',
	api_version: '2026-10-23',
	created_at: '2026-11-19T10:00:00.000Z',
	data: {
		id: 1,
		order_id: 1001,
		status: 'delivered',
		previous_status: 'shipping',
		conversion_status: 'sale',
	},
});

const reasonOf = (r: ReturnType<typeof verifyWebhookSignature>) => (r.valid ? 'valid' : r.reason);

/** Reference implementation of the documented scheme, written independently of the node code. */
function sign(secret: string, t: number, body: string): string {
	return createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
}

describe('parseSignatureHeader', () => {
	it('parses t and several v1 values', () => {
		expect(parseSignatureHeader('t=123, v1=aa ,v1=bb')).toEqual({ t: '123', v1: ['aa', 'bb'] });
	});
	it('handles missing and array headers', () => {
		expect(parseSignatureHeader(undefined)).toEqual({ t: undefined, v1: [] });
		expect(parseSignatureHeader(['t=1,v1=cc'])).toEqual({ t: '1', v1: ['cc'] });
	});
});

describe('verifyWebhookSignature', () => {
	const header = `t=${NOW},v1=${sign(SECRET, NOW, BODY)}`;

	it('accepts a valid signature (string and Buffer body)', () => {
		expect(verifyWebhookSignature(BODY, header, SECRET, { now: NOW })).toEqual({
			valid: true,
			timestamp: NOW,
		});
		expect(
			verifyWebhookSignature(Buffer.from(BODY), header, SECRET, { now: NOW + 299 }).valid,
		).toBe(true);
	});

	it('rejects a modified body', () => {
		const r = verifyWebhookSignature(BODY.replace('delivered', 'returned'), header, SECRET, {
			now: NOW,
		});
		expect(r).toEqual({ valid: false, reason: 'mismatch' });
	});

	it('rejects a wrong secret', () => {
		expect(verifyWebhookSignature(BODY, header, 'whsec_other', { now: NOW }).valid).toBe(false);
	});

	it('rejects timestamps outside the tolerance (replay protection), both directions', () => {
		expect(verifyWebhookSignature(BODY, header, SECRET, { now: NOW + 301 })).toEqual({
			valid: false,
			reason: 'timestamp_out_of_range',
		});
		expect(verifyWebhookSignature(BODY, header, SECRET, { now: NOW - 301 }).valid).toBe(false);
		expect(
			verifyWebhookSignature(BODY, header, SECRET, { now: NOW + 500, toleranceSeconds: 600 }).valid,
		).toBe(true);
	});

	it('rejects malformed headers and a missing secret', () => {
		expect(reasonOf(verifyWebhookSignature(BODY, undefined, SECRET, { now: NOW }))).toBe(
			'malformed_header',
		);
		expect(reasonOf(verifyWebhookSignature(BODY, `t=abc,v1=${'0'.repeat(64)}`, SECRET))).toBe(
			'malformed_header',
		);
		expect(reasonOf(verifyWebhookSignature(BODY, `t=${NOW}`, SECRET, { now: NOW }))).toBe(
			'malformed_header',
		);
		expect(reasonOf(verifyWebhookSignature(BODY, `t=${NOW},v1=xyz`, SECRET, { now: NOW }))).toBe(
			'mismatch',
		);
		expect(reasonOf(verifyWebhookSignature(BODY, header, '', { now: NOW }))).toBe('missing_secret');
	});

	it('accepts when any of several v1 signatures matches (secret rotation)', () => {
		const multi = `t=${NOW},v1=${'0'.repeat(64)},v1=${sign(SECRET, NOW, BODY)}`;
		expect(verifyWebhookSignature(BODY, multi, SECRET, { now: NOW }).valid).toBe(true);
	});

	it('is sensitive to whitespace in the raw body (must use the raw bytes)', () => {
		const pretty = JSON.stringify(JSON.parse(BODY), null, 2);
		expect(verifyWebhookSignature(pretty, header, SECRET, { now: NOW }).valid).toBe(false);
	});
});
