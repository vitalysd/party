import { playSound, setSoundSettings, useSoundSettings, SoundEvent } from '../../utils/sounds';

export function SoundSettings() {
  const { enabled, volume } = useSoundSettings();
  const examples: [SoundEvent, string][] = [['join', 'Вход в голос'], ['leave', 'Выход из голоса'], ['message', 'Сообщение'], ['call', 'Звонок']];
  return <section aria-label="Звуки приложения" className="rounded-xl border border-pati-border p-4 space-y-3">
    <label className="flex items-center gap-2 text-sm text-white"><input type="checkbox" checked={enabled} onChange={event => setSoundSettings({ enabled: event.target.checked })} />Звуки приложения</label>
    <label className="flex items-center gap-3 text-xs text-pati-text-muted">Громкость
      <input aria-label="Громкость звуков приложения" type="range" min="0" max="100" value={volume} onChange={event => setSoundSettings({ volume: Number(event.target.value) })} className="min-w-0 flex-1 accent-pati-accent" />{volume}%
    </label>
    <div className="flex flex-wrap gap-2">{examples.map(([event, label]) => <button key={event} type="button" onClick={() => playSound(event, true)} className="rounded-lg bg-pati-surface-elevated px-3 py-2 text-xs text-pati-text-secondary hover:text-white" aria-label={`Прослушать: ${label}`}>{label}</button>)}</div>
  </section>;
}
