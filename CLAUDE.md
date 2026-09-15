# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- `pnpm dev` — start the Vite dev server
- `pnpm build` — type-check (`tsc -b`) then production build via Vite
- `pnpm lint` — run Oxlint
- `pnpm preview` — serve the production build locally

This project uses **pnpm**, not npm or yarn. There is no test setup yet.

## Verifying changes

Don't spin up headless browsers, Playwright, or any other automated visual-testing setup to verify UI changes (including installing browser binaries or system libraries to make one work). `pnpm build` is sufficient to confirm things compile and type-check. The user tests visual/interactive changes themselves in a real browser and prefers to keep this lightweight — just make the change and let them check it.

## Architecture

This is a personal site built as a desktop-OS metaphor: a persistent "desktop" shell with clickable icons, where navigating to an icon's target focuses a "subapp" (window) rather than doing a full page navigation. It's a Vite + React + TypeScript SPA with React Router for real, deep-linkable URLs.

Routing (`src/App.tsx`) nests subapp routes inside the shell route so the shell never unmounts:

```
/               -> Desktop (shell: renders icons + <Outlet/>)
  apps/:appId   -> AppWindow (resolves :appId and renders the matched subapp)
```

- `src/desktop/Desktop.tsx` — the persistent shell. Renders one `DesktopIcon` per entry in the app registry, plus an `<Outlet/>` where the active subapp renders.
- `src/apps/registry.ts` — single source of truth for subapps: an array of `{ id, label, component }`. Adding a new subapp means creating its component and adding one entry here — nothing else needs to know about it.
- `src/apps/AppWindow.tsx` — reads `:appId` from the route params, looks it up via `getApp()`, and renders that subapp's component (or a not-found message).
- Individual subapps (`AboutApp.tsx`, `ProjectsApp.tsx`, `ContactApp.tsx`) are plain components with no knowledge of routing or the shell.

There is no window manager yet (no dragging, stacking, focus/z-index, or multiple simultaneously-open windows) — currently only one subapp renders at a time, driven entirely by the route.

### Styling

Styling uses **CSS Modules** (`*.module.css`, colocated with their component) for static structure, plus **CSS custom properties** for anything computed from React state or props. The convention for dynamic values: set the custom property via the `style` prop on the element, and reference it with `var()` in the module CSS, e.g.:

```tsx
<div className={styles.window} style={{ '--x': `${x}px` } as React.CSSProperties} />
```
```css
.window { transform: translateX(var(--x)); }
```

Do not reach for styled-components, Tailwind, or other CSS-in-JS/utility libraries — this project deliberately uses plain CSS Modules.
