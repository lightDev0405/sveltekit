import { expect } from '@playwright/test';
import { test } from '../../../utils.js';

/** @typedef {import('@playwright/test').Response} Response */

test.skip(({ javaScriptEnabled }) => !javaScriptEnabled);

test.describe.configure({ mode: 'parallel' });

test.describe('beforeNavigate', () => {
	test('prevents navigation triggered by link click', async ({ clicknav, page, baseURL }) => {
		await page.goto('/before-navigate/prevent-navigation');

		try {
			await clicknav('[href="/before-navigate/a"]', { timeout: 1000 });
			expect(false).toBe(true);
		} catch (/** @type {any} */ e) {
			expect(e.message).toMatch('page.waitForNavigation: Timeout 1000ms exceeded');
		}

		expect(page.url()).toBe(baseURL + '/before-navigate/prevent-navigation');
		expect(await page.innerHTML('pre')).toBe('true');
	});

	test('prevents navigation triggered by goto', async ({ page, app, baseURL }) => {
		await page.goto('/before-navigate/prevent-navigation');
		await app.goto('/before-navigate/a');
		expect(page.url()).toBe(baseURL + '/before-navigate/prevent-navigation');
		expect(await page.innerHTML('pre')).toBe('true');
	});

	test('prevents navigation triggered by back button', async ({ page, app, baseURL }) => {
		await page.goto('/before-navigate/a');
		await app.goto('/before-navigate/prevent-navigation');
		await page.click('h1'); // The browsers block attempts to prevent navigation on a frame that's never had a user gesture.

		await page.goBack();
		expect(await page.innerHTML('pre')).toBe('true');
		expect(page.url()).toBe(baseURL + '/before-navigate/prevent-navigation');
	});

	test('prevents unload', async ({ page }) => {
		await page.goto('/before-navigate/prevent-navigation');
		await page.click('h1'); // The browsers block attempts to prevent navigation on a frame that's never had a user gesture.
		const type = new Promise((fulfil) => {
			page.on('dialog', async (dialog) => {
				fulfil(dialog.type());
				await dialog.dismiss();
			});
		});

		await page.close({ runBeforeUnload: true });
		expect(await type).toBe('beforeunload');
	});
});

