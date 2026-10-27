import { FriendsList } from '../friends/FriendsList';
import { DesktopUpdateButton } from '../settings/DesktopUpdateButton';
import React, { useEffect, useState, useRef } from 'react';
import { RoomDialog } from './RoomDialog';
import { RoomIcon } from '../ui/RoomIcon';
import { Channel } from '../../types';
import { useUIStore } from '../../store/uiStore';
import { useChatStore } from '../../store/chatStore';
import { useAuthStore } from '../../store/authStore';
import { Avatar } from '../ui/Avatar';
import { copyInvite } from '../../utils/invite';
import {
  MessageSquare,
  Search,
  UserPlus,
  Check,
  Plus,
  Settings2,
  LogOut,
} from 'lucide-react';

export const Sidebar: React.FC = () => {
  const { setActiveTab, setSettingsOpen } = useUIStore();
  const { channels, users, activeChannelId, setActiveChannel, openDM, unreadCounts } = useChatStore();
  const { user, logout } = useAuthStore();



  const [search, setSearch] = useState('');
  const selectionSequence = useRef(0);
  const [openingFriendId, setOpeningFriendId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<Channel | 'new' | null>(null);
  const [error, setError] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);
  const [inviteError, setInviteError] = useState('');
  useEffect(() => {
    if (!inviteCopied) return;
    const timer = setTimeout(() => setInviteCopied(false), 1000);
    return () => clearTimeout(timer);
  }, [inviteCopied]);
  async function invite() {
    setInviting(true); setInviteCopied(false); setInviteError('');
    try { await copyInvite(); setInviteCopied(true); }
    catch { setInviteError('Не удалось скопировать приглашение. Попробуйте ещё раз.'); }
    finally { setInviting(false); }
  }
  const query = search.trim().toLocaleLowerCase();
  const friends = users.filter(u => u.id !== user?.id);
  const rooms = channels.filter(c => !c.is_direct && c.name.toLocaleLowerCase().includes(query));
  const activeChannel = channels.find(channel => channel.id === activeChannelId);
  const selectedFriendId = activeChannel?.is_direct && activeChannel.members.length === 2
    ? activeChannel.members.find(member => member.user_id !== user?.id)?.user_id
    : undefined;
  const selectedItemClass = 'bg-pati-accent/20 ring-1 ring-inset ring-pati-accent/60';
  async function openFriend(friendId: string) {
    const sequence = ++selectionSequence.current;
    const token = useAuthStore.getState().token;
    const originChannelId = useChatStore.getState().activeChannelId;
    setOpeningFriendId(friendId); setError('');
    const channelId = await openDM(friendId, false);
    if (sequence !== selectionSequence.current || token !== useAuthStore.getState().token) return;
    setOpeningFriendId(null);
    if (useChatStore.getState().activeChannelId !== originChannelId) return;
    if (!channelId) { setError('Не удалось открыть переписку. Попробуйте ещё раз.'); return; }
    setActiveChannel(channelId);
    setActiveTab('chats');
  }
  function openChannel(channelId: string) {
    ++selectionSequence.current;
    setOpeningFriendId(null); setError('');
    setActiveChannel(channelId); setActiveTab('chats');
  }
  return (
    <aside className="w-72 xl:w-80 bg-pati-sidebar border-r border-pati-border flex flex-col h-full shrink-0 select-none">
      {/* Brand Header */}
      <div className="p-4 flex items-center justify-between border-b border-pati-border-subtle">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-pati-accent flex items-center justify-center text-white shadow-md shadow-pati-accent/25">
            <MessageSquare className="w-4 h-4 fill-white/20" />
          </div>
          <span className="font-bold text-lg text-white tracking-tight">пати</span>
        </div>
      </div>

      {/* Search Input */}
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 px-3 py-2 bg-pati-surface border border-pati-border rounded-xl text-xs text-pati-text-muted focus-within:border-pati-accent transition">
          <Search className="w-4 h-4 text-pati-text-dim" />
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)} aria-label="Найти друзей и чаты"
            placeholder="Найти друзей и чаты"
            className="bg-transparent text-white placeholder-pati-text-disabled focus:outline-none w-full text-xs"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
        <FriendsList friends={friends} query={query} selectedId={selectedFriendId} openingId={openingFriendId} unreadByUser={Object.fromEntries(channels.filter(channel => channel.is_direct).flatMap(channel => channel.members.filter(member => member.user_id !== user?.id).map(member => [member.user_id, unreadCounts[channel.id] ?? 0])))} onSelect={id => void openFriend(id)} />
        <div className="px-1 pb-2 flex items-center justify-between text-[11px] font-bold text-pati-text-muted tracking-wider"><span>КОМНАТЫ</span><button onClick={() => setDialog('new')} aria-label="Создать комнату" title="Создать комнату" className="p-1 hover:text-white"><Plus className="w-4 h-4" /></button></div>
        <div className="space-y-1">{rooms.map(channel => <div key={channel.id} className={`flex items-center rounded-xl transition-colors ${activeChannelId === channel.id ? selectedItemClass : 'hover:bg-pati-surface'}`}>
          <button aria-current={activeChannelId === channel.id ? 'page' : undefined} onClick={() => openChannel(channel.id)} className="flex-1 min-w-0 flex items-center gap-3 p-2.5 text-left">
            <div className="w-9 h-9 rounded-xl bg-pati-surface-hover text-pati-accent-text flex items-center justify-center shrink-0"><RoomIcon icon={channel.icon ?? (channel.type === 'voice' ? 'radio' : 'chat')} /></div>
            <div className="min-w-0"><div className="text-xs text-white font-semibold truncate">{channel.name}</div><div className="text-[10px] text-pati-text-muted">{channel.type === 'voice' ? 'Голосовая комната' : 'Текстовая комната'}</div></div>
          </button>
          {(user?.is_admin || channel.members.some(m => m.user_id === user?.id && m.role === 'owner')) && <button onClick={() => setDialog(channel)} title={`Настройки комнаты ${channel.name}`} aria-label={`Настройки комнаты ${channel.name}`} className="p-2 text-pati-text-muted hover:text-white"><Settings2 className="w-3.5 h-3.5" /></button>}
        </div>)}</div>
        {!rooms.length && <p className="py-3 text-xs text-pati-text-muted">{query ? 'Комнаты не найдены' : 'Создайте первую комнату'}</p>}
        {error && <p role="alert" className="text-xs text-pati-red-light mt-3">{error}</p>}
      </div>
      {dialog && <RoomDialog room={dialog === 'new' ? undefined : dialog} onClose={() => setDialog(null)} />}

      {/* User Status Bar (Bottom Left) */}
      {inviteCopied && <p role="status" className="px-3 py-2 text-[11px] text-pati-green-text">Код приглашения скопирован</p>}
      {inviteError && <p role="alert" className="px-3 py-2 text-xs text-pati-red-text">{inviteError}</p>}
      <div className="p-3 bg-pati-recessed border-t border-pati-border-subtle flex items-center justify-between">
        <button type="button"
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer hover:opacity-85 transition"
          title="Открыть настройки профиля" aria-label="Открыть настройки профиля"
        >
          <Avatar
            name={user?.display_name || 'Артём'}
            url={user?.avatar_url}
            size="sm"
            status={user?.status || 'online'}
          />
          <div className="min-w-0">
            <div className="text-xs font-bold text-white truncate">
              {user?.display_name || 'Артём'}
            </div>
            <div className="text-[10px] text-pati-green-light truncate">
              {user?.status === 'online' ? 'В сети' : 'Не в сети'}
            </div>
          </div>
        </button>

        <div className="flex items-center gap-1 shrink-0">
          <DesktopUpdateButton />
          <button
            onClick={() => void invite()} disabled={inviting}
            className="p-1.5 text-pati-text-muted hover:text-white hover:bg-pati-surface-elevated rounded-lg transition"
            title={inviteCopied ? 'Код приглашения скопирован' : 'Добавить друга'}
            aria-label="Добавить друга"
          >
            {inviteCopied ? <Check className="w-3.5 h-3.5" /> : <UserPlus className="w-3.5 h-3.5" />}
          </button>

          <button
            onClick={logout}
            className="p-1.5 text-pati-text-dim hover:text-pati-red-light hover:bg-pati-surface-elevated rounded-lg transition"
            title="Выйти из аккаунта"
          >
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </aside>
  );
};
