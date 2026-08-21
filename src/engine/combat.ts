// Bard's Tale-style round-based combat. The author picks actions for
// each party member; enemy actions come from simple combat AI; the
// round resolves in initiative order. Every action produces a
// structured log entry — the canonical combat record. Prose is
// derived later by the narrative bridge and never contradicts it.
//
// All numbers (XP, potion effects, status rules) come from the RPG
// Rules Engine — combat only orchestrates.

import type {
  Character,
  CombatLogEntry,
  CombatState,
  CombatantMonster,
  Item,
  PendingEncounter,
  PlannedAction,
  WorldState,
} from './types';
import { MONSTERS } from './monsters';
import { Rng } from './rng';
import { addMinutes, grantXp, logEvent, nextId, partyMembers, reactToAct } from './world';
import {
  addToContainer,
  applyStatus,
  consumeItem,
  makeItem,
  cureStatus,
  hasStatus,
  injuryAttackMod,
  injuryDefenseMod,
  needsAttackMod,
  needsDefenseMod,
  removeUnits,
  rollInjury,
  statusAttackMod,
  statusDefenseMod,
  tickStatusesRound,
} from './rules';
import { generateLoot } from './loot';
import { checkQuests } from './quests';
import { affixMod, trainSkill } from './progression';
import { resolveWorldEventVictory } from './worldEvents';
import { makeEliteCombatant, settleElites } from './rivals';
import { driftCompanionBonds } from './banter';
import { settleTournament } from './tournament';

export interface SkillDef {
  name: string;
  stamina: number;
  toHitMod: number;
  dmgBonus: number;
  stuns?: boolean;
  blinds?: boolean;
  critBonus?: number;
  extraTargets?: number; // cleave
  doubleHit?: boolean; // twin strike
}

export const SKILLS: Record<string, SkillDef> = {
  // monk forms — the House of the Open Hand
  'palm-strike': { name: 'Palm Strike', stamina: 3, toHitMod: 1, dmgBonus: 2, stuns: true },
  'flowing-fists': { name: 'Flowing Fists', stamina: 4, toHitMod: 0, dmgBonus: 1, doubleHit: true },
  'iron-knuckle': { name: 'Iron Knuckle', stamina: 5, toHitMod: 0, dmgBonus: 5, critBonus: 10 },
  'whirling-crane': { name: 'Whirling Crane', stamina: 7, toHitMod: -1, dmgBonus: 2, extraTargets: 2 },
  'pressure-point': { name: 'Pressure Point', stamina: 6, toHitMod: 2, dmgBonus: 3, stuns: true, critBonus: 15 },
  'hundred-hands': { name: 'Hundred Hands', stamina: 9, toHitMod: 0, dmgBonus: 3, doubleHit: true, extraTargets: 1 },
  'dragon-fist': { name: 'Dragon Fist', stamina: 10, toHitMod: 1, dmgBonus: 9, critBonus: 20 },
  'empty-body': { name: 'Empty Body', stamina: 12, toHitMod: 2, dmgBonus: 8, doubleHit: true, critBonus: 25 },
  'fist-of-the-void': { name: 'Fist of the Void', stamina: 15, toHitMod: 2, dmgBonus: 16, stuns: true, critBonus: 30 },
  // bard steel (when the song isn't enough)
  'cutting-jest': { name: 'Cutting Jest', stamina: 4, toHitMod: 1, dmgBonus: 2, blinds: true },
  // spellblade forms
  riposte: { name: 'Riposte', stamina: 4, toHitMod: 2, dmgBonus: 3 },
  'flame-brand': { name: 'Flame Brand', stamina: 6, toHitMod: 0, dmgBonus: 6 },
  'mirror-parry': { name: 'Mirror Parry', stamina: 8, toHitMod: 1, dmgBonus: 5, stuns: true },
  'runed-cleave': { name: 'Runed Cleave', stamina: 10, toHitMod: 0, dmgBonus: 6, extraTargets: 2 },
  'edge-of-dawn': { name: 'Edge of Dawn', stamina: 14, toHitMod: 2, dmgBonus: 14, critBonus: 25 },
  // fighter line
  'shield-bash': { name: 'Shield Bash', stamina: 3, toHitMod: 0, dmgBonus: 2, stuns: true },
  'power-strike': { name: 'Power Strike', stamina: 4, toHitMod: -2, dmgBonus: 5 },
  cleave: { name: 'Cleave', stamina: 5, toHitMod: -1, dmgBonus: 2, extraTargets: 1 },
  whirlwind: { name: 'Whirlwind', stamina: 7, toHitMod: -2, dmgBonus: 2, extraTargets: 3 },
  'crushing-blow': { name: 'Crushing Blow', stamina: 6, toHitMod: -1, dmgBonus: 8, stuns: true },
  execute: { name: 'Execute', stamina: 7, toHitMod: 0, dmgBonus: 6, critBonus: 35 },
  'twin-cleave': { name: 'Twin Cleave', stamina: 9, toHitMod: -1, dmgBonus: 3, doubleHit: true, extraTargets: 1 },
  'titanic-strike': { name: 'Titanic Strike', stamina: 10, toHitMod: -2, dmgBonus: 14 },
  'avatar-of-war': { name: 'Avatar of War', stamina: 12, toHitMod: 0, dmgBonus: 10, extraTargets: 4 },
  worldbreaker: { name: 'Worldbreaker', stamina: 15, toHitMod: 0, dmgBonus: 20, stuns: true },
  // rogue line
  backstab: { name: 'Backstab', stamina: 3, toHitMod: 1, dmgBonus: 3, critBonus: 20 },
  'dirty-fighting': { name: 'Dirty Fighting', stamina: 3, toHitMod: 0, dmgBonus: 1, blinds: true },
  hamstring: { name: 'Hamstring', stamina: 5, toHitMod: 0, dmgBonus: 3, stuns: true },
  'shadow-strike': { name: 'Shadow Strike', stamina: 6, toHitMod: 2, dmgBonus: 4, critBonus: 30 },
  'twin-fangs': { name: 'Twin Fangs', stamina: 7, toHitMod: 0, dmgBonus: 2, doubleHit: true },
  garrote: { name: 'Garrote', stamina: 8, toHitMod: 1, dmgBonus: 8, stuns: true },
  'death-mark': { name: 'Death Mark', stamina: 9, toHitMod: 2, dmgBonus: 6, critBonus: 50 },
  'thousand-cuts': { name: 'A Thousand Cuts', stamina: 11, toHitMod: 0, dmgBonus: 4, doubleHit: true, extraTargets: 2 },
  kingslayer: { name: 'Kingslayer', stamina: 14, toHitMod: 2, dmgBonus: 18, critBonus: 40 },
  // ranger line
  'aimed-shot': { name: 'Aimed Shot', stamina: 3, toHitMod: 3, dmgBonus: 2 },
  'twin-strike': { name: 'Twin Strike', stamina: 5, toHitMod: -1, dmgBonus: 0, doubleHit: true },
  'pinning-shot': { name: 'Pinning Shot', stamina: 5, toHitMod: 1, dmgBonus: 2, stuns: true },
  volley: { name: 'Volley', stamina: 7, toHitMod: -1, dmgBonus: 1, extraTargets: 2 },
  'piercing-arrow': { name: 'Piercing Arrow', stamina: 7, toHitMod: 2, dmgBonus: 8 },
  'double-volley': { name: 'Double Volley', stamina: 9, toHitMod: -1, dmgBonus: 2, doubleHit: true, extraTargets: 2 },
  heartseeker: { name: 'Heartseeker', stamina: 10, toHitMod: 3, dmgBonus: 8, critBonus: 40 },
  'storm-of-arrows': { name: 'Storm of Arrows', stamina: 12, toHitMod: -1, dmgBonus: 4, extraTargets: 4 },
  'wind-that-kills': { name: 'The Wind That Kills', stamina: 15, toHitMod: 2, dmgBonus: 16, doubleHit: true },
  // berserker pit-work — the Pit of Honest Work
  'reckless-swing': { name: 'Reckless Swing', stamina: 3, toHitMod: -2, dmgBonus: 6 },
  'pit-roar': { name: 'Pit Roar', stamina: 4, toHitMod: 0, dmgBonus: 1, stuns: true },
  'blood-frenzy': { name: 'Blood Frenzy', stamina: 6, toHitMod: -1, dmgBonus: 2, doubleHit: true },
  'skull-splitter': { name: 'Skull-Splitter', stamina: 6, toHitMod: 0, dmgBonus: 6, critBonus: 20 },
  rampage: { name: 'Rampage', stamina: 8, toHitMod: -2, dmgBonus: 4, extraTargets: 2 },
  'bone-breaker': { name: 'Bone-Breaker', stamina: 8, toHitMod: -1, dmgBonus: 9, stuns: true },
  'red-mist': { name: 'Red Mist', stamina: 10, toHitMod: -1, dmgBonus: 5, doubleHit: true, extraTargets: 1 },
  'giant-feller': { name: 'Giant-Feller', stamina: 11, toHitMod: 0, dmgBonus: 15 },
  'the-long-madness': { name: 'The Long Madness', stamina: 13, toHitMod: -1, dmgBonus: 6, extraTargets: 4 },
  'the-last-red-day': { name: 'The Last Red Day', stamina: 16, toHitMod: 0, dmgBonus: 22, doubleHit: true },
  // paladin arms — the Lamplighters' vigil made steel
  censure: { name: 'Censure', stamina: 3, toHitMod: 1, dmgBonus: 3 },
  'radiant-smite': { name: 'Radiant Smite', stamina: 6, toHitMod: 1, dmgBonus: 6, critBonus: 10 },
  judgement: { name: 'Judgement', stamina: 8, toHitMod: 2, dmgBonus: 8, stuns: true },
  'crusaders-wrath': { name: "Crusader's Wrath", stamina: 11, toHitMod: 0, dmgBonus: 8, extraTargets: 2 },
  // late-book gap forms
  'guard-break': { name: 'Guard Break', stamina: 4, toHitMod: 1, dmgBonus: 3, stuns: true },
  'iron-tide': { name: 'Iron Tide', stamina: 10, toHitMod: -1, dmgBonus: 8, extraTargets: 2 },
  feint: { name: 'Feint', stamina: 4, toHitMod: 2, dmgBonus: 2, critBonus: 10 },
  'smoke-step': { name: 'Smoke Step', stamina: 10, toHitMod: 1, dmgBonus: 7, doubleHit: true, critBonus: 20 },
  'snare-shot': { name: 'Snare Shot', stamina: 5, toHitMod: 1, dmgBonus: 2, stuns: true },
  'rain-of-points': { name: 'Rain of Points', stamina: 11, toHitMod: -1, dmgBonus: 5, extraTargets: 3 },
  'crane-sweep': { name: 'Crane Sweep', stamina: 5, toHitMod: 0, dmgBonus: 3, extraTargets: 1, stuns: true },
  'mountain-palm': { name: 'Mountain Palm', stamina: 11, toHitMod: 1, dmgBonus: 12 },
  // cultivator body-arts — the Hermitage's long ladder (warrior monk with magic)
  'iron-body-palm': { name: 'Iron Body Palm', stamina: 3, toHitMod: 1, dmgBonus: 3, stuns: true },
  'sword-qi-slash': { name: 'Sword-Qi Slash', stamina: 5, toHitMod: 1, dmgBonus: 5, critBonus: 10 },
  'hundred-step-palm': { name: 'Hundred-Step Palm', stamina: 8, toHitMod: 0, dmgBonus: 4, extraTargets: 2 },
  'dragon-sinew-strike': { name: 'Dragon-Sinew Strike', stamina: 10, toHitMod: 1, dmgBonus: 12, critBonus: 15 },
  'mountain-splitting-fist': { name: 'Mountain-Splitting Fist', stamina: 13, toHitMod: 0, dmgBonus: 18, stuns: true },
  'the-immortal-ascent': { name: 'The Immortal Ascent', stamina: 20, toHitMod: 2, dmgBonus: 24, doubleHit: true, critBonus: 25 },
  // past the mortal ceiling — L50/L65 forms
  warmaster: { name: 'Warmaster', stamina: 16, toHitMod: 2, dmgBonus: 18, extraTargets: 3 },
  'the-standing-army': { name: 'The Standing Army', stamina: 22, toHitMod: 1, dmgBonus: 22, extraTargets: 5, stuns: true },
  ghostblade: { name: 'Ghostblade', stamina: 15, toHitMod: 3, dmgBonus: 16, critBonus: 45 },
  'the-unseen-hour': { name: 'The Unseen Hour', stamina: 20, toHitMod: 3, dmgBonus: 20, doubleHit: true, critBonus: 50 },
  'horizon-shot': { name: 'Horizon Shot', stamina: 16, toHitMod: 4, dmgBonus: 18, critBonus: 40 },
  'the-white-stag': { name: 'The White Stag', stamina: 22, toHitMod: 2, dmgBonus: 20, doubleHit: true, extraTargets: 2 },
  'stillness-between': { name: 'The Stillness Between', stamina: 16, toHitMod: 3, dmgBonus: 18, stuns: true, critBonus: 30 },
  'the-tenth-form': { name: 'The Tenth Form', stamina: 22, toHitMod: 2, dmgBonus: 24, doubleHit: true, stuns: true },
  'oath-of-edges': { name: 'Oath of Edges', stamina: 16, toHitMod: 2, dmgBonus: 17, extraTargets: 2, critBonus: 25 },
  'saint-errant': { name: 'Saint Errant', stamina: 16, toHitMod: 2, dmgBonus: 16, stuns: true, critBonus: 20 },
  'the-red-crown': { name: 'The Red Crown', stamina: 18, toHitMod: 0, dmgBonus: 26, doubleHit: true },
  'the-worlds-ending': { name: "The World's Ending", stamina: 26, toHitMod: 0, dmgBonus: 30, extraTargets: 5 },
};