test.describe('Scrolling', () => {
	test('url-supplied anchor works on direct page load', async ({ page, in_view }) => {
		await page.goto('/anchor/anchor#go-to-element');
		expect(await in_view('#go-to-element')).toBe(true);
	});

	test('url-supplied anchor works on navigation to page', async ({ page, in_view, clicknav }) => {
		await page.goto('/anchor');
		await clicknav('#first-anchor');
		expect(await in_view('#go-to-element')).toBe(true);
	});

	test('url-supplied anchor works when navigated from scrolled page', async ({
		page,
		clicknav,
		in_view
	}) => {
		await page.goto('/anchor');
		await clicknav('#second-anchor');
		expect(await in_view('#go-to-element')).toBe(true);
	});

	test('no-anchor url will scroll to top when navigated from scrolled page', async ({
		page,
		clicknav
	}) => {
		await page.goto('/anchor');
		await clicknav('#third-anchor');
		expect(await page.evaluate(() => scrollY === 0)).toBeTruthy();
	});

	test('url-supplied anchor works when navigated from bottom of page', async ({
		page,
		clicknav,
		in_view
	}) => {
		await page.goto('/anchor');
		await clicknav('#last-anchor');
		expect(await in_view('#go-to-element')).toBe(true);
	});

	test('no-anchor url will scroll to top when navigated from bottom of page', async ({
		clicknav,
		page
	}) => {
		await page.goto('/anchor');
		await clicknav('#last-anchor-2');
		expect(await page.evaluate(() => scrollY === 0)).toBeTruthy();
	});

	test('scroll is restored after hitting the back button', async ({ baseURL, clicknav, page }) => {
		await page.goto('/anchor');
		await page.click('#scroll-anchor');
		const originalScrollY = /** @type {number} */ (await page.evaluate(() => scrollY));
		await clicknav('#routing-page');
		await page.goBack();
		expect(page.url()).toBe(baseURL + '/anchor#last-anchor-2');
		expect(await page.evaluate(() => scrollY)).toEqual(originalScrollY);

		await page.goBack();
		expect(page.url()).toBe(baseURL + '/anchor');
		expect(await page.evaluate(() => scrollY)).toEqual(0);
	});

	test('scroll is restored after hitting the back button for an in-app cross-document navigation', async ({
		page,
		clicknav
	}) => {
		await page.goto('/scroll/cross-document/a');

		const rect = await page.locator('[href="/scroll/cross-document/b"]').boundingBox();
		const height = await page.evaluate(() => innerHeight);
		if (!rect) throw new Error('Could not determine bounding box');

		const target_scroll_y = rect.y + rect.height - height;
		await page.evaluate((y) => scrollTo(0, y), target_scroll_y);

		await page.click('[href="/scroll/cross-document/b"]');
		expect(await page.textContent('h1')).toBe('b');
		await page.waitForSelector('body.started');

		await clicknav('[href="/scroll/cross-document/c"]');
		expect(await page.textContent('h1')).toBe('c');

		await page.goBack(); // client-side back
		await page.goBack(); // native back
		expect(await page.textContent('h1')).toBe('a');
		await page.waitForSelector('body.started');

		await page.waitForTimeout(250); // needed for the test to fail reliably without the fix

		const scroll_y = await page.evaluate(() => scrollY);

		expect(Math.abs(scroll_y - target_scroll_y)).toBeLessThan(50); // we need a few pixels wiggle room, because browsers
	});

	test('url-supplied anchor is ignored with onMount() scrolling on direct page load', async ({
		page,
		in_view
	}) => {
		await page.goto('/anchor-with-manual-scroll/anchor-onmount#go-to-element');
		expect(await in_view('#abcde')).toBe(true);
	});

	test('url-supplied anchor is ignored with afterNavigate() scrolling on direct page load', async ({
		page,
		in_view,
		clicknav
	}) => {
		await page.goto('/anchor-with-manual-scroll/anchor-afternavigate#go-to-element');
		expect(await in_view('#abcde')).toBe(true);

		await clicknav('[href="/anchor-with-manual-scroll/anchor-afternavigate?x=y#go-to-element"]');
		expect(await in_view('#abcde')).toBe(true);
	});

	test('url-supplied anchor is ignored with onMount() scrolling on navigation to page', async ({
		page,
		clicknav,
		javaScriptEnabled,
		in_view
	}) => {
		await page.goto('/anchor-with-manual-scroll');
		await clicknav('[href="/anchor-with-manual-scroll/anchor-onmount#go-to-element"]');
		if (javaScriptEnabled) expect(await in_view('#abcde')).toBe(true);
		else expect(await in_view('#go-to-element')).toBe(true);
	});

	test('app-supplied scroll and focus work on direct page load', async ({ page, in_view }) => {
		await page.goto('/use-action/focus-and-scroll');
		expect(await in_view('#input')).toBe(true);
		await expect(page.locator('#input')).toBeFocused();
	});

	test('app-supplied scroll and focus work on navigation to page', async ({
		page,
		clicknav,
		in_view
	}) => {
		await page.goto('/use-action');
		await clicknav('[href="/use-action/focus-and-scroll"]');
		expect(await in_view('#input')).toBe(true);
		await expect(page.locator('input')).toBeFocused();
	});

	test('scroll positions are recovered on reloading the page', async ({ page, app }) => {
		await page.goto('/anchor');
		await page.evaluate(() => window.scrollTo(0, 1000));
		await app.goto('/anchor/anchor');
		await page.evaluate(() => window.scrollTo(0, 1000));

		await page.reload();
		expect(await page.evaluate(() => window.scrollY)).toBe(1000);

		await page.goBack();
		expect(await page.evaluate(() => window.scrollY)).toBe(1000);
	});

	test('scroll position is top of page on ssr:false reload', async ({ page }) => {
		await page.goto('/no-ssr/margin');
		expect(await page.evaluate(() => window.scrollY)).toBe(0);
		await page.reload();
		expect(await page.evaluate(() => window.scrollY)).toBe(0);
	});
});

