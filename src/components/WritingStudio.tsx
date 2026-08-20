// The prose editor: scene metadata header (invisible to readers),
// entity insertion (locations, characters, items keep their IDs via
// @[Name](ID) tokens), and per-scene continuity checking.

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import { checkScene } from '../engine/continuity';
import { fmtTime, partyMembers } from '../engine/world';
import { extractActions, lastParagraph, polishText, type SyncProposal } from '../engine/proseLlm';
import { statBlock } from '../engine/bridge';
import { loadLlmConfig } from '../engine/npcChat';

const AUTOPOLISH_KEY = 'storyengine.autopolish.v1';

interface PolishSuggestion {
  start: number;
  end: number;
  original: string;
  suggestion: string;
}

export function WritingStudio() {
  const world = useStore((s) => s.world);
  const selectedSceneId = useStore((s) => s.selectedSceneId);
  const updateScene = useStore((s) => s.updateScene);
  const deleteScene = useStore((s) => s.deleteScene);
  const setToast = useStore((s) => s.setToast);
  const applyProposals = useStore((s) => s.applyProposals);
  const updateSceneStore = updateScene;
  const ref = useRef<HTMLTextAreaElement>(null);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [polish, setPolish] = useState<PolishSuggestion | null>(null);
  const [polishBusy, setPolishBusy] = useState(false);
  const [autoPolish, setAutoPolish] = useState(() => parseInt(localStorage.getItem(AUTOPOLISH_KEY) ?? '0', 10));
  const [syncState, setSyncState] = useState<{ busy: boolean; proposals: SyncProposal[] | null; checked: boolean[]; results: string[] | null } | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draftOutline, setDraftOutline] = useState('');
  const [draftBusy, setDraftBusy] = useState(false);
  const draftSelectedScene = useStore((st) => st.draftSelectedScene);
  const lastPolishedText = useRef('');

  const sceneForHooks = world.scenes.find((s) => s.id === selectedSceneId);

  const runPolish = async (target?: { start: number; end: number; text: string }) => {
    const sc = useStore.getState().world.scenes.find((s) => s.id === selectedSceneId);
    if (!sc || polishBusy) return;
    const range = target ?? lastParagraph(sc.text);
    if (!range || range.text === lastPolishedText.current) return;
    setPolishBusy(true);
    try {
      const suggestion = await polishText(loadLlmConfig(), range.text, 'gritty low-fantasy, close third person, spare and concrete');
      lastPolishedText.current = range.text;
      if (suggestion && suggestion !== range.text) {
        setPolish({ start: range.start, end: range.end, original: range.text, suggestion });
      } else {
        setToast('The editor found nothing to improve.');
      }
    } catch (e) {
      setToast(`Polish failed: ${e instanceof Error ? e.message : e}`);
    } finally {
      setPolishBusy(false);
    }
  };

  // auto-polish timer: suggests (never applies) at the chosen frequency
  useEffect(() => {
    if (!autoPolish || !sceneForHooks) return;
    const t = setInterval(() => {
      if (!polishBusy && !polish) void runPolish();
    }, autoPolish * 1000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPolish, selectedSceneId, polishBusy, polish]);

  const acceptPolish = () => {
    const sc = useStore.getState().world.scenes.find((s) => s.id === selectedSceneId);
    if (!sc || !polish) return;
    // only apply if the original passage is still there (author may have kept typing)
    const idx = sc.text.indexOf(polish.original);
    if (idx < 0) {
      setToast('The passage changed since the suggestion was made — dismissed.');
      setPolish(null);
      return;
    }
    updateSceneStore(sc.id, { text: sc.text.slice(0, idx) + polish.suggestion + sc.text.slice(idx + polish.original.length) });
    setPolish(null);
  };

  const runSync = async () => {
    const sc = useStore.getState().world.scenes.find((s) => s.id === selectedSceneId);
    if (!sc) return;
    const fresh = sc.text.slice(sc.syncedUpTo ?? 0).trim();
    if (fresh.length < 20) {
      setToast('Nothing new to sync since the last pass.');
      return;
    }
    setSyncState({ busy: true, proposals: null, checked: [], results: null });
    try {
      const proposals = await extractActions(loadLlmConfig(), useStore.getState().world, fresh);
      if (!proposals.length) {
        setSyncState(null);
        setToast('The model found no simulation-relevant events in the new prose.');
        updateSceneStore(sc.id, { syncedUpTo: sc.text.length });
        return;
      }
      setSyncState({ busy: false, proposals, checked: proposals.map(() => true), results: null });
    } catch (e) {
      setSyncState(null);
      setToast(`Sync failed: ${e instanceof Error ? e.message : e}`);
    }
  };

  const applySync = () => {
    if (!syncState?.proposals) return;
    const chosen = syncState.proposals.filter((_, i) => syncState.checked[i]);
    const results = applyProposals(chosen);
    const sc = useStore.getState().world.scenes.find((s) => s.id === selectedSceneId);
    if (sc) updateSceneStore(sc.id, { syncedUpTo: sc.text.length });
    setSyncState({ busy: false, proposals: syncState.proposals, checked: syncState.checked, results });
  };

  const scene = world.scenes.find((s) => s.id === selectedSceneId);
  if (!scene) {
    return (
      <div className="editor-wrap">
        <div style={{ padding: 40 }} className="dim">
          No scene selected. Create one from the sidebar — every scene carries a simulation header (POV,
          day, time, location, participants) that stays invisible to readers.
        </div>
      </div>
    );
  }

  const insertAtCursor = (token: string) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart ?? scene.text.length;
    const end = ta.selectionEnd ?? start;
    const next = scene.text.slice(0, start) + token + scene.text.slice(end);
    updateScene(scene.id, { text: next });
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + token.length;
    });
  };

  const persistentChars = Object.values(world.characters).filter((c) => c.persistent);
  const ownedItems = Object.values(world.items).filter((i) => i.owner && world.characters[i.owner]);
  const locations = Object.values(world.locations).filter((l) => l.type !== 'dungeon-room');

  const runCheck = () => {
    const found = checkScene(world, scene);
    setWarnings(found.map((w) => `${w.severity === 'error' ? '✖' : '⚠'} ${w.message}`));
    if (!found.length) setToast('Continuity check passed — no contradictions found.');
  };

  const words = scene.text.trim() ? scene.text.trim().split(/\s+/).length : 0;

  return (
    <div className="editor-wrap">
      <div className="scene-meta">
        <input
          className="title-input"
          type="text"
          value={scene.title}
          onChange={(e) => updateScene(scene.id, { title: e.target.value })}
        />
        <label>
          Ch.{' '}
          <input
            type="number"
            value={scene.chapter}
            onChange={(e) => updateScene(scene.id, { chapter: parseInt(e.target.value || '1', 10) })}
          />
        </label>
        <label>
          Day{' '}
          <input
            type="number"
            value={scene.day}
            onChange={(e) => updateScene(scene.id, { day: parseInt(e.target.value || '1', 10) })}
          />
        </label>
        <label>
          POV{' '}
          <select value={scene.pov} onChange={(e) => updateScene(scene.id, { pov: e.target.value })}>
            {persistentChars.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </label>
        <label>
          Location{' '}
          <select value={scene.location} onChange={(e) => updateScene(scene.id, { location: e.target.value })}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </label>
        <span className="dim mono">{scene.id} · starts {fmtTime({ day: scene.day, minute: scene.startMinute })}</span>
        <button
          className="danger"
          onClick={() => {
            if (confirm(`Delete scene "${scene.title}"?`)) deleteScene(scene.id);
          }}
        >
          Delete
        </button>
      </div>

      <div className="editor-toolbar">
        <select value="" onChange={(e) => { const l = world.locations[e.target.value]; if (l) insertAtCursor(`@[${l.name}](${l.id})`); }}>
          <option value="">Insert Location…</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name} ({l.district})</option>
          ))}
        </select>
        <select value="" onChange={(e) => { const c = world.characters[e.target.value]; if (c) insertAtCursor(`@[${c.name}](${c.id})`); }}>
          <option value="">Insert Character…</option>
          {persistentChars.map((c) => (
            <option key={c.id} value={c.id}>{c.name} — {c.occupation}</option>
          ))}
        </select>
        <select value="" onChange={(e) => { const i = world.items[e.target.value]; if (i) insertAtCursor(`@[${i.name}](${i.id})`); }}>
          <option value="">Insert Item…</option>
          {ownedItems.map((i) => (
            <option key={i.id} value={i.id}>{i.name} ({world.characters[i.owner!]?.name})</option>
          ))}
        </select>
        <select value="" title="Insert a LitRPG system window rendered from live simulation state — the numbers are canonical at the moment of insertion." onChange={(e) => { if (e.target.value) insertAtCursor('\n' + statBlock(world, e.target.value) + '\n'); }}>
          <option value="">Insert Stat Block…</option>
          {Object.values(world.characters).filter((c) => c.inParty && c.alive).map((c) => (
            <option key={c.id} value={c.id}>{c.name} — L{c.level}</option>
          ))}
        </select>
        <span className="grow" />
        <button
          onClick={() =>
            updateScene(scene.id, {
              day: world.time.day,
              startMinute: world.time.minute,
              location: world.partyLocation,
              participants: partyMembers(world).map((c) => c.id),
            })
          }
          title="Stamp this scene with the simulation's current day, time, location, and party"
        >
          Sync header to sim
        </button>
        <button className="primary" onClick={runCheck}>Check Scene</button>
        <button disabled={polishBusy} onClick={() => {
          const ta = ref.current;
          const sel = ta && ta.selectionStart !== ta.selectionEnd
            ? { start: ta.selectionStart, end: ta.selectionEnd, text: scene.text.slice(ta.selectionStart, ta.selectionEnd) }
            : undefined;
          void runPolish(sel);
        }} title="LLM line-edit of the selection (or the last paragraph). Suggestion only — you accept or dismiss.">
          {polishBusy ? '✨ polishing…' : '✨ Polish'}
        </button>
        <select
          value={autoPolish}
          title="Automatically suggest a polish of the newest paragraph at this frequency"
          onChange={(e) => { const v = parseInt(e.target.value, 10); setAutoPolish(v); localStorage.setItem(AUTOPOLISH_KEY, String(v)); }}
        >
          <option value={0}>auto-polish: off</option>
          <option value={60}>every 1 min</option>
          <option value={300}>every 5 min</option>
          <option value={600}>every 10 min</option>
        </select>
        <button disabled={!!syncState?.busy} onClick={() => void runSync()} title="LLM reads what you've written since the last sync and proposes simulation actions. Nothing changes until you approve.">
          {syncState?.busy ? '⇄ reading…' : '⇄ Sync → sim'}
        </button>
        <button onClick={() => setDrafting((d) => !d)} title="Have the LLM write a first pass of this scene from the sim's recent events plus your outline.">🪶 Draft scene…</button>
      </div>

      {drafting && (
        <div className="suggestion-box">
          <div className="row"><b>🪶 Draft this scene</b><span className="dim small">first pass from sim facts + your outline — appended for you to rewrite</span></div>
          <textarea
            className="draft-outline"
            placeholder="Outline: what should happen in this scene? (e.g. Kael confronts Mara about the warehouse; she deflects; ends with the Watch arriving)"
            value={draftOutline}
            onChange={(e) => setDraftOutline(e.target.value)}
          />
          <div className="row">
            <button className="primary" disabled={draftBusy || draftOutline.trim().length < 10} onClick={() => {
              setDraftBusy(true);
              void draftSelectedScene(draftOutline).then((r) => {
                setDraftBusy(false);
                if (r !== null) { setDrafting(false); setToast('Draft appended — it is yours to rewrite.'); }
              });
            }}>{draftBusy ? 'writing…' : 'Draft it'}</button>
            <button onClick={() => setDrafting(false)}>Cancel</button>
          </div>
        </div>
      )}

      {polish && (
        <div className="suggestion-box">
          <div className="row"><b>✨ Polish suggestion</b><span className="dim small">(your text is untouched until you accept)</span></div>
          <div className="sugg-cols">
            <div><div className="dim small">yours</div><div className="sugg-text">{polish.original}</div></div>
            <div><div className="dim small">suggested</div><div className="sugg-text">{polish.suggestion}</div></div>
          </div>
          <div className="row">
            <button className="primary" onClick={acceptPolish}>Accept</button>
            <button onClick={() => setPolish(null)}>Dismiss</button>
          </div>
        </div>
      )}

      {syncState && !syncState.busy && syncState.proposals && (
        <div className="suggestion-box">
          <div className="row"><b>⇄ Proposed simulation actions from your prose</b></div>
          {syncState.results ? (
            <>
              {syncState.results.map((r, i) => <p key={i} className="small">{r}</p>)}
              <button onClick={() => setSyncState(null)}>Done</button>
            </>
          ) : (
            <>
              {syncState.proposals.map((p, i) => (
                <label key={i} className="row small" style={{ cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={syncState.checked[i]}
                    onChange={(e) => {
                      const checked = [...syncState.checked];
                      checked[i] = e.target.checked;
                      setSyncState({ ...syncState, checked });
                    }}
                  />
                  <span>{p.label}</span>
                </label>
              ))}
              <div className="row">
                <button className="primary" onClick={applySync}>Apply approved</button>
                <button onClick={() => setSyncState(null)}>Cancel</button>
              </div>
              <p className="dim small">Prose never silently changes the simulation — only what you approve here executes, and each action is logged as an authored event.</p>
            </>
          )}
        </div>
      )}

      {warnings && warnings.length > 0 && (
        <div style={{ padding: '8px 16px', maxHeight: 140, overflowY: 'auto' }}>
          {warnings.map((w, i) => (
            <div key={i} className={w.startsWith('✖') ? 'warn' : 'warn soft'}>{w}</div>
          ))}
          <button onClick={() => setWarnings(null)}>Dismiss</button>
        </div>
      )}

      <textarea
        ref={ref}
        className="prose-editor"
        value={scene.text}
        placeholder="Write. The simulation keeps the facts; you keep the voice."
        onChange={(e) => updateScene(scene.id, { text: e.target.value })}
        spellCheck={false}
      />

      <div className="statusline">
        <span>{words} words</span>
        <span>participants: {scene.participants.map((p) => world.characters[p]?.name ?? p).join(', ') || 'none'}</span>
        <span className="grow" />
        <span>editing prose never changes simulation state</span>
      </div>
    </div>
  );
}
