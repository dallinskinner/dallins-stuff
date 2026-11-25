import type { ComponentType } from 'react'
import type { AppMessageType } from './messages'
import { AboutApp } from './AboutApp'
import { ProjectsApp } from './ProjectsApp'
import { ContactApp } from './ContactApp'
import { TypographyApp } from './TypographyApp'
import { UiComponentsApp } from './UiComponentsApp'
import { PixelArtApp } from './pixel-art/PixelArtApp'
import { NoiseApp } from './noise/NoiseApp'
import { ImageToolsApp } from './image-tools/ImageToolsApp'
import { ColorPaletteApp } from './color-palette/ColorPaletteApp'
import { DitherApp } from './dither/DitherApp'
import { P5SketchApp } from './p5-sketch/P5SketchApp'
import aboutMeIcon from '../assets/icons/about-me.png'
import pencilIcon from '../assets/icons/pencil.png'
import documentIcon from '../assets/icons/document.png'
import colorPaletteIcon from '../assets/icons/color-palette.png'
import imageToolsIcon from '../assets/icons/image-tools.png'
import gradientIcon from '../assets/icons/gradient.png'
import curveIcon from '../assets/icons/curve.png'
import screenFlavorIcon from '../assets/icons/screen-flavor.png'

export interface AppDefinition {
  id: string
  label: string
  icon?: string
  component?: ComponentType
  children?: AppDefinition[]
  /** Overrides Window's default 600px cap, for apps too wide to fit it. A number is in px; a string is used as-is (e.g. a viewport-relative unit for apps that should grow freely). */
  windowMaxWidth?: number | string
  /** Opens the window at this fixed size (px) instead of sizing to its content, so an AppFrame's center area has room to grow. Clamped to fit within the viewport. */
  defaultSize?: { width: number; height: number }
  /** Message types this app can receive from other apps (see `messages.ts`); senders offer it as a target for these. */
  accepts?: AppMessageType[]
}

export const apps: AppDefinition[] = [
  { id: 'about', label: 'About Me', icon: aboutMeIcon, component: AboutApp },
  { id: 'projects', label: 'Projects', icon: documentIcon, component: ProjectsApp },
  { id: 'contact', label: 'Contact', icon: documentIcon, component: ContactApp },
  {
    id: 'tools',
    label: 'Tools',
    children: [
      { id: 'pixel-art', label: 'Pixel Art', icon: pencilIcon, component: PixelArtApp, defaultSize: { width: 1100, height: 760 } },
      { id: 'noise', label: 'Noise', icon: screenFlavorIcon, component: NoiseApp, defaultSize: { width: 1000, height: 700 } },
      { id: 'image-tools', label: 'Image Tools', icon: imageToolsIcon, component: ImageToolsApp, defaultSize: { width: 1100, height: 760 } },
      { id: 'color-palette', label: 'Color Palette', icon: colorPaletteIcon, component: ColorPaletteApp, defaultSize: { width: 960, height: 680 }, accepts: ['palette'] },
      { id: 'dither', label: 'Dither', icon: gradientIcon, component: DitherApp, defaultSize: { width: 1100, height: 760 }, accepts: ['frame-source', 'palette'] },
      { id: 'p5-sketch', label: 'p5 Sketch', icon: curveIcon, component: P5SketchApp, defaultSize: { width: 1200, height: 800 } },
    ],
  },
  {
    id: 'debug',
    label: 'Debug',
    children: [
      { id: 'typography', label: 'Typography', icon: documentIcon, component: TypographyApp },
      { id: 'ui-components', label: 'UI Components', icon: documentIcon, component: UiComponentsApp, windowMaxWidth: 760 },
    ],
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
