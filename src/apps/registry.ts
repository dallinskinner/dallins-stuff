import type { ComponentType } from 'react'
import { AboutApp } from './AboutApp'
import { ProjectsApp } from './ProjectsApp'
import { ContactApp } from './ContactApp'
import { TypographyApp } from './TypographyApp'
import infoIcon from '../assets/icons/info.png'

export interface AppDefinition {
  id: string
  label: string
  icon?: string
  component: ComponentType
}

export const apps: AppDefinition[] = [
  { id: 'about', label: 'About Me', icon: infoIcon, component: AboutApp },
  { id: 'projects', label: 'Projects', component: ProjectsApp },
  { id: 'typography', label: 'Typography', component: TypographyApp },
  { id: 'contact', label: 'Contact', component: ContactApp },
]

export function getApp(id: string | undefined): AppDefinition | undefined {
  return apps.find((app) => app.id === id)
}
