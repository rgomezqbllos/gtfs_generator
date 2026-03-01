import React, { useState, useEffect } from 'react';
import { X, Plus, Save, Trash2, Clock, AlertCircle, Wand2, CheckCircle, RefreshCw } from 'lucide-react';
import type { Route } from '../types';
import { clsx } from 'clsx';
import AutoTripsModal, { type AutoTripsConfig } from './AutoTripsModal';
import ConfirmModal from './ConfirmModal';
import { formatTimeInput } from '../utils/TimeUtils';

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
    // other fields ignored for now
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

import { API_URL } from '../config';

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
            // 1. Fetch path (ordered stops) for both directions
            const [path0Res, path1Res] = await Promise.all([
                fetch(`${API_URL}/routes/${route.route_id}/path?direction_id=0`),
                fetch(`${API_URL}/routes/${route.route_id}/path?direction_id=1`)
            ]);

            const path0Data = await path0Res.json().catch(() => ({}));
            const path1Data = await path1Res.json().catch(() => ({}));

            // 2. Fetch stops details to get names
            const stopsRes = await fetch(`${API_URL}/stops`); // Optimization: should probably batch fetch or filter
            const allStops: Stop[] = await stopsRes.json();

            // Fetch segments for travel times
            const segmentsRes = await fetch(`${API_URL}/segments`);
            const segmentsData = await segmentsRes.json();
            setSegments(segmentsData);

            // Fetch time slots for all segments (inefficient n+1 but works for now)
            // Ideally backend would provide a bulk endpoint
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

            // Map ordered IDs to full stop objects
            const orderedStops0 = (path0Data.ordered_stop_ids || []).map((id: string) =>
                allStops.find(s => s.stop_id === id)
            ).filter(Boolean) as Stop[];

            const orderedStops1 = (path1Data.ordered_stop_ids || []).map((id: string) =>
                allStops.find(s => s.stop_id === id)
            ).filter(Boolean) as Stop[];

            setStopsDir0(orderedStops0);
            setStopsDir1(orderedStops1);
            setStops(direction === 0 ? orderedStops0 : orderedStops1);

            // 3. Fetch ALL Trips for this route
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
            alert('Please create and select a Calendar (Service ID) first!');
            return;
        }

        const newTripId = Math.floor(100000000 + Math.random() * 900000000).toString(); // 9 digit number

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
    const [segmentSlots, setSegmentSlots] = useState<any[]>([]); // cache for time slots

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

            if (isFirstStop && field === 'arrival') {
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

                        // Check for time slot
                        // We need the arrival time at the START of the segment (which is departure from prevStop)
                        // If we are propagating, currentTime holds the arrival at prevStop (assuming immediate departure)
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
        if (!confirm('Delete this trip?')) return;
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
            alert('Timetable saved!');
        } catch (err) {
            console.error(err);
            alert('Failed to save');
        } finally {
            setSaving(false);
        }
    };

    const GetStopTime = (trip: Trip, stopId: string) => {
        return trip.stop_times?.find(st => st.stop_id === stopId)?.arrival_time || '';
    };

    // Auto Trips Helpers
    const findSegment = (startStopId: string, endStopId: string) =>
        segments.find(s => s.start_node_id === startStopId && s.end_node_id === endStopId);

    const isTimeInsideRange = (value: number, start: number, end: number) => {
        if (start === end) return true;
        if (start < end) return value >= start && value < end;
        // Overnight range support: e.g. 23:00 -> 03:00
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
        // Keep deadhead logic aligned with simulation to avoid requiring unexpected extra fleet.
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

    const generateStopTimesForTripAndStops = (tripId: string, startTime: string, pathStops: Stop[]) => {
        const tripPlan = generateStopTimesForTripAndStopsAtSeconds(tripId, timeToSeconds(startTime), pathStops);
        return tripPlan.stop_times;
    };

    const generateStopTimesForTrip = (tripId: string, startTime: string) => {
        return generateStopTimesForTripAndStops(tripId, startTime, stops);
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

            if (requiredDelay <= 0) {
                break;
            }
            startSeconds += requiredDelay;
        }

        // Rebuild once with the final delayed departure to avoid stale plans when the loop ends by iteration cap.
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
                const targetHeadway = Math.max(
                    MIN_TERMINAL_HEADWAY_SECONDS,
                    Math.round(cycleEstimate / Math.max(1, range.buses))
                );
                const nextHeadwayDeparture = previousDir0Departure === null
                    ? range.start_seconds
                    : previousDir0Departure + targetHeadway;

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
                alert('By Buses requiere una tabla vacía para garantizar flota exacta. Limpia el horario y vuelve a generar.');
                return;
            }
            const fleetRanges = buildFleetRanges(config.ranges);
            newTripsData = generateTripsByFixedFleet(serviceIdToUse, fleetRanges);
        } else {
            const orderedStarts = [...config.trips].sort((a, b) => timeToSeconds(a) - timeToSeconds(b));
            newTripsData = generateTripsFromStarts(serviceIdToUse, orderedStarts, existingStartTimes, duplicates);
        }

        if (duplicates.length > 0) {
            alert(`Skipped ${duplicates.length} duplicate trips at: ${duplicates.join(', ')}`);
        }

        if (newTripsData.length === 0) {
            alert('No fue posible generar viajes con la configuración actual.');
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
            setSuccessMessage(`Successfully created ${newTripsData.length} trips!`);
            setTimeout(() => setSuccessMessage(null), 3000);

        } catch (err) {
            console.error(err);
            alert('Failed to save generated trips. Please try again.');
        } finally {
            setSaving(false);
        }
    };

    const confirmClearTimetable = async () => {
        setIsClearing(true);
        setShowClearConfirm(false);

        // Filter out pattern trips (t_ROUTEID_DIR) and only delete trips for selectedServiceId
        const patternTripId = `t_${route.route_id}_${direction}`;

        const tripsToDelete = trips
            .filter(t => t.service_id === selectedServiceId) // Only delete for selected service
            .filter(t => t.trip_id !== patternTripId)      // NEVER delete the pattern trip
            .map(t => t.trip_id);

        if (tripsToDelete.length === 0) {
            setIsClearing(false);
            alert("No trips to clear.");
            return;
        }

        try {
            await Promise.all(tripsToDelete.map(id => fetch(`${API_URL}/trips/${id}`, { method: 'DELETE' })));

            // Update state
            setTrips(prev => prev.filter(t => !tripsToDelete.includes(t.trip_id)));

            setSuccessMessage("Timetable cleared successfully!");
            setTimeout(() => setSuccessMessage(null), 3000);
        } catch (err) {
            console.error(err);
            alert('Failed to delete some trips from server.');
            fetchData();
        } finally {
            setIsClearing(false);
        }
    };

    const handleUpdateTravelTimes = () => {
        if (!confirm("This will recalculate all stop times for the displayed trips based on the LATEST segment travel times.\n\nThe start time of each trip will be preserved.\n\nContinue?")) return;

        let updatedCount = 0;
        const updatedTrips = trips.map(trip => {
            // Only update trips for the current service and direction
            if (trip.service_id !== selectedServiceId || trip.trip_id === `t_${route.route_id}_${direction}`) return trip;

            const firstStopTime = GetStopTime(trip, stops[0]?.stop_id);
            if (!firstStopTime) return trip; // Skip invalid trips

            // Regenerate times using the current segments data
            const newStopTimes = generateStopTimesForTrip(trip.trip_id, firstStopTime);

            updatedCount++;
            return { ...trip, stop_times: newStopTimes };
        });

        setTrips(updatedTrips);
        setSuccessMessage(`Updated times for ${updatedCount} trips! don't forget to save.`);
        setTimeout(() => setSuccessMessage(null), 3000);
    };

    // Filter displayed trips AND Sort them by start time
    const displayedTrips = trips
        .filter(t => t.service_id === selectedServiceId && t.direction_id === direction && t.trip_id !== `t_${route.route_id}_${direction}`)
        .sort((a, b) => {
            const timeA = GetStopTime(a, stops[0]?.stop_id) || '23:59:59';
            const timeB = GetStopTime(b, stops[0]?.stop_id) || '23:59:59';
            return timeA.localeCompare(timeB);
        });

    // Identify Duplicates (Trips with same start time)
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
            if (ids.length > 1) {
                ids.forEach(id => duplicates.add(id));
            }
        });
        return duplicates;
    }, [displayedTrips, stops]);

    // --- Context Menu Logic ---
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
        if (stopIndex <= 0) return; // Cannot restore first stop based on previous

        // Find nearest previous stop with time
        let prevStopIndex = stopIndex - 1;
        let prevTime = '';

        while (prevStopIndex >= 0) {
            const t = GetStopTime(trip, stops[prevStopIndex].stop_id);
            if (t) {
                prevTime = t;
                break;
            }
            prevStopIndex--;
        }

        if (!prevTime) {
            alert("Cannot restore: No previous time found to calculate from.");
            return;
        }

        // Calculate travel time from that previous stop to current
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
        <div className="fixed inset-0 bg-white dark:bg-gray-900 z-50 flex flex-col animate-in slide-in-from-bottom duration-300">
            {/* Header */}
            <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between items-center bg-gray-50 dark:bg-gray-800 transition-colors relative">
                {/* Success Notification Overlay */}
                {successMessage && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-4 bg-emerald-600 text-white px-6 py-2 rounded-full shadow-lg flex items-center gap-2 animate-in fade-in slide-in-from-top-2 z-50">
                        <CheckCircle size={18} />
                        <span className="font-medium">{successMessage}</span>
                    </div>
                )}

                <div className="flex items-center gap-4">
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
                        <X size={24} className="text-gray-600 dark:text-gray-300" />
                    </button>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                            <Clock className="text-blue-600" />
                            Timetable Editor
                        </h2>
                        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mt-1">
                            <span className="font-mono font-bold bg-gray-200 dark:bg-gray-700 px-1.5 rounded text-gray-700 dark:text-gray-300">
                                {route.route_short_name}
                            </span>
                            <span>{route.route_long_name}</span>
                        </div>
                    </div>
                </div>

                {/* Center: Service ID and Direction */}
                <div className="flex items-center gap-4">
                    {/* Service ID Selector */}
                    <div className="flex items-center gap-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Service:</label>
                        <select
                            value={selectedServiceId}
                            onChange={(e) => setSelectedServiceId(e.target.value)}
                            className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500 outline-none shadow-sm"
                        >
                            {calendars.map(c => (
                                <option key={c.service_id} value={c.service_id}>{c.service_id}</option>
                            ))}
                        </select>
                    </div>

                    <div className="h-8 w-px bg-gray-300 dark:bg-gray-600 mx-2" />

                    <div className="flex bg-gray-200 dark:bg-gray-700 rounded-lg p-1 transition-colors">
                        <button
                            onClick={() => setDirection(0)}
                            className={clsx(
                                "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                                direction === 0 ? "bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-300" : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                            )}
                        >
                            Outbound (0)
                        </button>
                        <button
                            onClick={() => setDirection(1)}
                            className={clsx(
                                "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                                direction === 1 ? "bg-white dark:bg-gray-600 shadow text-blue-600 dark:text-blue-300" : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200"
                            )}
                        >
                            Inbound (1)
                        </button>
                    </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-4">
                    <button
                        onClick={() => setShowClearConfirm(true)}
                        className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Clear Timetable"
                        disabled={isClearing}
                    >
                        {isClearing ? <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-red-600" /> : <Trash2 size={20} />}
                    </button>

                    <button
                        onClick={handleUpdateTravelTimes}
                        className="flex items-center gap-2 px-4 py-2 bg-orange-500 text-white rounded-lg hover:bg-orange-600 transition-colors font-medium shadow-sm"
                        title="Recalculate all times based on current segment speeds"
                    >
                        <RefreshCw size={18} /> Update Times
                    </button>

                    <button
                        onClick={() => setIsAutoModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors font-medium shadow-sm"
                    >
                        <Wand2 size={18} /> Auto Trips
                    </button>

                    <button
                        onClick={handleAddTrip}
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm"
                    >
                        <Plus size={18} /> Add Trip
                    </button>

                    <button
                        onClick={handleSaveAll}
                        disabled={saving}
                        className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-medium shadow-sm disabled:opacity-50"
                    >
                        <Save size={18} /> {saving ? 'Saving...' : 'Save All'}
                    </button>
                </div>
            </div>

            {/* Grid Container */}
            <div className="flex-1 overflow-auto bg-gray-100 dark:bg-gray-900 p-6 transition-colors">
                {isClearing && (
                    <div className="absolute inset-0 bg-white/50 dark:bg-gray-900/50 z-40 flex items-center justify-center backdrop-blur-sm">
                        <div className="flex flex-col items-center gap-3 bg-white dark:bg-gray-800 p-6 rounded-xl shadow-xl">
                            <div className="animate-spin rounded-full h-10 w-10 border-4 border-red-500 border-t-transparent"></div>
                            <p className="font-medium text-gray-700 dark:text-gray-200">Clearing Timetable...</p>
                        </div>
                    </div>
                )}
                {loading ? (
                    <div className="flex justify-center items-center h-64 text-gray-400">Loading timetable...</div>
                ) : stops.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-gray-500 gap-4">
                        <AlertCircle size={48} className="text-gray-300" />
                        <p className="text-lg">No stops defined for this direction.</p>
                        <p className="text-sm">Go to Map View and add stops/segments first.</p>
                    </div>
                ) : (
                    <div className="bg-white dark:bg-gray-800 rounded-xl shadow border border-gray-200 dark:border-gray-700 inline-block min-w-full transition-colors relative">
                        <table className="w-full border-collapse">
                            <thead>
                                <tr>
                                    {/* Stuck first column for Stops */}
                                    <th className="sticky left-0 z-30 bg-gray-50 dark:bg-gray-800 border-b border-r border-gray-200 dark:border-gray-700 p-4 min-w-[250px] text-left shadow-lg">
                                        <div className="font-bold text-gray-700 dark:text-gray-200">Stops</div>
                                        <div className="text-xs text-gray-400 font-normal mt-1">{stops.length} stops</div>
                                    </th>

                                    {/* Trip Columns Headers */}
                                    {displayedTrips.map((trip) => {
                                        const isDuplicate = duplicateTripIds.has(trip.trip_id);
                                        return (
                                            <th key={trip.trip_id} id={`trip-col-${trip.trip_id}`} className={clsx(
                                                "min-w-[120px] border-b border-r border-gray-200 dark:border-gray-700 p-2 relative group",
                                                isDuplicate ? "bg-red-50 dark:bg-red-900/20" : "bg-gray-50 dark:bg-gray-800"
                                            )}>
                                                <div className="flex flex-col gap-2 items-center">
                                                    <div className="flex justify-between items-center w-full px-2">
                                                        <span className={clsx(
                                                            "text-xs font-mono font-bold flex items-center gap-1",
                                                            isDuplicate ? "text-red-600 dark:text-red-400" : "text-gray-600 dark:text-gray-300"
                                                        )} title={isDuplicate ? "Duplicate Trip (Same Start Time)" : ""}>
                                                            {isDuplicate && <AlertCircle size={12} />}
                                                            {trip.trip_id}
                                                        </span>
                                                        <button
                                                            onClick={() => handleDeleteTrip(trip.trip_id)}
                                                            className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                                                            title="Delete Trip"
                                                        >
                                                            <Trash2 size={14} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </th>
                                        )
                                    })}

                                    {/* Add Trip Column Placeholder */}
                                    <th className="min-w-[100px] border-b border-gray-200 dark:border-gray-700 bg-gray-50/50 p-4 text-center">
                                        <button
                                            onClick={handleAddTrip}
                                            className="p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-400 hover:text-blue-600 transition-colors"
                                        >
                                            <Plus size={20} />
                                        </button>
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {stops.map((stop, stopIdx) => (
                                    <tr key={stop.stop_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors group/row">
                                        {/* Sticky Stop Name */}
                                        <td className="sticky left-0 z-20 bg-white dark:bg-gray-800 group-hover/row:bg-gray-50 dark:group-hover/row:bg-gray-700 border-r border-b border-gray-100 dark:border-gray-700 p-3 shadow-md">
                                            <div className="flex items-center gap-3">
                                                <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold shrink-0">
                                                    {stopIdx + 1}
                                                </div>
                                                <div className="overflow-hidden">
                                                    <div className="font-medium text-gray-800 dark:text-gray-200 text-sm truncate">{stop.stop_name}</div>
                                                    <div className="text-xs text-gray-400 font-mono">{stop.stop_id}</div>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Stop Times Inputs */}
                                        {displayedTrips.map(trip => (
                                            <td key={`${trip.trip_id}-${stop.stop_id}`} className="border-r border-b border-gray-100 dark:border-gray-700/50 p-1 text-center">
                                                <input
                                                    type="text"
                                                    className="w-full text-center py-2 text-sm bg-transparent outline-none focus:bg-blue-50 focus:text-blue-700 font-mono placeholder:text-gray-200 transition-colors text-gray-700 dark:text-gray-300 cursor-context-menu"
                                                    placeholder="--:--"
                                                    value={GetStopTime(trip, stop.stop_id)}
                                                    onChange={(e) => handleStopTimeChange(trip.trip_id, stop.stop_id, 'arrival', e.target.value)}
                                                    onBlur={(e) => handleStopTimeChange(trip.trip_id, stop.stop_id, 'arrival', formatTimeInput(e.target.value))}
                                                    onContextMenu={(e) => handleContextMenu(e, trip.trip_id, stop.stop_id)}
                                                />
                                            </td>
                                        ))}

                                        {/* Filler */}
                                        <td className="border-b border-gray-100 dark:border-gray-700/50"></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Context Menu */}
            {contextMenu && (
                <div
                    className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl z-[100] py-1 min-w-[160px] animate-in fade-in zoom-in-95 duration-100"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <button
                        onClick={handleRestoreTime}
                        className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2"
                    >
                        <Clock size={14} className="text-blue-500" /> Restore Time
                    </button>
                    <button
                        onClick={handleClearTime}
                        className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2"
                    >
                        <Trash2 size={14} /> Clear Time (Skip)
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
                title="Clear Timetable"
                message={`Are you sure you want to delete ALL trips for service "${selectedServiceId}" in this direction? This action cannot be undone.`}
                confirmText="Yes, Clear All"
                isDestructive={true}
                onConfirm={confirmClearTimetable}
                onCancel={() => setShowClearConfirm(false)}
            />
        </div>
    );
};

export default TripsManager;
