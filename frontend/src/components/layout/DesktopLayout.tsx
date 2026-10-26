import React, { useEffect } from 'react';
import { Sidebar } from './Sidebar';
import { ChatView } from '../chat/ChatView';
import { useUIStore } from '../../store/uiStore';
import { useVoiceStore } from '../../store/voiceStore';
import { useChatStore } from '../../store/chatStore';

export const DesktopLayout: React.FC = () => {
  const activeTab = useUIStore(state => state.activeTab);
  const voiceChannelId = useVoiceStore(state => state.currentChannelId);
  useEffect(() => {
    if (activeTab === 'voice' && voiceChannelId) {
      useChatStore.getState().setActiveChannel(voiceChannelId);
    }
  }, [activeTab, voiceChannelId]);
  return <div className="flex h-screen w-screen overflow-hidden bg-pati-dark text-white">
    <Sidebar />
    <main className="flex-1 min-w-0 flex overflow-hidden">
      <ChatView />
    </main>
  </div>;
};
