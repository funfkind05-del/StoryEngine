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
import { campInDungeon, disarmTrap, enterDungeon, exitDungeon, lightTorch, moveInDungeon, searchRoom, type MoveDir } from '../engine/dungeon';
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
import { addMinutes, remakeMc } from '../engine/world';
import { applyProposal, type SyncProposal } from '../engine/proseLlm';
import { scheduleBackup } from '../engine/diskSave';
import { acceptQuest, checkQuests, declineQuest, refreshJobs, turnInQuest } from '../engine/quests';
import { arrestFlee, arrestPay, arrestResist, arrestSurrender, burgleShop, maybePatrolStop, payBountyAt, pickpocket } from '../engine/crime';
import { joinGuild } from '../engine/guilds';
import { craft, enchantItem, gatherResource } from '../engine/crafting';
import { pickLock, takeLorebook, useShrine } from '../engine/dungeon';
import { engageWorldEvent } from '../engine/worldEvents';
import { adoptStray, goFishing, rideCarriage } from '../engine/services';
import { checkAchievements } from '../engine/achievements';
import { giveGift, spendTimeWith } from '../engine/romance';
import { autoResolve, autoRound } from '../engine/combat';
import { compactEvents, recordWritingStats } from '../engine/compile';
import { chooseAscension, identifyItem as identifyItemEngine, spendAttributePoint } from '../engine/progression';
import { buildBanterPrompt, rememberBanter } from '../engine/banter';
import { activeSlot, deleteBook, newBookSlot, renameBook, setActiveSlot, touchBook } from '../engine/books';
import { draftScene } from '../engine/proseLlm';
import { reorderScene } from '../engine/world';
import { createScenesFromBeats, markOutlined, type OutlineBeat } from '../engine/outline';
import { maybeCompanionMoment } from '../engine/moments';
import { placeBid } from '../engine/auction';
import { allCachedArt, collectWorldArt, deleteArt, importArtPack, initArtCache, saveArt } from '../engine/artFiles';
import { contestArchery, contestSong, enterPitTrials } from '../engine/tournament';
import { boardQuests, describeRoom, generateRumor, letterCandidates, rewordEncounter, rewordQuest, rumorGrounds, writeLetter } from '../engine/flavorLlm';
import { brewAtHome, buyFirstHome, cookAtHome, fletchArrows, hostFeast, prayAtShrine, repairAtHome, sparAtHome } from '../engine/household';
import { setMusicEnabled, setSfxEnabled, sfx, startMusic, stopMusic, type MusicTheme } from '../sound';

setSfxEnabled(localStorage.getItem('storyengine.sound') !== '0');
setMusicEnabled(localStorage.getItem('storyengine.music') !== '0');

