/** @type {import('@sveltejs/kit').RequestHandler} */
export function GET({ params }) {
	return {
		body: {
			name: params.dynamic
		}
	};
}
