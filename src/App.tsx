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
import { OutlineModal } from './components/OutlineModal';
import type { EncounterFrequency } from './engine/types';
import { BEHIND, LEFT_OF, RIGHT_OF, type Cardinal } from './components/FirstPersonView';
import { loadCustomCompositions, setThemeAudio } from './sound';
import { initServerArt } from './engine/artFiles';
import { festivalToday } from './engine/festivals';
import { loadMusicFiles } from './engine/musicFiles';

function ArrestBanner() {
  const world = useStore((s) => s.world);
  const arrestAct = useStore((s) => s.arrestAct);
  const a = world.pendingArrest;
  if (!a || world.combat) return null;
  const due = Math.ceil((world.bounty ?? 0) * 1.2);
  return (
    <div className="encounter-banner">
      <div className="row">
        <b style={{ color: 'var(--danger)' }}>⚖ WATCH PATROL</b>
        <span className="grow">{a.officers} watchmen, and they know the face. Bounty on the ledger: {fmtMoney(world.bounty ?? 0)}.</span>
      </div>
      <div className="row">
        <button className="primary" onClick={() => arrestAct('pay')}>Pay {fmtMoney(due)}</button>
        <button onClick={() => arrestAct('flee')}>Run for it</button>
        <button className="danger" onClick={() => arrestAct('resist')}>Draw steel</button>
        <button onClick={() => arrestAct('surrender')}>Take the cells (2 days)</button>
      </div>
    </div>
  );
}


function SpineBanner() {
  // finding from the campaign bot-runs: an offered main quest sat
  // silent in the log while the Circle got its quiet months. The
  // spine announces itself now.
  const world = useStore((s) => s.world);
  const [snoozedUntil, setSnoozedUntil] = useState(0);
  const offer = Object.values(world.quests).find((q) => q.isMain && q.status === 'offered');
  if (!offer || world.combat || world.currentDungeon) return null;
  if (world.partyLocation === offer.giverLocation) return null;
  if (world.time.day < snoozedUntil) return null;
  const giver = offer.giver === 'board' ? 'The board' : world.characters[offer.giver]?.name ?? 'Someone';
  const where = world.locations[offer.giverLocation]?.name ?? offer.giverLocation;
  const doomed = (world.doom?.stage ?? 0) > 0;
  return (
    <div className="encounter-banner" style={{ borderColor: 'var(--gold, #c9a227)', background: '#221c10' }}>
      <div className="row">
        <b style={{ color: 'var(--gold, #c9a227)' }}>⚜ {giver} is asking for you at {where}</b>
        <span className="grow dim small">"{offer.title}"{doomed ? ' — and the Circle is not waiting.' : ''}</span>
        <button onClick={() => setSnoozedUntil(world.time.day + 3)}>A few days more</button>
      </div>
    </div>
  );
}

function MomentBanner() {
  const world = useStore((s) => s.world);
  const hearMoment = useStore((s) => s.hearMoment);
  const dismissMoment = useStore((s) => s.dismissMoment);
  const m = world.pendingMoment;
  if (!m || world.combat) return null;
  const npc = world.characters[m.npcId];
  const other = m.banterWith ? world.characters[m.banterWith] : null;
  return (
    <div className="encounter-banner" style={{ borderColor: 'var(--info)', background: '#16222a' }}>
      <div className="row">
        <b style={{ color: 'var(--info)' }}>🗨 {other ? `${npc.name} and ${other.name} are talking` : `${npc.name} wants a word`}</b>
        <span className="grow dim small">({m.teaser})</span>
        <button className="primary" onClick={() => void hearMoment()}>{other ? 'Listen in' : 'Hear them out'}</button>
        <button onClick={dismissMoment}>Not now</button>
      </div>
    </div>
  );
}

