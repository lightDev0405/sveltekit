import { IncomingRequest, RenderOptions, EndpointManifest, Headers } from '../types';

export default function render_route(
	request: IncomingRequest,
	context: any,
	options: RenderOptions
): Promise<{
	status: number,
	body: string,
	headers?: Headers
}> {
	const route: EndpointManifest = options.manifest.endpoints.find(route => route.pattern.test(request.path));
	if (!route) return;

	return Promise.resolve(options.load(route)).then(async mod => {
		const handler = mod[request.method.toLowerCase().replace('delete', 'del')]; // 'delete' is a reserved word

		if (handler) {
			const params = {};
			const match = route.pattern.exec(request.path);
			route.params.forEach((name, i) => {
				params[name] = match[i + 1]
			});

			try {
				let {
					status = 200,
					body,
					headers = {}
				} = await handler({
					host: request.host,
					path: request.path,
					query: request.query,
					body: request.body,
					params
				}, context);

				headers = lowercase_keys(headers);

				if (typeof body === 'object' && !('content-type' in headers) || headers['content-type'] === 'application/json') {
					headers = { ...headers, 'content-type': 'application/json' };
					body = JSON.stringify(body);
				}

				return { status, body, headers };
			} catch (err) {
				return {
					status: 500,
					body: err.message
				};
			}
		} else {
			return {
				status: 501,
				body: `${request.method} is not implemented for ${request.path}`
			};
		}
	});
}

function lowercase_keys(obj: Record<string, any>) {
	const clone = {};
	for (const key in obj) {
		clone[key.toLowerCase()] = obj[key];
	}
	return clone;
}