import { useEffect, useRef } from 'react'
import type { PixelGrid, RGBA } from './pixelGrid'
import { gridToImageData } from './pixelGrid'
import styles from './PixelPreview.module.css'
import crtStyles from './crt.module.css'

interface PixelPreviewProps {
  grid: PixelGrid
  width: number
  height: number
  zoom: number
  /** Color shown through transparent pixels (the NES backdrop); omit to keep them transparent. */
  backdrop?: RGBA
  /** Presentation mode: shows the art with a CRT look. Display-only. */
  crt?: boolean
  /** Side length of the fixed frame the preview sits centered in, so its bounding box never changes as zoom/grid size change. */
  maxSize: number
}

/** Renders the grid at native resolution, scaled by an integer zoom factor so it previews the art at (a multiple of) its actual export size. */
export function PixelPreview({ grid, width, height, zoom, maxSize, backdrop, crt }: PixelPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    ctx.putImageData(gridToImageData(grid, backdrop), 0, 0)
  }, [grid, backdrop])

  return (
    <div className={styles.frame} style={{ '--frame-size': `${maxSize}px` } as React.CSSProperties}>
      <div className={styles.screen}>
        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className={crt ? `${styles.preview} ${crtStyles.image}` : styles.preview}
          style={
            {
              '--zoom-width': `${width * zoom}px`,
              '--zoom-height': `${height * zoom}px`,
            } as React.CSSProperties
          }
        />
        {crt && <div className={crtStyles.overlay} style={{ '--crt-line': `${zoom}px` } as React.CSSProperties} />}
      </div>
    </div>
  )
}
