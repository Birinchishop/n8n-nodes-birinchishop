import type {
	IDataObject,
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodePropertyOptions,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	birinchishopApiData,
	birinchishopApiRequest,
	birinchishopApiRequestAllItems,
	birinchishopEventsAll,
	cleanQuery,
	defaultIdempotencyKey,
	sanitizeIdempotencyKey,
	simplifyOrder,
	toApiDate,
} from './GenericFunctions';
import { accountFields, accountOperations } from './descriptions/AccountDescription';
import { eventFields, eventOperations } from './descriptions/EventDescription';
import { linkFields, linkOperations } from './descriptions/LinkDescription';
import { offerFields, offerOperations } from './descriptions/OfferDescription';
import { orderFields, orderOperations } from './descriptions/OrderDescription';
import { statsFields, statsOperations } from './descriptions/StatsDescription';
import { webhookFields, webhookOperations } from './descriptions/WebhookDescription';

/** Numeric filters use 0 as "not set" in the UI. */
function dropZeroIds(qs: IDataObject, keys: string[]): IDataObject {
	const out = { ...qs };
	for (const key of keys) if (out[key] === 0) delete out[key];
	return out;
}

async function runOperation(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	i: number,
): Promise<IDataObject | IDataObject[]> {
	if (resource === 'account' && operation === 'get') {
		return birinchishopApiData.call(this, 'GET', '/me', { itemIndex: i });
	}

	if (resource === 'offer') {
		if (operation === 'get') {
			const offerId = this.getNodeParameter('offerId', i) as number;
			const options = this.getNodeParameter('options', i, {}) as IDataObject;
			return birinchishopApiData.call(this, 'GET', `/offers/${offerId}`, {
				qs: { lang: options.lang },
				itemIndex: i,
			});
		}
		if (operation === 'getAll') {
			const returnAll = this.getNodeParameter('returnAll', i) as boolean;
			const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
			const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
			const sort = this.getNodeParameter('sort', i, {}) as IDataObject;
			const qs: IDataObject = { ...filters, sort: sort.sort };
			if (qs.min_payout === 0) delete qs.min_payout;
			if (qs.min_sale_rate === 0) delete qs.min_sale_rate;
			return birinchishopApiRequestAllItems.call(this, '/offers', qs, limit, i);
		}
	}

	if (resource === 'link') {
		if (operation === 'get') {
			const linkId = this.getNodeParameter('linkId', i) as number;
			return birinchishopApiData.call(this, 'GET', `/links/${linkId}`, { itemIndex: i });
		}
		if (operation === 'getAll') {
			const returnAll = this.getNodeParameter('returnAll', i) as boolean;
			const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
			const filters = dropZeroIds(this.getNodeParameter('filters', i, {}) as IDataObject, [
				'offer_id',
			]);
			return birinchishopApiRequestAllItems.call(this, '/links', filters, limit, i);
		}
		if (operation === 'create') {
			const offerId = this.getNodeParameter('offerId', i) as number;
			const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
			const body: IDataObject = { offer_id: offerId };
			if (additional.name) body.name = additional.name;
			return birinchishopApiData.call(this, 'POST', '/links', { body, itemIndex: i });
		}
	}

	if (resource === 'order') {
		if (operation === 'get') {
			const orderId = this.getNodeParameter('orderId', i) as number;
			const simplify = this.getNodeParameter('simplify', i, false) as boolean;
			const order = (await birinchishopApiData.call(this, 'GET', `/orders/${orderId}`, {
				itemIndex: i,
			})) as IDataObject;
			return simplify ? simplifyOrder(order) : order;
		}
		if (operation === 'getAll') {
			const returnAll = this.getNodeParameter('returnAll', i) as boolean;
			const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
			const simplify = this.getNodeParameter('simplify', i, false) as boolean;
			const filters = dropZeroIds(this.getNodeParameter('filters', i, {}) as IDataObject, [
				'link_id',
				'offer_id',
			]);
			if (filters.date_from !== undefined) filters.date_from = toApiDate(filters.date_from);
			if (filters.date_to !== undefined) filters.date_to = toApiDate(filters.date_to);
			if (filters.updated_since) {
				const d = new Date(String(filters.updated_since));
				if (!Number.isNaN(d.getTime())) filters.updated_since = d.toISOString();
			}
			const orders = await birinchishopApiRequestAllItems.call(this, '/orders', filters, limit, i);
			return simplify ? orders.map(simplifyOrder) : orders;
		}
		if (operation === 'create') {
			const linkId = Number(this.getNodeParameter('linkId', i));
			if (!Number.isInteger(linkId) || linkId < 1) {
				throw new NodeOperationError(this.getNode(), "'Link' must be the ID of one of your links", {
					itemIndex: i,
					description: 'Choose a link from the list, or use Link → Get Many to find its ID.',
				});
			}
			const phone = String(this.getNodeParameter('phone', i) ?? '').trim();
			if (!phone) {
				throw new NodeOperationError(this.getNode(), "'Phone' is empty", {
					itemIndex: i,
					description: 'Map the phone number of the real customer who asked to order.',
				});
			}
			const additional = {
				...(this.getNodeParameter('additionalFields', i, {}) as IDataObject),
			};
			const customKey = String(additional.idempotencyKey ?? '').trim();
			delete additional.idempotencyKey;
			const body: IDataObject = cleanQuery({ ...additional, link_id: linkId, phone });
			for (const key of ['variant_id', 'variant_type_id']) if (body[key] === 0) delete body[key];
			const idempotencyKey = customKey
				? sanitizeIdempotencyKey(customKey)
				: defaultIdempotencyKey(this.getExecutionId(), this.getNode().id, i);
			const response = await birinchishopApiRequest.call(this, 'POST', '/orders', {
				body,
				headers: { 'Idempotency-Key': idempotencyKey },
				itemIndex: i,
			});
			const order = (response.body.data ?? {}) as IDataObject;
			const replayedHeader = response.headers['idempotent-replayed'];
			return {
				...order,
				idempotency_key: idempotencyKey,
				idempotent_replayed: String(replayedHeader ?? '').toLowerCase() === 'true',
			};
		}
		if (operation === 'setTestStatus') {
			const orderId = this.getNodeParameter('orderId', i) as number;
			const status = this.getNodeParameter('status', i) as string;
			return birinchishopApiData.call(this, 'POST', `/sandbox/orders/${orderId}/status`, {
				body: { status },
				itemIndex: i,
			});
		}
	}

	if (resource === 'stats' && operation === 'get') {
		const groupBy = this.getNodeParameter('groupBy', i) as string;
		const filters = dropZeroIds(this.getNodeParameter('filters', i, {}) as IDataObject, [
			'link_id',
			'offer_id',
		]);
		const options = this.getNodeParameter('options', i, {}) as IDataObject;
		if (filters.date_from !== undefined) filters.date_from = toApiDate(filters.date_from);
		if (filters.date_to !== undefined) filters.date_to = toApiDate(filters.date_to);
		const { body } = await birinchishopApiRequest.call(this, 'GET', '/stats', {
			qs: { ...filters, group_by: groupBy },
			itemIndex: i,
		});
		const rows = Array.isArray(body.data) ? (body.data as IDataObject[]) : [];
		if (options.splitIntoItems === false) {
			const meta = (body.meta ?? {}) as IDataObject;
			return { rows, ...meta };
		}
		return rows;
	}

	if (resource === 'event' && operation === 'getAll') {
		const returnAll = this.getNodeParameter('returnAll', i) as boolean;
		const limit = returnAll ? undefined : (this.getNodeParameter('limit', i) as number);
		const filters = this.getNodeParameter('filters', i, {}) as IDataObject;
		return birinchishopEventsAll.call(this, filters, limit, i);
	}

	if (resource === 'webhook') {
		if (operation === 'getAll') {
			return birinchishopApiData.call(this, 'GET', '/webhooks', { itemIndex: i });
		}
		if (operation === 'create') {
			const additional = this.getNodeParameter('additionalFields', i, {}) as IDataObject;
			const body: IDataObject = {
				url: this.getNodeParameter('url', i) as string,
				kind: this.getNodeParameter('kind', i) as string,
				events: this.getNodeParameter('events', i) as string[],
			};
			if (additional.description) body.description = additional.description;
			return birinchishopApiData.call(this, 'POST', '/webhooks', { body, itemIndex: i });
		}
		const webhookId = this.getNodeParameter('webhookId', i) as number;
		if (operation === 'update') {
			const updateFields = this.getNodeParameter('updateFields', i, {}) as IDataObject;
			if (!Object.keys(updateFields).length) {
				throw new NodeOperationError(this.getNode(), 'No fields to update were set', {
					itemIndex: i,
					description: "Add at least one field under 'Update Fields'.",
				});
			}
			return birinchishopApiData.call(this, 'PATCH', `/webhooks/${webhookId}`, {
				body: updateFields,
				itemIndex: i,
			});
		}
		if (operation === 'delete') {
			await birinchishopApiData.call(this, 'DELETE', `/webhooks/${webhookId}`, { itemIndex: i });
			return { deleted: true };
		}
		if (operation === 'test') {
			return birinchishopApiData.call(this, 'POST', `/webhooks/${webhookId}/test`, {
				itemIndex: i,
			});
		}
		if (operation === 'getDeliveries') {
			const limit = this.getNodeParameter('limit', i) as number;
			return birinchishopApiData.call(this, 'GET', `/webhooks/${webhookId}/deliveries`, {
				qs: { limit },
				itemIndex: i,
			});
		}
	}

	throw new NodeOperationError(
		this.getNode(),
		`The operation "${operation}" is not supported for "${resource}"`,
		{ itemIndex: i },
	);
}

