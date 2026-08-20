// Encounter banner, round-based combat modal, and loot screens.
// The combat log is the canonical record; COPY TO PROSE runs it
// through the narrative bridge, which never invents a result.

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../state/store';
import type { CombatActionType, PlannedAction } from '../engine/types';
import { SKILLS, SPELLS } from '../engine/combat';
import { MONSTERS } from '../engine/monsters';
import { combatToAuthorLog, combatToProse } from '../engine/bridge';
import { fmtMoney, tierColor } from '../engine/rules';
import { randomSeed } from '../engine/rng';
import { Bar, Tag } from './common';
import { MonsterPortrait } from './MonsterArt';

// ---------- Encounter banner ----------
export function EncounterBanner() {
  const world = useStore((s) => s.world);
  const beginCombat = useStore((s) => s.beginCombat);
  const dismissEncounter = useStore((s) => s.dismissEncounter);
  const fight = useStore((s) => s.fight);
  const overrideEncounter = useStore((s) => s.overrideEncounter);
  const [editing, setEditing] = useState(false);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const enc = world.pendingEncounter;
  if (!enc || world.combat) return null;

  const startEdit = () => {
    const c: Record<string, number> = {};
    for (const g of enc.monsters) c[g.templateKey] = g.count;
    setCounts(c);
    setEditing(true);
  };
  const applyEdit = () => {
    const monsters = Object.entries(counts)
      .filter(([, n]) => n > 0)
      .map(([templateKey, count]) => ({ templateKey, count }));
    if (!monsters.length) return;
    const note = monsters.map((m) => `${m.count} ${MONSTERS[m.templateKey].name}${m.count > 1 ? 's' : ''}`).join(', ');
    overrideEncounter(monsters, note);
    setEditing(false);
  };

  return (
    <div className="encounter-banner">
      <div className="row">
        <b style={{ color: 'var(--danger)' }}>ENCOUNTER:</b>
        {enc.monsters.map((g) => (
          <span key={g.templateKey} className="row" style={{ gap: 2 }}>
            <MonsterPortrait templateKey={g.templateKey} size={34} world={world} />
            {g.count > 1 && <span className="mono dim">×{g.count}</span>}
          </span>
        ))}
        <span className="grow">{enc.description}</span>
        <span className="mono dim">seed {enc.seed}</span>
      </div>
      {editing ? (
        <div>
          {Object.keys(MONSTERS).map((key) => (
            <div key={key} className="row small">
              <span className="grow">{MONSTERS[key].name} (L{MONSTERS[key].level})</span>
              <input
                type="number"
                min={0}
                value={counts[key] ?? 0}
                onChange={(e) => setCounts({ ...counts, [key]: Math.max(0, parseInt(e.target.value || '0', 10)) })}
              />
            </div>
          ))}
          <div className="row">
            <button className="primary" onClick={applyEdit}>Apply override (logged)</button>
            <button onClick={() => setEditing(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <div className="row">
          <button className="primary" onClick={beginCombat}>⚔️ Fight</button>
          {enc.source === 'dungeon' && <button onClick={() => fight(randomSeed())}>Resimulate (new seed)</button>}
          <button onClick={startEdit}>Override…</button>
          <button onClick={dismissEncounter} title="Set the encounter aside; in a dungeon the enemies remain in the room.">
            Not yet
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- Combat ----------
interface Plan {
  type: CombatActionType;
  target: string;
  key: string; // skill/spell/item id
}

export function CombatModal() {
  const world = useStore((s) => s.world);
  const doRound = useStore((s) => s.doRound);
  const finishLoot = useStore((s) => s.finishLoot);
  const endCombatView = useStore((s) => s.endCombatView);
  const updateScene = useStore((s) => s.updateScene);
  const selectedSceneId = useStore((s) => s.selectedSceneId);
  const setToast = useStore((s) => s.setToast);
  const combatAutoRound = useStore((s) => s.combatAutoRound);
  const combatAutoResolve = useStore((s) => s.combatAutoResolve);
  const combat = world.combat;
  const [plans, setPlans] = useState<Record<string, Plan>>({});
  const [proseSeed, setProseSeed] = useState(() => randomSeed());
  const [picked, setPicked] = useState<number[]>([]);
  // old-school combat keys: Enter resolves, A auto-round, L lets them
  // fight, T takes all loot, 1-9 point every blade at the Nth enemy
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      keyHandler.current(e);
    };
    window.addEventListener('keydown', fn);
    return () => window.removeEventListener('keydown', fn);
  }, []);

  if (!combat) return null;
  const livingMonsters = combat.monsters.filter((m) => m.alive && !m.fled);

  const party = combat.partyIds.map((id) => world.characters[id]).filter(Boolean);
  const defaultTarget = livingMonsters[0]?.id ?? '';

  const planFor = (cid: string): Plan => plans[cid] ?? { type: 'attack', target: defaultTarget, key: '' };
  const setPlan = (cid: string, p: Partial<Plan>) => setPlans({ ...plans, [cid]: { ...planFor(cid), ...p } });

  const resolve = () => {
    const actions: PlannedAction[] = party
      .filter((c) => c.hp.current > 0)
      .map((c) => {
        const p = planFor(c.id);
        const a: PlannedAction = { actor: c.id, type: p.type };
        if (p.type === 'attack' || p.type === 'skill' || (p.type === 'spell' && SPELLS[p.key]?.damage)) {
          a.target = livingMonsters.some((m) => m.id === p.target) ? p.target : defaultTarget;
        }
        if (p.type === 'spell' && SPELLS[p.key]?.heal) a.target = p.target || c.id;
        if (p.type === 'item') { a.itemId = p.key; a.target = c.id; }
        if (p.type === 'skill') a.skillKey = p.key || 'shield-bash';
        if (p.type === 'spell') a.spellKey = p.key || 'firebolt';
        return a;
      });
    doRound(actions);
  };

  const appendToScene = (title: string, body: string) => {
    const scene = world.scenes.find((s) => s.id === selectedSceneId);
    if (!scene) { setToast('Select a scene first.'); return; }
    updateScene(scene.id, { text: scene.text + `\n\n${body}\n` });
    setToast(`${title} appended to "${scene.title}".`);
  };

  const over = combat.outcome !== 'ongoing';
  const loot = combat.pendingLoot;

  keyHandler.current = (e) => {
    if (!over) {
      if (e.key === 'Enter') { e.preventDefault(); resolve(); return; }
      if (e.key === 'a' || e.key === 'A') { combatAutoRound(); return; }
      if (e.key === 'l' || e.key === 'L') { combatAutoResolve(); return; }
      const n = parseInt(e.key, 10);
      if (n >= 1 && n <= livingMonsters.length) {
        const target = livingMonsters[n - 1].id;
        const next: Record<string, Plan> = { ...plans };
        for (const c of party) {
          const p = plans[c.id] ?? { type: 'attack', target, key: '' };
          if (p.type === 'attack' || p.type === 'skill' || (p.type === 'spell' && SPELLS[p.key]?.damage)) {
            next[c.id] = { ...p, target };
          }
        }
        setPlans(next);
        setToast(`All blades point at ${livingMonsters[n - 1].name}.`);
      }
      return;
    }
    if (loot && (e.key === 't' || e.key === 'T')) finishLoot('all');
  };

  const vet = (templateKey: string) => (world.killCounts?.[templateKey] ?? 0) >= 5;

  return (
    <div className="modal-backdrop">
      <div className="modal">
        <div className="modal-head">
          ⚔ {combat.encounterDesc}
          <span className="dim small">round {combat.round} · seed {combat.seed}</span>
          <span className="grow" />
          {over && <Tag tone={combat.outcome === 'victory' ? 'green' : 'red'}>{combat.outcome.toUpperCase()}</Tag>}
        </div>
        <div className="modal-body">
          <div className="combat-grid">
            <div>
              <h4>Party</h4>
              {party.map((c) => (
                <div key={c.id} className="card">
                  <div className="row">
                    <span className="name grow">{c.name} {c.hp.current === 0 && <Tag tone="red">down</Tag>}{c.statuses.filter((s) => s.key !== 'unconscious').map((s) => <Tag key={s.key} tone="red">{s.key}</Tag>)}</span>
                    <span className="mono dim">HP {c.hp.current}/{c.hp.max} · MP {c.mana.current} · ST {c.stamina.current}</span>
                  </div>
                  <Bar value={c.hp.current} max={c.hp.max} color="var(--danger)" />
                  {!over && c.hp.current > 0 && (
                    <div className="row">
                      <select value={planFor(c.id).type} onChange={(e) => setPlan(c.id, { type: e.target.value as CombatActionType, key: '' })}>
                        <option value="attack">Attack</option>
                        <option value="defend">Defend</option>
                        <option value="skill">Use Skill</option>
                        <option value="spell">Cast Spell</option>
                        <option value="item">Use Item</option>
                        <option value="flee">Flee</option>
                      </select>
                      {planFor(c.id).type === 'skill' && (
                        <select value={planFor(c.id).key} onChange={(e) => setPlan(c.id, { key: e.target.value })}>
                          <option value="">skill…</option>
                          {Object.entries(SKILLS).filter(([k]) => c.abilities.includes(k)).map(([k, s]) => (
                            <option key={k} value={k}>{s.name} ({s.stamina} st)</option>
                          ))}
                        </select>
                      )}
                      {planFor(c.id).type === 'spell' && (
                        <select value={planFor(c.id).key} onChange={(e) => setPlan(c.id, { key: e.target.value })}>
                          <option value="">spell…</option>
                          {Object.entries(SPELLS).filter(([k]) => c.abilities.includes(k)).map(([k, s]) => (
                            <option key={k} value={k}>{s.name} ({s.mana} mp)</option>
                          ))}
                        </select>
                      )}
                      {planFor(c.id).type === 'item' && (
                        <select value={planFor(c.id).key} onChange={(e) => setPlan(c.id, { key: e.target.value })}>
                          <option value="">item…</option>
                          {[...c.inventory, ...world.partyInventory].map((iid) => world.items[iid]).filter((it) => it && it.kind === 'potion').map((it) => (
                            <option key={it!.id} value={it!.id}>{it!.name}{it!.stackable ? ` ×${it!.qty ?? 1}` : ''}{it!.owner === 'PARTY' ? ' (party)' : ''}</option>
                          ))}
                        </select>
                      )}
                      {(planFor(c.id).type === 'item' || (planFor(c.id).type === 'spell' && (SPELLS[planFor(c.id).key]?.heal || SPELLS[planFor(c.id).key]?.cures))) && (
                        <select value={planFor(c.id).target || c.id} onChange={(e) => setPlan(c.id, { target: e.target.value })}>
                          {party.map((p) => (
                            <option key={p.id} value={p.id}>on {p.name}</option>
                          ))}
                        </select>
                      )}
                      {(planFor(c.id).type === 'attack' || planFor(c.id).type === 'skill' || (planFor(c.id).type === 'spell' && SPELLS[planFor(c.id).key]?.damage)) && (
                        <select value={planFor(c.id).target || defaultTarget} onChange={(e) => setPlan(c.id, { target: e.target.value })}>
                          {livingMonsters.map((m, i) => (
                            <option key={m.id} value={m.id}>
                              {i + 1}. {m.name} ({m.hp.current}/{m.hp.max}{vet(m.templateKey) ? ` · AC ${MONSTERS[m.templateKey].defense + (m.elite?.defenseBonus ?? 0)}` : ''})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              ))}
              <h4>Enemies</h4>
              {combat.monsters.map((m) => (
                <div key={m.id} className="card">
                  <div className="row" style={{ flexWrap: 'nowrap' }}>
                    <span style={{ filter: m.alive ? undefined : 'grayscale(1) brightness(0.55)' }}>
                      <MonsterPortrait templateKey={m.templateKey} size={42} world={world} />
                    </span>
                    <span className="grow">
                      <span className="row">
                        <span className="grow">{m.name} {!m.alive && <Tag tone="red">dead</Tag>} {m.fled && <Tag>fled</Tag>} {m.status.includes('stunned') && <Tag tone="gold">stunned</Tag>}</span>
                        <span className="mono dim">{m.alive ? `${m.hp.current}/${m.hp.max}` : '—'}</span>
                      </span>
                      {m.alive && <Bar value={m.hp.current} max={m.hp.max} color="var(--danger)" />}
                      {m.alive && vet(m.templateKey) && (
                        <span className="dim small mono" title="You've killed enough of these to know their measure.">
                          AC {MONSTERS[m.templateKey].defense + (m.elite?.defenseBonus ?? 0)} · ATK +{MONSTERS[m.templateKey].attack + (m.elite?.attackBonus ?? 0)}{m.elite ? ' · ELITE' : ''}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              ))}
              {!over && (
                <>
                  <button className="primary" style={{ width: '100%', marginTop: 6 }} onClick={resolve}>
                    Resolve Round {combat.round}
                  </button>
                  <div className="row" style={{ marginTop: 4 }}>
                    <button className="grow" onClick={combatAutoRound} title="One round on sensible autopilot: heals the hurt, braces or interrupts telegraphs, spends abilities when rich. (key: A)">▶ Auto round</button>
                    <button className="grow" onClick={combatAutoResolve} title="Let them fight — autopilot until it ends. For the fights that aren't the chapter. (key: L)">⏩ Let them fight</button>
                  </div>
                </>
              )}
            </div>
            <div>
              <h4>Combat log (canonical)</h4>
              <div className="combat-log">
                {combat.log.map((e, i) => (
                  <div key={i} className={e.result === 'crit' ? 'crit' : e.result === 'death' ? 'death' : e.result === 'miss' ? 'miss' : e.result === 'heal' ? 'heal' : 'hit'}>
                    <span className="r">[R{e.round}]</span> {e.text}
                  </div>
                ))}
                {combat.log.length === 0 && <span className="dim">Choose actions and resolve the first round.</span>}
              </div>
              {over && (
                <>
                  {combat.outcome === 'victory' && loot && !loot.taken && (
                    <div className="card" style={{ marginTop: 10 }}>
                      <h4>VICTORY <span className="dim mono">loot seed {loot.seed}</span></h4>
                      <div className="small dim" style={{ marginBottom: 4 }}>
                        {Object.entries(
                          combat.monsters.filter((m) => !m.alive).reduce<Record<string, number>>((acc, m) => {
                            acc[m.templateKey] = (acc[m.templateKey] ?? 0) + 1;
                            return acc;
                          }, {}),
                        ).map(([key, n]) => (
                          <div key={key}>{n}× {MONSTERS[key].name} — {MONSTERS[key].xp} XP each</div>
                        ))}
                        <div style={{ color: 'var(--accent)' }}>
                          {loot.xp} XP awarded in full to: {party.map((p) => p.name).join(', ')}
                        </div>
                      </div>
                      <h4>Treasure — {fmtMoney(loot.money)}</h4>
                      {loot.items.map((it, i) => (
                        <label key={it.id} className="row small" style={{ cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={picked.includes(i)}
                            onChange={(e) => setPicked(e.target.checked ? [...picked, i] : picked.filter((x) => x !== i))}
                          />
                          <span className="grow" style={{ color: tierColor(it.tier) }}>{it.name}{it.stackable && (it.qty ?? 1) > 1 ? ` ×${it.qty}` : ''}{it.tier && it.tier !== 'mundane' ? ` (${it.tier})` : ''}</span>
                          <span className="dim mono">{fmtMoney(it.value)}</span>
                        </label>
                      ))}
                      {loot.items.length === 0 && <p className="dim small">Nothing worth carrying besides the coin.</p>}
                      <div className="row">
                        <button className="primary" onClick={() => finishLoot('all')}>Take all</button>
                        <button onClick={() => finishLoot(picked)}>Take selected</button>
                        <button onClick={() => finishLoot('none')}>Leave it</button>
                      </div>
                    </div>
                  )}
                  <div className="row" style={{ marginTop: 10 }}>
                    <button onClick={() => appendToScene('Prose draft', combatToProse(combat.log, proseSeed))}>
                      Copy combat to prose
                    </button>
                    <button onClick={() => setProseSeed(randomSeed())} title="Re-word the draft; the facts cannot change.">
                      Reword draft
                    </button>
                    <button onClick={() => appendToScene('Author log', '[COMBAT LOG]\n' + combatToAuthorLog(combat.log))}>
                      Copy author log
                    </button>
                    <span className="grow" />
                    <button className="primary" disabled={combat.outcome === 'victory' && !!loot && !loot.taken} onClick={endCombatView}>
                      Close
                    </button>
                  </div>
                  <p className="dim small">The prose draft is generated from the log above — misses stay misses, and the killing blow belongs to whoever landed it.</p>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------- Chest loot ----------
export function ChestLootModal() {
  const chestLoot = useStore((s) => s.chestLoot);
  const takeChestLoot = useStore((s) => s.takeChestLoot);
  const [picked, setPicked] = useState<number[]>([]);
  if (!chestLoot) return null;
  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: 'min(480px, 92vw)' }}>
        <div className="modal-head">▣ Chest opened</div>
        <div className="modal-body">
          <p>{chestLoot.money} copper{chestLoot.items.length ? ' and:' : '. Otherwise empty.'}</p>
          {chestLoot.items.map((it, i) => (
            <label key={it.id} className="row small" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={picked.includes(i)}
                onChange={(e) => setPicked(e.target.checked ? [...picked, i] : picked.filter((x) => x !== i))}
              />
              <span className="grow">{it.name}</span>
              <span className="dim mono">{it.value}c</span>
            </label>
          ))}
          <div className="row" style={{ marginTop: 8 }}>
            <button className="primary" onClick={() => takeChestLoot('all')}>Take all</button>
            <button onClick={() => takeChestLoot(picked)}>Take selected</button>
            <button onClick={() => takeChestLoot('none')}>Leave it</button>
          </div>
        </div>
      </div>
    </div>
  );
}
