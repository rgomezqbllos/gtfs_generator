import http from 'http';
import fs from 'fs';

const fetchJSON = (url) => new Promise((resolve, reject) => {
    http.get(url, (res) => {
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => resolve(JSON.parse(data)));
        res.on('error', reject);
    }).on('error', reject);
});

const timeToSecs = (timeStr) => {
    if (typeof timeStr === 'number') return timeStr;
    if (typeof timeStr !== 'string' || !timeStr) return 0;
    const parts = timeStr.split(':');
    if (parts.length < 3) return 0;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const s = parseInt(parts[2], 10);
    if (isNaN(h) || isNaN(m) || isNaN(s)) return 0;
    return h * 3600 + m * 60 + s;
};

// Paste SimulationEngine logic exactly as it is in client
class SimulationEngine {
    constructor(trips, segments) {
        this.segments = segments.map(s => ({
            start_node_id: s.start_node_id,
            end_node_id: s.end_node_id,
            travel_time: s.travel_time || 0
        }));

        this.trips = trips.map(t => {
            const stop_times = (t.stop_times || []).map((st) => ({
                stop_id: st.stop_id,
                stop_sequence: st.stop_sequence,
                arrival_time: typeof st.arrival_time === 'string' ? timeToSecs(st.arrival_time) : st.arrival_time,
                departure_time: typeof st.departure_time === 'string' ? timeToSecs(st.departure_time) : st.departure_time
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

        this.trips.sort((a, b) => a.start_time - b.start_time);
    }

    getEmptyTravelTime(startStopId, endStopId) {
        if (startStopId === endStopId) return 0;
        const segment = this.segments.find(s => s.start_node_id === startStopId && s.end_node_id === endStopId);
        return segment ? segment.travel_time : 600;
    }

    calculateLogicalBuses() {
        const buses = [];
        let busCounter = 1;
        const unassignedTrips = [...this.trips];

        while (unassignedTrips.length > 0) {
            const currentTrip = unassignedTrips.shift();

            const busId = `BUS-${busCounter.toString().padStart(4, '0')}`;
            const newBus = {
                bus_id: busId,
                trips: [],
                total_commercial_time: 0,
                total_empty_time: 0
            };

            this.assignTripToBus(newBus, currentTrip);

            let keepChaining = true;
            while (keepChaining) {
                const lastAssigned = newBus.trips[newBus.trips.length - 1];
                let bestNextTripIndex = -1;
                let earliestStartTime = Infinity;

                for (let i = 0; i < unassignedTrips.length; i++) {
                    const candidate = unassignedTrips[i];
                    if (candidate.route_id !== currentTrip.route_id) continue;

                    const emptyTravelTime = this.getEmptyTravelTime(lastAssigned.end_stop_id, candidate.stop_times[0].stop_id);
                    const arrivalAtNextStart = lastAssigned.end_time + emptyTravelTime;

                    if (candidate.start_time >= arrivalAtNextStart) {
                        if (candidate.start_time < earliestStartTime) {
                            earliestStartTime = candidate.start_time;
                            bestNextTripIndex = i;
                        }
                    }
                }

                if (bestNextTripIndex !== -1) {
                    const nextTrip = unassignedTrips.splice(bestNextTripIndex, 1)[0];
                    if (lastAssigned.end_stop_id !== nextTrip.stop_times[0].stop_id) {
                        const emptyTravelTime = this.getEmptyTravelTime(lastAssigned.end_stop_id, nextTrip.stop_times[0].stop_id);
                        newBus.trips.push({
                            type: 'empty',
                            start_stop_id: lastAssigned.end_stop_id,
                            end_stop_id: nextTrip.stop_times[0].stop_id,
                            start_time: lastAssigned.end_time,
                            end_time: lastAssigned.end_time + emptyTravelTime
                        });
                        newBus.total_empty_time += emptyTravelTime;
                    }
                    this.assignTripToBus(newBus, nextTrip);
                } else {
                    keepChaining = false;
                }
            }

            buses.push(newBus);
            busCounter++;
        }
        return buses;
    }

    assignTripToBus(bus, trip) {
        const duration = trip.end_time - trip.start_time;
        bus.trips.push({
            type: 'commercial',
            trip_id: trip.trip_id,
            start_stop_id: trip.stop_times[0].stop_id,
            end_stop_id: trip.stop_times[trip.stop_times.length - 1].stop_id,
            start_time: trip.start_time,
            end_time: trip.end_time
        });
        bus.total_commercial_time += duration;
    }
}

async function check() {
    const rawTrips = await fetchJSON('http://localhost:3001/api/routes/304/trips');
    const allSegments = await fetchJSON('http://localhost:3001/api/segments');
    const fullTripsRaw = rawTrips.filter(t => t.service_id === 'Domingo Janeiro');

    // Simulate what SimulationPanel.tsx does exactly:
    let fullTrips = fullTripsRaw.map(t => ({
        ...t,
        stop_times: (t.stop_times || []).map(st => ({
            ...st,
            arrival_time: typeof st.arrival_time === 'string' ? timeToSecs(st.arrival_time) : st.arrival_time,
            departure_time: typeof st.departure_time === 'string' ? timeToSecs(st.departure_time) : st.departure_time
        }))
    }));

    const engine = new SimulationEngine(fullTrips, allSegments);
    const buses = engine.calculateLogicalBuses();

    console.log("Total buses created: " + buses.length);
    for (const b of buses) {
        console.log(b.bus_id + ": " + b.trips.length + " trips");
        let overlaps = 0;
        let cTrips = b.trips.filter(t => t.type === 'commercial');
        for (let i = 0; i < cTrips.length - 1; i++) {
            if (cTrips[i].end_time > cTrips[i + 1].start_time) overlaps++;
        }
        if (overlaps > 0) console.log("  -> OVERLAPS DETECTED: " + overlaps);
    }
}

check();
