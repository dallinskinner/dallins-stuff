interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
}

/** A standard slider field whose readout is an editable number, so values outside the slider's range can still be typed in. */
export function Slider({ label, value, min, max, step, onChange }: SliderProps) {
  return (
    <label className="ui-field">
      <span className="ui-field-header">
        {label}
        <input
          type="number"
          step={step}
          value={Math.round(value * 1000) / 1000}
          onChange={(e) => e.target.value !== '' && onChange(Number(e.target.value))}
          aria-label={`${label} value`}
        />
      </span>
      <input type="range" min={min} max={max} step={step} value={Math.min(max, Math.max(min, value))} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  )
}
