import devalue from 'devalue';
import fetch, { Response } from 'node-fetch';
import { writable } from 'svelte/store';
import { parse, resolve, URLSearchParams } from 'url';
import { normalize } from '../load.js';
import { ssr } from './index.js';

const s = JSON.stringify;

/**
 * @param {{
 *   request: import('types').Request;
 *   options: import('types.internal').SSRRenderOptions;
 *   $session: any;
 *   route: import('types.internal').SSRPage;
 *   status: number;
 *   error: Error
 * }} opts
 * @returns {Promise<import('types.internal').ResponseWithDependencies>}
 */
async function get_response({ request, options, $session, route, status = 200, error }) {
	/** @type {Record<string, import('types.internal').ResponseWithDependencies>} */
	const dependencies = {};

	const serialized_session = try_serialize($session, (error) => {
		throw new Error(`Failed to serialize session data: ${error.message}`);
	});

	/** @type {Array<{
	 *   url: string;
	 *   json: string;
	 * }>} */
	const serialized_data = [];

	const match = error ? null : route.pattern.exec(request.path);
	const params = error ? {} : route.params(match);

	const page = {
		host: request.host,
		path: request.path,
		query: request.query,
		params
	};

	let uses_credentials = false;

	/**
	 * @param {RequestInfo} resource
	 * @param {RequestInit} opts
	 */
	const fetcher = async (resource, opts = {}) => {
		/** @type {string} */
		let url;

		if (typeof resource === 'string') {
			url = resource;
		} else {
			url = resource.url;

			opts = {
				method: resource.method,
				headers: resource.headers,
				body: resource.body,
				mode: resource.mode,
				credentials: resource.credentials,
				cache: resource.cache,
				redirect: resource.redirect,
				referrer: resource.referrer,
				integrity: resource.integrity,
				...opts
			};
		}

		if (options.local && url.startsWith(options.paths.assets)) {
			// when running `start`, or prerendering, `assets` should be
			// config.kit.paths.assets, but we should still be able to fetch
			// assets directly from `static`
			url = url.replace(options.paths.assets, '');
		}

		const parsed = parse(url);

		let response;

		if (parsed.protocol) {
			// external fetch
			response = await fetch(parsed.href, /** @type {import('node-fetch').RequestInit} */ (opts));
		} else {
			// otherwise we're dealing with an internal fetch
			const resolved = resolve(request.path, parsed.pathname);

			// handle fetch requests for static assets. e.g. prebaked data, etc.
			// we need to support everything the browser's fetch supports
			const filename = resolved.slice(1);
			const filename_html = `${filename}/index.html`; // path may also match path/index.html
			const asset = options.manifest.assets.find(
				(d) => d.file === filename || d.file === filename_html
			);

			if (asset) {
				// we don't have a running server while prerendering because jumping between
				// processes would be inefficient so we have get_static_file instead
				if (options.get_static_file) {
					response = new Response(options.get_static_file(asset.file), {
						headers: {
							'content-type': asset.type
						}
					});
				} else {
					// TODO we need to know what protocol to use
					response = await fetch(
						`http://${page.host}/${asset.file}`,
						/** @type {import('node-fetch').RequestInit} */ (opts)
					);
				}
			}

			if (!response) {
				const headers = /** @type {import('types.internal').Headers} */ ({ ...opts.headers });

				// TODO: fix type https://github.com/node-fetch/node-fetch/issues/1113
				if (opts.credentials !== 'omit') {
					uses_credentials = true;

					headers.cookie = request.headers.cookie;

					if (!headers.authorization) {
						headers.authorization = request.headers.authorization;
					}
				}

				const rendered = await ssr(
					{
						host: request.host,
						method: opts.method || 'GET',
						headers,
						path: resolved,
						body: /** @type {any} */ (opts.body),
						query: new URLSearchParams(parsed.query || '')
					},
					{
						...options,
						fetched: url,
						initiator: route
					}
				);

				if (rendered) {
					// TODO this is primarily for the benefit of the static case,
					// but could it be used elsewhere?
					dependencies[resolved] = rendered;

					response = new Response(rendered.body, {
						status: rendered.status,
						headers: rendered.headers
					});
				}
			}
		}

		if (response && page_config.hydrate) {
			const proxy = new Proxy(response, {
				get(response, key, receiver) {
					async function text() {
						const body = await response.text();

						/** @type {import('types.internal').Headers} */
						const headers = {};
						response.headers.forEach((value, key) => {
							if (key !== 'etag' && key !== 'set-cookie') headers[key] = value;
						});

						// prettier-ignore
						serialized_data.push({
							url,
							json: `{"status":${response.status},"statusText":${s(response.statusText)},"headers":${s(headers)},"body":${escape(body)}}`
						});

						return body;
					}

					if (key === 'text') {
						return text;
					}

					if (key === 'json') {
						return async () => {
							return JSON.parse(await text());
						};
					}

					// TODO arrayBuffer?

					return Reflect.get(response, key, receiver);
				}
			});

			return proxy;
		}

		return (
			response ||
			new Response('Not found', {
				status: 404
			})
		);
	};

	const component_promises = error
		? [options.manifest.layout()]
		: [options.manifest.layout(), ...route.parts.map((part) => part.load())];

	const components = [];
	const props_promises = [];

	let context = {};
	let maxage;

	let page_component;

	try {
		page_component = error
			? { ssr: options.ssr, router: options.router, hydrate: options.hydrate }
			: await component_promises[component_promises.length - 1];
	} catch (e) {
		return await get_response({
			request,
			options,
			$session,
			route: null,
			status: 500,
			error: e instanceof Error ? e : { name: 'Error', message: e.toString() }
		});
	}

	const page_config = {
		ssr: 'ssr' in page_component ? page_component.ssr : options.ssr,
		router: 'router' in page_component ? page_component.router : options.router,
		hydrate: 'hydrate' in page_component ? page_component.hydrate : options.hydrate
	};

	if (options.only_render_prerenderable_pages) {
		if (error) return; // don't prerender an error page

		// if the page has `export const prerender = true`, continue,
		// otherwise bail out at this point
		if (!page_component.prerender) return;
	}

	/** @type {{ head: string, html: string, css: string }} */
	let rendered;

	if (page_config.ssr) {
		for (let i = 0; i < component_promises.length; i += 1) {
			let loaded;

			try {
				const mod = await component_promises[i];
				components[i] = mod.default;

				if (mod.preload) {
					throw new Error(
						'preload has been deprecated in favour of load. Please consult the documentation: https://kit.svelte.dev/docs#loading'
					);
				}

				if (mod.load) {
					loaded = await mod.load.call(null, {
						page,
						get session() {
							uses_credentials = true;
							return $session;
						},
						fetch: fetcher,
						context: { ...context }
					});

					if (!loaded && mod === page_component) return;
				}
			} catch (e) {
				// if load fails when we're already rendering the
				// error page, there's not a lot we can do
				if (error) throw e instanceof Error ? e : new Error(e);

				loaded = {
					error: e instanceof Error ? e : { name: 'Error', message: e.toString() },
					status: 500
				};
			}

			if (loaded) {
				loaded = normalize(loaded);

				// TODO there's some logic that's duplicated in the client runtime,
				// it would be nice to DRY it out if possible
				if (loaded.error) {
					return await get_response({
						request,
						options,
						$session,
						route: null,
						status: loaded.status,
						error: loaded.error
					});
				}

				if (loaded.redirect) {
					return {
						status: loaded.status,
						headers: {
							location: loaded.redirect
						}
					};
				}

				if (loaded.context) {
					context = {
						...context,
						...loaded.context
					};
				}

				maxage = loaded.maxage || 0;

				props_promises[i] = loaded.props;
			}
		}

		const session = writable($session);
		let session_tracking_active = false;
		const unsubscribe = session.subscribe(() => {
			if (session_tracking_active) uses_credentials = true;
		});
		session_tracking_active = true;

		if (error) {
			if (options.dev) {
				error.stack = await options.get_stack(error);
			} else {
				// remove error.stack in production
				error.stack = String(error);
			}
		}

		/** @type {Record<string, any>} */
		const props = {
			status,
			error,
			stores: {
				page: writable(null),
				navigating: writable(null),
				session
			},
			page,
			components
		};

		// leveln (instead of levels[n]) makes it easy to avoid
		// unnecessary updates for layout components
		for (let i = 0; i < props_promises.length; i += 1) {
			props[`props_${i}`] = await props_promises[i];
		}

		try {
			rendered = options.root.render(props);
		} catch (e) {
			if (error) throw e instanceof Error ? e : new Error(e);

			return await get_response({
				request,
				options,
				$session,
				route: null,
				status: 500,
				error: e instanceof Error ? e : { name: 'Error', message: e.toString() }
			});
		}

		unsubscribe();
	} else {
		rendered = {
			head: '',
			html: '',
			css: ''
		};
	}

	// TODO all the `route &&` stuff is messy
	const js_deps = route ? route.js : [];
	const css_deps = route ? route.css : [];
	const style = route ? route.style : '';

	const prefix = `${options.paths.assets}/${options.app_dir}`;

	// TODO strip the AMP stuff out of the build if not relevant
	const links = options.amp
		? `<style amp-custom>${
				style || (await Promise.all(css_deps.map((dep) => options.get_amp_css(dep)))).join('\n')
		  }</style>`
		: [
				...js_deps.map((dep) => `<link rel="modulepreload" href="${prefix}/${dep}">`),
				...css_deps.map((dep) => `<link rel="stylesheet" href="${prefix}/${dep}">`)
		  ].join('\n\t\t\t');

	/** @type {string} */
	let init = '';

	if (options.amp) {
		init = `
		<style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style>
		<noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>
		<script async src="https://cdn.ampproject.org/v0.js"></script>`;
	} else if (page_config.router || page_config.hydrate) {
		// prettier-ignore
		init = `
		<script type="module">
			import { start } from ${s(options.entry)};
			start({
				target: ${options.target ? `document.querySelector(${s(options.target)})` : 'document.body'},
				paths: ${s(options.paths)},
				session: ${serialized_session},
				host: ${request.host ? s(request.host) : 'location.host'},
				route: ${!!page_config.router},
				hydrate: ${page_config.hydrate? `{
					status: ${status},
					error: ${serialize_error(error)},
					nodes: ${route ? `[
						${(route ? route.parts : [])
						.map((part) => `import(${s(options.get_component_path(part.id))})`)
						.join(',\n\t\t\t\t\t\t')}
					]` : '[]'},
					page: {
						host: ${request.host ? s(request.host) : 'location.host'}, // TODO this is redundant
						path: ${s(request.path)},
						query: new URLSearchParams(${s(request.query.toString())}),
						params: ${s(params)}
					}
				}` : 'null'}
			});
		</script>`;
	}

	const head = [
		rendered.head,
		style && !options.amp ? `<style data-svelte>${style}</style>` : '',
		links,
		init
	].join('\n\n');

	const body = options.amp
		? rendered.html
		: `${rendered.html}

			${serialized_data
				.map(({ url, json }) => `<script type="svelte-data" url="${url}">${json}</script>`)
				.join('\n\n\t\t\t')}
		`.replace(/^\t{2}/gm, '');

	/** @type {import('types.internal').Headers} */
	const headers = {
		'content-type': 'text/html'
	};

	if (maxage) {
		headers['cache-control'] = `${uses_credentials ? 'private' : 'public'}, max-age=${maxage}`;
	}

	return {
		status,
		headers,
		body: options.template({ head, body }),
		dependencies
	};
}

