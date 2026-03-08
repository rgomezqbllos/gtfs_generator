import React, { useState, useEffect } from 'react';
import { X, Plus, Save, Trash2, Clock, AlertCircle, Wand2, CheckCircle, RefreshCw, Activity, Database, LayoutGrid, ChevronRight, Hash, ShieldAlert, Loader2 } from 'lucide-react';
import type { Route } from '../types';
import { clsx } from 'clsx';
import AutoTripsModal, { type AutoTripsConfig } from './AutoTripsModal';
import ConfirmModal from './ConfirmModal';
import { formatTimeInput } from '../utils/TimeUtils';
import { API_URL } from '../config';

interface TripsManagerProps {
    route: Route;
    onClose: () => void;
}

interface Trip {
    trip_id: string;
    route_id: string;
    service_id: string;
    trip_headsign: string;
    direction_id: number;
    block_id?: string;
    shape_id: string;
    stop_times?: StopTime[];
}

interface StopTime {
    trip_id: string;
    stop_id: string;
    stop_sequence: number;
    arrival_time: string;
    departure_time: string;
}

interface Calendar {
    service_id: string;
}

interface Stop {
    stop_id: string;
    stop_name: string;
    stop_code?: string;
}

interface GeneratedTripPlan {
    stop_times: StopTime[];
    arrivals: number[];
    start_seconds: number;
    end_seconds: number;
}

interface FleetRangePlan {
    start_seconds: number;
    end_seconds: number;
    buses: number;
}

interface FleetBusState {
    fleet_id: number;
    available_at: number;
}

