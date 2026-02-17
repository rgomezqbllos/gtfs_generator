
/**
 * Formats a time string input (flexible) into HH:MM:SS
 * Supports:
 * - HHMMSS -> HH:MM:SS
 * - HHMM -> HH:MM:00
 * - HMM -> 0H:MM:00
 * - HMS -> 0H:0M:0S (padding)
 */
export const formatTimeInput = (input: string): string => {
    // Remove non-digits
    const digits = input.replace(/\D/g, '');

    if (!digits) return input; // Return original if empty or no digits

    let h = '00';
    let m = '00';
    let s = '00';

    if (digits.length === 6) {
        h = digits.substring(0, 2);
        m = digits.substring(2, 4);
        s = digits.substring(4, 6);
    } else if (digits.length === 5) {
        h = '0' + digits.substring(0, 1);
        m = digits.substring(1, 3);
        s = digits.substring(3, 5);
    } else if (digits.length === 4) {
        h = digits.substring(0, 2);
        m = digits.substring(2, 4);
        s = '00';
    } else if (digits.length === 3) {
        h = '0' + digits.substring(0, 1);
        m = digits.substring(1, 3);
        s = '00';
    } else if (digits.length <= 2) {
        h = digits.padStart(2, '0');
        m = '00';
        s = '00';
    } else {
        // Fallback: take first 6 chars
        const d = digits.padEnd(6, '0');
        h = d.substring(0, 2);
        m = d.substring(2, 4);
        s = d.substring(4, 6);
    }

    // Validate ranges
    const mins = parseInt(m, 10);
    const secs = parseInt(s, 10);

    // Allow > 24 hours for GTFS
    // Cap minutes/seconds at 59
    const finalM = Math.min(59, mins).toString().padStart(2, '0');
    const finalS = Math.min(59, secs).toString().padStart(2, '0');

    return `${h.padStart(2, '0')}:${finalM}:${finalS}`;
};

export const getAllTimezones = (): string[] => {
    try {
        if (typeof Intl !== 'undefined' && (Intl as any).supportedValuesOf) {
            return (Intl as any).supportedValuesOf('timeZone');
        }
    } catch (e) {
        console.warn('Intl.supportedValuesOf not supported, using fallback.');
    }

    // Fallback list if Intl is not supported
    return [
        'UTC',
        'America/New_York',
        'America/Chicago',
        'America/Denver',
        'America/Los_Angeles',
        'America/Mexico_City',
        'America/Monterrey',
        'America/Tijuana',
        'America/Bogota',
        'America/Lima',
        'America/Sao_Paulo',
        'America/Buenos_Aires',
        'America/Santiago',
        'Europe/London',
        'Europe/Paris',
        'Europe/Berlin',
        'Europe/Madrid',
        'Europe/Rome',
        'Asia/Tokyo',
        'Asia/Shanghai',
        'Asia/Singapore',
        'Asia/Dubai',
        'Australia/Sydney',
        'Africa/Cairo',
        'Africa/Johannesburg',
        'Africa/Lagos'
    ].sort();
};

export const COMMON_TIMEZONES = getAllTimezones();
