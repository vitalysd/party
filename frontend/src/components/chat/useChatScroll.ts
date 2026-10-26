import { useLayoutEffect, useRef } from 'react';

/** Keep each conversation at its last reading position while switching chats. */
export function useChatScroll(channelId: string | undefined, lastMessageId: string | undefined) {
  const ref = useRef<HTMLDivElement>(null);
  const positions = useRef(new Map<string, { top: number; bottom: boolean }>());
  const previousChannel = useRef<string | undefined>(undefined);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !channelId) return;
    const saved = positions.current.get(channelId);
    if (previousChannel.current !== channelId) {
      element.scrollTop = saved && !saved.bottom ? saved.top : element.scrollHeight;
      previousChannel.current = channelId;
    } else if (!saved || saved.bottom) {
      element.scrollTop = element.scrollHeight;
    }
  }, [channelId, lastMessageId]);
  function onScroll() {
    const element = ref.current;
    if (element && channelId) positions.current.set(channelId, {
      top: element.scrollTop, bottom: element.scrollHeight - element.clientHeight - element.scrollTop < 48,
    });
  }
  return { ref, onScroll };
}
