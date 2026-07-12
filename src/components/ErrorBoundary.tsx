import React from 'react';
import { loadState, exportJson } from '../lib/db';

interface State {
  error: Error | null;
}

/**
 * Last line of defense: a render crash anywhere must never lock the player's
 * data behind a white screen. The fallback always offers a JSON export read
 * straight from IndexedDB, bypassing the broken React tree.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('DevQuest crashed:', error, info.componentStack);
  }

  exportData = async () => {
    const data = await loadState();
    if (data) exportJson(data);
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={{
        height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'center', gap: 16, padding: 24, textAlign: 'center'
      }}>
        <div style={{ fontSize: 14, letterSpacing: '.2em', color: 'var(--accent)', fontWeight: 800 }}>
          ⚠ TERMINAL FAULT
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-dim)', maxWidth: 420, lineHeight: 1.7 }}>
          Something crashed. Your data is safe in local storage — export a backup below, then reload.
          If it keeps happening, import the backup after a fresh start.
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-dim2)', fontFamily: 'inherit', maxWidth: 420, overflowWrap: 'anywhere' }}>
          {String(this.state.error)}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="dq-btn-ghost" onClick={() => void this.exportData()}>EXPORT DATA ⭳</button>
          <button className="dq-btn-solid" style={{ fontSize: 12, padding: '8px 18px' }} onClick={() => location.reload()}>
            RELOAD ⟳
          </button>
        </div>
      </div>
    );
  }
}