const TripsManager: React.FC<TripsManagerProps> = ({ route, onClose }) => {
    const [direction, setDirection] = useState<number>(0);
    const [trips, setTrips] = useState<Trip[]>([]);
    const [stops, setStops] = useState<Stop[]>([]);
    const [stopsDir0, setStopsDir0] = useState<Stop[]>([]);
    const [stopsDir1, setStopsDir1] = useState<Stop[]>([]);
    const [calendars, setCalendars] = useState<Calendar[]>([]);
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [isAutoModalOpen, setIsAutoModalOpen] = useState(false);

    const [selectedServiceId, setSelectedServiceId] = useState<string>('');

    useEffect(() => {
        fetchCalendars();
    }, []);

    useEffect(() => {
        if (calendars.length > 0 && !selectedServiceId) {
            setSelectedServiceId(calendars[0].service_id);
        }
    }, [calendars, selectedServiceId]);

    useEffect(() => {
        fetchData();
    }, [route.route_id, direction]);

    const fetchCalendars = async () => {
        try {
            const res = await fetch(`${API_URL}/calendar`);
            const data = await res.json();
            setCalendars(data);
        } catch (err) {
            console.error('Failed to fetch calendars', err);
        }
    };

    const fetchData = async () => {
        setLoading(true);
        try {
            const [path0Res, path1Res] = await Promise.all([
                fetch(`${API_URL}/routes/${route.route_id}/path?direction_id=0`),
                fetch(`${API_URL}/routes/${route.route_id}/path?direction_id=1`)
            ]);

            const path0Data = await path0Res.json().catch(() => ({}));
            const path1Data = await path1Res.json().catch(() => ({}));

            const stopsRes = await fetch(`${API_URL}/stops`);
            const allStops: Stop[] = await stopsRes.json();

            const segmentsRes = await fetch(`${API_URL}/segments`);
            const segmentsData = await segmentsRes.json();
            setSegments(segmentsData);

            const slotsMap: any[] = [];
            await Promise.all(segmentsData.map(async (seg: any) => {
                try {
                    const res = await fetch(`${API_URL}/segments/${seg.segment_id}/slots`);
                    const slots = await res.json();
                    if (Array.isArray(slots)) {
                        slotsMap.push(...slots);
                    }
                } catch (e) { console.error(e); }
            }));
            setSegmentSlots(slotsMap);

            const orderedStops0 = (path0Data.ordered_stop_ids || []).map((id: string) =>
                allStops.find(s => s.stop_id === id)
            ).filter(Boolean) as Stop[];

            const orderedStops1 = (path1Data.ordered_stop_ids || []).map((id: string) =>
                allStops.find(s => s.stop_id === id)
            ).filter(Boolean) as Stop[];

            setStopsDir0(orderedStops0);
            setStopsDir1(orderedStops1);
            setStops(direction === 0 ? orderedStops0 : orderedStops1);

            const tripsRes = await fetch(`${API_URL}/routes/${route.route_id}/trips`);
            const tripsData = await tripsRes.json();
            setTrips(tripsData);

        } catch (err) {
            console.error('Failed to fetch data', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAddTrip = async () => {
        if (!selectedServiceId) {
            alert('Protocolo de Red: Se requiere un Calendario (Service ID) activo para consignar viajes.');
            return;
        }

        const newTripId = Math.floor(100000000 + Math.random() * 900000000).toString();

        const newTrip: Partial<Trip> = {
            route_id: route.route_id,
            service_id: selectedServiceId,
            direction_id: direction,
            trip_headsign: route.route_long_name || route.route_short_name,
            trip_id: newTripId
        };

        try {
            const res = await fetch(`${API_URL}/routes/${route.route_id}/trips`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(newTrip)
            });

            if (res.ok) {
                const createdTrip = { ...newTrip, stop_times: [] } as Trip;
                setTrips(prev => [...prev, createdTrip]);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const [segments, setSegments] = useState<any[]>([]);
    const [segmentSlots, setSegmentSlots] = useState<any[]>([]);

    const DEADHEAD_FALLBACK_SECONDS = 600;
    const MIN_STOP_SPACING_SECONDS = 60;
    const MIN_TERMINAL_HEADWAY_SECONDS = 60;
    const MAX_BUNCHING_ITERATIONS = 8;

    const timeToSeconds = (timeStr: string) => {
        if (!timeStr) return 0;
        const [h, m, s] = timeStr.split(':').map(Number);
        return (h || 0) * 3600 + (m || 0) * 60 + (s || 0);
    };

    const secondsToTime = (seconds: number) => {
        const safeSeconds = Math.max(0, Math.floor(seconds));
        const h = Math.floor(safeSeconds / 3600);
        const m = Math.floor((safeSeconds % 3600) / 60);
        const s = safeSeconds % 60;
        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const addSeconds = (timeStr: string, seconds: number) => {
        if (!timeStr) return '';
        return secondsToTime(timeToSeconds(timeStr) + seconds);
    };

    const handleStopTimeChange = (tripId: string, stopId: string, field: 'arrival' | 'departure', value: string) => {
        setTrips(prev => prev.map(trip => {
            if (trip.trip_id !== tripId) return trip;

            const existingTimes = trip.stop_times || [];
            const isFirstStop = stops.length > 0 && stops[0].stop_id === stopId;
            let newStopTimes = [...existingTimes];

            const stopIndex = newStopTimes.findIndex(st => st.stop_id === stopId);
            if (stopIndex >= 0) {
                newStopTimes[stopIndex] = {
                    ...newStopTimes[stopIndex],
                    arrival_time: field === 'arrival' ? value : newStopTimes[stopIndex].arrival_time,
                    departure_time: field === 'departure' || field === 'arrival' ? value : newStopTimes[stopIndex].departure_time
                };
            } else {
                newStopTimes.push({
                    trip_id: tripId,
                    stop_id: stopId,
                    stop_sequence: stops.findIndex(s => s.stop_id === stopId) + 1,
                    arrival_time: value,
                    departure_time: value
                });
            }

            if (isFirstStop && field === 'arrival' && value !== '') {
                let currentTime = value;
                const timeMap = new Map(newStopTimes.map(st => [st.stop_id, st]));
                const propagated: StopTime[] = [];

                for (let i = 0; i < stops.length; i++) {
                    const stop = stops[i];
                    if (i === 0) {
                        propagated.push(timeMap.get(stop.stop_id)!);
                        continue;
                    }
                    const prevStop = stops[i - 1];

                    const segment = segments.find(s => s.start_node_id === prevStop.stop_id && s.end_node_id === stop.stop_id);
                    if (segment) {
                        let travelTime = segment.travel_time || 0;
                        const activeSlot = segmentSlots.find(slot =>
                            slot.segment_id === segment.segment_id &&
                            currentTime >= slot.start_time &&
                            currentTime < slot.end_time
                        );

                        if (activeSlot) {
                            travelTime = activeSlot.travel_time;
                        }

                        currentTime = addSeconds(currentTime, travelTime);
                    }
                    const existing = timeMap.get(stop.stop_id);
                    if (existing) {
                        propagated.push({ ...existing, arrival_time: currentTime, departure_time: currentTime });
                    } else {
                        propagated.push({
                            trip_id: tripId,
                            stop_id: stop.stop_id,
                            stop_sequence: i + 1,
                            arrival_time: currentTime,
                            departure_time: currentTime
                        });
                    }
                }
                newStopTimes = propagated;
            }

            return { ...trip, stop_times: newStopTimes };
        }));
    };

    const handleDeleteTrip = async (tripId: string) => {
        if (!confirm('¿Confirmas la destrucción permanente de esta expedición?')) return;
        try {
            await fetch(`${API_URL}/trips/${tripId}`, { method: 'DELETE' });
            setTrips(prev => prev.filter(t => t.trip_id !== tripId));
        } catch (err) {
            console.error(err);
        }
    };

    const handleSaveAll = async () => {
        setSaving(true);
        try {
            const promises = trips.map(trip => {
                if (!trip.stop_times) return Promise.resolve();
                return fetch(`${API_URL}/trips/${trip.trip_id}/stop_times`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ stop_times: trip.stop_times })
                });
            });
            await Promise.all(promises);
            setSuccessMessage("Horario consolidado en base de datos.");
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            console.error(err);
            alert('Fallo en el protocolo de guardado.');
        } finally {
            setSaving(false);
        }
    };

    const GetStopTime = (trip: Trip, stopId: string) => {
        return trip.stop_times?.find(st => st.stop_id === stopId)?.arrival_time || '';
    };

    const findSegment = (startStopId: string, endStopId: string) =>
        segments.find(s => s.start_node_id === startStopId && s.end_node_id === endStopId);

    const isTimeInsideRange = (value: number, start: number, end: number) => {
        if (start === end) return true;
        if (start < end) return value >= start && value < end;
        const normalized = value % 86400;
        return normalized >= start || normalized < end;
    };

    const getSegmentTravelTimeAtSeconds = (startStopId: string, endStopId: string, departureSeconds: number) => {
        const segment = findSegment(startStopId, endStopId);
        if (!segment) return 0;

        const travelTime = Number(segment.travel_time) || 0;
        const slotsForSegment = segmentSlots.filter(slot => slot.segment_id === segment.segment_id);

        if (slotsForSegment.length === 0) return travelTime;

        const normalizedDeparture = ((departureSeconds % 86400) + 86400) % 86400;
        for (const slot of slotsForSegment) {
            const slotStart = timeToSeconds(slot.start_time);
            const slotEnd = timeToSeconds(slot.end_time);
            if (isTimeInsideRange(normalizedDeparture, slotStart, slotEnd)) {
                const slotTravel = Number(slot.travel_time);
                if (Number.isFinite(slotTravel) && slotTravel > 0) {
                    return slotTravel;
                }
                return travelTime;
            }
        }

        return travelTime;
    };

    const getDeadheadTravelTimeAtSeconds = (startStopId: string, endStopId: string, departureSeconds: number) => {
        if (startStopId === endStopId) return 0;
        const segment = findSegment(startStopId, endStopId);
        if (!segment) return DEADHEAD_FALLBACK_SECONDS;
        return Number(segment.travel_time) || getSegmentTravelTimeAtSeconds(startStopId, endStopId, departureSeconds);
    };

    const generateStopTimesForTripAndStopsAtSeconds = (tripId: string, startSeconds: number, pathStops: Stop[]): GeneratedTripPlan => {
        const stopTimes: StopTime[] = [];
        const arrivals: number[] = [];
        let currentSeconds = startSeconds;

        for (let i = 0; i < pathStops.length; i++) {
            const stop = pathStops[i];

            stopTimes.push({
                trip_id: tripId,
                stop_id: stop.stop_id,
                stop_sequence: i + 1,
                arrival_time: secondsToTime(currentSeconds),
                departure_time: secondsToTime(currentSeconds)
            });
            arrivals.push(currentSeconds);

            if (i < pathStops.length - 1) {
                const nextStop = pathStops[i + 1];
                const travelTime = getSegmentTravelTimeAtSeconds(stop.stop_id, nextStop.stop_id, currentSeconds);
                currentSeconds += travelTime;
            }
        }

        return {
            stop_times: stopTimes,
            arrivals,
            start_seconds: startSeconds,
            end_seconds: arrivals.length > 0 ? arrivals[arrivals.length - 1] : startSeconds
        };
    };

    const generateStopTimesForTrip = (tripId: string, startTime: string) => {
        return generateStopTimesForTripAndStops(tripId, startTime, stops);
    };

    const generateStopTimesForTripAndStops = (tripId: string, startTime: string, pathStops: Stop[]) => {
        const tripPlan = generateStopTimesForTripAndStopsAtSeconds(tripId, timeToSeconds(startTime), pathStops);
        return tripPlan.stop_times;
    };

    const computeSpacingDelay = (previousArrivals: number[] | null, candidateArrivals: number[]) => {
        if (!previousArrivals || previousArrivals.length === 0 || candidateArrivals.length === 0) return 0;
        const comparedStops = Math.min(previousArrivals.length, candidateArrivals.length);
        let maxDelayNeeded = 0;

        for (let i = 0; i < comparedStops; i++) {
            const delayNeeded = (previousArrivals[i] + MIN_STOP_SPACING_SECONDS) - candidateArrivals[i];
            if (delayNeeded > maxDelayNeeded) {
                maxDelayNeeded = delayNeeded;
            }
        }

        return Math.max(0, maxDelayNeeded);
    };

    const getCycleTravelTime = () => {
        let cycleTotal = 0;
        const getPathTime = (pathStops: Stop[]) => {
            let total = 0;
            for (let i = 0; i < pathStops.length - 1; i++) {
                total += getSegmentTravelTimeAtSeconds(pathStops[i].stop_id, pathStops[i + 1].stop_id, 0);
            }
            return total;
        };
        const timeDir0 = getPathTime(stopsDir0);
        const timeDir1 = getPathTime(stopsDir1);
        cycleTotal += timeDir0 + timeDir1;
        if (stopsDir0.length > 0 && stopsDir1.length > 0) {
            const dir0End = stopsDir0[stopsDir0.length - 1].stop_id;
            const dir1Start = stopsDir1[0].stop_id;
            cycleTotal += getDeadheadTravelTimeAtSeconds(dir0End, dir1Start, 0);
            const dir1End = stopsDir1[stopsDir1.length - 1].stop_id;
            const dir0Start = stopsDir0[0].stop_id;
            cycleTotal += getDeadheadTravelTimeAtSeconds(dir1End, dir0Start, 0);
        } else if (stopsDir0.length > 0) {
            const dir0End = stopsDir0[stopsDir0.length - 1].stop_id;
            const dir0Start = stopsDir0[0].stop_id;
            cycleTotal += getDeadheadTravelTimeAtSeconds(dir0End, dir0Start, 0);
        }
        return cycleTotal;
    };

    const buildFleetRanges = (ranges: AutoTripsConfig['ranges']): FleetRangePlan[] => {
        return ranges
            .map(range => {
                const normalizedStart = timeToSeconds(formatTimeInput(range.start_time));
                let normalizedEnd = timeToSeconds(formatTimeInput(range.end_time));
                if (normalizedEnd <= normalizedStart) normalizedEnd += 86400;

                return {
                    start_seconds: normalizedStart,
                    end_seconds: normalizedEnd,
                    buses: Math.max(0, Math.floor(range.value))
                };
            })
            .filter(range => range.buses > 0 && range.end_seconds > range.start_seconds)
            .sort((a, b) => a.start_seconds - b.start_seconds);
    };

    const buildTripEntity = (
        tripId: string,
        serviceIdToUse: string,
        directionId: number,
        plan: GeneratedTripPlan,
        blockId?: string
    ): Trip => ({
        trip_id: tripId,
        route_id: route.route_id,
        service_id: serviceIdToUse,
        direction_id: directionId,
        block_id: blockId,
        trip_headsign: route.route_long_name || route.route_short_name,
        shape_id: '',
        stop_times: plan.stop_times.map(st => ({ ...st, trip_id: tripId }))
    });

    const estimateCycleFromDir0Start = (startSeconds: number) => {
        if (stopsDir0.length === 0) return 0;
        const dir0Plan = generateStopTimesForTripAndStopsAtSeconds('__probe_dir0__', startSeconds, stopsDir0);
        const dir0EndStop = stopsDir0[stopsDir0.length - 1]?.stop_id;
        const dir0StartStop = stopsDir0[0]?.stop_id;
        if (!dir0EndStop || !dir0StartStop) return 0;
        if (stopsDir1.length > 0) {
            const dir1StartStop = stopsDir1[0]?.stop_id;
            const dir1EndStop = stopsDir1[stopsDir1.length - 1]?.stop_id;
            if (!dir1StartStop || !dir1EndStop) return Math.max(0, dir0Plan.end_seconds - startSeconds);
            const travelToDir1 = getDeadheadTravelTimeAtSeconds(dir0EndStop, dir1StartStop, dir0Plan.end_seconds);
            const dir1StartSeconds = dir0Plan.end_seconds + travelToDir1;
            const dir1Plan = generateStopTimesForTripAndStopsAtSeconds('__probe_dir1__', dir1StartSeconds, stopsDir1);
            const returnToDir0 = getDeadheadTravelTimeAtSeconds(dir1EndStop, dir0StartStop, dir1Plan.end_seconds);
            return Math.max(0, (dir1Plan.end_seconds + returnToDir0) - startSeconds);
        }
        const loopReturn = getDeadheadTravelTimeAtSeconds(dir0EndStop, dir0StartStop, dir0Plan.end_seconds);
        return Math.max(0, (dir0Plan.end_seconds + loopReturn) - startSeconds);
    };

    const buildCoupledPlans = (
        proposedStartSeconds: number,
        previousDir0Arrivals: number[] | null,
        previousDir1Arrivals: number[] | null
    ) => {
        const dir0EndStop = stopsDir0[stopsDir0.length - 1]?.stop_id;
        const dir0StartStop = stopsDir0[0]?.stop_id;
        const dir1StartStop = stopsDir1[0]?.stop_id;
        const dir1EndStop = stopsDir1[stopsDir1.length - 1]?.stop_id;

        let startSeconds = proposedStartSeconds;
        let dir0Plan = generateStopTimesForTripAndStopsAtSeconds('__tmp_dir0__', startSeconds, stopsDir0);
        let dir1Plan: GeneratedTripPlan | null = null;

        for (let i = 0; i < MAX_BUNCHING_ITERATIONS; i++) {
            dir0Plan = generateStopTimesForTripAndStopsAtSeconds('__tmp_dir0__', startSeconds, stopsDir0);
            if (stopsDir1.length > 0 && dir0EndStop && dir1StartStop) {
                const travelToDir1 = getDeadheadTravelTimeAtSeconds(dir0EndStop, dir1StartStop, dir0Plan.end_seconds);
                dir1Plan = generateStopTimesForTripAndStopsAtSeconds('__tmp_dir1__', dir0Plan.end_seconds + travelToDir1, stopsDir1);
            } else {
                dir1Plan = null;
            }
            const delayForDir0 = computeSpacingDelay(previousDir0Arrivals, dir0Plan.arrivals);
            const delayForDir1 = dir1Plan ? computeSpacingDelay(previousDir1Arrivals, dir1Plan.arrivals) : 0;
            const requiredDelay = Math.max(delayForDir0, delayForDir1);
            if (requiredDelay <= 0) break;
            startSeconds += requiredDelay;
        }

        dir0Plan = generateStopTimesForTripAndStopsAtSeconds('__tmp_dir0__', startSeconds, stopsDir0);
        if (stopsDir1.length > 0 && dir0EndStop && dir1StartStop) {
            const travelToDir1 = getDeadheadTravelTimeAtSeconds(dir0EndStop, dir1StartStop, dir0Plan.end_seconds);
            dir1Plan = generateStopTimesForTripAndStopsAtSeconds('__tmp_dir1__', dir0Plan.end_seconds + travelToDir1, stopsDir1);
        } else {
            dir1Plan = null;
        }

        let nextAvailableAt = dir0Plan.end_seconds;
        if (dir1Plan && dir1EndStop && dir0StartStop) {
            nextAvailableAt = dir1Plan.end_seconds + getDeadheadTravelTimeAtSeconds(dir1EndStop, dir0StartStop, dir1Plan.end_seconds);
        } else if (dir0EndStop && dir0StartStop) {
            nextAvailableAt = dir0Plan.end_seconds + getDeadheadTravelTimeAtSeconds(dir0EndStop, dir0StartStop, dir0Plan.end_seconds);
        }

        return {
            start_seconds: startSeconds,
            dir0Plan,
            dir1Plan,
            next_available_at: nextAvailableAt
        };
    };

    const generateTripsFromStarts = (
        serviceIdToUse: string,
        startTimes: string[],
        existingStartTimes: Set<string>,
        duplicates: string[]
    ) => {
        const newTripsData: Trip[] = [];
        for (const startTimeRaw of startTimes) {
            const startTime = formatTimeInput(startTimeRaw);
            if (existingStartTimes.has(startTime)) {
                duplicates.push(startTime);
                continue;
            }
            if (stopsDir0.length === 0) continue;
            const startSeconds = timeToSeconds(startTime);
            const dir0TripId = Math.floor(100000000 + Math.random() * 900000000).toString();
            const dir0Plan = generateStopTimesForTripAndStopsAtSeconds(dir0TripId, startSeconds, stopsDir0);
            newTripsData.push(buildTripEntity(dir0TripId, serviceIdToUse, 0, dir0Plan));
            if (stopsDir1.length > 0) {
                const dir0EndStop = stopsDir0[stopsDir0.length - 1]?.stop_id;
                const dir1StartStop = stopsDir1[0]?.stop_id;
                if (dir0EndStop && dir1StartStop) {
                    const travelToDir1 = getDeadheadTravelTimeAtSeconds(dir0EndStop, dir1StartStop, dir0Plan.end_seconds);
                    const dir1TripId = Math.floor(100000000 + Math.random() * 900000000).toString();
                    const dir1Plan = generateStopTimesForTripAndStopsAtSeconds(dir1TripId, dir0Plan.end_seconds + travelToDir1, stopsDir1);
                    newTripsData.push(buildTripEntity(dir1TripId, serviceIdToUse, 1, dir1Plan));
                }
            }
        }
        return newTripsData;
    };

    const generateTripsByFixedFleet = (serviceIdToUse: string, ranges: FleetRangePlan[]) => {
        if (stopsDir0.length === 0 || ranges.length === 0) return [];
        const newTripsData: Trip[] = [];
        const activeFleet: FleetBusState[] = [];
        const parkedFleet: FleetBusState[] = [];
        let nextFleetId = 1;
        let previousDir0Arrivals: number[] | null = null;
        let previousDir1Arrivals: number[] | null = null;
        let previousDir0Departure: number | null = null;

        for (const range of ranges) {
            while (activeFleet.length < range.buses) {
                parkedFleet.sort((a, b) => a.available_at - b.available_at);
                const reused = parkedFleet.shift();
                if (reused) {
                    reused.available_at = Math.max(reused.available_at, range.start_seconds);
                    activeFleet.push(reused);
                } else {
                    activeFleet.push({ fleet_id: nextFleetId++, available_at: range.start_seconds });
                }
            }
            while (activeFleet.length > range.buses) {
                activeFleet.sort((a, b) => b.available_at - a.available_at || b.fleet_id - a.fleet_id);
                const removed = activeFleet.shift();
                if (removed) parkedFleet.push(removed);
            }
            let guard = 0;
            while (activeFleet.length > 0 && guard < 10000) {
                guard++;
                activeFleet.sort((a, b) => a.available_at - b.available_at || a.fleet_id - b.fleet_id);
                const bus = activeFleet[0];
                const earliestBusStart = Math.max(bus.available_at, range.start_seconds);
                if (earliestBusStart >= range.end_seconds) break;
                const cycleEstimate = Math.max(1, estimateCycleFromDir0Start(earliestBusStart));
                const targetHeadway = Math.max(MIN_TERMINAL_HEADWAY_SECONDS, Math.round(cycleEstimate / Math.max(1, range.buses)));
                const nextHeadwayDeparture = previousDir0Departure === null ? range.start_seconds : previousDir0Departure + targetHeadway;
                const baseStart = Math.max(earliestBusStart, nextHeadwayDeparture, range.start_seconds);
                const planned = buildCoupledPlans(baseStart, previousDir0Arrivals, previousDir1Arrivals);
                if (planned.start_seconds >= range.end_seconds) {
                    bus.available_at = Math.max(bus.available_at, range.end_seconds);
                    continue;
                }
                if (previousDir0Departure !== null && planned.start_seconds <= previousDir0Departure) {
                    bus.available_at = previousDir0Departure + MIN_TERMINAL_HEADWAY_SECONDS;
                    continue;
                }
                const blockId = `BUS-${bus.fleet_id.toString().padStart(4, '0')}`;
                const dir0TripId = Math.floor(100000000 + Math.random() * 900000000).toString();
                newTripsData.push(buildTripEntity(dir0TripId, serviceIdToUse, 0, planned.dir0Plan, blockId));
                if (planned.dir1Plan) {
                    const dir1TripId = Math.floor(100000000 + Math.random() * 900000000).toString();
                    newTripsData.push(buildTripEntity(dir1TripId, serviceIdToUse, 1, planned.dir1Plan, blockId));
                    previousDir1Arrivals = planned.dir1Plan.arrivals;
                }
                bus.available_at = planned.next_available_at;
                previousDir0Departure = planned.start_seconds;
                previousDir0Arrivals = planned.dir0Plan.arrivals;
            }
        }
        return newTripsData;
    };

    const [isClearing, setIsClearing] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const handleBulkCreateTrips = async (config: AutoTripsConfig) => {
        const serviceIdToUse = selectedServiceId;
        const patternTripIds = new Set([`t_${route.route_id}_0`, `t_${route.route_id}_1`]);
        const existingTripsForService = trips.filter(t =>
            t.service_id === serviceIdToUse &&
            t.route_id === route.route_id &&
            !patternTripIds.has(t.trip_id)
        );

        const existingStartTimes = new Set(
            existingTripsForService
                .filter(t => t.direction_id === 0)
                .map(t => GetStopTime(t, stopsDir0[0]?.stop_id))
        );

        const duplicates: string[] = [];
        let newTripsData: Trip[] = [];

        if (config.mode === 'buses') {
            if (existingTripsForService.length > 0) {
                alert('El modo Proyección de Flota requiere una tabla vacía para garantizar exactitud operativa. Limpie el horario y vuelva a generar.');
                return;
            }
            const fleetRanges = buildFleetRanges(config.ranges);
            newTripsData = generateTripsByFixedFleet(serviceIdToUse, fleetRanges);
        } else {
            const orderedStarts = [...config.trips].sort((a, b) => timeToSeconds(a) - timeToSeconds(b));
            newTripsData = generateTripsFromStarts(serviceIdToUse, orderedStarts, existingStartTimes, duplicates);
        }

        if (duplicates.length > 0) {
            alert(`Suministro Omitido: ${duplicates.length} viajes duplicados en: ${duplicates.join(', ')}`);
        }

        if (newTripsData.length === 0) {
            alert('No fue posible consolidar la proyección con la configuración actual.');
            return;
        }

        setSaving(true);
        try {
            const savePromises = newTripsData.map(async (trip) => {
                const tripRes = await fetch(`${API_URL}/routes/${route.route_id}/trips`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...trip,
                        stop_times: undefined
                    })
                });
                if (!tripRes.ok) throw new Error(`Failed to create trip ${trip.trip_id}`);
                if (trip.stop_times && trip.stop_times.length > 0) {
                    await fetch(`${API_URL}/trips/${trip.trip_id}/stop_times`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ stop_times: trip.stop_times })
                    });
                }
            });
            await Promise.all(savePromises);
            setTrips(prev => [...prev, ...newTripsData]);
            setSuccessMessage(`Consignación exitosa: ${newTripsData.length} viajes generados.`);
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            console.error(err);
            alert('Fallo en la sincronización del suministro generado.');
        } finally {
            setSaving(false);
        }
    };

    const confirmClearTimetable = async () => {
        setIsClearing(true);
        setShowClearConfirm(false);
        const patternTripId = `t_${route.route_id}_${direction}`;
        const tripsToDelete = trips
            .filter(t => t.service_id === selectedServiceId)
            .filter(t => t.trip_id !== patternTripId)
            .map(t => t.trip_id);

        if (tripsToDelete.length === 0) {
            setIsClearing(false);
            alert("Protocolo vacío: No hay viajes para eliminar.");
            return;
        }

        try {
            await Promise.all(tripsToDelete.map(id => fetch(`${API_URL}/trips/${id}`, { method: 'DELETE' })));
            setTrips(prev => prev.filter(t => !tripsToDelete.includes(t.trip_id)));
            setSuccessMessage("Horario purgado exitosamente.");
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            console.error(err);
            alert('Fallo parcial en el purgado del servidor.');
            fetchData();
        } finally {
            setIsClearing(false);
        }
    };

    const handleUpdateTravelTimes = () => {
        if (!confirm("Este protocolo recalculará TODOS los tiempos de paso basándose en las VELOCIDADES ACTUALES de los segmentos.\n\nSe preservará la hora de salida de cada viaje.\n\n¿Continuar?")) return;
        let updatedCount = 0;
        const updatedTrips = trips.map(trip => {
            if (trip.service_id !== selectedServiceId || trip.trip_id === `t_${route.route_id}_${direction}`) return trip;
            const firstStopTime = GetStopTime(trip, stops[0]?.stop_id);
            if (!firstStopTime) return trip;
            const newStopTimes = generateStopTimesForTrip(trip.trip_id, firstStopTime);
            updatedCount++;
            return { ...trip, stop_times: newStopTimes };
        });
        setTrips(updatedTrips);
        setSuccessMessage(`Recálculo completado: ${updatedCount} viajes actualizados.`);
        setTimeout(() => setSuccessMessage(null), 3000);
    };

    const displayedTrips = trips
        .filter(t => t.service_id === selectedServiceId && t.direction_id === direction && t.trip_id !== `t_${route.route_id}_${direction}`)
        .sort((a, b) => {
            const timeA = GetStopTime(a, stops[0]?.stop_id) || '23:59:59';
            const timeB = GetStopTime(b, stops[0]?.stop_id) || '23:59:59';
            return timeA.localeCompare(timeB);
        });

    const duplicateTripIds = React.useMemo(() => {
        const timeMap = new Map<string, string[]>();
        displayedTrips.forEach(t => {
            const startTime = GetStopTime(t, stops[0]?.stop_id);
            if (!startTime) return;
            const existing = timeMap.get(startTime) || [];
            timeMap.set(startTime, [...existing, t.trip_id]);
        });
        const duplicates = new Set<string>();
        timeMap.forEach(ids => {
            if (ids.length > 1) ids.forEach(id => duplicates.add(id));
        });
        return duplicates;
    }, [displayedTrips, stops]);

    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, tripId: string, stopId: string } | null>(null);
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const handleContextMenu = (e: React.MouseEvent, tripId: string, stopId: string) => {
        e.preventDefault();
        setContextMenu({ x: e.clientX, y: e.clientY, tripId, stopId });
    };

    const handleClearTime = () => {
        if (!contextMenu) return;
        handleStopTimeChange(contextMenu.tripId, contextMenu.stopId, 'arrival', '');
        setContextMenu(null);
    };

    const handleRestoreTime = () => {
        if (!contextMenu) return;
        const { tripId, stopId } = contextMenu;
        const trip = trips.find(t => t.trip_id === tripId);
        if (!trip) return;
        const stopIndex = stops.findIndex(s => s.stop_id === stopId);
        if (stopIndex <= 0) return;
        let prevStopIndex = stopIndex - 1;
        let prevTime = '';
        while (prevStopIndex >= 0) {
            const t = GetStopTime(trip, stops[prevStopIndex].stop_id);
            if (t) { prevTime = t; break; }
            prevStopIndex--;
        }
        if (!prevTime) {
            alert("Imposible restaurar: No hay registros previos para interpolación.");
            return;
        }
        let accumulatedSeconds = 0;
        for (let i = prevStopIndex; i < stopIndex; i++) {
            const fromId = stops[i].stop_id;
            const toId = stops[i + 1].stop_id;
            const seg = segments.find(s => s.start_node_id === fromId && s.end_node_id === toId);
            accumulatedSeconds += (seg?.travel_time || 0);
        }
        const newTime = addSeconds(prevTime, accumulatedSeconds);
        handleStopTimeChange(tripId, stopId, 'arrival', newTime);
        setContextMenu(null);
    };

    return (
        <div className="fixed inset-0 bg-white dark:bg-slate-950 z-[80] flex flex-col animate-in slide-in-from-bottom-8 duration-700 ease-out-expo overflow-hidden">
            
            {/* Tactical Spreadsheet Header */}
            <div className="border-b utilitarian-border px-10 py-8 flex flex-col xl:flex-row justify-between items-center gap-8 bg-slate-50 dark:bg-slate-900/50 backdrop-blur-sm relative">
                
                {/* Protocol Success Notification Overlay */}
                {successMessage && (
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-emerald-500 text-white px-8 py-4 rounded-[20px] shadow-2xl shadow-emerald-500/30 flex items-center gap-3 animate-in zoom-in-95 fade-in duration-300 z-[100] border-4 border-white dark:border-slate-800">
                        <CheckCircle size={24} strokeWidth={2.5} />
                        <span className="text-[11px] font-black uppercase tracking-[0.2em]">{successMessage}</span>
                    </div>
                )}

                <div className="flex items-center gap-8 w-full xl:w-auto">
                    <button onClick={onClose} className="p-4 bg-white dark:bg-slate-800 rounded-[22px] border utilitarian-border text-slate-400 hover:text-slate-900 dark:hover:text-white transition-all shadow-sm active:scale-95 group">
                        <X size={24} strokeWidth={2.5} className="group-hover:rotate-90 transition-transform duration-500" />
                    </button>
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                             <h2 className="text-2xl font-display font-black text-slate-900 dark:text-white uppercase tracking-tight leading-none flex items-center gap-3">
                                <Clock size={28} className="text-primary" strokeWidth={2.5} />
                                Matriz Horaria
                            </h2>
                            <div className="px-3 py-1 bg-primary/10 text-primary rounded-full border border-primary/20 text-[9px] font-black uppercase tracking-widest">
                                Gestión de Suministro
                            </div>
                        </div>
                        <div className="flex items-center gap-4">
                             <span className="text-[12px] font-mono font-black text-slate-900 dark:text-white bg-white dark:bg-white/10 px-3 py-1 rounded-lg border utilitarian-border">
                                {route.route_short_name}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.25em]">{route.route_long_name}</span>
                        </div>
                    </div>
                </div>

                {/* Tactical Controls & Filters */}
                <div className="flex flex-wrap items-center gap-6 w-full xl:w-auto xl:justify-end">
                    
                    {/* Directional Protocol Toggle */}
                    <div className="flex items-center gap-3 bg-white dark:bg-slate-800 p-1.5 rounded-[22px] border utilitarian-border shadow-sm">
                        <button
                            onClick={() => setDirection(0)}
                            className={clsx(
                                "px-6 py-2.5 rounded-[18px] text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                                direction === 0 ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-slate-400 hover:text-slate-900 dark:hover:text-white"
                            )}
                        >
                             <ChevronRight size={14} className={clsx(direction === 0 ? "rotate-0" : "rotate-0 opacity-0")} />
                            Salida (0)
                        </button>
                        <button
                            onClick={() => setDirection(1)}
                            className={clsx(
                                "px-6 py-2.5 rounded-[18px] text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2",
                                direction === 1 ? "bg-primary text-white shadow-lg shadow-primary/20" : "text-slate-400 hover:text-slate-900 dark:hover:text-white"
                            )}
                        >
                            <ChevronRight size={14} className={clsx(direction === 1 ? "rotate-0" : "rotate-0 opacity-0")} />
                            Regreso (1)
                        </button>
                    </div>

                    <div className="w-px h-10 bg-slate-200 dark:bg-slate-700 mx-2 hidden xl:block" />

                    {/* Operational Actions Stack */}
                    <div className="flex items-center gap-3">
                         {/* Service Selection */}
                        <div className="flex items-center gap-4 bg-white dark:bg-slate-800 px-5 py-3 rounded-[22px] border utilitarian-border shadow-sm group hover:border-primary/50 transition-colors">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Calendario:</span>
                            <select
                                value={selectedServiceId}
                                onChange={(e) => setSelectedServiceId(e.target.value)}
                                className="bg-transparent text-[11px] font-black text-slate-900 dark:text-white outline-none cursor-pointer uppercase tracking-tight"
                            >
                                {calendars.map(c => (
                                    <option key={c.service_id} value={c.service_id}>{c.service_id}</option>
                                ))}
                            </select>
                        </div>

                        <button
                            onClick={() => setShowClearConfirm(true)}
                            className="p-4 bg-white dark:bg-slate-800 text-slate-400 hover:text-red-500 rounded-[22px] border utilitarian-border transition-all shadow-sm active:scale-95 group"
                            title="Purgar Horario"
                            disabled={isClearing}
                        >
                            {isClearing ? <Loader2 size={24} className="animate-spin text-red-500" /> : <Trash2 size={24} strokeWidth={2.5} />}
                        </button>

                        <button
                            onClick={handleUpdateTravelTimes}
                            className="flex items-center gap-3 px-6 py-4 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border utilitarian-border rounded-[22px] hover:text-primary transition-all font-black text-[10px] uppercase tracking-widest shadow-sm active:scale-95 group"
                            title="Recalcular velocidades de tramos"
                        >
                            <RefreshCw size={18} strokeWidth={2.5} className="group-hover:rotate-180 transition-transform duration-700" /> 
                            <span className="hidden sm:inline">Recalcular Tiempos</span>
                        </button>

                        <button
                            onClick={() => setIsAutoModalOpen(true)}
                            className="flex items-center gap-3 px-6 py-4 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border utilitarian-border rounded-[22px] hover:text-indigo-500 transition-all font-black text-[10px] uppercase tracking-widest shadow-sm active:scale-95"
                            title="Proyectar viajes automáticos"
                        >
                            <Wand2 size={18} strokeWidth={2.5} />
                             <span className="hidden sm:inline">Proyección</span>
                        </button>

                        <button
                            onClick={handleAddTrip}
                            className="flex items-center gap-3 px-6 py-4 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border utilitarian-border rounded-[22px] hover:text-primary transition-all font-black text-[10px] uppercase tracking-widest shadow-sm active:scale-95"
                        >
                            <Plus size={18} strokeWidth={3} />
                             <span className="hidden sm:inline">Anclar Viaje</span>
                        </button>

                        <button
                            onClick={handleSaveAll}
                            disabled={saving}
                            className="flex items-center gap-3 px-8 py-4 bg-primary text-white rounded-[22px] hover:scale-105 active:scale-95 transition-all font-black text-[11px] uppercase tracking-[0.2em] shadow-2xl shadow-primary/30 disabled:opacity-30 disabled:cursor-not-allowed group"
                        >
                            {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} strokeWidth={2.5} className="group-hover:-translate-y-1 transition-transform" />}
                            {saving ? 'PROCESANDO...' : 'CONSOLIDAR MATRIZ'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Tactical Spreadsheet Grid */}
            <div className="flex-1 overflow-auto bg-slate-100 dark:bg-slate-950 p-6 lg:p-10 custom-scrollbar relative">
                
                {/* Clearing Protocol Overlay */}
                {isClearing && (
                    <div className="absolute inset-0 bg-white/60 dark:bg-slate-950/60 z-[90] flex items-center justify-center backdrop-blur-md animate-in fade-in duration-500">
                        <div className="flex flex-col items-center gap-6 bg-white dark:bg-slate-800 p-12 rounded-[40px] shadow-[0_0_100px_rgba(0,0,0,0.2)] border utilitarian-border">
                            <Loader2 size={64} className="text-red-500 animate-spin" strokeWidth={2.5} />
                            <p className="text-[12px] font-black text-slate-900 dark:text-white uppercase tracking-[0.4em]">Purgando Suministro...</p>
                        </div>
                    </div>
                )}

                {loading ? (
                    <div className="h-full flex flex-col items-center justify-center gap-6 text-slate-300 animate-pulse">
                         <div className="w-16 h-16 rounded-full border-8 border-slate-200 dark:border-slate-800 border-t-primary animate-spin" />
                         <span className="text-[10px] font-black uppercase tracking-[0.4em]">Iniciando Protocolo...</span>
                    </div>
                ) : stops.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-8 max-w-lg mx-auto text-center opacity-80">
                        <div className="p-10 bg-white dark:bg-slate-800 rounded-[50px] shadow-2xl shadow-slate-200 dark:shadow-none border utilitarian-border rotate-3">
                             <ShieldAlert size={80} strokeWidth={1.5} className="text-amber-500" />
                        </div>
                        <div className="space-y-4">
                            <p className="text-2xl font-display font-black text-slate-900 dark:text-white uppercase tracking-tight italic">Trazado no detectado</p>
                            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest leading-relaxed">
                                No se han identificado nodos de red para este sentido. 
                                Acceda a la vista de mapa táctico para consolidar la infraestructura de tramos primero.
                            </p>
                        </div>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-slate-900 border utilitarian-border rounded-[40px] shadow-sm inline-block min-w-full relative overflow-hidden transition-all duration-700 animate-in slide-in-from-bottom-4">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr>
                                    {/* Locked First Column: Infrastructure Nodos */}
                                    <th className="sticky left-0 z-40 bg-slate-50 dark:bg-slate-800 border-b border-r utilitarian-border p-8 min-w-[320px] text-left shadow-[10px_0_20px_rgba(0,0,0,0.02)]">
                                        <div className="flex items-center gap-4 mb-2">
                                            <Database size={20} className="text-primary/60" />
                                            <div className="text-[11px] font-black text-slate-900 dark:text-white uppercase tracking-[0.2em]">Infraestructura de Nodos</div>
                                        </div>
                                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                                            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" /> {stops.length} entidades de parada activas
                                        </div>
                                    </th>

                                    {/* Expedition (Trip) Columns */}
                                    {displayedTrips.map((trip) => {
                                        const isDuplicate = duplicateTripIds.has(trip.trip_id);
                                        return (
                                            <th key={trip.trip_id} className={clsx(
                                                "min-w-[140px] border-b border-r utilitarian-border p-6 transition-colors group",
                                                isDuplicate ? "bg-red-500/5" : "bg-slate-50/50 dark:bg-slate-800/30 group-hover:bg-slate-50 dark:group-hover:bg-slate-800"
                                            )}>
                                                <div className="flex flex-col gap-4 items-center">
                                                    <div className="flex items-center justify-between w-full">
                                                         <div className={clsx(
                                                            "flex flex-col items-center gap-1.5",
                                                            isDuplicate ? "text-red-600" : "text-slate-400 group-hover:text-primary transition-colors"
                                                         )}>
                                                            <div className="flex items-center gap-2">
                                                                {isDuplicate ? <AlertCircle size={14} strokeWidth={2.5} /> : <Activity size={12} />}
                                                                <span className="text-[12px] font-mono font-black tracking-tighter">T-{trip.trip_id.substring(0,6)}</span>
                                                            </div>
                                                            {trip.block_id && (
                                                                <span className="text-[9px] font-black bg-slate-900 text-white dark:bg-white dark:text-slate-900 px-2 py-0.5 rounded-md tracking-tight">{trip.block_id}</span>
                                                            )}
                                                         </div>
                                                         <button
                                                            onClick={() => handleDeleteTrip(trip.trip_id)}
                                                            className="p-2 text-slate-200 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/40 rounded-xl transition-all opacity-0 group-hover:opacity-100 scale-90 hover:scale-100"
                                                            title="Eliminar Expedición"
                                                        >
                                                            <Trash2 size={16} strokeWidth={2.5} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </th>
                                        )
                                    })}

                                    {/* Expansion UI */}
                                    <th className="min-w-[120px] border-b utilitarian-border bg-slate-50/20 dark:bg-white/5 p-8 text-center group">
                                        <button
                                            onClick={handleAddTrip}
                                            className="w-12 h-12 rounded-[20px] bg-white dark:bg-slate-800 border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-300 hover:text-primary hover:border-primary/50 hover:bg-white transition-all shadow-sm flex items-center justify-center group-hover:scale-110 group-active:scale-95"
                                        >
                                            <Plus size={24} strokeWidth={3} />
                                        </button>
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                {stops.map((stop, stopIdx) => (
                                    <tr key={stop.stop_id} className="hover:bg-primary/[0.02] dark:hover:bg-primary/5 transition-colors group/row">
                                        {/* Locked Infrastructure Entity Name */}
                                        <td className="sticky left-0 z-30 bg-white dark:bg-slate-900 group-hover/row:bg-slate-50 dark:group-hover/row:bg-slate-800 border-r utilitarian-border p-5 px-8 shadow-[10px_0_20px_rgba(0,0,0,0.02)] transition-colors">
                                            <div className="flex items-center gap-6">
                                                <div className="w-10 h-10 rounded-[14px] bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover/row:bg-primary group-hover/row:text-white flex items-center justify-center text-[14px] font-black transition-all border utilitarian-border">
                                                    {(stopIdx + 1).toString().padStart(2, '0')}
                                                </div>
                                                <div className="overflow-hidden space-y-1">
                                                    <div className="text-[13px] font-black text-slate-800 dark:text-slate-100 uppercase tracking-tight truncate group-hover/row:text-primary transition-colors">{stop.stop_name}</div>
                                                    <div className="flex items-center gap-2">
                                                        <Hash size={10} className="text-slate-300" />
                                                        <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest">{stop.stop_id.substring(0, 12)}...</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Input Matrix Grid */}
                                        {displayedTrips.map(trip => (
                                            <td key={`${trip.trip_id}-${stop.stop_id}`} className="border-r utilitarian-border p-2 text-center group/cell">
                                                <div className="relative">
                                                     <input
                                                        type="text"
                                                        className={clsx(
                                                            "w-full text-center py-4 text-[13px] bg-transparent outline-none rounded-xl font-mono font-black placeholder:text-slate-100 dark:placeholder:text-slate-800 transition-all text-slate-900 dark:text-slate-100 cursor-context-menu focus:bg-primary/5 focus:ring-2 focus:ring-primary/20",
                                                            GetStopTime(trip, stop.stop_id) ? "text-slate-900 dark:text-slate-100" : "text-slate-200 dark:text-slate-700"
                                                        )}
                                                        placeholder="--:--:--"
                                                        value={GetStopTime(trip, stop.stop_id)}
                                                        onChange={(e) => handleStopTimeChange(trip.trip_id, stop.stop_id, 'arrival', e.target.value)}
                                                        onBlur={(e) => handleStopTimeChange(trip.trip_id, stop.stop_id, 'arrival', formatTimeInput(e.target.value))}
                                                        onContextMenu={(e) => handleContextMenu(e, trip.trip_id, stop.stop_id)}
                                                    />
                                                    {GetStopTime(trip, stop.stop_id) && (
                                                        <div className="absolute right-2 top-1/2 -translate-y-1/2 w-1 h-1 bg-primary rounded-full opacity-40" />
                                                    )}
                                                </div>
                                            </td>
                                        ))}

                                        {/* Matrix Grid Decoration */}
                                        <td className="bg-slate-50/10 dark:bg-white/5"></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Tactical Detail Overlay: Absolute Decorators */}
            <div className="absolute bottom-8 left-12 flex items-center gap-12 pointer-events-none opacity-40">
                <div className="flex items-center gap-2">
                    <Database size={14} />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Matrix Tier: Extreme High-Res</span>
                </div>
                <div className="flex items-center gap-2">
                    <Activity size={14} />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">Engine: V8 GTFS Propulsion</span>
                </div>
                <div className="flex items-center gap-2">
                     <LayoutGrid size={14} />
                     <span className="text-[10px] font-black uppercase tracking-[0.2em]">{displayedTrips.length} EXPEDICIONES ACTIVAS</span>
                </div>
            </div>

            {/* Context Intelligence Menu */}
            {contextMenu && (
                <div
                    className="fixed bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-[28px] shadow-[0_20px_50px_rgba(0,0,0,0.2)] z-[100] p-3 min-w-[220px] animate-in zoom-in-95 fade-in duration-200"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="px-5 py-3 mb-2 border-b utilitarian-border">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Protocolo de Celda</p>
                    </div>
                    <button
                        onClick={handleRestoreTime}
                        className="w-full text-left px-5 py-4 text-[12px] font-black text-slate-800 dark:text-slate-100 hover:bg-primary/5 rounded-[18px] flex items-center gap-3 group transition-colors uppercase tracking-tight"
                    >
                        <Clock size={16} className="text-primary group-hover:scale-110 transition-transform" /> 
                        Sincronizar Tiempo
                    </button>
                    <button
                        onClick={handleClearTime}
                        className="w-full text-left px-5 py-4 text-[12px] font-black text-red-500 hover:bg-red-50 dark:hover:bg-red-900/40 rounded-[18px] flex items-center gap-3 group transition-colors uppercase tracking-tight"
                    >
                        <Trash2 size={16} className="group-hover:rotate-12 transition-transform" /> 
                        Omitir Parada
                    </button>
                </div>
            )}

            <AutoTripsModal
                isOpen={isAutoModalOpen}
                onClose={() => setIsAutoModalOpen(false)}
                serviceId={selectedServiceId}
                totalTravelTime={getCycleTravelTime()}
                onGenerate={handleBulkCreateTrips}
            />

            <ConfirmModal
                isOpen={showClearConfirm}
                title="PURGA DE SUMINISTRO"
                message={`¿Autoriza la destrucción integral de todos los viajes para el calendario "${selectedServiceId}" en este sentido operativo?`}
                confirmText="PURGAR INTEGRALMENTE"
                isDestructive={true}
                onConfirm={confirmClearTimetable}
                onCancel={() => setShowClearConfirm(false)}
            />
        </div>
    );
};

export default TripsManager;
