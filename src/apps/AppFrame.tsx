import type { ReactNode, Ref } from 'react'
import styles from './AppFrame.module.css'

interface AppFrameProps {
  /** Toolbar along the top edge; items sit in a row and wrap. */
  top?: ReactNode
  /** Toolbar along the bottom edge. */
  bottom?: ReactNode
  /** Panel down the left edge. */
  left?: ReactNode
  /** Panel down the right edge. */
  right?: ReactNode
  /** Fixed width for the side panels; omit to size them to their content. */
  leftWidth?: string
  rightWidth?: string
  /** Floats over the center, outside its scroll area, anchored to the center's edges (e.g. a status panel). */
  overlay?: ReactNode
  /** Ref and extra class for the scrolling viewport that holds the children. */
  centerRef?: Ref<HTMLDivElement>
  centerClassName?: string
  className?: string
  /** The main content (usually a canvas). Centered in the middle area, which grows with the window and scrolls when the content is bigger. */
  children: ReactNode
}

/**
 * The shared app layout: toolbars on the top, bottom, left and right edges and a centered main area that
 * fills the rest of the window. Apps put their controls in the edge slots and their canvas in the middle.
 */
export function AppFrame({
  top,
  bottom,
  left,
  right,
  leftWidth,
  rightWidth,
  overlay,
  centerRef,
  centerClassName,
  className,
  children,
}: AppFrameProps) {
  return (
    <div className={className ? `${styles.frame} ${className}` : styles.frame}>
      {top && <div className={styles.top}>{top}</div>}
      <div className={styles.middle} data-no-top={top ? undefined : ''} data-no-bottom={bottom ? undefined : ''}>
        {left && (
          <div className={styles.left} style={leftWidth ? { width: leftWidth } : undefined}>
            {left}
          </div>
        )}
        <div className={styles.center}>
          <div
            className={centerClassName ? `${styles.viewport} ${centerClassName}` : styles.viewport}
            ref={centerRef}
            data-left={left ? '' : undefined}
            data-right={right ? '' : undefined}
          >
            {children}
          </div>
          {overlay}
        </div>
        {right && (
          <div className={styles.right} style={rightWidth ? { width: rightWidth } : undefined}>
            {right}
          </div>
        )}
      </div>
      {bottom && <div className={styles.bottom}>{bottom}</div>}
    </div>
  )
}
