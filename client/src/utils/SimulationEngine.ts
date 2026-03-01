export interface SimTrip {
    trip_id: string;
    route_id: string;
    direction_id: number;
    block_id?: string | null;
    start_time: number; // in seconds
    end_time: number; // in seconds
    stop_times: SimStopTime[];
}

export interface SimStopTime {
    stop_id: string;
    stop_sequence: number;
    arrival_time: number;
    departure_time: number;
}

export interface SimSegment {
    start_node_id: string;
    end_node_id: string;
    travel_time: number;
}

export interface LogicalBus {
    bus_id: string;
    color: string;
    trips: AssignedTrip[];
    total_commercial_time: number; // in seconds
    total_empty_time: number; // in seconds
    is_overtaking: boolean;
}

export interface AssignedTrip {
    type: 'commercial' | 'empty';
    trip_id?: string; // only for commercial
    route_id?: string; // only for commercial
    start_stop_id: string;
    end_stop_id: string;
    start_time: number;
    end_time: number;
}

export const timeToSeconds = (timeStr: any): number => {
    if (typeof timeStr === 'number') return timeStr;
    if (typeof timeStr !== 'string' || !timeStr) return 0;
    const [h, m, s] = timeStr.split(':').map(Number);
    return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
};

export const secondsToTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
};

