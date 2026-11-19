import type { INodeProperties } from 'n8n-workflow';

import { EVENT_TYPE_OPTIONS } from '../constants';

export const eventOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['event'] } },
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				description:
					'Read the order events feed (created, status changed) after a cursor; an alternative to webhooks',
				action: 'Get many events',
			},
		],
		default: 'getAll',
	},
];

export const eventFields: INodeProperties[] = [
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['event'], operation: ['getAll'] } },
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		displayOptions: { show: { resource: ['event'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['event'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'After Event ID (Cursor)',
				name: 'after',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0 },
				description:
					'Return events with an ID greater than this. Store the last event ID and pass it next time. Events are kept for 90 days.',
			},
			{
				displayName: 'Include Order',
				name: 'include_order',
				type: 'boolean',
				default: false,
				description: 'Whether to embed the current state of the order in each event',
			},
			{
				displayName: 'Type',
				name: 'type',
				type: 'options',
				options: EVENT_TYPE_OPTIONS,
				default: 'order.status_changed',
				description: 'Only events of this type',
			},
		],
	},
];
