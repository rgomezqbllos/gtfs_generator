import React, { useState, useEffect } from 'react';
import { X, Plus, Save, Trash2, Clock, AlertCircle, Wand2, CheckCircle } from 'lucide-react';
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

const API_URL = 'http://localhost:3000/api';

const TripsManager: React.FC<TripsManagerProps> = ({ route, onClose }) => {
    const [direction, setDirection] = useState<number>(0);
    const [trips, setTrips] = useState<Trip[]>([]);
    const [stops, setStops] = useState<Stop[]>([]);
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
            // 1. Fetch path (ordered stops) for this direction
            const pathRes = await fetch(`${API_URL}/routes/${route.route_id}/path?direction_id=${direction}`);
            const pathData = await pathRes.json();

            // 2. Fetch stops details to get names
            const stopsRes = await fetch(`${API_URL}/stops`); // Optimization: should probably batch fetch or filter
            const allStops: Stop[] = await stopsRes.json();

            // Fetch segments for travel times
            const segmentsRes = await fetch(`${API_URL}/segments`);
            const segmentsData = await segmentsRes.json();
            setSegments(segmentsData);

            // Map ordered IDs to full stop objects
            const orderedStops = (pathData.ordered_stop_ids || []).map((id: string) =>
                allStops.find(s => s.stop_id === id)
            ).filter(Boolean) as Stop[];

            setStops(orderedStops);

            // 3. Fetch Trips for this direction
            const tripsRes = await fetch(`${API_URL}/routes/${route.route_id}/trips?direction_id=${direction}`);
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

    const addSeconds = (timeStr: string, seconds: number) => {
        if (!timeStr) return '';
        const [h, m, s] = timeStr.split(':').map(Number);
        const date = new Date();
        date.setHours(h, m, s);
        date.setSeconds(date.getSeconds() + seconds);
        return date.toTimeString().split(' ')[0];
    };

    const handleStopTimeChange = (tripId: string, stopId: string, field: 'arrival' | 'departure', value: string) => {
        setLastEditedTripId(tripId);
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
                    if (segment && segment.travel_time) {
                        currentTime = addSeconds(currentTime, segment.travel_time);
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
    const getTotalTravelTime = () => {
        let total = 0;
        for (let i = 0; i < stops.length - 1; i++) {
            const current = stops[i];
            const next = stops[i + 1];
            const seg = segments.find(s => s.start_node_id === current.stop_id && s.end_node_id === next.stop_id);
            if (seg && seg.travel_time) {
                total += seg.travel_time;
            }
        }
        return total;
    };

    const generateStopTimesForTrip = (tripId: string, startTime: string) => {
        const newStopTimes: StopTime[] = [];
        let currentTime = startTime;

        stops.forEach((stop, i) => {
            if (i > 0) {
                const prevStop = stops[i - 1];
                const segment = segments.find(s => s.start_node_id === prevStop.stop_id && s.end_node_id === stop.stop_id);
                if (segment && segment.travel_time) {
                    currentTime = addSeconds(currentTime, segment.travel_time);
                }
            }

            newStopTimes.push({
                trip_id: tripId,
                stop_id: stop.stop_id,
                stop_sequence: i + 1,
                arrival_time: currentTime,
                departure_time: currentTime
            });
        });

        return newStopTimes;
    };

    const [isClearing, setIsClearing] = useState(false);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const handleBulkCreateTrips = async (config: AutoTripsConfig) => {
        const serviceIdToUse = selectedServiceId; // Force global ID

        // Check for duplicates in current trips (start time)
        const existingStartTimes = new Set(
            trips
                .filter(t => t.service_id === serviceIdToUse)
                .map(t => GetStopTime(t, stops[0]?.stop_id))
        );

        const newTripsData: Trip[] = [];
        const duplicates: string[] = [];

        config.trips.forEach(startTime => {
            if (existingStartTimes.has(startTime)) {
                duplicates.push(startTime);
                return;
            }

            // 9-digit random ID
            const tripId = Math.floor(100000000 + Math.random() * 900000000).toString();

            newTripsData.push({
                trip_id: tripId,
                route_id: route.route_id,
                service_id: serviceIdToUse,
                direction_id: direction,
                trip_headsign: route.route_long_name || route.route_short_name,
                shape_id: '',
                stop_times: generateStopTimesForTrip(tripId, startTime)
            });
        });

        if (duplicates.length > 0) {
            alert(`Skipped ${duplicates.length} duplicate trips at: ${duplicates.join(', ')}`);
        }

        if (newTripsData.length === 0) return;

        setSaving(true);
        try {
            // Persist all new trips immediately
            // We'll use a Promise.all to save them. ideally we'd have a bulk create endpoint.
            // For now, loop through.
            const savePromises = newTripsData.map(async (trip) => {
                // 1. Create Trip
                const tripRes = await fetch(`${API_URL}/routes/${route.route_id}/trips`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        ...trip,
                        stop_times: undefined // Don't send stop_times in trip creation if API doesn't support it yet
                    })
                });

                if (!tripRes.ok) throw new Error(`Failed to create trip ${trip.trip_id}`);

                // 2. Create Stop Times
                if (trip.stop_times && trip.stop_times.length > 0) {
                    await fetch(`${API_URL}/trips/${trip.trip_id}/stop_times`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ stop_times: trip.stop_times })
                    });
                }
            });

            await Promise.all(savePromises);

            // Update local state only after success
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

    // Track last edited trip to maintain focus if reordered
    const [lastEditedTripId, setLastEditedTripId] = useState<string | null>(null);

    // Filter displayed trips AND Sort them by start time
    const displayedTrips = trips
        .filter(t => t.service_id === selectedServiceId && t.trip_id !== `t_${route.route_id}_${direction}`)
        .sort((a, b) => {
            const timeA = GetStopTime(a, stops[0]?.stop_id) || '23:59:59';
            const timeB = GetStopTime(b, stops[0]?.stop_id) || '23:59:59';
            return timeA.localeCompare(timeB);
        });

    // Scroll to the last edited trip if it exists (and was potentially reordered)
    useEffect(() => {
        if (lastEditedTripId) {
            const element = document.getElementById(`trip-col-${lastEditedTripId}`);
            if (element) {
                element.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
            }
        }
    }, [displayedTrips, lastEditedTripId]);

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
                                    {displayedTrips.map((trip) => (
                                        <th key={trip.trip_id} id={`trip-col-${trip.trip_id}`} className="min-w-[120px] border-b border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-2 relative group">
                                            <div className="flex flex-col gap-2 items-center">
                                                <div className="flex justify-between items-center w-full px-2">
                                                    <span className="text-xs font-mono font-bold text-gray-600 dark:text-gray-300">
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
                                    ))}

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
                                                    className="w-full text-center py-2 text-sm bg-transparent outline-none focus:bg-blue-50 focus:text-blue-700 font-mono placeholder:text-gray-200 transition-colors text-gray-700 dark:text-gray-300"
                                                    placeholder="--:--"
                                                    value={GetStopTime(trip, stop.stop_id)}
                                                    onChange={(e) => handleStopTimeChange(trip.trip_id, stop.stop_id, 'arrival', e.target.value)}
                                                    onBlur={(e) => handleStopTimeChange(trip.trip_id, stop.stop_id, 'arrival', formatTimeInput(e.target.value))}
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

            <AutoTripsModal
                isOpen={isAutoModalOpen}
                onClose={() => setIsAutoModalOpen(false)}
                serviceId={selectedServiceId}
                totalTravelTime={getTotalTravelTime()}
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

