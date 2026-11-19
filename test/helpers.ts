import { vi } from 'vitest';
import type { IDataObject, INode } from 'n8n-workflow';

export const NODE: INode = {
	id: '6f1c2d3e-0000-4000-8000-000000000001',
	name: 'Birinchishop',
	type: 'n8n-nodes-birinchishop.birinchishop',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

export interface FakeResponse {
	statusCode?: number;
	body: unknown;
	headers?: IDataObject;
}

/** Builds a mocked httpRequestWithAuthentication that returns the queued responses in order. */
export function mockHttp(responses: FakeResponse[]) {
	const queue = [...responses];
	return vi.fn(async (...args: [credentialType: string, options: IDataObject]) => {
		void args;
		const next = queue.shift();
		if (!next) throw new Error('No more mocked responses');
		return { statusCode: next.statusCode ?? 200, headers: next.headers ?? {}, body: next.body };
	});
}

/** Minimal IExecuteFunctions mock: per-item parameters, continueOnFail and the HTTP helper. */
export function executeContext(
	params: IDataObject,
	http: ReturnType<typeof mockHttp>,
	{ items = 1, continueOnFail = false, executionId = 'exec-42' } = {},
) {
	return {
		getInputData: () => Array.from({ length: items }, () => ({ json: {} })),
		getNodeParameter: (name: string, itemIndex: number, fallback?: unknown) => {
			const value = params[name];
			if (typeof value === 'function') return (value as (i: number) => unknown)(itemIndex);
			return value === undefined ? fallback : value;
		},
		getNode: () => NODE,
		getExecutionId: () => executionId,
		continueOnFail: () => continueOnFail,
		helpers: {
			httpRequestWithAuthentication: http,
		},
	};
}

/** Returns the options object of the n-th HTTP call. */
export function callOptions(http: ReturnType<typeof mockHttp>, n = 0): IDataObject {
	return http.mock.calls[n][1] as IDataObject;
}
