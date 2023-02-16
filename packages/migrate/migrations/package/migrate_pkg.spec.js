import { test } from 'uvu';
import * as assert from 'uvu/assert';
import { update_pkg_json } from './migrate_pkg.js';

test('Updates package.json', () => {
	const result = update_pkg_json(
		{ package: { dir: 'package', emitTypes: true } },
		{
			name: 'foo',
			version: '1.0.0',
			scripts: {
				packages: 'svelte-package'
			},
			exports: {
				'./ignored': './something.js'
			}
		},
		[
			{
				name: 'foo/Bar.svelte',
				dest: 'foo/Bar.svelte',
				is_exported: true,
				is_included: true,
				is_svelte: true
			},
			{
				name: 'foo/Bar2.svelte',
				dest: 'foo/Bar2.svelte',
				is_exported: false,
				is_included: false,
				is_svelte: true
			},
			{
				name: 'baz.js',
				dest: 'baz.js',
				is_exported: true,
				is_included: true,
				is_svelte: false
			},
			{
				name: 'index.js',
				dest: 'index.js',
				is_exported: true,
				is_included: true,
				is_svelte: false
			},
			{
				name: 'ignored.js',
				dest: 'ignored.js',
				is_exported: true,
				is_included: true,
				is_svelte: false
			}
		]
	);
	assert.equal(JSON.parse(JSON.stringify(result)), {
		name: 'foo',
		version: '1.0.0',
		type: 'module',
		files: ['package'],
		scripts: {
			packages: 'svelte-package -o package'
		},
		exports: {
			'./package.json': './package.json',
			'.': {
				types: './package/index.d.ts',
				svelte: './package/index.js',
				default: './package/index.js'
			},
			'./foo/Bar.svelte': {
				types: './package/foo/Bar.svelte.d.ts',
				svelte: './package/foo/Bar.svelte',
				default: './package/foo/Bar.svelte'
			},
			'./baz': {
				types: './package/baz.d.ts',
				default: './package/baz.js'
			},
			'./ignored': './something.js'
		},
		svelte: './package/index.js'
	});
});

test('Updates package.json #2', () => {
	const result = update_pkg_json(
		{ package: { dir: 'dist', emitTypes: false } },
		{
			name: 'foo',
			version: '1.0.0'
		},
		[
			{
				name: 'foo/Bar.svelte',
				dest: 'foo/Bar.svelte',
				is_exported: true,
				is_included: true,
				is_svelte: true
			},
			{
				name: 'baz.js',
				dest: 'baz.js',
				is_exported: true,
				is_included: true,
				is_svelte: false
			},
			{
				name: 'index.js',
				dest: 'index.js',
				is_exported: true,
				is_included: true,
				is_svelte: false
			}
		]
	);
	assert.equal(JSON.parse(JSON.stringify(result)), {
		name: 'foo',
		version: '1.0.0',
		type: 'module',
		files: ['dist'],
		exports: {
			'./package.json': './package.json',
			'.': {
				svelte: './dist/index.js',
				default: './dist/index.js'
			},
			'./foo/Bar.svelte': {
				svelte: './dist/foo/Bar.svelte',
				default: './dist/foo/Bar.svelte'
			},
			'./baz': './dist/baz.js'
		},
		svelte: './dist/index.js'
	});
});

test.run();
