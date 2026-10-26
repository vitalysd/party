import { ParticipantVolume } from './ParticipantVolume';
import React from 'react';
import { VoiceParticipant } from '../../types';
import { Avatar } from '../ui/Avatar';
import { useUIStore } from '../../store/uiStore';
import { Mic, MicOff, Volume2 } from 'lucide-react';

interface VoiceCardProps {
  participant: VoiceParticipant;
  isCurrentUser?: boolean;
}

export const VoiceCard: React.FC<VoiceCardProps> = ({ participant, isCurrentUser }) => {
  const { isMobile } = useUIStore();
  const isSpeaking = participant.isSpeaking;

  return (
    <div
      className={`relative flex flex-col items-center justify-center rounded-2xl p-3 sm:p-6 transition-all duration-300 min-h-[140px] sm:min-h-[200px] ${
        isSpeaking
          ? 'bg-pati-surface border-2 border-pati-accent shadow-pati-voice'
          : 'bg-pati-panel border border-pati-border hover:border-pati-border-strong'
      }`}
    >
      {/* Speaking glow indicator or mute badge */}
      <div className="relative mb-2 sm:mb-4">
        <Avatar
          name={participant.name}
          url={participant.avatar_url}
          size={isMobile ? 'lg' : '2xl'}
          isSpeaking={isSpeaking}
        />
        {participant.isMuted && (
          <div className="absolute -bottom-1 -right-1 bg-pati-red/90 text-white p-1 rounded-full ring-2 ring-pati-border-subtle">
            <MicOff className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
          </div>
        )}
      </div>

      {/* Participant Name */}
      <div className="text-center">
        <h3 className="text-xs sm:text-base font-semibold text-white flex items-center justify-center gap-1">
          <span className="truncate max-w-[120px] sm:max-w-none">{participant.name}</span>
          {isSpeaking && (
            <span className="flex items-center gap-0.5 text-pati-accent">
              <span className="w-1 h-3 bg-pati-accent animate-pulse rounded-full" />
              <span className="w-1 h-4 bg-pati-accent animate-pulse delay-75 rounded-full" />
              <span className="w-1 h-2 bg-pati-accent animate-pulse delay-150 rounded-full" />
            </span>
          )}
        </h3>

        {/* State label */}
        <p
          className={`text-[10px] sm:text-xs mt-0.5 sm:mt-1 font-medium flex items-center justify-center gap-1 ${
            isSpeaking
              ? 'text-pati-accent'
              : participant.isMuted
              ? 'text-pati-red-light'
              : 'text-pati-text-muted'
          }`}
        >
          {isSpeaking ? (
            'Говорит'
          ) : participant.isMuted ? (
            <>
              <MicOff className="w-3 h-3" />
              <span>Микрофон выключен</span>
            </>
          ) : (
            <>
              <Volume2 className="w-3 h-3" />
              <span>{participant.statusText || 'Слушает'}</span>
            </>
          )}
        </p>
      </div>
      {!isCurrentUser && <ParticipantVolume identity={participant.identity} name={participant.name} />}
    </div>
  );
};
