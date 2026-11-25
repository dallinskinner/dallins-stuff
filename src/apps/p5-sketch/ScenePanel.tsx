import { DialEditor } from './DialEditor'
import type { Driver, Scene, Shape, ShapeType } from './scene'
import { MAX_CANVAS, MAX_REPEAT, MIN_CANVAS, SHAPE_LABELS, createShape, duplicateShape, is3D, propSpecs } from './scene'
import { Slider } from './Slider'
import circleIcon from '../../assets/icons/circle.png'
import squareIcon from '../../assets/icons/square.png'
import lineIcon from '../../assets/icons/line.png'
import boxIcon from '../../assets/icons/box.png'
import sphereIcon from '../../assets/icons/sphere.png'
import styles from './P5SketchApp.module.css'

const SHAPE_TOOLS: { type: ShapeType; icon: string }[] = [
  { type: 'circle', icon: circleIcon },
  { type: 'rect', icon: squareIcon },
  { type: 'line', icon: lineIcon },
  { type: 'box', icon: boxIcon },
  { type: 'sphere', icon: sphereIcon },
]

interface SceneToolsProps {
  scene: Scene
  onSelect: (id: number | null) => void
  onScene: (update: (scene: Scene) => Scene) => void
}

/** The add-a-shape tool column. Each tool adds its shape in the middle of the canvas, ready to be dragged or dialed in. */
export function SceneTools({ scene, onSelect, onScene }: SceneToolsProps) {
  function add(type: ShapeType) {
    const shape = createShape(type, scene.width / 2, scene.height / 2, scene.shapes)
    onScene((prev) => ({ ...prev, shapes: [...prev.shapes, shape] }))
    onSelect(shape.id)
  }

  return (
    <div className={styles.tools} role="group" aria-label="Add shape">
      {SHAPE_TOOLS.filter(({ type }) => scene.mode === '3d' || !is3D(type)).map(({ type, icon }) => (
        <button
          key={type}
          type="button"
          data-variant="tool"
          aria-label={`Add ${SHAPE_LABELS[type].toLowerCase()}`}
          title={`Add ${SHAPE_LABELS[type].toLowerCase()}`}
          onClick={() => add(type)}
        >
          <span className="ui-icon" style={{ '--icon': `url(${icon})` } as React.CSSProperties} />
        </button>
      ))}
    </div>
  )
}

interface ScenePanelProps {
  scene: Scene
  selectedId: number | null
  onSelect: (id: number | null) => void
  onScene: (update: (scene: Scene) => Scene) => void
}