/**
 * @param {import('types').Request} request
 * @param {import('types.internal').SSRPage} route
 * @param {import('types.internal').SSRRenderOptions} options
 * @returns {Promise<import('types.internal').ResponseWithDependencies>}
 */
export default async function render_page(request, route, options) {
	if (options.initiator === route) {
		// infinite request cycle detected
		return {
			status: 404,
			headers: {},
			body: `Not found: ${request.path}`
		};
	}

	const $session = await options.hooks.getSession({ context: request.context });

	const response = await get_response({
		request,
		options,
		$session,
		route,
		status: route ? 200 : 404,
		error: route ? null : new Error(`Not found: ${request.path}`)
	});

	if (response) {
		return response;
	}

	if (options.fetched) {
		// we came here because of a bad request in a `load` function.
		// rather than render the error page — which could lead to an
		// infinite loop, if the `load` belonged to the root layout,
		// we respond with a bare-bones 500
		return {
			status: 500,
			headers: {},
			body: `Bad request in load function: failed to fetch ${options.fetched}`
		};
	}
}

/**
 * @param {any} data
 * @param {(error: Error) => void} [fail]
 */
function try_serialize(data, fail) {
	try {
		return devalue(data);
	} catch (err) {
		if (fail) fail(err);
		return null;
	}
}

