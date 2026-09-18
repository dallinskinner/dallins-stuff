import type { ComponentType } from 'react'
import { AboutApp } from './AboutApp'
import { ProjectsApp } from './ProjectsApp'
import { ContactApp } from './ContactApp'
import { TypographyApp } from './TypographyApp'
import { PixelArtApp } from './pixel-art/PixelArtApp'
import infoIcon from '../assets/icons/info.png'
import pencilIcon from '../assets/icons/pencil.png'
import documentIcon from '../assets/icons/document.png'

export interface AppDefinition {
  id: string
  label: string
  icon?: string
  component?: ComponentType
  children?: AppDefinition[]
  /** Overrides Window's default 600px cap, for apps too wide to fit it. */
  windowMaxWidth?: number
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
