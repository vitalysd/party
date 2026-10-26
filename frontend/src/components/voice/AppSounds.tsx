import { useEffect } from 'react';
import { useVoiceStore } from '../../store/voiceStore';
import { useChatStore } from '../../store/chatStore';
import { useAuthStore } from '../../store/authStore';
import { playSound, unlockSounds } from '../../utils/sounds';

export function AppSounds() {
  const call = useVoiceStore(state => state.call);
  const userId = useAuthStore(state => state.user?.id);
  useEffect(() => {
    document.addEventListener('pointerdown', unlockSounds);
    document.addEventListener('keydown', unlockSounds);
    const stopVoice = useVoiceStore.subscribe((next, prev) => {
      if (next.isConnected && !prev.isConnected) playSound('join');
      else if (!next.isConnected && prev.isConnected) playSound('leave');
      else if (next.isConnected && next.currentChannelId === prev.currentChannelId) {
        const before = new Set(prev.participants.map(person => person.identity));
        const after = new Set(next.participants.map(person => person.identity));
        if ([...after].some(id => !before.has(id))) playSound('join');
        if ([...before].some(id => !after.has(id))) playSound('leave');
      }
    });
    const stopChat = useChatStore.subscribe((next, prev) => {
      if (Object.entries(next.unreadCounts).some(([id, count]) => count > (prev.unreadCounts[id] ?? 0) && id !== next.activeChannelId)) playSound('message');
    });
    return () => { stopVoice(); stopChat(); document.removeEventListener('pointerdown', unlockSounds); document.removeEventListener('keydown', unlockSounds); };
  }, []);
  useEffect(() => {
    if (call?.status !== 'ringing' || call.callee_id !== userId) return;
    playSound('call');
    const timer = setInterval(() => playSound('call'), 4500);
    return () => clearInterval(timer);
  }, [call?.id, call?.status, call?.callee_id, userId]);
  return null;
}
