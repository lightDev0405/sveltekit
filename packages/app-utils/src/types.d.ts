import { URLSearchParams } from 'url';

export type Method = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS';

export type Headers = Record<string, string>;

export interface IncomingRequest {
	host: string | null; // TODO is this actually necessary?
	method: Method;
	headers: Headers;
	body: any; // TODO
	path: string;
	query: URLSearchParams;
}

export interface EndpointResponse {
	status: number;
	headers: Headers;
	body: any; // TODO what types can body be?
}

export interface PageResponse extends EndpointResponse {
	dependencies: Record<string, EndpointResponse>;
}

export interface SSRComponentModule {
	default: SSRComponent;
}

export interface SSRComponent {
	render(props: unknown): {
		html: string
		head: string
		css: { code: string, map: unknown };
	}
}

export interface SetupModule<Context = any, Session = any> {
	prepare?: (headers: Headers) => Promise<{ context: Context, headers: Headers }>;
	getSession?: (context: Context) => Promise<Session> | Session;
	setSession?: (context: Context, session: Session) => Promise<Session> | Session;
}

export interface RenderOptions {
	only_prerender: boolean; // TODO this shouldn't really be part of the public API
	static_dir: string;
	template: string;
	manifest: RouteManifest;
	client: ClientManifest;
	root: SSRComponentModule;
	setup: SetupModule;
	load: (route: PageComponentManifest | EndpointManifest) => Promise<any>; // TODO
	dev: boolean; // TODO this is awkward
}

export interface PageComponentManifest {
	default?: boolean;
	type?: string;
	url: string;
	name: string;
	file: string;
}

export interface PageManifest {
	pattern: RegExp;
	path: string;
	parts: Array<{
		component: PageComponentManifest;
		params: string[];
	}>;
}

export interface EndpointManifest {
	name: string;
	pattern: RegExp;
	file: string;
	url: string;
	params: string[];
}

export interface RouteManifest {
	error: PageComponentManifest;
	layout: PageComponentManifest;
	components: PageComponentManifest[];
	pages: PageManifest[];
	endpoints: EndpointManifest[];
}

export interface ClientManifest {
	entry: string;
	deps: Record<string, { js: string[], css: string[] }>
}

export type Loader = (item: PageComponentManifest | EndpointManifest) => Promise<any>; // TODO types for modules
