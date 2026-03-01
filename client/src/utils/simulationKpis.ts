import type { AssignedTrip, LogicalBus } from './SimulationEngine';

const BUS_KM_PER_SECOND = 20 / 3600;

export interface SimulationKpiSnapshot {
    activeBusesCount: number;
    dispatchedBuses: number;
    inactiveBusesCount: number;
    commercialTripsStarted: number;
    commercialKms: number;
    emptyTripsStarted: number;
    emptyKms: number;
    overtakesCount: number;
    simTime: string;
}

export interface SimulationKpiState {
    general: SimulationKpiSnapshot;
    byRoute: Record<string, SimulationKpiSnapshot>;
}

interface AttributedTrip extends AssignedTrip {
    attributed_route_id: string | null;
}

interface AttributedBus {
    bus_id: string;
    trips: AttributedTrip[];
}

const ZERO_KPI_BASE: Omit<SimulationKpiSnapshot, 'simTime'> = {
    activeBusesCount: 0,
    dispatchedBuses: 0,
    inactiveBusesCount: 0,
    commercialTripsStarted: 0,
    commercialKms: 0,
    emptyTripsStarted: 0,
    emptyKms: 0,
    overtakesCount: 0
};

export const getZeroSimulationKpiSnapshot = (simTime: string): SimulationKpiSnapshot => ({
    ...ZERO_KPI_BASE,
    simTime
});

const findNearestCommercialRoute = (trips: AssignedTrip[], fromIndex: number): string | null => {
    for (let i = fromIndex + 1; i < trips.length; i++) {
        const next = trips[i];
        if (next.type === 'commercial' && next.route_id) {
            return next.route_id;
        }
    }

    for (let i = fromIndex - 1; i >= 0; i--) {
        const prev = trips[i];
        if (prev.type === 'commercial' && prev.route_id) {
            return prev.route_id;
        }
    }

    return null;
};

const attributeTripsToRoutes = (bus: LogicalBus): AttributedBus => ({
    bus_id: bus.bus_id,
    trips: bus.trips.map((trip, index) => ({
        ...trip,
        attributed_route_id: trip.type === 'commercial'
            ? trip.route_id || null
            : findNearestCommercialRoute(bus.trips, index)
    }))
});

const tripBelongsToRoute = (trip: AttributedTrip, routeId?: string): boolean => {
    if (!routeId) return true;
    return trip.attributed_route_id === routeId;
};

const buildSnapshotForScope = (
    buses: AttributedBus[],
    currentSecond: number,
    simTime: string,
    routeId?: string
): SimulationKpiSnapshot => {
    const second = Math.max(0, Math.floor(currentSecond));

    let activeBusesCount = 0;
    let dispatchedBuses = 0;
    let commercialTripsStarted = 0;
    let emptyTripsStarted = 0;
    let commercialSeconds = 0;
    let emptySeconds = 0;

    const startedCommercialTrips: AttributedTrip[] = [];

    for (const bus of buses) {
        let busDispatchedForScope = false;
        let busActiveForScope = false;

        for (const trip of bus.trips) {
            if (!tripBelongsToRoute(trip, routeId)) continue;

            if (trip.start_time <= second) {
                busDispatchedForScope = true;

                const effectiveDuration = Math.max(0, Math.min(second, trip.end_time) - trip.start_time);
                if (trip.type === 'commercial') {
                    commercialTripsStarted += 1;
                    commercialSeconds += effectiveDuration;
                    startedCommercialTrips.push(trip);
                } else {
                    emptyTripsStarted += 1;
                    emptySeconds += effectiveDuration;
                }
            }

            if (second >= trip.start_time && second <= trip.end_time) {
                busActiveForScope = true;
            }
        }

        if (busDispatchedForScope) dispatchedBuses += 1;
        if (busActiveForScope) activeBusesCount += 1;
    }

    let overtakesCount = 0;
    for (let i = 0; i < startedCommercialTrips.length; i++) {
        for (let j = i + 1; j < startedCommercialTrips.length; j++) {
            const t1 = startedCommercialTrips[i];
            const t2 = startedCommercialTrips[j];
            if (!t1.attributed_route_id || t1.attributed_route_id !== t2.attributed_route_id) continue;
            if (t1.start_stop_id !== t2.start_stop_id || t1.end_stop_id !== t2.end_stop_id) continue;

            const first = t1.start_time < t2.start_time ? t1 : t2;
            const secondTrip = t1.start_time < t2.start_time ? t2 : t1;
            if (first.end_time > secondTrip.end_time && second >= secondTrip.end_time) {
                overtakesCount += 1;
            }
        }
    }

    return {
        activeBusesCount,
        dispatchedBuses,
        inactiveBusesCount: Math.max(0, dispatchedBuses - activeBusesCount),
        commercialTripsStarted,
        commercialKms: Number((commercialSeconds * BUS_KM_PER_SECOND).toFixed(1)),
        emptyTripsStarted,
        emptyKms: Number((emptySeconds * BUS_KM_PER_SECOND).toFixed(1)),
        overtakesCount,
        simTime
    };
};

export const computeSimulationKpiState = ({
    buses,
    currentSecond,
    simTime,
    routeIds
}: {
    buses: LogicalBus[];
    currentSecond: number;
    simTime: string;
    routeIds: string[];
}): SimulationKpiState => {
    const attributedBuses = buses.map(attributeTripsToRoutes);
    const general = buildSnapshotForScope(attributedBuses, currentSecond, simTime);
    const byRoute: Record<string, SimulationKpiSnapshot> = {};

    for (const routeId of routeIds) {
        byRoute[routeId] = buildSnapshotForScope(attributedBuses, currentSecond, simTime, routeId);
    }

    return { general, byRoute };
};
