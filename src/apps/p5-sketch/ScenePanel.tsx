import { useState } from 'react'
import { Dropdown } from '../pixel-art/Dropdown'
import { DialEditor } from './DialEditor'
import type { Driver, Scene, Shape, ShapeType } from './scene'
import type { LightKind } from './scene'
import { LIGHT_KINDS, MAX_CANVAS, MAX_REPEAT, MIN_CANVAS, SHAPE_LABELS, createShape, defaultLights, defaultProps, duplicateShape, is3D, isSceneObject, propSpecs } from './scene'
import { Slider } from './Slider'
import circleIcon from '../../assets/icons/circle.png'
import squareIcon from '../../assets/icons/square.png'
import lineIcon from '../../assets/icons/line.png'
import boxIcon from '../../assets/icons/box.png'
import sphereIcon from '../../assets/icons/sphere.png'
import cylinderIcon from '../../assets/icons/cylinder.png'
import coneIcon from '../../assets/icons/cone.png'
import torusIcon from '../../assets/icons/torus.png'
import ellipsoidIcon from '../../assets/icons/ellipsoid.png'
import planeIcon from '../../assets/icons/plane.png'
import cameraIcon from '../../assets/icons/camera.png'
import lightIcon from '../../assets/icons/light.png'
import kebabIcon from '../../assets/icons/kebab.png'
import styles from './P5SketchApp.module.css'

/** A setting's closed-row summary: its value now (a wave shows its center, a linear sweep its from and to, an expression its source) and which kind it is. */
function summarize(driver: Driver): { value: string; mode: string } {
  const round = (n: number) => String(Math.round(n * 1000) / 1000)
  if (driver.kind === 'const') return { value: round(driver.value), mode: 'Fixed' }
  if (driver.kind === 'wave') return { value: round(driver.center), mode: 'Wave' }
  if (driver.kind === 'linear') return { value: `${round(driver.from)} → ${round(driver.to)}`, mode: 'Linear' }
  return { value: driver.source, mode: 'Expr' }
}

/** The tool icon for each kind of layer. */
const ICONS: Record<ShapeType, string> = {
  circle: circleIcon,
  rect: squareIcon,
  line: lineIcon,
  box: boxIcon,
  sphere: sphereIcon,
  cylinder: cylinderIcon,
  cone: coneIcon,
  torus: torusIcon,
  ellipsoid: ellipsoidIcon,
  plane: planeIcon,
  camera: cameraIcon,
  light: lightIcon,
}

const SHAPE_TOOLS: { type: ShapeType; icon: string }[] = [
  { type: 'circle', icon: circleIcon },
  { type: 'rect', icon: squareIcon },
  { type: 'line', icon: lineIcon },
  { type: 'box', icon: boxIcon },
  { type: 'sphere', icon: sphereIcon },
  { type: 'cylinder', icon: cylinderIcon },
  { type: 'cone', icon: coneIcon },
  { type: 'torus', icon: torusIcon },
  { type: 'ellipsoid', icon: ellipsoidIcon },
  { type: 'plane', icon: planeIcon },
  { type: 'camera', icon: cameraIcon },
  { type: 'light', icon: lightIcon },
]

interface SceneToolsProps {
  scene: Scene
  onSelect: (id: number | null) => void
  onScene: (update: (scene: Scene) => Scene) => void
}

