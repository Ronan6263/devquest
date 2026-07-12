export function Toast({ message, onUndo }: { message: string; onUndo?: (() => void) | null }) {
  return (
    <div
      role="status"
      style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 80,
        background: 'var(--bg-panel)', borderBottom: '1px solid var(--accent)', color: 'var(--text)',
        fontSize: 12, padding: 'calc(11px + env(safe-area-inset-top)) 18px 11px', textAlign: 'center',
        lineHeight: 1.5, animation: 'dq-drop .3s ease both', boxShadow: '0 8px 30px rgba(0,0,0,.5)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, flexWrap: 'wrap'
      }}
    >
      <span>{message}</span>
      {onUndo && (
        <button className="dq-btn-ghost" style={{ padding: '4px 12px', flex: 'none' }} onClick={onUndo}>
          UNDO ⎌
        </button>
      )}
    </div>
  );
}
