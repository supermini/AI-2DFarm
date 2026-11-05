// Settings → Accessibility: captions, colour-blind-safe status, UI scale and readability. Everything is saved in this
// browser (a11y.ts) and applies at once.
import { useId, type ReactNode } from 'react';
import { resetA11y, setA11y, useA11y } from './a11y';
import { DEFAULT_A11Y, LIMITS, showsShapes, type A11yPrefs } from './a11yPrefs';
import { KIND_ICON, KIND_WORD, kindStrong, PALETTE_LABELS, PALETTES, STATUS_KINDS, type Palette } from './statusLook';

function Toggle({ k, children, hint, disabled }: { k: 'captions' | 'statusShapes' | 'headBob' | 'cameraShake' | 'centerDot' | 'readableFont' | 'highContrast'; children: ReactNode; hint?: string; disabled?: boolean }) {
  const on = useA11y((s) => s.prefs[k]);
  const hintId = useId();
  return (
    <label className="toggle block">
      <input type="checkbox" checked={on || !!disabled} disabled={disabled} onChange={(e) => setA11y({ [k]: e.target.checked })} aria-describedby={hint ? hintId : undefined} />
      <span>
        <b>{children}</b>
        {hint && (
          <span className="muted small a11y-hint" id={hintId}>
            {' '}
            {hint}
          </span>
        )}
      </span>
    </label>
  );
}

function Slider({ k, label, unit, describe }: { k: 'captionSize' | 'captionBg' | 'fov' | 'uiScale'; label: string; unit: string; describe?: (v: number) => string }) {
  const v = useA11y((s) => s.prefs[k]);
  const { min, max, step } = LIMITS[k];
  return (
    <label className="a11y-slider">
      <span>{label}</span>
      <input type="range" min={min} max={max} step={step} value={v} aria-valuetext={`${v}${unit}${describe ? `, ${describe(v)}` : ''}`} onChange={(e) => setA11y({ [k]: Number(e.target.value) })} />
      <b>
        {v}
        {unit}
      </b>
      {v !== DEFAULT_A11Y[k] && (
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setA11y({ [k]: DEFAULT_A11Y[k] })} aria-label={`Reset ${label.toLowerCase()}`}>
          Reset
        </button>
      )}
    </label>
  );
}

/** Each kind of status as it looks now: its colour and shape, and its name. */
function Swatches({ palette, shapes }: { palette: Palette; shapes: boolean }) {
  return (
    <ul className="status-swatches" aria-label="How statuses look">
      {STATUS_KINDS.map((k) => (
        <li key={k} className={`status-kind status-kind-${k}`} style={{ ['--kind' as string]: kindStrong(k, palette) }}>
          {shapes && <span aria-hidden>{KIND_ICON[k]}</span>} {KIND_WORD[k]}
        </li>
      ))}
    </ul>
  );
}

export function AccessibilitySettings() {
  const prefs = useA11y((s) => s.prefs);
  const name = useId();
  const shapes = showsShapes(prefs);
  const set = (p: Partial<A11yPrefs>) => setA11y(p);
  return (
    <>
      <section className="card a11y-card" aria-labelledby={`${name}-cap`}>
        <h3 id={`${name}-cap`}>💬 Captions</h3>
        <Toggle k="captions" hint="The CEO's messages written out as they're read aloud, and short captions for important sounds (a merge chime, alarms).">
          Show captions
        </Toggle>
        <Slider k="captionSize" label="Caption size" unit="%" />
        <Slider k="captionBg" label="Caption background" unit="%" />
        <div className="captions captions-preview" aria-hidden style={{ ['--caption-scale' as string]: prefs.captionSize / 100, ['--caption-bg' as string]: prefs.captionBg / 100 }}>
          <div className="caption">[merge chime]</div>
          <div className="caption caption-speech">
            <b>CEO:</b> PR number 12 is ready to merge.
          </div>
        </div>
      </section>

      <section className="card a11y-card" aria-labelledby={`${name}-col`}>
        <h3 id={`${name}-col`}>🎨 Colour and status</h3>
        <fieldset className="a11y-fieldset">
          <legend>Status colours</legend>
          {PALETTES.map((p) => (
            <label key={p} className="toggle block">
              <input type="radio" name={`${name}-palette`} checked={prefs.palette === p} onChange={() => set({ palette: p })} /> {PALETTE_LABELS[p]}
            </label>
          ))}
        </fieldset>
        <Toggle k="statusShapes" disabled={prefs.palette !== 'standard'} hint={prefs.palette !== 'standard' ? 'Always on with a colour-blind palette.' : 'On Kanban cards, status pills and toasts.'}>
          Shapes beside status colours (✓ ✕ ! ⏳)
        </Toggle>
        <Swatches palette={prefs.palette} shapes={shapes} />
      </section>

      <section className="card a11y-card" aria-labelledby={`${name}-read`}>
        <h3 id={`${name}-read`}>🔎 Size and readability</h3>
        <Slider k="uiScale" label="UI scale" unit="%" />
        <p className="muted small">The HUD, the phone, the console and every panel, from 80% to 150%.</p>
        <Toggle k="readableFont" hint="Verdana, with wider letter, word and line spacing, as dyslexia style guides recommend.">
          Dyslexia-friendly font
        </Toggle>
        <Toggle k="highContrast" hint="Plain white panels, darker grey text, heavier borders and focus rings.">
          High-contrast panels
        </Toggle>
      </section>

      <div className="row">
        <button className="btn btn-ghost btn-small" onClick={resetA11y}>
          Reset accessibility settings
        </button>
      </div>
    </>
  );
}
