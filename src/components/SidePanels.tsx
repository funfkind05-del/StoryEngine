// Context-sensitive information panels, available without leaving the
// manuscript: location, characters, party, inventory, timeline,
// dungeon, events, relationships, continuity, household, saves.

import { useRef, useState } from 'react';
import { useStore, type PanelTab } from '../state/store';
import type { Character, DungeonRoom } from '../engine/types';
import { charactersAt, fmtTime, fmtWhen, locPath, xpForLevel } from '../engine/world';
import { checkAllScenes } from '../engine/continuity';
import { eventsToNotes } from '../engine/bridge';
import { TIER_INFO, TIER_ORDER, UPGRADES, findHome } from '../engine/household';
import {
  CLASSES,
  ITEM_PROTOS,
  NEEDS,
  STATUS_RULES,
  TEMPLE_SERVICES,
  dominantFaction,
  fmtMoney,
  levelUpAvailable,
  shopPriceMult,
  slotCapacity,
  slotsUsed,
  templePrice,
  tierColor,
  trainingCost,
} from '../engine/rules';
import { Bar, RelBar, Tag } from './common';
import { activeQuests, describeReward, objectiveDone, objectiveLabel, offeredQuestsAt, questProgress } from '../engine/quests';
import {
  chooseBackupFile,
  diskSaveSupported,
  getLinkedBackup,
  lastBackupAt,
  unlinkBackup,
  writeBackupNow,
} from '../engine/diskSave';

const TABS: { key: PanelTab; label: string }[] = [
  { key: 'location', label: 'Location' },
  { key: 'quests', label: 'Quests' },
  { key: 'characters', label: 'People' },
  { key: 'party', label: 'Party' },
  { key: 'inventory', label: 'Inventory' },
  { key: 'dungeon', label: 'Dungeon' },
  { key: 'events', label: 'Events' },
  { key: 'relationships', label: 'Bonds' },
  { key: 'timeline', label: 'Timeline' },
  { key: 'household', label: 'Home' },
  { key: 'continuity', label: 'Continuity' },
  { key: 'saves', label: 'Saves' },
];