export function ScenePanel({ scene, selectedId, onSelect, onScene }: ScenePanelProps) {
  const selected = scene.shapes.find((shape) => shape.id === selectedId) ?? null

  const updateShape = (id: number, change: (shape: Shape) => Shape) =>
    onScene((prev) => ({ ...prev, shapes: prev.shapes.map((shape) => (shape.id === id ? change(shape) : shape)) }))

  const setProp = (shape: Shape, key: string, driver: Driver) =>
    updateShape(shape.id, (current) => ({ ...current, props: { ...current.props, [key]: driver } }))

  function move(id: number, direction: -1 | 1) {
    onScene((prev) => {
      const index = prev.shapes.findIndex((shape) => shape.id === id)
      const target = index + direction
      if (index < 0 || target < 0 || target >= prev.shapes.length) return prev
      const shapes = [...prev.shapes]
      ;[shapes[index], shapes[target]] = [shapes[target], shapes[index]]
      return { ...prev, shapes }
    })
  }

  function duplicate(shape: Shape) {
    const copy = duplicateShape(shape)
    onScene((prev) => {
      const index = prev.shapes.findIndex((s) => s.id === shape.id)
      const shapes = [...prev.shapes]
      shapes.splice(index + 1, 0, copy)
      return { ...prev, shapes }
    })
    onSelect(copy.id)
  }

  function remove(id: number) {
    onScene((prev) => ({ ...prev, shapes: prev.shapes.filter((shape) => shape.id !== id) }))
    if (selectedId === id) onSelect(null)
  }

  /** A 2D scene can't draw 3D shapes, so the mode is locked to 3D while any exist. */
  const has3DShapes = scene.shapes.some((shape) => is3D(shape.type))

  const canvasSize = (key: 'width' | 'height', value: number) =>
    onScene((prev) => ({ ...prev, [key]: Math.min(MAX_CANVAS, Math.max(MIN_CANVAS, Math.round(value))) }))

  return (
    <div className={styles.panel}>
      <details>
        <summary>Canvas</summary>
        <div className="ui-details-body">
          <label className="ui-field">
            <span className="ui-field-header">Mode</span>
            <select value={scene.mode} onChange={(e) => onScene((prev) => ({ ...prev, mode: e.target.value as Scene['mode'] }))}>
              <option value="2d" disabled={has3DShapes}>
                2D
              </option>
              <option value="3d">3D</option>
            </select>
          </label>
          {scene.mode === '3d' && (
            <label className="ui-check">
              <input type="checkbox" checked={scene.lights} onChange={(e) => onScene((prev) => ({ ...prev, lights: e.target.checked }))} />
              Lights
            </label>
          )}
          <label className="ui-field">
            <span className="ui-field-header">Size</span>
            <span className={styles.sizeInputs}>
              <input type="number" min={MIN_CANVAS} max={MAX_CANVAS} value={scene.width} onChange={(e) => e.target.value !== '' && canvasSize('width', Number(e.target.value))} aria-label="Canvas width" />
              ×
              <input type="number" min={MIN_CANVAS} max={MAX_CANVAS} value={scene.height} onChange={(e) => e.target.value !== '' && canvasSize('height', Number(e.target.value))} aria-label="Canvas height" />
            </span>
          </label>
          <label className="ui-field">
            <span className="ui-field-header">Background</span>
            <input type="color" value={scene.background} onChange={(e) => onScene((prev) => ({ ...prev, background: e.target.value }))} />
          </label>
          <Slider label="Loop (s)" value={scene.loop} min={1} max={30} step={0.5} onChange={(loop) => onScene((prev) => ({ ...prev, loop: Math.max(0.5, loop) }))} />
        </div>
      </details>

      <ol className={styles.shapeList} aria-label="Shapes, bottom to top">
        {[...scene.shapes].reverse().map((shape) => (
          <li key={shape.id}>
            <button type="button" className={styles.shapeName} aria-pressed={shape.id === selectedId} onClick={() => onSelect(shape.id === selectedId ? null : shape.id)}>
              <span className={styles.chip} style={{ '--color': shape.color } as React.CSSProperties} />
              {shape.name}
              {shape.repeat > 1 && <small> ×{shape.repeat}</small>}
            </button>
            <button type="button" onClick={() => move(shape.id, 1)} aria-label={`Move ${shape.name} up`} title="Move up">
              ↑
            </button>
            <button type="button" onClick={() => move(shape.id, -1)} aria-label={`Move ${shape.name} down`} title="Move down">
              ↓
            </button>
            <button type="button" onClick={() => duplicate(shape)} aria-label={`Duplicate ${shape.name}`} title="Duplicate">
              ⧉
            </button>
            <button type="button" onClick={() => remove(shape.id)} aria-label={`Delete ${shape.name}`} title="Delete">
              ×
            </button>
          </li>
        ))}
      </ol>

      {selected && (
        <div className={`ui-fields ${styles.inspector}`}>
          <input className={styles.nameInput} value={selected.name} onChange={(e) => updateShape(selected.id, (s) => ({ ...s, name: e.target.value }))} aria-label="Shape name" />
          <label className="ui-field">
            <span className="ui-field-header">Color</span>
            <input type="color" value={selected.color} onChange={(e) => updateShape(selected.id, (s) => ({ ...s, color: e.target.value }))} />
          </label>
          {selected.type !== 'line' && (
            <label className="ui-check">
              <input type="checkbox" checked={selected.outline} onChange={(e) => updateShape(selected.id, (s) => ({ ...s, outline: e.target.checked }))} />
              {is3D(selected.type) ? 'Wireframe' : 'Outline only'}
            </label>
          )}
          <Slider label="Copies" value={selected.repeat} min={1} max={32} step={1} onChange={(repeat) => updateShape(selected.id, (s) => ({ ...s, repeat: Math.min(MAX_REPEAT, Math.max(1, Math.round(repeat))) }))} />
          {propSpecs(selected, scene).map((spec) => (
            <DialEditor key={spec.key} spec={spec} driver={selected.props[spec.key]} repeat={selected.repeat} onChange={(driver) => setProp(selected, spec.key, driver)} />
          ))}
        </div>
      )}
    </div>
  )
}