export interface SpellDef {
  name: string;
  mana: number;
  damage?: string;
  /** drain arts: the caster feeds on what the spell takes (dice) */
  selfHeal?: string;
  heal?: string;
  healAll?: boolean; // heal the whole party
  cures?: boolean; // purify
  partyDefense?: number; // sanctuary
  hitsAll?: boolean; // fireball
  stunChance?: number; // frost-grasp
}

export const SPELLS: Record<string, SpellDef> = {
  // bard songs — the Broken Crown's own curriculum
  'sharp-word': { name: 'Sharp Word', mana: 3, damage: '1d6+1' },
  'rallying-chorus': { name: 'Rallying Chorus', mana: 6, heal: '1d6+2', healAll: true },
  'discordant-note': { name: 'Discordant Note', mana: 6, damage: '2d6+2', stunChance: 15 },
  'march-of-old-kings': { name: 'March of the Old Kings', mana: 9, heal: '1d8+4', healAll: true, partyDefense: 1 },
  'siren-strain': { name: 'Siren Strain', mana: 10, damage: '3d6', stunChance: 30 },
  'battle-hymn': { name: 'Battle Hymn', mana: 12, heal: '2d8+6', healAll: true, partyDefense: 2 },
  'song-of-the-broken-crown': { name: 'Song of the Broken Crown', mana: 15, damage: '4d6+4', hitsAll: true },
  requiem: { name: 'Requiem', mana: 18, damage: '5d6+6', hitsAll: true, stunChance: 20 },
  'the-last-song': { name: 'The Last Song', mana: 26, damage: '6d8+10', hitsAll: true, stunChance: 35 },
  // warlock pact-work — the Nameless Chapel does not advertise
  wither: { name: 'Wither', mana: 4, damage: '2d6+1' },
  'gnawing-dark': { name: 'Gnawing Dark', mana: 6, damage: '2d8+2' },
  hex: { name: 'Hex', mana: 7, damage: '1d8', stunChance: 40 },
  'soul-lash': { name: 'Soul Lash', mana: 9, damage: '3d8+2' },
  'black-tide': { name: 'Black Tide', mana: 12, damage: '3d6+3', hitsAll: true },
  unravel: { name: 'Unravel', mana: 14, damage: '4d8+4' },
  'pact-flame': { name: 'Pact Flame', mana: 16, damage: '5d8+5' },
  'devouring-sign': { name: 'Devouring Sign', mana: 20, damage: '5d6+8', hitsAll: true, stunChance: 20 },
  'the-hungry-door': { name: 'The Hungry Door', mana: 24, damage: '6d10+8', stunChance: 30 },
  'name-eater': { name: 'Name-Eater', mana: 30, damage: '8d10+10' },
  // spellblade edge-work
  'spark-edge': { name: 'Spark Edge', mana: 3, damage: '1d8+2' },
  'frost-guard': { name: 'Frost Guard', mana: 6, damage: '1d6', partyDefense: 1, stunChance: 20 },
  'storm-brand': { name: 'Storm Brand', mana: 10, damage: '3d8+2' },
  'runic-burst': { name: 'Runic Burst', mana: 14, damage: '3d6+4', hitsAll: true },
  'blade-tempest': { name: 'Blade Tempest', mana: 20, damage: '5d8+6', hitsAll: true },
  // mage line
  firebolt: { name: 'Firebolt', mana: 4, damage: '2d6' },
  'frost-grasp': { name: 'Frost Grasp', mana: 5, damage: '1d8', stunChance: 0.4 },
  fireball: { name: 'Fireball', mana: 9, damage: '2d6', hitsAll: true },
  'lightning-lance': { name: 'Lightning Lance', mana: 8, damage: '3d6' },
  'ice-storm': { name: 'Ice Storm', mana: 12, damage: '2d6', hitsAll: true, stunChance: 0.25 },
  immolate: { name: 'Immolate', mana: 12, damage: '4d6' },
  'chain-lightning': { name: 'Chain Lightning', mana: 16, damage: '3d6', hitsAll: true },
  meteor: { name: 'Meteor', mana: 20, damage: '6d6' },
  cataclysm: { name: 'Cataclysm', mana: 26, damage: '4d6', hitsAll: true },
  unmaking: { name: 'The Unmaking Word', mana: 34, damage: '10d6' },
  // priest line
  'mend-wounds': { name: 'Mend Wounds', mana: 3, heal: '1d8+2' },
  purify: { name: 'Purify', mana: 4, cures: true },
  sanctuary: { name: 'Sanctuary', mana: 6, partyDefense: 2 },
  'greater-mending': { name: 'Greater Mending', mana: 7, heal: '2d8+6' },
  smite: { name: 'Smite', mana: 7, damage: '2d8' },
  'circle-of-renewal': { name: 'Circle of Renewal', mana: 12, heal: '1d8+6', healAll: true },
  'holy-fire': { name: 'Holy Fire', mana: 12, damage: '3d8' },
  aegis: { name: 'Aegis', mana: 14, partyDefense: 4 },
  'mass-renewal': { name: 'Mass Renewal', mana: 20, heal: '2d8+8', healAll: true },
  'divine-wrath': { name: 'Divine Wrath', mana: 26, damage: '3d8', hitsAll: true },
  // necromancer bone-craft — the Graverow bonehouses
  'bone-dart': { name: 'Bone Dart', mana: 4, damage: '2d6' },
  'chill-touch': { name: 'Chill Touch', mana: 5, damage: '1d8', stunChance: 30 },
  'corpse-burst': { name: 'Corpse-Burst', mana: 9, damage: '2d6', hitsAll: true },
  'marrow-drain': { name: 'Marrow Drain', mana: 8, damage: '3d6+1' },
  'grave-chill': { name: 'Grave-Chill', mana: 12, damage: '2d6+1', hitsAll: true, stunChance: 20 },
  'wither-limb': { name: 'Wither the Limb', mana: 12, damage: '4d6+2' },
  'bone-storm': { name: 'Bone-Storm', mana: 16, damage: '3d6+3', hitsAll: true },
  entomb: { name: 'Entomb', mana: 15, damage: '2d10', stunChance: 50 },
  'legion-of-the-dead': { name: 'Legion of the Dead', mana: 24, damage: '5d6+5', hitsAll: true },
  'the-grey-court': { name: 'The Grey Court', mana: 32, damage: '8d8+8', stunChance: 25 },
  // paladin vows — lamp-oil and scripture
  'lamp-oath': { name: 'Lamp-Oath', mana: 4, partyDefense: 1 },
  'lay-on-hands': { name: 'Lay on Hands', mana: 6, heal: '2d8+4' },
  'bulwark-of-dawn': { name: 'Bulwark of Dawn', mana: 11, partyDefense: 3 },
  beacon: { name: 'Beacon', mana: 13, heal: '1d8+5', healAll: true },
  'last-vigil': { name: 'The Last Vigil', mana: 20, heal: '2d8+8', healAll: true, partyDefense: 2 },
  daybreak: { name: 'Daybreak', mana: 26, damage: '5d8+6', hitsAll: true },
  // late-book gap workings
  'arc-spark': { name: 'Arc-Spark', mana: 6, damage: '2d8+1' },
  'sunder-ward': { name: 'Sunder the Ward', mana: 22, damage: '5d6+6' },
  radiance: { name: 'Radiance', mana: 6, damage: '2d6+1' },
  benediction: { name: 'Benediction', mana: 18, heal: '3d8+8' },
  lullaby: { name: 'Lullaby', mana: 7, damage: '1d4', stunChance: 45 },
  'chorus-of-blades': { name: 'Chorus of Blades', mana: 20, damage: '3d6+4', hitsAll: true },
  'ember-riposte': { name: 'Ember Riposte', mana: 7, damage: '2d8+2' },
  'glyph-of-ruin': { name: 'Glyph of Ruin', mana: 22, damage: '4d8+4' },
  'creeping-doubt': { name: 'Creeping Doubt', mana: 8, damage: '1d8+1', stunChance: 30 },
  'tithe-of-flesh': { name: 'Tithe of Flesh', mana: 22, damage: '5d8+2' },
  // cultivator qi-arts — breath, meridian, and heaven's weather
  'flowing-qi': { name: 'Flowing Qi', mana: 3, heal: '1d6+2' },
  'qi-lance': { name: 'Qi Lance', mana: 5, damage: '2d6+1' },
  'meridian-drain': { name: 'Meridian Drain', mana: 8, damage: '2d8', selfHeal: '1d6' },
  'breath-of-the-valley': { name: 'Breath of the Valley', mana: 12, heal: '1d8+4', healAll: true },
  'golden-core-burst': { name: 'Golden Core Burst', mana: 15, damage: '3d6+3', hitsAll: true },
  'spirit-sever': { name: 'Spirit-Sever', mana: 18, damage: '4d8+4', stunChance: 25 },
  'tribulation-lightning': { name: 'Tribulation Lightning', mana: 38, damage: '8d8+10', stunChance: 30, selfHeal: '2d6' },
  'the-dao-of-the-empty-sky': { name: 'The Dao of the Empty Sky', mana: 56, damage: '10d10+12', hitsAll: true, selfHeal: '3d6' },
  // alchemist thrown-work — the Physic's back room
  'acid-vial': { name: 'Acid Vial', mana: 4, damage: '1d8+1' },
  'smoke-bomb': { name: 'Smoke Bomb', mana: 5, damage: '1d4', stunChance: 40 },
  'fire-flask': { name: 'Fire Flask', mana: 7, damage: '2d6+2' },
  'mutagen-draught': { name: 'Mutagen Draught', mana: 8, heal: '2d8+2' },
  'shrapnel-bomb': { name: 'Shrapnel Bomb', mana: 10, damage: '2d6', hitsAll: true },
  'frost-oil': { name: 'Frost Oil', mana: 11, damage: '2d6', stunChance: 35 },
  'plague-vial': { name: 'Plague Vial', mana: 14, damage: '4d6+2' },
  'thunderclap-bomb': { name: 'Thunderclap Bomb', mana: 16, damage: '3d6+2', hitsAll: true, stunChance: 25 },
  'elixir-of-renewal': { name: 'Elixir of Renewal', mana: 18, heal: '2d8+6', healAll: true },
  'caustic-rain': { name: 'Caustic Rain', mana: 22, damage: '4d6+4', hitsAll: true },
  'the-perfect-solvent': { name: 'The Perfect Solvent', mana: 26, damage: '8d6+6' },
  'philosophers-fire': { name: "Philosopher's Fire", mana: 34, damage: '6d8+8', hitsAll: true },
  panacea: { name: 'Panacea', mana: 40, heal: '4d8+14', healAll: true, cures: true },
  'the-great-work': { name: 'The Great Work', mana: 55, damage: '10d10+12', hitsAll: true },
  // tidecaller sea-work — Saltmere's older prayers
  'brine-lash': { name: 'Brine Lash', mana: 4, damage: '1d8+1' },
  undertow: { name: 'Undertow', mana: 6, damage: '1d6', stunChance: 40 },
  'drowning-grasp': { name: 'Drowning Grasp', mana: 8, damage: '2d6+1', selfHeal: '1d4' },
  'salt-spray': { name: 'Salt Spray', mana: 10, damage: '1d6+2', hitsAll: true },
  riptide: { name: 'Riptide', mana: 12, damage: '3d6+2' },
  'the-green-silence': { name: 'The Green Silence', mana: 15, damage: '2d6', stunChance: 50 },
  'wave-break': { name: 'Wave-Break', mana: 18, damage: '3d6+2', hitsAll: true },
  'abyssal-call': { name: 'Abyssal Call', mana: 22, damage: '5d6+5', selfHeal: '1d8' },
  'leviathan-coil': { name: 'Leviathan Coil', mana: 26, damage: '4d8+6', stunChance: 30 },
  'the-drowned-choir': { name: 'The Drowned Choir', mana: 30, damage: '5d6+5', hitsAll: true },
  'tide-of-the-old-sea': { name: 'Tide of the Old Sea', mana: 38, damage: '7d8+8', hitsAll: true },
  'the-black-fathom': { name: 'The Black Fathom', mana: 45, damage: '9d8+10', selfHeal: '2d8' },
  'the-sea-remembers': { name: 'The Sea Remembers', mana: 58, damage: '10d10+12', hitsAll: true, stunChance: 25 },
  // oneiromancer dream-work — the Night Market's quietest stall
  'waking-pinch': { name: 'Waking Pinch', mana: 3, damage: '1d6', stunChance: 30 },
  'sandman-touch': { name: "Sandman's Touch", mana: 6, damage: '1d4', stunChance: 55 },
  'nightmare-thread': { name: 'Nightmare-Thread', mana: 8, damage: '2d6+2' },
  'dream-eater': { name: 'Dream-Eater', mana: 10, damage: '2d8', selfHeal: '1d6' },
  'lull-the-room': { name: 'Lull the Room', mana: 14, damage: '1d6', hitsAll: true, stunChance: 35 },
  'terror-made-flesh': { name: 'Terror Made Flesh', mana: 16, damage: '4d6+2' },
  'the-shared-dream': { name: 'The Shared Dream', mana: 18, heal: '2d8+4', healAll: true },
  'unravel-the-real': { name: 'Unravel the Real', mana: 22, damage: '5d6+4' },
  'sleepwalkers-parade': { name: "Sleepwalkers' Parade", mana: 26, damage: '3d6+2', hitsAll: true, stunChance: 30 },
  'the-door-in-the-dream': { name: 'The Door in the Dream', mana: 30, damage: '6d6+6', selfHeal: '1d8' },
  'wake-them-never': { name: 'Wake Them Never', mana: 38, damage: '6d8+8', stunChance: 45 },
  'the-lucid-city': { name: 'The Lucid City', mana: 45, damage: '8d8+8', hitsAll: true, stunChance: 30 },
  'the-dream-the-god-dreams': { name: 'The Dream the God Dreams', mana: 60, damage: '10d10+14', hitsAll: true, stunChance: 35 },
  // past the mortal ceiling — L50/L65 workings
  'star-pull': { name: 'Star-Pull', mana: 40, damage: '8d8+10', hitsAll: true },
  'the-first-word': { name: 'The First Word', mana: 55, damage: '12d10+12' },
  intercession: { name: 'Intercession', mana: 35, heal: '4d8+12', healAll: true, partyDefense: 3 },
  'the-open-gate': { name: 'The Open Gate', mana: 50, heal: '6d8+20', healAll: true, cures: true },
  'the-uncrowned-song': { name: 'The Uncrowned Song', mana: 38, damage: '7d6+10', hitsAll: true, stunChance: 30 },
  'the-ninth-chorus': { name: 'The Ninth Chorus', mana: 52, damage: '9d8+12', hitsAll: true, stunChance: 40 },
  'the-written-blade': { name: 'The Written Blade', mana: 45, damage: '10d8+10', stunChance: 25 },
  'the-second-pact': { name: 'The Second Pact', mana: 40, damage: '9d8+8', stunChance: 30 },
  'the-doorless-dark': { name: 'The Doorless Dark', mana: 56, damage: '10d10+14', hitsAll: true },
  'the-unburnt-lamp': { name: 'The Unburnt Lamp', mana: 42, heal: '5d8+15', healAll: true, partyDefense: 4 },
  'the-pale-census': { name: 'The Pale Census', mana: 42, damage: '8d8+10', hitsAll: true, stunChance: 30 },
  'the-last-winter': { name: 'The Last Winter', mana: 58, damage: '10d10+15', hitsAll: true, stunChance: 35 },
};

