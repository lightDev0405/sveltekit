import { geoPath } from 'd3-geo';
import { geoSatellite } from 'd3-geo-projection';
import * as topojson from 'topojson-client';
import topology from './land-110m.json';

const land = topojson.feature(topology, topology.objects.land);

const font_size = 36;

/**
 * distance of the satellite observer from the earth
 * https://github.com/d3/d3-geo-projection#satellite_distance
 */
const distance = 8;

const w = 1000;
const h = 1000;

const rad_to_deg = 180 / Math.PI;

const projection = geoSatellite()
	.distance(distance)
	.clipAngle(Math.acos(1 / distance) * rad_to_deg)
	.translate([w / 2, h / 2])
	.scale(450)
	.precision(0.5);

const path = geoPath(projection);

/**
 * @param {number} lat
 * @param {number} lon
 * @param {string} city
 * @param {string} country
 */
function render(lat, lon, city, country) {
	projection.rotate([-lon - 10, -lat + 20, 0]);

	const [x, y] = projection([lon, lat]);

	const sphere = path({ type: 'Sphere' });
	const label = `${city}, ${country}`;

	return `<?xml version="1.0" encoding="UTF-8"?>
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">
			<style>
				path {
					stroke: none;
				}

				.ocean {
					fill: rgb(185,183,172);
				}

				.land {
					fill: white;
				}

				.highlight {
					fill: #ff3e00;
				}

				.dot {
					fill: #ff3e00;
					stroke: white;
					stroke-width: 5;
				}

				@media (prefers-color-scheme: dark) {
					.ocean {
						fill: rgb(120,120,120);
					}

					.land {
						fill: #222;
					}

					.dot {
						stroke: #222;
					}
				}
			</style>

			<path d="${sphere}" class="ocean"/>
			<path d="${path(land)}" class="land"/>

			<g transform="translate(${x},${y})">
				<circle r="20" class="dot"/>
				<rect x="50" y="-30" width="${font_size * 0.6 * label.length + 40}" height="60" class="highlight"/>
				<polygon points="35,0 50,-10 50,10" class="highlight" />
				<text
					x="70"
					fill="white"
					text-anchor="start"
					alignment-baseline="middle"
					dominant-baseline="middle"
					style="font-family: 'Courier', 'Courier New'; font-size: ${font_size}px; font-weight: bold"
				>${label.toUpperCase()}</text>
			</g>
		</svg>
	`;
}

/** @type {import('./$types').RequestHandler} */
export function GET({ request, url }) {
	const q = url.searchParams;
	const h = request.headers;

	const latitude = q.get('lat') ?? h.get('x-vercel-ip-latitude') ?? '40.7';
	const longitude = q.get('lon') ?? h.get('x-vercel-ip-longitude') ?? '-74';
	const city = q.get('city') ?? h.get('x-vercel-ip-city') ?? 'New York City';
	const country = q.get('country') ?? h.get('x-vercel-ip-country') ?? 'USA';

	const svg = render(
		+latitude,
		+longitude,
		decodeURIComponent(city),
		decodeURIComponent(country)
	).replace(/\d\.\d+/g, (match) => match.slice(0, 4));

	return new Response(svg, {
		headers: {
			'content-type': 'image/svg+xml',
			'cache-control': 'private, max-age=3600'
		}
	});
}
