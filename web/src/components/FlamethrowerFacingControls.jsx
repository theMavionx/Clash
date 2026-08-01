import { memo, useEffect } from 'react';
import { useSend, useUI } from '../hooks/useGodot';
import './FlamethrowerFacingControls.css';

function FlamethrowerFacingControls() {
  const { sendToGodot } = useSend();
  const { flamethrowerFacingEditor: editor } = useUI();
  const editMode = editor?.mode === 'edit';
  const pending = !!editor?.pending;
  const cellLocked = editMode || !!editor?.cell_locked;
  const pendingLabel = editMode ? 'Saving…' : 'Placing…';

  useEffect(() => {
    if (!editor?.active) return undefined;
    const onKeyDown = (event) => {
      if (event.repeat || pending) return;
      const key = String(event.key || '').toLowerCase();
      if (key === 'q' || event.key === 'ArrowLeft') {
        event.preventDefault();
        sendToGodot('flamethrower_facing_step', { direction: -1 });
      } else if (key === 'e' || event.key === 'ArrowRight') {
        event.preventDefault();
        sendToGodot('flamethrower_facing_step', { direction: 1 });
      } else if (key === 'r') {
        event.preventDefault();
        sendToGodot('flamethrower_facing_reset');
      } else if (event.key === 'Escape') {
        event.preventDefault();
        sendToGodot('flamethrower_facing_cancel');
      } else if (cellLocked && event.key === 'Enter') {
        event.preventDefault();
        sendToGodot('flamethrower_facing_confirm');
      }
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [cellLocked, editor?.active, pending, sendToGodot]);

  if (!editor?.active) return null;

  const stopWorldInput = (event) => event.stopPropagation();

  return (
    <div
      className="flamethrower-facing-dock"
      role="dialog"
      aria-label="Flamethrower direction editor"
      onPointerDown={stopWorldInput}
      onPointerUp={stopWorldInput}
      onClick={stopWorldInput}
    >
      <div className="flamethrower-facing-header">
        <div className="flamethrower-facing-title">
          {pending ? pendingLabel : editMode ? 'Edit attack direction' : cellLocked ? 'Aim before placing' : 'Choose a tile'}
        </div>
        <div className="flamethrower-facing-angle" aria-live="polite">{Number(editor.step) + 1}/24 · {Number(editor.degrees) || 0}°</div>
      </div>
      <div className="flamethrower-facing-row">
        <button type="button" disabled={pending} className="flamethrower-facing-button flamethrower-facing-rotate" onClick={() => sendToGodot('flamethrower_facing_step', { direction: -1 })} aria-label="Rotate Flamethrower left by 15 degrees" title="Rotate left 15 degrees (Q or Left Arrow)">↶ 15°</button>
        <button type="button" disabled={pending} className="flamethrower-facing-button flamethrower-facing-reset" onClick={() => sendToGodot('flamethrower_facing_reset')} aria-label="Point Flamethrower toward the troop landing area" title="Face troop landing (R)">Face landing</button>
        <button type="button" disabled={pending} className="flamethrower-facing-button flamethrower-facing-rotate" onClick={() => sendToGodot('flamethrower_facing_step', { direction: 1 })} aria-label="Rotate Flamethrower right by 15 degrees" title="Rotate right 15 degrees (E or Right Arrow)">15° ↷</button>
      </div>
      <div className="flamethrower-facing-row">
        <button type="button" disabled={pending} className="flamethrower-facing-button flamethrower-facing-cancel" onClick={() => sendToGodot('flamethrower_facing_cancel')} aria-label="Cancel direction editing">Cancel</button>
        <button type="button" disabled={!cellLocked || pending} className={`flamethrower-facing-button flamethrower-facing-confirm${pending ? ' is-pending' : ''}`} onClick={() => sendToGodot('flamethrower_facing_confirm')} aria-label={editMode ? 'Save Flamethrower direction' : 'Place Flamethrower here'}>{pending ? pendingLabel : editMode ? 'Save direction' : 'Place here'}</button>
      </div>
    </div>
  );
}

export default memo(FlamethrowerFacingControls);