function weaponOf(world: WorldState, c: Character): Item | null {
  const id = c.equipment['main-hand'];
  return id ? world.items[id] ?? null : null;
}

function findAmmo(world: WorldState, c: Character, proto: string): Item | null {
  for (const iid of [...c.inventory, ...world.partyInventory]) {
    const it = world.items[iid];
    if (it && it.proto === proto && (it.qty ?? 0) > 0) return it;
  }
  return null;
}

function charDamage(world: WorldState, c: Character, rng: Rng, bonus: number): number {
  const w = weaponOf(world, c);
  const dice = w && !w.broken && w.damage ? w.damage : '1d3';
  const statMod = w?.ranged
    ? Math.floor((c.attributes.dexterity - 10) / 2)
    : Math.floor((c.attributes.strength - 10) / 2);
  return Math.max(1, rng.roll(dice) + statMod + bonus);
}

function charDefense(world: WorldState, c: Character): number {
  let def = c.defense + c.evasion + Math.floor((c.attributes.dexterity - 10) / 2) + statusDefenseMod(c)
    + (world.needsEnabled ? needsDefenseMod(c) : 0) + injuryDefenseMod(c)
    + affixMod(world, c, 'defense') + affixMod(world, c, 'evasion');
  for (const slot of ['armor', 'off-hand'] as const) {
    const id = c.equipment[slot];
    const it = id ? world.items[id] : null;
    if (it && !it.broken && it.defense) def += it.defense;
  }
  return def;
}

