import { useChatStore } from '../../store/chatStore';

export function LoadOlderMessages({ channelId }: { channelId: string }) {
  const hasMore = useChatStore(state => state.hasMoreMessages[channelId]);
  const loading = useChatStore(state => state.loadingOlder[channelId] ||
    (state.activeChannelId === channelId && state.isLoadingMessages));
  const error = useChatStore(state => state.historyErrors[channelId]);
  const loadOlder = useChatStore(state => state.loadOlderMessages);
  const reload = useChatStore(state => state.loadMessages);
  if (!hasMore && !error) return null;
  return <div className="text-center py-3 text-xs text-pati-text-muted">
    {error && <p role="alert" className="text-pati-red-light mb-1">{error}</p>}
    <button type="button" disabled={loading}
      onClick={() => hasMore ? loadOlder(channelId) : reload(channelId)}
      className="rounded-lg border border-pati-border px-3 py-2 hover:text-white disabled:opacity-50">
      {loading ? 'Загрузка…' : error ? 'Повторить загрузку' : 'Загрузить предыдущие сообщения'}
    </button>
  </div>;
}
