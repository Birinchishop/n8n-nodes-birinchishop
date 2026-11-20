import type { INodeProperties } from 'n8n-workflow';

import { LANGUAGE_OPTIONS, OFFER_SORT_OPTIONS } from '../constants';

export const offerOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['offer'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Get an offer with its variants, description, images and your links',
				action: 'Get an offer',
			},
			{
				name: 'Get Many',
				value: 'getAll',
				description: 'Search active offers by name, payout, sale rate and stock',
				action: 'Get many offers',
			},
		],
		default: 'getAll',
	},
];

const languageField: INodeProperties = {
	displayName: 'Language',
	name: 'lang',
	type: 'options',
	options: LANGUAGE_OPTIONS,
	default: 'uz',
	description: 'Language of the offer name and description. Translations fall back to Uzbek.',
};

export const offerFields: INodeProperties[] = [
	{
		displayName: 'Offer ID',
		name: 'offerId',
		type: 'number',
		required: true,
		default: 0,
		typeOptions: { minValue: 1 },
		displayOptions: { show: { resource: ['offer'], operation: ['get'] } },
		description: 'ID of the offer',
	},
	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: { resource: ['offer'], operation: ['get'] } },
		options: [languageField],
	},
	{
		displayName: 'Return All',
		name: 'returnAll',
		type: 'boolean',
		default: false,
		displayOptions: { show: { resource: ['offer'], operation: ['getAll'] } },
		description: 'Whether to return all results or only up to a given limit',
	},
	{
		displayName: 'Limit',
		name: 'limit',
		type: 'number',
		default: 50,
		typeOptions: { minValue: 1 },
		displayOptions: { show: { resource: ['offer'], operation: ['getAll'], returnAll: [false] } },
		description: 'Max number of results to return',
	},
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['offer'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'In Stock Only',
				name: 'in_stock_only',
				type: 'boolean',
				default: true,
				description: 'Whether to return only offers with stock above zero',
			},
			languageField,
			{
				displayName: 'Minimum Payout',
				name: 'min_payout',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0 },
				description: 'Minimum payout per delivered order, in UZS',
			},
			{
				displayName: 'Minimum Sale Rate (%)',
				name: 'min_sale_rate',
				type: 'number',
				default: 0,
				typeOptions: { minValue: 0, maxValue: 100 },
				description:
					'Minimum share of finished orders that were delivered over the last 60 days (0-100)',
			},
			{
				displayName: 'Offer IDs',
				name: 'ids',
				type: 'string',
				default: '',
				placeholder: 'e.g. 101,102,103',
				description: 'Comma-separated offer IDs (max 100)',
			},
			{
				displayName: 'Search',
				name: 'search',
				type: 'string',
				default: '',
				placeholder: 'e.g. soat',
				description:
					'Product search. Offer names are in Uzbek and Russian, so use keywords in those languages (for example "soat" or "часы" for a watch, not "watch"); synonyms and typos are tolerated.',
			},
		],
	},
	{
		displayName: 'Sort',
		name: 'sort',
		type: 'collection',
		placeholder: 'Add Sort',
		default: {},
		displayOptions: { show: { resource: ['offer'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Sort By',
				name: 'sort',
				type: 'options',
				options: OFFER_SORT_OPTIONS,
				default: 'recommended',
				description: 'Order of the results. Without it, a search is ordered by relevance.',
			},
		],
	},
];