export function startCombat(world: WorldState, enc: PendingEncounter): CombatState {
  const rng = new Rng(enc.seed);
  const monsters: CombatantMonster[] = [];
  const counts: Record<string, number> = {};
  for (const group of enc.monsters) {
    for (let i = 0; i < group.count; i++) {
      const t = MONSTERS[group.templateKey];
      counts[group.templateKey] = (counts[group.templateKey] ?? 0) + 1;
      monsters.push({
        id: nextId(world, 'MON'),
        templateKey: group.templateKey,
        name: `${t.name} #${counts[group.templateKey]}`,
        hp: { current: t.hp, max: t.hp },
        status: [],
        alive: true,
        fled: false,
      });
    }
  }
  const eliteMon = makeEliteCombatant(world, enc, nextId(world, 'MON'));
  if (eliteMon) monsters.push(eliteMon);
  const combat: CombatState = {
    active: true,
    round: 1,
    seed: enc.seed,
    rngState: rng.getState(),
    monsters,
    partyIds: partyMembers(world).map((c) => c.id),
    defending: [],
    stunned: [],
    log: [],
    outcome: 'ongoing',
    encounterDesc: enc.description,
    locationId: enc.locationId,
    roomId: enc.roomId,
  };
  world.combat = combat;
  world.pendingEncounter = null;
  logEvent(world, 'combat.start', { seed: enc.seed, monsters: enc.monsters, room: enc.roomId ?? null }, `Combat began: ${enc.description}. (seed ${enc.seed})`, { seed: enc.seed, location: enc.locationId, witnesses: combat.partyIds });
  return combat;
}

interface Turn {
  actorId: string;
  isMonster: boolean;
  initiative: number;
  action: PlannedAction;
}

