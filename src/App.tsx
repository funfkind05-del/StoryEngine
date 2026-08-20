import { useEffect, useState } from 'react';
import { useStore } from './state/store';
import { fmtWhen, locPath, partyMembers } from './engine/world';
import { WEATHER_GLYPH, calendarLabel, fmtMoney } from './engine/rules';
import { findHome } from './engine/household';
import { WritingStudio } from './components/WritingStudio';
import { SidePanels } from './components/SidePanels';
import { ChestLootModal, CombatModal, EncounterBanner } from './components/CombatModal';
import { PrepModal } from './components/PrepModal';
import { TalkModal } from './components/TalkModal';
import { MiniMap } from './components/MiniMap';
import { CompileModal } from './components/CompileModal';
import type { EncounterFrequency } from './engine/types';

function MomentBanner() {
  const world = useStore((s) => s.world);
  const hearMoment = useStore((s) => s.hearMoment);
  const dismissMoment = useStore((s) => s.dismissMoment);
  const m = world.pendingMoment;
  if (!m || world.combat) return null;
  const npc = world.characters[m.npcId];
  return (
    <div className="encounter-banner" style={{ borderColor: 'var(--info)', background: '#16222a' }}>
      <div className="row">
        <b style={{ color: 'var(--info)' }}>🗨 {npc.name} wants a word</b>
        <span className="grow dim small">({m.teaser})</span>
        <button className="primary" onClick={() => void hearMoment()}>Hear them out</button>
        <button onClick={dismissMoment}>Not now</button>
      </div>
    </div>
  );
}

function MoneyTracker() {
  const world = useStore((s) => s.world);
  const setPanel = useStore((s) => s.setPanel);
  const mc = world.characters[world.mcId];
  const party = partyMembers(world);
  const partyTotal = party.reduce((sum, c) => sum + c.money, 0);
  const homeId = findHome(world);
  const treasury = homeId ? world.locations[homeId].household!.treasury : 0;
  return (
    <span
      className="money-tracker"
      title={`${party.map((c) => `${c.name}: ${fmtMoney(c.money)}`).join(' · ')}${homeId ? ` · home chest: ${fmtMoney(treasury)}` : ''} — click for inventory`}
      onClick={() => setPanel('inventory')}
    >
      <span className="coin">◉</span> {fmtMoney(mc.money)}
      {party.length > 1 && <span className="dim"> · party {fmtMoney(partyTotal)}</span>}
      {treasury > 0 && <span className="dim"> · chest {fmtMoney(treasury)}</span>}
    </span>
  );
}

export default function App() {
  const world = useStore((s) => s.world);
  const [showCompile, setShowCompile] = useState(false);
  const advance = useStore((s) => s.advance);
  const sleepUntilMorning = useStore((s) => s.sleepUntilMorning);
  const setFrequency = useStore((s) => s.setFrequency);
  const addScene = useStore((s) => s.addScene);
  const selectScene = useStore((s) => s.selectScene);
  const moveScene = useStore((s) => s.moveScene);
  const selectedSceneId = useStore((s) => s.selectedSceneId);
  const toast = useStore((s) => s.toast);
  const setToast = useStore((s) => s.setToast);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast, setToast]);

  const path = locPath(world, world.currentDungeon ? world.dungeons[world.currentDungeon].entranceLocation : world.partyLocation);
  const room = world.currentDungeon && world.currentRoom ? world.dungeons[world.currentDungeon].rooms[world.currentRoom] : null;

  const chapters = Array.from(new Set(world.scenes.map((s) => s.chapter))).sort((a, b) => a - b);

  return (
    <div className="app">
      <div className="topbar">
        <span className="title">Blackwall</span>
        <span className="clock">{fmtWhen(world.time)}</span>
        <span className="dim small" title={`Weather: ${world.weather?.kind ?? 'clear'}`}>
          {WEATHER_GLYPH[world.weather?.kind ?? 'clear']} {calendarLabel(world.time.day)}
        </span>
        <span className="crumb">
          {path.map((p) => p.name).join(' → ')}
          {room && <b> → {room.name} (floor {room.floor})</b>}
        </span>
        <span className="spacer" />
        <MoneyTracker />
        <label>advance</label>
        <button onClick={() => advance(10)} disabled={!!world.combat}>+10m</button>
        <button onClick={() => advance(60)} disabled={!!world.combat}>+1h</button>
        <button onClick={sleepUntilMorning} disabled={!!world.combat || !!world.currentDungeon}>until morning</button>
        <label>encounters</label>
        <select value={world.encounterFrequency} onChange={(e) => setFrequency(e.target.value as EncounterFrequency)}>
          <option value="low">low</option>
          <option value="normal">normal</option>
          <option value="high">high</option>
          <option value="chaotic">chaotic</option>
        </select>
      </div>
      <div className="main">
        <div className="sidebar">
          <div className="scenes">
            <h3>Manuscript</h3>
            <button style={{ width: '100%', marginBottom: 4 }} onClick={addScene}>+ New scene (from sim state)</button>
            <button style={{ width: '100%', marginBottom: 8 }} onClick={() => setShowCompile(true)}>📖 Compile manuscript…</button>
            {chapters.map((ch) => (
              <div key={ch}>
                <h3>Chapter {ch}</h3>
                {world.scenes
                  .filter((s) => s.chapter === ch)
                  .sort((a, b) => a.order - b.order)
                  .map((s) => (
                    <div key={s.id} className={`scene-item${s.id === selectedSceneId ? ' active' : ''}`} onClick={() => selectScene(s.id)}>
                      <div className="t" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ flex: 1 }}>{s.title}</span>
                        <button className="scene-move" onClick={(e) => { e.stopPropagation(); moveScene(s.id, -1); }} title="Move scene up">▲</button>
                        <button className="scene-move" onClick={(e) => { e.stopPropagation(); moveScene(s.id, 1); }} title="Move scene down">▼</button>
                      </div>
                      <div className="m">Day {s.day} · {world.locations[s.location]?.name ?? '?'}</div>
                    </div>
                  ))}
              </div>
            ))}
          </div>
          <MiniMap />
        </div>
        <div className="editor-wrap" style={{ minHeight: 0 }}>
          <EncounterBanner />
          <MomentBanner />
          <WritingStudio />
        </div>
        <SidePanels />
      </div>
      {world.combat && <CombatModal />}
      <ChestLootModal />
      <PrepModal />
      <TalkModal />
      {showCompile && <CompileModal onClose={() => setShowCompile(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
