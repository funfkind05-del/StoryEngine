# Blackwall — a persistent fantasy writing & simulation engine

A novel-authoring environment structured like an old-school party-based RPG
(*The Bard's Tale* lineage). A persistent simulated city, dungeon crawling,
turn-based combat, loot, XP, statuses, shops, temples, and a household — all
in service of a manuscript. The simulation creates continuity, uncertainty,
and consequences; **the author keeps complete control of the final prose.**

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npx vitest run     # engine test suite
node e2e.smoke.mjs # browser E2E (needs the dev server up + system Chrome)
```

The project lives in your browser's localStorage and can be exported/imported
as a single JSON file (Saves panel).

## The five systems

```
WORLD STATE → SIMULATION EVENT → EVENT LOG → NARRATIVE BRIDGE → PROSE DRAFT → AUTHOR EDITS
```

| System | Where | What it owns |
|---|---|---|
| World Simulation | `src/engine/world.ts`, `npc.ts`, `encounter.ts` | Clock, travel, NPC schedules, background events, knowledge separation |
| RPG Rules Engine | `src/engine/rules.ts` | XP/levels/classes/training, item catalog, stacking & encumbrance, consumables, status effects, temple prices, currency |
| Adventure Engine | `src/engine/dungeon.ts`, `combat.ts`, `loot.ts` | Persistent seeded dungeon maps, round-based combat, reward sequence |
| Writing Studio | `src/components/WritingStudio.tsx` | Scenes with sim headers, `@[Name](ID)` entity tokens, Insert Location/Character/Item |
| Narrative Bridge | `src/engine/bridge.ts` | Combat log → prose drafts that **never invent a result the sim didn't produce** |

Prose editing never mutates simulation state. Author overrides are explicit
and logged as events.

## Core loops

- **Write**: scenes carry an invisible header (POV, day, time, location,
  participants). *Check Scene* / the Continuity panel flags dead characters
  speaking, items their owners don't have, characters the sim places
  elsewhere, and chronology slips — warnings only, never rewrites.
- **Adventure**: travel the city (encounter frequency: low/normal/high/chaotic),
  prep screen before a dungeon, explore persistent rooms (chests stay opened,
  corpses stay dead), fight round by round, take or leave loot.
- **Advance**: XP is awarded in full to every participant, but leveling
  requires a class trainer in the city — Fighters Guild, the Counting House
  (rogues), Arcane College, Hunter's Lodge, or the Temple (priests) — and coin.
- **Live**: shops with finite stock that restocks over days, inn rooms, temple
  healing/cures/resurrection priced by reputation, a home that grows from a
  rented room to an estate with storage and a treasury, party supplies pooled
  separately from personal packs.

## Rules settings (Saves panel)

- **Death**: Story Mode (companions survive defeat) / Classic (dead until a
  temple resurrection) / Permadeath.
- **Encumbrance**: Off / Light (slot-based) / Full.

## Determinism

Every encounter, combat, and loot roll stores its seed. Replay an exact
combat, or resimulate with a fresh seed; the prose *Reword draft* button
re-words a scene without being able to change a single fact.