function monsterAI(combat: CombatState, world: WorldState, m: CombatantMonster, rng: Rng): PlannedAction {
  const t = MONSTERS[m.templateKey];
  const living = combat.partyIds.map((id) => world.characters[id]).filter((c) => c.hp.current > 0);
  if (!living.length) return { actor: m.id, type: 'defend' };
  // big creatures telegraph a heavy blow: one round of warning
  if (!m.charging && t.level >= 4 && rng.chance(0.25)) {
    m.charging = true;
    return { actor: m.id, type: 'defend', skillKey: 'charge-up' };
  }
  if (t.ai === 'cowardly' && m.hp.current <= m.hp.max * 0.3 && rng.chance(0.6)) {
    return { actor: m.id, type: 'flee' };
  }
  // battle lines: melee reaches the front rank; the back rank is safe
  // until the front is down (Bard's Tale rules)
  const frontRank = living.filter((c) => (c.row ?? 'front') === 'front');
  const reachable = frontRank.length ? frontRank : living;
  // pack AI gangs up on the weakest; aggressive picks at random
  const target =
    t.ai === 'pack'
      ? reachable.reduce((a, b) => (a.hp.current <= b.hp.current ? a : b))
      : rng.pick(reachable);
  return { actor: m.id, type: 'attack', target: target.id };
}

function downCheck(world: WorldState, c: Character, record: (e: CombatLogEntry) => void, round: number) {
  if (c.hp.current === 0 && !hasStatus(c, 'unconscious')) {
    applyStatus(c, 'unconscious');
    record({ round, actor: c.id, actorName: c.name, action: 'attack', detail: 'down', result: 'death', text: `${c.name} went down, bleeding.` });
    void world;
  }
}

/** Resolve one round given the author's planned actions for the party. */
export function resolveRound(world: WorldState, planned: PlannedAction[]): CombatLogEntry[] {
  const combat = world.combat;
  if (!combat || !combat.active) return [];
  const rng = new Rng(0);
  rng.setState(combat.rngState);
  const roundEntries: CombatLogEntry[] = [];
  const record = (e: CombatLogEntry) => {
    combat.log.push(e);
    roundEntries.push(e);
  };

  // status upkeep (poison, bleeding, burning, expiring effects)
  for (const cid of combat.partyIds) {
    const c = world.characters[cid];
    if (c.hp.current <= 0) continue;
    for (const line of tickStatusesRound(c)) {
      record({ round: combat.round, actor: c.id, actorName: c.name, action: 'attack', detail: 'status', result: 'status', text: line });
    }
    downCheck(world, c, record, combat.round);
  }
  checkOutcome(world, combat, rng, record);
  if (combat.outcome !== 'ongoing') {
    combat.rngState = rng.getState();
    return roundEntries;
  }

  combat.defending = [];
  const turns: Turn[] = [];
  for (const pa of planned) {
    const c = world.characters[pa.actor];
    if (!c || c.hp.current <= 0) continue;
    turns.push({ actorId: pa.actor, isMonster: false, initiative: c.initiative + affixMod(world, c, 'initiative') + Math.floor(c.attributes.dexterity / 4) + rng.die(6), action: pa });
  }
  for (const m of combat.monsters) {
    if (!m.alive || m.fled) continue;
    const t = MONSTERS[m.templateKey];
    turns.push({ actorId: m.id, isMonster: true, initiative: t.initiative + rng.die(6), action: monsterAI(combat, world, m, rng) });
  }
  turns.sort((a, b) => b.initiative - a.initiative);

  for (const turn of turns) {
    if (combat.outcome !== 'ongoing') break;
    if (turn.isMonster) {
      const m = combat.monsters.find((x) => x.id === turn.actorId)!;
      if (!m.alive || m.fled) continue;
      if (m.status.includes('stunned')) {
        m.status = m.status.filter((s) => s !== 'stunned');
        record({ round: combat.round, actor: m.id, actorName: m.name, action: 'defend', detail: 'stunned', result: 'status', text: `${m.name} was stunned and lost its turn.` });
        continue;
      }
      resolveMonsterAction(world, combat, m, turn.action, rng, record);
    } else {
      const c = world.characters[turn.actorId];
      if (!c || c.hp.current <= 0) continue;
      const skip = (['stunned', 'paralyzed'] as const).find((k) => hasStatus(c, k));
      if (skip) {
        cureStatus(c, 'stunned');
        record({ round: combat.round, actor: c.id, actorName: c.name, action: 'defend', detail: skip, result: 'status', text: `${c.name} was ${skip} and lost the round.` });
        continue;
      }
      resolveCharacterAction(world, combat, c, turn.action, rng, record);
    }
    checkOutcome(world, combat, rng, record);
  }

  if (combat.outcome === 'ongoing') combat.round += 1;
  combat.rngState = rng.getState();
  addMinutes(world, 1);
  return roundEntries;
}

