
import fetch from 'node-fetch';
import https from 'https';

const OSRM_API_DE = 'https://routing.openstreetmap.de/routed-car/route/v1/driving';
const OSRM_API_HTTP = 'http://router.project-osrm.org/route/v1/driving';

// Zurich
const startZ = [8.541694, 47.376887];
const endZ = [8.541694 + 0.01, 47.376887 + 0.01];

// New York
const startNY = [-74.0060, 40.7128];
const endNY = [-74.0060 + 0.01, 40.7128 + 0.01];

async function testConnection(name: string, urlPattern: string, coords: number[][], options: any) {
    const url = `${urlPattern}/${coords[0][0]},${coords[0][1]};${coords[1][0]},${coords[1][1]}?overview=full&geometries=geojson`;
    console.log(`\n--- Testing ${name} ---`);
    console.log(`URL: ${url}`);
    try {
        const response = await fetch(url, options);
        console.log(`Status: ${response.status} ${response.statusText}`);

        const text = await response.text();
        try {
            const json = JSON.parse(text);
            console.log('JSON Parse Success.');
            if (json.code) console.log('Code:', json.code);
        } catch (e) {
            console.log('Body is NOT valid JSON. content:');
            console.log(text.substring(0, 500));
        }

    } catch (error) {
        console.error('Fetch Error:', error);
    }
}

async function run() {
    const agent = new https.Agent({ rejectUnauthorized: false });
    const headers = { 'User-Agent': 'GTFS-Generator/1.0' };

    // 1. Re-test DE server to see message
    await testConnection('DE Server (Zurich)', OSRM_API_DE, [startZ, endZ], { agent, headers });

    // 2. Test HTTP Main Server (Zurich)
    await testConnection('HTTP Main Server (Zurich)', OSRM_API_HTTP, [startZ, endZ], { headers });

    // 3. Test Main Server (NY Coordinates) - to check if it's purely IP based
    await testConnection('Main Server (NY)', 'https://router.project-osrm.org/route/v1/driving', [startNY, endNY], { agent, headers });
}

run();