function PartyStrip() {
  const world = useStore((s) => s.world);
  const setPanel = useStore((s) => s.setPanel);
  const party = partyMembers(world);
  if (!party.length) return null;
  return (
    <div className="party-strip" onClick={() => setPanel('party')} title="The roster — click for the full party panel">
      {party.map((c) => {
        const hurt = c.hp.current / c.hp.max;
        return (
          <span key={c.id} className="ps-member">
            <span className="ps-name">{c.name}{c.title ? ` ·${''} ${c.title}` : ''}</span>
            <span className="ps-bars">
              <span className={`ps-bar hp${hurt < 0.34 ? ' hurt' : ''}`}><span style={{ width: `${Math.round(hurt * 100)}%`, background: hurt < 0.3 ? 'var(--danger)' : hurt < 0.6 ? '#c88a2e' : 'var(--accent2)' }} /></span>
              {c.mana.max > 0 && <span className="ps-bar mp"><span style={{ width: `${Math.round((c.mana.current / c.mana.max) * 100)}%` }} /></span>}
            </span>
            <span className="mono dim ps-num">{c.hp.current}/{c.hp.max}</span>
            {c.statuses.filter((st) => st.key !== 'unconscious').map((st) => <span key={st.key} className="ps-dot" title={st.key} />)}
            {c.hp.current === 0 && <span className="ps-down">DOWN</span>}
          </span>
        );
      })}
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
      {(world.bounty ?? 0) > 0 && <span style={{ color: 'var(--danger)' }}> · ⚖ {fmtMoney(world.bounty ?? 0)}</span>}
      {party.length > 1 && <span className="dim"> · party {fmtMoney(partyTotal)}</span>}
      {treasury > 0 && <span className="dim"> · chest {fmtMoney(treasury)}</span>}
    </span>
  );
}

