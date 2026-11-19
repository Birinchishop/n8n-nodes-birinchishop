import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class BirinchishopApi implements ICredentialType {
	name = 'birinchishopApi';

	displayName = 'Birinchishop API';

	icon: Icon = {
		light: 'file:../icons/birinchishop.svg',
		dark: 'file:../icons/birinchishop.dark.svg',
	};

	documentationUrl = 'https://github.com/Birinchishop/n8n-nodes-birinchishop#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'Partner API key from the Birinchishop partner panel (Dashboard → API). Grant only the scopes your workflow needs.',
		},
		{
			displayName:
				'Live keys (bsk_live_...) act on your real account: "Create Order" submits a REAL order that a call center phones. Test keys (bsk_test_...) read real data but never create orders or links, and send signed test events to your webhooks. Use a test key while building and trying workflows. The credential test calls GET /me, so the key needs the "account:read" scope.',
			name: 'keyModeNotice',
			type: 'notice',
			default: '',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: 'https://birinchishop.uz/api/v1',
			url: '/me',
			method: 'GET',
		},
	};
}
