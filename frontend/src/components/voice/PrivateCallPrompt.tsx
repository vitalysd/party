import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Phone, PhoneOff, X } from 'lucide-react';
import { useVoiceStore } from '../../store/voiceStore';
import { useAuthStore } from '../../store/authStore';
import { useModalFocus } from '../ui/useModalFocus';

function IncomingCall({ name }: { name: string }) {
  const ref = useModalFocus();
  const [busy, setBusy] = useState(false);
  const error = useVoiceStore(state => state.error);
  async function answer(accept: boolean) {
    setBusy(true);
    try { await (accept ? useVoiceStore.getState().acceptCall() : useVoiceStore.getState().endCall()); }
    finally { setBusy(false); }
  }
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4" onKeyDown={event => { if (event.key === 'Escape' && !busy) void answer(false); }}>
    <div ref={ref} role="dialog" aria-modal="true" aria-labelledby="incoming-call-title" tabIndex={-1} className="w-full max-w-sm rounded-2xl border border-pati-border bg-pati-panel p-6 text-center shadow-2xl">
      <Phone className="mx-auto mb-3 h-9 w-9 text-pati-accent" />
      <h2 id="incoming-call-title" className="text-lg font-bold text-white">Входящий звонок</h2>
      <p className="mt-2 break-words text-sm text-pati-text-muted">{name}</p>
      <p className="mt-2 text-xs text-pati-text-dim">Микрофон включится после принятия звонка.</p>
      {error && <p role="alert" className="mt-3 text-xs text-pati-red-text">{error}</p>}
      <div className="mt-5 flex gap-3"><button type="button" disabled={busy} onClick={() => void answer(false)} className="flex-1 rounded-xl bg-pati-red/20 p-3 text-sm text-pati-red-text disabled:opacity-50">Отклонить</button><button type="button" disabled={busy} onClick={() => void answer(true)} className="flex-1 rounded-xl bg-pati-accent p-3 text-sm text-white hover:bg-pati-accent-hover disabled:opacity-50">Принять звонок</button></div>
    </div>
  </div>;
}

export function PrivateCallPrompt() {
  const call = useVoiceStore(state => state.call);
  const notice = useVoiceStore(state => state.callNotice);
  const userId = useAuthStore(state => state.user?.id);
  if (!call || call.status !== 'ringing') return notice ? createPortal(<div className="fixed bottom-5 right-5 z-[70] flex items-center gap-3 rounded-xl border border-pati-border bg-pati-panel p-4 text-sm text-pati-text-muted shadow-xl"><span role="status">{notice}</span><button type="button" aria-label="Закрыть уведомление" onClick={() => useVoiceStore.setState({ callNotice: null })}><X size={16} /></button></div>, document.body) : null;
  if (call.callee_id === userId) return createPortal(<IncomingCall key={call.id} name={call.caller_name} />, document.body);
  return createPortal(<div className="fixed bottom-5 right-5 z-[70] flex max-w-sm items-center gap-3 rounded-2xl border border-pati-border bg-pati-panel p-4 shadow-2xl">
    <Phone className="shrink-0 text-pati-accent" size={20} /><div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{call.callee_name}</p><p role="status" className="text-xs text-pati-text-muted">Ожидаем ответа…</p></div><button type="button" aria-label="Отменить звонок" title="Отменить звонок" onClick={() => void useVoiceStore.getState().endCall()} className="rounded-xl bg-pati-red/20 p-3 text-pati-red-text"><PhoneOff size={18} /></button>
  </div>, document.body);
}
