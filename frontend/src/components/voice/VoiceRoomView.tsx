import { copyInvite } from '../../utils/invite';
import React, { useEffect } from 'react';
import { useVoiceStore } from '../../store/voiceStore';
import { useAuthStore } from '../../store/authStore';
import { VoiceCard } from './VoiceCard';
import { VoiceControlsBar } from './VoiceControlsBar';
import { ScreenShares } from './ScreenShares';
import { Radio, UserPlus, MoreHorizontal, Sparkles, PhoneCall } from 'lucide-react';

export const VoiceRoomView: React.FC = () => {
  const { currentRoomName, error, participants, isConnected, isConnecting, livekitRoom } = useVoiceStore();
  const { user } = useAuthStore();

  const roomTitle = currentRoomName || 'Вечерний сквад';

  const displayParticipants = participants;

  return (
    <div className="flex-1 flex flex-col h-full bg-pati-dark overflow-hidden">
      {!isConnected && !isConnecting && !error && <p className="m-4 text-sm text-pati-text-muted">Выберите канал, чтобы подключиться к разговору.</p>}
      {error && <p role="alert" className="m-4 text-sm text-pati-red-light">{error}</p>}
      {/* LiveKit Real-Time WebRTC Audio Player */}

      {/* Top Header */}
      <div className="h-14 px-3 sm:px-6 border-b border-pati-border flex items-center justify-between bg-pati-panel/80 backdrop-blur-sm shrink-0">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-pati-accent/15 text-pati-accent flex items-center justify-center border border-pati-accent/30 shrink-0">
            <Radio className="w-4 h-4 sm:w-5 sm:h-5 animate-pulse" />
          </div>
          <div className="min-w-0">
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight truncate leading-tight">
              Голосовая комната
            </h2>
            <p className="text-[11px] sm:text-xs text-pati-text-muted truncate leading-tight mt-0.5">
              {roomTitle} · только свои
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              void copyInvite().then(() => alert('Код приглашения скопирован')).catch(() => alert('Не удалось создать приглашение'));
              
            }}
            className="px-2.5 py-1.5 sm:px-3.5 sm:py-2 bg-pati-surface-elevated hover:bg-pati-surface-hover text-white text-xs font-semibold rounded-xl border border-pati-border-strong flex items-center gap-1.5 transition active:scale-95"
          >
            <UserPlus className="w-3.5 h-3.5 text-pati-accent" />
            <span className="hidden sm:inline">Пригласить друга</span>
          </button>
          <button className="p-1.5 sm:p-2 text-pati-text-muted hover:text-white rounded-lg hover:bg-pati-surface-elevated transition">
            <MoreHorizontal className="w-4 h-4 sm:w-5 sm:h-5" />
          </button>
        </div>
      </div>

      {/* Main Room Body */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-5">
        {/* Banner with Game Art */}
        <div className="relative rounded-2xl overflow-hidden border border-pati-border bg-gradient-to-r from-pati-surface via-pati-accent-panel to-pati-panel p-3.5 sm:p-6 shadow-xl">
          <div className="absolute inset-0 bg-pati-room-glow pointer-events-none" />
          
          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-4">
            <div>
              <h1 className="text-base sm:text-2xl font-black text-white tracking-tight">
                {roomTitle}
              </h1>
              <p className="text-xs sm:text-sm text-pati-text-muted mt-0.5 font-medium">
                Играем в VALORANT · общаемся без лишнего
              </p>
            </div>

            <div className="self-start md:self-auto inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-pati-green/15 border border-pati-green/30 text-pati-green-light text-[11px] font-semibold shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-pati-green-light animate-ping" />
              <span>{isConnecting ? 'Подключение…' : isConnected ? 'В голосе' : 'Не подключено'}</span>
            </div>
          </div>
        </div>

        {/* Participants Grid Header */}
        {livekitRoom && <ScreenShares room={livekitRoom} />}
        <div className="flex items-center justify-between text-[11px] sm:text-xs font-semibold uppercase tracking-wider text-pati-text-dim">
          <span>В КОМНАТЕ · {displayParticipants.length}</span>
          <span className="text-pati-text-disabled font-normal lowercase">только участники чата</span>
        </div>

        {/* Participants Grid (2x2 matching mockup) */}
        <div className="grid grid-cols-2 gap-2 sm:gap-4">
          {displayParticipants.map((participant) => (
            <VoiceCard
              key={participant.identity}
              participant={participant}
              isCurrentUser={participant.identity === user?.id}
            />
          ))}
        </div>
      </div>

      {/* Bottom Voice Controls */}
      {(isConnected || isConnecting) && <VoiceControlsBar />}
    </div>
  );
};
