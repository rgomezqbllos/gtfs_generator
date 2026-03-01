import React from 'react';
import type { SimulationKpiSnapshot } from '../utils/simulationKpis';

export type SimulationKpiScope = 'general' | 'route';

interface SimulationKpiStripProps {
    data: SimulationKpiSnapshot;
    scope: SimulationKpiScope;
}

interface SimulationKpiDefinition {
    id: string;
    label: string;
    showInGeneral: boolean;
    showInRoute: boolean;
    alignRightInGeneral?: boolean;
    valueClassName?: string;
    renderValue: (data: SimulationKpiSnapshot, scope: SimulationKpiScope) => React.ReactNode;
}

const KPI_DEFINITIONS: SimulationKpiDefinition[] = [
    {
        id: 'active-disp',
        label: 'Active / Disp.',
        showInGeneral: true,
        showInRoute: true,
        renderValue: (data, scope) => (
            <>
                {data.activeBusesCount}{' '}
                <span className={scope === 'general' ? 'text-xs text-gray-500' : 'text-[11px] text-gray-500'}>
                    / {data.dispatchedBuses}
                </span>
            </>
        )
    },
    {
        id: 'inactive-buses',
        label: 'Inactive Buses',
        showInGeneral: true,
        showInRoute: true,
        valueClassName: 'text-orange-400',
        renderValue: data => data.inactiveBusesCount
    },
    {
        id: 'comm-trips-kms',
        label: 'Comm. Trips / KMs',
        showInGeneral: true,
        showInRoute: true,
        valueClassName: 'text-blue-400',
        renderValue: (data, scope) => (
            <>
                {data.commercialTripsStarted}{' '}
                <span className={scope === 'general' ? 'text-xs text-gray-500' : 'text-[11px] text-gray-500'}>
                    / {data.commercialKms.toFixed(1)}km
                </span>
            </>
        )
    },
    {
        id: 'empty-trips-kms',
        label: 'Empty Trips / KMs',
        showInGeneral: true,
        showInRoute: true,
        valueClassName: 'text-gray-300',
        renderValue: (data, scope) => (
            <>
                {data.emptyTripsStarted}{' '}
                <span className={scope === 'general' ? 'text-xs text-gray-500' : 'text-[11px] text-gray-500'}>
                    / {data.emptyKms.toFixed(1)}km
                </span>
            </>
        )
    },
    {
        id: 'overtakes',
        label: 'Overtakes',
        showInGeneral: true,
        showInRoute: true,
        valueClassName: 'text-red-500',
        renderValue: data => data.overtakesCount
    },
    {
        id: 'sim-time',
        label: 'Sim Time',
        showInGeneral: true,
        showInRoute: false,
        alignRightInGeneral: true,
        valueClassName: 'text-emerald-400',
        renderValue: data => data.simTime
    }
];

const getVisibleDefinitions = (scope: SimulationKpiScope) =>
    KPI_DEFINITIONS.filter(def => scope === 'general' ? def.showInGeneral : def.showInRoute);

export const SimulationKpiStrip: React.FC<SimulationKpiStripProps> = ({ data, scope }) => {
    const visibleDefinitions = getVisibleDefinitions(scope);
    const isGeneral = scope === 'general';

    return (
        <div className={isGeneral ? 'flex items-center w-full gap-6 xl:gap-8 min-w-0' : 'flex items-center gap-4 flex-wrap w-full'}>
            {visibleDefinitions.map(def => (
                <div
                    key={def.id}
                    className={`${isGeneral && def.alignRightInGeneral ? 'ml-auto text-right' : ''} min-w-0`}
                >
                    <div className={isGeneral
                        ? 'text-[9px] text-gray-400 uppercase tracking-[0.16em] whitespace-nowrap'
                        : 'text-[8px] text-gray-500 uppercase tracking-[0.14em] whitespace-nowrap'}>
                        {def.label}
                    </div>
                    <div className={`${isGeneral ? 'text-xl font-light leading-tight' : 'text-[13px] font-medium leading-tight'} ${def.valueClassName || ''} ${def.id === 'sim-time' ? 'font-mono text-2xl' : ''}`}>
                        {def.renderValue(data, scope)}
                    </div>
                </div>
            ))}
        </div>
    );
};
