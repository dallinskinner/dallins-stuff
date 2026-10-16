import type { Project } from './projectFile'
import { parseProject } from './projectFile'

// The project goes in its own key, in the same format as a saved project file, so it isn't double-escaped inside a wrapper.
const PROJECT_KEY = 'pixel-art:autosave'
const FILE_NAME_KEY = 'pixel-art:autosave-name'

export interface Autosave {
  project: Project
  fileName: string
}

/** The last autosaved project, or null if there's none or it can't be read (storage blocked, or the data is invalid). */
export function loadAutosave(): Autosave | null {
  try {
    const text = localStorage.getItem(PROJECT_KEY)
    if (!text) return null
    return { project: parseProject(text), fileName: localStorage.getItem(FILE_NAME_KEY) || 'pixel-art' }
  } catch {
    return null
  }
}

/** Best effort: if storage is blocked or full (e.g. a huge, noisy canvas), this state just isn't saved. */
export function writeAutosave(projectJson: string, fileName: string) {
  try {
    localStorage.setItem(PROJECT_KEY, projectJson)
    localStorage.setItem(FILE_NAME_KEY, fileName)
  } catch {
    // Ignored on purpose; the previous autosave stays in place.
  }
}
