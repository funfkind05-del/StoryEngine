// The festival calendar. Blackwall's year is 360 days and the city
// marks it: lamps, salt, founding, and the dead. Festivals color the
// day — prices soften, hearts open a little, and the Muse gets a
// chapter hook nobody has to invent.

import type { WorldState } from './types';

export interface FestivalDef {
  /** day of the 360-day year it falls on */
  dayOfYear: number;
  name: string;
  desc: string;
  /** shops shave a tenth off — festival trade */
  marketDay?: boolean;
  /** courting lands warmer: gifts and shared time gain +1 */
  heartsOpen?: boolean;
  /** the dead are close: undead encounters run hotter after dark */
  thinVeil?: boolean;
}

export const FESTIVALS: FestivalDef[] = [
  {
    dayOfYear: 15,
    name: 'The Lamplight Vigil',
    desc: 'Every lamp in the city burns from dusk to dawn while the Union walks its oldest round in silence. Tradition says a promise made under the full lamps keeps itself.',
    heartsOpen: true,
  },
  {
    dayOfYear: 90,
    name: 'The Salt Blessing',
    desc: 'The harbor blesses the boats and the boats bless the harbor right back. Fish stalls give it away by evening, and the wharves are almost — almost — safe.',
    marketDay: true,
  },
  {
    dayOfYear: 180,
    name: 'The Founding Revel',
    desc: 'The city pretends to remember its founding and throws the year’s biggest feast about it. Taverns overflow, guilds parade, and everything is briefly for sale.',
    marketDay: true,
    heartsOpen: true,
  },
  {
    dayOfYear: 270,
    name: 'The Night of Doors',
    desc: 'The Bonewardens’ vigil for the dead. Doors stand open with a coin on the sill, salt lines the stairs, and nobody says the old rhyme past midnight. The veil runs thin.',
    thinVeil: true,
  },
];

/** The festival falling on this calendar day, if any. */
export function festivalToday(world: WorldState): FestivalDef | null {
  const dayOfYear = world.time.day % 360;
  return FESTIVALS.find((f) => f.dayOfYear === dayOfYear) ?? null;
}

/** Price multiplier applied on market-day festivals. */
export function festivalPriceMult(world: WorldState): number {
  const f = festivalToday(world);
  return f?.marketDay ? 0.9 : 1;
}
