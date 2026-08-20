// The app store: owns the WorldState, snapshots, and UI selection.
// Engine functions mutate the world in place; `commit` swaps in a new
// top-level reference, persists, and optionally autosaves a snapshot.

import { create } from 'zustand';
import type {
  LootResult,
  PlannedAction,
  Scene,
  SceneId,
  Snapshot,
  WorldState,
} from '../engine/types';
import { buildSeedWorld } from '../data/seed';
import { advanceUntilMorning, logEvent, nextId, partyMembers, tick, travelTo } from '../engine/world';
import { disarmTrap, enterDungeon, exitDungeon, moveInDungeon, searchRoom, type MoveDir } from '../engine/dungeon';
import { generateDungeonEncounter, rollCityEncounter } from '../engine/encounter';
import { closeCombat, resolveRound, startCombat, takeLoot } from '../engine/combat';
import { openChest } from '../engine/loot';
import { loadProject, makeSnapshot, persistProject, pruneSnapshots, restoreSnapshot, exportProject, importProject, clearProject } from '../engine/saves';
import { promoteNpc } from '../engine/npc';
import { buyUpgrade, upgradeTier } from '../engine/household';
import {
  buyFromShop,
  buyMeal,
  buyTempleService,
  depositItem,
  moveToParty,
  restAtHome,
  restAtInn,
  restockShops,
  sellToShop,
  takeFromParty,
  trainAt,
  treasuryTransfer,
  useConsumable,
  withdrawItem,
} from '../engine/services';
import { randomSeed } from '../engine/rng';
import { addToContainer } from '../engine/rules';
import { travelSentence } from '../engine/bridge';
import {
  buildNpcSystemPrompt,
  chatWithNpc,
  loadLlmConfig,
  summarizeConversation,
  type ChatMessage,
} from '../engine/npcChat';
import { addMinutes } from '../engine/world';
import { applyProposal, type SyncProposal } from '../engine/proseLlm';
import { scheduleBackup } from '../engine/diskSave';
import { acceptQuest, checkQuests, declineQuest, refreshJobs, turnInQuest } from '../engine/quests';
import { maybeCompanionMoment } from '../engine/moments';
import { brewAtHome, cookAtHome, repairAtHome, sparAtHome } from '../engine/household';

export type PanelTab =
  | 'location'
  | 'quests'
  | 'characters'
  | 'party'
  | 'inventory'
  | 'timeline'
  | 'dungeon'
  | 'events'
  | 'relationships'
  | 'continuity'
  | 'household'
  | 'saves';

interface AppState {
  world: WorldState;
  snapshots: Snapshot[];
  selectedSceneId: SceneId | null;
  panel: PanelTab;
  toast: string | null;
  chestLoot: LootResult | null;
  /** dungeon id pending the adventure-preparation screen */
  prepDungeon: string | null;
  /** live NPC conversation (LLM-driven) */
  talk: {
    npcId: string;
    povId: string;
    messages: ChatMessage[]; // excludes the system prompt
    busy: boolean;
    error: string | null;
    /** companion-moment context appended to the system prompt */
    hook?: string;
  } | null;

  commit: (opts?: { autosave?: string }) => void;
  setToast: (t: string | null) => void;
  setPanel: (p: PanelTab) => void;
  selectScene: (id: SceneId | null) => void;

  // world actions
  travel: (dest: string) => void;
  advance: (minutes: number) => void;
  sleepUntilMorning: () => void;
  setFrequency: (f: WorldState['encounterFrequency']) => void;

  // services
  shopBuy: (entryIdx: number) => void;
  shopSell: (itemId: string) => void;
  innRest: (roomIdx: number) => void;
  homeRest: () => void;
  templeRite: (svcKey: string, targetId: string) => void;
  train: (charId: string) => void;
  homeDeposit: (itemId: string) => void;
  homeWithdraw: (itemId: string) => void;
  poolItem: (itemId: string) => void;
  unpoolItem: (itemId: string) => void;
  treasuryMove: (amount: number, dir: 'deposit' | 'withdraw') => void;
  setDeathRule: (r: WorldState['deathRule']) => void;
  setEncumbrance: (r: WorldState['encumbrance']) => void;
  setNeedsEnabled: (on: boolean) => void;
  eatMeal: () => void;