test.describe('afterNavigate', () => {
	test('calls callback', async ({ page, clicknav }) => {
		await page.goto('/after-navigate/a');
		expect(await page.textContent('h1')).toBe('undefined -> /after-navigate/a');

		await clicknav('[href="/after-navigate/b"]');
		expect(await page.textContent('h1')).toBe('/after-navigate/a -> /after-navigate/b');
	});
});

test.describe('a11y', () => {
	test('keepfocus works', async ({ page }) => {
		await page.goto('/keepfocus');

		await Promise.all([
			page.type('#input', 'bar'),
			page.waitForFunction(() => window.location.search === '?foo=bar')
		]);
		await expect(page.locator('#input')).toBeFocused();
	});
});

test.describe('CSS', () => {
	test('applies generated component styles (hides announcer)', async ({ page, clicknav }) => {
		await page.goto('/css');
		await clicknav('[href="/css/other"]');

		expect(
			await page.evaluate(() => {
				const el = document.querySelector('#svelte-announcer');
				return el && getComputedStyle(el).position;
			})
		).toBe('absolute');
	});
});

test.describe('Endpoints', () => {
	test('calls a delete handler', async ({ page }) => {
		await page.goto('/delete-route');
		await page.click('.del');
		expect(await page.innerHTML('h1')).toBe('deleted 42');
	});
});

test.describe('Errors', () => {
	test('client-side load errors', async ({ page }) => {
		await page.goto('/errors/load-client');

		expect(await page.textContent('footer')).toBe('Custom layout');
		expect(await page.textContent('#message')).toBe(
			'This is your custom error page saying: "Crashing now"'
		);
	});

	test('client-side module context errors', async ({ page }) => {
		await page.goto('/errors/module-scope-client');

		expect(await page.textContent('footer')).toBe('Custom layout');
		expect(await page.textContent('#message')).toBe(
			'This is your custom error page saying: "Crashing now"'
		);
	});

	test('client-side error from load() is a string', async ({ page }) => {
		await page.goto('/errors/load-error-string-client');

		expect(await page.textContent('footer')).toBe('Custom layout');
		expect(await page.textContent('#message')).toBe(
			'This is your custom error page saying: "Not found"'
		);
		expect(await page.innerHTML('h1')).toBe('555');
	});

	test('client-side error from load() is an Error', async ({ page }) => {
		await page.goto('/errors/load-error-client');

		expect(await page.textContent('footer')).toBe('Custom layout');
		expect(await page.textContent('#message')).toBe(
			'This is your custom error page saying: "Not found"'
		);
		expect(await page.innerHTML('h1')).toBe('555');
	});

	test('client-side error from load() is malformed', async ({ page }) => {
		await page.goto('/errors/load-error-malformed-client');

		const body = await page.textContent('body');

		expect(body).toMatch(
			'"error" property returned from load() must be a string or instance of Error, received type "object"'
		);
	});

	test('client-side 4xx status without error from load()', async ({ page }) => {
		await page.goto('/errors/load-status-without-error-client');

		expect(await page.textContent('footer')).toBe('Custom layout');
		expect(await page.textContent('#message')).toBe('This is your custom error page saying: "401"');
		expect(await page.innerHTML('h1')).toBe('401');
	});
});

