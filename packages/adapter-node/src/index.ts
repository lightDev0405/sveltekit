import fs from 'fs';
import { RouteManifest } from '@sveltejs/app-utils';
import { copy } from '@sveltejs/app-utils/files';
import { prerender } from '@sveltejs/app-utils/renderer';
import { Logger } from '@sveltejs/app-utils/renderer/prerender';

module.exports = async function adapter({
	dir,
	manifest,
	log
}: {
	dir: string;
	manifest: RouteManifest;
	log: Logger;
}) {
	const out = 'build'; // TODO implement adapter options

	copy(`${dir}/client`, `${out}/assets/_app`, (file) => !!file && file[0] !== '.');
	copy(`${dir}/server`, out);
	copy(`${__dirname}/server.js`, `${out}/index.js`);
	copy(`${dir}/client.json`, `${out}/client.json`);
	copy('src/app.html', `${out}/app.html`);

	log.info('Prerendering static pages...');

	await prerender({
		force: true,
		dir,
		out: `${out}/prerendered`,
		assets: `${out}/assets`,
		manifest,
		log
	});

	// generate manifest
	const written_manifest = `module.exports = {
		layout: ${JSON.stringify(manifest.layout)},
		error: ${JSON.stringify(manifest.error)},
		components: ${JSON.stringify(manifest.components)},
		pages: [
			${manifest.pages
				.map((page) => `{ pattern: ${page.pattern}, parts: ${JSON.stringify(page.parts)} }`)
				.join(',\n\t\t\t')}
		],
		endpoints: [
			${manifest.endpoints
				.map(
					(route) =>
						`{ name: '${route.name}', pattern: ${route.pattern}, file: '${
							route.file
						}', params: ${JSON.stringify(route.params)} }`
				)
				.join(',\n\t\t\t')}
		]
	};`.replace(/^\t/gm, '');

	fs.writeFileSync(`${out}/manifest.js`, written_manifest);
};
