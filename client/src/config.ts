/** Centralized API base URL. Uses VITE_API_URL in Docker, falls back to localhost:5555 for local dev. */
export const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5555';

/** WebSocket URL derived from the API base (same host, ws:// protocol). */
export const WS_URL = API_BASE.replace(/^http/, 'ws');
