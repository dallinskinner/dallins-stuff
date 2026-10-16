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
/           -> Desktop (shell: renders icons + every open window)
  apps/*    -> null (exists only so the URLs match; Desktop reads the path itself)
```

- `src/desktop/Desktop.tsx` — the persistent shell and window manager. Renders one `DesktopIcon` per registry entry, plus one `AppWindow` per open window. The URL (`/apps/<path>`) names the **focused** window; navigating to a path opens that window (if not already open) and raises it. Open windows stay mounted, keeping their state, position and size in memory (not persisted across reloads). Each app path has at most one window. Windows render in open order (so React never remounts them) and stack via a separate z-order (`--z`). Focusing a window by clicking it uses `navigate(..., { replace: true })`; closing one moves focus to the next window down, or to `/`.
- `src/desktop/WindowManager.tsx` — contexts: `useWindowManager()` (`openPaths`, `focusedPath`, `focus`, `close`) and `useWindowFocus()` (`{ path, isFocused }` for the current window). Subapps with global listeners (e.g. Image Tools' `paste` handler) should gate them on `isFocused`, since several apps may be mounted at once.
- `src/apps/registry.ts` — single source of truth for subapps, as a **tree**: each `AppDefinition` is either a leaf (`{ id, label, component }`) or a directory (`{ id, label, children }`, itself a list of `AppDefinition`). `resolvePath()` walks a `/`-separated id path (from the route splat) down that tree. Adding a leaf subapp means creating its component and adding one entry (at the top level or inside a directory's `children`) — nothing else needs to know about it.
- `src/apps/AppWindow.tsx` — takes a resolved `path` prop, resolves it via `resolvePath()`, and renders the matched leaf's component or, for a directory, `DirectoryApp`, inside a `Window` wired to the manager's focus/close.
- `src/apps/Window.tsx` — window chrome: draggable title bar, resize handle, close button, focus on pointerdown. Position and size are local state.
- `src/apps/DirectoryApp.tsx` — renders a grid of `DesktopIcon`s for a directory's children, linking each to `<basePath>/<childId>`. A directory is just a nested desktop rendered inside a window; opening a child opens a separate window, leaving the directory open.
- Individual subapps (`AboutApp.tsx`, `ProjectsApp.tsx`, `ContactApp.tsx`) are plain components with no knowledge of routing or the shell (beyond optionally `useWindowFocus()`).

### Styling

Styling uses **CSS Modules** (`*.module.css`, colocated with their component) for static structure, plus **CSS custom properties** for anything computed from React state or props. The convention for dynamic values: set the custom property via the `style` prop on the element, and reference it with `var()` in the module CSS, e.g.:

```tsx
<div className={styles.window} style={{ '--x': `${x}px` } as React.CSSProperties} />
```
```css
.window { transform: translateX(var(--x)); }
```

Do not reach for styled-components, Tailwind, or other CSS-in-JS/utility libraries — this project deliberately uses plain CSS Modules.
