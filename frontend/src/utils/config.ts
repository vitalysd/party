const origin = typeof location === 'undefined' ? 'http://localhost:8000' : location.origin;
export const API_BASE_URL = import.meta.env.VITE_API_URL || origin;
export const WS_BASE_URL = import.meta.env.VITE_WS_URL || `${origin.replace(/^http/, 'ws')}/ws`;
export const LIVEKIT_SERVER_URL = import.meta.env.VITE_LIVEKIT_URL || `${origin.replace(/^http/, 'ws')}/livekit`;
