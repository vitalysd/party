export type UserStatus = 'online' | 'idle' | 'dnd' | 'offline';

export interface User {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string | null;
  status: UserStatus;
  custom_activity?: string | null;
  is_admin: boolean;
  is_active: boolean;
  created_at: string;
}

export interface ChannelMember {
  id: string;
  user_id: string;
  channel_id: string;
  role: string;
  joined_at: string;
  user?: User;
}

export interface Channel {
  id: string;
  name: string;
  type: 'text' | 'voice';
  description?: string | null;
  icon?: string | null;
  banner_url?: string | null;
  is_direct: boolean;
  created_at: string;
  members: ChannelMember[];
  unread_count?: number;
  last_message?: string;
  last_message_time?: string;
}

export interface Attachment {
  url: string;
  filename: string;
  size: number;
  content_type: string;
}

export interface Reaction {
  id: string;
  message_id: string;
  user_id: string;
  emoji: string;
  created_at: string;
  user?: User;
}

export interface MessageReply {
  id: string;
  sender_id: string;
  content: string;
  sender?: User;
}

export interface Message {
  client_request_id?: string | null;
  id: string;
  channel_id: string;
  sender_id: string;
  content: string;
  reply_to_id?: string | null;
  attachments?: Attachment[];
  created_at: string;
  updated_at?: string | null;
  sender?: User;
  reply_to?: MessageReply | null;
  reactions: Reaction[];
  is_failed?: boolean;
  is_pending?: boolean; // For React 19 useOptimistic
}

export interface VoiceParticipant {
  identity: string;
  name: string;
  avatar_url?: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isScreenSharing: boolean;
  statusText?: string;
}

export interface PrivateCall {
  id: string;
  channel_id: string;
  caller_id: string;
  callee_id: string;
  caller_name: string;
  callee_name: string;
  status: 'ringing' | 'accepted' | 'ended';
  version: number;
  expires_at: string | null;
  reason?: string;
}
