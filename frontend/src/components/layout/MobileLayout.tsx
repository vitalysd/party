import { copyInvite } from '../../utils/invite';
import React, { useState } from 'react';
import { useUIStore } from '../../store/uiStore';
import { useChatStore } from '../../store/chatStore';
import { useVoiceStore } from '../../store/voiceStore';
import { useAuthStore } from '../../store/authStore';
import { Avatar } from '../ui/Avatar';
import { MobileChatView } from '../chat/MobileChatView';
import { VoiceRoomView } from '../voice/VoiceRoomView';
import {
  MessageSquare,
  Users,
  Radio,
  Search,
  SquarePen,
  ChevronRight,
  Gamepad2,
  Phone,
  UserPlus,
  SlidersHorizontal,
} from 'lucide-react';

export const MobileLayout: React.FC = () => {
  const { activeTab, setActiveTab, setSettingsOpen } = useUIStore();
  const {
    channels,
    users,
    activeChannelId,
    setActiveChannel,
    openDM,
    messages,
  } = useChatStore();

  const { isConnected, participants, currentRoomName, joinDefaultVoice, joinDirectVoice } = useVoiceStore();
  const { user } = useAuthStore();

  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  const [chatFilter, setChatFilter] = useState<'all' | 'unread'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [chatError, setChatError] = useState('');

  const displayFriends = users.filter(u => u.id !== user?.id).map(u => {
    const dm = channels.find(c => c.is_direct && c.members.some(m => m.user_id === u.id));
    const latest = dm ? messages[dm.id]?.at(-1) : undefined;
    return { ...u, activity: u.custom_activity || '', lastMsg: latest?.content || dm?.last_message || 'Открыть переписку', time: latest ? new Date(latest.created_at).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '', unread: dm?.unread_count || 0 };
  });

  const onlineFriends = displayFriends.filter(f => f.status === 'online');

  // Find squad channel
  const squadChannel = channels.find(c => !c.is_direct) || {
    id: '',
    name: 'Вечерний сквад',
    description: 'Нет доступных каналов',
  };

  const handleOpenChannel = (channelId: string) => {
    if (!channelId) { setChatError('Нет доступных каналов'); return; }
    setChatError('');
    setActiveTab('chats');
    setActiveChannel(channelId);
    setActiveChatId(channelId);
  };

  const handleOpenFriendDM = async (friendId: string) => {
    setChatError('');
    const realUser = users.find(u => u.id === friendId);
    if (realUser) {
      const channelId = await openDM(friendId);
      if (channelId) {
        setActiveTab('chats');
        setActiveChatId(channelId);
        return;
      }
    }
    setChatError('Не удалось открыть личный чат. Попробуйте ещё раз.');
  };

  // If user opened a chat conversation, show dedicated MobileChatView matching Screenshot 5
  if (activeChatId && activeTab === 'chats') {
    return <MobileChatView key={activeChannelId} onBack={() => setActiveChatId(null)} />;
  }

  return (
    <div className="flex flex-col h-full bg-pati-dark text-white overflow-hidden select-none">
      {chatError && <p role="alert" className="p-3 text-sm text-pati-red-text">{chatError}</p>}
      {/* Tab Content Container */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'voice' && <VoiceRoomView />}

        {/* Friends Tab on Mobile */}
        {activeTab === 'friends' && (
          <div className="p-4 space-y-4">
            <div className="flex items-center justify-between pt-1">
              <div>
                <h1 className="text-xl font-black text-white tracking-tight">Друзья</h1>
                <p className="text-xs text-pati-text-muted">Ваша компания — всегда на связи</p>
              </div>
              <button
                onClick={() => {
                  void copyInvite().then(() => alert('Код приглашения скопирован')).catch(() => alert('Не удалось создать приглашение'));
                  
                }}
                className="p-2.5 bg-pati-accent hover:bg-pati-accent-hover text-white rounded-xl shadow-md shadow-pati-accent/20"
                title="Добавить друга"
              >
                <UserPlus className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {displayFriends.map(f => (
                <div
                  key={f.id}
                  onClick={() => handleOpenFriendDM(f.id)}
                  className="flex items-center justify-between p-3 rounded-2xl bg-pati-panel border border-pati-border active:scale-[0.99] transition cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Avatar
                      name={f.display_name}
                      url={f.avatar_url}
                      size="md"
                      status={f.status}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white truncate">
                        {f.display_name}
                      </div>
                      <div className="text-xs text-pati-text-muted truncate mt-0.5">
                        {f.activity}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        joinDirectVoice(f.id);
                        setActiveTab('voice');
                      }}
                      className="p-2 rounded-xl bg-pati-surface-elevated text-pati-accent hover:bg-pati-surface-hover"
                      title="Позвонить"
                    >
                      <Phone className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Chats Tab on Mobile - Exact match to Screenshot 4 */}
        {activeTab === 'chats' && (
          <div className="p-4 space-y-3.5">
            {/* Header: Title + Subtitle + Actions */}
            <div className="flex items-center justify-between pt-1">
              <div>
                <h1 className="text-2xl font-black text-white tracking-tight">Чаты</h1>
                <p className="text-xs text-pati-text-dim">пати · рядом со своими</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="p-2 bg-pati-surface border border-pati-border text-white rounded-xl hover:bg-pati-surface-elevated transition active:scale-95"
                  title="Настройки профиля"
                >
                  <SlidersHorizontal className="w-4 h-4 text-pati-accent-text" />
                </button>
                <button
                  onClick={() => {
                    if (displayFriends.length > 0) {
                      handleOpenFriendDM(displayFriends[0].id);
                    }
                  }}
                  className="p-2 bg-pati-surface border border-pati-border text-white rounded-xl hover:bg-pati-surface-elevated transition active:scale-95"
                  title="Написать"
                >
                  <SquarePen className="w-4 h-4 text-pati-accent-text" />
                </button>
              </div>
            </div>

            {/* Search Input */}
            <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-pati-panel border border-pati-border rounded-2xl text-xs text-pati-text-muted">
              <Search className="w-4 h-4 text-pati-text-dim shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Найти друга или чат"
                className="bg-transparent text-white placeholder-pati-text-disabled focus:outline-none w-full text-xs"
              />
            </div>

            {/* Voice Pinned Quick Banner (Screenshot 4) */}
            <button
              onClick={() => {
                joinDefaultVoice();
                setActiveTab('voice');
              }}
              className="w-full p-3 rounded-2xl bg-gradient-to-r from-pati-accent-panel to-pati-accent-panel-end border border-pati-accent-border flex items-center justify-between text-left shadow-lg active:scale-[0.99] transition"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-xl bg-pati-accent/20 text-pati-accent-light flex items-center justify-center shrink-0">
                  <Radio className="w-4 h-4 animate-pulse text-pati-accent" />
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] font-bold text-pati-green-light flex items-center gap-1.5 leading-tight">
                    <span className="w-1.5 h-1.5 rounded-full bg-pati-green-light shrink-0" />
                    <span>{isConnected ? `В голосе · ${participants.length}` : 'Подключиться к голосу'}</span>
                  </div>
                  <div className="text-xs text-white font-bold truncate mt-0.5">
                    Вечерний сквад
                  </div>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-pati-text-muted shrink-0" />
            </button>

            {/* Filter Pills */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => setChatFilter('all')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                  chatFilter === 'all'
                    ? 'bg-pati-accent-panel text-pati-accent-text shadow-sm'
                    : 'bg-pati-panel text-pati-text-dim'
                }`}
              >
                Все
              </button>
              <button
                onClick={() => setChatFilter('unread')}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition ${
                  chatFilter === 'unread'
                    ? 'bg-pati-accent-panel text-pati-accent-text shadow-sm'
                    : 'bg-pati-panel text-pati-text-dim'
                }`}
              >
                Непрочитанные · {displayFriends.reduce((sum, friend) => sum + friend.unread, 0)}
              </button>
            </div>

            {/* Chats List */}
            <div className="space-y-1.5">
              {/* Group Squad Channel */}
              {(!searchQuery || squadChannel.name.toLowerCase().includes(searchQuery.toLowerCase())) && (
                <div
                  onClick={() => handleOpenChannel(squadChannel.id)}
                  className="flex items-center justify-between p-3 rounded-2xl bg-pati-panel border border-pati-border active:scale-[0.99] transition cursor-pointer"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-11 h-11 rounded-2xl bg-pati-surface-hover flex items-center justify-center text-pati-accent-text border border-pati-border-strong shrink-0">
                      <Gamepad2 className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-white truncate">
                        {squadChannel.name}
                      </div>
                      <div className="text-xs text-pati-text-muted truncate mt-0.5">
                        {messages[squadChannel.id]?.at(-1)?.content || 'Открыть канал'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0 flex flex-col items-end gap-1">
                    <span className="text-[11px] text-pati-text-dim"></span>
                  </div>
                </div>
              )}

              {/* Friends DMs */}
              {displayFriends
                .filter(f => !searchQuery || f.display_name.toLowerCase().includes(searchQuery.toLowerCase()))
                .filter(f => (chatFilter === 'unread' ? f.unread > 0 : true))
                .map(item => (
                  <div
                    key={item.id}
                    onClick={() => handleOpenFriendDM(item.id)}
                    className="flex items-center justify-between p-3 rounded-2xl bg-pati-panel border border-pati-border active:scale-[0.99] transition cursor-pointer"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Avatar
                        name={item.display_name}
                        url={item.avatar_url}
                        size="lg"
                        status={item.status}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-bold text-white truncate">
                          {item.display_name}
                        </div>
                        <div className="text-xs text-pati-text-muted truncate mt-0.5">
                          {item.lastMsg}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      <span className="text-[11px] text-pati-text-dim">{item.time}</span>
                      {item.unread > 0 && (
                        <span className="px-1.5 py-0.5 min-w-[18px] text-center rounded-full bg-pati-accent text-white text-[10px] font-bold">
                          {item.unread}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
            </div>

            {/* Friends Online Horizontal Section (Screenshot 4) */}
            <div className="pt-2">
              <div
                onClick={() => setActiveTab('friends')}
                className="flex items-center justify-between text-xs font-bold text-pati-text-muted mb-2.5 cursor-pointer"
              >
                <span>Друзья в сети · {onlineFriends.length}</span>
                <ChevronRight className="w-4 h-4" />
              </div>

              <div className="flex items-center gap-3.5 overflow-x-auto pb-2 scrollbar-none">
                {onlineFriends.map(f => (
                  <div
                    key={f.id}
                    onClick={() => handleOpenFriendDM(f.id)}
                    className="flex flex-col items-center gap-1 shrink-0 cursor-pointer active:scale-95 transition"
                  >
                    <Avatar
                      name={f.display_name}
                      url={f.avatar_url}
                      size="lg"
                      status="online"
                    />
                    <span className="text-[11px] font-semibold text-pati-text-secondary truncate max-w-[60px] text-center">
                      {f.display_name}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navigation Bar - Exact match to Screenshot 4 */}
      <nav className="h-16 bg-pati-panel border-t border-pati-border-subtle flex items-center justify-around shrink-0 px-3 z-10">
        <button
          onClick={() => setActiveTab('chats')}
          className={`flex flex-col items-center gap-1 transition active:scale-95 ${
            activeTab === 'chats' ? 'text-pati-accent' : 'text-pati-text-dim hover:text-white'
          }`}
        >
          <div
            className={`px-3 py-1 rounded-xl transition ${
              activeTab === 'chats' ? 'bg-pati-accent/20' : ''
            }`}
          >
            <MessageSquare className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-bold">Чаты</span>
        </button>

        <button
          onClick={() => setActiveTab('friends')}
          className={`flex flex-col items-center gap-1 transition active:scale-95 ${
            activeTab === 'friends' ? 'text-pati-accent' : 'text-pati-text-dim hover:text-white'
          }`}
        >
          <div
            className={`px-3 py-1 rounded-xl transition ${
              activeTab === 'friends' ? 'bg-pati-accent/20' : ''
            }`}
          >
            <Users className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-bold">Друзья</span>
        </button>

        <button
          onClick={() => {
            setActiveTab('voice');
            if (!isConnected) joinDefaultVoice();
          }}
          className={`flex flex-col items-center gap-1 transition active:scale-95 ${
            activeTab === 'voice' ? 'text-pati-accent' : 'text-pati-text-dim hover:text-white'
          }`}
        >
          <div
            className={`px-3 py-1 rounded-xl transition ${
              activeTab === 'voice' ? 'bg-pati-accent/20' : ''
            }`}
          >
            <Radio className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-bold">Голос</span>
        </button>
      </nav>
    </div>
  );
};
