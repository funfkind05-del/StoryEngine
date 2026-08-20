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

## LLM features (optional)

Point the app at any OpenAI-compatible server — LM Studio on `localhost:1234`
works with zero setup (a dev proxy handles CORS); Ollama, vLLM, LiteLLM, or
api.openai.com/v1 with an API key all work via the ⚙ LLM settings in any
conversation window.

- **Talk to NPCs**: every persistent NPC at your location has a 🗨 Talk
  button. The model is primed with *only what that NPC knows* — their
  memories, knowledge facts, personality, values, and feelings toward you
  (knowledge separation; press "Show NPC briefing" to see the exact prompt).
  Nothing becomes canon unless you keep it: "End & remember" logs the event
  and writes the NPC a memory; "Copy to scene" drops the transcript into the
  manuscript as editable notes.
- **⇄ Sync → sim**: the model reads what you've written since the last sync
  and proposes structured simulation actions (travel, money spent, wounds,
  new characters, relationship shifts). You approve each one; only approved
  actions execute, each logged as an authored event. Prose never silently
  changes the simulation.
- **✨ Polish**: line-edit suggestions for your selection or the newest
  paragraph, on demand or on a timer (off / 1 / 5 / 10 min). Always shown
  side-by-side as a suggestion — accept or dismiss; tokens and facts are
  preserved.

## Minimap

Bottom of the sidebar: above ground, the city as a street graph (click a
linked location to travel); underground it becomes a classic automap that
draws only explored rooms, with `?` stubs marking passages into darkness.

## Burn testing

`npm run burn` plays the game headlessly — 5 seeds × 20,000 random author
actions (travel, dungeon crawls, combat, shopping, temple rites, training,
inventory shuffling, household management) — asserting engine invariants
after every step: no negative HP/coin, item↔owner consistency, equipment
integrity, a monotonic clock, shop stock sanity, serializability, no NaN.
The quick version runs as part of `npm test`.

## How story time advances

Every sim action costs time automatically — the clock forces the story
forward without the author reaching for "advance time":

| Action | Time |
|---|---|
| Travel within a district | 10 min |
| Travel between districts | 30 min |
| Dungeon room move | 5 min |
| Search a room / disarm a trap | 10 / 5 min |
| Combat | 1 min per round + 5 min aftermath |
| Buy or sell at a shop | 5 min |
| Hot meal | 30 min |
| Temple rite | 30 min |
| Guild training | 4 hours |
| NPC conversation | ~5 min per exchange (when kept) |
| Sleep (inn, home, or rough) | until 7:00 next morning |

Manual controls (+10m, +1h, until morning) remain for pacing scenes. While
time passes, scheduled NPCs move, shops restock, background events fire, and
needs climb.

## Survival needs

Hunger (~3/hour) and fatigue (~5/hour awake) are tracked per character
against story time (toggle in Saves → World rules). Past 60 they bite —
fatigue costs attack/defense, hunger stops stamina recovery; past 85 the
penalties steepen, starvation halts healing and slowly grinds HP down
(never below 1 — hunger creates story pressure, not deaths). Eat at any
location serving food (🍲 party meal), carry bread/rations, and sleep to
clear fatigue. The prep screen warns before you take a hungry, exhausted
party underground.

## Determinism

Every encounter, combat, and loot roll stores its seed. Replay an exact
combat, or resimulate with a fresh seed; the prose *Reword draft* button
re-words a scene without being able to change a single fact.