export function SidePanels() {
  const panel = useStore((s) => s.panel);
  const setPanel = useStore((s) => s.setPanel);
  return (
    <div className="panels">
      <div className="panel-tabs">
        {TABS.map((t) => (
          <button key={t.key} className={panel === t.key ? 'active' : ''} onClick={() => setPanel(t.key)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="panel-body">
        {panel === 'location' && <LocationPanel />}
        {panel === 'quests' && <QuestsPanel />}
        {panel === 'characters' && <CharactersPanel />}
        {panel === 'party' && <PartyPanel />}
        {panel === 'inventory' && <InventoryPanel />}
        {panel === 'dungeon' && <DungeonPanel />}
        {panel === 'events' && <EventsPanel />}
        {panel === 'relationships' && <RelationshipsPanel />}
        {panel === 'timeline' && <TimelinePanel />}
        {panel === 'household' && <HouseholdPanel />}
        {panel === 'continuity' && <ContinuityPanel />}
        {panel === 'saves' && <SavesPanel />}
      </div>
    </div>
  );
}

// ---------- Location ----------
function LocationPanel() {
  const world = useStore((s) => s.world);
  const travel = useStore((s) => s.travel);
  const openPrep = useStore((s) => s.openPrep);
  const shopBuy = useStore((s) => s.shopBuy);
  const innRest = useStore((s) => s.innRest);
  const templeRite = useStore((s) => s.templeRite);
  const train = useStore((s) => s.train);
  const homeRest = useStore((s) => s.homeRest);
  const openTalk = useStore((s) => s.openTalk);
  const eatMeal = useStore((s) => s.eatMeal);
  const loc = world.locations[world.partyLocation];
  const mc = world.characters[world.mcId];
  if (!loc) return <p>Nowhere?</p>;
  const path = locPath(world, loc.id);
  const here = charactersAt(world, loc.id).filter((c) => c.persistent && !c.inParty);
  const scenesHere = world.scenes.filter((s) => s.location === loc.id);
  const party = Object.values(world.characters).filter((c) => c.inParty && c.alive);
  const trainees = party.filter((c) => (loc.trainerFor === c.charClass || (loc.temple && c.charClass === 'priest')) && levelUpAvailable(c));
  return (
    <div>
      <h3>{loc.name}</h3>
      <p className="dim small">{path.map((p) => p.name).join(' → ')}</p>
      <p>{loc.description}</p>
      {loc.atmosphere && <p className="dim small">{loc.atmosphere}</p>}
      <div className="row">
        <Tag tone={loc.dangerRating >= 6 ? 'red' : undefined}>danger {loc.dangerRating}/10</Tag>
        <Tag>{loc.type}</Tag>
        <Tag tone={loc.state !== 'open' ? 'red' : 'green'}>{loc.state}</Tag>
      </div>
      {loc.services.length > 0 && (
        <>
          <h4>Services</h4>
          <div>{loc.services.map((s) => <Tag key={s}>{s}</Tag>)}</div>
        </>
      )}
      {Object.keys(loc.factionInfluence).length > 0 && (
        <>
          <h4>Faction influence</h4>
          {Object.entries(loc.factionInfluence).map(([fid, v]) => (
            <div key={fid} className="row small">
              <span className="grow">{world.factions[fid]?.name ?? fid}</span>
              <span className="mono">{v}/10</span>
            </div>
          ))}
        </>
      )}
      <h4>Persistent NPCs here</h4>
      {here.length === 0 && <p className="dim small">No one of note.</p>}
      {here.map((c) => (
        <div key={c.id} className="card">
          <div className="row">
            <span className="name grow">{c.name}</span>
            {!world.combat && <button onClick={() => openTalk(c.id)}>🗨 Talk</button>}
          </div>
          <div className="small dim">{c.occupation} — {c.activity}</div>
        </div>
      ))}
      {loc.shop && (
        <>
          <h4>Shop — {mc.name} has {fmtMoney(mc.money)}</h4>
          {shopPriceMult(world, loc.id, mc) === Infinity && (
            <p className="warn small">They won't serve you here — not with your standing among {world.factions[dominantFaction(world, loc.id) ?? '']?.name ?? 'the local powers'}.</p>
          )}
          {loc.shop.stock.map((entry, i) => {
            const proto = ITEM_PROTOS[entry.proto];
            if (!proto) return null;
            const mult = shopPriceMult(world, loc.id, mc);
            const price = mult === Infinity ? entry.price : Math.round(entry.price * mult);
            return (
              <div key={entry.proto} className="row small">
                <span className="grow" style={{ color: tierColor(proto.tier) }}>
                  {proto.name}
                  {proto.damage ? ` (${proto.damage})` : ''}
                  {proto.defense ? ` (+${proto.defense} def)` : ''}
                </span>
                {entry.qty > 0 ? (
                  <>
                    <span className="dim mono">×{entry.qty}</span>
                    <button disabled={mc.money < price || mult === Infinity} onClick={() => shopBuy(i)} title={mult !== 1 && mult !== Infinity ? (mult < 1 ? 'friendly price — they like your reputation' : 'grudging price — they don\u2019t like your reputation') : undefined}>
                      {fmtMoney(price)}{mult !== 1 && mult !== Infinity ? (mult < 1 ? ' ▾' : ' ▴') : ''}
                    </button>
                  </>
                ) : (
                  <Tag tone="red">sold out</Tag>
                )}
              </div>
            );
          })}
          <p className="dim small">To sell, use the Inventory panel while you're here{loc.shop.buys ? '' : ' (this shop does not buy)'}.</p>
        </>
      )}
      {loc.services.includes('food') && (
        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={eatMeal}>🍲 Buy a hot meal for the party ({fmtMoney(5 * party.length)})</button>
        </div>
      )}
      {loc.innRooms && (
        <>
          <h4>Rooms for the night</h4>
          {loc.innRooms.map((r, i) => (
            <div key={r.name} className="row small">
              <span className="grow">{r.name}</span>
              <button onClick={() => innRest(i)} disabled={mc.money < r.price}>{fmtMoney(r.price)}</button>
            </div>
          ))}
        </>
      )}
      {loc.household && (
        <>
          <h4>Home</h4>
          <button onClick={homeRest}>Sleep in your own bed (free)</button>
        </>
      )}
      {loc.temple && (
        <>
          <h4>Temple services — {mc.name} has {fmtMoney(mc.money)}</h4>
          {TEMPLE_SERVICES.map((svc) => (
            <div key={svc.key} className="row small">
              <span className="grow">{svc.label}</span>
              <select
                value=""
                onChange={(e) => {
                  if (e.target.value) templeRite(svc.key, e.target.value);
                }}
              >
                <option value="">for… ({fmtMoney(templePrice(world, svc, mc, 'FAC_VEILEDFLAME'))})</option>
                {Object.values(world.characters)
                  .filter((c) => c.inParty || c.persistent)
                  .filter((c) => (svc.needsDead ? !c.alive : c.alive && c.inParty))
                  .map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
              </select>
            </div>
          ))}
        </>
      )}
      {(loc.trainerFor || loc.temple) && (
        <>
          <h4>Training{loc.trainerFor ? ` (${CLASSES[loc.trainerFor].label.toLowerCase()}s)` : ' (priests)'}</h4>
          {trainees.length === 0 && <p className="dim small">No one in the party is ready to train here.</p>}
          {trainees.map((c) => (
            <div key={c.id} className="row small">
              <span className="grow"><Tag tone="gold">LEVEL UP AVAILABLE</Tag> {c.name} → level {c.level + 1}</span>
              <button className="primary" onClick={() => train(c.id)}>{fmtMoney(trainingCost(c.level))}</button>
            </div>
          ))}
        </>
      )}
      {loc.dungeonId && !world.currentDungeon && (
        <>
          <h4>Dungeon</h4>
          <p className="small">{world.dungeons[loc.dungeonId].name} (levels {world.dungeons[loc.dungeonId].recommendedLevel})</p>
          <button className="primary" onClick={() => openPrep(loc.dungeonId!)}>Enter Dungeon…</button>
        </>
      )}
      <h4>Travel</h4>
      {loc.connections.filter((c) => world.locations[c]).map((cid) => (
        <div key={cid} className="row">
          <button className="grow" onClick={() => travel(cid)} disabled={!!world.currentDungeon}>
            → {world.locations[cid].name}
          </button>
        </div>
      ))}
      {scenesHere.length > 0 && (
        <>
          <h4>Scenes set here</h4>
          {scenesHere.map((s) => (
            <p key={s.id} className="small dim">Ch.{s.chapter} — {s.title} (Day {s.day})</p>
          ))}
        </>
      )}
    </div>
  );
}

// ---------- Quests ----------
function QuestsPanel() {
  const world = useStore((s) => s.world);
  const questAccept = useStore((s) => s.questAccept);
  const questDecline = useStore((s) => s.questDecline);
  const questTurnIn = useStore((s) => s.questTurnIn);
  const offered = offeredQuestsAt(world, world.partyLocation);
  const active = activeQuests(world);
  const completed = Object.values(world.quests).filter((q) => q.status === 'completed');
  const giverName = (q: (typeof active)[number]) => (q.giver === 'board' ? 'the notice board' : world.characters[q.giver]?.name ?? q.giver);
  return (
    <div>
      <h3>Quests</h3>
      <h4>On offer here</h4>
      {offered.length === 0 && <p className="dim small">No work on offer where you stand. Patrons and boards post jobs around the city as days pass.</p>}
      {offered.map((q) => (
        <div key={q.id} className="card">
          <div className="name">{q.title}</div>
          <p className="small">{q.description}</p>
          <p className="small dim">From {giverName(q)} · pays {describeReward(world, q)}{q.deadlineDay !== undefined ? ` · by Day ${q.deadlineDay}` : ''}</p>
          {q.objectives.map((o, i) => <p key={i} className="small">• {objectiveLabel(world, o)}</p>)}
          <div className="row">
            <button className="primary" onClick={() => questAccept(q.id)}>Accept</button>
            <button onClick={() => questDecline(q.id)}>Decline</button>
          </div>
        </div>
      ))}
      <h4>Active</h4>
      {active.length === 0 && <p className="dim small">The party owes no one anything. Enjoy it while it lasts.</p>}
      {active.map((q) => {
        const prog = questProgress(world, q);
        const late = q.deadlineDay !== undefined && world.time.day > q.deadlineDay;
        const ready = q.status === 'ready' || prog.done === prog.total;
        return (
          <div key={q.id} className="card">
            <div className="row">
              <span className="name grow">{q.title}</span>
              {ready ? <Tag tone="green">READY</Tag> : <Tag>{prog.done}/{prog.total}</Tag>}
              {late && <Tag tone="red">LATE</Tag>}
            </div>
            {q.objectives.map((o, i) => (
              <p key={i} className="small" style={objectiveDone(world, o) ? { color: 'var(--accent2)' } : undefined}>• {objectiveLabel(world, o)}</p>
            ))}
            <p className="small dim">Turn in with {giverName(q)} at {world.locations[q.giverLocation]?.name} · {describeReward(world, q)}{q.deadlineDay !== undefined ? ` · by Day ${q.deadlineDay}` : ''}</p>
            {ready && world.partyLocation === q.giverLocation && (
              <button className="primary" onClick={() => questTurnIn(q.id)}>Turn in — collect {describeReward(world, q)}</button>
            )}
          </div>
        );
      })}
      {completed.length > 0 && <p className="dim small">{completed.length} job{completed.length === 1 ? '' : 's'} completed.</p>}
    </div>
  );
}

// ---------- Characters ----------
function CharSheet({ c }: { c: Character }) {
  const world = useStore((s) => s.world);
  const a = c.attributes;
  return (
    <details>
      <summary>full sheet</summary>
      <table className="stats">
        <tbody>
          <tr><td>Class</td><td>{CLASSES[c.charClass].label} {levelUpAvailable(c) && <Tag tone="gold">LEVEL AVAILABLE → {CLASSES[c.charClass].trainer}</Tag>}</td></tr>
          <tr><td>Level / XP</td><td>{c.level} · {c.xp}/{xpForLevel(c.level)}</td></tr>
          <tr><td>STR/DEX/CON</td><td>{a.strength}/{a.dexterity}/{a.constitution}</td></tr>
          <tr><td>INT/WIS/CHA</td><td>{a.intelligence}/{a.wisdom}/{a.charisma}</td></tr>
          <tr><td>Atk / Def / Crit</td><td>{c.attack} / {c.defense} / {c.critChance}%</td></tr>
          <tr><td>Acc / Eva / Init</td><td>{c.accuracy} / {c.evasion} / {c.initiative}</td></tr>
          <tr><td>Resistances</td><td>{Object.entries(c.resistances).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}</td></tr>
          <tr><td>Abilities</td><td>{c.abilities.map((k) => k.replace(/-/g, ' ')).join(', ') || '—'}</td></tr>
          <tr><td>Skills</td><td>{Object.entries(c.skills).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}</td></tr>
          <tr><td>Money</td><td>{fmtMoney(c.money)}</td></tr>
          <tr><td>Bonuses</td><td>{[...c.permanentBonuses, ...c.tempBonuses.map((b) => `${b.source}: ${b.amount > 0 ? '+' : ''}${b.amount} ${b.stat} (${b.roundsLeft}r)`)].join('; ') || '—'}</td></tr>
          <tr><td>Values</td><td>{c.values.join(', ')}</td></tr>
          <tr><td>Goals</td><td>{c.objectives.join('; ') || '—'}</td></tr>
          <tr><td>Location</td><td>{world.locations[c.location]?.name ?? c.location}</td></tr>
        </tbody>
      </table>
      {c.memories.length > 0 && (
        <>
          <div className="dim small" style={{ marginTop: 6 }}>Memories</div>
          {c.memories.slice(-5).map((m, i) => (
            <p key={i} className="small">Day {m.day}: {m.event} <span className="dim">(importance {m.importance}, {m.emotionalValue >= 0 ? '+' : ''}{m.emotionalValue})</span></p>
          ))}
        </>
      )}
      {c.knowledge.length > 0 && (
        <>
          <div className="dim small" style={{ marginTop: 6 }}>Knows</div>
          {c.knowledge.slice(-6).map((k, i) => (
            <p key={i} className="small">{k.fact} {!k.accurate && <Tag tone="red">rumor</Tag>}</p>
          ))}
        </>
      )}
    </details>
  );
}

function CharactersPanel() {
  const world = useStore((s) => s.world);
  const promote = useStore((s) => s.promote);
  const toggleParty = useStore((s) => s.toggleParty);
  const openTalk = useStore((s) => s.openTalk);
  const [showBg, setShowBg] = useState(false);
  const chars = Object.values(world.characters).filter((c) => c.alive && (showBg || c.persistent));
  const atLoc = chars.filter((c) => c.location === world.partyLocation);
  const elsewhere = chars.filter((c) => c.location !== world.partyLocation);
  const renderChar = (c: Character) => (
    <div key={c.id} className="card">
      <div className="row">
        <span className="name grow">{c.name} {c.isMC && <Tag tone="gold">MC</Tag>} {c.inParty && !c.isMC && <Tag tone="green">party</Tag>} {!c.persistent && <Tag>background</Tag>}</span>
        <span className="mono dim">L{c.level}</span>
      </div>
      <div className="small dim">{c.race} {c.occupation}, {c.age} — {c.personality.join(', ')}</div>
      <div className="small dim">{c.activity} @ {world.locations[c.location]?.name ?? c.location}</div>
      {c.faction && <div className="small">{world.factions[c.faction]?.name}</div>}
      <div className="row">
        {!c.persistent && <button onClick={() => promote(c.id)}>Promote to persistent</button>}
        {!c.isMC && c.persistent && (
          <button onClick={() => toggleParty(c.id)}>{c.inParty ? 'Dismiss from party' : 'Add to party'}</button>
        )}
        {!c.isMC && c.location === world.partyLocation && !world.combat && (
          <button onClick={() => openTalk(c.id)}>🗨 Talk</button>
        )}
      </div>
      <CharSheet c={c} />
    </div>
  );
  return (
    <div>
      <h3>People</h3>
      <label className="small dim">
        <input type="checkbox" checked={showBg} onChange={(e) => setShowBg(e.target.checked)} /> show background NPCs
      </label>
      <h4>Present here</h4>
      {atLoc.map(renderChar)}
      {atLoc.length === 0 && <p className="dim small">Nobody here.</p>}
      <h4>Elsewhere in the city</h4>
      {elsewhere.map(renderChar)}
    </div>
  );
}

// ---------- Party ----------
function PartyPanel() {
  const world = useStore((s) => s.world);
  const openTalk = useStore((s) => s.openTalk);
  const party = Object.values(world.characters).filter((c) => c.inParty && c.alive);
  return (
    <div>
      <h3>Party</h3>
      {party.map((c) => (
        <div key={c.id} className="card">
          <div className="row">
            <span className="name grow">{c.name} <span className="dim small">{CLASSES[c.charClass].label}</span></span>
            <span className="mono dim">L{c.level} · {c.xp}/{xpForLevel(c.level)} xp</span>
            {!c.isMC && !world.combat && <button onClick={() => openTalk(c.id)}>🗨 Talk</button>}
          </div>
          {levelUpAvailable(c) && <Tag tone="gold">LEVEL AVAILABLE — trainer: {CLASSES[c.charClass].trainer}</Tag>}
          {c.statuses.length > 0 && (
            <div>{c.statuses.map((s) => <Tag key={s.key} tone="red">{STATUS_RULES[s.key].label}{s.roundsLeft !== undefined ? ` (${s.roundsLeft}r)` : ''}</Tag>)}</div>
          )}
          <div className="small dim">HP {c.hp.current}/{c.hp.max}</div>
          <Bar value={c.hp.current} max={c.hp.max} color="var(--danger)" />
          <div className="small dim">Mana {c.mana.current}/{c.mana.max}</div>
          <Bar value={c.mana.current} max={c.mana.max} color="var(--info)" />
          <div className="small dim">Stamina {c.stamina.current}/{c.stamina.max}</div>
          <Bar value={c.stamina.current} max={c.stamina.max} color="var(--accent2)" />
          {world.needsEnabled && (
            <>
              <div className="small dim">Hunger {Math.round(c.needs.hunger)}/100 {c.needs.hunger >= NEEDS.critical ? '— starving' : c.needs.hunger >= NEEDS.uncomfortable ? '— hungry' : ''}</div>
              <Bar value={c.needs.hunger} max={100} color={c.needs.hunger >= NEEDS.uncomfortable ? 'var(--danger)' : 'var(--text-dim)'} />
              <div className="small dim">Fatigue {Math.round(c.needs.fatigue)}/100 {c.needs.fatigue >= NEEDS.critical ? '— exhausted' : c.needs.fatigue >= NEEDS.uncomfortable ? '— tired' : ''}</div>
              <Bar value={c.needs.fatigue} max={100} color={c.needs.fatigue >= NEEDS.uncomfortable ? 'var(--danger)' : 'var(--text-dim)'} />
            </>
          )}
          <div className="small">
            {Object.entries(c.equipment).map(([slot, iid]) => (
              <Tag key={slot}>{slot}: {world.items[iid!]?.name ?? '—'}{world.items[iid!]?.broken ? ' (broken)' : ''}</Tag>
            ))}
          </div>
          <CharSheet c={c} />
        </div>
      ))}
    </div>
  );
}

// ---------- Inventory ----------
function ItemCard({ iid, ownerChar }: { iid: string; ownerChar?: string }) {
  const world = useStore((s) => s.world);
  const equip = useStore((s) => s.equip);
  const unequip = useStore((s) => s.unequip);
  const drinkPotion = useStore((s) => s.drinkPotion);
  const shopSell = useStore((s) => s.shopSell);
  const poolItem = useStore((s) => s.poolItem);
  const unpoolItem = useStore((s) => s.unpoolItem);
  const homeDeposit = useStore((s) => s.homeDeposit);
  const homeWithdraw = useStore((s) => s.homeWithdraw);
  const it = world.items[iid];
  if (!it) return null;
  const equipped = !!ownerChar && it.equippedBy === ownerChar;
  const loc = world.locations[world.partyLocation];
  const atHome = !!loc?.household;
  const inParty = it.owner === 'PARTY';
  const inHome = it.owner === 'HOME_STORAGE';
  return (
    <div className="card">
      <div className="row">
        <span className="grow" style={{ color: tierColor(it.tier) }}>
          {it.name}{it.stackable ? ` ×${it.qty ?? 1}` : ''} {it.broken && <Tag tone="red">broken</Tag>} {equipped && <Tag tone="green">equipped</Tag>} {it.tier && it.tier !== 'mundane' && <Tag>{it.tier}</Tag>}
        </span>
        <span className="mono dim">{fmtMoney(it.value)}</span>
      </div>
      <div className="small dim">
        {it.kind}{it.damage ? ` · dmg ${it.damage}` : ''}{it.defense ? ` · def +${it.defense}` : ''}
        {it.healing ? ` · heals ${it.healing}` : ''}
        {it.durability ? ` · durability ${it.durability.current}/${it.durability.max}` : ''}
      </div>
      <div className="row">
        {ownerChar && it.slot !== 'none' && !equipped && <button onClick={() => equip(iid)}>Equip</button>}
        {equipped && <button onClick={() => unequip(iid)}>Unequip</button>}
        {(it.kind === 'potion' || it.effectKey?.startsWith('food-')) && !world.combat?.active && (inParty || ownerChar) && <button onClick={() => drinkPotion(iid)}>Use</button>}
        {ownerChar && !equipped && <button onClick={() => poolItem(iid)} title="Move to shared party supplies">→ party</button>}
        {inParty && <button onClick={() => unpoolItem(iid)}>→ personal</button>}
        {atHome && !equipped && !inHome && <button onClick={() => homeDeposit(iid)}>→ storage</button>}
        {inHome && <button onClick={() => homeWithdraw(iid)}>take out</button>}
        {ownerChar && !equipped && loc?.shop?.buys && (
          <button onClick={() => shopSell(iid)}>Sell ({fmtMoney(Math.max(1, Math.floor(it.value * (loc.shop.buyRate ?? 0.5) * (it.broken ? 0.2 : 1))))})</button>
        )}
      </div>
      {it.history.length > 0 && (
        <details>
          <summary>history</summary>
          {it.history.map((h, i) => <p key={i} className="small dim">{h}</p>)}
        </details>
      )}
    </div>
  );
}

function InventoryPanel() {
  const world = useStore((s) => s.world);
  const party = Object.values(world.characters).filter((c) => c.inParty && c.alive);
  const loc = world.locations[world.partyLocation];
  const SLOT_LABELS: [string, string][] = [['main-hand', 'Main Hand'], ['off-hand', 'Off Hand'], ['armor', 'Body'], ['ring', 'Ring'], ['amulet', 'Amulet']];
  return (
    <div>
      <h3>Inventory</h3>
      {party.map((c) => (
        <div key={c.id}>
          <h4>
            {c.name} — {fmtMoney(c.money)}
            {world.encumbrance === 'light' && <span className="dim"> · pack {slotsUsed(world, c)}/{slotCapacity(c)} slots</span>}
          </h4>
          <div className="small dim" style={{ marginBottom: 4 }}>
            {SLOT_LABELS.map(([slot, label]) => {
              const iid = c.equipment[slot as 'main-hand'];
              return <span key={slot} style={{ marginRight: 10 }}>{label}: {iid ? world.items[iid]?.name : '—'}</span>;
            })}
          </div>
          {c.inventory.length === 0 && <p className="dim small">Empty pockets.</p>}
          {c.inventory.map((iid) => <ItemCard key={iid} iid={iid} ownerChar={c.id} />)}
        </div>
      ))}
      <h4>Party supplies (shared)</h4>
      {world.partyInventory.length === 0 && <p className="dim small">The expedition pool is empty.</p>}
      {world.partyInventory.map((iid) => <ItemCard key={iid} iid={iid} />)}
      {loc?.household && (
        <>
          <h4>Home storage</h4>
          {loc.household.storage.length === 0 && <p className="dim small">Bare shelves.</p>}
          {loc.household.storage.map((iid) => <ItemCard key={iid} iid={iid} />)}
        </>
      )}
    </div>
  );
}

// ---------- Dungeon ----------
function roomGlyph(r: DungeonRoom, itemsCount: number): string {
  const bits: string[] = [];
  if (r.isBossRoom) bits.push('☠');
  if (r.enemies === 'alive') bits.push('!');
  if (r.chest && !r.chest.opened) bits.push('▣');
  if (r.trap && !r.trap.disarmed && !r.trap.triggered) bits.push('✕');
  if (r.isStairsDown) bits.push('▼');
  if (r.isStairsUp) bits.push('▲');
  if (itemsCount > 0) bits.push('·');
  return bits.join('');
}

function DungeonPanel() {
  const world = useStore((s) => s.world);
  const move = useStore((s) => s.move);
  const leaveDungeon = useStore((s) => s.leaveDungeon);
  const search = useStore((s) => s.search);
  const disarm = useStore((s) => s.disarm);
  const lootChest = useStore((s) => s.lootChest);
  const fight = useStore((s) => s.fight);
  if (!world.currentDungeon || !world.currentRoom) {
    const entrances = Object.values(world.locations).filter((l) => l.dungeonId);
    return (
      <div>
        <h3>Dungeon</h3>
        <p className="dim">The party is above ground.</p>
        <h4>Known entrances</h4>
        {entrances.map((l) => (
          <div key={l.id} className="card">
            <div className="name">{world.dungeons[l.dungeonId!].name}</div>
            <div className="small dim">via {l.name} — recommended level {world.dungeons[l.dungeonId!].recommendedLevel}</div>
          </div>
        ))}
      </div>
    );
  }
  const d = world.dungeons[world.currentDungeon];
  const room = d.rooms[world.currentRoom];
  const floorRooms = Object.values(d.rooms).filter((r) => r.floor === room.floor);
  const maxX = Math.max(...floorRooms.map((r) => r.x)) + 1;
  const maxY = Math.max(...floorRooms.map((r) => r.y)) + 1;
  const grid: (DungeonRoom | null)[][] = Array.from({ length: maxY }, () => Array.from({ length: maxX }, () => null));
  for (const r of floorRooms) grid[r.y][r.x] = r;
  const can = (dir: keyof DungeonRoom['connections']) => !!room.connections[dir];
  return (
    <div>
      <h3>{d.name}</h3>
      <p className="dim small">Floor {room.floor} of {d.floors} · {d.dungeonType} {d.bossDefeated && <Tag tone="green">boss defeated</Tag>}</p>
      <div className="card">
        <div className="name">{room.name} <span className="mono dim">{room.id}</span></div>
        <p className="small">{room.description}</p>
        <div className="row">
          {room.enemies === 'alive' && <Tag tone="red">something lives here</Tag>}
          {room.enemies === 'dead' && <Tag>enemies dead</Tag>}
          {room.chest && !room.chest.opened && <Tag tone="gold">unopened chest</Tag>}
          {room.chest?.opened && <Tag>chest opened</Tag>}
          {room.trap && !room.trap.disarmed && !room.trap.triggered && <Tag tone="red">{room.trap.kind}</Tag>}
          {room.trap?.disarmed && <Tag>trap disarmed</Tag>}
          {room.secretDoor && !room.secretDoor.discovered && <Tag>?</Tag>}
          {room.secretDoor?.discovered && <Tag tone="gold">secret door</Tag>}
          {room.itemsRemaining.length > 0 && <Tag>items left: {room.itemsRemaining.map((i) => world.items[i]?.name).join(', ')}</Tag>}
        </div>
      </div>
      {room.enemies === 'alive' && !world.pendingEncounter && !world.combat && (
        <button className="danger" style={{ width: '100%', marginBottom: 8 }} onClick={() => fight()}>
          ⚔ ENCOUNTER AVAILABLE — Fight
        </button>
      )}
      <div className="compass">
        <span />
        <button disabled={!can('north')} onClick={() => move('north')}>N</button>
        <span />
        <button disabled={!can('west')} onClick={() => move('west')}>W</button>
        <button disabled={!can('down') && !can('up')} onClick={() => (can('down') ? move('down') : move('up'))}>
          {can('down') ? '▼' : '▲'}
        </button>
        <button disabled={!can('east')} onClick={() => move('east')}>E</button>
        <span />
        <button disabled={!can('south')} onClick={() => move('south')}>S</button>
        <span />
      </div>
      <div className="row">
        <button onClick={search}>Search room</button>
        {room.trap && !room.trap.disarmed && !room.trap.triggered && <button onClick={disarm}>Disarm trap</button>}
        {room.chest && !room.chest.opened && <button onClick={lootChest}>Open chest</button>}
        <button onClick={leaveDungeon}>Exit dungeon</button>
      </div>
      <h4>Floor map</h4>
      <div className="dmap" style={{ gridTemplateColumns: `repeat(${maxX}, 1fr)` }}>
        {grid.flatMap((row, y) =>
          row.map((r, x) => {
            if (!r) return <div key={`${x}-${y}`} className="dcell empty" />;
            if (!r.explored) return <div key={r.id} className="dcell unexplored">?</div>;
            const cls = `dcell${r.id === room.id ? ' current' : ''}${r.enemies === 'alive' ? ' hostile' : ''}`;
            return (
              <div key={r.id} className={cls} title={`${r.name} (${r.id})`}>
                {r.name.split(' ')[0]}
                <span className="dot">{roomGlyph(r, r.itemsRemaining.length)}</span>
              </div>
            );
          }),
        )}
      </div>
      <p className="dim small">! enemies · ▣ chest · ✕ trap · ☠ boss · ▼▲ stairs. Room state persists between visits.</p>
    </div>
  );
}

// ---------- Events ----------
function EventsPanel() {
  const world = useStore((s) => s.world);
  const selectedSceneId = useStore((s) => s.selectedSceneId);
  const updateScene = useStore((s) => s.updateScene);
  const setToast = useStore((s) => s.setToast);
  const [filter, setFilter] = useState('');
  const events = [...world.events].reverse().filter((e) => !filter || e.kind.startsWith(filter)).slice(0, 80);
  const kinds = Array.from(new Set(world.events.map((e) => e.kind.split('.')[0])));
  const copyNotes = () => {
    const scene = world.scenes.find((s) => s.id === selectedSceneId);
    if (!scene) {
      setToast('Select a scene first.');
      return;
    }
    const recent = world.events.slice(-12);
    updateScene(scene.id, { text: scene.text + '\n\n---\n[SIM NOTES]\n' + eventsToNotes(world, recent) + '\n---\n' });
    setToast('Recent events appended to scene as notes.');
  };
  return (
    <div>
      <h3>Event Log</h3>
      <div className="row">
        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">all kinds</option>
          {kinds.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <button onClick={copyNotes}>Copy recent → scene notes</button>
      </div>
      {events.map((e) => (
        <div key={e.id} className={`event-line${e.authorOverride ? ' override' : ''}`}>
          <div className="when">{fmtWhen(e.time)} · {e.kind}{e.seed !== undefined ? ` · seed ${e.seed}` : ''}</div>
          <div>{e.summary}</div>
          <details>
            <summary>layer 1 (structured)</summary>
            <pre>{JSON.stringify(e.data, null, 1)}</pre>
          </details>
        </div>
      ))}
    </div>
  );
}

// ---------- Relationships ----------
function RelationshipsPanel() {
  const world = useStore((s) => s.world);
  const mc = world.characters[world.mcId];
  const others = Object.values(world.characters).filter((c) => c.persistent && c.id !== mc.id && c.alive);
  return (
    <div>
      <h3>Bonds</h3>
      <h4>Faction standing</h4>
      {Object.values(world.factions).map((f) => {
        const rep = mc.factionReputation[f.id] ?? 0;
        return (
          <div key={f.id} className="row small">
            <span className="grow">{f.name}</span>
            <span className="mono" style={{ color: rep < 0 ? 'var(--danger)' : rep > 0 ? 'var(--accent2)' : 'var(--text-dim)' }}>{rep > 0 ? '+' : ''}{rep}</span>
          </div>
        );
      })}
      <p className="dim small">Standing changes prices, and blood debts get collected on the street.</p>
      <h4>People</h4>
      <p className="dim small">How others regard {mc.name}. These shift when characters witness acts that touch what they personally value — not because a quest completed.</p>
      {others.map((c) => {
        const rel = c.relationships[mc.id];
        if (!rel) return (
          <div key={c.id} className="card">
            <div className="name">{c.name}</div>
            <p className="dim small">No opinion of {mc.name} yet. (values: {c.values.join(', ')})</p>
          </div>
        );
        return (
          <div key={c.id} className="card">
            <div className="name">{c.name}</div>
            <p className="dim small">values: {c.values.join(', ')}</p>
            <RelBar label="Affection" value={rel.affection} />
            <RelBar label="Trust" value={rel.trust} />
            <RelBar label="Respect" value={rel.respect} />
            <RelBar label="Attraction" value={rel.attraction} />
            <RelBar label="Commitment" value={rel.commitment} />
          </div>
        );
      })}
    </div>
  );
}

// ---------- Timeline ----------
function TimelinePanel() {
  const world = useStore((s) => s.world);
  const commit = useStore((s) => s.commit);
  const ordered = [...world.scenes].sort((a, b) => a.order - b.order);
  return (
    <div>
      <h3>Timeline</h3>
      <p className="mono">{fmtWhen(world.time)}</p>
      <div className="row">
        <label>Chapter</label>
        <input
          type="number"
          value={world.chapter}
          onChange={(e) => {
            world.chapter = Math.max(1, parseInt(e.target.value || '1', 10));
            commit();
          }}
        />
      </div>
      <h4>Manuscript chronology</h4>
      {ordered.map((s) => (
        <div key={s.id} className="event-line">
          <div className="when">Ch.{s.chapter} · Day {s.day} · {fmtTime({ day: s.day, minute: s.startMinute })}</div>
          <div>{s.title} <span className="dim small">({world.locations[s.location]?.name})</span></div>
        </div>
      ))}
      <h4>World days with events</h4>
      {Array.from(new Set(world.events.map((e) => e.time.day))).map((d) => (
        <p key={d} className="small dim">Day {d}: {world.events.filter((e) => e.time.day === d).length} events</p>
      ))}
    </div>
  );
}

// ---------- Household ----------
function HouseholdPanel() {
  const world = useStore((s) => s.world);
  const homeUpgradeTier = useStore((s) => s.homeUpgradeTier);
  const homeBuyUpgrade = useStore((s) => s.homeBuyUpgrade);
  const homeCook = useStore((s) => s.homeCook);
  const homeSpar = useStore((s) => s.homeSpar);
  const homeBrew = useStore((s) => s.homeBrew);
  const homeRepair = useStore((s) => s.homeRepair);
  const homeId = findHome(world);
  const home = homeId ? world.locations[homeId] : null;
  const mc = world.characters[world.mcId];
  if (!home?.household) return <p className="dim">No home yet.</p>;
  const hh = home.household;
  const tierIdx = TIER_ORDER.indexOf(hh.tier);
  const next = tierIdx < TIER_ORDER.length - 1 ? TIER_ORDER[tierIdx + 1] : null;
  return (
    <div>
      <h3>{home.name}</h3>
      <p>{home.description}</p>
      <p className="small dim">Tier: {TIER_INFO[hh.tier].label} · {mc.name} has {mc.money} copper</p>
      {next && (
        <button className="primary" onClick={homeUpgradeTier}>
          Upgrade to {TIER_INFO[next].label} — {TIER_INFO[next].cost}c
        </button>
      )}
      <h4>Rooms & upgrades</h4>
      {hh.upgrades.length === 0 && <p className="dim small">Nothing but the bare walls.</p>}
      <div>{hh.upgrades.map((u) => <Tag key={u} tone="green">{UPGRADES.find((x) => x.key === u)?.label ?? u}</Tag>)}</div>
      <h4>Build</h4>
      {UPGRADES.filter((u) => !hh.upgrades.includes(u.key)).map((u) => (
        <div key={u.key} className="row">
          <span className="grow small">{u.label} {tierIdx < u.minTier && <span className="dim">(needs {TIER_INFO[TIER_ORDER[u.minTier]].label})</span>}</span>
          <button disabled={tierIdx < u.minTier || mc.money < u.cost} onClick={() => homeBuyUpgrade(u.key)}>{u.cost}c</button>
        </div>
      ))}
      <h4>Use the house</h4>
      <div className="row">
        {hh.upgrades.includes('kitchen') && <button onClick={homeCook}>🍲 Cook{hh.upgrades.includes('garden') ? ' (garden: free)' : ''}</button>}
        {hh.upgrades.includes('training-yard') && <button onClick={homeSpar}>⚔ Spar in the yard</button>}
        {hh.upgrades.includes('alchemy-room') && <button onClick={homeBrew}>⚗ Brew{hh.upgrades.includes('library') ? ' (library: better)' : ''}</button>}
      </div>
      {hh.upgrades.includes('workshop') && (
        <div className="row small">
          <label>🔧 Repair</label>
          <select value="" onChange={(e) => { if (e.target.value) homeRepair(e.target.value); }}>
            <option value="">choose gear…</option>
            {Object.values(world.items)
              .filter((i) => i.durability && i.durability.current < i.durability.max)
              .filter((i) => typeof i.owner === 'string' && (world.characters[i.owner]?.inParty || i.owner === 'HOME_STORAGE' || i.owner === 'PARTY'))
              .map((i) => (
                <option key={i.id} value={i.id}>{i.name} ({i.durability!.current}/{i.durability!.max})</option>
              ))}
          </select>
        </div>
      )}
      {!hh.upgrades.some((u) => ['kitchen', 'training-yard', 'alchemy-room', 'workshop'].includes(u)) && (
        <p className="dim small">Functional rooms (kitchen, yard, alchemy, workshop) unlock actions here once built.</p>
      )}
      <h4>Money chest (treasury)</h4>
      <p className="mono">{fmtMoney(hh.treasury)}</p>
      <TreasuryControls />
      <h4>Storage</h4>
      {hh.storage.length === 0 && <p className="dim small">Bare shelves. Deposit items from the Inventory panel while at home.</p>}
      {hh.storage.map((iid) => (
        <p key={iid} className="small" style={{ color: tierColor(world.items[iid]?.tier) }}>
          {world.items[iid]?.name}{world.items[iid]?.stackable ? ` ×${world.items[iid]?.qty ?? 1}` : ''}
        </p>
      ))}
      <h4>Residents</h4>
      {hh.residents.map((r) => <p key={r} className="small">{world.characters[r]?.name ?? r}</p>)}
    </div>
  );
}

function TreasuryControls() {
  const world = useStore((s) => s.world);
  const treasuryMove = useStore((s) => s.treasuryMove);
  const [amt, setAmt] = useState('100');
  const atHome = !!world.locations[world.partyLocation]?.household;
  if (!atHome) return <p className="dim small">Visit home to move coin.</p>;
  return (
    <div className="row">
      <input type="number" value={amt} onChange={(e) => setAmt(e.target.value)} style={{ width: 80 }} />
      <span className="dim small">copper</span>
      <button onClick={() => treasuryMove(parseInt(amt || '0', 10), 'deposit')}>Deposit</button>
      <button onClick={() => treasuryMove(parseInt(amt || '0', 10), 'withdraw')}>Withdraw</button>
    </div>
  );
}

// ---------- Continuity ----------
function ContinuityPanel() {
  const world = useStore((s) => s.world);
  const [results, setResults] = useState<ReturnType<typeof checkAllScenes> | null>(null);
  return (
    <div>
      <h3>Continuity</h3>
      <p className="dim small">Checks the manuscript against simulation state and returns warnings. It never rewrites your prose.</p>
      <button className="primary" onClick={() => setResults(checkAllScenes(world))}>Check all scenes</button>
      {results && results.length === 0 && <p style={{ color: 'var(--accent2)' }}>No contradictions found.</p>}
      {results?.map((w, i) => {
        const scene = world.scenes.find((s) => s.id === w.sceneId);
        return (
          <div key={i} className={w.severity === 'error' ? 'warn' : 'warn soft'}>
            <div className="dim small">{scene?.title ?? w.sceneId}</div>
            {w.message}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Disk backup ----------
function DiskBackupSection() {
  const world = useStore((s) => s.world);
  const snapshots = useStore((s) => s.snapshots);
  const setToast = useStore((s) => s.setToast);
  const [linked, setLinked] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  if (!checked) {
    setChecked(true);
    void getLinkedBackup().then((h) => setLinked(h?.name ?? null));
  }
  if (!diskSaveSupported()) {
    return (
      <>
        <h4>Disk backup</h4>
        <p className="dim small">This browser doesn't support direct file access — use Export below regularly instead.</p>
      </>
    );
  }
  return (
    <>
      <h4>Disk backup</h4>
      {linked ? (
        <div>
          <p className="small">
            Auto-backing up to <b>{linked}</b> (rewritten at most once a minute while you work).
            {lastBackupAt() > 0 && <span className="dim"> Last written {new Date(lastBackupAt()).toLocaleTimeString()}.</span>}
          </p>
          <div className="row">
            <button
              onClick={() => void writeBackupNow(world, snapshots).then((err) => setToast(err ?? 'Backup written.'))}
            >
              Write now
            </button>
            <button className="danger" onClick={() => void unlinkBackup().then(() => setLinked(null))}>Unlink</button>
          </div>
        </div>
      ) : (
        <div>
          <p className="dim small">localStorage can be evicted by the browser; a novel shouldn't live there alone. Link a file on disk and the app keeps it current automatically.</p>
          <button
            className="primary"
            onClick={() =>
              void chooseBackupFile().then((h) => {
                if (h) {
                  setLinked(h.name);
                  void writeBackupNow(world, snapshots).then((err) => setToast(err ?? `Backing up to ${h.name}.`));
                }
              })
            }
          >
            Link backup file…
          </button>
        </div>
      )}
    </>
  );
}

// ---------- Saves ----------
function SavesPanel() {
  const world = useStore((s) => s.world);
  const snapshots = useStore((s) => s.snapshots);
  const manualSave = useStore((s) => s.manualSave);
  const restore = useStore((s) => s.restore);
  const deleteSnapshot = useStore((s) => s.deleteSnapshot);
  const doExport = useStore((s) => s.doExport);
  const doImport = useStore((s) => s.doImport);
  const resetWorld = useStore((s) => s.resetWorld);
  const [label, setLabel] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const setDeathRule = useStore((s) => s.setDeathRule);
  const setEncumbrance = useStore((s) => s.setEncumbrance);
  const setNeedsEnabled = useStore((s) => s.setNeedsEnabled);
  return (
    <div>
      <h3>Saves & Rules</h3>
      <h4>World rules</h4>
      <div className="row small">
        <label className="grow">Death</label>
        <select value={world.deathRule} onChange={(e) => setDeathRule(e.target.value as never)}>
          <option value="story">Story Mode (companions survive defeat)</option>
          <option value="classic">Classic RPG (dead; temple resurrection)</option>
          <option value="permadeath">Permadeath</option>
        </select>
      </div>
      <div className="row small">
        <label className="grow">Survival needs (food & sleep)</label>
        <select value={world.needsEnabled ? 'on' : 'off'} onChange={(e) => setNeedsEnabled(e.target.value === 'on')}>
          <option value="on">Tracked (hunger & fatigue matter)</option>
          <option value="off">Off</option>
        </select>
      </div>
      <div className="row small">
        <label className="grow">Encumbrance</label>
        <select value={world.encumbrance} onChange={(e) => setEncumbrance(e.target.value as never)}>
          <option value="off">Off</option>
          <option value="light">Light (slots)</option>
          <option value="full">Full (treated as Light for now)</option>
        </select>
      </div>
      <DiskBackupSection />
      <h4>Checkpoints</h4>
      <div className="row">
        <input type="text" className="grow" placeholder="checkpoint label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button className="primary" onClick={() => { manualSave(label); setLabel(''); }}>Save</button>
      </div>
      <div className="row">
        <button onClick={doExport}>Export project (.json)</button>
        <button onClick={() => fileRef.current?.click()}>Import…</button>
        <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }} />
        <button
          className="danger"
          onClick={() => { if (confirm('Reset the entire world and manuscript? Export first if you care about this one.')) resetWorld(); }}
        >
          Reset world
        </button>
      </div>
      <p className="dim small">Sim clock now: {fmtWhen(world.time)} · autosaves keep the last 20; restore, change your preparation, and simulate again.</p>
      {[...snapshots].reverse().map((s) => (
        <div key={s.id} className="card">
          <div className="row">
            <span className="grow">{s.label} <Tag tone={s.kind === 'manual' ? 'gold' : undefined}>{s.kind}</Tag></span>
          </div>
          <div className="small dim">Day {s.day}, {fmtTime({ day: s.day, minute: s.minute })} · saved {new Date(s.createdAt).toLocaleString()}</div>
          <div className="row">
            <button onClick={() => { if (confirm(`Restore "${s.label}"? Current unsaved state will be replaced.`)) restore(s.id); }}>Restore</button>
            <button className="danger" onClick={() => deleteSnapshot(s.id)}>Delete</button>
          </div>
        </div>
      ))}
    </div>
  );
}
