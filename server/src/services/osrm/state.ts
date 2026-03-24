import http from 'http';
import { OsrmStatus } from './config';

export const state: {
    currentStatus: OsrmStatus;
    activeHttpRequest: http.ClientRequest | null;
    activeSetupRegion: string | null;
} = {
    currentStatus: { status: 'idle', message: 'Ready' },
    activeHttpRequest: null,
    activeSetupRegion: null,
};
