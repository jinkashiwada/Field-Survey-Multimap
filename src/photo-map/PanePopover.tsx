import { useEffect, useRef, type ReactNode } from 'react';

/** A non-modal panel stays beside the surface which owns its settings. */
export function PanePopover({
  id,
  title,
  onClose,
  children,
}: {
  id: string;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const root = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    root.current?.focus({ preventScroll: true });
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (
        target instanceof Element &&
        !root.current?.contains(target) &&
        !target.closest('[data-pane-menu-button]')
      )
        close.current();
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  const dismiss = () => {
    const trigger = document.querySelector<HTMLButtonElement>(
      `[aria-controls="${id}"]`,
    );
    onClose();
    trigger?.focus({ preventScroll: true });
  };
  return (
    <section
      ref={root}
      id={id}
      className="pm-surface-popover"
      role="dialog"
      aria-label={title}
      tabIndex={-1}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation();
          dismiss();
        }
      }}
    >
      <header>
        <strong>{title}</strong>
        <button onClick={dismiss} aria-label={`${title}を閉じる`}>
          ×
        </button>
      </header>
      <div className="pm-popover-body">{children}</div>
    </section>
  );
}
