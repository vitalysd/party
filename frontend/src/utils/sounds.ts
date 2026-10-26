import { create } from 'zustand';

export type SoundEvent = 'join' | 'leave' | 'message' | 'call';
const defaults = { enabled: true, volume: 25 };
function readSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem('pati-sounds') || '{}');
    return { enabled: typeof saved.enabled === 'boolean' ? saved.enabled : true,
      volume: Number.isFinite(saved.volume) ? Math.max(0, Math.min(100, saved.volume)) : 25 };
  } catch { return defaults; }
}
export const useSoundSettings = create(readSettings);
export function setSoundSettings(settings: Partial<typeof defaults>) {
  useSoundSettings.setState(settings);
  try { localStorage.setItem('pati-sounds', JSON.stringify(useSoundSettings.getState())); } catch { /* Storage can be unavailable. */ }
}

let context: AudioContext | undefined;
const lastPlayed: Partial<Record<SoundEvent, number>> = {};
export async function unlockSounds() {
  try {
    context ??= new AudioContext();
    if (context.state === 'suspended') await context.resume();
  } catch { /* Audio is optional. */ }
}
export async function playSound(event: SoundEvent, preview = false) {
  const { enabled, volume } = useSoundSettings.getState();
  if ((!enabled && !preview) || volume === 0) return;
  if (preview) await unlockSounds();
  if (!context || context.state !== 'running') return;
  const now = context.currentTime;
  if (now - (lastPlayed[event] ?? -10) < 0.5) return;
  lastPlayed[event] = now;
  const notes = { join: [392, 523.25], leave: [392, 293.66], message: [330], call: [329.63, 392, 493.88] }[event];
  notes.forEach((frequency, index) => {
    const oscillator = context!.createOscillator();
    const gain = context!.createGain();
    const start = now + index * (event === 'call' ? 0.18 : 0.12);
    oscillator.type = 'sine'; oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume / 100 * 0.12, start + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
    oscillator.connect(gain); gain.connect(context!.destination);
    oscillator.start(start); oscillator.stop(start + 0.4);
    oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
  });
}
