import type { INodeProperties } from 'n8n-workflow';

export const statsOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['stats'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				description:
					'Get orders, approvals, deliveries, earnings and clicks grouped by day, offer or link',
				action: 'Get statistics',
			},
		],
		default: 'get',
	},
];

export const statsFields: INodeProperties[] = [
	{
		displayName: 'Group By',
		name: 'groupBy',
		type: 'options',
		options: [
			{ name: 'Day', value: 'day' },
			{ name: 'Link', value: 'link' },
			{ name: 'Offer', value: 'offer' },
		],
		default: 'day',
		displayOptions: { show: { resource: ['stats'], operation: ['get'] } },
		description: 'How to group the rows. Rows exist only for groups with orders.',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['stats'], operation: ['get'] } },
		options: [
			{
				displayName: 'Date From',
				name: 'date_from',
				type: 'string',
				default: '',
				placeholder: 'e.g. 2026-11-01',
				description: 'First day (YYYY-MM-DD, Asia/Tashkent). Default: 29 days before the end date.',
			},
			{
				displayName: 'Date To',
				name: 'date_to',
				type: 'string',
				default: '',
				placeholder: 'e.g. 2026-11-30',
				description: 'Last day (YYYY-MM-DD, Asia/Tashkent). Default: today.',
			},
			{
				displayName: 'Link ID',
				name: 'link_id',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 1 },
				description: 'Only this link',
			},
			{
				displayName: 'Offer ID',
				name: 'offer_id',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 1 },
				description: 'Only this offer',
			},
		],
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['stats'], operation: ['get'] } },
		options: [
			{
				displayName: 'Split Into Items',
				name: 'splitIntoItems',
				type: 'boolean',
				default: true,
				description:
					'Whether to output one item per row. If off, one item with "rows" and "totals" (including clicks of groups without orders) is returned.',
			},
		],
	},
];
