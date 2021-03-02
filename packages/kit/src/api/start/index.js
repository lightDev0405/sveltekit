import * as fs from 'fs';
import * as http from 'http';
import { parse, pathToFileURL, URLSearchParams } from 'url';
import sirv from 'sirv';
import { get_body } from '@sveltejs/app-utils/http';
import { join, resolve } from 'path';

const mutable = (dir) =>
	sirv(dir, {
		etag: true,
		maxAge: 0
	});

export async function start({ port, config }) {
	const app_file = resolve('.svelte/output/server/app.js');
	const app = await import(pathToFileURL(app_file));

	const static_handler = fs.existsSync(config.kit.files.assets)
		? mutable(config.kit.files.assets)
		: (_req, _res, next) => next();

	const assets_handler = sirv('.svelte/output/client', {
		maxAge: 31536000,
		immutable: true
	});

	return new Promise((fulfil) => {
		const server = http.createServer((req, res) => {
			const parsed = parse(req.url || '');

			assets_handler(req, res, () => {
				static_handler(req, res, async () => {
					const rendered = await app.render(
						{
							method: req.method,
							headers: req.headers,
							path: parsed.pathname,
							body: await get_body(req),
							query: new URLSearchParams(parsed.query || '')
						},
						{
							paths: {
								base: '',
								assets: '/.'
							},
							get_stack: (error) => error.stack, // TODO should this return a sourcemapped stacktrace?
							get_static_file: (file) => fs.readFileSync(join(config.kit.files.assets, file))
						}
					);

					if (rendered) {
						res.writeHead(rendered.status, rendered.headers);
						res.end(rendered.body);
					} else {
						res.statusCode = 404;
						res.end('Not found');
					}
				});
			});
		});

		server.listen(port, () => {
			fulfil(server);
		});

		return server;
	});
}
