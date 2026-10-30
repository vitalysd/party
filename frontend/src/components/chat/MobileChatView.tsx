import { useEffect, useState } from "react";
import { ArrowLeft, Phone, Gamepad2, Check, FileText, X } from "lucide-react";
import { useChatStore } from "../../store/chatStore";
import { useAuthStore } from "../../store/authStore";
import { useVoiceStore } from "../../store/voiceStore";
import { useUIStore } from "../../store/uiStore";
import { useChatScroll } from "./useChatScroll";
import { MessageRetry } from "./MessageRetry";
import { LoadOlderMessages } from "./LoadOlderMessages";
import { ChatInput } from "./ChatInput";
import { ChatScreenShares } from "../voice/ScreenShares";
import { RoomVoicePanel } from "../voice/RoomVoicePanel";
import { Avatar } from "../ui/Avatar";
import { ProtectedImage, ProtectedFileLink } from "../ui/ProtectedMedia";
import { useModalFocus } from "../ui/useModalFocus";
import { Channel } from "../../types";

function RoomSheet({
  channel,
  onClose,
}: {
  channel: Channel;
  onClose: () => void;
}) {
  const ref = useModalFocus();
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-40 bg-black/60 flex items-end"
      onClick={onClose}
    >
      <div
        ref={ref}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={`Разговор в комнате ${channel.name}`}
        onClick={(event) => event.stopPropagation()}
        className="mobile-bottom w-full h-[70dvh] rounded-t-3xl bg-pati-panel px-5 pt-3 flex flex-col"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold truncate">{channel.name}</h2>
          <button
            aria-label="Закрыть участников"
            className="mobile-touch"
            onClick={onClose}
          >
            <X size={22} />
          </button>
        </div>
        <RoomVoicePanel channel={channel} />
      </div>
    </div>
  );
}