/** The add-a-shape tool column. Each tool adds its shape in the middle of the canvas, ready to be dragged or dialed in. */
export function SceneTools({ scene, onSelect, onScene }: SceneToolsProps) {
  const hasCamera = scene.shapes.some((shape) => shape.type === 'camera')

  function add(type: ShapeType) {
    const shape = createShape(type, scene.width / 2, scene.height / 2, scene.shapes, 'point')
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
          title={type === 'camera' && hasCamera ? 'The scene already has a camera' : `Add ${SHAPE_LABELS[type].toLowerCase()}`}
          disabled={type === 'camera' && hasCamera}
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
  /** Which setting's accordion row is open, as `layerId:key`. A different layer's id never matches, so switching layers closes it. */
  const [openSetting, setOpenSetting] = useState<string | null>(null)
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

  /** Each kind of light has different dials, so changing the type resets them (the color stays). */
  function changeLightKind(shape: Shape, kind: LightKind) {
    const labelOf = (k?: LightKind) => LIGHT_KINDS.find((entry) => entry.id === k)?.label ?? ''
    updateShape(shape.id, (current) => ({
      ...current,
      kind,
      // Follows the type in the name too, unless the name was changed by hand.
      name: current.name.startsWith(labelOf(current.kind)) ? current.name.replace(labelOf(current.kind), labelOf(kind)) : current.name,
      props: defaultProps('light', scene.width / 2, scene.height / 2, kind),
    }))
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
    <div className={styles.scenePanel}>
      <div className={styles.sceneTop}>
      <details open>
        <summary>Canvas</summary>
        <div className="ui-details-body">
          <label className="ui-field">
            <span className="ui-field-header">Mode</span>
            <select
              value={scene.mode}
              onChange={(e) => {
                const mode = e.target.value as Scene['mode']
                // A new 3D scene starts with a pair of lights, so shapes are shaded from the first.
                onScene((prev) => ({
                  ...prev,
                  mode,
                  shapes: mode === '3d' && !prev.shapes.some((shape) => shape.type === 'light') ? [...prev.shapes, ...defaultLights(prev)] : prev.shapes,
                }))
              }}
            >
              <option value="2d" disabled={has3DShapes}>
                2D
              </option>
              <option value="3d">3D</option>
            </select>
          </label>
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

      <ol
        className={styles.shapeList}
        aria-label="Layers, top first"
        // A layer row is 37px (with its hairline) and the border is 2px; an empty list keeps room for its note.
        style={{ '--list-min': `${Math.min(Math.max(scene.shapes.length, 2), 3) * 37 + 2}px` } as React.CSSProperties}
      >
        {scene.shapes.length === 0 && <li className={styles.layerEmpty}>No objects yet</li>}
        {[...scene.shapes].reverse().map((shape) => (
          <li key={shape.id} className={styles.layerRow} data-selected={shape.id === selectedId}>
            <button type="button" className={styles.layerMain} aria-current={shape.id === selectedId ? 'true' : undefined} onClick={() => onSelect(shape.id === selectedId ? null : shape.id)}>
              {/* A thumbnail: the layer's tool icon, in the layer's own color. */}
              <span className={styles.layerThumb} style={{ color: shape.type === 'camera' ? 'var(--foreground)' : shape.color }}>
                <span className="ui-icon" style={{ '--icon': `url(${ICONS[shape.type]})` } as React.CSSProperties} />
              </span>
              <span className={styles.layerName}>{shape.name}</span>
              {shape.repeat > 1 && <small className={styles.layerCount}>×{shape.repeat}</small>}
            </button>
            <Dropdown label={`${shape.name} actions`} icon={kebabIcon} align="right" floating>
              <button type="button" onClick={() => move(shape.id, 1)}>
                Move up
              </button>
              <button type="button" onClick={() => move(shape.id, -1)}>
                Move down
              </button>
              <button type="button" disabled={shape.type === 'camera'} title={shape.type === 'camera' ? 'A scene has one camera' : undefined} onClick={() => duplicate(shape)}>
                Duplicate
              </button>
              <button type="button" onClick={() => remove(shape.id)}>
                Delete
              </button>
            </Dropdown>
          </li>
        ))}
      </ol>
      </div>

      {selected && (
        <section className={styles.inspector} aria-label={`${selected.name} settings`}>
          {/* The header repeats the selected row's tint and icon, so the box reads as that layer's settings. */}
          <header className={styles.inspectorHeader}>
            <span className={styles.layerThumb} style={{ color: selected.type === 'camera' ? 'var(--foreground)' : selected.color }}>
              <span className="ui-icon" style={{ '--icon': `url(${ICONS[selected.type]})` } as React.CSSProperties} />
            </span>
            <span className="ui-group-label">{selected.type === 'light' ? LIGHT_KINDS.find((kind) => kind.id === selected.kind)?.label : SHAPE_LABELS[selected.type]} settings</span>
          </header>
          <div className={`ui-fields ${styles.inspectorBody}`}>
          <input className={styles.nameInput} value={selected.name} onChange={(e) => updateShape(selected.id, (s) => ({ ...s, name: e.target.value }))} aria-label="Layer name" />
          {selected.type === 'light' && (
            <label className="ui-field">
              <span className="ui-field-header">Type</span>
              <select value={selected.kind} onChange={(e) => changeLightKind(selected, e.target.value as LightKind)}>
                {LIGHT_KINDS.map(({ id, label }) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          {selected.type !== 'camera' && (
            <label className="ui-field">
              <span className="ui-field-header">Color</span>
              <input type="color" value={selected.color} onChange={(e) => updateShape(selected.id, (s) => ({ ...s, color: e.target.value }))} />
            </label>
          )}
          {selected.type !== 'line' && !isSceneObject(selected.type) && (
            <label className="ui-check">
              <input type="checkbox" checked={selected.outline} onChange={(e) => updateShape(selected.id, (s) => ({ ...s, outline: e.target.checked }))} />
              {is3D(selected.type) ? 'Wireframe' : 'Outline only'}
            </label>
          )}
          {!isSceneObject(selected.type) && (
            <Slider label="Copies" value={selected.repeat} min={1} max={32} step={1} onChange={(repeat) => updateShape(selected.id, (s) => ({ ...s, repeat: Math.min(MAX_REPEAT, Math.max(1, Math.round(repeat))) }))} />
          )}
          <div className={styles.settings}>
            {propSpecs(selected, scene).map((spec) => {
              const id = `${selected.id}:${spec.key}`
              const open = openSetting === id
              const { value, mode } = summarize(selected.props[spec.key])
              return (
                <details key={spec.key} className={styles.setting} open={open}>
                  <summary
                    onClick={(e) => {
                      e.preventDefault()
                      setOpenSetting(open ? null : id)
                    }}
                  >
                    <span className={styles.settingName}>{spec.label}</span>
                    <span className={styles.settingValue}>{value}</span>
                    <span className={styles.settingMode}>{mode}</span>
                  </summary>
                  {open && <DialEditor bare spec={spec} driver={selected.props[spec.key]} repeat={selected.repeat} onChange={(driver) => setProp(selected, spec.key, driver)} />}
                </details>
              )
            })}
          </div>
          </div>
        </section>
      )}
    </div>
  )
}
