export function Toast({ message }: { message: string }) {
  return (
    <div
      style={{
        position: 'absolute', left: '50%', bottom: 22, transform: 'translateX(-50%)', zIndex: 55,
        background: 'var(--bg-panel)', border: '1px solid var(--accent)', color: 'var(--text)',
        fontSize: 12, padding: '11px 18px', borderRadius: 5, maxWidth: '88%', textAlign: 'center',
        lineHeight: 1.5, animation: 'dq-shift .3s ease both', boxShadow: '0 8px 30px rgba(0,0,0,.5)',
        width: 'max-content'
      }}
    >
      {message}
    </div>
  );
}
