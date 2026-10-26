import { useChatScroll } from './useChatScroll';
import { DirectMessageHeader } from '../friends/DirectMessageHeader';
import { useAuthStore } from '../../store/authStore';
import { RoomVoicePanel } from '../voice/RoomVoicePanel';
import { DirectCallBar } from '../voice/DirectCallBar';
import { ChatScreenShares } from '../voice/ScreenShares';
import { LoadOlderMessages } from './LoadOlderMessages';
import React, { useEffect, useRef, useOptimistic } from 'react';
import { useChatStore } from '../../store/chatStore';
import { MessageItem } from './MessageItem';
import { ChatInput } from './ChatInput';
import { Avatar } from '../ui/Avatar';
import { Message } from '../../types';
import { Gamepad2 } from 'lucide-react';

export const ChatView: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const {
    channels,
    users,
    activeChannelId,
    messages,
    typingUsers,
    ensureMessages,
    setReplyingTo,
    toggleReaction,
  } = useChatStore();

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const currentUserId = useAuthStore(state => state.user?.id);

  const activeChannel = channels.find(c => c.id === activeChannelId) || channels[0];
  const channelMessages = activeChannel ? messages[activeChannel.id] || [] : [];

  // Deduplicate messages by ID to prevent duplicate keys and duplicate bubble renders
  const uniqueMessages = React.useMemo(() => {
    const seen = new Set<string>();
    const result: Message[] = [];
    for (const msg of channelMessages) {
      if (!seen.has(msg.id)) {
        seen.add(msg.id);
        result.push(msg);
      }
    }
    return result;
  }, [channelMessages]);

  // React 19 useOptimistic hook for instant messages list update
  const [optimisticMessages] = useOptimistic(
    uniqueMessages,
    (state: Message[], newMessage: Message) => {
      if (state.some(m => m.id === newMessage.id)) return state;
      return [...state, newMessage];
    }
  );

  const currentTyping = activeChannel ? typingUsers[activeChannel.id] : null;

  useEffect(() => {
    if (activeChannel) {
      void ensureMessages(activeChannel.id);
    }
  }, [activeChannel?.id]);

  const chatScroll = useChatScroll(activeChannel?.id, optimisticMessages.at(-1)?.id);

  if (!activeChannel) {
    return (
      <div className="flex-1 flex items-center justify-center bg-pati-dark text-pati-text-dim">
        Выберите канал или чат для начала общения
      </div>
    );
  }

  const partnerMember = activeChannel.is_direct ? activeChannel.members.find(member => member.user_id !== currentUserId) : undefined;
  const partner = partnerMember ? users.find(user => user.id === partnerMember.user_id) ?? partnerMember.user : undefined;
  const chatTitle = partner?.display_name ?? activeChannel.name;

  const members = (activeChannel.is_direct ? activeChannel.members.map(m => m.user).filter(Boolean) : users)
    .map(u => ({ name: u!.display_name, status: u!.status, activity: u!.custom_activity || '' }));
  const membersOnline = members.filter(m => m.status !== 'offline');
  const membersOffline = members.filter(m => m.status === 'offline');

  return (
    <div className="flex-1 min-w-0 flex h-full bg-pati-dark overflow-hidden">
      {/* Central Chat Stream */}
      <div className="flex-1 min-w-0 flex flex-col h-full overflow-hidden border-r border-pati-border-subtle">
        {activeChannel.is_direct && partner && <DirectMessageHeader key={`dm-header-${activeChannel.id}`} partner={partner} channelId={activeChannel.id} />}
        {activeChannel.is_direct && <DirectCallBar channelId={activeChannel.id} />}
        {/* Messages Stream */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
        <ChatScreenShares channelId={activeChannel.id} />
        <div ref={chatScroll.ref} onScroll={chatScroll.onScroll} className="flex-1 min-h-0 overflow-y-auto px-2 space-y-1">
          {activeChannel.is_direct && partner && optimisticMessages.length > 0 && <div className="my-6 text-center">
            <Avatar name={partner.display_name} url={partner.avatar_url} size="2xl" status={partner.status} className="mx-auto mb-3" />
            <h3 className="text-xl font-bold text-white">На связи с {partner.display_name}</h3>
            <p className="mt-1 text-xs text-pati-text-muted">Здесь ваши планы, мемы и «ещё одна катка».</p>
          </div>}
          <LoadOlderMessages channelId={activeChannel.id} />
          {optimisticMessages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-pati-text-dim">
              <Gamepad2 aria-hidden="true" className="w-12 h-12 text-pati-accent/40 mb-3" />
              <p className="text-sm text-pati-text-muted max-w-xs">
                Напишите первое сообщение или скиньте мем.
              </p>
            </div>
          ) : (
            optimisticMessages.map(msg => (
              <MessageItem
                key={msg.id}
                message={msg}
                onReply={setReplyingTo}
                onReaction={toggleReaction}
              />
            ))
          )}

          {/* Typing Indicator */}
          {currentTyping && currentTyping.size > 0 && (
            <div className="px-6 py-2 text-xs text-pati-text-muted flex items-center gap-2 italic animate-pulse">
              <span className="flex gap-1">
                <span className="w-1.5 h-1.5 bg-pati-accent rounded-full animate-bounce" />
                <span className="w-1.5 h-1.5 bg-pati-accent rounded-full animate-bounce delay-100" />
                <span className="w-1.5 h-1.5 bg-pati-accent rounded-full animate-bounce delay-200" />
              </span>
              <span>{Array.from(currentTyping).join(', ')} печатает...</span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
        </div>

        {/* Message Input */}
        <ChatInput
          key={activeChannel.id}
          channelId={activeChannel.id}
          placeholder={`Написать ${activeChannel.is_direct ? '' : 'в '}${chatTitle}`} 
        />
      </div>

      {/* Right Channel Members Panel (Desktop) */}
      {!compact && !activeChannel.is_direct && <div className="flex w-56 lg:w-72 xl:w-80 flex-col bg-pati-panel border-l border-pati-border p-4 shrink-0 min-h-0 overflow-hidden">
        <div className="max-h-[45%] shrink-0 overflow-y-auto">
        <div className="text-xs font-bold uppercase tracking-wider text-pati-text-dim mb-4">
          Участники — {membersOnline.length + membersOffline.length}
        </div>

        {/* Online Section */}
        <div className="mb-6">
          <div className="text-[11px] font-bold text-pati-text-disabled uppercase tracking-wider mb-2">
            В СЕТИ — {membersOnline.length}
          </div>
          <div className="space-y-1.5">
            {membersOnline.map((m, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 p-2 rounded-xl hover:bg-pati-surface transition cursor-pointer"
              >
                <Avatar name={m.name} size="sm" status={m.status} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-white truncate">
                    {m.name}
                  </div>
                  <div className="text-[11px] text-pati-text-dim truncate">
                    {m.activity}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Offline Section */}
        <div className="mb-6">
          <div className="text-[11px] font-bold text-pati-text-disabled uppercase tracking-wider mb-2">
            НЕ В СЕТИ — {membersOffline.length}
          </div>
          <div className="space-y-1.5">
            {membersOffline.map((m, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 p-2 rounded-xl hover:bg-pati-surface transition cursor-pointer opacity-70"
              >
                <Avatar name={m.name} size="sm" status={m.status} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-pati-text-secondary truncate">
                    {m.name}
                  </div>
                  <div className="text-[11px] text-pati-text-dim truncate">
                    {m.activity}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        </div>
        <RoomVoicePanel key={activeChannel.id} channel={activeChannel} />


      </div>}
    </div>
  );
};
