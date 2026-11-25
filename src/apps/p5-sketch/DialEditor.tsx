import { validateExpression } from './codegen'
import type { Driver, DriverKind, Ease, PropSpec, Wave } from './scene'
import { EASES, WAVES, convertDriver } from './scene'
import { Slider } from './Slider'
import styles from './P5SketchApp.module.css'

const KINDS: { id: DriverKind; label: string }[] = [
  { id: 'const', label: 'Fixed' },
  { id: 'wave', label: 'Wave' },
  { id: 'linear', label: 'Linear' },
  { id: 'expr', label: 'Expr' },
]

interface DialEditorProps {
  spec: PropSpec
  driver: Driver
  /** Copies of the shape; per-copy dials only show when there's more than one. */
  repeat: number
  onChange: (driver: Driver) => void
  /** Drop the title and box, for use inside an accordion row that already names the setting. */
  bare?: boolean
}

/** One property's dial: fixed value, wave (center/amp/cycles/phase), or a typed expression. */
export function DialEditor({ spec, driver, repeat, onChange, bare = false }: DialEditorProps) {
  const range = spec.max - spec.min
  const perCopyRange = range / 2

  return (
    <div className={`ui-fields ${styles.dial}`} data-bare={bare ? '' : undefined}>
      <div className={styles.dialHeader}>
        {!bare && <strong>{spec.label}</strong>}
        <div className={styles.kinds} role="group" aria-label={`${spec.label} mode`}>
          {KINDS.map(({ id, label }) => (
            <button key={id} type="button" data-size="sm" aria-pressed={driver.kind === id} onClick={() => onChange(convertDriver(driver, id, spec))}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {driver.kind === 'const' && (
        <>
          <Slider label="Value" value={driver.value} min={spec.min} max={spec.max} step={spec.step} onChange={(value) => onChange({ ...driver, value })} />
          {repeat > 1 && (
            <Slider label="Per copy" value={driver.step} min={-perCopyRange} max={perCopyRange} step={spec.step} onChange={(step) => onChange({ ...driver, step })} />
          )}
        </>
      )}

      {driver.kind === 'wave' && (
        <>
          <label className="ui-field">
            <span className="ui-field-header">Wave</span>
            <select value={driver.wave} onChange={(e) => onChange({ ...driver, wave: e.target.value as Wave })}>
              {WAVES.map((wave) => (
                <option key={wave} value={wave}>
                  {wave}
                </option>
              ))}
            </select>
          </label>
          <label className="ui-field">
            <span className="ui-field-header">Easing</span>
            <select value={driver.ease} onChange={(e) => onChange({ ...driver, ease: e.target.value as Ease })}>
              {EASES.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Slider label="Center" value={driver.center} min={spec.min} max={spec.max} step={spec.step} onChange={(center) => onChange({ ...driver, center })} />
          <Slider label="Amount" value={driver.amp} min={0} max={range} step={spec.step} onChange={(amp) => onChange({ ...driver, amp })} />
          <Slider label="Cycles" value={driver.cycles} min={0} max={16} step={1} onChange={(cycles) => onChange({ ...driver, cycles })} />
          <Slider label="Phase" value={driver.phase} min={0} max={1} step={0.01} onChange={(phase) => onChange({ ...driver, phase })} />
          {repeat > 1 && (
            <>
              <Slider label="Phase/copy" value={driver.phaseStep} min={-1} max={1} step={0.01} onChange={(phaseStep) => onChange({ ...driver, phaseStep })} />
              <Slider label="Offset/copy" value={driver.step} min={-perCopyRange} max={perCopyRange} step={spec.step} onChange={(step) => onChange({ ...driver, step })} />
            </>
          )}
        </>
      )}

      {driver.kind === 'linear' && (
        <>
          <Slider label="From" value={driver.from} min={spec.min} max={spec.max} step={spec.step} onChange={(from) => onChange({ ...driver, from })} />
          <Slider label="To" value={driver.to} min={spec.min} max={spec.max} step={spec.step} onChange={(to) => onChange({ ...driver, to })} />
          <label className="ui-field">
            <span className="ui-field-header">Easing</span>
            <select value={driver.ease} onChange={(e) => onChange({ ...driver, ease: e.target.value as Ease })}>
              {EASES.map(({ id, label }) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Slider label="Sweeps per loop" value={driver.cycles} min={0} max={16} step={1} onChange={(cycles) => onChange({ ...driver, cycles })} />
          <Slider label="Phase" value={driver.phase} min={0} max={1} step={0.01} onChange={(phase) => onChange({ ...driver, phase })} />
          {repeat > 1 && (
            <>
              <Slider label="Phase/copy" value={driver.phaseStep} min={-1} max={1} step={0.01} onChange={(phaseStep) => onChange({ ...driver, phaseStep })} />
              <Slider label="Offset/copy" value={driver.step} min={-perCopyRange} max={perCopyRange} step={spec.step} onChange={(step) => onChange({ ...driver, step })} />
            </>
          )}
        </>
      )}

      {driver.kind === 'expr' && <ExpressionInput source={driver.source} onChange={(source) => onChange({ kind: 'expr', source })} />}
    </div>
  )
}

function ExpressionInput({ source, onChange }: { source: string; onChange: (source: string) => void }) {
  const error = validateExpression(source)
  return (
    <>
      <input
        value={source}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder="sin(TWO_PI * p) * 100 + width / 2"
        aria-label="Expression"
      />
      {error ? (
        <p className={styles.dialError}>{error}</p>
      ) : (
        <p className={styles.dialHint}>
          Uses <code>t</code> seconds, <code>p</code> 0&ndash;1 through the loop, <code>i</code> of <code>n</code> copies.
        </p>
      )}
    </>
  )
}