export type PanelTab =
  | 'location'
  | 'quests'
  | 'muse'
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
  /** outline handed from the Muse panel to the Draft Scene tool */
  museOutline: string | null;
  /** game-first layout: manuscript collapses, the sim gets the screen */
  playMode: boolean;
  /** synthesized sound effects on/off */
  soundOn: boolean;
  /** direction the party last walked — the first-person view faces this way */
  facing: 'north' | 'south' | 'east' | 'west';
  /** chip-tune loops on/off */
  musicOn: boolean;
  /** 'compass' = arrows are absolute N/S/E/W; 'relative' = up walks forward, left/right turn */
  moveScheme: 'compass' | 'relative';
  /** live NPC conversation (LLM-driven) */
  talk: {
    npcId: string;
    povId: string;
    messages: ChatMessage[]; // excludes the system prompt
    busy: boolean;
    error: string | null;
    /** companion-moment context appended to the system prompt */
    hook?: string;
    /** second companion — a two-voice banter scene the MC overhears */
    banterWith?: string;
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
  setMonsterArt: (templateKey: string, dataUri: string | null) => void;
  setCharacterArt: (charId: string, dataUri: string | null) => void;
  /** bumps whenever custom art changes so portraits re-render */
  artVersion: number;
  initArt: () => Promise<void>;

  // scenes extras
  outlineCreateScenes: (beats: OutlineBeat[], chapter: number) => number;
  outlineMarkDone: () => void;
  moveScene: (id: SceneId, dir: -1 | 1) => void;
  draftSelectedScene: (outline: string) => Promise<string | null>;

  // books
  switchBook: (slot: string) => void;
  createBook: (name: string) => void;
  removeBook: (slot: string) => void;
  renameActiveBook: (name: string) => void;

  // crime & justice
  crimePickpocket: (targetId: string) => void;
  crimeBurgle: () => void;
  crimePayBounty: () => void;
  arrestAct: (what: 'pay' | 'resist' | 'flee' | 'surrender') => void;
  spendPoint: (charId: string, attr: string) => void;

  // quests
  questAccept: (id: string) => void;
  questDecline: (id: string) => void;
  questTurnIn: (id: string, choiceKey?: string) => void;
  guildJoin: (key: string) => void;

  // crafting & dungeon interactivity
  craftAct: (recipeKey: string) => void;
  enchantAct: (itemId: string) => void;
  gatherAct: () => void;
  pickLockAct: () => void;
  shrineAct: () => void;
  lorebookAct: () => void;
  eventEngage: () => void;
  carriageRide: (destId: string) => void;
  fishAct: () => void;
  adoptPet: () => void;

  // romance
  gift: (npcId: string, itemId: string) => void;
  date: (npcId: string, activityKey: string) => void;

  // combat autopilot
  combatAutoRound: () => void;
  combatAutoResolve: () => void;

  // world rules & maintenance
  setDoomEnabled: (on: boolean) => void;
  setResurrectionRule: (rule: 'safe' | 'risky') => void;
  setPlayMode: (on: boolean) => void;
  setSoundOn: (on: boolean) => void;
  setMusicOn: (on: boolean) => void;
  setMoveScheme: (scheme: 'compass' | 'relative') => void;
  turnFacing: (dir: 'north' | 'south' | 'east' | 'west') => void;
  setRow: (charId: string, row: 'front' | 'back') => void;
  torchAct: () => void;
  campAct: () => void;
  auctionBid: (lotIdx: number, offer: number) => void;
  pitEnter: () => void;
  contestAct: (kind: 'archery' | 'song', charId: string) => void;

  // AI flavor — the model writes prose around sim facts
  aiDescribeRoom: () => Promise<void>;
  aiBuyRumor: () => Promise<void>;
  aiRewordBoard: () => Promise<void>;
  aiRewordEncounter: () => Promise<void>;
  aiBusy: string | null;
  identifyItem: (itemId: string) => void;
  ascend: (charId: string, pathKey: string) => void;
  compactLog: () => void;

  // companion moments
  hearMoment: () => Promise<void>;
  dismissMoment: () => void;

  // functional home rooms
  homeCook: () => void;
  homeSpar: () => void;
  homeBrew: () => void;
  homeRepair: (itemId: string) => void;
  homeBuyFirst: () => void;
  homePray: () => void;
  homeFletch: () => void;
  homeFeast: (factionId: string) => void;

  // prose → sim sync (author-approved)
  applyProposals: (proposals: SyncProposal[]) => string[];

  // NPC conversation
  openTalk: (npcId: string) => void;
  sendTalkLine: (text: string) => Promise<void>;
  talkToScene: () => void;
  endTalk: (remember: boolean) => Promise<void>;

  // dungeon actions
  setMuseOutline: (outline: string | null) => void;
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
  resetWorld: (opts?: { deathRule?: WorldState['deathRule']; resurrectionRule?: 'safe' | 'risky'; mcClass?: import('../engine/types').CharClass; mcBonus?: Partial<import('../engine/types').Attributes> }) => void;
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
  museOutline: null,
  playMode: localStorage.getItem('storyengine.playmode') === '1',
  soundOn: localStorage.getItem('storyengine.sound') !== '0',
  musicOn: localStorage.getItem('storyengine.music') !== '0',
  moveScheme: (localStorage.getItem('storyengine.movescheme') === 'compass' ? 'compass' : 'relative') as 'compass' | 'relative',
  facing: 'north',
  aiBusy: null,
  artVersion: 0,
  talk: null,

  commit: (opts) => {
    const { world } = get();
    checkAchievements(world);
    let snapshots = get().snapshots;
    if (opts?.autosave) {
      snapshots = pruneSnapshots([...snapshots, makeSnapshot(world, 'auto', opts.autosave)]);
    }
    set({ world: { ...world }, snapshots });
    if (get().musicOn) {
      startMusic((world.combat?.active ? 'combat' : world.currentDungeon ? 'dungeon' : 'city') as MusicTheme);
    }
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
    maybePatrolStop(world);
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
    const { world, commit, setToast } = get();
    advanceUntilMorning(world);
    restockShops(world);
    refreshJobs(world);
    maybeCompanionMoment(world);
    commit({ autosave: 'Slept until morning' });
    // sometimes, someone who loves you leaves a letter by the bed
    const candidates = letterCandidates(world);
    if (candidates.length && Math.random() < 0.2) {
      const charId = candidates[Math.floor(Math.random() * candidates.length)];
      void writeLetter(loadLlmConfig(), world, charId)
        .then((text) => {
          const w = get().world;
          const c = w.characters[charId];
          if (!c || text.length < 20) return;
          logEvent(w, 'letter', { from: charId }, `${c.name} left a letter where ${w.characters[w.mcId].name} would find it:\n\n“${text}”`, { witnesses: [w.mcId, charId] });
          c.memories.push({ subject: w.mcId, event: 'I wrote it down and left it where they would find it. Braver on paper.', importance: 5, emotionalValue: 4, day: w.time.day });
          setToast(`📜 ${c.name} left you a letter — it's in the event log.`);
          get().commit();
        })
        .catch(() => {});
    }
  },

  // ---------- services ----------
  shopBuy: (entryIdx) => {
    const { world, commit, setToast } = get();
    const err = buyFromShop(world, world.partyLocation, entryIdx, world.characters[world.mcId]);
    if (err) setToast(err);
    else sfx('coin');
    commit();
  },

  shopSell: (itemId) => {
    const { world, commit, setToast } = get();
    const owner = world.items[itemId]?.owner;
    const seller = typeof owner === 'string' ? world.characters[owner] : undefined;
    const err = sellToShop(world, world.partyLocation, itemId, seller ?? world.characters[world.mcId]);
    if (err) setToast(err);
    else sfx('coin');
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
    else {
      sfx('levelup');
      setToast(`${world.characters[charId].name} trained to level ${world.characters[charId].level}.`);
    }
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

  setMonsterArt: (templateKey, dataUri) => {
    // art lives in IndexedDB, not the save — localStorage stays lean
    if (dataUri) void saveArt('monster', templateKey, dataUri);
    else void deleteArt('monster', templateKey);
    set({ artVersion: get().artVersion + 1 });
  },

  setCharacterArt: (charId, dataUri) => {
    if (dataUri) void saveArt('char', charId, dataUri);
    else void deleteArt('char', charId);
    set({ artVersion: get().artVersion + 1 });
  },

  initArt: async () => {
    await initArtCache();
    // legacy saves carried art inside the world (and every snapshot);
    // sweep it into IndexedDB once and shrink the save for good
    const { world, snapshots, commit } = get();
    const legacy = collectWorldArt(world, snapshots);
    const moved = Object.keys(legacy).length;
    if (moved) {
      for (const [key, uri] of Object.entries(legacy)) {
        const [kind, ...rest] = key.split(':');
        await saveArt(kind as 'monster' | 'char', rest.join(':'), uri);
      }
      commit();
      get().setToast(`${moved} custom portrait${moved === 1 ? '' : 's'} moved out of the save into browser storage — saves are lighter now.`);
    }
    set({ artVersion: get().artVersion + 1 });
  },

  outlineCreateScenes: (beats, chapter) => {
    const { world, commit } = get();
    const created = createScenesFromBeats(world, beats, chapter);
    logEvent(world, 'outline.created', { chapter, scenes: created.map((s) => s.id) }, `Outline-from-play produced ${created.length} scene stubs for Chapter ${chapter}.`);
    commit({ autosave: 'Outline created' });
    if (created.length) set({ selectedSceneId: created[0].id });
    return created.length;
  },

  outlineMarkDone: () => {
    const { world, commit } = get();
    markOutlined(world);
    commit();
  },

  moveScene: (id, dir) => {
    const { world, commit } = get();
    if (reorderScene(world, id, dir)) commit();
  },

  draftSelectedScene: async (outline) => {
    const { world, selectedSceneId, setToast } = get();
    const scene = world.scenes.find((sc) => sc.id === selectedSceneId);
    if (!scene) {
      setToast('Select a scene first.');
      return null;
    }
    try {
      const draft = await draftScene(loadLlmConfig(), world, scene, outline);
      const cur = get().world.scenes.find((sc) => sc.id === selectedSceneId);
      if (cur) {
        cur.text = cur.text.replace(/\s*$/, '') + (cur.text.trim() ? '\n\n' : '') + draft + '\n';
        get().commit();
      }
      return draft;
    } catch (e) {
      setToast(`Draft failed: ${e instanceof Error ? e.message : e}`);
      return null;
    }
  },

  // ---------- books ----------
  switchBook: (slot) => {
    const { world, snapshots } = get();
    persistProject(world, snapshots); // save the current book first
    setActiveSlot(slot);
    const loaded = loadProject();
    if (loaded) {
      set({ world: loaded.world, snapshots: loaded.snapshots, selectedSceneId: loaded.world.scenes[0]?.id ?? null, chestLoot: null, talk: null, prepDungeon: null });
    } else {
      const fresh = buildSeedWorld();
      logEvent(fresh, 'world.created', {}, 'The chronicle begins.');
      const snaps = [makeSnapshot(fresh, 'manual', 'World created')];
      persistProject(fresh, snaps);
      set({ world: fresh, snapshots: snaps, selectedSceneId: fresh.scenes[0]?.id ?? null, chestLoot: null, talk: null, prepDungeon: null });
    }
  },

  createBook: (name) => {
    const { world, snapshots, switchBook } = get();
    persistProject(world, snapshots);
    const slot = newBookSlot();
    touchBook(slot, name || 'Untitled book');
    switchBook(slot);
  },

  removeBook: (slot) => {
    deleteBook(slot);
    if (activeSlot() === 'default' && slot !== 'default') {
      get().switchBook('default');
    }
  },

  renameActiveBook: (name) => {
    renameBook(activeSlot(), name);
    get().commit();
  },

  // ---------- crime & justice ----------
  crimePickpocket: (targetId) => {
    const { world, commit, setToast } = get();
    const err = pickpocket(world, targetId);
    if (err) setToast(err);
    commit({ autosave: 'Pickpocket' });
  },

  crimeBurgle: () => {
    const { world, commit, setToast } = get();
    const err = burgleShop(world, world.partyLocation);
    if (err) setToast(err);
    commit({ autosave: 'Burglary' });
  },

  crimePayBounty: () => {
    const { world, commit, setToast } = get();
    const err = payBountyAt(world, world.partyLocation);
    if (err) setToast(err);
    commit();
  },

  arrestAct: (what) => {
    const { world, commit, setToast } = get();
    const err = what === 'pay' ? arrestPay(world) : what === 'resist' ? arrestResist(world) : what === 'flee' ? arrestFlee(world) : arrestSurrender(world);
    if (err) setToast(err);
    commit({ autosave: 'Watch patrol' });
  },

  spendPoint: (charId, attr) => {
    const { world, commit, setToast } = get();
    const c = world.characters[charId];
    if (!c) return;
    const err = spendAttributePoint(world, c, attr as never);
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
    const { world, commit, setToast } = get();
    const err = declineQuest(world, id);
    if (err) setToast(err);
    commit();
  },

  questTurnIn: (id, choiceKey) => {
    const { world, commit, setToast } = get();
    const err = turnInQuest(world, id, choiceKey);
    if (err) setToast(err);
    commit({ autosave: 'Quest turned in' });
  },

  guildJoin: (key) => {
    const { world, commit, setToast } = get();
    const err = joinGuild(world, key);
    if (err) setToast(err);
    commit({ autosave: 'Joined guild' });
  },

  craftAct: (recipeKey) => {
    const { world, commit, setToast } = get();
    const err = craft(world, recipeKey);
    if (err) setToast(err);
    commit({ autosave: 'Crafting' });
  },

  enchantAct: (itemId) => {
    const { world, commit, setToast } = get();
    const err = enchantItem(world, itemId);
    if (err) setToast(err);
    commit({ autosave: 'Enchanting' });
  },

  gatherAct: () => {
    const { world, commit, setToast } = get();
    const err = gatherResource(world);
    if (err) setToast(err);
    commit();
  },

  pickLockAct: () => {
    const { world, commit, setToast } = get();
    const res = pickLock(world);
    if ('error' in res) setToast(res.error);
    commit();
  },

  shrineAct: () => {
    const { world, commit, setToast } = get();
    const res = useShrine(world);
    if ('error' in res) setToast(res.error);
    commit();
  },

  lorebookAct: () => {
    const { world, commit, setToast } = get();
    const res = takeLorebook(world);
    if ('error' in res) setToast(res.error);
    else setToast('Added to the Codex (Muse panel).');
    commit({ autosave: 'Lorebook' });
  },

  eventEngage: () => {
    const { world, commit, setToast } = get();
    const err = engageWorldEvent(world);
    if (err) setToast(err);
    commit({ autosave: 'World event' });
  },

  carriageRide: (destId) => {
    const { world, commit, setToast } = get();
    const err = rideCarriage(world, destId);
    if (err) setToast(err);
    commit({ autosave: 'Carriage' });
  },

  fishAct: () => {
    const { world, commit, setToast } = get();
    const err = goFishing(world);
    if (err) setToast(err);
    commit({ autosave: 'Fishing' });
  },

  adoptPet: () => {
    const { world, commit, setToast } = get();
    const err = adoptStray(world);
    if (err) setToast(err);
    commit();
  },

  gift: (npcId, itemId) => {
    const { world, commit, setToast } = get();
    const err = giveGift(world, npcId, itemId);
    if (err) setToast(err);
    commit({ autosave: 'Gift' });
  },

  date: (npcId, activityKey) => {
    const { world, commit, setToast } = get();
    const err = spendTimeWith(world, npcId, activityKey);
    if (err) setToast(err);
    commit({ autosave: 'Time together' });
  },

  combatAutoRound: () => {
    const { world, commit } = get();
    const after = () => {
      const oc = get().world.combat?.outcome;
      sfx(oc === 'victory' ? 'victory' : oc === 'defeat' ? 'defeat' : 'hit');
    };
    autoRound(world);
    after();
    commit();
  },

  combatAutoResolve: () => {
    const { world, commit } = get();
    autoResolve(world);
    const oc = get().world.combat?.outcome;
    sfx(oc === 'victory' ? 'victory' : oc === 'defeat' ? 'defeat' : 'miss');
    commit({ autosave: 'Auto-resolved fight' });
  },

  setDoomEnabled: (on) => {
    const { world, commit } = get();
    world.doomEnabled = on;
    commit();
  },

  setResurrectionRule: (rule) => {
    const { world, commit } = get();
    world.resurrectionRule = rule;
    commit();
  },

  setPlayMode: (on) => {
    localStorage.setItem('storyengine.playmode', on ? '1' : '0');
    set({ playMode: on });
  },

  setSoundOn: (on) => {
    localStorage.setItem('storyengine.sound', on ? '1' : '0');
    setSfxEnabled(on);
    if (on) sfx('coin');
    set({ soundOn: on });
  },

  setMusicOn: (on) => {
    localStorage.setItem('storyengine.music', on ? '1' : '0');
    setMusicEnabled(on);
    if (on) {
      const w = get().world;
      startMusic(w.combat?.active ? 'combat' : w.currentDungeon ? 'dungeon' : 'city');
    } else {
      stopMusic();
    }
    set({ musicOn: on });
  },

  setMoveScheme: (scheme) => {
    localStorage.setItem('storyengine.movescheme', scheme);
    set({ moveScheme: scheme });
  },

  turnFacing: (dir) => {
    set({ facing: dir });
  },

  setRow: (charId, row) => {
    const { world, commit } = get();
    const c = world.characters[charId];
    if (!c) return;
    c.row = row;
    commit();
  },

  torchAct: () => {
    const { world, commit, setToast } = get();
    const err = lightTorch(world);
    if (err) setToast(err);
    else sfx('fight');
    commit();
  },

  campAct: () => {
    const { world, commit, setToast } = get();
    const err = campInDungeon(world);
    if (err) setToast(err);
    else if (world.pendingEncounter) setToast('Something found the fire.');
    commit({ autosave: err ? undefined : 'Camped underground' });
  },

  auctionBid: (lotIdx, offer) => {
    const { world, commit, setToast } = get();
    const err = placeBid(world, lotIdx, offer);
    if (err) setToast(err);
    else sfx('coin');
    commit({ autosave: err ? undefined : 'Auction won' });
  },

  pitEnter: () => {
    const { world, commit, setToast } = get();
    const err = enterPitTrials(world);
    if (err) setToast(err);
    else sfx('fight');
    commit();
  },

  contestAct: (kind, charId) => {
    const { world, commit, setToast } = get();
    const err = kind === 'archery' ? contestArchery(world, charId) : contestSong(world, charId);
    if (err) setToast(err);
    else sfx('victory');
    commit();
  },

  aiDescribeRoom: async () => {
    const { world, commit, setToast } = get();
    if (!world.currentDungeon || !world.currentRoom) return;
    set({ aiBusy: 'room' });
    try {
      const text = await describeRoom(loadLlmConfig(), world);
      const w = get().world;
      if (w.currentDungeon && w.currentRoom) {
        const room = w.dungeons[w.currentDungeon].rooms[w.currentRoom];
        room.description = text;
        logEvent(w, 'flavor.room', { room: room.id }, `The room resolved into focus: ${text}`);
        commit();
      }
    } catch (e) {
      setToast(`The model stayed silent: ${e instanceof Error ? e.message : String(e)}`);
    }
    set({ aiBusy: null });
  },

  aiBuyRumor: async () => {
    const { world, commit, setToast } = get();
    const mc = world.characters[world.mcId];
    const grounds = rumorGrounds(world);
    if (!grounds.length) { setToast('The lamplighters have nothing tonight. A quiet city, briefly.'); return; }
    const price = 20;
    if (mc.money < price) { setToast(`A rumor costs ${price} copper. Lamp oil isn't free.`); return; }
    mc.money -= price;
    const ground = grounds[Math.floor(Math.random() * grounds.length)];
    set({ aiBusy: 'rumor' });
    let line = ground.fallback;
    try {
      line = await generateRumor(loadLlmConfig(), world, ground);
    } catch {
      // the fallback rumor is still true — the sim wrote it
    }
    const w = get().world;
    w.characters[w.mcId].knowledge.push({ fact: `Rumor (${ground.kind}): ${line}`, day: w.time.day, accurate: true });
    logEvent(w, 'rumor', { kind: ground.kind, price }, `A lamplighter leaned on their pole and sold ${w.characters[w.mcId].name} a rumor: “${line}”`, { location: w.partyLocation });
    sfx('coin');
    commit();
    set({ aiBusy: null });
  },

  aiRewordBoard: async () => {
    const { world, commit, setToast } = get();
    const jobs = boardQuests(world);
    if (!jobs.length) { setToast('The board is bare.'); return; }
    set({ aiBusy: 'board' });
    let changed = 0;
    for (const q of jobs) {
      try {
        const text = await rewordQuest(loadLlmConfig(), world, q);
        if (text.length > 20) {
          get().world.quests[q.id].description = text;
          changed++;
        }
      } catch {
        break; // model unreachable — keep the rest as written
      }
    }
    if (changed) {
      setToast(`${changed} posting${changed === 1 ? '' : 's'} reworded in the posters' own voices.`);
      commit();
    } else {
      setToast('The model stayed silent; the board keeps its plain hand.');
    }
    set({ aiBusy: null });
  },

  aiRewordEncounter: async () => {
    const { world, commit, setToast } = get();
    if (!world.pendingEncounter) return;
    set({ aiBusy: 'encounter' });
    try {
      const text = await rewordEncounter(loadLlmConfig(), world);
      const w = get().world;
      if (w.pendingEncounter && text.length > 10) {
        w.pendingEncounter.description = text;
        commit();
      }
    } catch (e) {
      setToast(`The model stayed silent: ${e instanceof Error ? e.message : String(e)}`);
    }
    set({ aiBusy: null });
  },

  identifyItem: (itemId) => {
    const { world, commit, setToast } = get();
    const err = identifyItemEngine(world, itemId);
    if (err) setToast(err);
    else setToast(`Identified: ${world.items[itemId]?.name}`);
    commit();
  },

  ascend: (charId, pathKey) => {
    const { world, commit, setToast } = get();
    const err = chooseAscension(world, charId, pathKey);
    if (err) setToast(err);
    else sfx('levelup');
    commit({ autosave: err ? undefined : 'Ascension' });
  },

  compactLog: () => {
    const { world, commit, setToast } = get();
    const res = compactEvents(world);
    setToast(res.removed ? `${res.removed} routine events compacted; ${res.kept} remain (milestones kept).` : 'Nothing worth compacting yet — outline your play first.');
    commit();
  },

  // ---------- companion moments ----------
  hearMoment: async () => {
    const { world, commit } = get();
    const m = world.pendingMoment;
    if (!m) return;
    world.pendingMoment = null;
    const npc = world.characters[m.npcId];
    const pov = world.characters[world.mcId];
    if (m.banterWith) {
      // two-voice scene: the model plays both companions at once
      set({ talk: { npcId: m.npcId, povId: world.mcId, messages: [], busy: true, error: null, hook: m.hook, banterWith: m.banterWith } });
      commit();
      try {
        const prompt = buildBanterPrompt(world, m.npcId, m.banterWith, m.hook);
        const reply = await chatWithNpc({ ...loadLlmConfig(), temperature: 0.9 }, prompt);
        const cur = get().talk;
        if (!cur || cur.npcId !== m.npcId) return;
        set({ talk: { ...cur, messages: [{ role: 'assistant', content: reply }], busy: false } });
      } catch {
        const cur = get().talk;
        const other = world.characters[m.banterWith];
        if (cur) set({ talk: { ...cur, messages: [{ role: 'assistant', content: `*${npc.name} and ${other?.name} are talking in low voices nearby — you catch your own name in it.*` }], busy: false } });
      }
      return;
    }
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

  homeBuyFirst: () => {
    const { world, commit, setToast } = get();
    const err = buyFirstHome(world);
    if (err) setToast(err);
    else setToast('The flat is his. Sleeping at home is free now — and the household can grow.');
    commit({ autosave: 'Bought first home' });
  },

  homePray: () => {
    const { world, commit, setToast } = get();
    const err = prayAtShrine(world);
    if (err) setToast(err);
    commit();
  },

  homeFletch: () => {
    const { world, commit, setToast } = get();
    const err = fletchArrows(world);
    if (err) setToast(err);
    commit();
  },

  homeFeast: (factionId) => {
    const { world, commit, setToast } = get();
    const err = hostFeast(world, factionId);
    if (err) setToast(err);
    commit({ autosave: 'Feast' });
  },

  setMuseOutline: (outline) => set({ museOutline: outline }),
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
      const system = talk.banterWith
        ? buildBanterPrompt(world, talk.npcId, talk.banterWith, talk.hook ?? '')[0].content
        : buildNpcSystemPrompt(world, talk.npcId, talk.povId)
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
    if (talk.banterWith) {
      // both companions remember the exchange; it happened in earshot of the MC
      addMinutes(world, Math.max(10, talk.messages.length * 5));
      const firstLine = talk.messages.find((m) => m.role === 'assistant')?.content.split('\n')[0] ?? 'an exchange on the road';
      rememberBanter(world, talk.npcId, talk.banterWith, firstLine.slice(0, 140));
      commit({ autosave: 'Banter kept' });
      return;
    }
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
    if (dir === 'up' || dir === 'down') sfx('stairs');
    else {
      sfx('step');
      set({ facing: dir });
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
    sfx('chest');
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
    sfx('fight');
    const { world, commit } = get();
    if (!world.pendingEncounter) return;
    startCombat(world, world.pendingEncounter);
    commit({ autosave: 'Combat started' });
  },

  doRound: (planned) => {
    const { world, commit } = get();
    const roundSound = () => {
      const oc = get().world.combat?.outcome;
      sfx(oc === 'victory' ? 'victory' : oc === 'defeat' ? 'defeat' : 'hit');
    };
    resolveRound(world, planned);
    roundSound();
    commit();
  },

  finishLoot: (which) => {
    const { world, commit } = get();
    takeLoot(world, which);
    if (which !== 'none') sfx('coin');
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
    if (!c.inParty && partyMembers(world).length >= 8) {
      setToast('The party is full (8).');
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
    const { world, commit, setToast } = get();
    const item = world.items[itemId];
    const owner = item?.owner ? world.characters[item.owner] : null;
    if (!item || !owner || item.slot === 'none') return;
    if (item.unidentified) {
      setToast('The enchantment is unread — identify it before trusting it on your body.');
      return;
    }
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
    recordWritingStats(world);
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
    exportProject(get().world, get().snapshots, allCachedArt());
  },

  doImport: async (file) => {
    const data = await importProject(file);
    if (!data) {
      set({ toast: 'Import failed: not a valid project file.' });
      return;
    }
    if (data.artPack) await importArtPack(data.artPack);
    // older exports carried art inside the world itself
    const legacy = collectWorldArt(data.world, data.snapshots);
    for (const [key, uri] of Object.entries(legacy)) {
      const [kind, ...rest] = key.split(':');
      await saveArt(kind as 'monster' | 'char', rest.join(':'), uri);
    }
    persistProject(data.world, data.snapshots);
    set({ world: data.world, snapshots: data.snapshots, selectedSceneId: data.world.scenes[0]?.id ?? null, toast: 'Project imported.', artVersion: get().artVersion + 1 });
  },

  resetWorld: (opts) => {
    clearProject();
    const world = buildSeedWorld();
    world.masterSeed = randomSeed();
    if (opts?.deathRule) world.deathRule = opts.deathRule;
    if (opts?.resurrectionRule) world.resurrectionRule = opts.resurrectionRule;
    if (opts?.mcClass || opts?.mcBonus) remakeMc(world, opts?.mcClass ?? 'fighter', opts?.mcBonus ?? {});
    logEvent(world, 'world.created', {}, `The chronicle of Blackwall City begins. (${world.deathRule} death, ${world.resurrectionRule ?? 'safe'} resurrection)`);
    const snapshots = [makeSnapshot(world, 'manual', 'World created')];
    persistProject(world, snapshots);
    set({ world, snapshots, selectedSceneId: world.scenes[0]?.id ?? null, chestLoot: null });
  },
}));
