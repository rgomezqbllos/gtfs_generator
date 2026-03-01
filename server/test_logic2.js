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

export const secondsToTime = (seconds) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return h.toString().padStart(2, '0') + ':' + m.toString().padStart(2, '0') + ':' + s.toString().padStart(2, '0');
};

async function check() {
    const rawTrips = await fetchJSON('http://localhost:3001/api/routes/304/trips');

    let trips = rawTrips.map(t => {
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

    trips.sort((a, b) => a.start_time - b.start_time);

    const buses = [];
    let counter = 1;
    const unassigned = [...trips];

    const getEmptyTravelTime = (startStopId, endStopId) => {
        if (startStopId === endStopId) return 0;
        return 600; // Mock default
    };

    while (unassigned.length > 0) {
        const currentTrip = unassigned.shift();
        const bus = { bus_id: `BUS -\${ counter.toString().padStart(4, '0') } `, trips: [] };

        const assign = (b, trip) => {
            b.trips.push({
                type: 'commercial',
                trip_id: trip.trip_id,
                start_stop_id: trip.stop_times[0].stop_id,
                end_stop_id: trip.stop_times[trip.stop_times.length - 1].stop_id,
                start_time: trip.start_time,
                end_time: trip.end_time
            });
        };

        assign(bus, currentTrip);

        let keep = true;
        while (keep) {
            const last = bus.trips[bus.trips.length - 1];
            let bestIndex = -1;
            let earliest = Infinity;

            for (let i = 0; i < unassigned.length; i++) {
                const c = unassigned[i];
                if (c.route_id !== currentTrip.route_id) continue;

                const empty = getEmptyTravelTime(last.end_stop_id, c.stop_times[0].stop_id);
                const arrival = last.end_time + empty;

                if (c.start_time >= arrival) {
                    if (c.start_time < earliest) {
                        earliest = c.start_time;
                        bestIndex = i;
                    }
                }
            }

            if (bestIndex !== -1) {
                const nextT = unassigned.splice(bestIndex, 1)[0];
                if (last.end_stop_id !== nextT.stop_times[0].stop_id) {
                    const emptyTime = getEmptyTravelTime(last.end_stop_id, nextT.stop_times[0].stop_id);
                    bus.trips.push({
                        type: 'empty',
                        start_time: last.end_time,
                        end_time: last.end_time + emptyTime,
                        end_stop_id: nextT.stop_times[0].stop_id
                    });
                }
                assign(bus, nextT);
            } else {
                keep = false;
            }
        }

        buses.push(bus);
        counter++;
        if (counter > 2) break; // We only care about the first two buses
    }

    console.log("BUS-0002 commercial trips:");
    if (buses[1]) {
        buses[1].trips.filter(t => t.type === 'commercial').slice(0, 10).forEach(t => {
            console.log(secondsToTime(t.start_time) + " to " + secondsToTime(t.end_time) + " - Trip " + t.trip_id);
        });
    }
}
check();