export function MobileChatView({ onBack }: { onBack: () => void }) {
  const {
    channels,
    users,
    activeChannelId,
    messages,
    typingUsers,
    ensureMessages,
    toggleReaction,
    setReplyingTo,
  } = useChatStore();
  const user = useAuthStore((state) => state.user);
  const [roomOpen, setRoomOpen] = useState(false);
  const activeChannel = channels.find(
    (channel) => channel.id === activeChannelId,
  );
  const channelMessages = activeChannel ? messages[activeChannel.id] || [] : [];
  const member = activeChannel?.is_direct
    ? activeChannel.members.find((item) => item.user_id !== user?.id)
    : undefined;
  const partnerUser = member
    ? (users.find((item) => item.id === member.user_id) ?? member.user)
    : undefined;
  const chatTitle = partnerUser?.display_name || activeChannel?.name || "Чат";
  const chatSubtitle = activeChannel?.is_direct
    ? partnerUser?.status === "online"
      ? "в сети"
      : "не в сети"
    : `Участников: ${activeChannel?.members.length || 0}`;
  const currentTyping = activeChannel ? typingUsers[activeChannel.id] : null;
  const chatScroll = useChatScroll(
    activeChannel?.id,
    channelMessages.at(-1)?.id,
  );
  useEffect(() => {
    if (activeChannelId) void ensureMessages(activeChannelId);
  }, [activeChannelId, ensureMessages]);
  if (!activeChannel)
    return (
      <div className="mobile-shell p-4">
        <button onClick={onBack} className="mobile-touch">
          <ArrowLeft />
        </button>
        <p>Эта переписка больше недоступна.</p>
      </div>
    );
  return (
    <div className="mobile-shell flex flex-col h-full bg-pati-dark text-pati-text-primary overflow-hidden">
      <div
        inert={roomOpen}
        className="flex flex-1 min-h-0 flex-col overflow-hidden"
      >
        <header className="shrink-0 min-h-16 px-2 flex items-center gap-2 border-b border-pati-border-subtle bg-pati-panel">
          <button
            onClick={onBack}
            aria-label="Назад к чатам"
            className="mobile-touch text-pati-accent-text"
          >
            <ArrowLeft size={24} />
          </button>
          <Avatar name={chatTitle} url={partnerUser?.avatar_url} size="sm" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold">{chatTitle}</h2>
            <p className="truncate text-xs text-pati-text-muted mt-0.5">
              {chatSubtitle}
            </p>
          </div>
          <button
            aria-label={
              activeChannel.is_direct
                ? "Позвонить"
                : "Участники голосового разговора"
            }
            className="mobile-touch text-pati-accent-text"
            onClick={() => {
              if (activeChannel.is_direct) {
                void useVoiceStore.getState().startCall(activeChannel.id);
                useUIStore.getState().setActiveTab("voice");
              } else setRoomOpen(true);
            }}
          >
            <Phone size={22} />
          </button>
        </header>
        {/* Chat Messages Stream - Chat Bubbles */}
        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {activeChannel && <ChatScreenShares channelId={activeChannel.id} />}
          <div
            ref={chatScroll.ref}
            onScroll={chatScroll.onScroll}
            className="flex-1 min-h-0 overflow-y-auto px-3 space-y-2 py-3"
          >
            {activeChannel && (
              <LoadOlderMessages channelId={activeChannel.id} />
            )}
            {channelMessages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-pati-text-dim">
                <Gamepad2
                  aria-hidden="true"
                  className="w-12 h-12 text-pati-accent/40 mb-3"
                />
                <p className="text-sm text-pati-text-muted max-w-xs">
                  Напишите первое сообщение или скиньте мем.
                </p>
              </div>
            ) : (
              channelMessages.map((msg, index) => {
                const isMine = msg.sender_id === user?.id;
                const timeStr = new Date(msg.created_at).toLocaleTimeString(
                  [],
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                );

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}
                  >
                    {(index === 0 ||
                      new Date(
                        channelMessages[index - 1].created_at,
                      ).toDateString() !==
                        new Date(msg.created_at).toDateString()) && (
                      <time className="self-center text-[11px] bg-pati-panel rounded-full px-3 py-1 my-3 text-pati-text-muted">
                        {new Date(msg.created_at).toLocaleDateString("ru", {
                          day: "numeric",
                          month: "long",
                        })}
                      </time>
                    )}
                    <div
                      className={`flex gap-2 max-w-[88%] min-w-0 ${
                        isMine ? "justify-end" : "justify-start"
                      }`}
                    >
                      {/* Avatar for incoming messages */}
                      {!isMine && !activeChannel?.is_direct && (
                        <Avatar
                          name={msg.sender?.display_name || "Пользователь"}
                          url={msg.sender?.avatar_url}
                          size="sm"
                          className="self-end mb-0.5"
                        />
                      )}

                      {/* Message Bubble Container */}
                      <div
                        className={`min-w-0 rounded-2xl px-3 py-2 text-sm transition shadow-sm ${
                          isMine
                            ? "bg-pati-accent-panel border border-pati-accent-border text-white rounded-br-sm"
                            : "bg-pati-surface border border-pati-border text-pati-text-primary rounded-bl-sm"
                        } ${msg.is_pending ? "opacity-70" : ""}`}
                      >
                        {!isMine && !activeChannel?.is_direct && (
                          <p className="text-xs font-semibold text-pati-accent-text mb-1">
                            {msg.sender?.display_name || "Участник"}
                          </p>
                        )}
                        {/* Quoted Reply if present */}
                        {msg.reply_to && (
                          <div className="mb-1.5 pl-2 py-0.5 border-l-2 border-pati-accent bg-black/20 rounded-r-md text-[11px] text-pati-text-secondary">
                            <span className="font-semibold text-pati-accent-text">
                              {msg.reply_to.sender?.display_name || "Ответ"}:
                            </span>{" "}
                            <span className="truncate">
                              {msg.reply_to.content}
                            </span>
                          </div>
                        )}

                        {/* Content text */}
                        <MessageRetry message={msg} />
                        {msg.is_pending && (
                          <span className="text-xs text-pati-accent-text">
                            Отправляется…
                          </span>
                        )}
                        {msg.content && (
                          <p className="text-[15px] leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] select-text">
                            {msg.content}
                          </p>
                        )}

                        {/* Image / File Attachments */}
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="mt-2 space-y-1.5">
                            {msg.attachments.map((att, idx) => {
                              const isImage =
                                att.content_type?.startsWith("image/") ||
                                /\.(png|jpe?g|gif|webp)$/i.test(att.filename);
                              return (
                                <div
                                  key={idx}
                                  className="rounded-xl overflow-hidden"
                                >
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
                                      <span className="truncate max-w-[160px]">
                                        {att.filename}
                                      </span>
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
                            isMine
                              ? "text-pati-accent-text"
                              : "text-pati-text-dim"
                          }`}
                        >
                          <span>{timeStr}</span>
                          {isMine && !msg.is_pending && !msg.is_failed && (
                            <Check
                              aria-label="Отправлено"
                              className="w-3.5 h-3.5 text-pati-accent-text"
                            />
                          )}
                        </div>
                      </div>
                    </div>

                    {!msg.is_pending && !msg.is_failed && (
                      <button
                        aria-label="Ответить на сообщение"
                        onClick={() => setReplyingTo(msg)}
                        className="min-h-8 px-2 text-xs text-pati-text-muted"
                      >
                        Ответить
                      </button>
                    )}
                    {/* Reaction Chips */}
                    {msg.reactions && msg.reactions.length > 0 && (
                      <div
                        className={`flex flex-wrap gap-1 mt-1 ${
                          isMine ? "justify-end pr-2" : "justify-start pl-9"
                        }`}
                      >
                        {Array.from(
                          new Set(msg.reactions.map((r) => r.emoji)),
                        ).map((emoji) => {
                          const count = msg.reactions.filter(
                            (r) => r.emoji === emoji,
                          ).length;
                          return (
                            <button
                              key={emoji}
                              onClick={() => toggleReaction(msg.id, emoji)}
                              className="px-2 py-0.5 rounded-full bg-pati-surface border border-pati-border text-xs text-pati-text-secondary active:scale-95"
                            >
                              <span>{emoji}</span>{" "}
                              {count > 1 && <span>{count}</span>}
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
                <span>{Array.from(currentTyping).join(", ")} печатает...</span>
              </div>
            )}
          </div>
        </div>

        <ChatInput
          key={activeChannel.id}
          channelId={activeChannel.id}
          mobile
          placeholder={
            activeChannel.is_direct
              ? `Написать ${chatTitle}`
              : `Написать в ${chatTitle}`
          }
        />
      </div>
      {roomOpen && (
        <RoomSheet channel={activeChannel} onClose={() => setRoomOpen(false)} />
      )}
    </div>
  );
}
