import devalue from 'devalue';
import fetch, { Response } from 'node-fetch';
import { writable } from 'svelte/store';
import { parse, resolve, URLSearchParams } from 'url';
import { render } from './index';

async function get_response({ request, options, $session, route, status = 200, error }) {
	const host = options.host || request.headers[options.host_header];

	const dependencies = {};

	const serialized_session = try_serialize($session, (err) => {
		throw new Error(`Failed to serialize session data: ${err.message}`);
	});

	const serialized_data = [];

	const match = route && route.pattern.exec(request.path);
	const params = route && route.params(match);

	const page = {
		host,
		path: request.path,
		query: request.query,
		params
	};

	let uses_credentials = false;

	const fetcher = async (url, opts = {}) => {
		const parsed = parse(url);

		if (opts.credentials !== 'omit') {
			uses_credentials = true;
		}

		let response;

		if (parsed.protocol) {
			// external fetch
			response = await fetch(parsed.href, opts);
		} else {
			// otherwise we're dealing with an internal fetch
			const resolved = resolve(request.path, parsed.pathname);

			// is this a request for a static asset?
			const filename = resolved.slice(1);
			const filename_html = `${filename}/index.html`;
			const asset = options.manifest.assets.find(
				(d) => d.file === filename || d.file === filename_html
			);

			if (asset) {
				if (options.get_static_file) {
					response = new Response(options.get_static_file(asset.file), {
						headers: {
							'content-type': asset.type
						}
					});
				} else {
					// TODO we need to know what protocol to use
					response = await fetch(`http://${page.host}/${asset.file}`, opts);
				}
			}

			if (!response) {
				const rendered = await render(
					{
						host: request.host,
						method: opts.method || 'GET',
						headers: opts.headers || {}, // TODO inject credentials...
						path: resolved,
						body: opts.body,
						query: new URLSearchParams(parsed.query || '')
					},
					options
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

		if (response) {
			const clone = response.clone();

			const headers = {};
			clone.headers.forEach((value, key) => {
				if (key !== 'etag') headers[key] = value;
			});

			const payload = JSON.stringify({
				status: clone.status,
				statusText: clone.statusText,
				headers,
				body: await clone.text() // TODO handle binary data
			});

			// TODO i guess we need to sanitize/escape this... somehow?
			serialized_data.push({ url, payload });

			return response;
		}

		return new Response('Not found', {
			status: 404
		});
	};

	const parts = error ? [options.manifest.layout] : [options.manifest.layout, ...route.parts];

	const component_promises = parts.map((loader) => loader());
	const components = [];
	const props_promises = [];

	let context = {};
	let maxage;

	for (let i = 0; i < component_promises.length; i += 1) {
		const mod = await component_promises[i];
		components[i] = mod.default;

		if (options.only_prerender && !mod.prerender) {
			return;
		}

		const loaded =
			mod.load &&
			(await mod.load.call(null, {
				page,
				get session() {
					uses_credentials = true;
					return $session;
				},
				fetch: fetcher,
				context: { ...context }
			}));

		if (loaded) {
			if (loaded.error) {
				const error = new Error(loaded.error.message);
				error.status = loaded.error.status;
				throw error;
			}

			if (loaded.redirect) {
				return {
					status: loaded.redirect.status,
					headers: {
						location: loaded.redirect.to
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

	const props = {
		status,
		error,
		stores: {
			page: writable(null),
			navigating: writable(false),
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

	const rendered = options.root.render(props);
	unsubscribe();

	// TODO all the `route &&` stuff is messy
	const js_deps = route ? route.js : [];
	const css_deps = route ? route.css : [];

	const s = JSON.stringify;

	// TODO strip the AMP stuff out of the build if not relevant
	const links = options.amp
		? `<style amp-custom>${(
				await Promise.all(css_deps.map((dep) => options.get_amp_css(dep)))
		  ).join('\n')}</style>`
		: [
				...js_deps.map((dep) => `<link rel="modulepreload" href="${dep}">`),
				...css_deps.map((dep) => `<link rel="stylesheet" href="${dep}">`)
		  ].join('\n\t\t\t');

	const init = options.amp
		? `
		<style amp-boilerplate>body{-webkit-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-moz-animation:-amp-start 8s steps(1,end) 0s 1 normal both;-ms-animation:-amp-start 8s steps(1,end) 0s 1 normal both;animation:-amp-start 8s steps(1,end) 0s 1 normal both}@-webkit-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-moz-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-ms-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@-o-keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}@keyframes -amp-start{from{visibility:hidden}to{visibility:visible}}</style>
		<noscript><style amp-boilerplate>body{-webkit-animation:none;-moz-animation:none;-ms-animation:none;animation:none}</style></noscript>
		<script async src="https://cdn.ampproject.org/v0.js"></script>`
		: `
		<script type="module">
			import { start } from '${options.paths.assets}/${options.app_dir}/${options.entry}';
			${options.start_global ? `window.${options.start_global} = () => ` : ''}start({
				target: ${options.target ? `document.querySelector(${s(options.target)})` : 'document.body'},
				host: ${host ? s(host) : 'location.host'},
				paths: ${s(options.paths)},
				status: ${status},
				error: ${serialize_error(error)},
				session: ${serialized_session}
			});
		</script>`;

	const head = [rendered.head, links, init].join('\n\n');

	const body = options.amp
		? rendered.html
		: `${rendered.html}

			${serialized_data
				.map(({ url, payload }) => `<script type="svelte-data" url="${url}">${payload}</script>`)
				.join('\n\n\t\t\t')}
		`.replace(/^\t{2}/gm, '');

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

export default async function render_page(request, context, options) {
	const route = options.manifest.pages.find((route) => route.pattern.test(request.path));

	const $session = await (options.setup.getSession && options.setup.getSession(context));

	try {
		if (!route) {
			const error = new Error(`Not found: ${request.path}`);
			error.status = 404;
			throw error;
		}

		return await get_response({
			request,
			options,
			$session,
			route,
			status: 200,
			error: null
		});
	} catch (error) {
		try {
			const status = error.status || 500;

			// TODO sourcemapped stacktrace? https://github.com/sveltejs/kit/pull/266

			return await get_response({
				request,
				options,
				$session,
				route,
				status,
				error
			});
		} catch (error) {
			// oh lawd now you've done it
			return {
				status: 500,
				headers: {},
				body: error.stack, // TODO probably not in prod?
				dependencies: {}
			};
		}
	}
}

function try_serialize(data, fail) {
	try {
		return devalue(data);
	} catch (err) {
		if (fail) fail(err);
		return null;
	}
}

// Ensure we return something truthy so the client will not re-render the page over the error
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