function resolveCharacterAction(
  world: WorldState,
  combat: CombatState,
  c: Character,
  action: PlannedAction,
  rng: Rng,
  record: (e: CombatLogEntry) => void,
) {
  const round = combat.round;
  switch (action.type) {
    case 'defend': {
      combat.defending.push(c.id);
      record({ round, actor: c.id, actorName: c.name, action: 'defend', detail: 'defend', result: 'defend', text: `${c.name} took a defensive stance.` });
      return;
    }
    case 'flee': {
      const roll = rng.die(20) + Math.floor(c.attributes.dexterity / 3);
      if (roll >= 12) {
        combat.outcome = 'fled';
        combat.active = false;
        record({ round, actor: c.id, actorName: c.name, action: 'flee', detail: 'flee', roll, result: 'flee-success', text: `${c.name} led the party in a retreat. They escaped. (roll ${roll})` });
        finishCombat(world, combat);
      } else {
        record({ round, actor: c.id, actorName: c.name, action: 'flee', detail: 'flee', roll, result: 'flee-fail', text: `${c.name} tried to break away but the enemy cut off the retreat. (roll ${roll})` });
      }
      return;
    }
    case 'item': {
      const item = action.itemId ? world.items[action.itemId] : null;
      if (item && item.kind === 'potion') {
        const targetChar = action.target ? world.characters[action.target] ?? c : c;
        const remainingBefore = item.qty ?? 1;
        const res = consumeItem(world, item, targetChar, rng);
        const remaining = item.owner ? item.qty ?? 0 : remainingBefore - 1;
        record({ round, actor: c.id, actorName: c.name, action: 'item', targetName: targetChar.name, detail: item.name, result: 'heal', text: `${res.lines.join(' ')} (${item.name} ×${Math.max(0, remaining)} left)` });
      } else {
        record({ round, actor: c.id, actorName: c.name, action: 'item', detail: 'nothing usable', result: 'info', text: `${c.name} fumbled for an item and found nothing useful.` });
      }
      return;
    }
    case 'spell': {
      const spell = action.spellKey ? SPELLS[action.spellKey] : null;
      if (!spell || c.mana.current < spell.mana) {
        record({ round, actor: c.id, actorName: c.name, action: 'spell', detail: spell?.name ?? 'unknown spell', result: 'info', text: `${c.name} tried to cast but lacked the mana.` });
        return;
      }
      if (hasStatus(c, 'silenced')) {
        record({ round, actor: c.id, actorName: c.name, action: 'spell', detail: spell.name, result: 'info', text: `${c.name} mouthed the words of ${spell.name}, but no sound came.` });
        return;
      }
      c.mana.current -= spell.mana;
      trainSkill(world, c, spell.heal || spell.cures ? 'healing' : 'magic');
      if (spell.heal && spell.healAll) {
        const healedNames: string[] = [];
        for (const pid of combat.partyIds) {
          const ally = world.characters[pid];
          if (!ally.alive) continue;
          const healed = rng.roll(spell.heal) + Math.floor(c.skills.magic / 2);
          ally.hp.current = Math.min(ally.hp.max, ally.hp.current + healed);
          if (ally.hp.current > 0) cureStatus(ally, 'unconscious');
          healedNames.push(`${ally.name} +${healed}`);
        }
        record({ round, actor: c.id, actorName: c.name, action: 'spell', detail: spell.name, result: 'heal', text: `${c.name} cast ${spell.name} over the whole party: ${healedNames.join(', ')}.` });
      } else if (spell.heal) {
        const targetChar = action.target ? world.characters[action.target] ?? c : c;
        const healed = rng.roll(spell.heal) + Math.floor(c.skills.magic / 2);
        targetChar.hp.current = Math.min(targetChar.hp.max, targetChar.hp.current + healed);
        if (targetChar.hp.current > 0) cureStatus(targetChar, 'unconscious');
        record({ round, actor: c.id, actorName: c.name, action: 'spell', targetName: targetChar.name, detail: spell.name, result: 'heal', damage: healed, text: `${c.name} cast ${spell.name} on ${targetChar.name}, restoring ${healed} HP.` });
      } else if (spell.cures) {
        const targetChar = action.target ? world.characters[action.target] ?? c : c;
        const cured = ['poisoned', 'diseased', 'bleeding'].filter((k) => cureStatus(targetChar, k as never));
        record({ round, actor: c.id, actorName: c.name, action: 'spell', targetName: targetChar.name, detail: spell.name, result: 'heal', text: cured.length ? `${c.name} cast ${spell.name}: ${targetChar.name} was cleansed of ${cured.join(', ')}.` : `${c.name} cast ${spell.name}, but ${targetChar.name} carried no taint.` });
      } else if (spell.partyDefense) {
        for (const pid of combat.partyIds) {
          const ally = world.characters[pid];
          if (ally.hp.current > 0) ally.tempBonuses.push({ stat: 'defense', amount: spell.partyDefense, roundsLeft: 5, source: spell.name });
        }
        record({ round, actor: c.id, actorName: c.name, action: 'spell', detail: spell.name, result: 'defend', text: `${c.name} cast ${spell.name}: the party is warded (+${spell.partyDefense} defense, 5 rounds).` });
      } else if (spell.damage) {
        const targets = spell.hitsAll
          ? combat.monsters.filter((x) => x.alive && !x.fled)
          : combat.monsters.filter((x) => x.id === action.target && x.alive && !x.fled);
        if (!targets.length) {
          record({ round, actor: c.id, actorName: c.name, action: 'spell', detail: spell.name, result: 'info', text: `${c.name}'s ${spell.name} found no target.` });
          return;
        }
        for (const m of targets) {
          const dmg = rng.roll(spell.damage) + Math.floor(c.skills.magic / 2);
          applyDamageToMonster(world, combat, c, m, dmg, spell.name, 'hit', rng, record, undefined, spell.stunChance !== undefined && rng.chance(spell.stunChance));
          if (spell.selfHeal && c.hp.current > 0 && c.hp.current < c.hp.max) {
            const drank = Math.min(rng.roll(spell.selfHeal), c.hp.max - c.hp.current);
            if (drank > 0) {
              c.hp.current += drank;
              record({ round, actor: c.id, actorName: c.name, action: 'spell', detail: spell.name, result: 'heal', damage: drank, text: `${c.name} drank back ${drank} through ${spell.name} — what it takes, it gives.` });
            }
          }
          if (combat.outcome !== 'ongoing') break;
        }
      }
      return;
    }
    case 'skill':
    case 'attack': {
      const skill = action.type === 'skill' && action.skillKey ? SKILLS[action.skillKey] : null;
      if (skill) {
        if (action.skillKey && !c.abilities.includes(action.skillKey)) {
          record({ round, actor: c.id, actorName: c.name, action: 'skill', detail: skill.name, result: 'info', text: `${c.name} hasn't trained ${skill.name}.` });
          return;
        }
        if (c.stamina.current < skill.stamina) {
          record({ round, actor: c.id, actorName: c.name, action: 'skill', detail: skill.name, result: 'info', text: `${c.name} was too winded to use ${skill.name}.` });
          return;
        }
        c.stamina.current -= skill.stamina;
      }
      const primary = combat.monsters.find((x) => x.id === action.target && x.alive && !x.fled)
        ?? combat.monsters.find((x) => x.alive && !x.fled);
      if (!primary) return;
      const swings = skill?.doubleHit ? 2 : 1;
      for (let s = 0; s < swings; s++) {
        if (!primary.alive) break;
        swingAt(world, combat, c, primary, skill, rng, record);
      }
      if (skill?.extraTargets) {
        const others = combat.monsters.filter((x) => x.alive && !x.fled && x.id !== primary.id).slice(0, skill.extraTargets);
        for (const m of others) swingAt(world, combat, c, m, skill, rng, record);
      }
      return;
    }
  }
}

function swingAt(
  world: WorldState,
  combat: CombatState,
  c: Character,
  m: CombatantMonster,
  skill: SkillDef | null,
  rng: Rng,
  record: (e: CombatLogEntry) => void,
) {
  const t = MONSTERS[m.templateKey];
  // ranged weapons need ammunition; loose an arrow per swing
  const w0 = weaponOf(world, c);
  if (w0?.ranged && w0.ammoProto) {
    const ammo = findAmmo(world, c, w0.ammoProto);
    if (!ammo) {
      record({ round: combat.round, actor: c.id, actorName: c.name, action: 'attack', detail: w0.name, result: 'info', text: `${c.name} reached for an arrow and found the quiver empty.` });
      return;
    }
    removeUnits(world, ammo, 1);
  }
  trainSkill(world, c, w0?.ranged ? 'archery' : 'swordsmanship');
  const weaponSkill = w0?.ranged ? Math.floor(c.skills.archery / 2) : Math.floor(c.skills.swordsmanship / 2);
  // swinging steel from the back rank is a long reach; bows don't care
  const backRankMod = (c.row ?? 'front') === 'back' && !w0?.ranged ? -4 : 0;
  const roll = rng.die(20);
  const toHit = roll + c.attack + c.accuracy + weaponSkill + (skill?.toHitMod ?? 0) + statusAttackMod(c)
    + (world.needsEnabled ? needsAttackMod(c) : 0) + injuryAttackMod(c) + affixMod(world, c, 'attack') + backRankMod;
  const detail = skill ? skill.name : w0?.name ?? 'bare hands';
  const targetDefense = t.defense + (m.elite?.defenseBonus ?? 0);
  const backNote = backRankMod ? ' (a long swing from the back rank)' : '';
  void backNote;
  if (roll !== 20 && (roll === 1 || toHit < targetDefense)) {
    record({ round: combat.round, actor: c.id, actorName: c.name, action: skill ? 'skill' : 'attack', targetName: m.name, detail, roll, result: 'miss', text: `${c.name} ${skill ? `used ${skill.name} against` : 'attacked'} ${m.name} and missed. (roll ${roll})` });
    return;
  }
  const opening = m.status.includes('stunned');
  const isCrit = roll === 20 || rng.chance((c.critChance + (skill?.critBonus ?? 0) + affixMod(world, c, 'critChance') + (opening ? 20 : 0)) / 100);
  let dmg = charDamage(world, c, rng, (skill?.dmgBonus ?? 0) + (opening ? 2 : 0));
  if (isCrit) dmg *= 2;
  // weapon wear
  const w = weaponOf(world, c);
  if (w && w.durability && !w.broken && rng.chance(0.08)) {
    w.durability.current = Math.max(0, w.durability.current - rng.int(1, 3));
    if (w.durability.current === 0) {
      w.broken = true;
      w.history.push(`Broke in combat on Day ${world.time.day}`);
      record({ round: combat.round, actor: c.id, actorName: c.name, action: 'attack', detail: w.name, result: 'info', text: `${c.name}'s ${w.name} broke!` });
    }
  }
  applyDamageToMonster(world, combat, c, m, dmg, detail, isCrit ? 'crit' : 'hit', rng, record, roll, !!skill?.stuns && rng.chance(0.6));
  if (skill?.blinds && m.alive && rng.chance(0.5)) {
    m.status.push('stunned'); // monsters model blind as a lost turn
    record({ round: combat.round, actor: c.id, actorName: c.name, action: 'skill', targetName: m.name, detail: skill.name, result: 'status', statusApplied: 'blinded', text: `${c.name} raked filth across ${m.name}'s eyes — it staggers, blinded.` });
  }
}

