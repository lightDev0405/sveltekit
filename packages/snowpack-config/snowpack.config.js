// Consult https://www.snowpack.dev to learn about these options
module.exports = {
	install: ['svelte'],
	installOptions: {
		// ignore `import fs from 'fs'` etc
		externalPackage: require('module').builtinModules
	},
	plugins: [
		['@snowpack/plugin-svelte', {
			compilerOptions: {
				hydratable: true
			}
		}]
	],
	devOptions: {
		open: 'none'
	},
	buildOptions: {
		sourceMaps: true
	},
	mount: {
		'.svelte/main': '/_app/main',
		'src/routes': '/_app/routes',
		'src/components': '/_app/components/'
	},
	alias: {
		$components: './src/components'
	}
};