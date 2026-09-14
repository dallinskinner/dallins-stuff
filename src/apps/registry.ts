import type { ComponentType } from 'react'
import { AboutApp } from './AboutApp'
import { ProjectsApp } from './ProjectsApp'
import { ContactApp } from './ContactApp'
import { TypographyApp } from './TypographyApp'

export interface AppDefinition {
  id: string
  label: string
  component: ComponentType
}

export const apps: AppDefinition[] = [
  { id: 'about', label: 'About Me', component: AboutApp },
  { id: 'projects', label: 'Projects', component: ProjectsApp },
  { id: 'typography', label: 'Typography', component: TypographyApp },
  { id: 'contact', label: 'Contact', component: ContactApp },
]

export function getApp(id: string | undefined): AppDefinition | undefined {
  return apps.find((app) => app.id === id)
}
