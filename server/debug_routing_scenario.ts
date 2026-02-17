
import fetch from 'node-fetch';


const API_URL = 'http://localhost:3000/api';
// Use local OSRM container for Bogota
process.env.OSRM_API_URL = 'http://localhost:5001/route/v1/driving';

async function runTest() {
    console.log("=== STARTING ROUTING SCENARIO TEST (BOGOTA) ===");

    // 1. Create two stops in Bogota
    // Stop A: Plaza de Bolívar
    // Stop B: Museo Nacional
    const stopA = {
        stop_name: "Test Stop A (Plaza de Bolívar)",
        stop_lat: 4.5981,
        stop_lon: -74.0760,
        node_type: "Test"
    };

    const stopB = {
        stop_name: "Test Stop B (Museo Nacional)",
        stop_lat: 4.6152,
        stop_lon: -74.0691,
        node_type: "Test"
    };

    // Helper to create stop
    async function createStop(stop: any) {
        const res = await fetch(`${API_URL}/stops`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(stop)
        });
        if (!res.ok) throw new Error(`Failed to create stop: ${res.statusText}`);
        return await res.json();
    }

    try {
        console.log("Creating Test Stops...");
        const createdA = await createStop(stopA);
        const createdB = await createStop(stopB);
        console.log(`Created Stop A: ${createdA.stop_id}`);
        console.log(`Created Stop B: ${createdB.stop_id}`);

        // 2. Create Segment between them
        console.log("Creating Segment (requesting OSRM route)...");
        const segmentRes = await fetch(`${API_URL}/segments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start_node_id: createdA.stop_id,
                end_node_id: createdB.stop_id
            })
        });

        if (!segmentRes.ok) {
            const err = await segmentRes.json();
            throw new Error(`Failed to create segment: ${JSON.stringify(err)}`);
        }

        const segment = await segmentRes.json();
        console.log("Segment Created:", segment.segment_id);

        // 3. Verify Details
        console.log(`Distance: ${segment.distance} meters`);
        console.log(`Travel Time: ${segment.travel_time} seconds`);

        if (segment.distance <= 0) console.error("FAIL: Distance should be > 0");
        else console.log("PASS: Distance > 0");

        if (segment.travel_time <= 0) console.error("FAIL: Time should be > 0");
        else console.log("PASS: Time > 0");

        let geometry;
        try {
            geometry = JSON.parse(segment.geometry);
            console.log("Geometry Type:", geometry.type);
            console.log("Coordinates Count:", geometry.coordinates.length);

            if (geometry.coordinates.length > 2) {
                console.log("PASS: Geometry has intermediate points (likely follows road)");
            } else {
                console.warn("WARNING: Geometry only has 2 points (straight line fallback?)");
            }
        } catch (e) {
            console.error("FAIL: Invalid Geometry JSON");
        }

        // Cleanup (Optional, but good for repeatable tests)
        console.log("Cleaning up...");
        await fetch(`${API_URL}/segments/${segment.segment_id}`, { method: 'DELETE' });
        await fetch(`${API_URL}/stops/${createdA.stop_id}`, { method: 'DELETE' });
        await fetch(`${API_URL}/stops/${createdB.stop_id}`, { method: 'DELETE' });
        console.log("Cleanup complete.");

    } catch (err) {
        console.error("TEST FAILED:", err);
        process.exit(1);
    }
}

runTest();
