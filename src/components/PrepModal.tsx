// Adventure Preparation Screen: shown before entering a dungeon.
// Party readiness, pooled supplies, difficulty estimate, and a last
// chance to go shopping instead.

import { useStore } from '../state/store';
import { CLASSES, fmtMoney } from '../engine/rules';
import { Bar, Tag } from './common';

export function PrepModal() {
  const world = useStore((s) => s.world);
  const prepDungeon = useStore((s) => s.prepDungeon);
  const cancelPrep = useStore((s) => s.cancelPrep);
  const enterDungeonAt = useStore((s) => s.enterDungeonAt);
  const setPanel = useStore((s) => s.setPanel);
  if (!prepDungeon) return null;
  const d = world.dungeons[prepDungeon];
  const party = Object.values(world.characters).filter((c) => c.inParty && c.alive);

  // supplies: count consumables across personal packs and the party pool
  const supplyCounts = new Map<string, number>();
  const countItem = (iid: string) => {
    const it = world.items[iid];
    if (!it || (it.kind !== 'potion' && it.kind !== 'supply' && it.kind !== 'tool')) return;
    supplyCounts.set(it.name, (supplyCounts.get(it.name) ?? 0) + (it.qty ?? 1));
  };
  for (const c of party) c.inventory.forEach(countItem);
  world.partyInventory.forEach(countItem);

  const partyPower = party.reduce((s, c) => s + c.level, 0);
  const recMax = parseInt(d.recommendedLevel.split(/[–-]/)[1] ?? '4', 10);
  const est = partyPower >= recMax * Math.max(2, party.length) ? 'EASY' : partyPower >= recMax + party.length ? 'MODERATE' : partyPower >= party.length * 1.5 ? 'DANGEROUS' : 'DEADLY';
  const estColor = est === 'EASY' ? 'var(--accent2)' : est === 'MODERATE' ? 'var(--accent)' : 'var(--danger)';
  const totalCoin = party.reduce((s, c) => s + c.money, 0);
  const hurt = party.filter((c) => c.hp.current < c.hp.max || c.statuses.length > 0);

  return (
    <div className="modal-backdrop">
      <div className="modal" style={{ width: 'min(620px, 94vw)' }}>
        <div className="modal-head">⛏ {d.name}</div>
        <div className="modal-body">
          <p className="dim small">{d.dungeonType} · {d.floors} floors · recommended level {d.recommendedLevel} · via {world.locations[d.entranceLocation]?.name}</p>
          <h4>Party</h4>
          {party.map((c) => (
            <div key={c.id} className="row small">
              <span style={{ width: 90 }}>{c.name}</span>
              <span className="dim" style={{ width: 70 }}>{CLASSES[c.charClass].label}</span>
              <span className="mono dim" style={{ width: 34 }}>L{c.level}</span>
              <span className="grow"><Bar value={c.hp.current} max={c.hp.max} color="var(--danger)" /></span>
              <span className="mono dim">HP {c.hp.current}/{c.hp.max}</span>
              {c.statuses.map((s) => <Tag key={s.key} tone="red">{s.key}</Tag>)}
            </div>
          ))}
          <h4>Supplies (carried + pooled)</h4>
          {supplyCounts.size === 0 && <p className="dim small">Nothing. That is a choice, certainly.</p>}
          {[...supplyCounts.entries()].map(([name, n]) => (
            <div key={name} className="row small"><span className="grow">{name}</span><span className="mono">{n}</span></div>
          ))}
          <div className="row" style={{ marginTop: 8 }}>
            <span className="grow">Party coin: <b className="mono">{fmtMoney(totalCoin)}</b></span>
            <span>Estimated difficulty: <b style={{ color: estColor }}>{est}</b></span>
          </div>
          {hurt.length > 0 && (
            <p className="warn soft small">Not at full strength: {hurt.map((c) => c.name).join(', ')}. Consider rest, potions, or the temple first.</p>
          )}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="primary" onClick={() => enterDungeonAt(d.id)}>ENTER DUNGEON</button>
            <button onClick={() => { setPanel('party'); cancelPrep(); }}>Change party</button>
            <button onClick={() => { setPanel('inventory'); cancelPrep(); }}>Equipment</button>
            <button onClick={cancelPrep}>Return</button>
          </div>
        </div>
      </div>
    </div>
  );
}
