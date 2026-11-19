import type { INodeProperties } from 'n8n-workflow';

export const linkOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['link'] } },
		options: [
			{
				name: 'Create',
				value: 'create',
				description: 'Create a tracking link (landing page with the order form) for an offer',
				action: 'Create a link',
			},
			{
				name: 'Get',
				value: 'get',
				description: 'Get one of your tracking links with clicks and orders',
				action: 'Get a link',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'List your tracking links',
				action: 'Get many links',
			},
		],
		default: 'getAll',
	},
];

export const linkFields: INodeProperties[] = [
	{
		displayName: 'Link ID',
		name: 'linkId',
		type: 'number',
		required: true,
		default: 0,
		typeOptions: { minValue: 1 },
		displayOptions: { show: { resource: ['link'], operation: ['get'] } },
		description: 'ID of the tracking link',
	},
	{
		displayName:
			'Check the offer\'s "my_links" (Offer → Get) first: reuse an existing link instead of creating duplicates. With a test key (bsk_test_...) the link is validated but not created.',
		name: 'linkCreateNotice',
		type: 'notice',
		default: '',
		displayOptions: { show: { resource: ['link'], operation: ['create'] } },
	},
	{
		displayName: 'Offer ID',
		name: 'offerId',
		type: 'number',
		required: true,
		default: 0,
		typeOptions: { minValue: 1 },
		displayOptions: { show: { resource: ['link'], operation: ['create'] } },
		description: 'ID of the offer to promote',
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['link'], operation: ['create'] } },
		options: [
			{
				displayName: 'Name',
				name: 'name',
				type: 'string',
				default: '',
				placeholder: 'e.g. Instagram reels',
				description: 'Your label for the link (max 100 characters)',
			},
		],
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['link'], operation: ['getAll'] } },
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		displayOptions: { show: { resource: ['link'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['link'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Offer ID',
				name: 'offer_id',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 1 },
				description: 'Only links for this offer',
			},
		],
	},
];
