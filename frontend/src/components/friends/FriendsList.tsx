import { useState } from 'react';
import { ChevronDown, ChevronRight, MessageSquare, Users } from 'lucide-react';
import { User } from '../../types';
import { Avatar } from '../ui/Avatar';

interface FriendsListProps {
  friends: User[];
  query: string;
  selectedId?: string;
  openingId: string | null;
  unreadByUser: Record<string, number>;
  onSelect: (userId: string) => void;
}

const statusLabels = { online: 'В сети', idle: 'Отошёл', dnd: 'Не беспокоить', offline: 'Не в сети' };

export function FriendsList({ friends, query, selectedId, openingId, unreadByUser, onSelect }: FriendsListProps) {
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState<'all' | 'online'>('all');
  const onlineCount = friends.filter(friend => friend.status === 'online').length;
  const visibleFriends = friends.filter(friend =>
    (filter === 'all' || friend.status === 'online') &&
    `${friend.display_name} ${friend.username}`.toLocaleLowerCase().includes(query),
  );

  return <section aria-label="Друзья" className="mb-5 rounded-2xl border border-pati-border bg-pati-panel">
    <div className="flex items-center gap-2 p-3">
      <button type="button" aria-expanded={expanded} aria-controls="sidebar-friends" onClick={() => setExpanded(!expanded)} className="flex flex-1 items-center gap-2 min-w-0 text-left">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-pati-accent/30 bg-pati-accent/15 text-pati-accent"><Users size={18} /></span>
        <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-white">Друзья</span><span className="block truncate text-[10px] text-pati-text-muted">Ваша компания — всегда под рукой</span></span>
        {expanded ? <ChevronDown size={14} className="shrink-0 text-pati-text-muted" /> : <ChevronRight size={14} className="shrink-0 text-pati-text-muted" />}
      </button>
    </div>
    <div id="sidebar-friends" hidden={!expanded} className="px-2 pb-2">
      <div role="group" aria-label="Фильтр друзей" className="mb-2 flex rounded-xl border border-pati-border bg-pati-surface p-1 text-xs font-semibold">
        <button type="button" aria-pressed={filter === 'all'} onClick={() => setFilter('all')} className={`flex-1 rounded-lg px-2 py-1.5 transition ${filter === 'all' ? 'bg-pati-accent text-white shadow' : 'text-pati-text-muted hover:text-white'}`}>Все · {friends.length}</button>
        <button type="button" aria-pressed={filter === 'online'} onClick={() => setFilter('online')} className={`flex-1 rounded-lg px-2 py-1.5 transition ${filter === 'online' ? 'bg-pati-accent text-white shadow' : 'text-pati-text-muted hover:text-white'}`}>В сети · {onlineCount}</button>
      </div>
      <div className="max-h-72 space-y-1 overflow-y-auto p-0.5">
        {visibleFriends.map(friend => {
          const selected = selectedId === friend.id;
          return <button type="button" key={friend.id} aria-label={`Написать ${friend.display_name}`} aria-current={selected ? 'page' : undefined} aria-busy={openingId === friend.id} onClick={() => onSelect(friend.id)} className={`flex w-full items-center gap-2.5 rounded-2xl border p-2.5 text-left transition ${selected ? 'border-pati-accent/60 bg-pati-accent/20 shadow-md' : 'border-transparent hover:border-pati-border hover:bg-pati-surface'}`}>
            <Avatar name={friend.display_name} url={friend.avatar_url} size="md" status={friend.status} />
            <span className="min-w-0 flex-1"><span className="block truncate text-xs font-semibold text-white">{friend.display_name}</span><span className="block truncate text-[11px] text-pati-text-muted">{openingId === friend.id ? 'Открываем переписку…' : friend.custom_activity || statusLabels[friend.status]}</span></span>
            {(unreadByUser[friend.id] ?? 0) > 0 && <span aria-label={`Непрочитанных: ${unreadByUser[friend.id]}`} className="rounded-full bg-pati-accent px-1.5 py-0.5 text-[10px] font-bold text-white">{unreadByUser[friend.id]}</span>}
            <span className={`shrink-0 rounded-xl p-2 ${selected ? 'bg-pati-accent text-white' : 'bg-pati-surface-elevated text-pati-text-muted'}`}><MessageSquare size={14} /></span>
          </button>;
        })}
        {!visibleFriends.length && <p className="px-2 py-3 text-xs text-pati-text-muted">{query ? 'Друзья не найдены' : filter === 'online' ? 'Пока никого нет в сети' : 'Здесь появятся ваши друзья'}</p>}
      </div>
    </div>
  </section>;
}
