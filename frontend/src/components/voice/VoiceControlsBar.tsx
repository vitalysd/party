import React from 'react';
import { useVoiceStore } from '../../store/voiceStore';
import { useUIStore } from '../../store/uiStore';
import {
  Mic,
  MicOff,
  Headphones,
  Monitor,
  PhoneOff,
  MessageSquare,
  Activity,
} from 'lucide-react';

export const VoiceControlsBar: React.FC = () => {
  const {
    isMuted,
    isDeafened,
    isScreenSharing,
    pingMs,
    toggleMute,
    toggleDeafen,
    toggleScreenShare,
    leaveVoice,
  } = useVoiceStore();

  const { isChatDrawerOpen, setChatDrawerOpen } = useUIStore();

  return (
    <div className="bg-pati-panel border-t border-pati-border px-3 py-2.5 sm:px-6 sm:py-4 flex flex-col gap-2 shrink-0">
      <div className="flex items-center justify-between">
        {/* Left: Connection Stats (Desktop only) */}
        <div className="hidden md:flex items-center gap-2.5 min-w-[160px]">
          <div className="flex items-end gap-0.5 text-pati-green-light">
            <span className="w-1 h-2 bg-pati-green-light rounded-full" />
            <span className="w-1 h-3 bg-pati-green-light rounded-full" />
            <span className="w-1 h-4 bg-pati-green-light rounded-full" />
          </div>
          <div>
            <div className="text-xs font-semibold text-pati-green-light leading-tight">
              Голосовая связь
            </div>
            <div className="text-[11px] text-pati-text-dim">
              Подключено
            </div>
          </div>
        </div>

        {/* Center: Action Buttons (Responsive on all screens) */}
        <div className="flex items-center justify-center gap-3 sm:gap-5 w-full md:w-auto">
          {/* Mic Button */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={toggleMute}
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition active:scale-95 shadow-md ${
                isMuted
                  ? 'bg-pati-red/20 text-pati-red-light border border-pati-red/30 hover:bg-pati-red/30'
                  : 'bg-pati-surface-elevated text-white hover:bg-pati-surface-hover border border-pati-border-strong'
              }`}
              title={isMuted ? 'Включить микрофон' : 'Выключить микрофон'}
            >
              {isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
            <span
              className={`text-[10px] sm:text-[11px] font-medium ${
                isMuted ? 'text-pati-red-light' : 'text-pati-text-muted'
              }`}
            >
              {isMuted ? 'Микр. выкл' : 'Микр. вкл'}
            </span>
          </div>

          {/* Sound / Deafen Button */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={toggleDeafen}
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition active:scale-95 shadow-md ${
                isDeafened
                  ? 'bg-pati-red/20 text-pati-red-light border border-pati-red/30 hover:bg-pati-red/30'
                  : 'bg-pati-surface-elevated text-white hover:bg-pati-surface-hover border border-pati-border-strong'
              }`}
              title={isDeafened ? 'Включить звук' : 'Заглушить звук'}
            >
              <Headphones className="w-5 h-5" />
            </button>
            <span className="text-[10px] sm:text-[11px] font-medium text-pati-text-muted">
              {isDeafened ? 'Звук выкл' : 'Звук вкл'}
            </span>
          </div>

          {/* Screen Share Button */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={toggleScreenShare}
              className={`w-11 h-11 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl flex items-center justify-center transition active:scale-95 shadow-md ${
                isScreenSharing
                  ? 'bg-pati-accent text-white shadow-pati-accent/30'
                  : 'bg-pati-surface-elevated text-white hover:bg-pati-surface-hover border border-pati-border-strong'
              }`}
              title="Демонстрация экрана"
            >
              <Monitor className="w-5 h-5" />
            </button>
            <span className="text-[10px] sm:text-[11px] font-medium text-pati-text-muted">
              {isScreenSharing ? 'Трансляция' : 'Экран'}
            </span>
          </div>

          {/* Leave Voice Room Button */}
          <div className="flex flex-col items-center gap-1">
            <button
              onClick={() => leaveVoice()}
              className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-pati-red/20 hover:bg-pati-red text-pati-red-light hover:text-white border border-pati-red/40 flex items-center justify-center transition active:scale-95 shadow-md"
              title="Отключиться от комнаты"
            >
              <PhoneOff className="w-5 h-5" />
            </button>
            <span className="text-[10px] sm:text-[11px] font-medium text-pati-red-light">
              Выйти
            </span>
          </div>
        </div>

        {/* Right: Toggle Chat Button (Desktop only) */}
        <div className="hidden md:flex justify-end min-w-[160px]">
          <button
            onClick={() => setChatDrawerOpen(!isChatDrawerOpen)}
            className={`px-4 py-2.5 rounded-xl border flex items-center gap-2 text-xs font-semibold transition ${
              isChatDrawerOpen
                ? 'bg-pati-accent border-pati-accent text-white'
                : 'bg-pati-surface-elevated border-pati-border-strong text-pati-text-muted hover:text-white hover:bg-pati-surface-hover'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>{isChatDrawerOpen ? 'Закрыть чат' : 'Открыть чат'}</span>
          </button>
        </div>
      </div>

      {/* Helpful Hint */}
      {isMuted && (
        <div className="text-center text-[10px] sm:text-[11px] text-pati-text-dim">
          Вас не слышно. Нажмите на микрофон, чтобы говорить.
        </div>
      )}
    </div>
  );
};
