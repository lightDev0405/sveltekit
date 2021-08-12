---
title: Hooks
---

An optional `src/hooks.js` (or `src/hooks.ts`, or `src/hooks/index.js`) file exports three functions, all optional, that run on the server — **handle**, **getSession**, and **serverFetch**.

> The location of this file can be [configured](#configuration) as `config.kit.files.hooks`

### handle

This function runs on every rendering, for both pages and endpoints, and determines the response. It receives the `request` object and a function called `resolve`, which invokes SvelteKit's router and generates a response accordingly. This allows you to modify response headers or bodies, or bypass SvelteKit entirely (for implementing endpoints programmatically, for example).

If unimplemented, defaults to `({ request, resolve }) => resolve(request)`.

```ts
// handle TypeScript type definitions

type Headers = Record<string, string>;

type Request<Locals = Record<string, any>> = {
	method: string;
	host: string;
	headers: Headers;
	path: string;
	params: Record<string, string>;
	query: URLSearchParams;
	rawBody: string | Uint8Array;
	body: ParameterizedBody<Body>;
	locals: Locals; // populated by hooks handle
};

type Response = {
	status: number;
	headers: Headers;
	body?: string | Uint8Array;
};

type Handle<Locals = Record<string, any>> = (input: {
	request: Request<Locals>;
	resolve: (request: Request<Locals>) => Response | Promise<Response>;
}) => Response | Promise<Response>;
```

To add custom data to the request, which is passed to endpoints, populate the `request.locals` object, as shown below.

```js
/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ request, resolve }) {
	request.locals.user = await getUserInformation(request.headers.cookie);

	const response = await resolve(request);

	return {
		...response,
		headers: {
			...response.headers,
			'x-custom-header': 'potato'
		}
	};
}
```

> `handle` runs when a page is rendered. If a page is prerendered, `handle` will not run again when the user requests the page. If you would like to run some functionality on each request, see the documentation for your [adapter](#adapters).

### getSession

This function takes the `request` object and returns a `session` object that is [accessible on the client](#modules-$app-stores) and therefore must be safe to expose to users. It runs whenever SvelteKit server-renders a page.

If unimplemented, session is `{}`.

```ts
// getSession TypeScript type definition

type GetSession<Locals = Record<string, any>, Session = any> = {
	(request: Request<Locals>): Session | Promise<Session>;
};
```

```js
/** @type {import('@sveltejs/kit').GetSession} */
export function getSession(request) {
	return request.locals.user ? {
		user: {
			// only include properties needed client-side —
			// exclude anything else attached to the user
			// like access tokens etc
			name: request.locals.user.name,
			email: request.locals.user.email,
			avatar: request.locals.user.avatar
		}
	} : {};
}
```

> `session` must be serializable, which means it must not contain things like functions or custom classes, just built-in JavaScript data types

### serverFetch

This function allows you to modify (or replace) a `fetch` request for an **external resource** that happens inside a `load` function that runs on the server (or during pre-rendering).

For example, your `load` function might make a request to a public URL like `https://api.yourapp.com` when the user performs a client-side navigation to the respective page, but during SSR it might make sense to hit the API directly (bypassing whatever proxies and load balancers sit between it and the public internet).

```ts
type ServerFetch = (req: Request) => Promise<Response>;
```

```js
/** @type {import('@sveltejs/kit').ServerFetch} */
export async function serverFetch(request) {
	if (request.url.startsWith('https://api.yourapp.com/')) {
		// clone the original request, but change the URL
		request = new Request(
			request.url.replace('https://api.yourapp.com/', 'http://localhost:9999/'),
			request
		);
	}

	return fetch(request);
}
```
