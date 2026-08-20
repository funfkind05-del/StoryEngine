// Context-sensitive information panels, available without leaving the
// manuscript: location, characters, party, inventory, timeline,
// dungeon, events, relationships, continuity, household, saves.

import { useRef, useState } from 'react';
import { useStore, type PanelTab } from '../state/store';
import type { Character, DungeonRoom } from '../engine/types';
import { charactersAt, fmtTime, fmtWhen, locPath, xpForLevel } from '../engine/world';
import { checkAllScenes } from '../engine/continuity';
import { eventsToNotes } from '../engine/bridge';
import { TIER_INFO, TIER_ORDER, UPGRADES, UPGRADE_EFFECTS, findHome } from '../engine/household';
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
import { CAMPAIGN, campaignStageNumber, latestRevelation, mainQuests } from '../engine/campaign';
import { GUILDS, guildRank, guildTitle } from '../engine/guilds';
import { DATE_ACTIVITIES, STAGE_LABELS, relationshipStage } from '../engine/romance';
import { MonsterPortrait } from './MonsterArt';
import { CharacterPortrait } from './CharacterArt';
import { activeSlot, listBooks } from '../engine/books';
import { developIdea, generateStoryIdeas, type StoryIdea } from '../engine/muse';
import { loadLlmConfig } from '../engine/npcChat';
import { MONSTERS } from '../engine/monsters';
import { CARRIAGE_STOPS } from '../engine/services';
import { RECIPES, canCraft } from '../engine/crafting';
import { ascensionOptions } from '../engine/progression';
import { COMPANION_ARCS } from '../engine/companions';
import { FirstPersonView } from './FirstPersonView';
import { isDark } from '../engine/dungeon';
import { composeTheme } from '../engine/musicLlm';
import { deleteMusicFile, saveMusicFile } from '../engine/musicFiles';
import { setCustomComposition, setThemeAudio, themeSource, type MusicTheme } from '../sound';
import { LOREBOOKS, loreById } from '../engine/codex';
import { ACHIEVEMENTS } from '../engine/achievements';
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
  { key: 'muse', label: 'Muse' },
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
        {panel === 'muse' && <MusePanel />}
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
  const crimePickpocket = useStore((s) => s.crimePickpocket);
  const crimeBurgle = useStore((s) => s.crimeBurgle);
  const crimePayBounty = useStore((s) => s.crimePayBounty);
  const guildJoin = useStore((s) => s.guildJoin);
  const eventEngage = useStore((s) => s.eventEngage);
  const carriageRide = useStore((s) => s.carriageRide);
  const fishAct = useStore((s) => s.fishAct);
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
            {!world.combat && <button title="Lift their purse — stealth against their wits. Getting caught has a price." onClick={() => crimePickpocket(c.id)}>🫳</button>}
          </div>
          <div className="small dim">
            {COMPANION_ARCS.some((a) => a.charId === c.id) && !c.inParty && (
              <div><Tag tone="gold">✦ recruitable — has a story</Tag></div>
            )}
            {c.occupation} — {c.activity}
          </div>
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
            const fac = dominantFaction(world, loc.id);
            const locked = !!entry.minRep && (fac ? mc.factionReputation[fac] ?? 0 : 0) < entry.minRep;
            if (locked) return (
              <div key={entry.proto} className="row small">
                <span className="grow dim">{proto.name}</span>
                <span className="dim small" title={`Under the counter — needs standing ${entry.minRep}+ with ${world.factions[fac ?? '']?.name ?? 'the street'}.`}>🔒 rep {entry.minRep}+</span>
              </div>
            );
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
          <p className="dim small">To sell, use the Inventory panel while you're here{loc.shop.buys ? '' : ' (this shop does not buy)'}{loc.shop.fence ? ' — this one doesn\u2019t ask where things came from' : ''}.</p>
          {(world.time.minute < 6 * 60 || world.time.minute >= 21 * 60) && (
            <button className="danger" onClick={crimeBurgle} title="Break in after dark. Lockpicking and stealth against the district's watchfulness.">🌙 Burgle the shop</button>
          )}
        </>
      )}
      {(world.activeEvents ?? []).some((e) => e.locationId === loc.id) && (
        <div className="warn" style={{ borderLeftColor: 'var(--accent)' }}>
          <b>⚡ {(world.activeEvents ?? []).find((e) => e.locationId === loc.id)!.description}</b>
          <div className="row">
            <button className="primary" onClick={eventEngage}>Step in</button>
            <span className="dim small">expires Day {(world.activeEvents ?? []).find((e) => e.locationId === loc.id)!.expiresDay}</span>
          </div>
        </div>
      )}
      {CARRIAGE_STOPS.includes(loc.id) && (
        <div className="row small">
          <label>🐎 Carriage</label>
          <select value="" onChange={(e) => { if (e.target.value) carriageRide(e.target.value); }}>
            <option value="">ride to… (1s, no trouble)</option>
            {CARRIAGE_STOPS.filter((sId) => sId !== loc.id).map((sId) => (
              <option key={sId} value={sId}>{world.locations[sId]?.name}</option>
            ))}
          </select>
        </div>
      )}
      {(loc.type === 'dock' || loc.services.includes('passage')) && (
        <div className="row"><button onClick={fishAct}>🎣 Fish off the pilings (1h)</button></div>
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
      {(world.bounty ?? 0) > 0 && (loc.factionInfluence['FAC_WATCH'] ?? 0) >= 4 && (
        <div className="row" style={{ marginTop: 8 }}>
          <button onClick={crimePayBounty}>⚖ Pay bounty at the watch-house desk ({fmtMoney(world.bounty ?? 0)})</button>
        </div>
      )}
      {GUILDS.some((g) => g.location === loc.id) && (() => {
        const g = GUILDS.find((x) => x.location === loc.id)!;
        const rank = guildRank(world, g.key);
        return (
          <>
            <h4>{g.name} membership</h4>
            {rank === null ? (
              <button className="primary" onClick={() => guildJoin(g.key)}>Sign the book — join for {fmtMoney(g.joinFee)}</button>
            ) : (
              <p className="small">
                <Tag tone="gold">{guildTitle(world, g.key)}</Tag> rank {rank}/{g.ranks.length}
                {rank < g.ranks.length ? ' — the next trial is on the board (Quests panel).' : ' — the guild has nothing left to teach.'}
                {rank > 0 && ` Training here is ${rank * 10}% off.`}
              </p>
            )}
          </>
        );
      })()}
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

// ---------- Muse ----------
function MusePanel() {
  const world = useStore((s) => s.world);
  const setMuseOutline = useStore((s) => s.setMuseOutline);
  const setToast = useStore((s) => s.setToast);
  const [developed, setDeveloped] = useState<Record<string, { busy: boolean; text: string | null }>>({});
  const ideas = generateStoryIdeas(world);
  const develop = async (idea: StoryIdea) => {
    setDeveloped((d) => ({ ...d, [idea.title]: { busy: true, text: null } }));
    try {
      const text = await developIdea(loadLlmConfig(), world, idea);
      setDeveloped((d) => ({ ...d, [idea.title]: { busy: false, text } }));
    } catch (e) {
      setDeveloped((d) => ({ ...d, [idea.title]: { busy: false, text: null } }));
      setToast(`Develop failed: ${e instanceof Error ? e.message : e}`);
    }
  };
  return (
    <div>
      <h3>Muse</h3>
      <p className="dim small">
        Story hooks mined from the simulation right now — every one grounded in cited sim facts,
        most pressing first. They refresh as the world changes. Nothing here is canon; it's material.
      </p>
      {ideas.length === 0 && <p className="dim">The world is quiet. Advance time, travel, or stir something up.</p>}
      <details style={{ marginBottom: 8 }}>
        <summary>📜 Codex — {(world.codex ?? []).length}/{LOREBOOKS.length} recovered writings</summary>
        {(world.codex ?? []).length === 0 && <p className="dim small">Lorebooks wait in the dungeons; each one is a page of what lies beneath.</p>}
        {(world.codex ?? []).map((id) => {
          const lore = loreById(id);
          if (!lore) return null;
          return (
            <div key={id} className="card">
              <div className="name">{lore.title}</div>
              <p className="small" style={{ fontFamily: 'var(--serif)' }}>{lore.text}</p>
            </div>
          );
        })}
      </details>
      {ideas.map((idea) => {
        const dev = developed[idea.title];
        return (
          <div key={idea.title} className="card">
            <div className="row">
              <span className="name grow">{idea.title}</span>
              <Tag tone={idea.urgency >= 8 ? 'red' : idea.urgency >= 5 ? 'gold' : undefined}>{idea.kind}</Tag>
            </div>
            <p className="small">{idea.pitch}</p>
            <details>
              <summary>grounded in</summary>
              {idea.grounding.map((g, i) => <p key={i} className="small dim">• {g}</p>)}
            </details>
            <div className="row">
              <button
                className="primary"
                onClick={() => { setMuseOutline(idea.outline); setToast('Outline loaded into Draft Scene — write it or let the LLM take the first pass.'); }}
                title="Open the Draft Scene box pre-filled with this idea's outline."
              >
                🪶 Use as outline
              </button>
              <button disabled={dev?.busy} onClick={() => void develop(idea)} title="Ask the LLM for three concrete directions plus a complication.">
                {dev?.busy ? 'thinking…' : '✨ Develop'}
              </button>
            </div>
            {dev?.text && <div className="sugg-text" style={{ marginTop: 6 }}>{dev.text}</div>}
          </div>
        );
      })}
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
  const stage = campaignStageNumber(world);
  const revelation = latestRevelation(world);
  const spineOpen = mainQuests(world).find((q) => q.status !== 'completed' && q.status !== 'declined');
  return (
    <div>
      <h3>Quests</h3>
      <div className="card" style={{ borderColor: 'var(--accent)' }}>
        <div className="row">
          <span className="name grow">⚜ What Lies Beneath Blackwall</span>
          <Tag tone="gold">stage {Math.min(stage, CAMPAIGN.length)}/{CAMPAIGN.length}</Tag>
        </div>
        {spineOpen ? (
          <p className="small">Current: <b>{spineOpen.title}</b> — {spineOpen.status === 'offered' ? `on offer from ${giverName(spineOpen)} at ${world.locations[spineOpen.giverLocation]?.name}` : spineOpen.status === 'ready' ? 'done — collect and learn what it means' : 'in progress'}.</p>
        ) : (
          <p className="small">The recorded spine is complete. What comes after is yours to write.</p>
        )}
        {revelation && (
          <details>
            <summary>latest revelation</summary>
            <p className="small" style={{ color: 'var(--accent)' }}>{revelation}</p>
          </details>
        )}
      </div>
      <h4>On offer here</h4>
      {offered.length === 0 && <p className="dim small">No work on offer where you stand. Patrons and boards post jobs around the city as days pass.</p>}
      {offered.map((q) => (
        <div key={q.id} className="card" style={q.isMain ? { borderColor: 'var(--accent)' } : undefined}>
          <div className="name">{q.isMain && '⚜ '}{q.title}</div>
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
          <div key={q.id} className="card" style={q.isMain ? { borderColor: 'var(--accent)' } : undefined}>
            <div className="row">
              <span className="name grow">{q.isMain && '⚜ '}{q.title}</span>
              {q.guild && <Tag>{GUILDS.find((g) => g.key === q.guild)?.name}</Tag>}
              {ready ? <Tag tone="green">READY</Tag> : <Tag>{prog.done}/{prog.total}</Tag>}
              {late && <Tag tone="red">LATE</Tag>}
            </div>
            {q.objectives.map((o, i) => (
              <p key={i} className="small" style={objectiveDone(world, o) ? { color: 'var(--accent2)' } : undefined}>• {objectiveLabel(world, o)}</p>
            ))}
            <p className="small dim">Turn in with {giverName(q)} at {world.locations[q.giverLocation]?.name} · {describeReward(world, q)}{q.deadlineDay !== undefined ? ` · by Day ${q.deadlineDay}` : ''}</p>
            {ready && world.partyLocation === q.giverLocation && (
              q.choice && !q.choice.chosen ? (
                <div>
                  <p className="small" style={{ color: 'var(--accent)' }}>{q.choice.prompt}</p>
                  {q.choice.options.map((o) => (
                    <div key={o.key} className="row small">
                      <button className="primary" onClick={() => questTurnIn(q.id, o.key)}>{o.label}</button>
                      <span className="dim grow">{o.description}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <button className="primary" onClick={() => questTurnIn(q.id)}>Turn in — collect {describeReward(world, q)}</button>
              )
            )}
          </div>
        );
      })}
      {completed.length > 0 && <p className="dim small">{completed.length} job{completed.length === 1 ? '' : 's'} completed.</p>}
    </div>
  );
}

function PortraitUpload({ charId }: { charId: string }) {
  const world = useStore((s) => s.world);
  const setCharacterArt = useStore((s) => s.setCharacterArt);
  const setToast = useStore((s) => s.setToast);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <button title="Upload a portrait for this character (stored in the save)" onClick={() => ref.current?.click()}>🖼</button>
      {world.characterArt?.[charId] && <button title="Revert to the drawn portrait" onClick={() => setCharacterArt(charId, null)}>↺</button>}
      <input ref={ref} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        if (f.size > 400_000) { setToast('Keep portraits under 400 KB — they live inside the save file.'); return; }
        const reader = new FileReader();
        reader.onload = () => setCharacterArt(charId, String(reader.result));
        reader.readAsDataURL(f);
      }} />
    </>
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
      <div className="row" style={{ flexWrap: 'nowrap' }}>
        <CharacterPortrait charId={c.id} size={36} world={world} />
        <span className="name grow">{c.name} {c.isMC && <Tag tone="gold">MC</Tag>} {c.inParty && !c.isMC && <Tag tone="green">party</Tag>} {!c.persistent && <Tag>background</Tag>}</span>
        <span className="mono dim">L{c.level}</span>
        <PortraitUpload charId={c.id} />
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
  const spendPoint = useStore((s) => s.spendPoint);
  const ascend = useStore((s) => s.ascend);
  const setRow = useStore((s) => s.setRow);
  const party = Object.values(world.characters).filter((c) => c.inParty && c.alive);
  return (
    <div>
      <h3>Party</h3>
      {party.map((c) => (
        <div key={c.id} className="card">
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <CharacterPortrait charId={c.id} size={40} world={world} />
            <span className="name grow">{c.name} <span className="dim small">{c.title ? `${c.title} · ` : ''}{CLASSES[c.charClass].label}</span></span>
            <button
              className="row-toggle"
              onClick={() => setRow(c.id, (c.row ?? 'front') === 'front' ? 'back' : 'front')}
              title="Battle line: melee only reaches the front rank — until the front rank is down. Bows and spells reach from anywhere; melee from the back swings at -4."
            >
              {(c.row ?? 'front') === 'front' ? '🛡 front' : '🏹 back'}
            </button>
            <span className="mono dim">L{c.level} · {c.xp}/{xpForLevel(c.level)} xp</span>
            {!c.isMC && !world.combat && <button onClick={() => openTalk(c.id)}>🗨 Talk</button>}
          </div>
          {c.injuries.some((i) => !i.treated) && (
            <div>{c.injuries.filter((i) => !i.treated).map((i, idx) => <Tag key={idx} tone="red">{i.name} ({i.stat} {i.amount})</Tag>)}</div>
          )}
          {levelUpAvailable(c) && <Tag tone="gold">LEVEL AVAILABLE — trainer: {CLASSES[c.charClass].trainer}</Tag>}
          {ascensionOptions(c).length > 0 && (
            <div className="row small">
              <Tag tone="gold">ASCENSION OPEN — the rite waits at the {CLASSES[c.charClass].trainer}</Tag>
              {ascensionOptions(c).map((path) => (
                <button key={path.key} onClick={() => ascend(c.id, path.key)} title={`${path.blurb} (${fmtMoney(2000)}, at the class hall)`}>{path.label}</button>
              ))}
            </div>
          )}
          {(c.attributePoints ?? 0) > 0 && (
            <div className="row small">
              <Tag tone="gold">{c.attributePoints} attribute point{c.attributePoints === 1 ? '' : 's'}</Tag>
              {(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const).map((a) => (
                <button key={a} onClick={() => spendPoint(c.id, a)} title={`+1 ${a}`}>{a.slice(0, 3).toUpperCase()}+</button>
              ))}
            </div>
          )}
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
  const identify = useStore((s) => s.identifyItem);
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
          {it.name}{it.stackable ? ` ×${it.qty ?? 1}` : ''} {it.broken && <Tag tone="red">broken</Tag>} {equipped && <Tag tone="green">equipped</Tag>} {it.tier && it.tier !== 'mundane' && <Tag>{it.tier}</Tag>} {it.unidentified && <Tag tone="gold">unidentified ✦</Tag>}
        </span>
        <span className="mono dim">{fmtMoney(it.value)}</span>
      </div>
      <div className="small dim">
        {it.kind}{it.damage ? ` · dmg ${it.damage}` : ''}{it.defense ? ` · def +${it.defense}` : ''}
        {it.healing ? ` · heals ${it.healing}` : ''}
        {it.durability ? ` · durability ${it.durability.current}/${it.durability.max}` : ''}
        {!it.unidentified && it.affix ? ` · ${it.affix.name} (+${it.affix.amount} ${it.affix.stat})` : ''}
        {!it.unidentified && it.affix2 ? ` · ${it.affix2.name} (+${it.affix2.amount} ${it.affix2.stat})` : ''}
      </div>
      {it.lore && <p className="small dim" style={{ fontStyle: 'italic', margin: '4px 0 0' }}>{it.lore}</p>}
      <div className="row">
        {it.unidentified && <button onClick={() => identify(iid)} title="The Arcane College reads enchantments for a fee — or Kess will, once she trusts you with her past.">✦ Identify</button>}
        {ownerChar && it.slot !== 'none' && !equipped && <button disabled={it.unidentified} title={it.unidentified ? 'Identify it first.' : undefined} onClick={() => equip(iid)}>Equip</button>}
        {equipped && <button onClick={() => unequip(iid)}>Unequip</button>}
        {(it.kind === 'potion' || it.effectKey?.startsWith('food-') || it.effectKey?.startsWith('teach-')) && !world.combat?.active && (inParty || ownerChar) && <button onClick={() => drinkPotion(iid)} title={it.effectKey?.startsWith('teach-') ? 'Study it — learn the ability inside, forever.' : undefined}>{it.effectKey?.startsWith('teach-') ? '📖 Study' : 'Use'}</button>}
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
  const pickLockAct = useStore((s) => s.pickLockAct);
  const shrineAct = useStore((s) => s.shrineAct);
  const lorebookAct = useStore((s) => s.lorebookAct);
  const gatherAct = useStore((s) => s.gatherAct);
  const torchAct = useStore((s) => s.torchAct);
  const campAct = useStore((s) => s.campAct);
  const moveScheme = useStore((s) => s.moveScheme);
  const setMoveScheme = useStore((s) => s.setMoveScheme);
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
      <div className="dungeon-cols">
      <div className="dcol">
      <FirstPersonView />
      <p className="dim small keys-hint">⌨ arrows {moveScheme === 'relative' ? 'walk & turn' : 'walk'} · S search · C chest · F fight · T torch · &lt; &gt; stairs</p>
      <div className="row small">
        <span className="grow">
          {(world.torchMinutes ?? 0) > 0
            ? `🔥 torchlight: ${world.torchMinutes} min`
            : isDark(world) ? '🌑 pitch dark — searching and lockwork suffer' : ''}
        </span>
        <button onClick={torchAct} title="Burn a torch from the packs: +90 minutes of light. (key: T)">🔥 Light torch</button>
        <select value={moveScheme} onChange={(e) => setMoveScheme(e.target.value as 'compass' | 'relative')} title="Compass: arrows are absolute N/S/E/W. Crawler: up walks forward, left/right turn — the old way.">
          <option value="compass">compass keys</option>
          <option value="relative">crawler keys</option>
        </select>
      </div>
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
          🗡 ENCOUNTER AVAILABLE — Fight
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
        {room.lockedDoor && !room.lockedDoor.opened && <button onClick={pickLockAct}>🔒 Pick lock ({room.lockedDoor.dir})</button>}
        {room.shrine && !room.shrine.used && <button onClick={shrineAct}>🕯 Pray at the shrine</button>}
        {room.lorebook && !room.lorebook.taken && <button onClick={lorebookAct}>📜 Take the writings</button>}
        {room.resource && !room.resource.gathered && <button onClick={gatherAct}>⛏ Gather {room.resource.proto.replace(/-/g, ' ')}</button>}
        <button onClick={campAct} title="Rest 8 hours underground: real recovery, real chance something finds the fire.">⛺ Camp</button>
        <button onClick={leaveDungeon}>Exit dungeon</button>
      </div>
      </div>
      <div className="dcol">
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
      </div>
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
  const gift = useStore((s) => s.gift);
  const date = useStore((s) => s.date);
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
        const stage = STAGE_LABELS[relationshipStage(rel)];
        const here = c.location === world.partyLocation;
        return (
          <div key={c.id} className="card">
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <CharacterPortrait charId={c.id} size={34} world={world} />
              <span className="name grow">{c.name}</span>
              <Tag tone={['Lover', 'Partner', 'Spouse'].includes(stage) ? 'gold' : undefined}>{stage}</Tag>
            </div>
            <p className="dim small">values: {c.values.join(', ')}</p>
            <RelBar label="Affection" value={rel.affection} />
            <RelBar label="Trust" value={rel.trust} />
            <RelBar label="Respect" value={rel.respect} />
            <RelBar label="Attraction" value={rel.attraction} />
            <RelBar label="Commitment" value={rel.commitment} />
            {here && (
              <div className="row small">
                <select value="" onChange={(e) => { if (e.target.value) gift(c.id, e.target.value); }} title="A gift says what you see in her — match her values, not the price tag.">
                  <option value="">🎁 give…</option>
                  {mc.inventory.map((iid) => world.items[iid]).filter((i) => i && !i.equippedBy).map((i) => (
                    <option key={i!.id} value={i!.id}>{i!.name}</option>
                  ))}
                </select>
                <select value="" onChange={(e) => { if (e.target.value) date(c.id, e.target.value); }} title="Time together moves what gifts can't.">
                  <option value="">🕯 spend time…</option>
                  {DATE_ACTIVITIES.map((a) => <option key={a.key} value={a.key}>{a.label}{a.cost ? ` (${fmtMoney(a.cost)})` : ''}</option>)}
                </select>
              </div>
            )}
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
      <h4>Writing dashboard</h4>
      {(() => {
        const stats = Object.entries(world.writingStats ?? {}).sort(([a], [b]) => a.localeCompare(b));
        if (!stats.length) return <p className="dim small">Word counts appear as you write.</p>;
        const total = stats[stats.length - 1][1];
        const deltas = stats.map(([d, w], i) => ({ d, delta: i === 0 ? w : w - stats[i - 1][1] })).filter((x) => x.delta !== 0).slice(-10);
        return (
          <>
            <p className="small"><b>{total.toLocaleString()}</b> compiled words · {world.scenes.length} scenes · writing on {stats.length} day{stats.length === 1 ? '' : 's'}</p>
            {deltas.map(({ d, delta }) => (
              <div key={d} className="row small">
                <span className="mono dim" style={{ width: 84 }}>{d.slice(5)}</span>
                <span className="mono grow">{'▇'.repeat(Math.min(24, Math.max(1, Math.round(Math.abs(delta) / 150))))}</span>
                <span className="mono dim">{delta > 0 ? '+' : ''}{delta.toLocaleString()}</span>
              </div>
            ))}
          </>
        );
      })()}
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
  const homePray = useStore((s) => s.homePray);
  const homeFletch = useStore((s) => s.homeFletch);
  const homeFeast = useStore((s) => s.homeFeast);
  const homeBuyFirst = useStore((s) => s.homeBuyFirst);
  const craftAct = useStore((s) => s.craftAct);
  const enchantAct = useStore((s) => s.enchantAct);
  const adoptPet = useStore((s) => s.adoptPet);
  const homeId = findHome(world);
  const home = homeId ? world.locations[homeId] : null;
  const mc = world.characters[world.mcId];
  if (!home?.household) {
    return (
      <div>
        <h3>No roof of his own</h3>
        <p>
          {mc.name} rents a bed by the night — the Broken Crown charges for every one of them — and owns
          nothing he can't carry. No storage, no treasury, no household. Sleeping without a paid bed means
          doorways, half-rest, and whatever the street decides to take.
        </p>
        <h4>For sale</h4>
        <div className="card">
          <div className="name">A cheap two-room flat, Ratcatcher Lane</div>
          <p className="small">Over a chandler's shop. Thin walls, a door that locks, a key of his own. The first thing in Blackwall that would actually be his.</p>
          <button className="primary" disabled={mc.money < TIER_INFO['cheap-apartment'].cost} onClick={homeBuyFirst}>
            Buy — {fmtMoney(TIER_INFO['cheap-apartment'].cost)} {mc.money < TIER_INFO['cheap-apartment'].cost && <span className="dim">(you have {fmtMoney(mc.money)})</span>}
          </button>
        </div>
        <p className="dim small">Once bought, the whole household ladder opens: upgrades, storage, treasury, and every wing up to the estate.</p>
      </div>
    );
  }
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
          <span className="grow small">
            {u.label} {UPGRADE_EFFECTS[u.key] && <span className="dim">— {UPGRADE_EFFECTS[u.key]}</span>} {tierIdx < u.minTier && <span className="dim">(needs {TIER_INFO[TIER_ORDER[u.minTier]].label})</span>}
          </span>
          <button disabled={tierIdx < u.minTier || mc.money < u.cost} onClick={() => homeBuyUpgrade(u.key)}>{fmtMoney(u.cost)}</button>
        </div>
      ))}
      <h4>Use the house</h4>
      <div className="row">
        {hh.upgrades.includes('kitchen') && <button onClick={homeCook}>🍲 Cook{hh.upgrades.includes('garden') ? ' (garden: free)' : ''}</button>}
        {hh.upgrades.includes('training-yard') && <button onClick={homeSpar}>🗡 Spar in the yard</button>}
        {hh.upgrades.includes('alchemy-room') && <button onClick={homeBrew}>⚗ Brew{hh.upgrades.includes('enchanters-study') ? ' (study: greater)' : hh.upgrades.includes('library') ? ' (library: better)' : ''}</button>}
        {hh.upgrades.includes('shrine') && <button onClick={homePray}>🕯 Pray</button>}
        {hh.upgrades.includes('forge-annex') && <button onClick={homeFletch}>🏹 Fletch arrows</button>}
      </div>
      {hh.upgrades.includes('great-hall') && (
        <div className="row small">
          <label>🍷 Host a feast for</label>
          <select value="" onChange={(e) => { if (e.target.value) homeFeast(e.target.value); }}>
            <option value="">choose a faction… (5g, weekly)</option>
            {Object.values(world.factions).map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
      )}
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
      <h4>Crafting bench</h4>
      {RECIPES.map((r) => {
        const blocked = canCraft(world, r);
        return (
          <div key={r.key} className="row small">
            <span className="grow">{r.label} <span className="dim">({r.needs.map((n) => `${n.qty}× ${n.proto.replace(/-/g, ' ')}`).join(', ')})</span></span>
            <button disabled={!!blocked} title={blocked ?? undefined} onClick={() => craftAct(r.key)}>Craft</button>
          </div>
        );
      })}
      {hh.upgrades.includes('enchanters-study') && (
        <div className="row small">
          <label>✨ Enchant (2× ember essence)</label>
          <select value="" onChange={(e) => { if (e.target.value) enchantAct(e.target.value); }}>
            <option value="">choose gear…</option>
            {Object.values(world.items)
              .filter((i) => (i.kind === 'weapon' || i.kind === 'armor' || i.kind === 'shield') && !i.affix && typeof i.owner === 'string' && (world.characters[i.owner]?.inParty || i.owner === 'PARTY' || i.owner === 'HOME_STORAGE'))
              .map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
      )}
      {!world.pet && <div className="row"><button onClick={adoptPet}>🐕 Take in the stray that haunts the doorstep</button></div>}
      {world.pet && <p className="small dim">🐕 {world.pet.name} the {world.pet.kind} holds the doorway. Seriously.</p>}
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

// ---------- Books ----------
function BooksSection() {
  const switchBook = useStore((s) => s.switchBook);
  const createBook = useStore((s) => s.createBook);
  const removeBook = useStore((s) => s.removeBook);
  const renameActiveBook = useStore((s) => s.renameActiveBook);
  const world = useStore((s) => s.world); // subscribe so the list re-renders on commits
  void world;
  const [newName, setNewName] = useState('');
  const books = listBooks();
  const active = activeSlot();
  const activeMeta = books.find((b) => b.slot === active);
  return (
    <>
      <h4>Books</h4>
      <p className="dim small">Each book is its own world and manuscript. Switching saves the current one first.</p>
      {books.map((b) => (
        <div key={b.slot} className="row small">
          <span className="grow">{b.slot === active ? <b>{b.name}</b> : b.name} {b.slot === active && <Tag tone="gold">open</Tag>}</span>
          {b.slot !== active && <button onClick={() => switchBook(b.slot)}>Open</button>}
          {b.slot !== active && b.slot !== 'default' && (
            <button className="danger" onClick={() => { if (confirm(`Delete the book "${b.name}" and its world forever?`)) removeBook(b.slot); }}>Delete</button>
          )}
        </div>
      ))}
      <div className="row">
        <input type="text" className="grow" placeholder="new book title" value={newName} onChange={(e) => setNewName(e.target.value)} />
        <button className="primary" onClick={() => { if (newName.trim()) { createBook(newName.trim()); setNewName(''); } }}>+ New book</button>
      </div>
      <div className="row small">
        <label>Rename current</label>
        <input type="text" defaultValue={activeMeta?.name ?? ''} key={active} onBlur={(e) => { if (e.target.value.trim()) renameActiveBook(e.target.value.trim()); }} />
      </div>
    </>
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

// ---------- Monster art ----------
function MonsterArtSection() {
  const world = useStore((s) => s.world);
  const setMonsterArt = useStore((s) => s.setMonsterArt);
  const setToast = useStore((s) => s.setToast);
  const [key, setKey] = useState('giant-rat');
  const fileRef = useRef<HTMLInputElement>(null);
  const onFile = (f: File) => {
    if (f.size > 400_000) {
      setToast('Keep monster art under 400 KB — it lives inside the save file.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setMonsterArt(key, String(reader.result));
    reader.readAsDataURL(f);
  };
  return (
    <>
      <h4>Monster art</h4>
      <p className="dim small">Every monster ships with a drawn bestiary plate. Replace any of them with your own image (AI-generated or otherwise) — it's stored in the save.</p>
      <div className="row">
        <MonsterPortrait templateKey={key} size={44} world={world} />
        <select value={key} onChange={(e) => setKey(e.target.value)}>
          {Object.keys(MONSTERS).map((k) => <option key={k} value={k}>{MONSTERS[k].name}</option>)}
        </select>
        <button onClick={() => fileRef.current?.click()}>Upload…</button>
        {world.monsterArt?.[key] && <button className="danger" onClick={() => setMonsterArt(key, null)}>Use drawn plate</button>}
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ''; }} />
      </div>
    </>
  );
}

// ---------- Saves ----------
function MusicSection() {
  const setToast = useStore((st) => st.setToast);
  const [busy, setBusy] = useState<string | null>(null);
  const [, bump] = useState(0);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const themes: Exclude<MusicTheme, 'off'>[] = ['city', 'dungeon', 'combat'];

  const compose = async (theme: Exclude<MusicTheme, 'off'>) => {
    setBusy(theme);
    try {
      const comp = await composeTheme(loadLlmConfig(), theme);
      setCustomComposition(theme, comp);
      setToast(`The model composed a new ${theme} theme — playing it next time that mood comes up.`);
    } catch (e) {
      setToast(`Composition failed: ${e instanceof Error ? e.message : String(e)}`);
    }
    setBusy(null);
    bump((n) => n + 1);
  };

  const upload = async (theme: Exclude<MusicTheme, 'off'>, file: File) => {
    await saveMusicFile(theme, file);
    setThemeAudio(theme, URL.createObjectURL(file));
    setToast(`${file.name} now plays as the ${theme} theme.`);
    bump((n) => n + 1);
  };

  const reset = async (theme: Exclude<MusicTheme, 'off'>) => {
    setCustomComposition(theme, null);
    await deleteMusicFile(theme);
    setThemeAudio(theme, null);
    setToast(`${theme} theme back to the built-in tune.`);
    bump((n) => n + 1);
  };

  return (
    <>
      <h4>Music</h4>
      <p className="dim small">
        Three loops: city, dungeon, combat. Built-ins are two-voice chiptunes. "Compose" asks your local
        LLM to write new sheet music for the sequencer; "Upload" plays any audio file instead — including
        tracks you generate with AI music tools.
      </p>
      {themes.map((theme) => (
        <div key={theme} className="row small">
          <span style={{ width: 70 }}>{theme}</span>
          <Tag>{themeSource(theme)}</Tag>
          <span className="grow" />
          <button disabled={busy !== null} onClick={() => void compose(theme)}>{busy === theme ? 'composing…' : '✨ Compose'}</button>
          <button onClick={() => fileRefs.current[theme]?.click()}>Upload…</button>
          <input
            ref={(el) => { fileRefs.current[theme] = el; }}
            type="file"
            accept="audio/*"
            style={{ display: 'none' }}
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(theme, f); e.target.value = ''; }}
          />
          {themeSource(theme) !== 'built-in' && <button onClick={() => void reset(theme)}>Reset</button>}
        </div>
      ))}
    </>
  );
}

function SavesPanel() {
  const world = useStore((s) => s.world);
  const snapshots = useStore((s) => s.snapshots);
  const manualSave = useStore((s) => s.manualSave);
  const restore = useStore((s) => s.restore);
  const deleteSnapshot = useStore((s) => s.deleteSnapshot);
  const doExport = useStore((s) => s.doExport);
  const doImport = useStore((s) => s.doImport);
  const resetWorld = useStore((s) => s.resetWorld);
  const [newDeathRule, setNewDeathRule] = useState<'story' | 'classic' | 'permadeath'>('story');
  const [newResRule, setNewResRule] = useState<'safe' | 'risky'>('safe');
  const [newClass, setNewClass] = useState<'fighter' | 'rogue' | 'mage' | 'priest' | 'ranger' | 'bard' | 'monk' | 'spellblade' | 'warlock'>('fighter');
  const [newBonus, setNewBonus] = useState<Record<string, number>>({});
  const bonusSpent = Object.values(newBonus).reduce((a, b) => a + b, 0);
  const CREATION_POINTS = 5;
  const [label, setLabel] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const setDeathRule = useStore((s) => s.setDeathRule);
  const setEncumbrance = useStore((s) => s.setEncumbrance);
  const setNeedsEnabled = useStore((s) => s.setNeedsEnabled);
  const setDoomEnabled = useStore((s) => s.setDoomEnabled);
  const setResurrectionRule = useStore((s) => s.setResurrectionRule);
  const compactLog = useStore((s) => s.compactLog);
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
      <BooksSection />
      <DiskBackupSection />
      <h4>Achievements — {(world.achievements ?? []).length}/{ACHIEVEMENTS.length}</h4>
      {ACHIEVEMENTS.map((a) => {
        const got = (world.achievements ?? []).includes(a.key);
        return (
          <p key={a.key} className="small" style={{ opacity: got ? 1 : 0.45 }}>
            {got ? '★' : '☆'} <b>{a.label}</b> — {a.desc}{a.title ? ` (title: "${a.title}")` : ''}
          </p>
        );
      })}
      <MonsterArtSection />
      <MusicSection />
      <div className="row small">
        <label className="grow">The Circle's clock (the villain acts if the spine idles)</label>
        <select value={world.doomEnabled === false ? 'off' : 'on'} onChange={(e) => setDoomEnabled(e.target.value === 'on')}>
          <option value="on">Ticking{world.doom?.stage ? ` — stage ${world.doom.stage}/4` : ''}</option>
          <option value="off">Paused</option>
        </select>
      </div>
      <div className="row small">
        <label className="grow">Resurrection (temple rite for the dead)</label>
        <select value={world.resurrectionRule ?? 'safe'} onChange={(e) => setResurrectionRule(e.target.value as 'safe' | 'risky')}>
          <option value="safe">Safe — coin always brings them back</option>
          <option value="risky">Risky — a CON gamble; failure leaves ashes, then nothing</option>
        </select>
      </div>
      <div className="row small">
        <label className="grow">Event log: {world.events.length.toLocaleString()} events{(world.eventArchive ?? []).length ? ` (+${world.eventArchive!.length} archived spans)` : ''}</label>
        <button onClick={compactLog} title="Digest already-outlined routine events; milestones are kept.">Compact</button>
      </div>
      <h4>Checkpoints</h4>
      <div className="row">
        <input type="text" className="grow" placeholder="checkpoint label" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button className="primary" onClick={() => { manualSave(label); setLabel(''); }}>Save</button>
      </div>
      <div className="row">
        <button onClick={doExport}>Export project (.json)</button>
        <button onClick={() => fileRef.current?.click()}>Import…</button>
        <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void doImport(f); e.target.value = ''; }} />
      </div>
      <h4>New game</h4>
      <div className="row small">
        <label className="grow">How do you want to die?</label>
        <select value={newDeathRule} onChange={(e) => setNewDeathRule(e.target.value as typeof newDeathRule)}>
          <option value="story">Story — the fallen wake at 1 HP, scarred</option>
          <option value="classic">Classic — dead until a temple rite</option>
          <option value="permadeath">Permadeath — the old way. No take-backs.</option>
        </select>
      </div>
      <div className="row small">
        <label className="grow">And how do you want to come back?</label>
        <select value={newResRule} onChange={(e) => setNewResRule(e.target.value as typeof newResRule)}>
          <option value="safe">Safe — coin always brings them back</option>
          <option value="risky">Risky — a CON gamble; ashes, then nothing</option>
        </select>
      </div>
      <div className="row small">
        <label className="grow">And who is Kael?</label>
        <select value={newClass} onChange={(e) => setNewClass(e.target.value as typeof newClass)}>
          <option value="fighter">Fighter — the sword remembers</option>
          <option value="rogue">Rogue — locks are suggestions</option>
          <option value="mage">Mage — the College will hear about this</option>
          <option value="priest">Priest — somebody's god owes him</option>
          <option value="ranger">Ranger — the road taught him</option>
          <option value="bard">Bard — the Crown's own curriculum</option>
          <option value="monk">Monk — the open hand closes fast</option>
          <option value="spellblade">Spellblade — sigils cut into steel</option>
          <option value="warlock">Warlock — something answered</option>
        </select>
      </div>
      <div className="row small" style={{ flexWrap: 'wrap' }}>
        <span className="dim">Bonus points: {CREATION_POINTS - bonusSpent} left</span>
        {(['strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'] as const).map((a) => (
          <span key={a} className="mono small" style={{ marginRight: 6 }}>
            {a.slice(0, 3).toUpperCase()} +{newBonus[a] ?? 0}
            <button style={{ padding: '0 6px' }} disabled={bonusSpent >= CREATION_POINTS} onClick={() => setNewBonus({ ...newBonus, [a]: (newBonus[a] ?? 0) + 1 })}>+</button>
            <button style={{ padding: '0 6px' }} disabled={(newBonus[a] ?? 0) <= 0} onClick={() => setNewBonus({ ...newBonus, [a]: (newBonus[a] ?? 0) - 1 })}>−</button>
          </span>
        ))}
      </div>
      <div className="row">
        <button
          className="danger"
          onClick={() => { if (confirm(`Reset the entire world and manuscript (${newClass} Kael, ${newDeathRule} death, ${newResRule} resurrection)? Export first if you care about this one.`)) resetWorld({ deathRule: newDeathRule, resurrectionRule: newResRule, mcClass: newClass, mcBonus: newBonus }); }}
        >
          Begin a new chronicle (reset world)
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
