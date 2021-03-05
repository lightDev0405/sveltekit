import * as assert from 'uvu/assert';

export default function (test) {
	test('static files', async ({ fetch }) => {
		let res = await fetch('/static.json');
		assert.equal(await res.json(), 'static file');

		res = await fetch('/subdirectory/static.json');
		assert.equal(await res.json(), 'subdirectory file');
	});
}
