import { create } from 'zustand';

export type ActiveTab = 'chats' | 'friends' | 'voice';

interface UIState {
  activeTab: ActiveTab;
  isMobile: boolean;
  isChatDrawerOpen: boolean; // For mobile full chat overlay or desktop side chat
  isSettingsOpen: boolean;
  selectedFriendId: string | null;

  setActiveTab: (tab: ActiveTab) => void;
  setIsMobile: (isMobile: boolean) => void;
  setChatDrawerOpen: (isOpen: boolean) => void;
  setSettingsOpen: (isOpen: boolean) => void;
  setSelectedFriendId: (friendId: string | null) => void;
}

export const useUIStore = create<UIState>((set) => ({
  activeTab: 'chats',
  isMobile: window.innerWidth < 768,
  isChatDrawerOpen: false,
  isSettingsOpen: false,
  selectedFriendId: null,

  setActiveTab: (tab: ActiveTab) => set({ activeTab: tab }),
  setIsMobile: (isMobile: boolean) => set({ isMobile }),
  setChatDrawerOpen: (isOpen: boolean) => set({ isChatDrawerOpen: isOpen }),
  setSettingsOpen: (isOpen: boolean) => set({ isSettingsOpen: isOpen }),
  setSelectedFriendId: (friendId: string | null) => set({ selectedFriendId: friendId }),
}));
