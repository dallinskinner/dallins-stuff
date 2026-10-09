/** Turns a user-picked file into a Blob an <img> can show, or throws an Error saying why it can't. Browsers other than
 *  Safari can't display TIFF, so those are decoded here and re-encoded as PNG. */
export async function prepareReferenceImage(file: File): Promise<Blob> {
  const isTiff = file.type === 'image/tiff' || /\.tiff?$/i.test(file.name)
  const blob = isTiff ? await tiffToPng(file) : file
  try {
    const bitmap = await createImageBitmap(blob)
    bitmap.close()
  } catch {
    throw new Error("the browser can't read this image format")
  }
  return blob
}

async function tiffToPng(file: File): Promise<Blob> {
  const UTIF = await import('utif2')
  const buffer = await file.arrayBuffer()
  const [ifd] = UTIF.decode(buffer)
  if (!ifd) throw new Error('the TIFF has no image in it')
  UTIF.decodeImage(buffer, ifd)
  const { width, height } = ifd
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error("couldn't convert the TIFF")
  ctx.putImageData(new ImageData(new Uint8ClampedArray(UTIF.toRGBA8(ifd)), width, height), 0, 0)
  return new Promise((resolve, reject) =>
    canvas.toBlob((png) => (png ? resolve(png) : reject(new Error("couldn't convert the TIFF"))), 'image/png'),
  )
}
