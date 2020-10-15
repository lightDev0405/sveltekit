import fs from 'fs';
import path from 'path';
import { parse, resolve } from 'url';
import { render } from '../render';
import { RouteManifest } from '../types';

function mkdirp(dir) {
	try {
		fs.mkdirSync(dir, { recursive: true });
	} catch {}
}

function clean_html(html) {
	return html
		.replace(/<!\[CDATA\[[\s\S]*?\]\]>/gm, '')
		.replace(/(<script[\s\S]*?>)[\s\S]*?<\/script>/gm, '$1</' + 'script>')
		.replace(/(<style[\s\S]*?>)[\s\S]*?<\/style>/gm, '$1</' + 'style>')
		.replace(/<!--[\s\S]*?-->/gm, '');
}

function get_href(attrs) {
	const match = /href\s*=\s*(?:"(.*?)"|'(.*?)'|([^\s>]*))/.exec(attrs);
	return match && (match[1] || match[2] || match[3]);
}

function get_src(attrs) {
	const match = /src\s*=\s*(?:"(.*?)"|'(.*?)'|([^\s>]*))/.exec(attrs);
	return match && (match[1] || match[2] || match[3]);
}

function get_srcset_urls(attrs) {
	const results = [];
	// Note that the srcset allows any ASCII whitespace, including newlines.
	const match = /srcset\s*=\s*(?:"(.*?)"|'(.*?)'|([^\s>]*))/s.exec(attrs);
	if (match) {
		const attr_content = match[1] || match[2] || match[3];
		// Parse the content of the srcset attribute.
		// The regexp is modelled after the srcset specs (https://html.spec.whatwg.org/multipage/images.html#srcset-attribute)
		// and should cover most reasonable cases.
		const regex = /\s*([^\s,]\S+[^\s,])\s*((?:\d+w)|(?:-?\d+(?:\.\d+)?(?:[eE]-?\d+)?x))?/gm;
		let sub_matches;
		while (sub_matches = regex.exec(attr_content)) {
			results.push(sub_matches[1]);
		}
	}
	return results;
}

const OK = 2;
const REDIRECT = 3;

type Logger = {
	(msg: string): void;
	error: (msg: string) => void;
	warn: (msg: string) => void;
	info: (msg: string) => void;
	success: (msg: string) => void;
};

export async function prerender({
	input,
	output,
	manifest,
	force,
	log
}: {
	input: string;
	output: string;
	manifest: RouteManifest;
	force: boolean;
	log: Logger
}) {
	const seen = new Set();

	const template = fs.readFileSync('src/app.html', 'utf-8');
	const client = JSON.parse(fs.readFileSync(`${input}/client.json`, 'utf-8'));

	const server_root = path.resolve(input);
	const App = require(`${server_root}/server/app.js`);

	async function crawl(pathname) {
		if (seen.has(pathname)) return;
		seen.add(pathname);

		const rendered = await render({
			only_prerender: !force,
			template,
			manifest,
			client,
			static_dir: 'static',
			host: null,
			url: pathname,
			App,
			load: route => require(`${server_root}/server/routes/${route.name}.js`),
			dev: false
		});

		if (rendered) {
			const response_type = Math.floor(rendered.status / 100);
			const is_html = rendered.headers['Content-Type'] === 'text/html' || response_type === REDIRECT;

			const parts = pathname.split('/');
			if (is_html && (parts[parts.length - 1] !== 'index.html')) {
				parts.push('index.html');
			}

			const file = `${output}${parts.join('/')}`;
			mkdirp(path.dirname(file));

			if (response_type === REDIRECT) {
				const location = rendered.headers['Location'];

				log.warn(`${rendered.status} ${pathname} -> ${location}`);
				fs.writeFileSync(file, `<script>window.location.href=${JSON.stringify(rendered.headers['Location'])}</script>`);

				return;
			}

			fs.writeFileSync(file, rendered.body); // TODO minify where possible?

			if (response_type === OK) {
				log.info(`${rendered.status} ${pathname}`);
			} else {
				// TODO should this fail the build?
				log.error(`${rendered.status} ${pathname}`);
			}

			if (rendered.dependencies) {
				for (const pathname in rendered.dependencies) {
					const result = rendered.dependencies[pathname];
					const response_type = Math.floor(result.status / 100);

					const is_html = result.headers['Content-Type'] === 'text/html';

					const parts = pathname.split('/');
					if (is_html && (parts[parts.length - 1] !== 'index.html')) {
						parts.push('index.html');
					}

					const file = `${output}${parts.join('/')}`;
					mkdirp(path.dirname(file));

					fs.writeFileSync(file, result.body);

					if (response_type === OK) {
						log.info(`${result.status} ${pathname}`);
					} else {
						log.error(`${result.status} ${pathname}`);
					}
				}
			}

			if (is_html) {
				const cleaned = clean_html(rendered.body);

				let match;
				const pattern = /<(a|img|link|source)\s+([\s\S]+?)>/gm;

				while (match = pattern.exec(cleaned)) {
					let hrefs = [];
					const element = match[1];
					const attrs = match[2];

					if (element === 'a' || element === 'link') {
						hrefs.push(get_href(attrs));
					} else {
						if (element === 'img') {
							hrefs.push(get_src(attrs));
						}
						hrefs.push(...get_srcset_urls(attrs));
					}

					hrefs = hrefs.filter(Boolean);

					for (const href of hrefs) {
						const resolved = resolve(pathname, href);
						if (resolved[0] !== '/') continue;

						const parsed = parse(resolved);

						const parts = parsed.pathname.slice(1).split('/').filter(Boolean);
						if (parts[parts.length - 1] === 'index.html') parts.pop();

						const file = `${output}${parsed.pathname}`;

						if (fs.existsSync(file) || fs.existsSync(`${file}/index.html`)) {
							continue;
						}

						if (parsed.query) {
							// TODO warn that query strings have no effect on statically-exported pages
						}

						await crawl(parsed.pathname);
					}
				}
			}
		}
	}

	const entries = manifest.pages.map(page => page.path).filter(Boolean);

	for (const entry of entries) {
		await crawl(entry);
	}
}