// Generate a random stable color for a bus id
export const getBusColor = (busId: string): string => {
    let hash = 0;
    for (let i = 0; i < busId.length; i++) {
        hash = busId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    // Saturation 85%, Lightness 45% for punchy readable colors
    return `hsl(${hue}, 85%, 45%)`;
};

export class SimulationEngine {
    private segments: SimSegment[];
    private trips: SimTrip[];

    constructor(trips: any[], segments: any[]) {
        this.segments = segments.map(s => ({
            start_node_id: s.start_node_id,
            end_node_id: s.end_node_id,
            travel_time: s.travel_time || 0
        }));

        this.trips = trips.map(t => {
            const stop_times = (t.stop_times || []).map((st: any) => ({
                stop_id: st.stop_id,
                stop_sequence: st.stop_sequence,
                arrival_time: timeToSeconds(st.arrival_time),
                departure_time: timeToSeconds(st.departure_time)
            })).sort((a: any, b: any) => a.stop_sequence - b.stop_sequence);

            let startTime = stop_times.length > 0 ? stop_times[0].departure_time : 0;
            let endTime = stop_times.length > 0 ? stop_times[stop_times.length - 1].arrival_time : 0;

            // Handle midnight crossing (e.g. starts 23:50, ends 00:10)
            if (endTime < startTime && stop_times.length > 0) {
                endTime += 86400;
            }

            return {
                trip_id: t.trip_id,
                route_id: t.route_id,
                direction_id: t.direction_id,
                block_id: t.block_id,
                start_time: startTime,
                end_time: endTime,
                stop_times
            };
        }).filter(t => t.stop_times.length > 1);

        // Sort trips chronologically by start time
        this.trips.sort((a, b) => a.start_time - b.start_time);
    }

    private getEmptyTravelTime(startStopId: string, endStopId: string): number {
        if (startStopId === endStopId) return 0;
        const segment = this.segments.find(s => s.start_node_id === startStopId && s.end_node_id === endStopId);
        // Default to a 10 min penalty if no direct segment is defined for empty repositioning
        return segment ? segment.travel_time : 600;
    }

    private canChainTrips(previousTrip: SimTrip, nextTrip: SimTrip): boolean {
        const previousEndStop = previousTrip.stop_times[previousTrip.stop_times.length - 1]?.stop_id;
        const nextStartStop = nextTrip.stop_times[0]?.stop_id;

        if (!previousEndStop || !nextStartStop) return false;

        const emptyTravelTime = this.getEmptyTravelTime(previousEndStop, nextStartStop);
        return previousTrip.end_time + emptyTravelTime <= nextTrip.start_time;
    }

    private buildBusFromAssignedTrips(busId: string, assignedTrips: SimTrip[]): LogicalBus {
        const orderedTrips = [...assignedTrips].sort((a, b) => a.start_time - b.start_time);
        const bus: LogicalBus = {
            bus_id: busId,
            color: getBusColor(busId),
            trips: [],
            total_commercial_time: 0,
            total_empty_time: 0,
            is_overtaking: false
        };

        for (let i = 0; i < orderedTrips.length; i++) {
            const trip = orderedTrips[i];

            if (i > 0) {
                const previous = orderedTrips[i - 1];
                const previousEndStop = previous.stop_times[previous.stop_times.length - 1]?.stop_id;
                const nextStartStop = trip.stop_times[0]?.stop_id;

                if (previousEndStop && nextStartStop) {
                    const emptyTravelTime = this.getEmptyTravelTime(previousEndStop, nextStartStop);
                    const emptyStart = previous.end_time;
                    const emptyEnd = previous.end_time + emptyTravelTime;

                    if (emptyTravelTime > 0 && emptyEnd <= trip.start_time) {
                        bus.trips.push({
                            type: 'empty',
                            start_stop_id: previousEndStop,
                            end_stop_id: nextStartStop,
                            start_time: emptyStart,
                            end_time: emptyEnd
                        });
                        bus.total_empty_time += emptyTravelTime;
                    }
                }
            }

            this.assignTripToBus(bus, trip);
        }

        return bus;
    }

    public calculateLogicalBuses(): LogicalBus[] {
        const blockTrips = this.trips.filter(t => !!t.block_id);
        if (blockTrips.length > 0) {
            const groups = new Map<string, SimTrip[]>();
            const leftovers: SimTrip[] = [];

            for (const trip of this.trips) {
                if (!trip.block_id) {
                    leftovers.push(trip);
                    continue;
                }
                const blockId = String(trip.block_id);
                const existing = groups.get(blockId) || [];
                existing.push(trip);
                groups.set(blockId, existing);
            }

            const groupedBuses = Array.from(groups.entries())
                .sort((a, b) => a[0].localeCompare(b[0]))
                .flatMap(([blockId, trips]) => {
                    const ordered = [...trips].sort((a, b) => a.start_time - b.start_time);
                    const lanes: SimTrip[][] = [];

                    for (const trip of ordered) {
                        let assigned = false;
                        for (const lane of lanes) {
                            const lastTrip = lane[lane.length - 1];
                            if (this.canChainTrips(lastTrip, trip)) {
                                lane.push(trip);
                                assigned = true;
                                break;
                            }
                        }

                        if (!assigned) {
                            lanes.push([trip]);
                        }
                    }

                    return lanes.map((lane, laneIndex) => {
                        const busId = lanes.length === 1
                            ? blockId
                            : `${blockId}-${(laneIndex + 1).toString().padStart(2, '0')}`;
                        return this.buildBusFromAssignedTrips(busId, lane);
                    });
                });

            if (leftovers.length === 0) return groupedBuses;

            // Fallback for legacy/manual trips without block_id: keep previous greedy assignment.
            const leftoverEngine = new SimulationEngine(leftovers as any[], this.segments as any[]);
            const leftoverBuses = leftoverEngine.calculateLogicalBuses();

            const existingIds = new Set(groupedBuses.map(b => b.bus_id));
            for (const bus of leftoverBuses) {
                let nextId = bus.bus_id;
                let counter = 1;
                while (existingIds.has(nextId)) {
                    nextId = `${bus.bus_id}-L${counter++}`;
                }
                bus.bus_id = nextId;
                bus.color = getBusColor(nextId);
                existingIds.add(nextId);
            }

            return [...groupedBuses, ...leftoverBuses];
        }

        const buses: LogicalBus[] = [];
        let busCounter = 1;

        // Make a mutable copy of trips
        const unassignedTrips = [...this.trips];

        while (unassignedTrips.length > 0) {
            // Take the first unassigned trip
            const currentTrip = unassignedTrips.shift()!;

            const busId = `BUS-${busCounter.toString().padStart(4, '0')}`;
            const newBus: LogicalBus = {
                bus_id: busId,
                color: getBusColor(busId),
                trips: [],
                total_commercial_time: 0,
                total_empty_time: 0,
                is_overtaking: false
            };

            // Assign the first trip
            this.assignTripToBus(newBus, currentTrip);

            // Try to chain as many trips as possible to this bus
            let keepChaining = true;
            while (keepChaining) {
                const lastAssigned = newBus.trips[newBus.trips.length - 1];

                // Find next viable trip
                let bestNextTripIndex = -1;
                let earliestStartTime = Infinity;

                for (let i = 0; i < unassignedTrips.length; i++) {
                    const candidate = unassignedTrips[i];

                    // We can only reuse buses on the same route as requested
                    if (candidate.route_id !== currentTrip.route_id) continue;

                    // Calculate positioning time
                    const emptyTravelTime = this.getEmptyTravelTime(lastAssigned.end_stop_id, candidate.stop_times[0].stop_id);
                    const arrivalAtNextStart = lastAssigned.end_time + emptyTravelTime;

                    if (candidate.start_time >= arrivalAtNextStart) {
                        // Viable!
                        if (candidate.start_time < earliestStartTime) {
                            earliestStartTime = candidate.start_time;
                            bestNextTripIndex = i;
                        }
                    }
                }

                if (bestNextTripIndex !== -1) {
                    const nextTrip = unassignedTrips.splice(bestNextTripIndex, 1)[0];

                    // Check if repositioning is needed
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

        // Calculate overtaking flags (if Bus A started after Bus B, but arrives earlier somewhere)
        // A simple way is to flag any trip that overtakes another trip on the same route.
        for (const _bus of buses) {
            // We can determine overtaking during the live simulation or precalculate.
            // Let's precalculate trips that overtake.
        }

        return buses;
    }

    private assignTripToBus(bus: LogicalBus, trip: SimTrip) {
        const duration = trip.end_time - trip.start_time;
        bus.trips.push({
            type: 'commercial',
            trip_id: trip.trip_id,
            route_id: trip.route_id,
            start_stop_id: trip.stop_times[0].stop_id,
            end_stop_id: trip.stop_times[trip.stop_times.length - 1].stop_id,
            start_time: trip.start_time,
            end_time: trip.end_time
        });
        bus.total_commercial_time += duration;
    }

    public getActiveBusesAtSeconds(buses: LogicalBus[], currentSeconds: number) {
        return buses.filter(b =>
            b.trips.some(t => currentSeconds >= t.start_time && currentSeconds <= t.end_time)
        );
    }

    // Export a CSV of the schedule summary
    public generateTrackingTableCSV(buses: LogicalBus[], allRoutes?: any[]): string {
        let csv = "Ruta - Bus,Ruta,Total Trips,Commercial Time (min),Empty Time (min)\n";

        buses.forEach(b => {
            // Find all unique commercial routes this bus served
            const commTrips = b.trips.filter(t => t.type === 'commercial' && t.route_id);
            const routeIds = Array.from(new Set(commTrips.map(t => t.route_id)));

            if (routeIds.length === 0) {
                // If a bus has no commercial trips, add one row for its empty time
                csv += `"${b.bus_id}","N/A",0,0,${Math.round(b.total_empty_time / 60)}\n`;
                return;
            }

            routeIds.forEach(rid => {
                const specificTrips = b.trips.filter(t => t.type === 'commercial' && t.route_id === rid);
                let commDuration = 0;
                specificTrips.forEach(t => commDuration += (t.end_time - t.start_time));

                // Associate empty trips with this route if they happen before a commercial trip of this route
                let emptyDuration = 0;
                b.trips.forEach((t, idx) => {
                    if (t.type === 'empty') {
                        const nextComm = b.trips.slice(idx + 1).find(nt => nt.type === 'commercial');
                        if (nextComm && nextComm.route_id === rid) {
                            emptyDuration += (t.end_time - t.start_time);
                        }
                    }
                });

                let routeDisplayName = rid || "N/A";
                if (allRoutes) {
                    const r = allRoutes.find(ar => ar.route_id === rid);
                    if (r) {
                        routeDisplayName = r.route_short_name || r.route_long_name || rid || "N/A";
                    }
                }

                // Format values for CSV
                const rutaOnly = `"${routeDisplayName.toString().replace(/"/g, '""')}"`;
                const busRuta = `"${routeDisplayName.toString().replace(/"/g, '""')} - ${b.bus_id.replace(/"/g, '""')}"`;

                const tripsCount = specificTrips.length;
                const cMin = Math.round(commDuration / 60);
                const eMin = Math.round(emptyDuration / 60);

                csv += `${busRuta},${rutaOnly},${tripsCount},${cMin},${eMin}\n`;
            });
        });

        return csv;
    }

    public generateTrackingLog(buses: LogicalBus[]): string {
        let log = "";

        // Flatten all events from all buses
        const events: { time: number, text: string }[] = [];
        buses.forEach(b => {
            b.trips.forEach(t => {
                if (t.type === 'commercial') {
                    events.push({ time: t.start_time, text: `[${secondsToTime(t.start_time)}] Bus ${b.bus_id} starts commercial trip ${t.trip_id} at stop ${t.start_stop_id}` });
                    events.push({ time: t.end_time, text: `[${secondsToTime(t.end_time)}] Bus ${b.bus_id} ends commercial trip ${t.trip_id} at stop ${t.end_stop_id}` });
                } else {
                    events.push({ time: t.start_time, text: `[${secondsToTime(t.start_time)}] Bus ${b.bus_id} starts empty repositioning to ${t.end_stop_id}` });
                    events.push({ time: t.end_time, text: `[${secondsToTime(t.end_time)}] Bus ${b.bus_id} arrives empty at ${t.end_stop_id}` });
                }
            });
        });

        events.sort((a, b) => a.time - b.time);
        log = events.map(e => e.text).join('\n');

        return log;
    }
}
