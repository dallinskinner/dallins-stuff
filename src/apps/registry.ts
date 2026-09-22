import type { ComponentType } from 'react'
import { AboutApp } from './AboutApp'
import { ProjectsApp } from './ProjectsApp'
import { ContactApp } from './ContactApp'
import { TypographyApp } from './TypographyApp'
import { PixelArtApp } from './pixel-art/PixelArtApp'
import { ScreenSavorApp } from './screen-savor/ScreenSavorApp'
import { ImageToolsApp } from './image-tools/ImageToolsApp'
import infoIcon from '../assets/icons/info.png'
import pencilIcon from '../assets/icons/pencil.png'
import documentIcon from '../assets/icons/document.png'

export interface AppDefinition {
  id: string
  label: string
  icon?: string
  component?: ComponentType
  children?: AppDefinition[]
  /** Overrides Window's default 600px cap, for apps too wide to fit it. A number is in px; a string is used as-is (e.g. a viewport-relative unit for apps that should grow freely). */
  windowMaxWidth?: number | string
}

export const apps: AppDefinition[] = [
  { id: 'about', label: 'About Me', icon: infoIcon, component: AboutApp },
  { id: 'projects', label: 'Projects', icon: documentIcon, component: ProjectsApp },
  { id: 'contact', label: 'Contact', icon: documentIcon, component: ContactApp },
  {
    id: 'tools',
    label: 'Tools',
    children: [
      { id: 'pixel-art', label: 'Pixel Art', icon: pencilIcon, component: PixelArtApp, windowMaxWidth: 640 },
      { id: 'screen-savor', label: 'Screen Flavor', icon: documentIcon, component: ScreenSavorApp, windowMaxWidth: '95vw' },
      { id: 'image-tools', label: 'Image Tools', icon: documentIcon, component: ImageToolsApp, windowMaxWidth: 760 },
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
