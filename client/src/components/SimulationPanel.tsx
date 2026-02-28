import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, Square, Download, Clock } from 'lucide-react';
import { API_URL } from '../config';
import { SimulationEngine, secondsToTime } from '../utils/SimulationEngine';
import type { LogicalBus } from '../utils/SimulationEngine';
import { SimulationCanvas } from './SimulationCanvas';
import { Route, Stop } from '../types';

interface Calendar {
    service_id: string;
}

export const SimulationPanel: React.FC<{ onClose: () => void }> = ({ onClose }) => {
    const [calendars, setCalendars] = useState<Calendar[]>([]);
    const [selectedServiceId, setSelectedServiceId] = useState<string>('');
    const [allRoutes, setAllRoutes] = useState<Route[]>([]);
    const [selectedRouteIds, setSelectedRouteIds] = useState<string[]>([]);

    const [engine, setEngine] = useState<SimulationEngine | null>(null);
    const [routesData, setRoutesData] = useState<any[]>([]);
    const [logicalBuses, setLogicalBuses] = useState<LogicalBus[]>([]);

    const [isPlaying, setIsPlaying] = useState<boolean>(false);
    const [speedMultiplier, setSpeedMultiplier] = useState(1);
    const [currentSeconds, setCurrentSeconds] = useState(0); // 0 to 36*3600

    const animationRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(Date.now());

    // Load initial config
    useEffect(() => {
        fetch(`${API_URL}/calendar`).then(r => r.json()).then(data => {
            setCalendars(data);
            if (data.length > 0) setSelectedServiceId(data[0].service_id);
        });
        fetch(`${API_URL}/routes`).then(r => r.json()).then(data => setAllRoutes(data));
    }, []);

    // Engine Builder
    const handleInitialize = async () => {
        if (selectedRouteIds.length === 0 || !selectedServiceId) return;

        // Pause if playing
        setIsPlaying(false);
        setEngine(null);

        try {
            // Fetch everything we need
            const segmentsRes = await fetch(`${API_URL}/segments`);
            const allSegments = await segmentsRes.json();

            const stopsRes = await fetch(`${API_URL}/stops`);
            const allStops: Stop[] = await stopsRes.json();

            // Fetch stop_times for these trips
            // In a real app we'd have a bulk endpoint, for now we map promises. If there are 1000s this will be slow
            // GTFS Generator usually has `/routes/:id/trips` which INCLUDES stop_times. Let's use that!
            const tripPromises = selectedRouteIds.map(rid =>
                fetch(`${API_URL}/routes/${rid}/trips`).then(r => r.json())
            );
            const routeTripsData = await Promise.all(tripPromises);

            // Flatten and filter by service
            let fullTripsRaw = routeTripsData.flat().filter((t: any) => t.service_id === selectedServiceId);

            // Helper to convert "HH:MM:SS" to seconds safely
            const timeToSecs = (timeStr: any) => {
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

            // Convert raw API string times to numeric seconds and deduplicate
            const seenTripIds = new Set();
            let fullTrips = [];
            for (const t of fullTripsRaw) {
                if (seenTripIds.has(t.trip_id)) continue;
                seenTripIds.add(t.trip_id);

                fullTrips.push({
                    ...t,
                    stop_times: (t.stop_times || []).map((st: any) => ({
                        ...st,
                        arrival_time: typeof st.arrival_time === 'string' ? timeToSecs(st.arrival_time) : st.arrival_time,
                        departure_time: typeof st.departure_time === 'string' ? timeToSecs(st.departure_time) : st.departure_time
                    }))
                });
            }

            // Fetch paths for routes
            const rData = await Promise.all(selectedRouteIds.map(async rid => {
                const routeObj = allRoutes.find(r => r.route_id === rid);
                const [path0Res, path1Res] = await Promise.all([
                    fetch(`${API_URL}/routes/${rid}/path?direction_id=0`).then(r => r.json()).catch(() => ({})),
                    fetch(`${API_URL}/routes/${rid}/path?direction_id=1`).then(r => r.json()).catch(() => ({}))
                ]);

                const mapPath = (p: any) => (p.ordered_stop_ids || []).map((id: string) => allStops.find(s => s.stop_id === id)).filter(Boolean);

                return {
                    route_id: rid,
                    route_short_name: routeObj?.route_short_name || rid,
                    path0: mapPath(path0Res),
                    path1: mapPath(path1Res),
                    trips: fullTrips.filter(t => t.route_id === rid)
                };
            }));

            setRoutesData(rData);

            // Build engine
            const newEngine = new SimulationEngine(fullTrips, allSegments);
            const buses = newEngine.calculateLogicalBuses();

            setLogicalBuses(buses);
            setEngine(newEngine);
            setCurrentSeconds(0);

            console.log("Built simulation. Routes:", rData.length, "Buses:", buses.length, "First trips start times:", buses.map(b => b.trips[0]?.start_time));

            const bus2 = buses.find(b => b.bus_id === 'BUS-0002');
            if (bus2) {
                console.log("Checking BUS-0002 overlaps...", bus2.trips.length, "trips");
                for (let i = 0; i < bus2.trips.length - 1; i++) {
                    const t1 = bus2.trips[i];
                    const t2 = bus2.trips[i + 1];
                    if (t1.end_time > t2.start_time) {
                        console.error("OVERLAP DETECTED ON BUS-0002!", t1, t2);
                    }
                }
            }

            let earliestTime = 36 * 3600;
            buses.forEach(b => {
                if (b.trips.length > 0 && b.trips[0].start_time < earliestTime) {
                    earliestTime = b.trips[0].start_time;
                }
            });
            if (earliestTime < 36 * 3600) {
                setCurrentSeconds(earliestTime - 600); // start 10 mins before first bus
            }

        } catch (e) {
            console.error("Failed to build simulation", e);
            alert("Error initializing simulation");
        }
    };

    // Animation Loop
    useEffect(() => {
        if (!isPlaying) {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
            return;
        }

        lastTimeRef.current = Date.now();

        const loop = () => {
            const now = Date.now();
            const deltaMs = now - lastTimeRef.current;
            lastTimeRef.current = now;

            // Delta time in seconds * multiplier
            const simDelta = (deltaMs / 1000) * speedMultiplier;

            setCurrentSeconds(prev => {
                const next = prev + simDelta;
                // console.log("Sim loop tick", next);
                return Math.min(next, 36 * 3600);
            });

            animationRef.current = requestAnimationFrame(loop);
        };
        animationRef.current = requestAnimationFrame(loop);

        return () => {
            if (animationRef.current) cancelAnimationFrame(animationRef.current);
        };
    }, [isPlaying, speedMultiplier]);

    // Download Helpers
    const handleDownloadCSV = () => {
        if (!engine) return;
        const csv = engine.generateTrackingTableCSV(logicalBuses);
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `seguimiento_${selectedServiceId}.csv`;
        a.click();
    };

    const handleDownloadLog = () => {
        if (!engine) return;
        const log = engine.generateTrackingLog(logicalBuses);
        const blob = new Blob([log], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `log_${selectedServiceId}.txt`;
        a.click();
    };

    // Derived KPIs
    const activeBusesCount = engine ? engine.getActiveBusesAtSeconds(logicalBuses, currentSeconds).length : 0;
    const dispatchedBuses = logicalBuses.filter(b => b.trips.some(t => t.start_time <= currentSeconds)).length;
    const activeTripsCount = engine ? engine.getActiveBusesAtSeconds(logicalBuses, currentSeconds).filter(b => {
        return b.trips.some(t => t.type === 'commercial' && currentSeconds >= t.start_time && currentSeconds <= t.end_time);
    }).length : 0;

    return (
        <div className="fixed inset-0 z-50 flex bg-[#0a0f1d] text-white overflow-hidden animate-in slide-in-from-right duration-300">
            {/* Sidebar Controls */}
            <div className="w-64 bg-[#111827] border-r border-gray-800 flex flex-col p-4 shadow-xl z-20">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Clock className="text-blue-500" /> Simulación
                    </h2>
                    <button onClick={onClose} className="text-gray-400 hover:text-white">✕</button>
                </div>

                <label className="text-sm text-gray-400 mb-1">Service</label>
                <select
                    value={selectedServiceId}
                    onChange={(e) => setSelectedServiceId(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-700 rounded p-2 text-sm mb-4 outline-none focus:border-blue-500"
                >
                    {calendars.map(c => <option key={c.service_id} value={c.service_id}>{c.service_id}</option>)}
                </select>

                <label className="text-sm text-gray-400 mb-1">Routes</label>
                <div className="flex-1 overflow-y-auto mb-4 border border-gray-700 rounded bg-gray-800 p-2 custom-scrollbar">
                    {allRoutes.map(r => (
                        <label key={r.route_id} className="flex items-center gap-2 mb-2 p-1 hover:bg-gray-700 rounded cursor-pointer">
                            <input
                                type="checkbox"
                                checked={selectedRouteIds.includes(r.route_id)}
                                onChange={(e) => {
                                    if (e.target.checked) setSelectedRouteIds([...selectedRouteIds, r.route_id]);
                                    else setSelectedRouteIds(selectedRouteIds.filter(id => id !== r.route_id));
                                }}
                                className="rounded bg-gray-900 border-gray-700 text-blue-500 focus:ring-transparent"
                            />
                            <span className="text-sm font-medium">{r.route_short_name}</span>
                        </label>
                    ))}
                </div>

                <div className="flex flex-col gap-2">
                    <button
                        onClick={handleInitialize}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded transition-colors"
                    >
                        Load & Build
                    </button>
                    {engine && (
                        <div className="flex justify-between gap-2 mt-2">
                            <button onClick={handleDownloadCSV} className="flex-1 bg-gray-700 hover:bg-gray-600 rounded p-2 flex justify-center text-xs" title="Tabla de Seguimiento">
                                <Download size={16} /> CSV
                            </button>
                            <button onClick={handleDownloadLog} className="flex-1 bg-gray-700 hover:bg-gray-600 rounded p-2 flex justify-center text-xs" title="Log de Seguimiento">
                                <Download size={16} /> LOG
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Area */}
            <div className="flex-1 flex flex-col min-w-0 relative">
                {/* Header KPIs */}
                <div className="h-20 bg-[#111827] border-b border-gray-800 flex items-center px-8 gap-12 z-10 shrink-0">
                    <div>
                        <div className="text-xs text-gray-400 uppercase tracking-widest">Active Buses</div>
                        <div className="text-3xl font-light">{activeBusesCount}</div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-400 uppercase tracking-widest">Dispatched</div>
                        <div className="text-3xl font-light">{dispatchedBuses} <span className="text-sm text-gray-500">/ {logicalBuses.length}</span></div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-400 uppercase tracking-widest">Trips In Prog.</div>
                        <div className="text-3xl font-light">{activeTripsCount}</div>
                    </div>
                    <div className="ml-auto text-right">
                        <div className="text-xs text-gray-400 uppercase tracking-widest">Sim Time</div>
                        <div className="text-3xl font-mono text-emerald-400">{secondsToTime(currentSeconds)}</div>
                    </div>
                </div>

                {/* Simulation Canvas */}
                <div className="flex-1 relative overflow-hidden">
                    {!engine ? (
                        <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-lg">
                            Select routes and click Load & Build to start simulation
                        </div>
                    ) : (
                        <SimulationCanvas
                            routesData={routesData}
                            buses={logicalBuses}
                            currentSeconds={currentSeconds}
                        />
                    )}
                </div>

                {/* Timeline Footer */}
                <div className="h-24 bg-[#111827] border-t border-gray-800 flex flex-col p-4 shrink-0 z-20">
                    <div className="flex items-center gap-4">
                        <button onClick={() => setIsPlaying(!isPlaying)} className={`p-2 rounded-full ${isPlaying ? 'bg-orange-600' : 'bg-green-600'} text-white`}>
                            {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                        </button>
                        <button onClick={() => { setIsPlaying(false); setCurrentSeconds(0); }} className="p-2 rounded-full bg-gray-700 hover:bg-gray-600">
                            <Square size={20} />
                        </button>

                        <div className="h-8 w-px bg-gray-700 mx-2" />

                        <div className="flex gap-1 text-sm bg-gray-800 p-1 rounded overflow-x-auto max-w-full">
                            {[1, 2, 5, 10, 60, 120, 240, 480].map(s => (
                                <button
                                    key={s}
                                    onClick={() => setSpeedMultiplier(s)}
                                    className={`px-3 py-1 rounded transition-colors whitespace-nowrap ${speedMultiplier === s ? 'bg-blue-600' : 'hover:bg-gray-700'}`}
                                >
                                    x{s}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="mt-4 flex items-center gap-4">
                        <span className="text-xs font-mono w-16 text-right">00:00:00</span>
                        <input
                            type="range"
                            min="0"
                            max={36 * 3600}
                            value={currentSeconds}
                            onChange={(e) => setCurrentSeconds(Number(e.target.value))}
                            className="flex-1 accent-blue-500"
                        />
                        <span className="text-xs font-mono w-16 text-left">36:00:00</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
