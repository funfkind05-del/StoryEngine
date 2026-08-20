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

## Getting the novel out — and keeping it safe

**📖 Compile manuscript** (sidebar) stitches scenes into chapters and exports
Markdown or printable HTML (browser print → PDF). Entity tokens render as
plain names; sim scaffolding blocks strip out; LitRPG stat windows stay in by
default. **Disk backup** (Saves panel, Chromium browsers) links a .json file
on disk that the app rewrites automatically while you work — localStorage can
be evicted by the browser; your novel shouldn't live there alone.

## The campaign spine — What Lies Beneath Blackwall

An eight-stage main questline threads the eight dungeons in level order:
Sister Sella's crypt job is stage one of a saga about what the city was
built to seal. Each stage is offered by a citizen with their own reasons
(Sella, Dorn, Varga, Mara, Harrow), each boss guards a piece of the truth,
and each turn-in pays a **revelation** — an accurate world-truth knowledge
entry the whole party learns, verbatim, so knowledge separation does the
mystery work. The spine can't be declined away; the Quests panel tracks
the stage and the latest revelation; the Muse surfaces both the current
stage and any revelation the manuscript hasn't reckoned with yet. Old
saves adopt the campaign automatically.

## Quests & jobs

Patrons and notice boards offer work — hand-authored hooks from Day 1 (Sister
Sella wants the crypts cleansed; Tobbe's cellar is scratching) plus
procedural jobs that drift onto the boards as days pass. Objectives (kills
counted from acceptance, deliveries, boss-clears) track against real sim
state; turn in at the giver for coin, items, XP, and faction reputation —
late past the deadline pays half. The Quests panel shows offers where you
stand and progress on everything active.

## Factions have memory

Killing a gang's people costs standing with them; quest work shifts it both
ways. Standing changes the world: friendly shops discount, hostile ones
gouge or refuse outright, the temple already prices by reputation — and on
Red Knives turf with blood between you, they come looking for you by name.

## Nothing is his until he buys it

The MC starts with no home at all — a cot at the Broken Crown rented **by
the night**, or sleeping rough: half-rest, fatigue that never fully clears,
and in dangerous districts a 1-in-4 chance the night collects its own rent
(pockets gone through, or unfriendly silhouettes at dawn). Run out of coin
before you've bought a place? That is life. The first home is a purchase —
8 gold for a two-room flat over a chandler's on Ratcatcher Lane (Home
panel) — and it's the milestone that opens the whole household ladder:
storage, treasury, upgrades, and every wing up to the estate. The Muse
tracks the gap between his purse and the price.

## The household works for its keep

Functional rooms unlock real actions at home: a **kitchen** cooks for the
party for coppers (free with a **garden**), the **training yard** gives a
daily sparring XP trickle, the **alchemy room** brews a potion a day into
storage (**library** improves the formula, the **enchanter's study** brews
greater potions), and the **workshop** mends worn and broken gear (half
cost with the **forge annex**, which also fletches 20 arrows a day). The
later-book wings: a **shrine** whose daily prayer lifts curses, an
**infirmary** that mends lasting injuries overnight, a **vault** earning
2% monthly interest on the treasury, a **watchtower** that thins ambushes
in the home district, a **war room** adding a day to job deadlines, and a
**great hall** for weekly feasts that raise faction standing.

## A universe for twenty books

- **Levels 1–50**: full ability trees per class — ten fighter skills from
  Shield Bash to Worldbreaker, rogues to Kingslayer, rangers to The Wind That
  Kills, mages to The Unmaking Word, priests to Divine Wrath (with party-wide
  heals and wards along the way).
- **40+ monsters** from Giant Rat (L1) to Elder Dragon (L45), each with loot
  tables and a bestiary plate (drawn or archetype-rendered).
