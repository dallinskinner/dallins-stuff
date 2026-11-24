import { useState, type CSSProperties, type ReactNode } from 'react'
import { useDialKit } from 'dialkit'
import styles from './UiComponentsApp.module.css'
import pencilIcon from '../assets/icons/pencil.png'
import eraserIcon from '../assets/icons/eraser.png'
import selectIcon from '../assets/icons/select.png'
import wandIcon from '../assets/icons/wand.png'
import fillIcon from '../assets/icons/fill.png'
import lineIcon from '../assets/icons/line.png'

const TOOLS = [
  { label: 'Select', icon: selectIcon },
  { label: 'Wand', icon: wandIcon },
  { label: 'Pencil', icon: pencilIcon },
  { label: 'Eraser', icon: eraserIcon },
  { label: 'Line', icon: lineIcon },
  { label: 'Fill', icon: fillIcon },
]

function ToolIcon({ src }: { src: string }) {
  return <span className="ui-icon" style={{ '--icon': `url(${src})` } as CSSProperties} />
}

function Row({ name, source, children }: { name: string; source: string; children: ReactNode }) {
  return (
    <div className={styles.row}>
      <div className={styles.sample}>{children}</div>
      <div className={styles.meta}>
        <strong>{name}</strong>
        {source}
      </div>
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
      {hint && <p className={styles.subTitle}>{hint}</p>}
      <div>{children}</div>
    </div>
  )
}

