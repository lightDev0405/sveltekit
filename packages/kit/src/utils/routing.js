/** @param {string} key */
export function parse_route_key(key) {
	/** @type {string[]} */
	const names = [];

	/** @type {string[]} */
	const types = [];

	const pattern =
		key === ''
			? /^\/$/
			: new RegExp(
					`^${decodeURIComponent(key)
						.split('/')
						.map((segment) => {
							// special case — /[...rest]/ could contain zero segments
							const match = /^\[\.\.\.(\w+)(?:=\w+)?\]$/.exec(segment);
							if (match) {
								names.push(match[1]);
								types.push(match[2]);
								return '(?:/(.*))?';
							}

							return (
								'/' +
								segment.replace(/\[(\.\.\.)?(\w+)(?:=(\w+))?\]/g, (m, rest, name, type) => {
									names.push(name);
									types.push(type);
									return rest ? '(.*?)' : '([^/]+?)';
								})
							);
						})
						.join('')}/?$`
			  );

	return { pattern, names, types };
}

/**
 * @param {RegExpMatchArray} match
 * @param {string[]} names
 * @param {string[]} types
 * @param {Record<string, import('types').ParamValidator>} validators
 */
export function exec(match, names, types, validators) {
	/** @type {Record<string, string>} */
	const params = {};

	for (let i = 0; i < names.length; i += 1) {
		const name = names[i];
		const type = types[i];
		const value = match[i + 1] || '';

		if (type) {
			const validator = validators[type];
			if (!validator) throw new Error(`Missing "${type}" param validator`); // TODO do this ahead of time?

			if (!validator(value)) return;
		}

		params[name] = value;
	}

	return params;
}
