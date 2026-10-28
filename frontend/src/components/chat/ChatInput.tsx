import React, { useState, useRef, useEffect } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useChatStore } from '../../store/chatStore';
import { Attachment } from '../../types';
import { Plus, Smile, ArrowUp, X, Loader2 } from 'lucide-react';

interface ChatInputProps {
  channelId: string;
  placeholder?: string;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  channelId,
  placeholder = 'Написать сообщение...',
}) => {
  const [content, setContent] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachedFiles, setAttachedFiles] = useState<Attachment[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { sendMessage, replyingTo, setReplyingTo, sendTyping, uploadFile, uploadError } = useChatStore(useShallow(state => ({
    sendMessage: state.sendMessage, replyingTo: state.replyingTo,
    setReplyingTo: state.setReplyingTo, sendTyping: state.sendTyping,
    uploadFile: state.uploadFile, uploadError: state.uploadError,
  })));

  useEffect(() => () => {
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    sendTyping(channelId, false);
  }, [channelId, sendTyping]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      if (!isSending) {
        handleSend();
      }
    }
  };

  const handleSend = async () => {
    if (isSending || isUploading) return;
    const trimmed = content.trim();
    if (!trimmed && attachedFiles.length === 0) return;

    setIsSending(true);
    const filesToSend = [...attachedFiles];
    const textToSend = trimmed;

    // Reset input state immediately
    setContent('');
    setAttachedFiles([]);
    setShowEmojiPicker(false);

    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }

    // Stop typing indicator
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    sendTyping(channelId, false);

    try {
      await sendMessage(channelId, textToSend, filesToSend);
    } finally {
      setIsSending(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);

    // Auto resize height
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(
        textareaRef.current.scrollHeight,
        140
      )}px`;
    }

    // Broadcast typing indicator
    sendTyping(channelId, true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(channelId, false);
    }, 2000);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const attachment = await uploadFile(file, { channelId });
      if (attachment) {
        setAttachedFiles(prev => [...prev, attachment]);
      }
    }
    setIsUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const quickEmojis = ['😀', '😂', '🔥', '❤️', '👍', '🎉', '🎮', '✌️', '😎', '👀', '💯'];

  return (
    <div className="relative px-4 pb-4 pt-1 bg-pati-dark">
      {/* Reply Bar if active */}
      {replyingTo && (
        <div className="flex items-center justify-between px-3.5 py-1.5 mb-2 bg-pati-surface border border-pati-border rounded-xl text-xs text-pati-text-muted">
          <div className="flex items-center gap-2 truncate">
            <span className="text-pati-accent font-semibold">
              Ответ для {replyingTo.sender?.display_name || 'Пользователь'}:
            </span>
            <span className="truncate text-pati-text-muted">{replyingTo.content}</span>
          </div>
          <button
            aria-label="Отменить ответ"
            onClick={() => setReplyingTo(null)}
            className="p-1 text-pati-text-muted hover:text-white rounded-full hover:bg-pati-surface-hover transition"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {uploadError && <p role="alert" className="mb-2 px-2 text-xs text-pati-red-text">{uploadError}</p>}
      {/* Uploaded Attachments Preview Bar */}
      {attachedFiles.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 p-2 bg-pati-surface border border-pati-border rounded-xl">
          {attachedFiles.map((att, idx) => (
            <div
              key={idx}
              className="flex items-center gap-1.5 px-2.5 py-1 bg-pati-surface-elevated rounded-lg text-xs text-white"
            >
              <span className="truncate max-w-[120px]">{att.filename}</span>
              <button
                aria-label={`Удалить вложение ${att.filename}`}
                onClick={() =>
                  setAttachedFiles(prev => prev.filter((_, i) => i !== idx))
                }
                className="text-pati-text-muted hover:text-pati-red-light"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Quick Emoji Popover */}
      {showEmojiPicker && (
        <div className="absolute bottom-16 right-14 bg-pati-surface border border-pati-border rounded-2xl p-3 shadow-2xl z-20 flex flex-wrap gap-1.5 max-w-xs animate-in fade-in zoom-in-95 duration-150">
          {quickEmojis.map(emoji => (
            <button
              key={emoji}
              onClick={() => {
                setContent(prev => prev + emoji);
                setShowEmojiPicker(false);
              }}
              className="text-xl p-1.5 hover:bg-pati-surface-hover rounded-lg transition active:scale-95"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}

      {/* Input Field Container */}
      <div className="flex items-end gap-2 bg-pati-surface border border-pati-border focus-within:border-pati-accent rounded-2xl px-3 py-2 transition shadow-inner">
        {/* Hidden File Input */}
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileSelect}
          className="hidden"
          multiple
        />

        {/* Attachment Button */}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isUploading}
          className="p-1.5 text-pati-text-muted hover:text-white hover:bg-pati-surface-elevated rounded-xl transition shrink-0"
          title="Прикрепить файл или фото"
        >
          {isUploading ? (
            <Loader2 className="w-5 h-5 text-pati-accent animate-spin" />
          ) : (
            <Plus className="w-5 h-5" />
          )}
        </button>

        {/* Text Area */}
        <textarea
          aria-label={placeholder}
          ref={textareaRef}
          value={content}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={1}
          className="flex-1 bg-transparent border-0 text-sm text-white placeholder-pati-text-dim focus:outline-none resize-none max-h-36 py-1 leading-relaxed"
        />

        {/* Emoji Button */}
        <button
          type="button"
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          className={`p-1.5 rounded-xl transition shrink-0 ${
            showEmojiPicker
              ? 'text-pati-accent bg-pati-surface-elevated'
              : 'text-pati-text-muted hover:text-white hover:bg-pati-surface-elevated'
          }`}
          title="Смайлики"
        >
          <Smile className="w-5 h-5" />
        </button>

        {/* Send Button (Purple Round Circle) */}
        <button
          type="button"
          onClick={handleSend}
          disabled={isSending || isUploading || (!content.trim() && attachedFiles.length === 0)}
          className="w-8 h-8 rounded-xl bg-pati-accent hover:bg-pati-accent-hover active:scale-95 text-white flex items-center justify-center transition disabled:opacity-40 disabled:pointer-events-none shrink-0 shadow-md shadow-pati-accent/20"
          title="Отправить (Enter)"
        >
          <ArrowUp className="w-4 h-4 stroke-[2.5]" />
        </button>
      </div>

      <div className="text-[10px] text-pati-text-disabled mt-1.5 px-2">
        Enter — отправить · Shift + Enter — новая строка
      </div>
    </div>
  );
};