export class Birinchishop implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Birinchishop',
		name: 'birinchishop',
		icon: {
			light: 'file:../../icons/birinchishop.svg',
			dark: 'file:../../icons/birinchishop.dark.svg',
		},
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description:
			'Work with offers, tracking links, orders, statistics and events of the Birinchishop partner API',
		defaults: {
			name: 'Birinchishop',
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'birinchishopApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Account', value: 'account' },
					{ name: 'Event', value: 'event' },
					{ name: 'Link', value: 'link' },
					{ name: 'Offer', value: 'offer' },
					{ name: 'Order', value: 'order' },
					{ name: 'Statistic', value: 'stats' },
					{ name: 'Webhook', value: 'webhook' },
				],
				default: 'order',
			},
			...accountOperations,
			...accountFields,
			...eventOperations,
			...eventFields,
			...linkOperations,
			...linkFields,
			...offerOperations,
			...offerFields,
			...orderOperations,
			...orderFields,
			...statsOperations,
			...statsFields,
			...webhookOperations,
			...webhookFields,
		],
	};

	methods = {
		loadOptions: {
			async getLinks(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
				const links = await birinchishopApiRequestAllItems.call(this, '/links', {}, 500);
				return links.map((link) => ({
					name: `${String(link.name ?? 'Link')} — ${String(link.offer_name ?? `offer ${String(link.offer_id)}`)} (#${String(link.id)})`,
					value: link.id as number,
				}));
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		for (let i = 0; i < items.length; i++) {
			try {
				const result = await runOperation.call(this, resource, operation, i);
				const list = Array.isArray(result) ? result : [result];
				for (const json of list) returnData.push({ json, pairedItem: { item: i } });
			} catch (error) {
				if (this.continueOnFail()) {
					const json: IDataObject = { error: (error as Error).message };
					if (error instanceof NodeApiError || error instanceof NodeOperationError) {
						if (error.description) json.description = error.description;
						const ctx = (error.context ?? {}) as IDataObject;
						if (ctx.apiErrorCode !== undefined) json.code = ctx.apiErrorCode;
						if (ctx.requestId !== undefined) json.request_id = ctx.requestId;
						if (ctx.httpCode !== undefined) json.http_code = ctx.httpCode;
						if (ctx.details !== undefined) json.details = ctx.details;
					}
					returnData.push({ json, pairedItem: { item: i } });
					continue;
				}
				if (error instanceof NodeApiError) {
					// Re-wrapping returns the same error object (code and request ID are kept)
					throw new NodeApiError(this.getNode(), error as unknown as JsonObject, { itemIndex: i });
				}
				throw new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
			}
		}

		return [returnData];
	}
}
