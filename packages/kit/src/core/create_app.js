import * as fs from 'fs';
import { stringify, walk, write_if_changed } from '../utils';

export function create_app({ manifest_data, output }) {
	write_if_changed(`${output}/generated/manifest.js`, generate_client_manifest(manifest_data));

	write_if_changed(`${output}/generated/root.svelte`, generate_app(manifest_data));
}

function trim(str) {
	return str.replace(/^\t\t/gm, '').trim();
}

export function create_serviceworker_manifest({
	manifest_data,
	output,
	client_files,
	static_files
}) {
	let files = ['service-worker-index.html'];

	if (fs.existsSync(static_files)) {
		files = files.concat(walk(static_files));
	}

	const code = trim(`
		// This file is generated by @sveltejs/kit — do not edit it!
		export const timestamp = ${Date.now()};

		export const files = [\n\t${files.map((x) => stringify('/' + x)).join(',\n\t')}\n];
		export { files as assets }; // legacy

		export const shell = [\n\t${client_files.map((x) => stringify('/' + x)).join(',\n\t')}\n];

		export const routes = [\n\t${manifest_data.pages
			.map((r) => `{ pattern: ${r.pattern} }`)
			.join(',\n\t')}\n];
	`);

	write_if_changed(`${output}/service-worker.js`, code);
}

function generate_client_manifest(manifest_data) {
	const page_ids = new Set(manifest_data.pages.map((page) => page.pattern.toString()));

	const endpoints_to_ignore = manifest_data.endpoints.filter(
		(route) => !page_ids.has(route.pattern.toString())
	);

	const component_indexes = {};

	const components = `[
		${manifest_data.components
			.map((component, i) => {
				component_indexes[component.name] = i;

				return `() => import(${JSON.stringify(component.url)})`;
			})
			.join(',\n\t\t\t\t')}
	]`.replace(/^\t/gm, '');

	let needs_decode = false;

	let pages = `[
		${manifest_data.pages
			.map(
				(page) => `{
					// ${page.parts[page.parts.length - 1].component.file}
					pattern: ${page.pattern},
					parts: [
						${page.parts
							.map((part) => {
								const missing_layout = !part;
								if (missing_layout) return null;

								if (part.params.length > 0) {
									needs_decode = true;
									const props = part.params.map((param, i) => {
										return param.startsWith('...')
											? `${param.slice(3)}: d(m[${i + 1}]).split('/')`
											: `${param}: d(m[${i + 1}])`;
									});
									return `[components[${
										component_indexes[part.component.name]
									}], m => ({ ${props.join(', ')} })]`;
								}

								return `[components[${component_indexes[part.component.name]}]]`;
							})
							.filter(Boolean)
							.join(',\n\t\t\t\t')}
					]
		}`
			)
			.join(',\n\n\t\t')}
	]`.replace(/^\t/gm, '');

	if (needs_decode) {
		pages = `(d => ${pages})(decodeURIComponent)`;
	}

	return trim(`
		import * as layout from ${JSON.stringify(manifest_data.layout.url)};

		const components = ${components};

		export const pages = ${pages};

		export const ignore = [
			${endpoints_to_ignore.map((route) => route.pattern).join(',\n\t\t\t')}
		];

		export { layout };
	`);
}

function generate_app(manifest_data) {
	// TODO remove default layout altogether

	const max_depth = Math.max(
		...manifest_data.pages.map((page) => page.parts.filter(Boolean).length)
	);

	const levels = [];
	for (let i = 0; i <= max_depth; i += 1) {
		levels.push(i);
	}

	let l = max_depth;

	let pyramid = `<svelte:component this={components[${l}]} {...(props_${l} || {})}/>`;

	while (l-- > 1) {
		pyramid = `
			<svelte:component this={components[${l}]} {...(props_${l} || {})}>
				{#if components[${l + 1}]}
					${pyramid.replace(/\n/g, '\n\t\t\t\t\t')}
				{/if}
			</svelte:component>
		`
			.replace(/^\t\t\t/gm, '')
			.trim();
	}

	return trim(`
		<!-- This file is generated by @sveltejs/kit — do not edit it! -->
		<script>
			import { setContext, afterUpdate } from 'svelte';
			import ErrorComponent from ${JSON.stringify(manifest_data.error.url)};

			// error handling
			export let status = undefined;
			export let error = undefined;

			// stores
			export let stores;
			export let page;

			export let components;
			${levels.map((l) => `export let props_${l} = null;`).join('\n\t\t\t')}

			const Layout = components[0];

			setContext('__svelte__', stores);

			$: stores.page.set(page);
			afterUpdate(stores.page.notify);
		</script>

		<Layout {...(props_0 || {})}>
			{#if error}
				<ErrorComponent {status} {error}/>
			{:else}
				${pyramid.replace(/\n/g, '\n\t\t\t\t')}
			{/if}
		</Layout>
	`);
}
