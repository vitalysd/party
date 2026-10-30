import { useEffect, useRef, useState } from "react";
import {
  MessageSquare,
  Users,
  Headphones,
  Search,
  SquarePen,
  UserPlus,
  ArrowLeft,
} from "lucide-react";
import { useUIStore } from "../../store/uiStore";
import { useChatStore } from "../../store/chatStore";
import { useVoiceStore } from "../../store/voiceStore";
import { useAuthStore } from "../../store/authStore";
import { Avatar } from "../ui/Avatar";
import { RoomIcon } from "../ui/RoomIcon";
import { MobileChatView } from "../chat/MobileChatView";
import { VoiceRoomView } from "../voice/VoiceRoomView";
import { RoomVoicePanel } from "../voice/RoomVoicePanel";
import { copyInvite } from "../../utils/invite";
import { conversationRows, conversationTime } from "../../utils/conversations";

export function MobileLayout() {
  const { activeTab, setActiveTab, setSettingsOpen } = useUIStore();
  const { channels, users, messages, setActiveChannel, openDM } =
    useChatStore();
  const user = useAuthStore((state) => state.user);
  const connected = useVoiceStore(
    (state) => state.isConnected || state.isConnecting || !!state.call,
  );
  const roomName = useVoiceStore((state) => state.currentRoomName);
  const [chatId, setChatId] = useState<string | null>(null);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [opening, setOpening] = useState(false);
  const navigation = useRef(0);
  useEffect(() => {
    const viewport = window.visualViewport;
    const resize = () => {
      if (!viewport || viewport.scale !== 1) return;
      document.documentElement.style.setProperty(
        "--mobile-height",
        `${viewport.height}px`,
      );
    };
    resize();
    viewport?.addEventListener("resize", resize);
    return () => {
      viewport?.removeEventListener("resize", resize);
      document.documentElement.style.removeProperty("--mobile-height");
    };
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 3000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(
    () => () => {
      navigation.current++;
    },
    [],
  );
  const rows = conversationRows(channels, users, messages, user?.id);
  const query = search.trim().toLocaleLowerCase();
  const filtered = rows.filter(
    (row) =>
      row.title.toLocaleLowerCase().includes(query) &&
      (filter !== "unread" || row.unread > 0) &&
      (filter !== "rooms" || !row.channel.is_direct),
  );
  const friends = users.filter(
    (friend) =>
      friend.id !== user?.id &&
      friend.display_name.toLocaleLowerCase().includes(query),
  );
  const rooms = channels.filter((channel) => !channel.is_direct);
  const voiceChannel = rooms.find((channel) => channel.id === voiceId);
  function switchTab(tab: "chats" | "friends" | "voice") {
    navigation.current++;
    setOpening(false);
    setChatId(null);
    setSearch("");
    setVoiceId(null);
    setActiveTab(tab);
    useChatStore.setState({
      activeChannelId: null,
      replyingTo: null,
      isLoadingMessages: false,
    });
  }
  function openChat(id: string) {
    navigation.current++;
    setActiveChannel(id);
    setChatId(id);
    setActiveTab("chats");
  }
  async function openFriend(id: string) {
    const request = ++navigation.current;
    setOpening(true);
    const channelId = await openDM(id, false);
    if (request !== navigation.current) return;
    setOpening(false);
    if (channelId) openChat(channelId);
    else setNotice("Не удалось открыть чат. Попробуйте ещё раз.");
  }
  if (chatId && activeTab === "chats")
    return (
      <MobileChatView
        key={chatId}
        onBack={() => {
          navigation.current++;
          setChatId(null);
          useChatStore.setState({
            activeChannelId: null,
            replyingTo: null,
            isLoadingMessages: false,
          });
        }}
      />
    );
  return (
    <div className="mobile-shell flex h-full flex-col bg-pati-dark text-pati-text-primary">
      <header className="shrink-0 px-4 pt-3 pb-2 bg-pati-panel">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h1 className="text-2xl font-bold tracking-tight">
            {activeTab === "chats"
              ? "Чаты"
              : activeTab === "friends"
                ? "Контакты"
                : "Разговоры"}
          </h1>
          <div className="flex items-center gap-1">
            <button
              className="mobile-touch text-pati-accent-text"
              aria-label={
                activeTab === "friends" ? "Пригласить друга" : "Новое сообщение"
              }
              onClick={() => {
                if (activeTab !== "friends") switchTab("friends");
                else
                  void copyInvite()
                    .then(() => setNotice("Код приглашения скопирован"))
                    .catch(() => setNotice("Не удалось создать приглашение"));
              }}
            >
              {activeTab === "friends" ? (
                <UserPlus size={22} />
              ) : (
                <SquarePen size={22} />
              )}
            </button>
            <button
              className="mobile-touch"
              aria-label="Настройки профиля"
              onClick={() => setSettingsOpen(true)}
            >
              <Avatar
                name={user?.display_name || "Вы"}
                url={user?.avatar_url}
                size="sm"
              />
            </button>
          </div>
        </div>
        {activeTab !== "voice" && (
          <label className="flex items-center gap-2 rounded-xl bg-pati-surface px-3 h-11 mb-2 text-pati-text-muted">
            <Search size={19} aria-hidden="true" />
            <input
              type="search"
              aria-label="Поиск"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={
                activeTab === "friends" ? "Поиск контактов" : "Поиск переписок"
              }
              className="min-w-0 flex-1 bg-transparent text-base text-pati-text-primary outline-none placeholder:text-pati-text-muted"
            />
          </label>
        )}
        {activeTab === "chats" && (
          <div className="flex gap-2 py-1" aria-label="Фильтр переписок">
            {[
              ["all", "Все"],
              ["unread", "Непрочитанные"],
              ["rooms", "Комнаты"],
            ].map(([value, label]) => (
              <button
                key={value}
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
                className={`min-h-11 px-3 rounded-full text-sm font-medium ${filter === value ? "bg-pati-accent/20 text-pati-accent-text" : "text-pati-text-muted"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </header>
      {notice && (
        <p
          role="status"
          className="shrink-0 px-4 py-2 bg-pati-surface text-sm text-pati-accent-text"
        >
          {notice}
        </p>
      )}
      <main className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {activeTab === "chats" && (
          <>
            {connected && (
              <button
                onClick={() => switchTab("voice")}
                className="w-full flex items-center gap-3 px-5 py-3 bg-pati-green/10 text-pati-green-text text-sm"
              >
                <Headphones size={18} />
                <span className="truncate">
                  Вернуться к разговору{roomName ? ` · ${roomName}` : ""}
                </span>
              </button>
            )}
            {filtered.map(
              ({ channel, partner, title, preview, timestamp, unread }) => (
                <button
                  key={channel.id}
                  onClick={() => openChat(channel.id)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-pati-surface-hover"
                >
                  {channel.is_direct ? (
                    <Avatar name={title} url={partner?.avatar_url} size="lg" />
                  ) : (
                    <span className="w-12 h-12 rounded-full shrink-0 flex items-center justify-center bg-pati-accent/15 text-pati-accent-text">
                      <RoomIcon icon={channel.icon} className="w-6 h-6" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1 border-b border-pati-border-subtle pb-3 -mb-3">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-base font-semibold">
                        {title}
                      </span>
                      <time className="shrink-0 text-[11px] text-pati-text-muted">
                        {conversationTime(timestamp)}
                      </time>
                    </span>
                    <span className="mt-1 flex items-center justify-between gap-3">
                      <span className="truncate text-sm text-pati-text-muted">
                        {preview}
                      </span>
                      {unread > 0 && (
                        <span
                          aria-label={`${unread} непрочитанных`}
                          className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-pati-accent text-white text-xs text-center leading-5"
                        >
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              ),
            )}
            {!filtered.length && (
              <div className="px-8 py-16 text-center text-pati-text-muted">
                <MessageSquare
                  className="mx-auto mb-4 text-pati-accent"
                  size={36}
                />
                <p>
                  {query
                    ? "Переписки не найдены"
                    : filter === "unread"
                      ? "Всё прочитано"
                      : "Здесь появятся ваши переписки"}
                </p>
                <button
                  onClick={() => switchTab("friends")}
                  className="mt-4 min-h-11 text-pati-accent-text"
                >
                  Написать другу
                </button>
              </div>
            )}
          </>
        )}
        {activeTab === "friends" && (
          <>
            {opening && (
              <p
                role="status"
                className="px-4 py-2 text-sm text-pati-text-muted"
              >
                Открываем чат…
              </p>
            )}
            {friends.map((friend) => (
              <button
                key={friend.id}
                disabled={opening}
                onClick={() => void openFriend(friend.id)}
                className="w-full flex gap-3 items-center px-4 py-3 text-left active:bg-pati-surface-hover disabled:opacity-60"
              >
                <Avatar
                  name={friend.display_name}
                  url={friend.avatar_url}
                  size="lg"
                  status={friend.status}
                />
                <span className="min-w-0">
                  <span className="block truncate font-semibold">
                    {friend.display_name}
                  </span>
                  <span className="block truncate text-sm text-pati-text-muted mt-1">
                    {friend.custom_activity ||
                      (friend.status === "online" ? "В сети" : "Не в сети")}
                  </span>
                </span>
              </button>
            ))}
            {!friends.length && (
              <p className="p-8 text-center text-pati-text-muted">
                {query
                  ? "Никого не найдено"
                  : "Пригласите друга по кнопке сверху"}
              </p>
            )}
          </>
        )}
        {activeTab === "voice" &&
          (connected ? (
            <VoiceRoomView />
          ) : voiceChannel ? (
            <div className="h-full flex flex-col p-4">
              <button
                onClick={() => setVoiceId(null)}
                className="flex items-center gap-2 min-h-11 text-pati-text-muted"
              >
                <ArrowLeft size={20} />
                Все комнаты
              </button>
              <RoomVoicePanel channel={voiceChannel} />
            </div>
          ) : (
            <div className="p-4">
              <p className="text-sm text-pati-text-muted mb-4">
                Выберите комнату, чтобы посмотреть участников и присоединиться.
              </p>
              {rooms.map((room) => (
                <button
                  key={room.id}
                  onClick={() => setVoiceId(room.id)}
                  className="w-full flex gap-3 items-center text-left py-4 border-b border-pati-border-subtle"
                >
                  <span className="mobile-touch rounded-full bg-pati-accent/15 text-pati-accent-text">
                    <RoomIcon icon={room.icon} className="w-5 h-5" />
                  </span>
                  <span className="truncate font-medium">{room.name}</span>
                </button>
              ))}
              {!rooms.length && (
                <p className="text-pati-text-muted">Пока нет комнат</p>
              )}
            </div>
          ))}
      </main>
      <nav
        aria-label="Основная навигация"
        className="mobile-bottom shrink-0 flex border-t border-pati-border-subtle bg-pati-panel"
      >
        {(
          [
            { id: "chats", label: "Чаты", Icon: MessageSquare },
            { id: "friends", label: "Контакты", Icon: Users },
            { id: "voice", label: "Разговоры", Icon: Headphones },
          ] as const
        ).map(({ id, label, Icon }) => (
          <button
            key={id}
            aria-current={activeTab === id ? "page" : undefined}
            onClick={() => switchTab(id)}
            className={`flex-1 min-h-16 flex flex-col items-center justify-center gap-1 text-[11px] font-medium ${activeTab === id ? "text-pati-accent-text" : "text-pati-text-muted"}`}
          >
            <Icon size={23} />
            <span>{label}</span>
          </button>
        ))}
      </nav>
    </div>
  );
}
