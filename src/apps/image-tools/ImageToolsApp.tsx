import { useCallback, useEffect, useRef, useState } from 'react'
import { rgbToHex, rgbToOklch } from './colorConversion'
import { toLuminanceGrayscale } from './imageProcessing'
import styles from './ImageToolsApp.module.css'

// Neighborhood averaged per click, as a distance from center (2 -> 5x5).
const SAMPLE_RADIUS = 2
// Chroma rarely exceeds ~0.32 for in-gamut sRGB colors; used to scale the chroma bar to 0-100%.
const MAX_CHROMA = 0.32

interface SampledColor {
  hex: string
  l: number
  c: number
  h: number
}

export function ImageToolsApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const originalImageData = useRef<ImageData | null>(null)
  const [hasImage, setHasImage] = useState(false)
  const [fileName, setFileName] = useState('image')
  const [isGrayscale, setIsGrayscale] = useState(false)
  const [sample, setSample] = useState<SampledColor | null>(null)
  const [isProcessing, setIsProcessing] = useState(false)

  const loadImageFile = useCallback(async (file: File) => {
    const bitmap = await createImageBitmap(file)
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    canvas.width = bitmap.width
    canvas.height = bitmap.height
    ctx.drawImage(bitmap, 0, 0)
    originalImageData.current = ctx.getImageData(0, 0, canvas.width, canvas.height)

    setFileName(file.name.replace(/\.[^.]+$/, '') || 'image')
    setIsGrayscale(false)
    setSample(null)
    setHasImage(true)
  }, [])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (file) await loadImageFile(file)
  }

  // Pasted images (e.g. a copied screenshot) arrive as clipboard data rather than a file input
  // change, so listen globally rather than requiring a specific element to be focused.
  useEffect(() => {
    function handlePaste(e: ClipboardEvent) {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'))
      const file = item?.getAsFile()
      if (!file) return

      e.preventDefault()
      void loadImageFile(file)
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [loadImageFile])

  function handleCanvasClick(e: React.MouseEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || isProcessing) return

    // The canvas's on-screen size is CSS-scaled (max-width: 100%), so map the click back to
    // actual pixel coordinates before reading.
    const rect = canvas.getBoundingClientRect()
    const px = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width))
    const py = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height))

    const x0 = Math.max(0, px - SAMPLE_RADIUS)
    const y0 = Math.max(0, py - SAMPLE_RADIUS)
    const x1 = Math.min(canvas.width, px + SAMPLE_RADIUS + 1)
    const y1 = Math.min(canvas.height, py + SAMPLE_RADIUS + 1)
    const { data } = ctx.getImageData(x0, y0, x1 - x0, y1 - y0)

    let r = 0
    let g = 0
    let b = 0
    const count = data.length / 4
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]
      g += data[i + 1]
      b += data[i + 2]
    }
    r = Math.round(r / count)
    g = Math.round(g / count)
    b = Math.round(b / count)

    setSample({ hex: rgbToHex(r, g, b), ...rgbToOklch(r, g, b) })
  }

  function handleGrayscale() {
    // toLuminanceGrayscale is synchronous and, on a large photo, slow enough to visibly freeze the
    // page — set the "processing" state first and defer the heavy work a tick so the spinner it
    // triggers actually gets painted before the main thread blocks.
    setIsProcessing(true)
    setTimeout(() => {
      const canvas = canvasRef.current
      const ctx = canvas?.getContext('2d')
      if (canvas && ctx) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        ctx.putImageData(toLuminanceGrayscale(imageData), 0, 0)
        setIsGrayscale(true)
      }
      setIsProcessing(false)
    }, 0)
  }

  function handleReset() {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx || !originalImageData.current) return

    ctx.putImageData(originalImageData.current, 0, 0)
    setIsGrayscale(false)
  }

  function handleSave() {
    const canvas = canvasRef.current
    if (!canvas) return

    canvas.toBlob((blob) => {
      if (!blob) return
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${fileName.trim() || 'image'}${isGrayscale ? '-grayscale' : ''}.png`
      link.click()
      URL.revokeObjectURL(url)
    }, 'image/png')
  }

  return (
    <div className={styles.app}>
      <div className={styles.actions}>
        <button type="button" onClick={() => fileInputRef.current?.click()} disabled={isProcessing}>
          {hasImage ? 'Load Image' : 'Choose Image'}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleUpload}
          className={styles.hiddenFileInput}
        />
        {hasImage && (
          <>
            <button type="button" onClick={handleGrayscale} disabled={isGrayscale || isProcessing}>
              Grayscale
            </button>
            <button type="button" onClick={handleReset} disabled={!isGrayscale || isProcessing}>
              Reset
            </button>
            <input
              type="text"
              value={fileName}
              onChange={(e) => setFileName(e.target.value)}
              placeholder="image"
              className={styles.fileNameInput}
            />
            <button type="button" onClick={handleSave} disabled={isProcessing}>
              Save
            </button>
          </>
        )}
      </div>
      <div className={styles.workspace}>
        <div className={styles.canvasArea}>
          {!hasImage && <p className={styles.placeholder}>Choose or paste an image to get started.</p>}
          <canvas
            ref={canvasRef}
            className={styles.canvas}
            style={{ display: hasImage ? 'block' : 'none' }}
            onClick={handleCanvasClick}
          />
          {isProcessing && (
            <div className={styles.spinnerOverlay}>
              <div className={styles.spinner} />
            </div>
          )}
        </div>
        {hasImage && (
          <div className={styles.samplePanel}>
            {sample ? (
              <SampleReadout sample={sample} />
            ) : (
              <p className={styles.placeholder}>Click the image to sample a color.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SampleReadout({ sample }: { sample: SampledColor }) {
  const chromaPercent = Math.round(Math.min(100, (sample.c / MAX_CHROMA) * 100))

  return (
    <>
      <div className={styles.swatch} style={{ backgroundColor: sample.hex }} />
      <dl className={styles.sampleReadout}>
        <dt>Hex</dt>
        <dd>{sample.hex}</dd>
        <dt>Lightness</dt>
        <dd>{Math.round(sample.l * 100)}%</dd>
        <dt>Chroma</dt>
        <dd>{sample.c.toFixed(3)}</dd>
        <dt>Hue</dt>
        <dd>{Math.round(sample.h)}°</dd>
      </dl>
      <div className={styles.chromaBarRow}>
        <div className={styles.chromaBar}>
          <div className={styles.chromaFill} style={{ '--chroma-percent': `${chromaPercent}%` } as React.CSSProperties} />
        </div>
        <span className={styles.chromaPercent}>{chromaPercent}%</span>
      </div>
    </>
  )
}
