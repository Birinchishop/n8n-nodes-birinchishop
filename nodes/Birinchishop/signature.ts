import { createHmac, timingSafeEqual } from 'crypto';

export const SIGNATURE_HEADER = 'x-birinchishop-signature';
export const DEFAULT_TOLERANCE_SECONDS = 300;

export interface ParsedSignature {
	t?: string;
	v1: string[];
}

/** Parses `t=<unix>,v1=<hex>[,v1=<hex>...]`. */
export function parseSignatureHeader(header: unknown): ParsedSignature {
	const out: ParsedSignature = { t: undefined, v1: [] };
	const value = Array.isArray(header) ? header[0] : header;
	if (typeof value !== 'string') return out;
	for (const part of value.split(',')) {
		const i = part.indexOf('=');
		if (i < 0) continue;
		const key = part.slice(0, i).trim();
		const val = part.slice(i + 1).trim();
		if (key === 't') out.t = val;
		else if (key === 'v1') out.v1.push(val);
	}
	return out;
}

export function computeSignature(secret: string, timestamp: string, rawBody: Buffer): Buffer {
	return createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest();
}

function toBuffer(rawBody: Buffer | Uint8Array | string): Buffer {
	if (Buffer.isBuffer(rawBody)) return rawBody;
	if (typeof rawBody === 'string') return Buffer.from(rawBody, 'utf8');
	return Buffer.from(rawBody.buffer, rawBody.byteOffset, rawBody.byteLength);
}

export interface VerifyOptions {
	/** Allowed clock difference in seconds (default 300 = 5 minutes, as the API recommends). */
	toleranceSeconds?: number;
	/** Current time in seconds; for tests. */
	now?: number;
}

export type VerifyResult =
	| { valid: true; timestamp: number }
	| {
			valid: false;
			reason: 'missing_secret' | 'malformed_header' | 'timestamp_out_of_range' | 'mismatch';
	  };

/**
 * Verifies `X-Birinchishop-Signature: t=<unix>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>`
 * on the RAW request body, in constant time, rejecting timestamps outside the tolerance.
 * Same algorithm as the official Node.js SDK (`verifyWebhookSignature`).
 */
export function verifyWebhookSignature(
	rawBody: Buffer | Uint8Array | string,
	header: unknown,
	secret: string,
	{ toleranceSeconds = DEFAULT_TOLERANCE_SECONDS, now }: VerifyOptions = {},
): VerifyResult {
	if (!secret) return { valid: false, reason: 'missing_secret' };
	const { t, v1 } = parseSignatureHeader(header);
	if (!t || !/^\d+$/.test(t) || v1.length === 0)
		return { valid: false, reason: 'malformed_header' };
	const nowSeconds = now !== undefined ? now : Date.now() / 1000;
	if (Math.abs(nowSeconds - Number(t)) > toleranceSeconds) {
		return { valid: false, reason: 'timestamp_out_of_range' };
	}
	const expected = computeSignature(secret, t, toBuffer(rawBody));
	const ok = v1.some((sig) => {
		if (!/^[0-9a-f]{64}$/i.test(sig)) return false;
		return timingSafeEqual(expected, Buffer.from(sig, 'hex'));
	});
	return ok ? { valid: true, timestamp: Number(t) } : { valid: false, reason: 'mismatch' };
}
