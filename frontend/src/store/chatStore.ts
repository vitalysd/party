import { create } from 'zustand';
import { mergeMessages, newRequestId } from '../utils/messages';
import { Channel, Message, User, Attachment } from '../types';
import { API_BASE_URL, WS_BASE_URL } from '../utils/config';
import { useAuthStore } from './authStore';
import { restoreOutbox, saveOutbox, clearOutbox } from '../utils/outbox';
import { receiveCallSignal, reconnectVoiceSignals } from '../utils/voiceSignals';

interface ChatState {
  channels: Channel[];
  users: User[];
  unreadCounts: Record<string, number>;
  uploadError: string | null;
  activeChannelId: string | null;
  messages: Record<string, Message[]>; // channelId -> Message[]
  typingUsers: Record<string, Set<string>>; // channelId -> Set of user display names
  replyingTo: Message | null;
  socket: WebSocket | null;
  isLoadingMessages: boolean;
  hasMoreMessages: Record<string, boolean>;
  loadingOlder: Record<string, boolean>;
  historyErrors: Record<string, string | null>;

  // Actions
  openDM: (targetUserId: string, activate?: boolean) => Promise<string | null>;
  loadChannels: () => Promise<void>;
  loadUsers: () => Promise<void>;
  setActiveChannel: (channelId: string) => void;
  loadMessages: (channelId: string) => Promise<void>;
  ensureMessages: (channelId: string) => Promise<void>;
  loadOlderMessages: (channelId: string) => Promise<void>;
  retryMessage: (channelId: string, messageId: string) => Promise<void>;
  sendMessage: (channelId: string, content: string, attachments?: Attachment[]) => Promise<void>;
  toggleReaction: (messageId: string, emoji: string) => Promise<void>;
  setReplyingTo: (message: Message | null) => void;
  sendTyping: (channelId: string, isTyping: boolean) => void;
  uploadFile: (file: File, options?: { channelId?: string; purpose?: 'attachment' | 'avatar' }) => Promise<Attachment | null>;
  initWebSocket: () => void;
  disconnectWebSocket: () => void;
}

let wsReconnectTimeout: ReturnType<typeof setTimeout> | null = null;
const historyRequests = new Map<string, symbol>();
const historyLoadedAt = new Map<string, number>();
const historyInFlight = new Map<string, Promise<void>>();

