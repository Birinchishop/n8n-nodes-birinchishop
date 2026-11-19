import type { INodeProperties } from 'n8n-workflow';

import { EVENT_TYPE_OPTIONS } from '../constants';

export const webhookOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['webhook'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description:
					'Add a signed JSON webhook or an S2S postback URL; the signing secret is returned only once',
				action: 'Create a webhook',
			},
			{
				name: 'Delete',
				value: 'delete',
				description: 'Permanently delete a webhook',
				action: 'Delete a webhook',
			},
			{
				name: 'Get Deliveries',
				value: 'getDeliveries',
				description: 'Get recent delivery attempts of a webhook',
				action: 'Get deliveries of a webhook',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List your webhooks and postbacks',
				action: 'Get many webhooks',
			},
			{
				name: 'Send Test',
				value: 'test',
				description: 'Send a sample signed event to the webhook now',
				action: 'Send a test event to a webhook',
			},
			{
				name: 'Update',
				value: 'update',
				description: 'Change the URL, events or description, or re-enable a webhook',
				action: 'Update a webhook',
			},
		],
		default: 'getAll',
	},
];

const eventsField: INodeProperties = {
	displayName: 'Events',
	name: 'events',
	type: 'multiOptions',
	options: EVENT_TYPE_OPTIONS,
	default: ['order.created', 'order.status_changed'],
	description: 'Event types to send',
};

export const webhookFields: INodeProperties[] = [
	{
		displayName: 'Webhook ID',
		name: 'webhookId',
		type: 'number',
		required: true,
		default: 0,
		typeOptions: { minValue: 1 },
		displayOptions: {
			show: { resource: ['webhook'], operation: ['delete', 'getDeliveries', 'test', 'update'] },
		},
		description: 'ID of the webhook',
	},
	{
		displayName:
			'To start a workflow on events, use the Birinchishop Trigger node instead: it registers its own webhook and verifies signatures.',
		name: 'webhookCreateNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['webhook'], operation: ['create'] } },
	},
	{
		displayName: 'URL',
		name: 'url',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. https://example.com/hooks/birinchishop',
		displayOptions: { show: { resource: ['webhook'], operation: ['create'] } },
		description:
			'Public http(s) URL on port 80, 443, 8080 or 8443. For postbacks, macros such as {click_id}, {status}, {conversion_status} and {payout_earned} are replaced.',
	},
	{
		displayName: 'Kind',
		name: 'kind',
		type: 'options',
		options: [
			{ name: 'JSON Webhook (Signed POST)', value: 'json' },
			{ name: 'Postback (GET With Macros)', value: 'postback' },
		],
		default: 'json',
		displayOptions: { show: { resource: ['webhook'], operation: ['create'] } },
	},
	{
		...eventsField,
		displayOptions: { show: { resource: ['webhook'], operation: ['create'] } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['webhook'], operation: ['create'] } },
		options: [
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				default: '',
				description: 'Your note for the webhook (max 120 characters)',
			},
		],
	},
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['webhook'], operation: ['update'] } },
		options: [
			{
				displayName: 'Description',
				name: 'description',
				type: 'string',
				default: '',
				description: 'Your note for the webhook (max 120 characters)',
			},
			eventsField,
			{
				displayName: 'Is Active',
				name: 'is_active',
				type: 'boolean',
				default: true,
				description:
					'Whether the webhook is active. Turning it on again resets the consecutive failure counter.',
			},
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				default: '',
				placeholder: 'e.g. https://example.com/hooks/birinchishop',
			},
		],
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1, maxValue: 100 },
		displayOptions: { show: { resource: ['webhook'], operation: ['getDeliveries'] } },
		description: 'Max number of results to return',
	},
];