- **8 dungeons** laddering the whole saga: Crypts of Saint Varro (1–4), the
  Drowning Cellars (2–5), the Ash Warrens (5–9), the Undervaults (8–13), the
  Sewers Deep (10–16), the Sunken Temple (14–20), Wyrmspire Undercroft
  (20–27), and The Hollow Crown (30–45) — whose master drops an artifact.
- **Ranged combat**: bows use DEX, draw from a tracked arrow supply
  (personal or party quiver), and go quiet when it empties. Arrows at the
  Forge and Dry Goods.
- **Injuries & scars**: going down in combat can leave a lasting wound
  (attack/defense penalty) until treated — the workshop can't fix flesh; the
  temple's *Mend Lasting Harm* can. Every treated wound leaves a permanent
  scar in the character sheet.
- **Weather & calendar**: four 90-day seasons, daily deterministic weather
  (snow only in winter), shown in the topbar and fed to the scene drafter.

## Outline from play

Play first, outline after: everything you do is already logged, and
**🗺 Outline from play** (sidebar) cuts the session into scene-shaped
beats — breaking on location changes, day turns, long gaps, and nights'
rest; typed action / dialogue / exploration / domestic / business /
transition; pure travel runs collapse into one journey beat. Each beat
lists its facts and what it *leaves open* (fled enemies, fresh wounds,
open jobs). One click turns selected beats into real scene stubs with
correct sim headers (day, time, location, participants) and an [OUTLINE]
fact block — which the 🪶 Draft Scene tool picks up automatically, and
Compile strips from the final manuscript. ✨ Shape chapter asks the LLM
for a title, throughline, per-scene goal/conflict/turn, merge suggestions,
and a next-chapter hook — bounded by the beat facts. The outline cursor
remembers where you left off; the next outline starts where this one ended.

## The Muse — the engine as co-plotter

The Muse panel mines the live simulation for story hooks and ranks them by
urgency — every idea grounded in cited sim facts, refreshed as the world
changes. It sees what the sim knows: **secrets** (knowledge one character
holds that another doesn't — the knowledge-separation system doing plot
work), **deadlines** about to bite, **faction blood-debts** and patronage,
**romance beats** where attraction has outrun commitment, **broken trust**,
untreated **wounds**, **Chekhov items** the manuscript never mentioned,
**forgotten cast**, unentered **dungeons** at the party's level, empty
purses, neglected home scenes, turning **seasons** and storms. Each hook
has *Use as outline* (pre-fills the Draft Scene tool) and *✨ Develop*
(the LLM proposes three concrete directions plus a complication, bounded
by the grounding facts). Nothing is canon; it's material.

## Character portraits

Everyone gets a deterministic drawn portrait (race skin tones, hair
variants, class accents — hood for rogues, circlet for mages, half-helm for
fighters) shown in conversations, the party panel, the prep screen, and the
People panel. Upload your own per character (🖼, stored in the save).

## Writing tools

- **🪶 Draft scene**: give the LLM a one-line outline; it writes a 400–700
  word first pass grounded in the scene header, participants, the previous
  scene's ending, and the sim's recent events — with explicit instructions
  to invent texture, never facts. Appended for you to rewrite.
- **Scene reordering**: ▲▼ on hover in the manuscript sidebar.

## Multiple books

Saves panel → Books: each book is its own world and manuscript. Create,
open, rename, delete; switching saves the current book first. Reset World
(same panel) restarts the current book from Day 1.

## Bestiary art

Every monster has a drawn bestiary plate (self-contained SVG, no assets)
shown on encounter banners and combat cards — dead enemies gray out. Replace
any plate with your own image via Saves → Monster art; uploads are stored
inside the save file, so AI-generated or commissioned art drops straight in.

## Companions start conversations

Sometimes a companion wants a word — driven by their state, not yours:
wounds, damaged trust, something unspoken crossing the attraction line, a
level burning a hole in their pocket, hunger, or a defeat weighed against
their values. A banner invites you to hear them out; the conversation opens
with *them* speaking first (LLM-voiced), and as always nothing becomes canon
unless you keep it.

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