export default function App() {
  const world = useStore((s) => s.world);
  const [showCompile, setShowCompile] = useState(false);
  const [showOutline, setShowOutline] = useState(false);
  const advance = useStore((s) => s.advance);
  const sleepUntilMorning = useStore((s) => s.sleepUntilMorning);
  const setFrequency = useStore((s) => s.setFrequency);
  const addScene = useStore((s) => s.addScene);
  const selectScene = useStore((s) => s.selectScene);
  const moveScene = useStore((s) => s.moveScene);
  const selectedSceneId = useStore((s) => s.selectedSceneId);
  const toast = useStore((s) => s.toast);
  const setToast = useStore((s) => s.setToast);
  const playMode = useStore((s) => s.playMode);
  const setPlayMode = useStore((s) => s.setPlayMode);
  const soundOn = useStore((s) => s.soundOn);
  const setSoundOn = useStore((s) => s.setSoundOn);
  const musicOn = useStore((s) => s.musicOn);
  const setMusicOn = useStore((s) => s.setMusicOn);

  const initArt = useStore((s) => s.initArt);
  // stored AI compositions + uploaded audio themes + custom art load once at boot
  useEffect(() => {
    void initArt();
    void initServerArt();
    loadCustomCompositions();
    void loadMusicFiles().then((files) => {
      for (const [theme, blob] of Object.entries(files)) {
        setThemeAudio(theme as 'city' | 'dungeon' | 'combat', URL.createObjectURL(blob));
      }
    });
  }, []);

  // old-school keys: arrows walk the dungeon, S searches, C opens the
  // chest, F takes the fight. Inputs and modals keep their own keys.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const st = useStore.getState();
      const w = st.world;
      if (w.combat || st.talk || st.prepDungeon || st.chestLoot) return;
      if (w.pendingEncounter && (e.key === 'f' || e.key === 'F')) {
        st.beginCombat();
        return;
      }
      if (!w.currentDungeon || !w.currentRoom) return;
      if (st.moveScheme === 'relative') {
        // dungeon-crawler hands: up walks forward, left/right turn in place
        if (e.key === 'ArrowUp') { e.preventDefault(); st.move(st.facing); return; }
        if (e.key === 'ArrowLeft') { e.preventDefault(); st.turnFacing(LEFT_OF[st.facing as Cardinal]); return; }
        if (e.key === 'ArrowRight') { e.preventDefault(); st.turnFacing(RIGHT_OF[st.facing as Cardinal]); return; }
        if (e.key === 'ArrowDown') { e.preventDefault(); st.turnFacing(BEHIND[st.facing as Cardinal]); return; }
      } else {
        const dirByKey: Record<string, 'north' | 'south' | 'east' | 'west'> = {
          ArrowUp: 'north', ArrowDown: 'south', ArrowLeft: 'west', ArrowRight: 'east',
        };
        const dir = dirByKey[e.key];
        if (dir) {
          e.preventDefault();
          st.move(dir);
          return;
        }
      }
      const room = w.dungeons[w.currentDungeon].rooms[w.currentRoom];
      if (e.key === 's' || e.key === 'S') st.search();
      else if ((e.key === 'c' || e.key === 'C') && room.chest && !room.chest.opened) st.lootChest();
      else if ((e.key === 'f' || e.key === 'F') && room.enemies === 'alive') st.fight();
      else if (e.key === '>' && room.connections.down) st.move('down');
      else if (e.key === '<' && room.connections.up) st.move('up');
      else if (e.key === 't' || e.key === 'T') st.torchAct();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast, setToast]);

  const path = locPath(world, world.currentDungeon ? world.dungeons[world.currentDungeon].entranceLocation : world.partyLocation);
  const room = world.currentDungeon && world.currentRoom ? world.dungeons[world.currentDungeon].rooms[world.currentRoom] : null;

  const bookNow = world.bookNumber ?? 1;
  const bookScenes = world.scenes.filter((s) => (s.book ?? 1) === bookNow);
  const chapters = Array.from(new Set(bookScenes.map((s) => s.chapter))).sort((a, b) => a - b);

  const district = world.currentDungeon
    ? world.locations[world.dungeons[world.currentDungeon].entranceLocation]?.district
    : world.locations[world.partyLocation]?.district;
  return (
    <div className={`app${playMode ? ' play' : ''}`} data-district={district ?? ''}>
      <div className="topbar">
        <span className="title">Blackwall</span>
        {(world.bookNumber ?? 1) > 1 && <span className="mono small" style={{ color: 'var(--accent)' }}>Bk {world.bookNumber}</span>}
        <span className="clock">{fmtWhen(world.time)}</span>
        <span className="dim small" title={`Weather: ${world.weather?.kind ?? 'clear'}`}>
          {WEATHER_GLYPH[world.weather?.kind ?? 'clear']} {calendarLabel(world.time.day)}
        </span>
        {festivalToday(world) && (
          <span className="small" style={{ color: 'var(--accent)' }} title={festivalToday(world)!.desc}>🎪 {festivalToday(world)!.name}</span>
        )}
        <span className="crumb">
          {path.map((p) => p.name).join(' → ')}
          {room && <b> → {room.name} (floor {room.floor})</b>}
        </span>
        <span className="spacer" />
        <MoneyTracker />
        <label>advance</label>
        <button onClick={() => advance(10)} disabled={!!world.combat}>+10m</button>
        <button onClick={() => advance(60)} disabled={!!world.combat}>+1h</button>
        <button
          onClick={sleepUntilMorning}
          disabled={!!world.combat || !!world.currentDungeon}
          title="Sleep where you stand. Without a paid bed this is sleeping rough: half-rest, lingering fatigue, and in bad districts the night has teeth. Rent a room or buy a home for real sleep."
        >
          {world.locations[world.partyLocation]?.household ? 'until morning' : 'sleep rough'}
        </button>
        <button
          className={playMode ? 'primary' : undefined}
          onClick={() => setPlayMode(!playMode)}
          title={playMode ? 'Back to the manuscript — the sim keeps every consequence for you.' : 'Game-first layout: the manuscript steps aside, the dungeon and roster get the screen.'}
        >
          {playMode ? '✒ Write' : '🗡 Play'}
        </button>
        <button onClick={() => setSoundOn(!soundOn)} title={soundOn ? 'Sound on — synthesized, period-correct beeps' : 'Sound off'}>
          {soundOn ? '🔊' : '🔇'}
        </button>
        <button onClick={() => setMusicOn(!musicOn)} title={musicOn ? 'Music on — chip-tune loops (AI-composable in Saves → Music)' : 'Music off'}>
          {musicOn ? '🎵 on' : '🎵 off'}
        </button>
        <label>encounters</label>
        <select value={world.encounterFrequency} onChange={(e) => setFrequency(e.target.value as EncounterFrequency)}>
          <option value="low">low</option>
          <option value="normal">normal</option>
          <option value="high">high</option>
          <option value="chaotic">chaotic</option>
        </select>
      </div>
      <PartyStrip />
      <div className="banners">
        <EncounterBanner />
        <ArrestBanner />
        <MomentBanner />
        <SpineBanner />
      </div>
      <div className="main">
        <div className="sidebar">
          <div className="scenes">
            <h3>Manuscript</h3>
            <button style={{ width: '100%', marginBottom: 4 }} onClick={addScene}>+ New scene (from sim state)</button>
            <button style={{ width: '100%', marginBottom: 4 }} onClick={() => setShowOutline(true)}>🗺 Outline from play…</button>
            <button style={{ width: '100%', marginBottom: 8 }} onClick={() => setShowCompile(true)}>📖 Compile manuscript…</button>
            {bookNow > 1 && <p className="dim small">Book {bookNow} — earlier volumes live in Compile.</p>}
            {chapters.map((ch) => (
              <div key={ch}>
                <h3>Chapter {ch}</h3>
                {bookScenes
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
          <WritingStudio />
        </div>
        <SidePanels />
      </div>
      {world.combat && <CombatModal />}
      <ChestLootModal />
      <PrepModal />
      <TalkModal />
      {showCompile && <CompileModal onClose={() => setShowCompile(false)} />}
      {showOutline && <OutlineModal onClose={() => setShowOutline(false)} />}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
