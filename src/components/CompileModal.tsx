// Compile the manuscript: options, live word count, and export as
// Markdown or printable HTML (browser print → PDF).

import { useState } from 'react';
import { useStore } from '../state/store';
import {
  DEFAULT_COMPILE,
  compileHtml,
  compileMarkdown,
  compileStats,
  downloadFile,
  type CompileOptions,
} from '../engine/compile';

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