test.describe('Load', () => {
	test('load function is only called when necessary', async ({ app, page }) => {
		await page.goto('/load/change-detection/one/a');
		expect(await page.textContent('h1')).toBe('layout loads: 1');
		expect(await page.textContent('h2')).toBe('x: a: 1');

		await app.goto('/load/change-detection/one/a?unused=whatever');
		expect(await page.textContent('h2')).toBe('x: a: 1');

		await app.goto('/load/change-detection/two/b');
		expect(await page.textContent('h2')).toBe('y: b: 1');

		await app.goto('/load/change-detection/one/a');
		expect(await page.textContent('h2')).toBe('x: a: 1');

		await app.goto('/load/change-detection/one/b');
		expect(await page.textContent('h2')).toBe('x: b: 2');

		await app.invalidate('/load/change-detection/data.json');
		expect(await page.textContent('h1')).toBe('layout loads: 2');
		expect(await page.textContent('h2')).toBe('x: b: 2');

		await app.invalidate('/load/change-detection/data.json');
		expect(await page.textContent('h1')).toBe('layout loads: 3');
		expect(await page.textContent('h2')).toBe('x: b: 2');

		await app.invalidate('custom:change-detection-layout');
		expect(await page.textContent('h1')).toBe('layout loads: 4');
		expect(await page.textContent('h2')).toBe('x: b: 2');

		await page.click('button');
		await page.waitForFunction('window.invalidated');
		expect(await page.textContent('h1')).toBe('layout loads: 5');
		expect(await page.textContent('h2')).toBe('x: b: 2');
	});

	test('accessing url.hash from load errors and suggests using page store', async ({ page }) => {
		await page.goto('/load/url-hash#please-dont-send-me-to-load');
		expect(await page.textContent('#message')).toBe(
			'This is your custom error page saying: "url.hash is inaccessible from load. Consider accessing hash from the page store within the script tag of your component."'
		);
	});

	test('url instance methods work in load', async ({ page }) => {
		await page.goto('/load/url-to-string');
		expect(await page.textContent('h1')).toBe("I didn't break!");
	});

	if (process.env.DEV) {
		test('using window.fetch causes a warning', async ({ page }) => {
			const port = 5173;

			/** @type {string[]} */
			const warnings = [];

			page.on('console', (msg) => {
				if (msg.type() === 'warning') {
					warnings.push(msg.text());
				}
			});

			await page.goto('/load/window-fetch/incorrect');
			expect(await page.textContent('h1')).toBe('42');

			expect(warnings).toContain(
				`Loading http://localhost:${port}/load/window-fetch/data.json using \`window.fetch\`. For best results, use the \`fetch\` that is passed to your \`load\` function: https://kit.svelte.dev/docs/loading#input-fetch`
			);

			warnings.length = 0;

			await page.goto('/load/window-fetch/correct');
			expect(await page.textContent('h1')).toBe('42');

			expect(warnings).not.toContain(
				`Loading http://localhost:${port}/load/window-fetch/data.json using \`window.fetch\`. For best results, use the \`fetch\` that is passed to your \`load\` function: https://kit.svelte.dev/docs/loading#input-fetch`
			);
		});
	}
});

test.describe('Page options', () => {
	test('disables router if router=false', async ({ page, clicknav }) => {
		await page.goto('/no-router/a');

		await page.click('button');
		expect(await page.textContent('button')).toBe('clicks: 1');

		await Promise.all([page.waitForNavigation(), page.click('[href="/no-router/b"]')]);
		expect(await page.textContent('button')).toBe('clicks: 0');

		await page.click('button');
		expect(await page.textContent('button')).toBe('clicks: 1');

		await clicknav('[href="/no-router/a"]');
		expect(await page.textContent('button')).toBe('clicks: 1');

		await Promise.all([page.waitForNavigation(), page.click('[href="/no-router/b"]')]);
		expect(await page.textContent('button')).toBe('clicks: 0');
	});

	test('applies generated component styles with ssr=false (hides announcer)', async ({
		page,
		clicknav
	}) => {
		await page.goto('/no-ssr');
		await clicknav('[href="/no-ssr/other"]');

		expect(
			await page.evaluate(() => {
				const el = document.querySelector('#svelte-announcer');
				return el && getComputedStyle(el).position;
			})
		).toBe('absolute');
	});
});

