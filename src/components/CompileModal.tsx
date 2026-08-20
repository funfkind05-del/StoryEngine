// Compile the manuscript: options, live word count, and export as
// Markdown or printable HTML (browser print → PDF).

import { useState } from 'react';
import { useStore } from '../state/store';
import { TIC_WARN_PER_1K, ticTrend } from '../engine/tics';
import {
  DEFAULT_COMPILE,
  compileHtml,
  compileMarkdown,
  compileStats,
  downloadFile,
  type CompileOptions,
} from '../engine/compile';

function TicTrendSection() {
  const world = useStore((s) => s.world);
  const trend = ticTrend(world).filter((t) => t.words > 200);
  if (!trend.length) return null;
  const worst = Math.max(...trend.map((t) => t.per1k));
  return (
    <details open={worst >= TIC_WARN_PER_1K}>
      <summary>
        Style tics (withheld action / "Not" fragments) — {worst >= TIC_WARN_PER_1K ? '⚠ trending' : 'healthy'}
      </summary>
      <p className="dim small">
        Restraint constructions read as discipline in isolation and become the book's only move at
        density — and they compound chapter to chapter when drafts imitate prior prose. Per 1,000 words:
      </p>
      {trend.map((t) => (
        <div key={t.chapter} className="row small">
          <span style={{ width: 60 }}>Ch. {t.chapter}</span>
          <span className="mono grow">{'▇'.repeat(Math.min(20, Math.round(t.per1k * 4))) || '·'}</span>
          <span className="mono" style={{ color: t.per1k >= TIC_WARN_PER_1K ? 'var(--danger)' : 'var(--text-dim)' }}>
            {t.per1k.toFixed(2)}/1k ({t.withheld} withheld, {t.notFragments} "Not…")
          </span>
        </div>
      ))}
      <p className="dim small">Fix by occupying the slot: write what IS there instead of what isn't. The drafting and polish prompts already enforce a budget of one each per scene.</p>
    </details>
  );
}

export function CompileModal({ onClose }: { onClose: () => void }) {
  const world = useStore((s) => s.world);
  const [title, setTitle] = useState('Blackwall');
  const [opts, setOpts] = useState<CompileOptions>({ ...DEFAULT_COMPILE });
  const stats = compileStats(world, opts);
  const set = (patch: Partial<CompileOptions>) => setOpts({ ...opts, ...patch });
  const fname = title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'manuscript';
  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: 'min(520px, 92vw)' }}>
        <div className="modal-head">📖 Compile Manuscript</div>
        <div className="modal-body">
          <div className="row">
            <label>Title</label>
            <input type="text" className="grow" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <label className="row small" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={opts.stripSimBlocks} onChange={(e) => set({ stripSimBlocks: e.target.checked })} />
            <span>Strip sim scaffolding ([SIM NOTES], [COMBAT LOG], [CONVERSATION] blocks)</span>
          </label>
          <label className="row small" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={opts.keepStatBlocks} onChange={(e) => set({ keepStatBlocks: e.target.checked })} />
            <span>Keep LitRPG stat-block windows</span>
          </label>
          <label className="row small" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={opts.includeSceneTitles} onChange={(e) => set({ includeSceneTitles: e.target.checked })} />
            <span>Include scene titles as headings</span>
          </label>
          <div className="row small">
            <label>Scene separator</label>
            <input type="text" value={opts.sceneSeparator} onChange={(e) => set({ sceneSeparator: e.target.value })} />
          </div>
          <p className="dim small">
            {stats.chapters} chapter{stats.chapters === 1 ? '' : 's'} · {stats.scenes} scene{stats.scenes === 1 ? '' : 's'} · <b>{stats.words.toLocaleString()} words</b> after compilation.
            Entity tokens render as plain names.
          </p>
          <TicTrendSection />
          <div className="row" style={{ marginTop: 8 }}>
            <button className="primary" onClick={() => downloadFile(`${fname}.md`, compileMarkdown(world, title, opts), 'text/markdown')}>
              Download .md
            </button>
            <button onClick={() => downloadFile(`${fname}.html`, compileHtml(world, title, opts), 'text/html')}>
              Download .html (print → PDF)
            </button>
            <span className="grow" />
            <button onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
