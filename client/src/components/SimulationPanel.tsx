import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, Square, Download, Clock } from 'lucide-react';
import { API_URL } from '../config';
import { SimulationEngine, secondsToTime } from '../utils/SimulationEngine';
import type { LogicalBus } from '../utils/SimulationEngine';
import { SimulationCanvas } from './SimulationCanvas';
import { SimulationKpiStrip } from './SimulationKpiStrip';
import { computeSimulationKpiState, getZeroSimulationKpiSnapshot } from '../utils/simulationKpis';
import type { SimulationKpiSnapshot } from '../utils/simulationKpis';
import { Route, Stop } from '../types';

interface Calendar {
    service_id: string;
}

const SIM_DURATION_SECONDS = 36 * 3600;
const CHART_VIEWBOX_WIDTH = 1000;
const CHART_VIEWBOX_HEIGHT = 200;
const CHART_PADDING = { top: 26, right: 0, bottom: 26, left: 0 };

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
    const [currentSeconds, setCurrentSeconds] = useState(0); // 0 to SIM_DURATION_SECONDS
    const [hoverSecond, setHoverSecond] = useState<number | null>(null);

    const animationRef = useRef<number>(0);
    const lastTimeRef = useRef<number>(Date.now());
    const chartHoverRef = useRef<HTMLDivElement | null>(null);

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
            setHoverSecond(null);

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

            let earliestTime = SIM_DURATION_SECONDS;
            buses.forEach(b => {
                if (b.trips.length > 0 && b.trips[0].start_time < earliestTime) {
                    earliestTime = b.trips[0].start_time;
                }
            });
            if (earliestTime < SIM_DURATION_SECONDS) {
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
                return Math.min(next, SIM_DURATION_SECONDS);
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
        const csv = engine.generateTrackingTableCSV(logicalBuses, allRoutes);
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

    const clampSecond = (value: number) => Math.max(0, Math.min(SIM_DURATION_SECONDS, Math.floor(value)));
    const currentSecondInt = clampSecond(currentSeconds);
    const simTimeLabel = secondsToTime(currentSeconds);
    const routeIds = useMemo(() => routesData.map((route: any) => route.route_id), [routesData]);

    const computedKpiState = useMemo(() => computeSimulationKpiState({
        buses: logicalBuses,
        currentSecond: currentSecondInt,
        simTime: simTimeLabel,
        routeIds
    }), [logicalBuses, currentSecondInt, simTimeLabel, routeIds]);

    const generalKpis = engine
        ? computedKpiState.general
        : getZeroSimulationKpiSnapshot(simTimeLabel);
    const routeKpisByRoute: Record<string, SimulationKpiSnapshot> = engine ? computedKpiState.byRoute : {};
    const activeBusesCount = generalKpis.activeBusesCount;

    const activeBusSeries = useMemo(() => {
        const diff = new Int32Array(SIM_DURATION_SECONDS + 2);

        for (const bus of logicalBuses) {
            const intervals = bus.trips
                .map(t => ({
                    start: Math.max(0, Math.floor(t.start_time)),
                    end: Math.min(SIM_DURATION_SECONDS, Math.floor(t.end_time))
                }))
                .filter(interval => interval.end >= interval.start)
                .sort((a, b) => a.start - b.start || a.end - b.end);

            if (intervals.length === 0) continue;

            const merged: { start: number; end: number }[] = [intervals[0]];
            for (let i = 1; i < intervals.length; i++) {
                const current = intervals[i];
                const last = merged[merged.length - 1];
                if (current.start <= last.end + 1) {
                    last.end = Math.max(last.end, current.end);
                } else {
                    merged.push({ ...current });
                }
            }

            for (const interval of merged) {
                diff[interval.start] += 1;
                if (interval.end + 1 <= SIM_DURATION_SECONDS) {
                    diff[interval.end + 1] -= 1;
                }
            }
        }

        const series = new Array<number>(SIM_DURATION_SECONDS + 1);
        let running = 0;
        for (let second = 0; second <= SIM_DURATION_SECONDS; second++) {
            running += diff[second];
            series[second] = running;
        }
        return series;
    }, [logicalBuses]);

    const chartInnerWidth = CHART_VIEWBOX_WIDTH - CHART_PADDING.left - CHART_PADDING.right;
    const chartInnerHeight = CHART_VIEWBOX_HEIGHT - CHART_PADDING.top - CHART_PADDING.bottom;
    const chartYMax = Math.max(1, logicalBuses.length);

    const secondToX = (second: number) =>
        CHART_PADDING.left + (Math.max(0, Math.min(SIM_DURATION_SECONDS, second)) / SIM_DURATION_SECONDS) * chartInnerWidth;
    const countToY = (count: number) =>
        CHART_PADDING.top + ((chartYMax - Math.max(0, Math.min(chartYMax, count))) / chartYMax) * chartInnerHeight;

    const activityChangePoints = useMemo(() => {
        const points: Array<[number, number]> = [];
        if (activeBusSeries.length === 0) return points;

        points.push([0, activeBusSeries[0] || 0]);
        for (let second = 1; second <= SIM_DURATION_SECONDS; second++) {
            if (activeBusSeries[second] !== activeBusSeries[second - 1]) {
                points.push([second, activeBusSeries[second]]);
            }
        }
        return points;
    }, [activeBusSeries]);

    const buildStepPathUntil = (targetSecond: number) => {
        if (activityChangePoints.length === 0) return '';

        const clampedTarget = clampSecond(targetSecond);
        let lastCount = activeBusSeries[0] || 0;
        let path = `M ${secondToX(0)} ${countToY(lastCount)}`;

        for (let i = 1; i < activityChangePoints.length; i++) {
            const [changeSecond, newCount] = activityChangePoints[i];
            if (changeSecond > clampedTarget) break;

            const x = secondToX(changeSecond);
            path += ` L ${x} ${countToY(lastCount)}`;
            path += ` L ${x} ${countToY(newCount)}`;
            lastCount = newCount;
        }

        path += ` L ${secondToX(clampedTarget)} ${countToY(lastCount)}`;
        return path;
    };

    const progressPath = buildStepPathUntil(currentSecondInt);
    const progressAreaPath = progressPath
        ? `${progressPath} L ${secondToX(currentSecondInt)} ${countToY(0)} L ${secondToX(0)} ${countToY(0)} Z`
        : '';

    const yTickStep = Math.max(1, Math.ceil(chartYMax / 6));
    const yTicks = Array.from({ length: Math.floor(chartYMax / yTickStep) + 1 }, (_, i) => i * yTickStep)
        .filter(v => v <= chartYMax);
    if (yTicks[yTicks.length - 1] !== chartYMax) yTicks.push(chartYMax);

    const hoverSecondClamped = hoverSecond === null ? null : clampSecond(hoverSecond);
    const hoverCount = hoverSecondClamped === null ? null : (activeBusSeries[hoverSecondClamped] || 0);
    const hoverX = hoverSecondClamped === null ? 0 : secondToX(hoverSecondClamped);
    const hoverY = hoverCount === null ? 0 : countToY(hoverCount);
    const hoverLeftPercent = Math.max(6, Math.min(94, (hoverX / CHART_VIEWBOX_WIDTH) * 100));
    const hoverTopPercent = Math.max(4, Math.min(96, (hoverY / CHART_VIEWBOX_HEIGHT) * 100));
    const tooltipShouldRenderBelow = hoverY <= CHART_PADDING.top + 72;

    const currentX = secondToX(currentSecondInt);
    const currentY = countToY(activeBusesCount);

    const handleChartMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!chartHoverRef.current) return;
        const rect = chartHoverRef.current.getBoundingClientRect();
        if (rect.width <= 0) return;

        const relativeX = ((event.clientX - rect.left) / rect.width) * CHART_VIEWBOX_WIDTH;
        const clampedX = Math.max(CHART_PADDING.left, Math.min(CHART_VIEWBOX_WIDTH - CHART_PADDING.right, relativeX));
        const ratio = (clampedX - CHART_PADDING.left) / chartInnerWidth;
        setHoverSecond(Math.round(ratio * SIM_DURATION_SECONDS));
    };

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
                <div className="h-16 bg-[#111827] border-b border-gray-800 flex items-center px-6 gap-6 xl:gap-8 z-10 shrink-0">
                    <SimulationKpiStrip data={generalKpis} scope="general" />
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
                            routeKpisByRoute={routeKpisByRoute}
                        />
                    )}
                </div>

                {/* Timeline Footer */}
                <div className="h-[292px] bg-[#111827] border-t border-gray-800 flex flex-col p-3 shrink-0 z-20 gap-2">
                    <div className="text-[10px] text-gray-400 uppercase tracking-[0.18em] px-1">
                        Active Buses Evolution
                    </div>

                    <div className="flex items-stretch gap-3">
                        <div className="w-16" />
                        <div className="flex-1">
                            <div className="relative h-[132px] rounded-xl border border-[#1f2d49] bg-[radial-gradient(circle_at_top,rgba(34,197,94,0.12),rgba(6,10,20,0.95)_55%)] overflow-hidden">
                                <div
                                    ref={chartHoverRef}
                                    className="absolute inset-px"
                                    onMouseMove={handleChartMouseMove}
                                    onMouseLeave={() => setHoverSecond(null)}
                                >
                                    <svg
                                        viewBox={`0 0 ${CHART_VIEWBOX_WIDTH} ${CHART_VIEWBOX_HEIGHT}`}
                                        preserveAspectRatio="none"
                                        className="w-full h-full"
                                    >
                                <defs>
                                    <linearGradient id="activeFillGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="0%" stopColor="rgba(34,197,94,0.30)" />
                                        <stop offset="100%" stopColor="rgba(34,197,94,0.02)" />
                                    </linearGradient>
                                    <filter id="activeGlow">
                                        <feGaussianBlur stdDeviation="2.8" result="blur" />
                                        <feMerge>
                                            <feMergeNode in="blur" />
                                            <feMergeNode in="SourceGraphic" />
                                        </feMerge>
                                    </filter>
                                </defs>

                                {yTicks.map(tick => {
                                    const y = countToY(tick);
                                    return (
                                        <g key={`y-${tick}`}>
                                            <line
                                                x1={CHART_PADDING.left}
                                                y1={y}
                                                x2={CHART_VIEWBOX_WIDTH - CHART_PADDING.right}
                                                y2={y}
                                                stroke="rgba(148,163,184,0.16)"
                                                strokeWidth="1"
                                            />
                                            <text
                                                x={6}
                                                y={y + 3}
                                                textAnchor="start"
                                                fill="#94a3b8"
                                                fontSize="10"
                                                fontFamily="monospace"
                                            >
                                                {tick}
                                            </text>
                                        </g>
                                    );
                                })}

                                {Array.from({ length: 13 }).map((_, i) => {
                                    const second = (i / 12) * SIM_DURATION_SECONDS;
                                    const x = secondToX(second);
                                    return (
                                        <line
                                            key={`x-${i}`}
                                            x1={x}
                                            y1={CHART_PADDING.top}
                                            x2={x}
                                            y2={CHART_VIEWBOX_HEIGHT - CHART_PADDING.bottom}
                                            stroke="rgba(59,130,246,0.08)"
                                            strokeWidth="1"
                                        />
                                    );
                                })}

                                {progressAreaPath && (
                                    <path d={progressAreaPath} fill="url(#activeFillGradient)" />
                                )}

                                {progressPath && (
                                    <>
                                        <path d={progressPath} fill="none" stroke="rgba(74,222,128,0.38)" strokeWidth="5.5" filter="url(#activeGlow)" />
                                        <path d={progressPath} fill="none" stroke="#39ff93" strokeWidth="2.2" />
                                    </>
                                )}

                                {hoverSecondClamped === null && (
                                    <>
                                        <line
                                            x1={currentX}
                                            y1={CHART_PADDING.top}
                                            x2={currentX}
                                            y2={CHART_VIEWBOX_HEIGHT - CHART_PADDING.bottom}
                                            stroke="rgba(255,255,255,0.25)"
                                            strokeWidth="1.1"
                                        />
                                        <circle cx={currentX} cy={currentY} r="6.2" fill="rgba(255,255,255,0.32)" />
                                        <circle cx={currentX} cy={currentY} r="3.8" fill="white" />
                                    </>
                                )}

                                {hoverSecondClamped !== null && hoverCount !== null && (
                                    <>
                                        <line
                                            x1={hoverX}
                                            y1={CHART_PADDING.top}
                                            x2={hoverX}
                                            y2={CHART_VIEWBOX_HEIGHT - CHART_PADDING.bottom}
                                            stroke="rgba(255,255,255,0.45)"
                                            strokeDasharray="4 3"
                                            strokeWidth="1"
                                        />
                                        <circle cx={hoverX} cy={hoverY} r="3.6" fill="white" />
                                    </>
                                )}
                                    </svg>
                                </div>

                                {hoverSecondClamped !== null && hoverCount !== null && (
                                    <div
                                        className="absolute z-20 px-2.5 py-1.5 rounded-md border border-white/15 bg-[#050b1a]/90 text-[11px] font-mono text-gray-100 shadow-lg pointer-events-none"
                                        style={{
                                            left: `${hoverLeftPercent}%`,
                                            top: `${hoverTopPercent}%`,
                                            transform: tooltipShouldRenderBelow
                                                ? 'translate(-50%, 8px)'
                                                : 'translate(-50%, calc(-100% - 8px))'
                                        }}
                                    >
                                        <div>{secondsToTime(hoverSecondClamped)}</div>
                                        <div className="text-emerald-300">Activos: {hoverCount}</div>
                                    </div>
                                )}
                            </div>
                        </div>
                        <div className="w-16" />
                    </div>

                    <div className="flex items-start gap-3 pt-0.5">
                        <span className="text-[11px] font-mono w-16 text-right mt-1 text-gray-400">00:00:00</span>
                        <div className="flex-1 relative pb-7">
                            <div className="relative">
                                <input
                                    type="range"
                                    min="0"
                                    max={SIM_DURATION_SECONDS}
                                    value={currentSeconds}
                                    onChange={(e) => setCurrentSeconds(Number(e.target.value))}
                                    className="sim-time-range w-full cursor-pointer z-10"
                                />
                                <div className="absolute top-5 left-0 right-0 h-6 pointer-events-none">
                                    {Array.from({ length: 37 }).map((_, i) => (
                                        <div
                                            key={i}
                                            className="absolute flex flex-col items-center"
                                            style={{ left: `${(i / 36) * 100}%`, transform: 'translateX(-50%)' }}
                                        >
                                            <div className="w-px h-1.5 bg-gray-600" />
                                            <span className="text-[8px] text-gray-500 mt-0.5 font-mono">{i}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                        <span className="text-[11px] font-mono w-16 text-left mt-1 text-gray-400">36:00:00</span>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="w-16" />
                        <div className="flex-1 flex items-center gap-4">
                            <button onClick={() => setIsPlaying(!isPlaying)} className={`p-2.5 rounded-full ${isPlaying ? 'bg-orange-600 hover:bg-orange-500' : 'bg-green-600 hover:bg-green-500'} text-white transition-colors`}>
                                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
                            </button>
                            <button onClick={() => { setIsPlaying(false); setCurrentSeconds(0); }} className="p-2.5 rounded-full bg-gray-700 hover:bg-gray-600 transition-colors">
                                <Square size={20} />
                            </button>

                            <div className="h-8 w-px bg-gray-700" />

                            <div className="flex gap-1 text-sm bg-gray-800 p-1 rounded overflow-x-auto max-w-full">
                                {[1, 2, 3, 4, 5, 10, 60, 120, 240, 480].map(s => (
                                    <button
                                        key={s}
                                        onClick={() => setSpeedMultiplier(s)}
                                        className={`px-3 py-1 rounded transition-colors whitespace-nowrap ${speedMultiplier === s ? 'bg-emerald-600 text-white' : 'hover:bg-gray-700 text-gray-200'}`}
                                    >
                                        x{s}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="w-16" />
                    </div>
                </div>
            </div>
        </div>
    );
};