function applyDamageToMonster(
  world: WorldState,
  combat: CombatState,
  c: Character,
  m: CombatantMonster,
  dmg: number,
  detail: string,
  result: 'hit' | 'crit',
  rng: Rng,
  record: (e: CombatLogEntry) => void,
  roll?: number,
  stuns?: boolean,
) {
  m.hp.current = Math.max(0, m.hp.current - dmg);
  let statusApplied: string | undefined;
  if (stuns && m.hp.current > 0) {
    statusApplied = 'stunned';
    m.status.push('stunned');
    if (m.charging) {
      m.charging = false;
      record({ round: combat.round, actor: c.id, actorName: c.name, action: 'skill', targetName: m.name, detail: 'interrupt', result: 'status', text: `${c.name}'s blow INTERRUPTED ${m.name}'s wind-up — the massive strike dies unthrown.` });
    }
  }
  const critTxt = result === 'crit' ? 'CRITICAL HIT — ' : '';
  record({
    round: combat.round,
    actor: c.id,
    actorName: c.name,
    action: 'attack',
    targetName: m.name,
    detail,
    roll,
    result,
    damage: dmg,
    statusApplied,
    text: `${c.name} struck ${m.name} with ${detail}: ${critTxt}${dmg} damage.${statusApplied ? ` ${m.name} is stunned.` : ''}`,
  });
  if (m.hp.current === 0) {
    m.alive = false;
    world.killCounts[m.templateKey] = (world.killCounts[m.templateKey] ?? 0) + 1;
    record({ round: combat.round, actor: m.id, actorName: m.name, action: 'attack', detail: 'death', result: 'death', text: `${m.name} died.` });
    // Companions react to the kill through their own values
    for (const cid of combat.partyIds) {
      if (cid !== c.id) reactToAct(world, cid, c.id, { tags: ['courage', 'strength'], magnitude: 1, description: `${c.name} killed ${m.name}` });
    }
  }
  void rng;
}

function resolveMonsterAction(
  world: WorldState,
  combat: CombatState,
  m: CombatantMonster,
  action: PlannedAction,
  rng: Rng,
  record: (e: CombatLogEntry) => void,
) {
  const t = MONSTERS[m.templateKey];
  if (action.skillKey === 'charge-up') {
    record({ round: combat.round, actor: m.id, actorName: m.name, action: 'defend', detail: 'telegraph', result: 'status', text: `${m.name} draws back, gathering itself for a massive blow — STUN IT OR BRACE.` });
    return;
  }
  if (action.type === 'flee') {
    const roll = rng.die(20);
    if (roll >= 10) {
      m.fled = true;
      record({ round: combat.round, actor: m.id, actorName: m.name, action: 'flee', detail: 'flee', roll, result: 'flee-success', text: `${m.name} broke and fled into the dark. (roll ${roll})` });
    } else {
      record({ round: combat.round, actor: m.id, actorName: m.name, action: 'flee', detail: 'flee', roll, result: 'flee-fail', text: `${m.name} tried to flee but was cornered. (roll ${roll})` });
    }
    return;
  }
  const target = action.target ? world.characters[action.target] : null;
  if (!target || target.hp.current <= 0) return;
  const roll = rng.die(20);
  const defBonus = combat.defending.includes(target.id) ? 4 : 0;
  const toHit = roll + t.attack + (m.elite?.attackBonus ?? 0);
  if (roll !== 20 && (roll === 1 || toHit < charDefense(world, target) + defBonus)) {
    record({ round: combat.round, actor: m.id, actorName: m.name, action: 'attack', targetName: target.name, detail: 'attack', roll, result: 'miss', text: `${m.name} attacked ${target.name} and missed. (roll ${roll})` });
    return;
  }
  let dmg = Math.max(1, rng.roll(t.damage) + Math.floor((m.elite?.attackBonus ?? 0) / 2) - target.armor);
  let heavyNote = '';
  if (m.charging) {
    m.charging = false;
    if (combat.defending.includes(target.id)) {
      heavyNote = ` ${target.name} braced — the massive blow broke on their guard (halved).`;
      dmg = Math.max(1, Math.floor(dmg / 2));
    } else {
      dmg *= 2;
      heavyNote = ' — a MASSIVE blow!';
    }
  }
  target.hp.current = Math.max(0, target.hp.current - dmg);
  let inflictNote = '';
  const inflicts = m.elite?.inflicts ?? t.inflicts;
  if (inflicts && target.hp.current > 0 && rng.chance(inflicts.chance) && !hasStatus(target, inflicts.status)) {
    applyStatus(target, inflicts.status, undefined, m.name);
    if (hasStatus(target, inflicts.status)) inflictNote = ` ${target.name} is ${inflicts.status}!`;
  }
  record({ round: combat.round, actor: m.id, actorName: m.name, action: 'attack', targetName: target.name, detail: 'attack', roll, result: 'hit', damage: dmg, statusApplied: inflictNote ? inflicts!.status : undefined, text: `${m.name} hit ${target.name} for ${dmg} damage.${heavyNote}${inflictNote}` });
  downCheck(world, target, record, combat.round);
}

function checkOutcome(world: WorldState, combat: CombatState, rng: Rng, record: (e: CombatLogEntry) => void) {
  if (combat.outcome !== 'ongoing') return;
  const enemiesLeft = combat.monsters.some((m) => m.alive && !m.fled);
  const partyUp = combat.partyIds.some((id) => world.characters[id].hp.current > 0);
  if (!enemiesLeft) {
    combat.outcome = 'victory';
    combat.active = false;
    const killed = combat.monsters.filter((m) => !m.alive);
    const xp = killed.reduce((s, m) => s + MONSTERS[m.templateKey].xp * (m.elite ? 2 : 1), 0);
    combat.pendingLoot = generateLoot(world, killed.map((m) => m.templateKey), rng.fork(), xp);
    record({ round: combat.round, actor: 'SYSTEM', actorName: 'System', action: 'attack', detail: 'victory', result: 'info', text: `Victory. ${killed.length} enemies slain, ${combat.monsters.filter((m) => m.fled).length} fled. XP earned: ${xp} (full award to each participant).` });
    finishCombat(world, combat);
  } else if (!partyUp) {
    combat.outcome = 'defeat';
    combat.active = false;
    record({ round: combat.round, actor: 'SYSTEM', actorName: 'System', action: 'attack', detail: 'defeat', result: 'info', text: 'The whole party was beaten down. Everything went dark.' });
    finishCombat(world, combat);
  }
}

