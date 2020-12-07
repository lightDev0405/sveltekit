module.exports = {
	kit: {
		// TODO adapterless builds
		adapter: '@sveltejs/adapter-node',

		files: {
			assets: 'public',
			routes: 'source/pages',
			template: 'source/template.html'
		},

		target: '#content-goes-here',

		// this creates `window.start` which starts the app, instead of
		// it starting automatically — allows test runner to control
		// when hydration occurs
		startGlobal: 'start'
	}
};
