import { find_anchor, get_base_uri } from './utils';

/** @param {MouseEvent} event */
function which(event) {
	return event.which === null ? event.button : event.which;
}

function scroll_state() {
	return {
		x: pageXOffset,
		y: pageYOffset
	};
}

export class Router {
	/** @param {{
	 *    base: string;
	 *    host: string;
	 *    pages: import('../../types').Page[];
	 *    ignore: RegExp[];
	 * }} opts */
	constructor({ base, host, pages, ignore }) {
		this.base = base;
		this.host = host;
		this.pages = pages;
		this.ignore = ignore;

		this.history = window.history || {
			pushState: () => {},
			replaceState: () => {},
			scrollRestoration: 'auto'
		};
	}

	/** @param {import('./renderer').Renderer} renderer */
	init(renderer) {
		/** @type {import('./renderer').Renderer} */
		this.renderer = renderer;
		renderer.router = this;

		if ('scrollRestoration' in this.history) {
			this.history.scrollRestoration = 'manual';
		}

		// Adopted from Nuxt.js
		// Reset scrollRestoration to auto when leaving page, allowing page reload
		// and back-navigation from other pages to use the browser to restore the
		// scrolling position.
		addEventListener('beforeunload', () => {
			this.history.scrollRestoration = 'auto';
		});

		// Setting scrollRestoration to manual again when returning to this page.
		addEventListener('load', () => {
			this.history.scrollRestoration = 'manual';
		});

		// There's no API to capture the scroll location right before the user
		// hits the back/forward button, so we listen for scroll events

		/** @type {NodeJS.Timeout} */
		let scroll_timer;
		addEventListener('scroll', () => {
			clearTimeout(scroll_timer);
			scroll_timer = setTimeout(() => {
				// Store the scroll location in the history
				// This will persist even if we navigate away from the site and come back
				const new_state = {
					...(history.state || {}),
					'sveltekit:scroll': scroll_state()
				};
				history.replaceState(new_state, document.title, window.location.href);
			}, 50);
		});

		/** @param {MouseEvent} event */
		addEventListener('click', (event) => {
			// Adapted from https://github.com/visionmedia/page.js
			// MIT license https://github.com/visionmedia/page.js#license
			if (which(event) !== 1) return;
			if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
			if (event.defaultPrevented) return;

			/** @type {HTMLAnchorElement | SVGAElement} */
			const a = find_anchor(event.target);
			if (!a) return;

			if (!a.href) return;

			// check if link is inside an svg
			// in this case, both href and target are always inside an object
			const svg = typeof a.href === 'object' && a.href.constructor.name === 'SVGAnimatedString';
			const href = String(svg ? a.href.baseVal : a.href);

			if (href === location.href) {
				if (!location.hash) event.preventDefault();
				return;
			}

			// Ignore if tag has
			// 1. 'download' attribute
			// 2. rel='external' attribute
			if (a.hasAttribute('download') || a.getAttribute('rel') === 'external') return;

			// Ignore if <a> has a target
			if (svg ? a.target.baseVal : a.target) return;

			const url = new URL(href);

			// Don't handle hash changes
			if (url.pathname === location.pathname && url.search === location.search) return;

			const selected = this.select(url);
			if (selected) {
				const noscroll = a.hasAttribute('sveltekit:noscroll');
				this.renderer.notify(selected);
				this.history.pushState({}, '', url.href);
				this.navigate(selected, noscroll ? scroll_state() : null, url.hash);
				event.preventDefault();
			}
		});

		addEventListener('popstate', (event) => {
			if (event.state) {
				const url = new URL(location.href);
				const selected = this.select(url);
				if (selected) {
					this.navigate(selected, event.state['sveltekit:scroll']);
				} else {
					// eslint-disable-next-line
					location.href = location.href; // nosonar
				}
			}
		});

		// make it possible to reset focus
		document.body.setAttribute('tabindex', '-1');

		// load current page
		this.history.replaceState({}, '', location.href);

		const selected = this.select(new URL(location.href));
		if (selected) return this.renderer.start(selected);
	}

	/**
	 * @param {URL} url
	 * @returns {import('./types').NavigationTarget}
	 */
	select(url) {
		if (url.origin !== location.origin) return null;
		if (!url.pathname.startsWith(this.base)) return null;

		let path = url.pathname.slice(this.base.length);

		if (path === '') {
			path = '/';
		}

		// avoid accidental clashes between server routes and page routes
		if (this.ignore.some((pattern) => pattern.test(path))) return;

		for (const route of this.pages) {
			const match = route.pattern.exec(path);

			if (match) {
				const query = new URLSearchParams(url.search);
				const params = route.params(match);

				const page = { host: this.host, path, query, params };

				return { href: url.href, route, match, page };
			}
		}
	}

	/**
	 * @param {string} href
	 * @param {{ noscroll?: boolean, replaceState?: boolean }} opts
	 */
	async goto(href, { noscroll = false, replaceState = false } = {}) {
		const url = new URL(href, get_base_uri(document));
		const selected = this.select(url);

		if (selected) {
			this.renderer.notify(selected);

			// TODO shouldn't need to pass the hash here
			this.history[replaceState ? 'replaceState' : 'pushState']({}, '', href);
			return this.navigate(selected, noscroll ? scroll_state() : null, url.hash);
		}

		location.href = href;
		return new Promise(() => {
			/* never resolves */
		});
	}

	/**
	 * @param {*} selected
	 * @param {{ x: number, y: number }} scroll
	 * @param {string} [hash]
	 */
	async navigate(selected, scroll, hash) {
		// remove trailing slashes
		if (location.pathname.endsWith('/') && location.pathname !== '/') {
			history.replaceState({}, '', `${location.pathname.slice(0, -1)}${location.search}`);
		}

		await this.renderer.render(selected);

		document.body.focus();

		const deep_linked = hash && document.getElementById(hash.slice(1));
		if (scroll) {
			scrollTo(scroll.x, scroll.y);
		} else if (deep_linked) {
			// scroll is an element id (from a hash), we need to compute y
			scrollTo(0, deep_linked.getBoundingClientRect().top + scrollY);
		} else {
			scrollTo(0, 0);
		}
	}
}
