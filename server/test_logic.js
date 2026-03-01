import http from 'http';

const fetchJSON = (url) => new Promise((resolve, reject) => {
    http.get(url, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(JSON.parse(data)));
        res.on('error', reject);
    }).on('error', reject);
});

export const timeToSeconds = (timeStr) => {
    if (typeof timeStr === 'number') return timeStr;
    if (typeof timeStr !== 'string' || !timeStr) return 0;
    const [h, m, s] = timeStr.split(':').map(Number);
    return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
};

async function run() {
    console.log("Fetching trips...");
    const trips = await fetchJSON('http://localhost:3001/api/routes/304/trips');

    // Process trips like SimulationEngine does
    const processedTrips = trips.map(t => {
        const stop_times = (t.stop_times || []).map((st) => ({
            stop_id: st.stop_id,
            stop_sequence: st.stop_sequence,
            arrival_time: timeToSeconds(st.arrival_time),
            departure_time: timeToSeconds(st.departure_time)
        })).sort((a, b) => a.stop_sequence - b.stop_sequence);

        return {
            trip_id: t.trip_id,
            route_id: t.route_id,
            direction_id: t.direction_id,
            start_time: stop_times.length > 0 ? stop_times[0].departure_time : 0,
            end_time: stop_times.length > 0 ? stop_times[stop_times.length - 1].arrival_time : 0,
            stop_times
        };
    }).filter(t => t.stop_times.length > 1);

    processedTrips.sort((a, b) => a.start_time - b.start_time);

    console.log("Processed trips:", processedTrips.length);

    // Chaining logic
    const buses = [];
    let busCounter = 1;
    const unassignedTrips = [...processedTrips];

    while (unassignedTrips.length > 0) {
        const currentTrip = unassignedTrips.shift();
        const busIdStr = busCounter.toString().padStart(4, '0');
        const bus = { id: 'BUS-' + busIdStr, trips: [] };

        bus.trips.push(currentTrip);

        let keepChaining = true;
        while (keepChaining) {
            const lastAssigned = bus.trips[bus.trips.length - 1];
            let bestNextIndex = -1;
            let earliestStart = Infinity;

            for (let i = 0; i < unassignedTrips.length; i++) {
                const candidate = unassignedTrips[i];
                if (candidate.route_id !== currentTrip.route_id) continue;

                // For simplicity, empty travel time = 0 if same stop, 600 if different
                const diffStop = lastAssigned.stop_times[lastAssigned.stop_times.length - 1].stop_id !== candidate.stop_times[0].stop_id;
                const arrivalAtNextStart = lastAssigned.end_time + (diffStop ? 600 : 0);

                if (candidate.start_time >= arrivalAtNextStart) {
                    if (candidate.start_time < earliestStart) {
                        earliestStart = candidate.start_time;
                        bestNextIndex = i;
                    }
                }
            }

            if (bestNextIndex !== -1) {
                bus.trips.push(unassignedTrips.splice(bestNextIndex, 1)[0]);
            } else {
                keepChaining = false;
            }
        }
        buses.push(bus);
        busCounter++;
    }

    console.log("Total buses spawned:", buses.length);
    const bus2 = buses.find(b => b.id === 'BUS-0002');
    if (bus2) {
        console.log("BUS-0002 has", bus2.trips.length, "trips");
        let overlaps = 0;
        for (let i = 0; i < bus2.trips.length - 1; i++) {
            const t1 = bus2.trips[i];
            const t2 = bus2.trips[i + 1];
            const diffStop = t1.stop_times[t1.stop_times.length - 1].stop_id !== t2.stop_times[0].stop_id;
            const limit = t1.end_time + (diffStop ? 600 : 0);
            if (t2.start_time < limit) {
                console.log("OVERLAP FOUND: Trip 1 ends at", t1.end_time, "Trip 2 starts at", t2.start_time);
                overlaps++;
            }
        }
        console.log("Overlaps found:", overlaps);
    }
}
run();
