export const routingProfileMetadata = {
    bus_mixed: {
        label: 'Vía Mixta (General)',
        description: 'Buses compartiendo vía con tráfico general. Evita infraestructura segregada.',
        color: '#6366f1' // Indigo 500
    },
    bus_mixed_exclusive: {
        label: 'Mixta + Exclusiva (Híbrido)',
        description: 'Permite transiciones entre calles generales y corredores BRT autorizados.',
        color: '#14b8a6' // Teal 500
    },
    bus_trunk: {
        label: 'Troncal (100% Exclusiva)',
        description: 'Prioridad máxima a carriles segregados. Penaliza fuertemente el uso de vía mixta.',
        color: '#f97316' // Orange 500
    }
} as const;

export type RoutingProfile = keyof typeof routingProfileMetadata;
export const routingProfiles = Object.keys(routingProfileMetadata) as RoutingProfile[];
export const defaultRoutingProfile: RoutingProfile = 'bus_mixed';
