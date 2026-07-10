# DevQuest

A single-user gamification layer for solo gamedev work. React PWA — installable on desktop and phone straight from the browser. See `docs/` in the design handoff for the full product spec.

## Run it

```
npm install
npm run icons   # regenerates PWA icons (already committed)
npm run dev     # dev server
npm run build   # production build in dist/
```

## Stack

- Vite + React 18 + TypeScript
- `vite-plugin-pwa` — installable, offline-capable (service worker precaches the app shell)
- IndexedDB via `idb` — the whole state is one persisted document, saved on every mutation
- No backend, no accounts. JSON export/import in CONFIG for manual desktop ⇄ phone sync (cloud sync is v2)

## Deploy (GitHub Pages)

`vite.config.ts` uses `base: './'`, so the build is relocatable. Push `dist/` to a `gh-pages` branch or use an action; no config change needed.

## The rules the code enforces

- XP only from pre-defined tasks (S 10 / M 25 / L 60), quest bonuses (Σ×0.5), and proof achievements
- Sessions under 90s vanish — nothing logged (the 90-Second Rule)
- Streaks are weekly (3 session-days), pause and never reset
- No punishment mechanics anywhere
