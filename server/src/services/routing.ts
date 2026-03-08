import fetch from 'node-fetch';
import https from 'https';

// Create an agent that ignores SSL certificate errors (for development/demo purposes)
const agent = new https.Agent({
    rejectUnauthorized: false
});

export async function fetchRoute(start: [number, number], end: [number, number], routingUrl?: string, profile: string = 'bus_mixed') {
    const PROFILE_PORTS: Record<string, number> = {
        'bus_mixed': 5001,
        'bus_mixed_exclusive': 5002,
        'bus_trunk': 5003
    };
    const profileHostPattern = /-(bus_mixed|bus_mixed_exclusive|bus_trunk)$/;

    let OSRM_API = routingUrl;

    if (!OSRM_API) {
        const base = process.env.OSRM_BASE_URL || 'http://localhost';
        OSRM_API = `${base}:${PROFILE_PORTS[profile]}/route/v1/driving`;
    } else {
        // If the API URL contains 'localhost' or '127.0.0.1', rewrite it using OSRM_BASE_URL
        // This is necessary because the backend runs in a Docker container, while OSRM runs on the host (or mapped to host)
        const baseEnv = process.env.OSRM_BASE_URL;
        if (baseEnv && (OSRM_API.includes('://localhost') || OSRM_API.includes('://127.0.0.1'))) {
            try {
                const baseObj = new URL(baseEnv);
                const apiObj = new URL(OSRM_API);
                apiObj.hostname = baseObj.hostname;
                OSRM_API = apiObj.toString();
            } catch (e) {
                console.warn('Failed to rewrite OSRM URL', e);
            }
        }

        // When running against named OSRM containers on a shared Docker network,
        // switch hostname by profile instead of shifting ports.
        try {
            const apiObj = new URL(OSRM_API);
            if (profileHostPattern.test(apiObj.hostname)) {
                apiObj.hostname = apiObj.hostname.replace(profileHostPattern, `-${profile}`);
                OSRM_API = apiObj.toString();
            } else {
                // Fix: Adjust port based on profile if it's a multi-tenant OSRM URL.
                // We assume the stored URL is for 'bus_mixed' (index 0).
                const profileIndex = ['bus_mixed', 'bus_mixed_exclusive', 'bus_trunk'].indexOf(profile);
                if (profileIndex > 0 && apiObj.port) {
                    const newPort = parseInt(apiObj.port) + profileIndex;
                    apiObj.port = newPort.toString();
                    OSRM_API = apiObj.toString();
                }
            }
        } catch (e) {
            // Keep the original URL if parsing fails.
        }
    }

    try {
        const url = `${OSRM_API}/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson`;
        console.log(`Fetching OSRM route (${profile}) URL: ${url}`);

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
