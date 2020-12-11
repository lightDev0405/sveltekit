import Root from 'ROOT'; // eslint-disable-line import/no-unresolved
import { pages, ignore, layout } from 'MANIFEST'; // eslint-disable-line import/no-unresolved
import { Router } from './router';
import { Renderer } from './renderer';
import { init, set_paths } from './singletons';

export async function start({ paths, target, host, session, preloaded, error, status }) {
	const router = new Router({
		base: paths.base,
		host,
		pages,
		ignore
	});

	const renderer = new Renderer({
		Root,
		layout,
		target,
		preloaded,
		error,
		status,
		session
	});

	init({ router, renderer });
	set_paths(paths);

	await router.init({ renderer });
}
