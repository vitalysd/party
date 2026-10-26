import React, { useEffect } from 'react';
import { useAuthStore } from './store/authStore';
import { useChatStore } from './store/chatStore';
import { useUIStore } from './store/uiStore';
import { DesktopLayout } from './components/layout/DesktopLayout';
import { MobileLayout } from './components/layout/MobileLayout';
import { AuthModal } from './components/auth/AuthModal';
import { SettingsModal } from './components/settings/SettingsModal';
import { VoiceAudio } from './components/voice/VoiceAudio';
import { PrivateCallPrompt } from './components/voice/PrivateCallPrompt';
import { useVoiceStore } from './store/voiceStore';
import { AppSounds } from './components/voice/AppSounds';
import { DesktopNotifications } from './components/settings/DesktopNotifications';

export const App: React.FC = () => {
  const { token, isAuthenticated, fetchMe } = useAuthStore();
  const incomingCall = useVoiceStore(state => state.call?.status === 'ringing' && state.call.callee_id === useAuthStore.getState().user?.id);
  const { loadChannels, loadUsers, initWebSocket, disconnectWebSocket } = useChatStore();
  const { isMobile, setIsMobile, isSettingsOpen, setSettingsOpen } = useUIStore();

  // Handle window resizing for responsive desktop / mobile layout
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [setIsMobile]);

  // Handle initialization on auth state change
  useEffect(() => {
    if (isAuthenticated) {
      fetchMe();
      loadChannels();
      loadUsers();
      initWebSocket();
    } else {
      disconnectWebSocket();
    }

    return () => {
      disconnectWebSocket();
    };
  }, [token, isAuthenticated, fetchMe, loadChannels, loadUsers, initWebSocket, disconnectWebSocket]);

  return (
    <div className="h-full w-full overflow-hidden bg-pati-dark">
      {isAuthenticated && <VoiceAudio />}
      {isAuthenticated && <AppSounds />}
      {isAuthenticated && <DesktopNotifications />}
      {isAuthenticated && <PrivateCallPrompt />}
      {!isAuthenticated && <AuthModal />}
      {isAuthenticated && isSettingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}
      {isAuthenticated && <div className="h-full" inert={isSettingsOpen || incomingCall}>
        {isMobile ? <MobileLayout /> : <DesktopLayout />}
      </div>}
    </div>
  );
};

export default App;
