import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes } from 'n8n-workflow';

import {
	CONVERSION_STATUS_OPTIONS,
	EVENT_TYPE_OPTIONS,
	EVENT_TYPES,
	ORDER_STATUS_OPTIONS,
} from './constants';
import { birinchishopApiData } from './GenericFunctions';
import { DEFAULT_TOLERANCE_SECONDS, SIGNATURE_HEADER, verifyWebhookSignature } from './signature';

interface RemoteWebhook extends IDataObject {
	id: number;
	url: string;
	kind: string;
	events: string[];
	is_active: boolean;
}

interface Registration {
	id: number;
	secret: string;
}

/** Webhooks this node registered, keyed by the n8n webhook URL (stored in workflow static data). */
function getRegistrations(staticData: IDataObject): Record<string, Registration> {
	const value = staticData.registrations;
	return value && typeof value === 'object' && !Array.isArray(value)
		? { ...(value as unknown as Record<string, Registration>) }
		: {};
}

function sameEvents(a: string[] = [], b: string[] = []): boolean {
	const x = [...new Set(a)].sort();
	const y = [...new Set(b)].sort();
	return x.length === y.length && x.every((v, i) => v === y[i]);
}

function selectedEvents(this: IHookFunctions | IWebhookFunctions): string[] {
	const events = this.getNodeParameter('events', []) as string[];
	return events.length ? events : EVENT_TYPES;
}

/** Decides whether a verified event should start the workflow. Exported for tests. */
export function shouldEmit(event: IDataObject, events: string[], options: IDataObject): boolean {
	const type = String(event.type ?? '');
	if (events.length && !events.includes(type)) return false;
	if (options.ignoreTestEvents === true && event.test === true) return false;
	const data = (event.data ?? {}) as IDataObject;
	const statuses = (options.statuses as string[] | undefined) ?? [];
	if (statuses.length && !statuses.includes(String(data.status ?? ''))) return false;
	const conversions = (options.conversionStatuses as string[] | undefined) ?? [];
	if (conversions.length && !conversions.includes(String(data.conversion_status ?? ''))) {
		return false;
	}
	return true;
}