// Ensure we return something truthy so the client will not re-render the page over the error

/** @param {Error} error */
function serialize_error(error) {
	if (!error) return null;
	let serialized = try_serialize(error);
	if (!serialized) {
		const { name, message, stack } = error;
		serialized = try_serialize({ name, message, stack });
	}
	if (!serialized) {
		serialized = '{}';
	}
	return serialized;
}

/** @type {Record<string, string>} */
const escaped = {
	'<': '\\u003C',
	'>': '\\u003E',
	'/': '\\u002F',
	'\\': '\\\\',
	'\b': '\\b',
	'\f': '\\f',
	'\n': '\\n',
	'\r': '\\r',
	'\t': '\\t',
	'\0': '\\0',
	'\u2028': '\\u2028',
	'\u2029': '\\u2029'
};

/** @param {string} str */
function escape(str) {
	let result = '"';

	for (let i = 0; i < str.length; i += 1) {
		const char = str.charAt(i);
		const code = char.charCodeAt(0);

		if (char === '"') {
			result += '\\"';
		} else if (char in escaped) {
			result += escaped[char];
		} else if (code >= 0xd800 && code <= 0xdfff) {
			const next = str.charCodeAt(i + 1);

			// If this is the beginning of a [high, low] surrogate pair,
			// add the next two characters, otherwise escape
			if (code <= 0xdbff && next >= 0xdc00 && next <= 0xdfff) {
				result += char + str[++i];
			} else {
				result += `\\u${code.toString(16).toUpperCase()}`;
			}
		} else {
			result += char;
		}
	}

	result += '"';
	return result;
}
