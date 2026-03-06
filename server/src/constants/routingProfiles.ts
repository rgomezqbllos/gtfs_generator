export type RoutingProfile = 'bus_mixed' | 'bus_mixed_exclusive' | 'bus_trunk';

export const ROUTING_PROFILES: RoutingProfile[] = [
    'bus_mixed',
    'bus_mixed_exclusive',
    'bus_trunk'
];

export const DEFAULT_ROUTING_PROFILE: RoutingProfile = 'bus_mixed';

const OSRM_PROFILE_MAP: Record<RoutingProfile, string> = {
    bus_mixed: 'bus_mixed',
    bus_mixed_exclusive: 'bus_mixed_exclusive',
    bus_trunk: 'bus_trunk'
};

export function normalizeRoutingProfile(value?: string): RoutingProfile {
    if (!value) return DEFAULT_ROUTING_PROFILE;
    if (ROUTING_PROFILES.includes(value as RoutingProfile)) {
        return value as RoutingProfile;
    }
    return DEFAULT_ROUTING_PROFILE;
}

export function mapToOsrmProfile(profile: RoutingProfile): string {
    return OSRM_PROFILE_MAP[profile];
}
