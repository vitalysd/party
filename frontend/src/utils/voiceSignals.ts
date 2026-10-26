import { PrivateCall } from '../types';

// The audio store registers these after initialization; the chat transport stays independent.
let handlers: { call: (call: PrivateCall) => void; reconnect: () => void } | undefined;
export function registerVoiceSignals(value: NonNullable<typeof handlers>) { handlers = value; }
export function receiveCallSignal(call: PrivateCall) { handlers?.call(call); }
export function reconnectVoiceSignals() { handlers?.reconnect(); }