/** COMBAT ENDS → survivors → temp effects off → XP → level check → loot generated → (UI reward screen) */
function finishCombat(world: WorldState, combat: CombatState) {
  addMinutes(world, 5);
  // remove temporary combat effects from everyone
  for (const id of combat.partyIds) {
    const c = world.characters[id];
    c.tempBonuses = [];
    c.statuses = c.statuses.filter((s) => s.roundsLeft === undefined && s.key !== 'stunned' && s.key !== 'paralyzed');
  }
  if (combat.outcome === 'victory' && combat.pendingLoot) {
    const survivors = combat.partyIds.map((id) => world.characters[id]).filter((c) => c.alive);
    const injuryRng = new Rng((combat.seed ^ 0x9e3779b9) >>> 0);
    for (const c of survivors) {
      if (c.hp.current === 0) {
        c.hp.current = 1; // downed allies stabilize after victory
        cureStatus(c, 'unconscious');
        // going down can leave a mark that outlasts the fight
        const injury = rollInjury(c, injuryRng);
        if (injury) {
          c.injuries[c.injuries.length - 1].day = world.time.day;
          logEvent(world, 'injury', { character: c.id, injury }, `${c.name} took ${injury} — it will need proper treatment (temple or time won't fix it alone).`);
        }
      }
      // full XP to each participant (rules-engine policy)
      grantXp(world, c, combat.pendingLoot.xp);
    }
    // room state persists
    if (combat.roomId && world.currentDungeon) {
      const room = world.dungeons[world.currentDungeon].rooms[combat.roomId];
      room.enemies = 'dead';
      room.clearedDay = world.time.day;
      if (room.isBossRoom && !world.dungeons[world.currentDungeon].bossDefeated) {
        const conqueredDungeon = world.dungeons[world.currentDungeon];
        conqueredDungeon.bossDefeated = true;
        logEvent(world, 'dungeon.conquered', { dungeon: world.currentDungeon }, `${conqueredDungeon.name} is CONQUERED — its warden is dead and its deepest door stands open.`, { witnesses: partyMembers(world).map((c) => c.id) });
        // the proof comes home: a trophy for the wall above the hearth
        const bossName = MONSTERS[conqueredDungeon.bossKey]?.name ?? 'the warden';
        const trophy = makeItem(world, 'boss-trophy', 1);
        trophy.name = `Trophy: ${bossName}`;
        trophy.lore = `Taken from ${conqueredDungeon.name} the day its warden fell. A house that holds this holds the story.`;
        trophy.history.push(`Claimed in ${conqueredDungeon.name} on Day ${world.time.day}`);
        addToContainer(world, trophy, 'party');
        logEvent(world, 'trophy', { dungeon: conqueredDungeon.id, item: trophy.id }, `The party took a trophy of ${bossName} — something for the wall at home, when there is a wall, so the house can keep the score.`, { witnesses: partyMembers(world).map((c) => c.id) });
      }
    }
  } else if (combat.outcome === 'defeat') {
    // consequences depend on the death rule
    for (const id of combat.partyIds) {
      const c = world.characters[id];
      if (world.deathRule === 'story') {
        c.hp.current = 1;
        cureStatus(c, 'unconscious');
      } else {
        c.alive = false;
        c.diedOnDay = world.time.day;
        c.wasParty = true;
        c.statuses = [];
        logEvent(world, 'character.death', { character: c.id, rule: world.deathRule }, `${c.name} died. (${world.deathRule === 'classic' ? 'The body can be carried to a temple for resurrection.' : 'Permadeath: no resurrection.'})`);
        world.mourning = [...(world.mourning ?? []), { charId: c.id, day: world.time.day }];
        for (const other of combat.partyIds.map((pid) => world.characters[pid])) {
          if (!other || !other.alive || other.id === c.id) continue;
          other.memories.push({ subject: c.id, event: `I watched ${c.name} die and could not stop it.`, importance: 10, emotionalValue: -8, day: world.time.day });
        }
      }
    }
    if (world.deathRule === 'story') {
      logEvent(world, 'party.defeated', {}, 'STORY MODE: the party was left for dead but survived — beaten, robbed of nothing but pride.');
    }
  }
  // political weight: killing a faction's people is noticed
  const MONSTER_FACTION: Record<string, string> = { 'red-knife-cutter': 'FAC_REDKNIVES', 'city-watchman': 'FAC_WATCH' };
  const facKills: Record<string, number> = {};
  for (const m of combat.monsters) {
    if (!m.alive && MONSTER_FACTION[m.templateKey]) {
      facKills[MONSTER_FACTION[m.templateKey]] = (facKills[MONSTER_FACTION[m.templateKey]] ?? 0) + 1;
    }
  }
  for (const [fac, n] of Object.entries(facKills)) {
    for (const id of combat.partyIds) {
      const c = world.characters[id];
      c.factionReputation[fac] = Math.max(-10, (c.factionReputation[fac] ?? 0) - n);
    }
    logEvent(world, 'faction.rep', { faction: fac, delta: -n, why: 'blood spilled' }, `${world.factions[fac]?.name ?? fac} will hear about their dead (reputation -${n}).`);
  }
  settleElites(world, combat.monsters, combat.outcome, new Rng((combat.seed ^ 0x51ed) >>> 0));
  if (combat.outcome === 'victory') driftCompanionBonds(world, combat.partyIds, new Rng((combat.seed ^ 0xb0bd) >>> 0));
  settleTournament(world, combat.outcome);
  checkQuests(world);
  resolveWorldEventVictory(world, combat.outcome);
  logEvent(
    world,
    'combat.end',
    { outcome: combat.outcome, seed: combat.seed, rounds: combat.round, log: combat.log },
    `Combat ended in ${combat.outcome} after ${combat.round} round${combat.round > 1 ? 's' : ''} (${combat.encounterDesc}).`,
    { seed: combat.seed, location: combat.locationId, witnesses: combat.partyIds },
  );
}

/** Sensible auto-play for one party member's round. */
function autoAction(world: WorldState, combat: CombatState, c: Character): PlannedAction {
  const living = combat.monsters.filter((m) => m.alive && !m.fled);
  const target = living.find((m) => m.status.includes('stunned')) ?? living.reduce((a, b) => (a && a.hp.current <= b.hp.current ? a : b), living[0]);
  // heal the hurt first
  const hurt = combat.partyIds.map((id) => world.characters[id]).filter((a) => a.alive && a.hp.current > 0 && a.hp.current < a.hp.max * 0.4);
  const healSpell = c.abilities.find((k) => SPELLS[k]?.heal);
  if (hurt.length && healSpell && c.mana.current >= SPELLS[healSpell].mana) {
    return { actor: c.id, type: 'spell', spellKey: healSpell, target: hurt[0].id };
  }
  if (c.hp.current < c.hp.max * 0.3) {
    const potion = [...c.inventory, ...world.partyInventory].find((i) => world.items[i]?.kind === 'potion' && world.items[i]?.healing);
    if (potion) return { actor: c.id, type: 'item', itemId: potion, target: c.id };
  }
  // brace against a telegraphed blow if fragile
  if (living.some((m) => m.charging) && c.hp.current < c.hp.max * 0.5) return { actor: c.id, type: 'defend' };
  // interrupt a charger with a stun skill
  const stunSkill = c.abilities.find((k) => SKILLS[k]?.stuns);
  if (living.some((m) => m.charging) && stunSkill && c.stamina.current >= SKILLS[stunSkill].stamina) {
    return { actor: c.id, type: 'skill', skillKey: stunSkill, target: living.find((m) => m.charging)!.id };
  }
  // spend big abilities when rich
  const dmgSpell = c.abilities.filter((k) => SPELLS[k]?.damage).sort((a, b) => SPELLS[b].mana - SPELLS[a].mana)[0];
  if (dmgSpell && c.mana.current >= SPELLS[dmgSpell].mana * 1.5 && target) {
    return { actor: c.id, type: 'spell', spellKey: dmgSpell, target: target.id };
  }
  const skill = c.abilities.filter((k) => SKILLS[k]).sort((a, b) => SKILLS[b].stamina - SKILLS[a].stamina)[0];
  if (skill && c.stamina.current >= SKILLS[skill].stamina * 2 && target) {
    return { actor: c.id, type: 'skill', skillKey: skill, target: target.id };
  }
  return { actor: c.id, type: 'attack', target: target?.id };
}

/** Run one round on autopilot. */
export function autoRound(world: WorldState): void {
  const combat = world.combat;
  if (!combat || !combat.active) return;
  const planned = combat.partyIds
    .map((id) => world.characters[id])
    .filter((c) => c && c.hp.current > 0)
    .map((c) => autoAction(world, combat, c));
  resolveRound(world, planned);
}

/** Let them fight: auto-rounds until the fight ends (bounded). */
export function autoResolve(world: WorldState): void {
  let guard = 0;
  while (world.combat?.active && guard++ < 60) autoRound(world);
}

/** After the loot screen: apply the taken items to inventories. */
export function takeLoot(world: WorldState, itemIndexes: number[] | 'all' | 'none') {
  const combat = world.combat;
  if (!combat?.pendingLoot || combat.pendingLoot.taken) return;
  const loot = combat.pendingLoot;
  const mc = world.characters[world.mcId];
  const takenNames: string[] = [];
  if (itemIndexes !== 'none') {
    mc.money += loot.money;
    loot.items.forEach((item, i) => {
      if (itemIndexes === 'all' || itemIndexes.includes(i)) {
        world.items[item.id] = item;
        item.history.push(`Looted by ${mc.name} on Day ${world.time.day}`);
        // stack-aware pickup via the rules engine
        addToContainer(world, item, mc);
        takenNames.push(item.name);
      } else if (combat.roomId && world.currentDungeon) {
        // left behind: persists in the room
        world.items[item.id] = item;
        item.owner = world.dungeons[world.currentDungeon].entranceLocation;
        world.dungeons[world.currentDungeon].rooms[combat.roomId].itemsRemaining.push(item.id);
      }
    });
  }
  loot.taken = true;
  logEvent(
    world,
    'loot.taken',
    { money: itemIndexes === 'none' ? 0 : loot.money, items: takenNames, seed: loot.seed },
    itemIndexes === 'none'
      ? 'The party left the spoils where they lay.'
      : `The party looted ${loot.money} copper${takenNames.length ? ` and: ${takenNames.join(', ')}` : ''}.`,
    { seed: loot.seed, witnesses: combat.partyIds },
  );
}

export function closeCombat(world: WorldState) {
  world.combat = null;
}