export const useChatStore = create<ChatState>((set, get) => ({
  channels: [],
  users: [],
  unreadCounts: {},
  uploadError: null,
  activeChannelId: null,
  messages: restoreOutbox(useAuthStore.getState().user?.id),
  typingUsers: {},
  replyingTo: null,
  socket: null,
  isLoadingMessages: false,
  hasMoreMessages: {}, loadingOlder: {}, historyErrors: {},

  loadChannels: async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/channels`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const channels = await res.json();
        if (useAuthStore.getState().token !== token) return;
        set({ channels });
        const activeId = get().activeChannelId;
        if (activeId && !channels.some((c: Channel) => c.id === activeId)) {
          const messages = { ...get().messages };
          delete messages[activeId];
          historyRequests.delete(activeId);
          historyLoadedAt.delete(activeId);
          historyInFlight.delete(activeId);
          set({ messages, replyingTo: null });
        }
        if (!activeId || !channels.some((c: Channel) => c.id === activeId)) {
          if (channels.length) get().setActiveChannel(channels[0].id);
          else set({ activeChannelId: null, isLoadingMessages: false });
        }
      }
    } catch (err) {
      console.error('Failed to load channels', err);
    }
  },

  loadUsers: async () => {
    const token = useAuthStore.getState().token;
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const users = await res.json();
        if (useAuthStore.getState().token !== token) return;
        set({ users });
      }
    } catch (err) {
      console.error('Failed to load users', err);
    }
  },

  setActiveChannel: (channelId: string) => {
    set({ isLoadingMessages: historyInFlight.has(channelId) });
    const socket = get().socket;

    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'SUBSCRIBE_CHANNEL',
        data: { channel_id: channelId },
      }));
    }

    set(state => ({ activeChannelId: channelId, replyingTo: null, unreadCounts: { ...state.unreadCounts, [channelId]: 0 }, channels: state.channels.map(channel => channel.id === channelId ? { ...channel, unread_count: 0 } : channel) }));
    void get().ensureMessages(channelId);
  },

  ensureMessages: async (channelId: string) => {
    const pending = historyInFlight.get(channelId);
    if (pending) return pending;
    if (Date.now() - (historyLoadedAt.get(channelId) ?? 0) < 60000) return;
    const request = get().loadMessages(channelId);
    historyInFlight.set(channelId, request);
    try { await request; }
    finally { if (historyInFlight.get(channelId) === request) historyInFlight.delete(channelId); }
  },

  loadMessages: async (channelId: string) => {
    const token = useAuthStore.getState().token;
    if (!token) return;

    const initialMessages = new Set(get().messages[channelId] || []);
    const request = Symbol(channelId);
    historyRequests.set(channelId, request);
    set(state => ({
      loadingOlder: { ...state.loadingOlder, [channelId]: false },
      historyErrors: { ...state.historyErrors, [channelId]: null },
    }));
    set({ isLoadingMessages: true });
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/channels/${channelId}/messages?limit=50`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Не удалось загрузить историю');
      if (res.ok) {
        const list: Message[] = await res.json();
        if (useAuthStore.getState().token !== token) return;
        if (historyRequests.get(channelId) !== request) return;
        historyLoadedAt.set(channelId, Date.now());
        set(state => ({
          hasMoreMessages: { ...state.hasMoreMessages, [channelId]: state.hasMoreMessages[channelId] ?? list.length === 50 },
          messages: {
            ...state.messages,
            [channelId]: mergeMessages(list, (state.messages[channelId] || [])
              .filter(message => message.is_pending || message.is_failed || !initialMessages.has(message)
                || (list.length === 50 && message.created_at < list[0].created_at))),
          },
        }));
      }
    } catch (err) {
      console.error('Failed to load messages', err);
      if (useAuthStore.getState().token === token && historyRequests.get(channelId) === request) {
        set(state => ({ historyErrors: { ...state.historyErrors, [channelId]: 'Не удалось загрузить историю' } }));
      }
    } finally {
      if (useAuthStore.getState().token === token && get().activeChannelId === channelId
          && historyRequests.get(channelId) === request) {
        set({ isLoadingMessages: false });
      }
    }
  },

  loadOlderMessages: async (channelId: string) => {
    const token = useAuthStore.getState().token;
    const state = get();
    if (!token || state.loadingOlder[channelId] || !state.hasMoreMessages[channelId]
        || (state.activeChannelId === channelId && state.isLoadingMessages)) return;
    const oldest = (state.messages[channelId] || []).find(m => !m.is_pending && !m.is_failed);
    if (!oldest) return;
    const generation = historyRequests.get(channelId);
    set(state => ({ loadingOlder: { ...state.loadingOlder, [channelId]: true },
      historyErrors: { ...state.historyErrors, [channelId]: null } }));
    try {
      const query = new URLSearchParams({ limit: '50', before_id: oldest.id });
      const response = await fetch(`${API_BASE_URL}/api/v1/channels/${channelId}/messages?${query}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Не удалось загрузить историю');
      const list: Message[] = await response.json();
      if (useAuthStore.getState().token !== token || historyRequests.get(channelId) !== generation) return;
      set(state => ({
        messages: { ...state.messages, [channelId]: mergeMessages(list, state.messages[channelId] || []) },
        hasMoreMessages: { ...state.hasMoreMessages, [channelId]: list.length === 50 },
      }));
    } catch {
      if (useAuthStore.getState().token === token && historyRequests.get(channelId) === generation) {
        set(state => ({ historyErrors: { ...state.historyErrors, [channelId]: 'Не удалось загрузить историю' } }));
      }
    } finally {
      if (useAuthStore.getState().token === token && historyRequests.get(channelId) === generation) {
        set(state => ({ loadingOlder: { ...state.loadingOlder, [channelId]: false } }));
      }
    }
  },

  retryMessage: async (channelId: string, messageId: string) => {
    const message = get().messages[channelId]?.find(m => m.id === messageId);
    if (!message?.is_failed || message.is_pending || !message.client_request_id
        || message.sender_id !== useAuthStore.getState().user?.id) return;
    set(state => ({ messages: { ...state.messages, [channelId]: state.messages[channelId].map(m =>
      m.id === messageId ? { ...m, is_pending: true, is_failed: false } : m) } }));
    await deliverMessage(message);
  },

  sendMessage: async (channelId: string, content: string, attachments?: Attachment[]) => {
    const { token, user } = useAuthStore.getState();
    const replyingTo = get().replyingTo?.channel_id === channelId ? get().replyingTo : null;
    if (!token || !user) return;

    const requestId = newRequestId();
    const tempId = `temp-${requestId}`;
    const optimisticMessage: Message = {
      id: tempId,
      client_request_id: requestId,
      channel_id: channelId,
      sender_id: user.id,
      content,
      reply_to_id: replyingTo?.id || null,
      reply_to: replyingTo
        ? {
            id: replyingTo.id,
            sender_id: replyingTo.sender_id,
            content: replyingTo.content,
            sender: replyingTo.sender,
          }
        : null,
      attachments: attachments || [],
      created_at: new Date().toISOString(),
      sender: user,
      reactions: [],
      is_pending: true,
    };

    // Optimistically insert message into UI immediately
    set(state => ({
      replyingTo: null,
      messages: {
        ...state.messages,
        [channelId]: [...(state.messages[channelId] || []), optimisticMessage],
      },
    }));

    await deliverMessage(optimisticMessage);
  },

  toggleReaction: async (messageId: string, emoji: string) => {
    const token = useAuthStore.getState().token;
    if (!token) return;

    try {
      await fetch(`${API_BASE_URL}/api/v1/messages/${messageId}/reactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ emoji }),
      });
    } catch (err) {
      console.error('Failed to toggle reaction', err);
    }
  },

  setReplyingTo: (message: Message | null) => {
    set({ replyingTo: message });
  },

  sendTyping: (channelId: string, isTyping: boolean) => {
    const socket = get().socket;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({
        type: 'TYPING',
        data: { channel_id: channelId, is_typing: isTyping },
      }));
    }
  },

  openDM: async (targetUserId: string, activate = true) => {
    const token = useAuthStore.getState().token;
    if (!token) return null;

    const cached = get().channels.find(channel => channel.is_direct && channel.members.length === 2
      && channel.members.some(member => member.user_id === targetUserId)
      && channel.members.some(member => member.user_id === useAuthStore.getState().user?.id));
    if (cached) {
      if (activate) get().setActiveChannel(cached.id);
      return cached.id;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/channels/dm/${targetUserId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const dmChannel: Channel = await res.json();
        if (useAuthStore.getState().token !== token) return null;
        set(state => {
          const exists = state.channels.some(c => c.id === dmChannel.id);
          return {
            channels: exists ? state.channels : [...state.channels, dmChannel],
          };
        });
        if (activate) get().setActiveChannel(dmChannel.id);
        return dmChannel.id;
      }
    } catch (err) {
      console.error('Failed to open DM channel', err);
    }
    return null;
  },

  uploadFile: async (file: File, options?: { channelId?: string; purpose?: 'attachment' | 'avatar' }): Promise<Attachment | null> => {
    const token = useAuthStore.getState().token;
    if (!token) return null;

    set({ uploadError: null });
    try {
      // Direct multipart upload to FastAPI S3 bridge
      const formData = new FormData();
      formData.append('file', file);
      formData.append('purpose', options?.purpose || 'attachment');
      const channelId = options?.channelId || get().activeChannelId;
      if (channelId) formData.append('channel_id', channelId);

      const res = await fetch(`${API_BASE_URL}/api/v1/files/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (res.ok) {
        const data = await res.json();
        return {
          url: data.url,
          filename: data.filename,
          size: data.size,
          content_type: data.content_type,
        };
      }
      const error = await res.json().catch(() => ({}));
      throw new Error(typeof error.detail === 'string' ? error.detail : 'Не удалось загрузить файл');
    } catch (err) {
      console.error('Error uploading file', err);
      if (useAuthStore.getState().token === token) set({ uploadError: err instanceof Error ? err.message : 'Не удалось загрузить файл' });
      return null;
    }
  },

  initWebSocket: () => {
    const token = useAuthStore.getState().token;
    if (!token) return;

    const existing = get().socket;
    // If already connected or currently connecting, do not create another socket!
    if (existing && (existing.readyState === WebSocket.OPEN || existing.readyState === WebSocket.CONNECTING)) {
      return;
    }

    if (wsReconnectTimeout) {
      clearTimeout(wsReconnectTimeout);
      wsReconnectTimeout = null;
    }

    if (existing) {
      existing.onclose = null;
      existing.onerror = null;
      existing.onmessage = null;
      existing.onopen = null;
      try {
        existing.close();
      } catch {
        // Ignore close errors
      }
    }

    const ws = new WebSocket(`${WS_BASE_URL}?token=${token}`);

    ws.onopen = () => {
      historyLoadedAt.clear();
      for (const channelId of Object.keys(get().messages)) {
        if (get().channels.some(channel => channel.id === channelId)) ws.send(JSON.stringify({
          type: 'SUBSCRIBE_CHANNEL', data: { channel_id: channelId },
        }));
      }
      console.log('Realtime WebSocket connected');
      reconnectVoiceSignals();
      void get().loadChannels();
      const activeChannel = get().activeChannelId;
      if (activeChannel) {
        ws.send(JSON.stringify({
          type: 'SUBSCRIBE_CHANNEL',
          data: { channel_id: activeChannel },
        }));
        void get().loadMessages(activeChannel);
      }
    };

    ws.onmessage = (event) => {
      if (useAuthStore.getState().token !== token || get().socket !== ws) return;
      try {
        const payload = JSON.parse(event.data);
        const { type, data } = payload;

        if (type === 'NEW_MESSAGE') {
          const newMsg: Message = data;
          if (typeof window !== 'undefined' && !(get().messages[newMsg.channel_id] || []).some(message => message.id === newMsg.id)) {
            window.dispatchEvent(new CustomEvent('pati:new-message', { detail: newMsg }));
          }
          set(state => {
            const currentList = state.messages[newMsg.channel_id] || [];

            // 1. Skip if this real message ID is already in the list
            if (currentList.some(m => m.id === newMsg.id)) {
              return state;
            }

            const updatedList = mergeMessages(currentList, [newMsg]);
            const unread = (state.unreadCounts[newMsg.channel_id] ?? 0) +
              (state.activeChannelId !== newMsg.channel_id && newMsg.sender_id !== useAuthStore.getState().user?.id ? 1 : 0);

            return {
              unreadCounts: { ...state.unreadCounts, [newMsg.channel_id]: unread },
              channels: state.channels.map(channel => channel.id === newMsg.channel_id ? { ...channel, unread_count: unread } : channel),
              messages: {
                ...state.messages,
                [newMsg.channel_id]: updatedList,
              },
            };
          });
          if (!get().channels.some(channel => channel.id === newMsg.channel_id)) void get().loadChannels();
        } else if (type === 'MESSAGE_UPDATED') {
          const updatedMsg: Message = data;
          set(state => {
            const currentList = state.messages[updatedMsg.channel_id] || [];
            return {
              messages: {
                ...state.messages,
                [updatedMsg.channel_id]: currentList.map(m =>
                  m.id === updatedMsg.id ? updatedMsg : m
                ),
              },
            };
          });
        } else if (type === 'USER_TYPING') {
          const { channel_id, display_name, is_typing } = data;
          set(state => {
            const currentTyping = new Set(state.typingUsers[channel_id] || []);
            if (is_typing) {
              currentTyping.add(display_name);
            } else {
              currentTyping.delete(display_name);
            }
            return {
              typingUsers: {
                ...state.typingUsers,
                [channel_id]: currentTyping,
              },
            };
          });
        } else if (type === 'CALL_CHANGED') {
          receiveCallSignal(data);
        } else if (type === 'ROOMS_CHANGED') {
          void get().loadChannels();
        } else if (type === 'USERS_CHANGED') {
          void get().loadUsers();
        } else if (type === 'USER_STATUS_CHANGED') {
          const { user_id, status, custom_activity } = data;
          set(state => ({
            users: state.users.map(u =>
              u.id === user_id
                ? { ...u, status: status as any, custom_activity: custom_activity ?? u.custom_activity }
                : u
            ),
          }));
        } else if (type === 'USER_PROFILE_UPDATED') {
          const { user_id, display_name, avatar_url, status, custom_activity } = data;
          set(state => ({
            users: state.users.map(u =>
              u.id === user_id
                ? {
                    ...u,
                    display_name: display_name ?? u.display_name,
                    avatar_url: avatar_url !== undefined ? avatar_url : u.avatar_url,
                    status: status ?? u.status,
                    custom_activity: custom_activity ?? u.custom_activity,
                  }
                : u
            ),
          }));
          // If this is the current user, sync authStore
          const currentAuth = useAuthStore.getState().user;
          if (currentAuth && currentAuth.id === user_id) {
            const updatedAuth = {
              ...currentAuth,
              display_name: display_name ?? currentAuth.display_name,
              avatar_url: avatar_url !== undefined ? avatar_url : currentAuth.avatar_url,
              custom_activity: custom_activity ?? currentAuth.custom_activity,
            };
            localStorage.setItem('pati_user', JSON.stringify(updatedAuth));
            useAuthStore.setState({ user: updatedAuth });
          }
        }
      } catch (err) {
        console.error('Error handling WebSocket message', err);
      }
    };

    ws.onclose = () => {
      set({ socket: null });
      if (wsReconnectTimeout) {
        clearTimeout(wsReconnectTimeout);
      }
      wsReconnectTimeout = setTimeout(() => {
        if (useAuthStore.getState().isAuthenticated) {
          get().initWebSocket();
        }
      }, 3000);
    };

    set({ socket: ws });
  },

  disconnectWebSocket: () => {
    if (wsReconnectTimeout) {
      clearTimeout(wsReconnectTimeout);
      wsReconnectTimeout = null;
    }
    const socket = get().socket;
    if (socket) {
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      socket.onopen = null;
      try {
        socket.close();
      } catch {
        // Ignore close error
      }
      set({ socket: null });
    }
  },
}));

// Clear private data immediately when the account changes, before React effects run.
useAuthStore.subscribe((state, previous) => {
  if (state.token === previous.token) return;
  clearOutbox(previous.user?.id);
  historyRequests.clear();
  historyLoadedAt.clear();
  historyInFlight.clear();
  useChatStore.getState().disconnectWebSocket();
  useChatStore.setState({
    channels: [], users: [], unreadCounts: {}, uploadError: null, activeChannelId: null, messages: {},
    typingUsers: {}, replyingTo: null, isLoadingMessages: false,
    hasMoreMessages: {}, loadingOlder: {}, historyErrors: {},
  });
});

useChatStore.subscribe((state, previous) => {
  if (state.messages !== previous.messages) saveOutbox(useAuthStore.getState().user?.id, state.messages);
});

async function deliverMessage(message: Message): Promise<void> {
  const token = useAuthStore.getState().token;
  if (!token) return;
  const channelId = message.channel_id;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/channels/${channelId}/messages`, {
      method: 'POST', signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        client_request_id: message.client_request_id,
        content: message.content,
        reply_to_id: message.reply_to_id || null,
        attachments: message.attachments || [],
      }),
    });
    if (!response.ok) throw new Error('Не удалось отправить сообщение');
    const saved: Message = await response.json();
    if (useAuthStore.getState().token !== token) return;
    useChatStore.setState(state => ({ messages: { ...state.messages,
      [channelId]: mergeMessages((state.messages[channelId] || []).filter(m => m.id !== message.id), [saved]),
    } }));
  } catch (error) {
    console.error('Failed to send message', error);
    if (useAuthStore.getState().token !== token) return;
    useChatStore.setState(state => ({ messages: { ...state.messages,
      [channelId]: (state.messages[channelId] || []).map(m =>
        m.id === message.id ? { ...m, is_pending: false, is_failed: true } : m),
    } }));
  } finally { clearTimeout(timeout); }
}
