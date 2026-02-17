
const Database = require('better-sqlite3');
const AdmZip = require('adm-zip');
const fs = require('fs');

const db = new Database('gtfs.db', { verbose: console.log });

async function runExport() {
    console.log('Starting export simulation...');

    try {
        // Mock params (export everything)
        // User said "unica ruta", so maybe they selecting specific route?
        // Let's try fetching all routes first.

        let agencyQuery = 'SELECT * FROM agency';
        const agencies = db.prepare(agencyQuery).all();
        const finalAgencyIds = agencies.map(a => a.agency_id);
        console.log('Agencies:', finalAgencyIds.length);

        if (finalAgencyIds.length === 0) {
            console.log('No agencies found');
            return;
        }

        let routesQuery = `SELECT * FROM routes WHERE agency_id IN (${finalAgencyIds.map(() => '?').join(',')})`;
        const routes = db.prepare(routesQuery).all(...finalAgencyIds);
        const finalRouteIds = routes.map(r => r.route_id);
        console.log('Routes:', finalRouteIds.length);

        let calendarQuery = 'SELECT * FROM calendar';
        const calendars = db.prepare(calendarQuery).all();
        const finalServiceIds = calendars.map(c => c.service_id);
        console.log('Services:', finalServiceIds.length);

        let trips = [];
        if (finalRouteIds.length > 0 && finalServiceIds.length > 0) {
            const routePh = finalRouteIds.map(() => '?').join(',');
            const servicePh = finalServiceIds.map(() => '?').join(',');

            trips = db.prepare(`
                SELECT * FROM trips 
                WHERE route_id IN (${routePh}) 
                AND service_id IN (${servicePh})
            `).all(...finalRouteIds, ...finalServiceIds);
        }
        const finalTripIds = trips.map(t => t.trip_id);
        console.log('Trips:', finalTripIds.length);

        let stopTimes = [];
        if (finalTripIds.length > 0) {
            const tripPh = finalTripIds.map(() => '?').join(',');
            stopTimes = db.prepare(`SELECT * FROM stop_times WHERE trip_id IN (${tripPh}) ORDER BY trip_id, stop_sequence`).all(...finalTripIds);
        }
        console.log('StopTimes:', stopTimes.length);

        let stops = [];
        const usedStopIds = [...new Set(stopTimes.map(st => st.stop_id))];
        if (usedStopIds.length > 0) {
            const stopPh = usedStopIds.map(() => '?').join(',');
            stops = db.prepare(`SELECT * FROM stops WHERE stop_id IN (${stopPh})`).all(...usedStopIds);
        }
        const stopsMap = new Map(stops.map(s => [s.stop_id, s]));
        console.log('Stops Map Size:', stopsMap.size);

        // Check for missing stops
        const missingStops = usedStopIds.filter(id => !stopsMap.has(id));
        if (missingStops.length > 0) {
            console.warn('WARNING: Missing Stops referenced in stop_times:', missingStops);
        }

        const shapes = [];
        const generatedShapeIds = new Set();
        const shapeCache = new Map();

        const tripStopTimes = new Map();
        stopTimes.forEach(st => {
            if (!tripStopTimes.has(st.trip_id)) tripStopTimes.set(st.trip_id, []);
            tripStopTimes.get(st.trip_id).push(st);
        });

        // Helper
        const getDist = (lat1, lon1, lat2, lon2) => {
            const R = 6371000;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        };

        trips.forEach(trip => {
            const tripStops = tripStopTimes.get(trip.trip_id);
            if (!tripStops || tripStops.length < 2) return;

            tripStops.sort((a, b) => a.stop_sequence - b.stop_sequence);

            const stopSequenceKey = tripStops.map(st => st.stop_id).join('|');

            let shapeId = shapeCache.get(stopSequenceKey);

            if (!shapeId) {
                shapeId = `shp_${trip.route_id}_${trip.direction_id || 0}_${generatedShapeIds.size + 1}`;

                shapeCache.set(stopSequenceKey, shapeId);
                generatedShapeIds.add(shapeId);

                let distTraveled = 0;
                let lastLat = 0, lastLon = 0;

                tripStops.forEach((st, idx) => {
                    const stop = stopsMap.get(st.stop_id);
                    if (!stop) {
                        console.error(`Stop not found: ${st.stop_id} in trip ${trip.trip_id}`);
                        return;
                    }

                    if (idx > 0) {
                        distTraveled += getDist(lastLat, lastLon, stop.stop_lat, stop.stop_lon);
                    }

                    shapes.push({
                        shape_id: shapeId,
                        shape_pt_lat: Number(stop.stop_lat.toFixed(6)),
                        shape_pt_lon: Number(stop.stop_lon.toFixed(6)),
                        shape_pt_sequence: idx + 1,
                        shape_dist_traveled: Number(distTraveled.toFixed(2))
                    });

                    lastLat = stop.stop_lat;
                    lastLon = stop.stop_lon;
                });
            }
            trip.shape_id = shapeId;
        });

        console.log('Shapes generated:', shapes.length);
        console.log('Success!');

    } catch (err) {
        console.error('EXPORT FAILED:', err);
    }
}

runExport();
