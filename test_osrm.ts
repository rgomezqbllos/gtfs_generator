
import { fetchRoute } from './server/src/services/routing';

async function test() {
    console.log('Testing OSRM Route...');
    // Coordinates for Santiago (from screenshot context or similar)
    // Start: -70.6693, -33.4489 (approx Santiago center)
    // End: -70.6483, -33.4372
    const start: [number, number] = [-70.6693, -33.4489];
    const end: [number, number] = [-70.6483, -33.4372];

    try {
        const result = await fetchRoute(start, end);
        if (result) {
            console.log('Success!', result);
        } else {
            console.log('Failed: No route returned (null).');
        }
    } catch (error) {
        console.error('Error calling fetchRoute:', error);
    }
}

test();
