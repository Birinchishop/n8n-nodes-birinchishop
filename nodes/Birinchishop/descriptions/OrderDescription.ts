import type { INodeProperties } from 'n8n-workflow';

import { CONVERSION_STATUS_OPTIONS, ORDER_STATUS_OPTIONS } from '../constants';

export const orderOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['order'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description:
					'Submit a REAL customer order that a call center phones (live key). Use a test key to try it.',
				action: 'Create an order',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get one order with its status, payout and tracking values',
				action: 'Get an order',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List your orders with filters by status, date, link, offer or click ID',
				action: 'Get many orders',
			},
			{
				name: 'Set Test Status',
				value: 'setTestStatus',
				description:
					'Test key only: change the status of a test order and send a signed test event to your webhooks',
				action: 'Set the status of a test order',
			},
		],
		default: 'getAll',
	},
];

const simplifyField = (operation: string): INodeProperties => ({
	displayName: 'Simplify',
	name: 'simplify',
	type: 'boolean',
	default: false,
	displayOptions: { show: { resource: ['order'], operation: [operation] } },
	description:
		'Whether to return a simplified version of the response instead of the raw data (10 most used fields, flattened)',
});

export const orderFields: INodeProperties[] = [
	/* ----------------------------- order:create ----------------------------- */
	{
		displayName:
			'Live keys (bsk_live_...) create a REAL order: a call center phones the customer and a courier delivers the product. Send only real customers who asked to order, with their correct phone number. Test, sample or fake orders get the account blocked. To try a workflow, use a test key (bsk_test_...): every check runs and a simulated order is returned ("test": true), but nothing is stored and nobody is phoned.',
		name: 'orderCreateNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['order'], operation: ['create'] } },
	},
	{
		displayName: 'Link Name or ID',
		name: 'linkId',
		type: 'options',
		required: true,
		default: '',
		typeOptions: { loadOptionsMethod: 'getLinks' },
		displayOptions: { show: { resource: ['order'], operation: ['create'] } },
		description:
			'Your tracking link; it determines the offer. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
	},
	{
		displayName: 'Phone',
		name: 'phone',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. +998900000000',
		displayOptions: { show: { resource: ['order'], operation: ['create'] } },
		description:
			'Customer Uzbekistan mobile number (+998XXXXXXXXX; other common formats are normalized). With a live key a call center calls this number — never send test or invented numbers.',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['order'], operation: ['create'] } },
		options: [
			{
				displayName: 'Click ID',
				name: 'click_id',
				type: 'string',
				default: '',
				description: 'Tracker click ID; returned in webhooks and postbacks',
			},
			{
				displayName: 'Customer Name',
				name: 'name',
				type: 'string',
				default: '',
				placeholder: 'e.g. Aziz',
				description: 'Customer name (default "Mijoz" plus the last 4 digits of the phone)',
			},
			{
				displayName: 'External ID',
				name: 'external_id',
				type: 'string',
				default: '',
				description: 'Your own ID for this order (max 128 characters)',
			},
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				placeholder: 'e.g. lead-12345',
				description:
					'Sent as the Idempotency-Key header: retries with the same key return the existing order instead of creating a duplicate. Use a stable value from your source (lead ID, row ID). If empty, a key based on the execution, node and item is used, which protects "Retry On Fail" but not a new execution.',
			},
			{
				displayName: 'Region',
				name: 'region',
				type: 'string',
				default: '',
				placeholder: 'e.g. Toshkent',
				description: 'Customer region (max 64 characters)',
			},
			{
				displayName: 'Sub1',
				name: 'sub1',
				type: 'string',
				default: '',
				description: 'Free tracking value, returned on the order and in postbacks',
			},
			{
				displayName: 'Sub2',
				name: 'sub2',
				type: 'string',
				default: '',
				description: 'Free tracking value, returned on the order and in postbacks',
			},
			{
				displayName: 'Sub3',
				name: 'sub3',
				type: 'string',
				default: '',
				description: 'Free tracking value, returned on the order and in postbacks',
			},
			{
				displayName: 'Sub4',
				name: 'sub4',
				type: 'string',
				default: '',
				description: 'Free tracking value, returned on the order and in postbacks',
			},
			{
				displayName: 'Sub5',
				name: 'sub5',
				type: 'string',
				default: '',
				description: 'Free tracking value, returned on the order and in postbacks',
			},
			{
				displayName: 'Variant ID',
				name: 'variant_id',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 1 },
				description: 'Product variant (see Offer → Get). Defaults to the first in-stock variant.',
			},
			{
				displayName: 'Variant Type ID',
				name: 'variant_type_id',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 1 },
				description: 'Variant type (size, color...) when the variant requires one',
			},
		],
	},

	/* ------------------------------ order:get ------------------------------- */
	{
		displayName: 'Order ID',
		name: 'orderId',
		type: 'number',
		required: true,
		default: 0,
		typeOptions: { minValue: 1 },
		displayOptions: { show: { resource: ['order'], operation: ['get', 'setTestStatus'] } },
		description: 'ID of the order (test orders have IDs from 2000000000)',
	},
	simplifyField('get'),

	/* ---------------------------- order:getAll ------------------------------ */
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['order'], operation: ['getAll'] } },
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		displayOptions: { show: { resource: ['order'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['order'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Click ID',
				name: 'click_id',
				type: 'string',
				default: '',
				description: 'Only orders with this tracker click ID',
			},
			{
				displayName: 'Conversion Status',
				name: 'conversion_status',
				type: 'options',
				options: CONVERSION_STATUS_OPTIONS,
				default: 'sale',
				description: 'Status group',
			},
			{
				displayName: 'Created From',
				name: 'date_from',
				type: 'string',
				default: '',
				placeholder: 'e.g. 2026-11-01',
				description: 'Orders created on or after this day (YYYY-MM-DD, Asia/Tashkent time)',
			},
			{
				displayName: 'Created To',
				name: 'date_to',
				type: 'string',
				default: '',
				placeholder: 'e.g. 2026-11-30',
				description: 'Orders created on or before this day (YYYY-MM-DD, Asia/Tashkent time)',
			},
			{
				displayName: 'External ID',
				name: 'external_id',
				type: 'string',
				default: '',
				description: 'Only the order with your external ID',
			},
			{
				displayName: 'Link ID',
				name: 'link_id',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 1 },
				description: 'Only orders from this link',
			},
			{
				displayName: 'Offer ID',
				name: 'offer_id',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 1 },
				description: 'Only orders for this offer',
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: ORDER_STATUS_OPTIONS,
				default: 'delivered',
				description: 'Order status',
			},
			{
				displayName: 'Updated Since',
				name: 'updated_since',
				type: 'dateTime',
				default: '',
				description:
					'Only orders updated after this moment, ordered by update time ascending (incremental sync)',
			},
		],
	},
	simplifyField('getAll'),

	/* ------------------------- order:setTestStatus -------------------------- */
	{
		displayName:
			'Works only with a test key (bsk_test_...) and a test order created by "Create" in test mode. Nothing is stored; your active webhooks receive a signed test "order.status_changed" event.',
		name: 'setTestStatusNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['order'], operation: ['setTestStatus'] } },
	},
	{
		displayName: 'Status',
		name: 'status',
		type: 'options',
		required: true,
		options: ORDER_STATUS_OPTIONS.filter((o) => o.value !== 'new'),
		default: 'delivered',
		displayOptions: { show: { resource: ['order'], operation: ['setTestStatus'] } },
		description: 'New status of the test order',
	},
];
