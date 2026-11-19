import type { INodePropertyOptions } from 'n8n-workflow';

export const BASE_URL = 'https://birinchishop.uz/api/v1';
export const CREDENTIAL_TYPE = 'birinchishopApi';

/** Public order statuses (OpenAPI `Order.status`). */
export const ORDER_STATUS_OPTIONS: INodePropertyOptions[] = [
	{ name: 'New', value: 'new', description: 'Order received, waiting for the call center' },
	{ name: 'Processing', value: 'processing', description: 'Call center is processing the order' },
	{ name: 'Callback', value: 'callback', description: 'Customer asked to be called back later' },
	{ name: 'Confirmed', value: 'confirmed', description: 'Customer confirmed the order by phone' },
	{ name: 'Packed', value: 'packed', description: 'Order is packed at the warehouse' },
	{ name: 'Shipping', value: 'shipping', description: 'Order is on the way to the customer' },
	{
		name: 'Delivered',
		value: 'delivered',
		description: 'Customer received and paid for the product; payout is earned',
	},
	{
		name: 'Returned',
		value: 'returned',
		description: 'Customer refused the product at delivery; it was returned',
	},
	{
		name: 'Cancelled',
		value: 'cancelled',
		description: 'Not confirmed, duplicate, unreachable customer, etc. No payout.',
	},
];

/** Status groups (OpenAPI `Order.conversion_status`). */
export const CONVERSION_STATUS_OPTIONS: INodePropertyOptions[] = [
	{
		name: 'Lead',
		value: 'lead',
		description: 'Received, not yet confirmed (new, processing, callback)',
	},
	{
		name: 'Approved',
		value: 'approved',
		description: 'Confirmed, not yet delivered (confirmed, packed, shipping)',
	},
	{ name: 'Sale', value: 'sale', description: 'Delivered and paid; payout earned' },
	{ name: 'Rejected', value: 'rejected', description: 'Returned or cancelled; no payout' },
];

export const EVENT_TYPE_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Order Created', value: 'order.created', description: 'A new order was received' },
	{
		name: 'Order Status Changed',
		value: 'order.status_changed',
		description: 'An order moved to another status',
	},
];

export const EVENT_TYPES = EVENT_TYPE_OPTIONS.map((o) => o.value as string);

export const OFFER_SORT_OPTIONS: INodePropertyOptions[] = [
	{ name: 'Best Selling', value: 'best_selling' },
	{ name: 'Highest Lead Bonus', value: 'highest_lead_bonus' },
	{ name: 'Highest Payout', value: 'highest_payout' },
	{ name: 'Highest Stock', value: 'highest_stock' },
	{ name: 'Newest', value: 'newest' },
	{ name: 'Recommended', value: 'recommended' },
];

export const LANGUAGE_OPTIONS: INodePropertyOptions[] = [
	{ name: 'English', value: 'en' },
	{ name: 'Russian', value: 'ru' },
	{ name: 'Uzbek (Original)', value: 'uz' },
];

/** Short, actionable hints shown as the error description, keyed by API `error.code`. */
export const ERROR_HINTS: Record<string, string> = {
	unauthorized: 'Check the API key in the Birinchishop credential.',
	key_revoked: 'This key was revoked. Create a new key in the partner panel (Dashboard → API).',
	key_expired: 'This key has expired. Create a new key in the partner panel (Dashboard → API).',
	insufficient_scope:
		'Edit the key in the partner panel (Dashboard → API) and grant the scope named above.',
	not_available_in_test_mode: 'This action needs a live key (bsk_live_...).',
	test_mode_only: 'This action works only with a test key (bsk_test_...).',
	ip_not_allowed:
		'Add the IP address of your n8n server to the key allowlist, or remove the allowlist.',
	account_blocked: 'Contact Birinchishop support.',
	rate_limited: 'Too many requests. Wait a little, or enable "Retry On Fail" in the node settings.',
	too_many_failed_attempts:
		'Too many requests with a wrong key from this IP. Fix the key and wait 15 minutes.',
	duplicate_order:
		'The same phone number already ordered this offer in the last 24 hours. Do not retry this order.',
	orders_write_not_allowed:
		'Sending orders via the API needs at least 3 delivered orders on the account, or approval from support.',
	customer_order_limit:
		'This phone number already ordered 3 different offers in the last 24 hours. Do not retry this order.',
	order_in_process:
		'This customer already has an unfinished order for this offer. Do not retry this order.',
	own_phone: 'An order cannot be placed to your own phone number.',
	invalid_phone: "Use an Uzbekistan mobile number in the 'Phone' field, e.g. +998900000000.",
	variant_not_found: "Check 'Variant ID' with the Offer → Get operation.",
	variant_type_required:
		"This variant needs 'Variant Type ID'. See the variant types in Offer → Get.",
	link_not_found: "Check 'Link'. It must be one of your own tracking links.",
	offer_not_found: 'The offer does not exist or is not active.',
	order_not_found: 'The order does not exist on this account. Test orders are kept for 24 hours.',
	webhook_not_found: 'The webhook does not exist on this account.',
	internal_error: 'Try again later. If it repeats, send the request ID to Birinchishop support.',
	daily_order_limit: 'Daily API order limit reached. Contact support to raise it.',
	out_of_stock: 'The offer is out of stock. Choose another offer or variant.',
	offer_inactive: 'The offer is no longer active. Choose another offer.',
	offer_temporarily_unavailable: 'The offer is temporarily unavailable. Try again later.',
	link_limit_reached: 'The account has the maximum number of links. Reuse an existing link.',
	webhook_limit_reached:
		'The account has the maximum number of webhooks (10). Delete unused ones (Webhook → Get Many / Delete).',
	unsupported_media_type: 'The request must be JSON.',
	invalid_request: 'Check the parameters listed in the details.',
};
