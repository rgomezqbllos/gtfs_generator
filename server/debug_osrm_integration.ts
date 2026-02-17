
import { fetchRoute } from './src/services/routing';

// Zurich coordinates
const start = [8.541694, 47.376887];
const end = [8.541694 + 0.01, 47.376887 + 0.01];

async function runTest() {
    console.log('--- Testing OSRM Integration (Default URL) ---');
    // process.env.OSRM_API_URL is undefined, so it uses default

    try {
        const result = await fetchRoute(start, end);
        if (result === null) {
            console.log('SUCCESS: fetchRoute returned null (expected behavior when blocked).');
        } else {
            console.log('SUCCESS: fetchRoute returned a route!');
            console.log(result);
        }
    } catch (e) {
        console.error('FAILURE: fetchRoute threw an error instead of handling it gracefully:', e);
    }

    console.log('\n--- Testing OSRM Integration (Custom URL via Env Var) ---');
    process.env.OSRM_API_URL = 'https://routing.openstreetmap.de/routed-car/route/v1/driving';

    try {
        const result = await fetchRoute(start, end);
        if (result === null) {
            console.log('SUCCESS: fetchRoute returned null (expected behavior when blocked/error).');
        } else {
            console.log('SUCCESS: fetchRoute returned a route!');
            console.log(result);
        }
    } catch (e) {
        console.error('FAILURE: fetchRoute threw an error:', e);
    }
}

runTest();
