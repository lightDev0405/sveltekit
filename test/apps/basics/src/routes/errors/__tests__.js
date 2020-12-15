import * as assert from 'uvu/assert';

export default function(test, is_dev) {
	if (is_dev) {
		test('client-side errors', async ({ visit, contains, js }) => {
			if (js) {
				try {
					await visit('/errors/clientside');
				} catch (error) {
					assert.ok(/Crashing now/.test(error.message));
				} finally {
					// this is the Snowpack error overlay
					assert.ok(await contains('Custom layout'));
					assert.ok(await contains('Crashing now'));
				}
			}
		});
	}

	test('server-side errors', async ({ visit, contains }) => {
		await visit('/errors/serverside');

		assert.ok(await contains('Custom layout'));
		assert.ok(await contains('Crashing now'));
		assert.ok(await contains('custom error page'));
	});

	test('client-side load errors', async ({ visit, contains, js }) => {
		if (js) {
			await visit('/errors/load-client');

			assert.ok(await contains('Custom layout'));
			assert.ok(await contains('Crashing now'));
			assert.ok(await contains('custom error page'));
		}
	});

	test('server-side load errors', async ({ visit, contains }) => {
		await visit('/errors/load-server');

		assert.ok(await contains('Custom layout'));
		assert.ok(await contains('Crashing now'));
		assert.ok(await contains('custom error page'));
	});

	test('client-side module context errors', async ({ visit, contains, js }) => {
		if (js) {
			await visit('/errors/module-scope-client');

			assert.ok(await contains('Custom layout'));
			assert.ok(await contains('Crashing now'));
			assert.ok(await contains('custom error page'));
		}
	});

	test('server-side module context errors', async ({ visit, contains }) => {
		await visit('/errors/module-scope-server');

		assert.ok(await contains('Custom layout'));
		assert.ok(await contains('Crashing now'));
		assert.ok(await contains('custom error page'));
	});

	test('404', async ({ visit, contains }) => {
		const res = await visit('/why/would/anyone/fetch/this/url');

		assert.ok(await contains('Custom layout'), 'Should show custom layout');
		assert.ok(await contains('custom error page'), 'Should show custom error page');
		assert.equal(res.status(), 404);
	});

	test('invalid route response is handled', async ({ fetch }) => {
		const res = await fetch('/errors/invalid-route-response');

		assert.equal(res.status, 500);
		assert.match(await res.text(), /body is missing/);
	});

	test('unhandled http method', async ({ fetch }) => {
		const res = await fetch('/errors/invalid-route-response', { method: 'PUT' });

		assert.equal(res.status, 501);

		assert.match(await res.text(), /PUT is not implemented/);
	});
}
