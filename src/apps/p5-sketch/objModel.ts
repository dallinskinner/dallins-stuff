/** Loading a Wavefront .obj file into a scene. The text is kept in the scene itself (so it saves with the sketch and
 *  the sandboxed preview, which can't reach any file, can load it from inside), so there's a size limit. */

export const MAX_MODEL_BYTES = 5_000_000

export interface ObjModel {
  /** The file's name without `.obj`. */
  name: string
  /** The OBJ text, minus material lines. */
  data: string
  vertices: number
  faces: number
}

/** Cleans OBJ text and counts what's in it. Throws a readable Error if it isn't a usable model. */
export function prepareObj(text: string, name: string): ObjModel {
  let vertices = 0
  let faces = 0
  const kept: string[] = []
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trimStart()
    // Material files can't come along (and p5 would try to fetch them), so the model is drawn in the layer's color.
    if (/^(mtllib|usemtl)\b/.test(trimmed)) continue
    if (/^v\s/.test(trimmed)) vertices++
    else if (/^f\s/.test(trimmed)) faces++
    kept.push(line)
  }
  if (vertices === 0) throw new Error('No vertices found — is this an OBJ file?')
  if (faces === 0) throw new Error('This OBJ has no faces to draw.')
  return { name: name.replace(/\.obj$/i, '') || 'Model', data: kept.join('\n'), vertices, faces }
}

export async function readObjFile(file: File): Promise<ObjModel> {
  if (file.size > MAX_MODEL_BYTES) {
    throw new Error(`${file.name} is ${(file.size / 1e6).toFixed(1)} MB; models can be up to ${MAX_MODEL_BYTES / 1e6} MB.`)
  }
  return prepareObj(await file.text(), file.name)
}