test.describe('Prefetching', () => {
	test('prefetches programmatically', async ({ baseURL, page, app }) => {
		await page.goto('/routing/a');

		/** @type {string[]} */
		let requests = [];
		page.on('request', (r) => requests.push(r.url()));

		// also wait for network processing to complete, see
		// https://playwright.dev/docs/network#network-events
		await Promise.all([
			page.waitForResponse(`${baseURL}/routing/prefetched.json`),
			app.prefetch('/routing/prefetched')
		]);

		// svelte request made is environment dependent
		if (process.env.DEV) {
			expect(requests.filter((req) => req.endsWith('index.svelte')).length).toBe(1);
		} else {
			// the preload helper causes an additional request to be made in Firefox,
			// so we use toBeGreaterThan rather than toBe
			expect(requests.filter((req) => req.endsWith('.js')).length).toBeGreaterThan(0);
		}

		expect(requests.includes(`${baseURL}/routing/prefetched.json`)).toBe(true);

		requests = [];
		await app.goto('/routing/prefetched');
		expect(requests).toEqual([]);

		try {
			await app.prefetch('https://example.com');
			throw new Error('Error was not thrown');
		} catch (/** @type {any} */ e) {
			expect(e.message).toMatch('Attempted to prefetch a URL that does not belong to this app');
		}
	});

	test('chooses correct route when hash route is prefetched but regular route is clicked', async ({
		app,
		page
	}) => {
		await page.goto('/routing/a');
		await app.prefetch('/routing/prefetched/hash-route#please-dont-show-me');
		await app.goto('/routing/prefetched/hash-route');
		await expect(page.locator('h1')).not.toHaveText('Oopsie');
	});

	test('does not rerun load on calls to duplicate preload hash route', async ({ app, page }) => {
		await page.goto('/routing/a');

		await app.prefetch('/routing/prefetched/hash-route#please-dont-show-me');
		await app.prefetch('/routing/prefetched/hash-route#please-dont-show-me');
		await app.goto('/routing/prefetched/hash-route#please-dont-show-me');
		await expect(page.locator('p')).toHaveText('Loaded 1 times.');
	});

	test('does not rerun load on calls to different preload hash route', async ({ app, page }) => {
		await page.goto('/routing/a');

		await app.prefetch('/routing/prefetched/hash-route#please-dont-show-me');
		await app.prefetch('/routing/prefetched/hash-route#please-dont-show-me-jr');
		await app.goto('/routing/prefetched/hash-route#please-dont-show-me');
		await expect(page.locator('p')).toHaveText('Loaded 1 times.');
	});
});

test.describe('Routing', () => {
	test('navigates to a new page without reloading', async ({ app, page, clicknav }) => {
		await page.goto('/routing');

		await app.prefetchRoutes(['/routing/a']).catch((e) => {
			// from error handler tests; ignore
			if (!e.message.includes('Crashing now')) throw e;
		});

		/** @type {string[]} */
		const requests = [];
		page.on('request', (r) => requests.push(r.url()));

		await clicknav('a[href="/routing/a"]');
		expect(await page.textContent('h1')).toBe('a');

		expect(requests).toEqual([]);
	});

	test('navigates programmatically', async ({ page, app }) => {
		await page.goto('/routing/a');
		await app.goto('/routing/b');
		expect(await page.textContent('h1')).toBe('b');
	});

	test('$page.url.hash is correctly set on page load', async ({ page }) => {
		await page.goto('/routing/hashes/pagestore#target');
		expect(await page.textContent('#window-hash')).toBe('#target');
		expect(await page.textContent('#page-url-hash')).toBe('#target');
	});

	test('$page.url.hash is correctly set on navigation', async ({ page }) => {
		await page.goto('/routing/hashes/pagestore');
		expect(await page.textContent('#window-hash')).toBe('');
		expect(await page.textContent('#page-url-hash')).toBe('');
		await page.click('[href="#target"]');
		expect(await page.textContent('#window-hash')).toBe('#target');
		expect(await page.textContent('#page-url-hash')).toBe('#target');
	});
});

test.describe('Shadow DOM', () => {
	test('client router captures anchors in shadow dom', async ({ app, page, clicknav }) => {
		await page.goto('/routing/shadow-dom');

		await app.prefetchRoutes(['/routing/a']).catch((e) => {
			// from error handler tests; ignore
			if (!e.message.includes('Crashing now')) throw e;
		});

		/** @type {string[]} */
		const requests = [];
		page.on('request', (r) => requests.push(r.url()));

		await clicknav('div[id="clickme"]');
		expect(await page.textContent('h1')).toBe('a');

		expect(requests).toEqual([]);
	});
});
