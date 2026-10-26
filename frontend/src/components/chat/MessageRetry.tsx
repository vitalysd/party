import { Message } from '../../types';
import { useAuthStore } from '../../store/authStore';
import { useChatStore } from '../../store/chatStore';

export function MessageRetry({ message }: { message: Message }) {
  const userId = useAuthStore(state => state.user?.id);
  const retry = useChatStore(state => state.retryMessage);
  if (!message.is_failed || message.sender_id !== userId) return null;
  return <div className="text-xs text-pati-red-light mb-1">
    <p role="alert">Не удалось подтвердить отправку.</p>
    {message.client_request_id && <button type="button"
      onClick={() => retry(message.channel_id, message.id)}
      className="underline underline-offset-2 hover:text-pati-red-text py-1">
      Повторить отправку
    </button>}
  </div>;
}
