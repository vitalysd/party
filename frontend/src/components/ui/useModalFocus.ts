import { useEffect, useRef } from 'react';

/** Keep keyboard navigation inside a modal and restore its opener on close. */
export function useModalFocus() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const modal = ref.current;
    if (!modal) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const controls = () => Array.from(modal.querySelectorAll<HTMLElement>(
      'button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]',
    )).filter(element => element.getClientRects().length > 0);
    (controls()[0] ?? modal).focus();
    const keydown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = controls();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first) { event.preventDefault(); modal.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === modal)) {
        event.preventDefault(); last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === modal)) {
        event.preventDefault(); first.focus();
      }
    };
    modal.addEventListener('keydown', keydown);
    return () => {
      modal.removeEventListener('keydown', keydown);
      if (opener?.isConnected) opener.focus();
    };
  }, []);
  return ref;
}
