// The look editor: a live 3D preview and the picks that style an agent. Apart from AgentSettings.tsx so the rest of
// an agent's setup can be used where there is no 3D scene.
import { useId, useMemo } from 'react';
import type { Agent } from '../store';
import { ACCENT_COLORS, BUILDS, FACIAL_HAIR, GLASSES, HAIR_COLORS, HAIR_STYLES, HEADWEAR, OUTFITS, SKIN_TONES, type AgentStyle, type HairStyle, type Outfit } from '../../../shared/looks';
import { TALL_HAIR, appearanceFor, randomStyle } from '../world/appearance';
import { LookPreview } from '../world/LookPreview';
import { save } from './AgentSettings';

const HAIR_LABEL: Record<HairStyle, string> = {
  crop: 'Short crop',
  long: 'Long',
  ponytail: 'Ponytail',
  bun: 'Bun',
  quiff: 'Quiff',
  afro: 'Afro',
  sidePart: 'Side part',
  buzz: 'Buzz cut',
  bald: 'Bald',
  curls: 'Curls',
  bob: 'Bob',
  mohawk: 'Mohawk',
  locs: 'Locs',
};
const OUTFIT_LABEL: Record<Outfit, string> = { tee: 'T-shirt', hoodie: 'Hoodie', stripe: 'Striped tee', sweater: 'Sweater', cardigan: 'Cardigan', turtleneck: 'Turtleneck' };
const capital = (s: string) => s[0].toUpperCase() + s.slice(1);

function Swatches({ label, colors, value, onPick }: { label: string; colors: readonly string[]; value: string; onPick: (c: string) => void }) {
  const all = colors.includes(value) ? colors : [value, ...colors];
  return (
    <div className="field">
      <span>{label}</span>
      <div className="swatches" role="radiogroup" aria-label={label}>
        {all.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={c === value} aria-label={c} title={c} className={`swatch ${c === value ? 'swatch-on' : ''}`} style={{ background: c }} onClick={() => onPick(c)} />
        ))}
      </div>
    </div>
  );
}

function PickSelect<T extends string>({ label, value, options, labels, onPick, disabled, title }: { label: string; value: T; options: readonly T[]; labels?: Record<T, string>; onPick: (v: T) => void; disabled?: boolean; title?: string }) {
  const id = useId();
  return (
    <label className="field" htmlFor={id}>
      <span>{label}</span>
      <select id={id} value={value} disabled={disabled} title={title} onChange={(e) => onPick(e.target.value as T)}>
        {options.map((o) => (
          <option key={o} value={o}>
            {labels?.[o] ?? capital(o)}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * How they're drawn: a live 3D preview and the picks, each saved straight onto the agent (agent.style), over the
 * look seeded from their id. Their character in the office follows at once.
 */
export function LookEditor({ agent }: { agent: Agent }) {
  const look = useMemo(() => appearanceFor(agent), [agent]);
  const pick = (patch: AgentStyle) => void save(agent.id, { style: { ...agent.style, ...patch } });
  const tall = TALL_HAIR.includes(look.hair);
  return (
    <fieldset className="look-editor">
      <legend>Look</legend>
      <div className="look-body">
        <LookPreview id={agent.id} label={`${agent.name} as they'll look`} />
        <div className="look-fields">
          <PickSelect label="Hair" value={look.hair} options={HAIR_STYLES} labels={HAIR_LABEL} onPick={(hair) => pick({ hair })} />
          <PickSelect label="Facial hair" value={look.facialHair} options={FACIAL_HAIR} onPick={(facialHair) => pick({ facialHair })} />
          <PickSelect label="Glasses" value={look.glasses} options={GLASSES} onPick={(glasses) => pick({ glasses })} />
          <PickSelect
            label="Headwear"
            value={look.headwear}
            options={HEADWEAR}
            disabled={tall}
            title={tall ? `A hat doesn't fit over ${HAIR_LABEL[look.hair].toLowerCase()} hair` : undefined}
            onPick={(headwear) => pick({ headwear })}
          />
          {agent.role === 'ceo' ? (
            <div className="field">
              <span>Outfit</span>
              <span className="muted small">Blazer and lanyard (uniform)</span>
            </div>
          ) : (
            <PickSelect label="Outfit" value={look.outfit} options={OUTFITS} labels={OUTFIT_LABEL} onPick={(outfit) => pick({ outfit })} />
          )}
          <PickSelect label="Build" value={look.build} options={BUILDS} onPick={(build) => pick({ build })} />
          <Swatches label="Hair colour" colors={HAIR_COLORS} value={look.hairColor} onPick={(hairColor) => pick({ hairColor })} />
          <Swatches label="Skin tone" colors={SKIN_TONES} value={look.skin} onPick={(skin) => pick({ skin })} />
          <Swatches label="Accent colour" colors={ACCENT_COLORS} value={ACCENT_COLORS[look.accent]} onPick={(c) => pick({ accent: ACCENT_COLORS.indexOf(c as (typeof ACCENT_COLORS)[number]) })} />
        </div>
      </div>
      <div className="row wrap">
        <button type="button" className="btn btn-small" onClick={() => void save(agent.id, { style: randomStyle(agent) })}>
          🎲 Shuffle
        </button>
        <button type="button" className="btn btn-small btn-ghost" disabled={!agent.style} onClick={() => void save(agent.id, { style: null })}>
          ↺ Back to their seeded look
        </button>
        <span className="muted small">Accent: glasses frames, hats and the stripe.</span>
      </div>
    </fieldset>
  );
}
