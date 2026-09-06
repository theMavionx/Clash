import { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import './PositionActionDialog.css';

// Portalled out of table/scroll containers; native top-layer modal supplies
// focus containment and prevents clicks reaching the game below it.
export default function PositionActionDialog({ title, onClose, children, feedback }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger instanceof HTMLElement && trigger.isConnected) trigger.focus();
    };
  }, []);
  if (typeof document === 'undefined') return null;
  return createPortal(
    <dialog ref={ref} className="position-action-dialog" aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); event.stopPropagation(); onClose(); }}
      onClick={event => event.stopPropagation()} onKeyDown={event => event.stopPropagation()}>
      <header className="position-action-dialog__header">
        <h2 id={titleId}>{title}</h2>
        <button type="button" aria-label="Close position dialog" onClick={onClose}>×</button>
      </header>
      <div className="position-action-dialog__body">{children}
        {feedback && <div className="position-action-dialog__error" role="alert">{feedback}</div>}
      </div>
    </dialog>, document.body,
  );
}
