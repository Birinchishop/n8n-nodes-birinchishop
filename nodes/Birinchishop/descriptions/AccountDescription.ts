import type { INodeProperties } from 'n8n-workflow';

export const accountOperations: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['account'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				description: 'Get the account, balance and API key info (mode live or test, scopes)',
				action: 'Get account',
			},
		],
		default: 'get',
	},
];

export const accountFields: INodeProperties[] = [];
