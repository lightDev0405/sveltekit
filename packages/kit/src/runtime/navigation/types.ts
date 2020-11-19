import { Page } from '@sveltejs/app-utils';
export { Page, Query, PageContext, Route, RouteParams } from '@sveltejs/app-utils';

export interface HydratedTarget {
	redirect?: Redirect;
	preload_error?: any;
	props: any;
	branch: Branch;
}

export type Branch = Array<{
	segment: string;
	match?: RegExpExecArray;
	component?: any; // TODO DOMComponentConstructor;
	part?: number;
}>;

export interface InitialData {
	session: any;
	preloaded?: object[];
	status: number;
	error: Error;
	baseUrl: string;
}

export interface ScrollPosition {
	x: number;
	y: number;
}

export interface Target {
	href: string;
	route: Route;
	match: RegExpExecArray;
	page: Page;
}

export interface Redirect {
	statusCode: number;
	location: string;
}
