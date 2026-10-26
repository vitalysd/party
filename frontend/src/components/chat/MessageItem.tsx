import { MessageRetry } from './MessageRetry';
import { ProtectedImage, ProtectedFileLink } from '../ui/ProtectedMedia';
import React from 'react';
import { Message } from '../../types';
import { Avatar } from '../ui/Avatar';
import { Reply, Smile, CheckCheck, FileText, Image as ImageIcon } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';

interface MessageItemProps {
  message: Message;
  onReply: (message: Message) => void;
  onReaction: (messageId: string, emoji: string) => void;
}

export const MessageItem: React.FC<MessageItemProps> = ({
  message,
  onReply,
  onReaction,
}) => {
  const currentUserId = useAuthStore.getState().user?.id;
  const isMine = message.sender_id === currentUserId;

  const formattedTime = new Date(message.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  // Group reactions by emoji: { '🔥': { count: 3, userReacted: true } }
  const reactionGroups = (message.reactions || []).reduce<
    Record<string, { count: number; userReacted: boolean }>
  >((acc, r) => {
    if (!acc[r.emoji]) {
      acc[r.emoji] = { count: 0, userReacted: false };
    }
    acc[r.emoji].count += 1;
    if (r.user_id === currentUserId) {
      acc[r.emoji].userReacted = true;
    }
    return acc;
  }, {});

  return (
    <div
      className={`group relative flex gap-3 px-4 py-2 hover:bg-pati-panel/70 rounded-xl transition duration-150 ${
        message.is_pending ? 'opacity-70' : ''
      }`}
    >
      {/* Sender Avatar */}
      <Avatar
        name={message.sender?.display_name || 'Пользователь'}
        url={message.sender?.avatar_url}
        size="md"
      />

      <div className="flex-1 min-w-0">
        {/* Header: Name and Time */}
        <div className="flex items-center gap-2 mb-0.5">
          <span
            className={`text-sm font-semibold tracking-tight ${
              isMine ? 'text-pati-accent-text' : 'text-white'
            }`}
          >
            {message.sender?.display_name || (isMine ? 'Вы' : 'Пользователь')}
          </span>
          <span className="text-[11px] text-pati-text-dim">{formattedTime}</span>
          {isMine && !message.is_pending && !message.is_failed && (
            <CheckCheck className="w-3.5 h-3.5 text-pati-accent-light opacity-70 ml-0.5" />
          )}
        </div>

        <MessageRetry message={message} />
        {message.is_pending && <span className="text-xs text-pati-text-muted">Отправляется…</span>}

        {/* Reply Quote Banner if present */}
        {message.reply_to && (
          <div className="mb-2 pl-3 py-1 border-l-2 border-pati-accent bg-pati-surface/80 rounded-r-lg text-xs text-pati-text-muted flex flex-col">
            <span className="font-semibold text-pati-accent-text text-[11px]">
              {message.reply_to.sender?.display_name || 'Ответ'}:
            </span>
            <span className="truncate text-pati-text-muted">
              {message.reply_to.content}
            </span>
          </div>
        )}

        {/* Text Content */}
        {message.content && (
          <p className="text-sm text-pati-text-primary whitespace-pre-wrap break-words leading-relaxed select-text">
            {message.content}
          </p>
        )}

        {/* Attachments Preview */}
        {message.attachments && message.attachments.length > 0 && (
          <div className="mt-2 space-y-2">
            {message.attachments.map((att, idx) => {
              const isImage = att.content_type?.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(att.filename);
              return (
                <div key={idx} className="max-w-md">
                  {isImage ? (
                    <div className="rounded-xl overflow-hidden border border-pati-border bg-pati-panel group/img relative">
                      <ProtectedImage
                        src={att.url}
                        alt={att.filename}
                        className="max-h-80 w-auto rounded-lg object-contain hover:scale-[1.01] transition"
                        loading="lazy"
                      />
                      <div className="p-2 bg-pati-surface flex items-center justify-between text-xs text-pati-text-muted">
                        <span className="truncate font-medium">{att.filename}</span>
                        <span className="text-[10px] text-pati-text-dim">
                          {(att.size / (1024 * 1024)).toFixed(1)} МБ
                        </span>
                      </div>
                    </div>
                  ) : (
                    <ProtectedFileLink
                      href={att.url}
                        filename={att.filename}
                      
                      
                      className="inline-flex items-center gap-3 p-3 rounded-xl bg-pati-surface border border-pati-border hover:bg-pati-surface-elevated transition text-sm text-white"
                    >
                      <FileText className="w-5 h-5 text-pati-accent" />
                      <div>
                        <div className="font-medium truncate max-w-xs">{att.filename}</div>
                        <div className="text-xs text-pati-text-dim">
                          {(att.size / 1024).toFixed(0)} КБ
                        </div>
                      </div>
                    </ProtectedFileLink>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Reactions Chips */}
        {Object.keys(reactionGroups).length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-2">
            {Object.entries(reactionGroups).map(([emoji, info]) => (
              <button
                key={emoji}
                disabled={message.is_pending || message.is_failed}
                onClick={() => onReaction(message.id, emoji)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition active:scale-95 ${
                  info.userReacted
                    ? 'bg-pati-accent/20 border-pati-accent/60 text-pati-accent-text'
                    : 'bg-pati-surface border-pati-border text-pati-text-muted hover:border-pati-border-strong'
                }`}
              >
                <span>{emoji}</span>
                <span>{info.count}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Floating Hover Action Menu */}
      <div className="absolute right-4 -top-3.5 hidden group-hover:flex items-center bg-pati-surface border border-pati-border-strong rounded-lg shadow-lg px-1 py-0.5 gap-0.5 z-10">
        <button
          disabled={message.is_pending || message.is_failed}
                onClick={() => onReaction(message.id, '🔥')}
          className="p-1.5 hover:bg-pati-surface-hover rounded text-xs transition"
          title="Реакция 🔥"
        >
          🔥
        </button>
        <button
          disabled={message.is_pending || message.is_failed}
                onClick={() => onReaction(message.id, '❤️')}
          className="p-1.5 hover:bg-pati-surface-hover rounded text-xs transition"
          title="Реакция ❤️"
        >
          ❤️
        </button>
        <button
          disabled={message.is_pending || message.is_failed}
                onClick={() => onReaction(message.id, '👍')}
          className="p-1.5 hover:bg-pati-surface-hover rounded text-xs transition"
          title="Реакция 👍"
        >
          👍
        </button>
        <button
          disabled={message.is_pending || message.is_failed}
          onClick={() => onReply(message)}
          className="p-1.5 hover:bg-pati-surface-hover rounded text-pati-text-muted hover:text-white transition"
          title="Ответить"
        >
          <Reply className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
