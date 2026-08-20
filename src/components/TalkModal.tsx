// LLM-driven NPC conversation window. The author speaks as the POV
// character; the model answers as the NPC, primed with only what that
// NPC knows. Nothing becomes canon unless the author keeps it:
// "End & remember" writes the event + NPC memory, "Copy to scene"
// drops the transcript into the manuscript as editable notes.

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import {
  DEFAULT_LLM,
  buildNpcSystemPrompt,
  listModels,
  loadLlmConfig,
  saveLlmConfig,
  type LlmConfig,
} from '../engine/npcChat';
import { Tag } from './common';

function LlmSettings({ onClose }: { onClose: () => void }) {
  const [cfg, setCfg] = useState<LlmConfig>(() => loadLlmConfig());
  const [models, setModels] = useState<string[]>([]);
  const [status, setStatus] = useState('');
  const refresh = async (c: LlmConfig) => {
    setStatus('checking…');
    try {
      const found = await listModels(c);
      setModels(found);
      setStatus(found.length ? `connected — ${found.length} model(s)` : 'connected, but no model loaded');
    } catch (e) {
      setStatus(`cannot reach server: ${e instanceof Error ? e.message : e}`);
    }
  };
  useEffect(() => {
    void refresh(loadLlmConfig());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const save = (patch: Partial<LlmConfig>) => {
    const next = { ...cfg, ...patch };
    setCfg(next);
    saveLlmConfig(next);
  };
  return (
    <div className="card">
      <div className="row small">
        <label style={{ width: 90 }}>Server URL</label>
        <input type="text" className="grow" value={cfg.baseUrl} onChange={(e) => save({ baseUrl: e.target.value })} />
      </div>
      <div className="row small">
        <label style={{ width: 90 }}>API key</label>
        <input type="text" className="grow" placeholder="empty for local servers" value={cfg.apiKey} onChange={(e) => save({ apiKey: e.target.value })} />
      </div>
      <div className="row small">
        <label style={{ width: 90 }}>Model</label>
        <select className="grow" value={cfg.model} onChange={(e) => save({ model: e.target.value })}>
          <option value="">(first available)</option>
          {models.map((m) => <option key={m} value={m}>{m}</option>)}
        </select>
        <button onClick={() => void refresh(cfg)}>Test</button>
      </div>
      <div className="row small">
        <label style={{ width: 90 }}>Temperature</label>
        <input type="number" step="0.1" min="0" max="2" value={cfg.temperature} onChange={(e) => save({ temperature: parseFloat(e.target.value) || 0.8 })} />
        <span className="grow dim">{status}</span>
        <button onClick={() => { saveLlmConfig({ ...DEFAULT_LLM }); setCfg({ ...DEFAULT_LLM }); void refresh(DEFAULT_LLM); }}>Reset</button>
        <button onClick={onClose}>Done</button>
      </div>
      <p className="dim small">
        Default targets LM Studio on localhost:1234 (via the dev proxy, no CORS setup needed). Any
        OpenAI-compatible endpoint works — Ollama, vLLM, LiteLLM, or api.openai.com/v1 with a key.
      </p>
    </div>
  );
}

export function TalkModal() {
  const world = useStore((s) => s.world);
  const talk = useStore((s) => s.talk);
  const sendTalkLine = useStore((s) => s.sendTalkLine);
  const talkToScene = useStore((s) => s.talkToScene);
  const endTalk = useStore((s) => s.endTalk);
  const [input, setInput] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showPrompt, setShowPrompt] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [talk?.messages.length, talk?.busy]);

  if (!talk) return null;
  const npc = world.characters[talk.npcId];
  const pov = world.characters[talk.povId];

  const send = () => {
    if (!input.trim() || talk.busy) return;
    void sendTalkLine(input);
    setInput('');
  };

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: 'min(700px, 94vw)' }}>
        <div className="modal-head">
          🗨 {npc.name}
          <span className="dim small">{npc.occupation} · {npc.personality.join(', ')}</span>
          <span className="grow" />
          <button onClick={() => setShowSettings(!showSettings)}>⚙ LLM</button>
        </div>
        <div className="modal-body">
          {showSettings && <LlmSettings onClose={() => setShowSettings(false)} />}
          <div ref={logRef} className="chat-log">
            {talk.messages.length === 0 && (
              <p className="dim small">
                You speak as {pov.name}. The model plays {npc.name}, primed only with what {npc.name}
                {' '}knows, remembers, and feels — world truth stays hidden. Nothing becomes canon
                unless you keep it.
              </p>
            )}
            {talk.messages.map((m, i) => (
              <div key={i} className={`chat-line ${m.role === 'user' ? 'pov' : 'npc'}`}>
                <div className="who">{m.role === 'user' ? pov.name : npc.name}</div>
                <div>{m.content}</div>
              </div>
            ))}
            {talk.busy && <div className="chat-line npc"><div className="who">{npc.name}</div><div className="dim">…</div></div>}
            {talk.error && <div className="warn">{talk.error}</div>}
          </div>
          <div className="row">
            <input
              type="text"
              className="grow"
              placeholder={`${pov.name} says…`}
              value={input}
              autoFocus
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
            />
            <button className="primary" disabled={talk.busy || !input.trim()} onClick={send}>Send</button>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            <button onClick={talkToScene} disabled={talk.messages.length === 0}>Copy to scene</button>
            <button onClick={() => setShowPrompt(!showPrompt)}>{showPrompt ? 'Hide' : 'Show'} NPC briefing</button>
            <span className="grow" />
            <button className="primary" disabled={talk.messages.length === 0} onClick={() => void endTalk(true)} title="Advance time, log the event, and give the NPC a memory of this conversation.">
              End & remember
            </button>
            <button onClick={() => void endTalk(false)} title="Close without making anything canon.">Discard</button>
          </div>
          {showPrompt && (
            <details open style={{ marginTop: 8 }}>
              <summary>Exactly what the model is told (knowledge-separated)</summary>
              <pre style={{ whiteSpace: 'pre-wrap' }}>{buildNpcSystemPrompt(world, talk.npcId, talk.povId)}</pre>
            </details>
          )}
          {npc.memories.length > 0 && (
            <p className="dim small" style={{ marginTop: 6 }}>
              {npc.name} carries {npc.memories.length} memori{npc.memories.length === 1 ? 'y' : 'es'}; the strongest shape how they speak to you. <Tag>knowledge separation on</Tag>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
