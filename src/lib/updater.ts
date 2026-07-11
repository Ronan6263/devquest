import { registerSW } from 'virtual:pwa-register';

/**
 * Auto-update: the service worker precaches each deploy. We check GitHub Pages
 * for a new build on launch, hourly, and whenever the app returns to the
 * foreground (phone unlock / tab switch). When one is waiting, the app shows
 * an UPDATE READY banner — applying is a tap, never a forced mid-session reload.
 */

type Listener = (ready: boolean) => void;
let listener: Listener | null = null;
let updateReady = false;

const CHECK_INTERVAL = 60 * 60 * 1000; // hourly

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    updateReady = true;
    listener?.(true);
  },
  onRegisteredSW(_url, registration) {
    if (!registration) return;
    const check = () => registration.update().catch(() => { /* offline is fine */ });
    setInterval(check, CHECK_INTERVAL);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check();
    });
  }
});

export function onUpdateReady(fn: Listener): void {
  listener = fn;
  if (updateReady) fn(true);
}

/** Activates the waiting service worker and reloads with the new version. */
export function applyUpdate(): void {
  void updateSW(true);
}
