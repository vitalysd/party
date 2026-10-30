import { Channel, Message, User } from "../types";

export function conversationRows(
  channels: Channel[],
  users: User[],
  messages: Record<string, Message[]>,
  userId?: string,
) {
  return channels
    .map((channel) => {
      const member = channel.is_direct
        ? channel.members.find((item) => item.user_id !== userId)
        : undefined;
      const partner = member
        ? (users.find((item) => item.id === member.user_id) ?? member.user)
        : undefined;
      const latest = messages[channel.id]?.at(-1);
      const content =
        latest?.content ||
        (latest?.attachments?.length ? "Вложение" : channel.last_message) ||
        "Пока нет сообщений";
      return {
        channel,
        partner,
        title: partner?.display_name || channel.name,
        preview: latest?.sender_id === userId ? `Вы: ${content}` : content,
        timestamp:
          latest?.created_at || channel.last_message_time || channel.created_at,
        unread: channel.unread_count || 0,
      };
    })
    .sort(
      (a, b) => (Date.parse(b.timestamp) || 0) - (Date.parse(a.timestamp) || 0),
    );
}

export function conversationTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toDateString() === new Date().toDateString()
    ? date.toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("ru", { day: "numeric", month: "short" });
}