  // quests
  questAccept: (id: string) => void;
  questDecline: (id: string) => void;
  questTurnIn: (id: string) => void;

  // companion moments
  hearMoment: () => Promise<void>;
  dismissMoment: () => void;

  // functional home rooms
  homeCook: () => void;
  homeSpar: () => void;
  homeBrew: () => void;
  homeRepair: (itemId: string) => void;

  // prose → sim sync (author-approved)
  applyProposals: (proposals: SyncProposal[]) => string[];

  // NPC conversation
  openTalk: (npcId: string) => void;
  sendTalkLine: (text: string) => Promise<void>;
  talkToScene: () => void;
  endTalk: (remember: boolean) => Promise<void>;

  // dungeon actions
  openPrep: (dungeonId: string) => void;
  cancelPrep: () => void;
  enterDungeonAt: (dungeonId: string) => void;
  leaveDungeon: () => void;
  move: (dir: MoveDir) => void;
  search: () => void;
  disarm: () => void;
  lootChest: () => void;
  takeChestLoot: (which: number[] | 'all' | 'none') => void;

  // encounters & combat
  fight: (seed?: number) => void;
  dismissEncounter: () => void;
  overrideEncounter: (monsters: { templateKey: string; count: number }[], note: string) => void;
  beginCombat: () => void;
  doRound: (planned: PlannedAction[]) => void;
  finishLoot: (which: number[] | 'all' | 'none') => void;
  endCombatView: () => void;

  // characters & items
  promote: (id: string) => void;
  toggleParty: (id: string) => void;
  equip: (itemId: string) => void;
  unequip: (itemId: string) => void;
  drinkPotion: (itemId: string) => void;

  // household
  homeUpgradeTier: () => void;
  homeBuyUpgrade: (key: string) => void;

  // scenes
  addScene: () => void;
  updateScene: (id: SceneId, patch: Partial<Scene>) => void;
  deleteScene: (id: SceneId) => void;

  // saves
  manualSave: (label: string) => void;
  restore: (snapId: string) => void;
  deleteSnapshot: (snapId: string) => void;
  doExport: () => void;
  doImport: (file: File) => Promise<void>;
  resetWorld: () => void;
}

function initial(): { world: WorldState; snapshots: Snapshot[] } {
  const loaded = loadProject();
  if (loaded) return loaded;
  const world = buildSeedWorld();
  logEvent(world, 'world.created', {}, 'The chronicle of Blackwall City begins.');
  return { world, snapshots: [makeSnapshot(world, 'manual', 'World created')] };
}

const init = initial();

// Persisting the whole world on every keystroke is wasteful; debounce it.
let persistTimer: ReturnType<typeof setTimeout> | null = null;