export function UiComponentsApp() {
  const tokens = useDialKit(
    'UI Components',
    {
      height: [32, 20, 44, 1],
      padX: [8, 2, 24, 1],
      radius: [4, 0, 16, 1],
      borderWidth: [1, 0, 3, 1],
      fontSize: [14, 11, 18, 1],
      labelSize: [12, 10, 16, 1],
      mono: true,
      border: '#444444',
      surface: '#262626',
      track: [4, 2, 10, 1],
      thumb: [12, 8, 24, 1],
      fieldGap: [16, 4, 32, 1],
      labelGap: [8, 0, 16, 1],
    },
    { defaultCollapsed: false },
  )

  const [slider, setSlider] = useState(40)
  const [pressed, setPressed] = useState(true)
  const [checked, setChecked] = useState(true)
  const [tool, setTool] = useState(0)

  const rootStyle = {
    '--ui-height': `${tokens.height}px`,
    '--ui-pad-x': `${tokens.padX}px`,
    '--ui-radius': `${tokens.radius}px`,
    '--ui-border-width': `${tokens.borderWidth}px`,
    '--ui-font-size': `${tokens.fontSize}px`,
    '--ui-label-size': `${tokens.labelSize}px`,
    '--ui-font-variation': tokens.mono ? `'MONO' 100, 'DRKM' var(--font-drkm)` : `'DRKM' var(--font-drkm)`,
    '--ui-border': tokens.border,
    '--ui-surface': tokens.surface,
    '--ui-track': `${tokens.track}px`,
    '--ui-thumb': `${tokens.thumb}px`,
    '--ui-field-gap': `${tokens.fieldGap}px`,
    '--ui-label-gap': `${tokens.labelGap}px`,
  } as CSSProperties

  return (
    <div className={styles.root} style={rootStyle}>
      <p className={styles.lead}>
        The UI standard, from <code>src/ui.css</code>. Every control in the app gets this look automatically;
        the dial panel tunes its tokens live, so nothing here is a copy. Variants are data attributes
        (<code>data-variant</code>, <code>data-size</code>, <code>aria-pressed</code>), and fields use the
        <code>ui-field</code> and <code>ui-fields</code> classes.
      </p>

      <Section title="Proposed standard" hint="Tweak the dials; everything here redraws. Styled by src/ui.css, which applies globally.">
        <div>
          <Row name="Button" source="default / primary / solid / disabled">
            <button>Default</button>
            <button data-variant="primary">Primary</button>
            <button data-variant="solid">Solid</button>
            <button disabled>Disabled</button>
          </Row>
          <Row name="Button — small / icon / toggle" source="aria-pressed toggles fill solid when active">
            <button data-size="sm">Small</button>
            <button data-size="icon" aria-label="Add">+</button>
            <button aria-pressed={pressed} onClick={() => setPressed((p) => !p)}>
              Toggle
            </button>
          </Row>
          <Row name="Button — tool" source="square, content surface; same solid active state as any toggle (from Pixel Art `.toolButton`)">
            {TOOLS.map((t, i) => (
              <button
                key={t.label}
                data-variant="tool"
                aria-label={t.label}
                title={t.label}
                aria-pressed={tool === i}
                onClick={() => setTool(i)}
              >
                <ToolIcon src={t.icon} />
              </button>
            ))}
          </Row>
          <Row name="Button — color" source="input type=color: the color fills the whole button, edge to edge">
            <input type="color" defaultValue="#5b8def" aria-label="Color" />
            <input type="color" defaultValue="#000000" aria-label="Black" />
            <input type="color" defaultValue="#ffffff" aria-label="White" />
            <input type="color" defaultValue="#c45fb8" disabled aria-label="Disabled" />
          </Row>
          <Row name="Swatch — removable" source="color button + round × badge (Image Tools, Dither, Color Palette)">
            {['#5b8def', '#c45fb8', '#e0a43a'].map((c) => (
              <span key={c} className="ui-swatch">
                <input type="color" defaultValue={c} aria-label={`Color ${c}`} />
                <button type="button" className="ui-swatch-remove" aria-label={`Remove ${c}`}>×</button>
              </span>
            ))}
          </Row>
          <Row name="Select" source="">
            <select defaultValue="b">
              <option value="a">Option A</option>
              <option value="b">Option B</option>
            </select>
            <select disabled>
              <option>Disabled</option>
            </select>
          </Row>
          <Row name="Select — with optgroups" source="grouped options">
            <select defaultValue="nes">
              <optgroup label="Nintendo">
                <option value="nes">NES</option>
                <option value="snes">SNES</option>
                <option value="gb">Game Boy</option>
              </optgroup>
              <optgroup label="Sega">
                <option value="sms">Master System</option>
                <option value="gen">Genesis</option>
              </optgroup>
              <optgroup label="Other">
                <option value="c64">Commodore 64</option>
              </optgroup>
            </select>
          </Row>
          <Row name="Text / number input" source="">
            <input type="text" defaultValue="Some text" />
            <input type="number" defaultValue={12} />
          </Row>
          <Row name="Slider" source="label + readout in a header row, track below (from Dither / Screen Flavor `.field`)">
            <label className={`ui-field ${styles.fieldWidth}`}>
              <span className="ui-field-header">
                Amount
                <output>{slider}</output>
              </span>
              <input type="range" min={0} max={100} value={slider} onChange={(e) => setSlider(Number(e.target.value))} />
            </label>
          </Row>
          <Row name="Slider — typed value" source="editable number box in place of the readout (p5)">
            <label className={`ui-field ${styles.fieldWidth}`}>
              <span className="ui-field-header">
                Amount
                <input type="number" value={slider} onChange={(e) => setSlider(Number(e.target.value))} aria-label="Amount value" />
              </span>
              <input type="range" min={0} max={100} value={slider} onChange={(e) => setSlider(Number(e.target.value))} />
            </label>
          </Row>
          <Row name="Slider — stacked" source="`.ui-fields` spaces adjacent fields (--ui-field-gap) wider than the label-to-track gap">
            <div className={`ui-fields ${styles.fieldWidth}`}>
              {['Hue', 'Lightness', 'Chroma'].map((label) => (
                <label key={label} className="ui-field">
                  <span className="ui-field-header">
                    {label}
                    <output>{slider}</output>
                  </span>
                  <input type="range" min={0} max={100} value={slider} onChange={(e) => setSlider(Number(e.target.value))} />
                </label>
              ))}
            </div>
          </Row>
          <Row name="Labeled fields" source="label above any control: input, number, select, slider — spaced by --ui-label-gap / --ui-field-gap">
            <div className={`ui-fields ${styles.fieldWidth}`}>
              <label className="ui-field">
                <span className="ui-field-header">Name</span>
                <input type="text" defaultValue="Some text" />
              </label>
              <label className="ui-field">
                <span className="ui-field-header">Size</span>
                <input type="number" defaultValue={12} />
              </label>
              <label className="ui-field">
                <span className="ui-field-header">Algorithm</span>
                <select defaultValue="bayer">
                  <option value="bayer">Bayer 4×4</option>
                  <option value="noise">Blue noise</option>
                </select>
              </label>
              <label className="ui-field">
                <span className="ui-field-header">
                  Strength
                  <output>{slider}</output>
                </span>
                <input type="range" min={0} max={100} value={slider} onChange={(e) => setSlider(Number(e.target.value))} />
              </label>
              <label className="ui-field">
                <span className="ui-field-header">Notes</span>
                <input type="text" placeholder="Placeholder text" />
              </label>
            </div>
          </Row>
          <Row name="Checkbox" source="">
            <label className="ui-check">
              <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} />
              Show grid
            </label>
          </Row>
          <Row name="Disclosure" source="details / summary">
            <details className={styles.fieldWidth} open>
              <summary>Canvas</summary>
              <div className="ui-details-body">
                <label className="ui-field">
                  <span className="ui-field-header">
                    Width
                    <output>{slider}</output>
                  </span>
                  <input type="range" min={0} max={100} value={slider} onChange={(e) => setSlider(Number(e.target.value))} />
                </label>
              </div>
            </details>
          </Row>
        </div>
      </Section>
    </div>
  )
}
