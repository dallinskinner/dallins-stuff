import type { ComponentType } from 'react'
import type { AppMessageType } from './messages'
import type { WindowSize } from './Window'
import { AboutApp } from './about/AboutApp'
import { ProjectsApp } from './ProjectsApp'
import { ContactApp } from './ContactApp'
import { TypographyApp } from './TypographyApp'
import { PixelArtApp } from './pixel-art/PixelArtApp'
import { ScreenSavorApp } from './screen-savor/ScreenSavorApp'
import { ImageToolsApp } from './image-tools/ImageToolsApp'
import { ColorPaletteApp } from './color-palette/ColorPaletteApp'
import aboutMeIcon from '../assets/icons/about-me.png'
import pencilIcon from '../assets/icons/pencil.png'
import documentIcon from '../assets/icons/document.png'
import colorPaletteIcon from '../assets/icons/color-palette.png'
import imageToolsIcon from '../assets/icons/image-tools.png'
import screenFlavorIcon from '../assets/icons/screen-flavor.png'

export interface AppDefinition {
  id: string
  label: string
  icon?: string
  component?: ComponentType
  children?: AppDefinition[]
  /** Widest the window opens at, overriding Window's default 600px, for apps too wide to fit it; narrower content opens narrower, and resizing can go past it. A number is in px; a string is used as-is (e.g. a viewport-relative unit). */
  windowOpeningWidth?: number | string
  /** Hard size limits for the window, enforced on open and while resizing (unlike `windowOpeningWidth`, which only applies on open). */
  windowMinSize?: WindowSize
  windowMaxSize?: WindowSize
  /** Message types this app can receive from other apps (see `messages.ts`); senders offer it as a target for these. */
  accepts?: AppMessageType[]
}

export const apps: AppDefinition[] = [
  {
    id: 'about',
    label: 'About Me',
    icon: aboutMeIcon,
    component: AboutApp,
    windowMinSize: { width: 400, height: 380 },
    windowMaxSize: { width: 725, height: 800 },
  },
  { id: 'projects', label: 'Projects', icon: documentIcon, component: ProjectsApp },
  { id: 'contact', label: 'Contact', icon: documentIcon, component: ContactApp },
  {
    id: 'tools',
    label: 'Tools',
    children: [
      { id: 'pixel-art', label: 'Pixel Art', icon: pencilIcon, component: PixelArtApp, windowOpeningWidth: 760 },
      { id: 'screen-savor', label: 'Screen Flavor', icon: screenFlavorIcon, component: ScreenSavorApp, windowOpeningWidth: '95vw' },
      { id: 'image-tools', label: 'Image Tools', icon: imageToolsIcon, component: ImageToolsApp, windowOpeningWidth: 760 },
      { id: 'color-palette', label: 'Color Palette', icon: colorPaletteIcon, component: ColorPaletteApp, windowOpeningWidth: 760, accepts: ['palette'] },
    ],
  },
  {
    id: 'debug',
    label: 'Debug',
    children: [{ id: 'typography', label: 'Typography', icon: documentIcon, component: TypographyApp }],
  },
]

export interface ResolvedApp {
  node: AppDefinition
  path: string
}

/** Walks a `/`-separated id path (e.g. from a route splat) down the app tree. */
export function resolvePath(path: string): ResolvedApp | undefined {
  const segments = path.split('/').filter(Boolean)
  let nodes = apps
  let node: AppDefinition | undefined

  for (const segment of segments) {
    node = nodes.find((app) => app.id === segment)
    if (!node) return undefined
    nodes = node.children ?? []
  }

  return node ? { node, path: segments.join('/') } : undefined
}

/** Every leaf app that accepts `type`, with its full path. */
export function appsAccepting(type: AppMessageType): { path: string; label: string }[] {
  const found: { path: string; label: string }[] = []
  function walk(nodes: AppDefinition[], prefix: string) {
    for (const node of nodes) {
      const path = prefix ? `${prefix}/${node.id}` : node.id
      if (node.children) walk(node.children, path)
      else if (node.accepts?.includes(type)) found.push({ path, label: node.label })
    }
  }
  walk(apps, '')
  return found
}
