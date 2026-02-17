
import fetch from 'node-fetch';
import https from 'https';

const OSRM_API = 'https://router.project-osrm.org/route/v1/driving';

const agent = new https.Agent({
    rejectUnauthorized: false
});

async function testOSRM() {
    console.log('Testing OSRM Connectivity...');

    // Coordinates for a known short route (e.g., in San Francisco)
    // Coit Tower to Ferry Building
    const start = [-122.4058, 37.8024]; // Lon, Lat
    const end = [-122.3934, 37.7955];   // Lon, Lat

    const url = `${OSRM_API}/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson`;
    console.log(`Request URL: ${url}`);

    try {
        const response = await fetch(url, { agent });
        console.log(`Response Status: ${response.status} ${response.statusText}`);

        const text = await response.text();
        console.log('Response Body Preview:', text.substring(0, 500));

        if (!response.ok) {
            console.error('Error Response Body:', text);
            return;
        }

        try {
            const data = JSON.parse(text);
            console.log('Response Data Keys:', Object.keys(data));

            if (data.code !== 'Ok') {
                console.error('OSRM Code:', data.code);
                console.error('Message:', data.message);
            } else {
                console.log('OSRM Test PASSED.');
                if (data.routes && data.routes.length > 0) {
                    console.log('Route found!');
                    console.log('Distance:', data.routes[0].distance, 'meters');
                    console.log('Duration:', data.routes[0].duration, 'seconds');
                    console.log('Geometry Type:', data.routes[0].geometry.type);
                } else {
                    console.warn('No routes array in response.');
                }
            }

        } catch (e) {
            console.error('Failed to parse JSON response:', e);
        }

    } catch (error) {
        console.error('Fetch failed:', error);
    }
}

testOSRM();