export const useStore = create<AppState>((set, get) => ({
  world: init.world,
  snapshots: init.snapshots,
  selectedSceneId: init.world.scenes[0]?.id ?? null,
  panel: 'location',
  toast: null,
  chestLoot: null,
  prepDungeon: null,
  talk: null,

  commit: (opts) => {
    const { world } = get();
    let snapshots = get().snapshots;
    if (opts?.autosave) {
      snapshots = pruneSnapshots([...snapshots, makeSnapshot(world, 'auto', opts.autosave)]);
    }
    set({ world: { ...world }, snapshots });
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      const s = get();
      persistProject(s.world, s.snapshots);
    }, 400);
    scheduleBackup(() => ({ world: get().world, snapshots: get().snapshots }));
  },

  setToast: (t) => set({ toast: t }),
  setPanel: (p) => set({ panel: p }),
  selectScene: (id) => set({ selectedSceneId: id }),

  travel: (dest) => {
    const { world, commit, selectedSceneId } = get();
    if (world.combat?.active) return;
    travelTo(world, dest);
    rollCityEncounter(world);
    checkQuests(world);
    maybeCompanionMoment(world);
    // auto-insert the movement into the manuscript as editable prose,
    // destination embedded as an @[Name](ID) token
    const scene = world.scenes.find((s) => s.id === selectedSceneId);
    if (scene) {
      const sentence = travelSentence(world, dest, randomSeed());
      scene.text = scene.text.replace(/\s*$/, '') + (scene.text.trim() ? '\n\n' : '') + sentence + '\n';
    }
    commit({ autosave: `Traveled to ${world.locations[dest]?.name ?? dest}` });
  },

  advance: (minutes) => {
    const { world, commit } = get();
    tick(world, minutes);
    restockShops(world);
    refreshJobs(world);
    maybeCompanionMoment(world);
    commit({ autosave: `Advanced ${minutes} min` });
  },

  sleepUntilMorning: () => {
    const { world, commit } = get();
    advanceUntilMorning(world);
    restockShops(world);
    refreshJobs(world);
    maybeCompanionMoment(world);
    commit({ autosave: 'Slept until morning' });
  },

  // ---------- services ----------
  shopBuy: (entryIdx) => {
    const { world, commit, setToast } = get();
    const err = buyFromShop(world, world.partyLocation, entryIdx, world.characters[world.mcId]);
    if (err) setToast(err);
    commit();
  },

  shopSell: (itemId) => {
    const { world, commit, setToast } = get();
    const owner = world.items[itemId]?.owner;
    const seller = typeof owner === 'string' ? world.characters[owner] : undefined;
    const err = sellToShop(world, world.partyLocation, itemId, seller ?? world.characters[world.mcId]);
    if (err) setToast(err);
    commit();
  },

  innRest: (roomIdx) => {
    const { world, commit, setToast } = get();
    const err = restAtInn(world, world.partyLocation, roomIdx);
    if (err) setToast(err);
    else restockShops(world);
    commit({ autosave: 'Rested at inn' });
  },

  homeRest: () => {
    const { world, commit, setToast } = get();
    const err = restAtHome(world);
    if (err) setToast(err);
    else restockShops(world);
    commit({ autosave: 'Rested at home' });
  },

  templeRite: (svcKey, targetId) => {
    const { world, commit, setToast } = get();
    const err = buyTempleService(world, world.partyLocation, svcKey, targetId);
    if (err) setToast(err);
    commit({ autosave: 'Temple service' });
  },

  train: (charId) => {
    const { world, commit, setToast } = get();
    const err = trainAt(world, world.partyLocation, charId);
    if (err) setToast(err);
    else setToast(`${world.characters[charId].name} trained to level ${world.characters[charId].level}.`);
    commit({ autosave: 'Training' });
  },

  homeDeposit: (itemId) => {
    const { world, commit, setToast } = get();
    const err = depositItem(world, itemId);
    if (err) setToast(err);
    commit();
  },

  homeWithdraw: (itemId) => {
    const { world, commit, setToast } = get();
    const err = withdrawItem(world, itemId, world.mcId);
    if (err) setToast(err);
    commit();
  },

  poolItem: (itemId) => {
    const { world, commit, setToast } = get();
    const err = moveToParty(world, itemId);
    if (err) setToast(err);
    commit();
  },

  unpoolItem: (itemId) => {
    const { world, commit, setToast } = get();
    const err = takeFromParty(world, itemId, world.mcId);
    if (err) setToast(err);
    commit();
  },

  treasuryMove: (amount, dir) => {
    const { world, commit, setToast } = get();
    const err = treasuryTransfer(world, amount, dir);
    if (err) setToast(err);
    commit();
  },

  setDeathRule: (r) => {
    const { world, commit } = get();
    world.deathRule = r;
    commit();
  },

  setEncumbrance: (r) => {
    const { world, commit } = get();
    world.encumbrance = r;
    commit();
  },

  setNeedsEnabled: (on) => {
    const { world, commit } = get();
    world.needsEnabled = on;
    commit();
  },

  eatMeal: () => {
    const { world, commit, setToast } = get();
    const err = buyMeal(world, world.partyLocation);
    if (err) setToast(err);
    commit();
  },

  // ---------- quests ----------
  questAccept: (id) => {
    const { world, commit, setToast } = get();
    const err = acceptQuest(world, id);
    if (err) setToast(err);
    commit({ autosave: 'Quest accepted' });
  },

  questDecline: (id) => {
    const { world, commit } = get();
    declineQuest(world, id);
    commit();
  },

  questTurnIn: (id) => {
    const { world, commit, setToast } = get();
    const err = turnInQuest(world, id);
    if (err) setToast(err);
    commit({ autosave: 'Quest turned in' });
  },

  // ---------- companion moments ----------
  hearMoment: async () => {
    const { world, commit } = get();
    const m = world.pendingMoment;
    if (!m) return;
    world.pendingMoment = null;
    const npc = world.characters[m.npcId];
    const pov = world.characters[world.mcId];
    set({ talk: { npcId: m.npcId, povId: world.mcId, messages: [], busy: true, error: null, hook: m.hook } });
    commit();
    try {
      const system = buildNpcSystemPrompt(world, m.npcId, world.mcId)
        + `\n\n=== RIGHT NOW ===\n${m.hook}\nYOU approached ${pov.name} — speak first, in character, 1–3 sentences.`;
      const reply = await chatWithNpc(loadLlmConfig(), [
        { role: 'system', content: system },
        { role: 'user', content: `*${pov.name} looks up as you approach.*` },
      ]);
      const cur = get().talk;
      if (!cur || cur.npcId !== m.npcId) return;
      set({ talk: { ...cur, messages: [{ role: 'assistant', content: reply }], busy: false } });
    } catch {
      const cur = get().talk;
      if (cur) {
        set({ talk: { ...cur, messages: [{ role: 'assistant', content: `*${npc.name} finds a quiet moment beside you.* \u201cGot a minute?\u201d` }], busy: false } });
      }
    }
  },

  dismissMoment: () => {
    const { world, commit } = get();
    world.pendingMoment = null;
    commit();
  },

  // ---------- functional home rooms ----------
  homeCook: () => {
    const { world, commit, setToast } = get();
    const err = cookAtHome(world);
    if (err) setToast(err);
    commit();
  },

  homeSpar: () => {
    const { world, commit, setToast } = get();
    const err = sparAtHome(world);
    if (err) setToast(err);
    commit({ autosave: 'Sparring' });
  },

  homeBrew: () => {
    const { world, commit, setToast } = get();
    const err = brewAtHome(world);
    if (err) setToast(err);
    commit({ autosave: 'Brewing' });
  },

  homeRepair: (itemId) => {
    const { world, commit, setToast } = get();
    const err = repairAtHome(world, itemId);
    if (err) setToast(err);
    commit();
  },

  openPrep: (dungeonId) => set({ prepDungeon: dungeonId }),
  cancelPrep: () => set({ prepDungeon: null }),

  // ---------- prose → sim sync ----------
  applyProposals: (proposals) => {
    const { world, commit } = get();
    const results = proposals.map((p) => applyProposal(world, p));
    commit({ autosave: 'Prose sync' });
    return results;
  },

  // ---------- NPC conversation ----------
  openTalk: (npcId) => {
    const { world } = get();
    const npc = world.characters[npcId];
    if (!npc || !npc.alive || npc.location !== world.partyLocation) return;
    set({ talk: { npcId, povId: world.mcId, messages: [], busy: false, error: null } });
  },

  sendTalkLine: async (text) => {
    const { world, talk } = get();
    if (!talk || talk.busy || !text.trim()) return;
    const messages: ChatMessage[] = [...talk.messages, { role: 'user', content: text.trim() }];
    set({ talk: { ...talk, messages, busy: true, error: null } });
    try {
      const system = buildNpcSystemPrompt(world, talk.npcId, talk.povId)
        + (talk.hook ? `\n\n=== RIGHT NOW ===\n${talk.hook}` : '');
      const reply = await chatWithNpc(loadLlmConfig(), [{ role: 'system', content: system }, ...messages]);
      const cur = get().talk;
      if (!cur || cur.npcId !== talk.npcId) return; // conversation was closed meanwhile
      set({ talk: { ...cur, messages: [...messages, { role: 'assistant', content: reply }], busy: false } });
    } catch (e) {
      const cur = get().talk;
      if (cur) set({ talk: { ...cur, busy: false, error: e instanceof Error ? e.message : String(e) } });
    }
  },

  talkToScene: () => {
    const { world, talk, selectedSceneId, setToast } = get();
    if (!talk) return;
    const scene = world.scenes.find((s) => s.id === selectedSceneId);
    if (!scene) {
      setToast('Select a scene first.');
      return;
    }
    const npc = world.characters[talk.npcId];
    const pov = world.characters[talk.povId];
    const npcToken = `@[${npc.name}](${npc.id})`;
    const lines = talk.messages.map((m) => `${m.role === 'user' ? pov.name : npcToken}: ${m.content}`);
    scene.text = scene.text.replace(/\s*$/, '') + `\n\n---\n[CONVERSATION — ${npc.name}]\n${lines.join('\n')}\n---\n`;
    get().commit();
    setToast(`Conversation copied into "${scene.title}" as editable notes.`);
  },

  endTalk: async (remember) => {
    const { world, talk, commit } = get();
    if (!talk) return;
    set({ talk: null });
    if (!remember || talk.messages.length === 0) return;
    const npc = world.characters[talk.npcId];
    const pov = world.characters[talk.povId];
    // conversations take time: ~5 minutes per exchange
    const exchanges = talk.messages.filter((m) => m.role === 'user').length;
    addMinutes(world, Math.max(5, exchanges * 5));
    let event = `Spoke with ${pov.name}.`;
    let emotionalValue = 0;
    try {
      const sum = await summarizeConversation(loadLlmConfig(), npc.name, pov.name, talk.messages);
      event = sum.event;
      emotionalValue = sum.emotionalValue;
    } catch {
      const firstLine = talk.messages.find((m) => m.role === 'user')?.content ?? '';
      event = `Spoke with ${pov.name}${firstLine ? ` about "${firstLine.slice(0, 60)}"` : ''}.`;
    }
    npc.memories.push({
      subject: pov.id,
      event,
      importance: Math.min(10, 3 + Math.abs(emotionalValue)),
      emotionalValue,
      day: world.time.day,
    });
    pov.knowledge.push({ fact: `Conversation with ${npc.name}: ${event}`, day: world.time.day, accurate: true });
    logEvent(
      world,
      'conversation',
      { npc: npc.id, pov: pov.id, exchanges, transcript: talk.messages, memory: event, emotionalValue },
      `${pov.name} spoke with ${npc.name}: ${event}`,
      { location: world.partyLocation, witnesses: [pov.id] },
    );
    commit({ autosave: `Talked with ${npc.name}` });
  },

  setFrequency: (f) => {
    const { world, commit } = get();
    world.encounterFrequency = f;
    commit();
  },

  enterDungeonAt: (dungeonId) => {
    const { world, commit } = get();
    enterDungeon(world, dungeonId);
    set({ prepDungeon: null, panel: 'dungeon' });
    commit({ autosave: `Entered ${world.dungeons[dungeonId].name}` });
  },

  leaveDungeon: () => {
    const { world, commit } = get();
    exitDungeon(world);
    set({ panel: 'location' });
    commit({ autosave: 'Left the dungeon' });
  },

  move: (dir) => {
    const { world, commit, setToast } = get();
    const res = moveInDungeon(world, dir);
    if ('error' in res) {
      setToast(res.error);
      return;
    }
    commit();
  },

  search: () => {
    const { world, commit, setToast } = get();
    const res = searchRoom(world);
    if ('error' in res) {
      setToast(res.error);
      return;
    }
    commit();
  },

  disarm: () => {
    const { world, commit, setToast } = get();
    const res = disarmTrap(world);
    if ('error' in res) {
      setToast(res.error);
      return;
    }
    commit({ autosave: 'Trap interaction' });
  },

  lootChest: () => {
    const { world, commit, setToast } = get();
    const res = openChest(world);
    if ('error' in res) {
      setToast(res.error);
      return;
    }
    logEvent(world, 'loot.chest', { seed: res.seed, money: res.money, items: res.items.map((i) => i.name) }, `The party opened a chest: ${res.money} copper${res.items.length ? `, ${res.items.map((i) => i.name).join(', ')}` : ''}. (seed ${res.seed})`, { seed: res.seed, witnesses: partyMembers(world).map((c) => c.id) });
    set({ chestLoot: res });
    commit({ autosave: 'Opened chest' });
  },

  takeChestLoot: (which) => {
    const { world, chestLoot, commit } = get();
    if (!chestLoot) return;
    const mc = world.characters[world.mcId];
    if (which !== 'none') {
      mc.money += chestLoot.money;
      chestLoot.items.forEach((item, i) => {
        if (which === 'all' || which.includes(i)) {
          world.items[item.id] = item;
          item.history.push(`Taken from a chest on Day ${world.time.day}`);
          addToContainer(world, item, mc);
        } else if (world.currentDungeon && world.currentRoom) {
          world.items[item.id] = item;
          world.dungeons[world.currentDungeon].rooms[world.currentRoom].itemsRemaining.push(item.id);
        }
      });
    }
    set({ chestLoot: null });
    commit();
  },

  fight: (seed) => {
    const { world, commit, setToast } = get();
    const res = generateDungeonEncounter(world, seed);
    if ('error' in res) {
      setToast(res.error);
      return;
    }
    commit();
  },

  dismissEncounter: () => {
    const { world, commit } = get();
    world.pendingEncounter = null;
    commit();
  },

  overrideEncounter: (monsters, note) => {
    const { world, commit } = get();
    if (!world.pendingEncounter) return;
    world.pendingEncounter.monsters = monsters;
    world.pendingEncounter.description = note;
    logEvent(world, 'author.override', { monsters, note }, `AUTHOR OVERRIDE: encounter changed to ${note}.`, { authorOverride: true });
    commit();
  },

  beginCombat: () => {
    const { world, commit } = get();
    if (!world.pendingEncounter) return;
    startCombat(world, world.pendingEncounter);
    commit({ autosave: 'Combat started' });
  },

  doRound: (planned) => {
    const { world, commit } = get();
    resolveRound(world, planned);
    commit();
  },

  finishLoot: (which) => {
    const { world, commit } = get();
    takeLoot(world, which);
    commit({ autosave: 'After combat' });
  },

  endCombatView: () => {
    const { world, commit } = get();
    closeCombat(world);
    commit();
  },

  promote: (id) => {
    const { world, commit } = get();
    promoteNpc(world, id);
    commit();
  },

  toggleParty: (id) => {
    const { world, commit, setToast } = get();
    const c = world.characters[id];
    if (!c || c.isMC) return;
    if (!c.inParty && partyMembers(world).length >= 6) {
      setToast('The party is full (6).');
      return;
    }
    c.inParty = !c.inParty;
    if (c.inParty) {
      c.persistent = true;
      c.location = world.partyLocation;
      logEvent(world, 'party.join', { character: c.id }, `${c.name} joined the party.`);
    } else {
      logEvent(world, 'party.leave', { character: c.id }, `${c.name} left the party.`);
    }
    commit({ autosave: 'Party changed' });
  },

  equip: (itemId) => {
    const { world, commit } = get();
    const item = world.items[itemId];
    const owner = item?.owner ? world.characters[item.owner] : null;
    if (!item || !owner || item.slot === 'none') return;
    const prev = owner.equipment[item.slot];
    if (prev) {
      const prevItem = world.items[prev];
      if (prevItem) prevItem.equippedBy = undefined;
    }
    owner.equipment[item.slot] = item.id;
    item.equippedBy = owner.id;
    commit();
  },

  unequip: (itemId) => {
    const { world, commit } = get();
    const item = world.items[itemId];
    if (!item?.equippedBy) return;
    const owner = world.characters[item.equippedBy];
    if (owner && item.slot !== 'none' && owner.equipment[item.slot] === item.id) {
      delete owner.equipment[item.slot];
    }
    item.equippedBy = undefined;
    commit();
  },

  drinkPotion: (itemId) => {
    const { world, commit, setToast } = get();
    const item = world.items[itemId];
    const ownerId = item?.owner;
    const target = typeof ownerId === 'string' && world.characters[ownerId] ? ownerId : world.mcId;
    const err = useConsumable(world, itemId, target);
    if (err) setToast(err);
    else setToast(world.events[world.events.length - 1]?.summary ?? 'Consumed.');
    commit();
  },

  homeUpgradeTier: () => {
    const { world, commit, setToast } = get();
    const err = upgradeTier(world);
    if (err) setToast(err);
    commit({ autosave: 'Household' });
  },

  homeBuyUpgrade: (key) => {
    const { world, commit, setToast } = get();
    const err = buyUpgrade(world, key);
    if (err) setToast(err);
    commit({ autosave: 'Household' });
  },

  addScene: () => {
    const { world, commit } = get();
    const id = nextId(world, 'SCN');
    const maxOrder = world.scenes.reduce((m, s) => Math.max(m, s.order), 0);
    const scene: Scene = {
      id,
      chapter: world.chapter,
      title: `New Scene`,
      pov: world.mcId,
      day: world.time.day,
      startMinute: world.time.minute,
      location: world.partyLocation,
      participants: partyMembers(world).map((c) => c.id),
      text: '',
      order: maxOrder + 1,
    };
    world.scenes.push(scene);
    commit();
    set({ selectedSceneId: id });
  },

  updateScene: (id, patch) => {
    const { world, commit } = get();
    const s = world.scenes.find((x) => x.id === id);
    if (!s) return;
    Object.assign(s, patch);
    commit();
  },

  deleteScene: (id) => {
    const { world, commit, selectedSceneId } = get();
    world.scenes = world.scenes.filter((s) => s.id !== id);
    commit();
    if (selectedSceneId === id) set({ selectedSceneId: world.scenes[0]?.id ?? null });
  },

  manualSave: (label) => {
    const { world } = get();
    const snapshots = [...get().snapshots, makeSnapshot(world, 'manual', label || `Day ${world.time.day}`)];
    persistProject(world, snapshots);
    set({ snapshots });
  },

  restore: (snapId) => {
    const snap = get().snapshots.find((s) => s.id === snapId);
    if (!snap) return;
    const world = restoreSnapshot(snap);
    persistProject(world, get().snapshots);
    set({ world, selectedSceneId: world.scenes[0]?.id ?? null, chestLoot: null, toast: `Restored: ${snap.label}` });
  },

  deleteSnapshot: (snapId) => {
    const snapshots = get().snapshots.filter((s) => s.id !== snapId);
    persistProject(get().world, snapshots);
    set({ snapshots });
  },

  doExport: () => {
    exportProject(get().world, get().snapshots);
  },

  doImport: async (file) => {
    const data = await importProject(file);
    if (!data) {
      set({ toast: 'Import failed: not a valid project file.' });
      return;
    }
    persistProject(data.world, data.snapshots);
    set({ world: data.world, snapshots: data.snapshots, selectedSceneId: data.world.scenes[0]?.id ?? null, toast: 'Project imported.' });
  },

  resetWorld: () => {
    clearProject();
    const world = buildSeedWorld();
    world.masterSeed = randomSeed();
    logEvent(world, 'world.created', {}, 'The chronicle of Blackwall City begins.');
    const snapshots = [makeSnapshot(world, 'manual', 'World created')];
    persistProject(world, snapshots);
    set({ world, snapshots, selectedSceneId: world.scenes[0]?.id ?? null, chestLoot: null });
  },
}));
