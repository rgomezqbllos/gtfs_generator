import React, { useRef } from 'react';
import type { Stop } from '../types';
import type { LogicalBus, SimTrip } from '../utils/SimulationEngine';

interface SimulationCanvasProps {
    routesData: {
        route_id: string;
        route_short_name: string;
        path0: Stop[];
        path1: Stop[];
        trips: SimTrip[];
    }[];
    buses: LogicalBus[];
    currentSeconds: number;
}

export const SimulationCanvas: React.FC<SimulationCanvasProps> = ({ routesData, buses, currentSeconds }) => {
    // Canvas dimensions and state
    const containerRef = useRef<HTMLDivElement>(null);

    // Filter which buses are active right now
    const activeTrips = buses.flatMap(b => {
        // Find all trips active at this second
        const eligibleTrips = b.trips.filter(t => currentSeconds >= t.start_time && currentSeconds <= t.end_time);

        if (eligibleTrips.length === 0) return [];

        // If multiple trips overlap, pick the one that started LATEST.
        // This handles cases where a new trip starts before the previous one technically 'ends' in the GTFS data.
        const activeTrip = eligibleTrips.reduce((prev, current) => (prev.start_time > current.start_time) ? prev : current);

        return [{
            bus: b,
            trip: activeTrip
        }];
    });

    console.log(`SimulationCanvas render: currentSeconds=${currentSeconds}, activeTrips=${activeTrips.length}`, activeTrips);

    return (
        <div className="flex flex-col gap-6 p-4 overflow-y-auto w-full h-full bg-[#0a0f1d] text-white" ref={containerRef}>
            {routesData.map(rData => (
                <div key={rData.route_id} className="flex flex-col gap-4 border-b border-gray-800 pb-6">
                    <div className="flex flex-col">
                        <h3 className="text-xl font-bold">{rData.route_short_name}</h3>
                        <span className="text-xs text-gray-500 uppercase tracking-wider">Route View</span>
                    </div>

                    {/* Direction 0 Track */}
                    {rData.path0.length > 0 && (
                        <div className="relative h-12 flex items-center mt-2">
                            <div className="absolute left-0 w-8 text-xs text-gray-400">OUT</div>
                            <div className="absolute left-10 right-10 h-1 bg-gray-700 rounded-full" />

                            {/* Render Stops */}
                            {rData.path0.map((stop, i) => {
                                const leftPercent = (i / Math.max(1, rData.path0.length - 1)) * 100;
                                return (
                                    <div
                                        key={stop.stop_id}
                                        className="absolute w-3 h-3 bg-gray-500 rounded-full border-2 border-[#0a0f1d] z-10"
                                        style={{ left: `calc(40px + calc(100% - 80px) * ${leftPercent / 100})`, transform: 'translateX(-50%)' }}
                                        title={stop.stop_name}
                                    />
                                );
                            })}

                            {/* Render Buses on Dir 0 */}
                            {activeTrips.filter(ab => {
                                if (ab.trip.type === 'commercial') {
                                    const simTrip = rData.trips.find(t => t.trip_id === ab.trip.trip_id);
                                    return simTrip !== undefined && simTrip.direction_id === 0;
                                } else {
                                    return rData.path0.length > 0 &&
                                        ab.trip.start_stop_id === rData.path0[0].stop_id &&
                                        ab.trip.end_stop_id === rData.path0[rData.path0.length - 1].stop_id;
                                }
                            }).map(ab => {
                                let leftPercent = 0;
                                const isCommercial = ab.trip.type === 'commercial';

                                if (isCommercial) {
                                    const simTrip = rData.trips.find(t => t.trip_id === ab.trip.trip_id)!;
                                    if (currentSeconds >= simTrip.end_time) {
                                        leftPercent = 100;
                                    } else if (currentSeconds <= simTrip.start_time) {
                                        leftPercent = 0;
                                    } else {
                                        let found = false;
                                        const totalPathSegments = Math.max(1, rData.path0.length - 1);

                                        for (let i = 0; i < simTrip.stop_times.length - 1; i++) {
                                            const curr = simTrip.stop_times[i];
                                            const next = simTrip.stop_times[i + 1];

                                            if (currentSeconds >= curr.departure_time && currentSeconds < next.arrival_time) {
                                                const dt = next.arrival_time - curr.departure_time;
                                                const elapsed = currentSeconds - curr.departure_time;
                                                const segmentFraction = dt > 0 ? (elapsed / dt) : 0;

                                                const startIdx = rData.path0.findIndex(s => s.stop_id === curr.stop_id);
                                                const endIdx = rData.path0.findIndex(s => s.stop_id === next.stop_id);

                                                if (startIdx !== -1 && endIdx !== -1) {
                                                    const startPct = (startIdx / totalPathSegments) * 100;
                                                    const endPct = (endIdx / totalPathSegments) * 100;
                                                    leftPercent = startPct + (endPct - startPct) * segmentFraction;
                                                } else {
                                                    // Fallback to index-based if stop not found in path
                                                    const startPct = (i / totalPathSegments) * 100;
                                                    const endPct = ((i + 1) / totalPathSegments) * 100;
                                                    leftPercent = startPct + (endPct - startPct) * segmentFraction;
                                                }
                                                found = true;
                                                break;
                                            } else if (currentSeconds >= curr.arrival_time && currentSeconds <= curr.departure_time) {
                                                const stopIdx = rData.path0.findIndex(s => s.stop_id === curr.stop_id);
                                                if (stopIdx !== -1) {
                                                    leftPercent = (stopIdx / totalPathSegments) * 100;
                                                } else {
                                                    leftPercent = (i / totalPathSegments) * 100;
                                                }
                                                found = true;
                                                break;
                                            }
                                        }
                                        if (!found) {
                                            // Check if dwelling at terminal stop
                                            const lastStop = simTrip.stop_times[simTrip.stop_times.length - 1];
                                            if (currentSeconds >= lastStop.arrival_time) {
                                                const stopIdx = rData.path0.findIndex(s => s.stop_id === lastStop.stop_id);
                                                if (stopIdx !== -1) {
                                                    leftPercent = (stopIdx / totalPathSegments) * 100;
                                                } else {
                                                    leftPercent = 100;
                                                }
                                            }
                                        }
                                    }
                                } else {
                                    const dt = ab.trip.end_time - ab.trip.start_time;
                                    const elapsed = currentSeconds - ab.trip.start_time;
                                    const fraction = dt > 0 ? (elapsed / dt) : 0;
                                    leftPercent = fraction * 100;
                                }

                                return (
                                    <div
                                        key={`bus-0-${ab.bus.bus_id}`}
                                        className={`absolute z-20 flex items-center justify-center px-3 py-1 min-w-[36px] rounded-full shadow-md text-[10px] font-bold text-white group cursor-pointer ${isCommercial ? '' : 'opacity-75 border-2 border-dashed border-gray-400'}`}
                                        style={{
                                            left: `calc(40px + calc(100% - 80px) * ${leftPercent / 100})`,
                                            top: '50%',
                                            transform: 'translate(-50%, -50%)',
                                            backgroundColor: isCommercial ? ab.bus.color : '#374151'
                                        }}
                                    >
                                        {ab.bus.bus_id.split('-')[1]}
                                        <div className="hidden group-hover:block absolute bottom-full mb-2 bg-gray-900 text-white p-2 rounded text-xs whitespace-nowrap z-50">
                                            <div>Bus: {ab.bus.bus_id}</div>
                                            <div>Trip ID: {ab.trip.trip_id}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Direction 1 Track */}
                    {rData.path1.length > 0 && (
                        <div className="relative h-12 flex items-center mt-2">
                            <div className="absolute left-0 w-8 text-xs text-gray-400">RET</div>
                            <div className="absolute left-10 right-10 h-1 bg-gray-700 rounded-full" />

                            {/* Render Stops (Reversed visually right-to-left for Return) */}
                            {rData.path1.map((stop, i) => {
                                const leftPercent = 100 - ((i / Math.max(1, rData.path1.length - 1)) * 100);
                                return (
                                    <div
                                        key={stop.stop_id}
                                        className="absolute w-3 h-3 bg-gray-500 rounded-full border-2 border-[#0a0f1d] z-10"
                                        style={{ left: `calc(40px + calc(100% - 80px) * ${leftPercent / 100})`, transform: 'translateX(-50%)' }}
                                        title={stop.stop_name}
                                    />
                                );
                            })}

                            {/* Render Buses on Dir 1 */}
                            {activeTrips.filter(ab => {
                                if (ab.trip.type === 'commercial') {
                                    const simTrip = rData.trips.find(t => t.trip_id === ab.trip.trip_id);
                                    return simTrip !== undefined && simTrip.direction_id === 1;
                                } else {
                                    return rData.path1.length > 0 &&
                                        ab.trip.start_stop_id === rData.path1[0].stop_id &&
                                        ab.trip.end_stop_id === rData.path1[rData.path1.length - 1].stop_id;
                                }
                            }).map(ab => {
                                let leftPercent = 100;
                                const isCommercial = ab.trip.type === 'commercial';

                                if (isCommercial) {
                                    const simTrip = rData.trips.find(t => t.trip_id === ab.trip.trip_id)!;
                                    if (currentSeconds >= simTrip.end_time) {
                                        leftPercent = 0;
                                    } else if (currentSeconds <= simTrip.start_time) {
                                        leftPercent = 100;
                                    } else {
                                        let found = false;
                                        const totalPathSegments = Math.max(1, rData.path1.length - 1);

                                        for (let i = 0; i < simTrip.stop_times.length - 1; i++) {
                                            const curr = simTrip.stop_times[i];
                                            const next = simTrip.stop_times[i + 1];

                                            if (currentSeconds >= curr.departure_time && currentSeconds < next.arrival_time) {
                                                const dt = next.arrival_time - curr.departure_time;
                                                const elapsed = currentSeconds - curr.departure_time;
                                                const segmentFraction = dt > 0 ? (elapsed / dt) : 0;

                                                const startIdx = rData.path1.findIndex(s => s.stop_id === curr.stop_id);
                                                const endIdx = rData.path1.findIndex(s => s.stop_id === next.stop_id);

                                                if (startIdx !== -1 && endIdx !== -1) {
                                                    const startPct = 100 - (startIdx / totalPathSegments) * 100;
                                                    const endPct = 100 - (endIdx / totalPathSegments) * 100;
                                                    leftPercent = startPct + (endPct - startPct) * segmentFraction;
                                                } else {
                                                    // Fallback to index-based
                                                    const startPct = 100 - ((i / totalPathSegments) * 100);
                                                    const endPct = 100 - (((i + 1) / totalPathSegments) * 100);
                                                    leftPercent = startPct + (endPct - startPct) * segmentFraction;
                                                }
                                                found = true;
                                                break;
                                            } else if (currentSeconds >= curr.arrival_time && currentSeconds <= curr.departure_time) {
                                                const stopIdx = rData.path1.findIndex(s => s.stop_id === curr.stop_id);
                                                if (stopIdx !== -1) {
                                                    leftPercent = 100 - (stopIdx / totalPathSegments) * 100;
                                                } else {
                                                    leftPercent = 100 - (i / totalPathSegments) * 100;
                                                }
                                                found = true;
                                                break;
                                            }
                                        }
                                        if (!found) {
                                            // Check if dwelling at terminal stop
                                            const lastStop = simTrip.stop_times[simTrip.stop_times.length - 1];
                                            if (currentSeconds >= lastStop.arrival_time) {
                                                const stopIdx = rData.path1.findIndex(s => s.stop_id === lastStop.stop_id);
                                                if (stopIdx !== -1) {
                                                    leftPercent = 100 - (stopIdx / totalPathSegments) * 100;
                                                } else {
                                                    leftPercent = 0; // 0 means end of RET line visually
                                                }
                                            }
                                        }
                                    }
                                } else {
                                    const dt = ab.trip.end_time - ab.trip.start_time;
                                    const elapsed = currentSeconds - ab.trip.start_time;
                                    const fraction = dt > 0 ? (elapsed / dt) : 0;
                                    leftPercent = 100 - (fraction * 100);
                                }

                                return (
                                    <div
                                        key={`bus-1-${ab.bus.bus_id}`}
                                        className={`absolute z-20 flex items-center justify-center px-3 py-1 min-w-[36px] rounded-full shadow-md text-[10px] font-bold text-white group cursor-pointer ${isCommercial ? '' : 'opacity-75 border-2 border-dashed border-gray-400'}`}
                                        style={{
                                            left: `calc(40px + calc(100% - 80px) * ${leftPercent / 100})`,
                                            top: '50%',
                                            transform: 'translate(-50%, -50%)',
                                            backgroundColor: isCommercial ? ab.bus.color : '#374151'
                                        }}
                                    >
                                        {ab.bus.bus_id.split('-')[1]}
                                        <div className="hidden group-hover:block absolute bottom-full mb-2 bg-gray-900 text-white p-2 rounded text-xs whitespace-nowrap z-50">
                                            <div>Bus: {ab.bus.bus_id}</div>
                                            <div>Trip ID: {ab.trip.trip_id}</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                </div>
            ))}
        </div>
    );
};
