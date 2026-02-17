import fetch from 'node-fetch';
import https from 'https';

// Create an agent that ignores SSL certificate errors (for development/demo purposes)
const agent = new https.Agent({
    rejectUnauthorized: false
});

export async function fetchRoute(start: [number, number], end: [number, number]) {
    const OSRM_API = process.env.OSRM_API_URL || 'https://router.project-osrm.org/route/v1/driving';
    try {
        const url = `${OSRM_API}/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson`;
        console.log(`Fetching OSRM route URL: ${url}`);

        const isHttps = url.startsWith('https');
        const fetchOptions: any = {
            headers: {
                'User-Agent': 'GTFS-Generator/1.0'
            }
        };

        if (isHttps) {
            fetchOptions.agent = new https.Agent({ rejectUnauthorized: false });
        }

        const response = await fetch(url, fetchOptions);

        // Check for common proxy/firewall "200 OK" HTML error pages
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('text/html')) {
            const text = await response.text();
            console.warn(`OSRM likely blocked. Start of response: ${text.substring(0, 100)}...`);
            throw new Error(`OSRM API returned HTML (likely geo-blocked or firewall). Content-Type: ${contentType}`);
        }

        if (!response.ok) {
            throw new Error(`OSRM API error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        if (data.code !== 'Ok') {
            throw new Error(`OSRM API Code: ${data.code} - ${data.message}`);
        }

        if (data.routes && data.routes.length > 0) {
            const route = data.routes[0];
            console.log(`Route found: ${route.distance}m, ${route.duration}s`);
            return {
                distance: route.distance, // meters
                duration: route.duration, // seconds
                geometry: route.geometry // GeoJSON LineString object
            };
        }
    } catch (error) {
        console.error('Error fetching route from OSRM:', error);
        if (error instanceof Error) {
            console.error('Message:', error.message);
            // @ts-ignore
            if (error.cause) console.error('Cause:', error.cause);
            if ('code' in error) console.error('Code:', (error as any).code);
        }
    }
    console.log('Returning null route data (fallback will be used)');
    return null;
}
