import { useChatScroll } from './useChatScroll';
import { MessageRetry } from './MessageRetry';
import { ChatScreenShares } from '../voice/ScreenShares';
import { LoadOlderMessages } from './LoadOlderMessages';
import { ProtectedImage, ProtectedFileLink } from '../ui/ProtectedMedia';
import React, { useState, useRef, useEffect, useOptimistic } from 'react';
import { useChatStore } from '../../store/chatStore';
import { useVoiceStore } from '../../store/voiceStore';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { Avatar } from '../ui/Avatar';
import { Message, Attachment } from '../../types';
import {
  Gamepad2,
  ArrowLeft,
  Phone,
  Radio,
  ChevronRight,
  Plus,
  Smile,
  ArrowUp,
  X,
  CheckCheck,
  FileText,
  Loader2,
} from 'lucide-react';

interface MobileChatViewProps {
  onBack: () => void;
}

export const MobileChatView: React.FC<MobileChatViewProps> = ({ onBack }) => {
  const {
    channels,
    users,
    activeChannelId,
    messages,
    typingUsers,
    ensureMessages,
    sendMessage,
    toggleReaction,
    replyingTo,
    setReplyingTo,
    sendTyping,
    uploadFile,
  } = useChatStore();

  const { user } = useAuthStore();
  const { isConnected, joinVoice, joinDefaultVoice } = useVoiceStore();
  const { setActiveTab } = useUIStore();

  const [content, setContent] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<Attachment[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const activeChannel = channels.find(c => c.id === activeChannelId) || channels[0];
  const channelMessages = activeChannel ? messages[activeChannel.id] || [] : [];

  // Deduplicate messages
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

  const [optimisticMessages] = useOptimistic(
    uniqueMessages,
    (state: Message[], newMessage: Message) => {
      if (state.some(m => m.id === newMessage.id)) return state;
      return [...state, newMessage];
    }
  );

  const currentTyping = activeChannel ? typingUsers[activeChannel.id] : null;

  // Determine chat partner name & status for DM channels
  const partnerUser = React.useMemo(() => {
    if (!activeChannel || !activeChannel.is_direct) return null;
    const partnerMember = activeChannel.members?.find(m => m.user_id !== user?.id);
    if (partnerMember?.user) return partnerMember.user;
    return users.find(u => u.display_name === activeChannel.name) || null;
  }, [activeChannel, user?.id, users]);

  useEffect(() => {
    if (activeChannel) {
      void ensureMessages(activeChannel.id);
    }
  }, [activeChannel?.id]);

  const chatScroll = useChatScroll(activeChannel?.id, optimisticMessages.at(-1)?.id);

  const handleSend = async () => {
    if (isSending || !activeChannel) return;
    const trimmed = content.trim();
    if (!trimmed && attachedFiles.length === 0) return;

    setIsSending(true);
    const filesToSend = [...attachedFiles];
    const textToSend = trimmed;

    setContent('');
    setAttachedFiles([]);
    setShowEmojiPicker(false);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    sendTyping(activeChannel.id, false);

    try {
      await sendMessage(activeChannel.id, textToSend, filesToSend);
    } finally {
      setIsSending(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const attachment = await uploadFile(file, { channelId: activeChannel?.id });
      if (attachment) {
        setAttachedFiles(prev => [...prev, attachment]);
      }
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 100)}px`;
    }

    if (activeChannel) {
      sendTyping(activeChannel.id, true);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => {
        sendTyping(activeChannel.id, false);
      }, 2000);
    }
  };

  const quickEmojis = ['😀', '😂', '🔥', '❤️', '👍', '🎉', '🎮', '✌️', '😎', '👀', '💯'];

  const chatTitle = partnerUser?.display_name || activeChannel?.name || 'Чат';
  const chatSubtitle = partnerUser
    ? `${partnerUser.status === 'online' ? 'В сети' : 'Не в сети'}${
        partnerUser.custom_activity ? ` · ${partnerUser.custom_activity}` : ''
      }`
    : activeChannel?.description || '5 участников';

  return (
    <div className="flex flex-col h-full bg-pati-dark text-white overflow-hidden select-none">
      {/* Top Header - Exact match to Screenshot 5 */}
      <div className="h-14 px-3 border-b border-pati-border-subtle flex items-center justify-between bg-pati-panel shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={onBack}
            className="p-1.5 -ml-1 text-pati-text-muted hover:text-white active:scale-95 rounded-xl transition"
            aria-label="Назад"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <Avatar
            name={chatTitle}
            url={partnerUser?.avatar_url}
            size="sm"
            status={partnerUser?.status || (activeChannel?.is_direct ? 'offline' : undefined)}
          />

          <div className="min-w-0">
            <h2 className="text-sm font-bold text-white tracking-tight truncate leading-tight">
              {chatTitle}
            </h2>
            <p className="text-[11px] text-pati-text-dim truncate leading-tight mt-0.5">
              {chatSubtitle}
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            activeChannel?.is_direct ? useVoiceStore.getState().startCall(activeChannel.id) : joinDefaultVoice();
            setActiveTab('voice');
          }}
          className="w-9 h-9 rounded-xl bg-pati-accent/15 hover:bg-pati-accent/25 active:scale-95 text-pati-accent-light flex items-center justify-center border border-pati-accent/30 transition shrink-0"
          title="Позвонить"
        >
          <Phone className="w-4 h-4" />
        </button>
      </div>

      {/* Pinned Voice Banner - Exact match to Screenshot 5 */}
      <button
        onClick={() => {
          joinDefaultVoice();
          setActiveTab('voice');
        }}
        className="px-3.5 py-2 bg-pati-accent-panel-end border-b border-pati-accent-panel flex items-center justify-between text-left shrink-0 active:bg-pati-accent-panel transition"
      >
        <div className="flex items-center gap-2 min-w-0 text-pati-accent-text">
          <Radio className="w-3.5 h-3.5 animate-pulse text-pati-accent shrink-0" />
          <span className="text-xs font-semibold truncate">
            Открыть голосовую комнату
          </span>
        </div>
        <ChevronRight className="w-4 h-4 text-pati-accent-muted shrink-0" />
      </button>

      {/* Date Divider */}
      <div className="flex items-center justify-center my-2 shrink-0">
        <span className="text-[11px] font-medium text-pati-text-dim">
          Переписка
        </span>
      </div>

      {/* Chat Messages Stream - Chat Bubbles */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      {activeChannel && <ChatScreenShares channelId={activeChannel.id} />}
      <div ref={chatScroll.ref} onScroll={chatScroll.onScroll} className="flex-1 min-h-0 overflow-y-auto px-3 space-y-3">
        {activeChannel && <LoadOlderMessages channelId={activeChannel.id} />}
        {optimisticMessages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-pati-text-dim">
            <Gamepad2 aria-hidden="true" className="w-12 h-12 text-pati-accent/40 mb-3" />
            <p className="text-sm text-pati-text-muted max-w-xs">
              Напишите первое сообщение или скиньте мем.
            </p>
          </div>
        ) : (
          optimisticMessages.map((msg, index) => {
            const isMine = msg.sender_id === user?.id;
            const timeStr = new Date(msg.created_at).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            });

            return (
              <div
                key={msg.id}
                className={`flex flex-col ${isMine ? 'items-end' : 'items-start'}`}
              >
                <div
                  className={`flex gap-2 max-w-[85%] ${
                    isMine ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {/* Avatar for incoming messages */}
                  {!isMine && (
                    <Avatar
                      name={msg.sender?.display_name || 'Пользователь'}
                      url={msg.sender?.avatar_url}
                      size="sm"
                      className="self-end mb-0.5"
                    />
                  )}

                  {/* Message Bubble Container */}
                  <div
                    className={`rounded-2xl px-3.5 py-2.5 text-sm transition shadow-sm ${
                      isMine
                        ? 'bg-pati-accent-panel border border-pati-accent-border text-white rounded-br-sm'
                        : 'bg-pati-surface border border-pati-border text-pati-text-primary rounded-bl-sm'
                    } ${msg.is_pending ? 'opacity-70' : ''}`}
                  >
                    {/* Quoted Reply if present */}
                    {msg.reply_to && (
                      <div className="mb-1.5 pl-2 py-0.5 border-l-2 border-pati-accent bg-black/20 rounded-r-md text-[11px] text-pati-text-secondary">
                        <span className="font-semibold text-pati-accent-text">
                          {msg.reply_to.sender?.display_name || 'Ответ'}:
                        </span>{' '}
                        <span className="truncate">{msg.reply_to.content}</span>
                      </div>
                    )}

                    {/* Content text */}
                    <MessageRetry message={msg} />
                    {msg.is_pending && <span className="text-xs text-pati-accent-text">Отправляется…</span>}
                    {msg.content && (
                      <p className="text-[13.5px] leading-relaxed whitespace-pre-wrap break-words select-text">
                        {msg.content}
                      </p>
                    )}

                    {/* Image / File Attachments */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {msg.attachments.map((att, idx) => {
                          const isImage =
                            att.content_type?.startsWith('image/') ||
                            /\.(png|jpe?g|gif|webp)$/i.test(att.filename);
                          return (
                            <div key={idx} className="rounded-xl overflow-hidden">
                              {isImage ? (
                                <ProtectedImage
                                  src={att.url}
                                  alt={att.filename}
                                  className="max-h-52 w-auto rounded-lg object-contain"
                                  loading="lazy"
                                />
                              ) : (
                                <ProtectedFileLink
                                  href={att.url}
                        filename={att.filename}
                                  
                                  
                                  className="flex items-center gap-2 p-2 rounded-lg bg-black/30 text-xs text-white"
                                >
                                  <FileText className="w-4 h-4 text-pati-accent" />
                                  <span className="truncate max-w-[160px]">{att.filename}</span>
                                </ProtectedFileLink>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Bottom Metadata: Time & Read ticks */}
                    <div
                      className={`flex items-center justify-end gap-1 text-[10px] mt-1 ${
                        isMine ? 'text-pati-accent-text' : 'text-pati-text-dim'
                      }`}
                    >
                      <span>{timeStr}</span>
                      {isMine && !msg.is_pending && !msg.is_failed && <CheckCheck className="w-3.5 h-3.5 text-pati-accent-text" />}
                    </div>
                  </div>
                </div>

                {/* Reaction Chips */}
                {msg.reactions && msg.reactions.length > 0 && (
                  <div
                    className={`flex flex-wrap gap-1 mt-1 ${
                      isMine ? 'justify-end pr-2' : 'justify-start pl-9'
                    }`}
                  >
                    {Array.from(new Set(msg.reactions.map(r => r.emoji))).map(emoji => {
                      const count = msg.reactions.filter(r => r.emoji === emoji).length;
                      return (
                        <button
                          key={emoji}
                          onClick={() => toggleReaction(msg.id, emoji)}
                          className="px-2 py-0.5 rounded-full bg-pati-surface border border-pati-border text-xs text-pati-text-secondary active:scale-95"
                        >
                          <span>{emoji}</span> {count > 1 && <span>{count}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Typing Indicator */}
        {currentTyping && currentTyping.size > 0 && (
          <div className="text-xs text-pati-text-muted italic flex items-center gap-1.5 pl-2 animate-pulse">
            <span className="w-1.5 h-1.5 bg-pati-accent rounded-full animate-bounce" />
            <span>{Array.from(currentTyping).join(', ')} печатает...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>
      </div>

      {/* Reply Banner */}
      {replyingTo && (
        <div className="mx-3 mt-1 px-3 py-1 bg-pati-surface border border-pati-border rounded-xl text-xs flex items-center justify-between text-pati-text-muted">
          <span className="truncate">
            Ответ для {replyingTo.sender?.display_name}: {replyingTo.content}
          </span>
          <button onClick={() => setReplyingTo(null)} className="p-1">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Uploads Preview Bar */}
      {attachedFiles.length > 0 && (
        <div className="mx-3 mt-1 flex flex-wrap gap-1.5 p-2 bg-pati-surface border border-pati-border rounded-xl">
          {attachedFiles.map((att, idx) => (
            <div
              key={idx}
              className="flex items-center gap-1 px-2 py-0.5 bg-pati-surface-elevated rounded-md text-xs text-white"
            >
              <span className="truncate max-w-[120px]">{att.filename}</span>
              <button
                onClick={() => setAttachedFiles(prev => prev.filter((_, i) => i !== idx))}
                className="text-pati-red-light"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Quick Emoji Popover */}
      {showEmojiPicker && (
        <div className="mx-3 mb-2 bg-pati-surface border border-pati-border rounded-2xl p-2.5 shadow-2xl z-20 flex flex-wrap gap-1.5">
          {quickEmojis.map(emoji => (
            <button
              key={emoji}
              onClick={() => {
                setContent(prev => prev + emoji);
                setShowEmojiPicker(false);
              }}
              className="text-lg p-1 hover:bg-pati-surface-hover rounded-lg active:scale-95"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Bottom Input Area - Exact match to Screenshot 5 */}
      <div className="p-3 bg-pati-dark border-t border-pati-border-subtle shrink-0">
        <div className="flex items-center gap-1.5 px-3 py-1.5 bg-pati-surface border border-pati-border rounded-2xl">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            className="hidden"
            multiple
          />

          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isUploading}
            className="p-1 text-pati-text-muted hover:text-white active:scale-95 transition"
            title="Прикрепить файл"
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin text-pati-accent" />
            ) : (
              <Plus className="w-5 h-5" />
            )}
          </button>

          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleTextChange}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            placeholder={
              partnerUser
                ? `Написать ${partnerUser.display_name}`
                : `Написать в ${activeChannel?.name || 'чат'}`
            }
            rows={1}
            className="flex-1 bg-transparent text-white placeholder-pati-text-disabled text-xs focus:outline-none resize-none py-1.5 max-h-24 leading-relaxed"
          />

          <button
            onClick={() => setShowEmojiPicker(!showEmojiPicker)}
            className="p-1 text-pati-text-muted hover:text-white active:scale-95 transition"
            title="Эмодзи"
          >
            <Smile className="w-5 h-5" />
          </button>

          <button
            onClick={handleSend}
            disabled={isSending || (!content.trim() && attachedFiles.length === 0)}
            className="w-8 h-8 rounded-xl bg-pati-accent hover:bg-pati-accent-hover active:scale-95 disabled:opacity-40 disabled:hover:bg-pati-accent text-white flex items-center justify-center transition shadow-md shadow-pati-accent/30 shrink-0"
            title="Отправить"
          >
            <ArrowUp className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[10px] text-pati-text-disabled text-center mt-1.5 truncate">
          {activeChannel?.is_direct
            ? `Личная переписка · только вы и ${chatTitle}`
            : 'Сообщения видны всем участникам сквада'}
        </p>
      </div>
    </div>
  );
};