export class BirinchishopTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Birinchishop Trigger',
		name: 'birinchishopTrigger',
		icon: {
			light: 'file:../../icons/birinchishop.svg',
			dark: 'file:../../icons/birinchishop.dark.svg',
		},
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow when a Birinchishop order is created or changes status',
		defaults: {
			name: 'Birinchishop Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'birinchishopApi',
				required: true,
				displayOptions: { show: { registration: ['automatic'] } },
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Registration',
				name: 'registration',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Automatic',
						value: 'automatic',
						description:
							'The node creates the webhook through the API when the workflow is activated and deletes it when deactivated (key needs the "webhooks:manage" scope)',
					},
					{
						name: 'Manual',
						value: 'manual',
						description:
							'You add the webhook URL in the partner panel (Dashboard → API → Webhooks) and paste its signing secret here',
					},
				],
				default: 'automatic',
			},
			{
				displayName:
					'The webhook URL must be publicly reachable over http(s) on port 80, 443, 8080 or 8443 — a local n8n on port 5678 is rejected by the API. Test keys (bsk_test_...) work too: their webhooks receive signed test events.',
				name: 'automaticNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { registration: ['automatic'] } },
			},
			{
				displayName:
					'Copy the production webhook URL shown above, add it in the partner panel (Dashboard → API → Webhooks, kind "JSON"), and paste the signing secret (whsec_...) that the panel shows once.',
				name: 'manualNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { registration: ['manual'] } },
			},
			{
				displayName: 'Webhook Signing Secret',
				name: 'webhookSecret',
				type: 'string',
				typeOptions: { password: true },
				required: true,
				default: '',
				placeholder: 'e.g. whsec_...',
				displayOptions: { show: { registration: ['manual'] } },
				description: 'Secret used to verify the X-Birinchishop-Signature header of each request',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				options: EVENT_TYPE_OPTIONS,
				default: ['order.created', 'order.status_changed'],
				description: 'Event types that start the workflow',
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Conversion Statuses',
						name: 'conversionStatuses',
						type: 'multiOptions',
						options: CONVERSION_STATUS_OPTIONS,
						default: [],
						description:
							'Start the workflow only for these status groups (e.g. "Sale" = delivered, payout earned). Empty = all.',
					},
					{
						displayName: 'Ignore Test Events',
						name: 'ignoreTestEvents',
						type: 'boolean',
						default: false,
						description:
							'Whether to ignore test events (from test keys, "Set Test Status" or the "Send Test" button)',
					},
					{
						displayName: 'Order Statuses',
						name: 'statuses',
						type: 'multiOptions',
						options: ORDER_STATUS_OPTIONS,
						default: [],
						description:
							'Start the workflow only when the order has one of these statuses. Empty = all.',
					},
					{
						displayName: 'Signature Tolerance (Seconds)',
						name: 'toleranceSeconds',
						type: 'number',
						default: DEFAULT_TOLERANCE_SECONDS,
						typeOptions: { minValue: 30, maxValue: 3600 },
						description:
							'Reject requests whose signed timestamp differs from the n8n server clock by more than this (replay protection)',
					},
				],
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				if (this.getNodeParameter('registration') === 'manual') return true;
				const webhookUrl = this.getNodeWebhookUrl('default');
				if (!webhookUrl) return false;
				const stored = getRegistrations(this.getWorkflowStaticData('node'))[webhookUrl];
				if (!stored?.id || !stored.secret) return false;
				const hooks = (await birinchishopApiData.call(this, 'GET', '/webhooks')) as RemoteWebhook[];
				const hook = hooks.find((h) => h.id === stored.id);
				// Missing, disabled or changed hooks return false: create() then registers a fresh one
				return Boolean(
					hook &&
					hook.url === webhookUrl &&
					hook.kind === 'json' &&
					hook.is_active &&
					sameEvents(hook.events, selectedEvents.call(this)),
				);
			},

			async create(this: IHookFunctions): Promise<boolean> {
				if (this.getNodeParameter('registration') === 'manual') return true;
				const webhookUrl = this.getNodeWebhookUrl('default');
				if (!webhookUrl) return false;
				const staticData = this.getWorkflowStaticData('node');

				// Remove earlier registrations of this exact URL (e.g. after the secret was lost),
				// so the account limit of 10 webhooks is not used up by this node.
				const hooks = (await birinchishopApiData.call(this, 'GET', '/webhooks')) as RemoteWebhook[];
				for (const hook of hooks) {
					if (hook.url !== webhookUrl) continue;
					try {
						await birinchishopApiData.call(this, 'DELETE', `/webhooks/${hook.id}`);
					} catch (error) {
						if (!(error instanceof NodeApiError) || error.httpCode !== '404') {
							throw new NodeApiError(this.getNode(), error as JsonObject);
						}
						this.logger.debug(`Birinchishop webhook ${hook.id} was already deleted`);
					}
				}

				const workflow = this.getWorkflow();
				const description = `n8n: ${workflow.name ?? workflow.id ?? 'workflow'}`.slice(0, 120);
				const created = (await birinchishopApiData.call(this, 'POST', '/webhooks', {
					body: { url: webhookUrl, kind: 'json', events: selectedEvents.call(this), description },
				})) as IDataObject;
				if (!created.id || !created.secret) return false;
				// Keyed by URL: the test URL ("Listen for test event") and the production URL
				// each keep their own webhook and secret.
				staticData.registrations = {
					...getRegistrations(staticData),
					[webhookUrl]: { id: created.id as number, secret: created.secret as string },
				};
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				if (this.getNodeParameter('registration') === 'manual') return true;
				const webhookUrl = this.getNodeWebhookUrl('default');
				const staticData = this.getWorkflowStaticData('node');
				const registrations = getRegistrations(staticData);
				const stored = webhookUrl ? registrations[webhookUrl] : undefined;
				if (stored?.id !== undefined) {
					try {
						await birinchishopApiData.call(this, 'DELETE', `/webhooks/${stored.id}`);
					} catch (error) {
						if (!(error instanceof NodeApiError) || error.httpCode !== '404') {
							this.logger.warn(
								`Could not delete Birinchishop webhook ${stored.id}: ${(error as Error).message}`,
							);
							return false;
						}
						this.logger.debug(`Birinchishop webhook ${stored.id} was already deleted`);
					}
				}
				if (webhookUrl) delete registrations[webhookUrl];
				staticData.registrations = registrations;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const res = this.getResponseObject();
		const registration = this.getNodeParameter('registration') as string;
		const options = this.getNodeParameter('options', {}) as IDataObject;

		const secrets =
			registration === 'manual'
				? [String(this.getNodeParameter('webhookSecret', '') ?? '')].filter(Boolean)
				: Object.values(getRegistrations(this.getWorkflowStaticData('node')))
						.map((r) => r.secret)
						.filter(Boolean);

		if (!req.rawBody && typeof req.readRawBody === 'function') await req.readRawBody();
		const rawBody: Buffer | undefined = req.rawBody;
		const header = this.getHeaderData()[SIGNATURE_HEADER];

		if (!secrets.length || !rawBody) {
			res.status(401).json({ error: 'webhook_not_configured' });
			return { noWebhookResponse: true };
		}

		const toleranceSeconds = Number(options.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS);
		const results = secrets.map((secret) =>
			verifyWebhookSignature(rawBody, header, secret, { toleranceSeconds }),
		);
		if (!results.some((r) => r.valid)) {
			const reason = results.map((r) => (r.valid ? 'valid' : r.reason)).join(',');
			this.logger.debug(`Birinchishop Trigger rejected a request: ${reason}`);
			res.status(401).json({ error: 'invalid_signature' });
			return { noWebhookResponse: true };
		}

		let event: IDataObject;
		try {
			event = JSON.parse(rawBody.toString('utf8')) as IDataObject;
		} catch {
			res.status(400).json({ error: 'invalid_json' });
			return { noWebhookResponse: true };
		}

		const events = this.getNodeParameter('events', []) as string[];
		if (!shouldEmit(event, events, options)) {
			res.status(200).json({ received: true, ignored: true });
			return { noWebhookResponse: true };
		}

		return {
			workflowData: [this.helpers.returnJsonArray(event)],
		};
	}
}
