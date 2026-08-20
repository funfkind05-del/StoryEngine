// Outline-from-play: review the beats mined from everything played
// since the last outline, pick which become scene stubs (with correct
// sim headers and [OUTLINE] fact blocks), optionally have the LLM
// shape the chapter, and export the outline as text.

import { useMemo, useState } from 'react';
import { useStore } from '../state/store';
import { buildOutline, outlineToText, shapeOutline, type OutlineBeat } from '../engine/outline';
import { downloadFile } from '../engine/compile';
import { loadLlmConfig } from '../engine/npcChat';
import { fmtTime } from '../engine/world';
import { Tag } from './common';

const TYPE_TONE: Record<OutlineBeat['sceneType'], 'red' | 'gold' | 'green' | undefined> = {
  action: 'red',
  dialogue: 'gold',
  exploration: 'gold',
  domestic: 'green',
  business: undefined,
  transition: undefined,
};

export function OutlineModal({ onClose }: { onClose: () => void }) {
  const world = useStore((s) => s.world);
  const outlineCreateScenes = useStore((s) => s.outlineCreateScenes);
  const outlineMarkDone = useStore((s) => s.outlineMarkDone);
  const setToast = useStore((s) => s.setToast);
  const beats = useMemo(() => buildOutline(world), [world]);
  const [checked, setChecked] = useState<boolean[]>(() => beats.map(() => true));
  const [chapter, setChapter] = useState(world.chapter);
  const [shaped, setShaped] = useState<string | null>(null);
  const [shaping, setShaping] = useState(false);

  const chosen = beats.filter((_, i) => checked[i] ?? true);

  const shape = async () => {
    setShaping(true);
    try {
      setShaped(await shapeOutline(loadLlmConfig(), world, chosen, chapter));
    } catch (e) {
      setToast(`Shaping failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setShaping(false);
    }
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: 'min(720px, 94vw)' }}>
        <div className="modal-head">
          🗺 Outline from play
          <span className="dim small">{beats.length} beat{beats.length === 1 ? '' : 's'} since the last outline</span>
          <span className="grow" />
          <label className="dim small">Chapter <input type="number" value={chapter} style={{ width: 54 }} onChange={(e) => setChapter(Math.max(1, parseInt(e.target.value || '1', 10)))} /></label>
        </div>
        <div className="modal-body">
          {beats.length === 0 && (
            <p className="dim">Nothing new to outline — go play. Travel, crawl, fight, talk; everything you do is logged, and this tool cuts it into scenes afterward.</p>
          )}
          {beats.map((b, i) => (
            <div key={i} className="card">
              <label className="row" style={{ cursor: 'pointer', flexWrap: 'nowrap' }}>
                <input type="checkbox" checked={checked[i] ?? true} onChange={(e) => { const c = [...checked]; c[i] = e.target.checked; setChecked(c); }} />
                <span className="name grow">{i + 1}. {b.title}</span>
                <Tag tone={TYPE_TONE[b.sceneType]}>{b.sceneType}</Tag>
                <span className="mono dim">Day {b.day} · {fmtTime({ day: b.day, minute: b.startMinute })}</span>
              </label>
              <p className="small dim" style={{ margin: '2px 0 4px 22px' }}>
                {world.locations[b.location]?.name ?? b.location} · {b.participants.map((p) => world.characters[p]?.name).filter(Boolean).join(', ')}
              </p>
              <div style={{ marginLeft: 22 }}>
                {b.bullets.slice(0, 6).map((x, j) => <p key={j} className="small">• {x}</p>)}
                {b.bullets.length > 6 && <p className="small dim">…and {b.bullets.length - 6} more</p>}
                {b.carryForward.length > 0 && <p className="small" style={{ color: 'var(--accent)' }}>Leaves open: {b.carryForward.join(' · ')}</p>}
              </div>
            </div>
          ))}
          {shaped && <div className="sugg-text" style={{ margin: '8px 0' }}>{shaped}</div>}
          {beats.length > 0 && (
            <div className="row" style={{ marginTop: 8 }}>
              <button
                className="primary"
                disabled={!chosen.length}
                onClick={() => {
                  const made = outlineCreateScenes(chosen, chapter);
                  setToast(`${made} scene stub${made === 1 ? '' : 's'} created in Chapter ${chapter} — each carries its sim header and beat facts. Draft Scene will pick up the outline automatically.`);
                  onClose();
                }}
              >
                Create {chosen.length} scene stub{chosen.length === 1 ? '' : 's'}
              </button>
              <button disabled={shaping || !chosen.length} onClick={() => void shape()}>
                {shaping ? '✨ shaping…' : '✨ Shape chapter (LLM)'}
              </button>
              <button onClick={() => downloadFile(`chapter-${chapter}-outline.md`, outlineToText(world, chosen, chapter) + (shaped ? `\n\n## Shaped\n${shaped}\n` : ''), 'text/markdown')}>
                Download .md
              </button>
              <span className="grow" />
              <button onClick={() => { outlineMarkDone(); setToast('Marked as outlined — the next outline starts from here.'); onClose(); }} title="Skip these events; the next outline starts after them.">
                Mark outlined
              </button>
              <button onClick={onClose}>Close</button>
            </div>
          )}
          {beats.length === 0 && <div className="row"><span className="grow" /><button onClick={onClose}>Close</button></div>}
        </div>
      </div>
    </div>
  );
}
