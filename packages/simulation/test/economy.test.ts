import { describe, expect, it } from 'vitest';
import { CELL_SIZE, ECONOMY, Ground, MEDKITS, SoldierCondition, TICK_HZ } from '@vazante/shared';
import { SimulationEngine, spawnTruck, type Base } from '../src/index.ts';
import { siteHeld } from '../src/systems/economy.ts';

function survival(seed = 3): SimulationEngine {
  return SimulationEngine.create(seed, 'survival', { zombies: 0 });
}

function site(e: SimulationEngine, role: Base['role']): Base {
  return e.world.bases.find((b) => b.role === role)!;
}

function centre(b: Base): [number, number] {
  return [((b.x0 + b.x1 + 1) / 2) * CELL_SIZE, ((b.y0 + b.y1 + 1) / 2) * CELL_SIZE];
}

/** Put a squad (anchor and members) at a point, as if it had walked there. */
function teleport(e: SimulationEngine, squad: number, [x, y]: [number, number]): void {
  const w = e.world;
  const q = w.squad(squad)!;
  q.ax = x;
  q.ay = y;
  q.path = [];
  q.order = { kind: 'hold', at: { x, y } };
  for (const id of q.members) {
    const s = w.soldier(id)!;
    s.x = x;
    s.y = y;
  }
}

function run(e: SimulationEngine, ticks: number): string[] {
  const out: string[] = [];
  for (let t = 0; t < ticks; t++) {
    e.tick();
    for (const ev of e.frame(false).events) out.push(ev.type);
  }
  return out;
}

describe('economy', () => {
  it('Porto Velário has a supply depot, a hospital and a station; only the base starts secured', () => {
    const e = survival();
    const w = e.world;
    expect(w.economy).toBe(true);
    for (const role of ['command', 'supply', 'hospital', 'station'] as const) expect(site(e, role)).toBeDefined();
    expect(siteHeld(w, site(e, 'command'))).toBe(true);
    expect(siteHeld(w, site(e, 'supply'))).toBe(false);
    expect(e.frame(false).economy).toBe(true);
  });

  it('a squad standing in a depot secures it, and the depot then produces into its own stock', () => {
    const e = survival();
    const w = e.world;
    const depot = site(e, 'supply');
    const before = { materials: depot.materials, ammo: depot.ammo };
    teleport(e, w.squads[0].id, centre(depot));
    const ev = run(e, 40 * TICK_HZ);
    expect(ev).toContain('site_secured');
    expect(siteHeld(w, depot)).toBe(true);
    run(e, ECONOMY.everyS * TICK_HZ);
    expect(depot.materials).toBeGreaterThanOrEqual(before.materials + ECONOMY.siteMaterials);
    expect(depot.ammo).toBeGreaterThanOrEqual(before.ammo + ECONOMY.supplyAmmo);
    const view = e.frame(false).bases.find((b) => b.id === depot.id)!;
    expect(view.held).toBe(true);
    expect(view.soldiers).toBe(w.squads[0].members.length);
    expect(view.infected).toBe(0);
    expect(view.income.ammo).toBe(ECONOMY.supplyAmmo);
  });

  it('a secured site falls when the infected outnumber the soldiers there', () => {
    const e = survival();
    const w = e.world;
    const depot = site(e, 'supply');
    depot.control = 100;
    const [x, y] = centre(depot);
    for (let i = 0; i < 30; i++) w.zombies.spawn(x + (i % 6) * 2, y + Math.floor(i / 6) * 2, 0);
    const ev = run(e, 30 * TICK_HZ);
    expect(ev).toContain('site_lost');
    // Districts are only names here: losing ground raises no district alert.
    expect(ev).not.toContain('district_lost');
    expect(siteHeld(w, depot)).toBe(false);
  });

  it('a secured hospital heals and cures the bitten', () => {
    const e = survival();
    const w = e.world;
    const hospital = site(e, 'hospital');
    hospital.control = 100;
    const q = w.squads[0];
    teleport(e, q.id, centre(hospital));
    const s = w.soldier(q.members[0])!;
    s.hp = 10;
    s.condition = SoldierCondition.Bitten;
    s.turnAt = w.tick + 600;
    const ev = run(e, 2 * TICK_HZ);
    expect(ev).toContain('soldier_cured');
    expect(s.condition).toBe(SoldierCondition.Ok);
    expect(s.turnAt).toBe(-1);
    expect(s.hp).toBeGreaterThan(10);
  });

  it('a secured hospital makes MEDKITS.perDay kits a day into its own stock, and no materials', () => {
    const e = survival();
    const w = e.world;
    const hospital = site(e, 'hospital');
    const home = site(e, 'command');
    expect(home.medkits).toBe(MEDKITS.start);
    // Two kits' worth of time (a tenth of a day each), with the hospital kept secured throughout.
    const every = (w.day!.lengthS * TICK_HZ) / MEDKITS.perDay;
    let made = 0;
    for (let t = 0; t <= 2 * every; t++) {
      hospital.control = 100;
      made += run(e, 1).filter((x) => x === 'medkit_made').length;
    }
    expect(made).toBe(2);
    expect(hospital.medkits).toBe(2);
    expect(home.medkits, 'the kits wait at the hospital for a truck').toBe(MEDKITS.start);
    expect(hospital.materials).toBe(0);
    expect(e.frame(false).bases.find((b) => b.id === hospital.id)!.income.materials).toBe(0);
    expect(e.frame(false).bases.find((b) => b.id === hospital.id)!.medkits).toBe(2);
  });

  it('a truck loads the kits at the hospital and unloads them at the base on arrival', () => {
    const e = survival();
    const w = e.world;
    const hospital = site(e, 'hospital');
    const home = site(e, 'command');
    hospital.medkits = 7;
    const [hx, hy] = centre(hospital);
    const truck = spawnTruck(w, hx, hy);
    e.enqueue({ type: 'load', vehicle: truck.id, ammo: 0, materials: 0, medkits: 100 });
    run(e, 1);
    expect(truck.cargoMedkits).toBe(7);
    expect(hospital.medkits).toBe(0);
    e.enqueue({ type: 'convoy', vehicle: truck.id, to: home.id, policy: 'push_through' });
    let ev: string[] = [];
    for (let t = 0; t < 600 * TICK_HZ && !ev.includes('medkits_delivered'); t += TICK_HZ) ev = ev.concat(run(e, TICK_HZ));
    expect(ev).toContain('medkits_delivered');
    expect(home.medkits).toBe(MEDKITS.start + 7);
    expect(truck.cargoMedkits).toBe(0);
  });

  it('in the base medical tent one kit fully heals one soldier and cures a bite; with no kits nothing happens', () => {
    const e = survival();
    const w = e.world;
    const home = site(e, 'command');
    const q = w.squads[0];
    const [bitten, wounded, scratched] = q.members.map((id) => w.soldier(id)!);
    bitten.hp = 50;
    bitten.condition = SoldierCondition.Bitten;
    bitten.turnAt = w.tick + 900;
    wounded.hp = wounded.maxHp * (MEDKITS.treatBelow - 0.1);
    scratched.hp = scratched.maxHp * (MEDKITS.treatBelow + 0.1);
    const ev = run(e, 2 * TICK_HZ);
    expect(ev.filter((t) => t === 'medkit_used')).toHaveLength(2);
    expect(home.medkits).toBe(MEDKITS.start - 2);
    expect(bitten.condition).toBe(SoldierCondition.Ok);
    expect(bitten.turnAt).toBe(-1);
    expect(bitten.hp).toBe(bitten.maxHp);
    expect(wounded.hp).toBe(wounded.maxHp);
    // Not hurt enough to spend a kit on.
    expect(scratched.hp).toBeLessThan(scratched.maxHp);

    home.medkits = 0;
    wounded.hp = 10;
    wounded.condition = SoldierCondition.Bitten;
    wounded.turnAt = w.tick + 900;
    expect(run(e, 2 * TICK_HZ)).not.toContain('medkit_used');
    expect(wounded.condition).toBe(SoldierCondition.Bitten);
  });

  it('the Hospital São Lucas takes one whole city block: its building stands across the back, never on a street', () => {
    for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const e = SimulationEngine.create(seed, 'survival', { zombies: 0 });
      const w = e.world;
      const g = w.grid;
      const hospital = site(e, 'hospital');
      // The site is a block and its sidewalk ring: lots (and the building) inside, sidewalk round, street beyond.
      for (let x = hospital.x0 + 1; x < hospital.x1; x++) {
        for (let y = hospital.y0 + 1; y < hospital.y1; y++) expect([Ground.Lot, Ground.Building], `seed ${seed}`).toContain(g.ground[g.idx(x, y)]);
        expect(g.ground[g.idx(x, hospital.y0)], `seed ${seed}`).toBe(Ground.Sidewalk);
        expect(g.ground[g.idx(x, hospital.y0 - 1)], `seed ${seed}`).toBe(Ground.Street);
      }
      const building = w.buildings.find((b) => b.style === 'hospital')!;
      expect(building.y1).toBe(hospital.y1 - 1);
      expect(building.x0).toBeGreaterThan(hospital.x0 + 1);
      expect(building.x1).toBeLessThan(hospital.x1 - 1);
      const [cx, cy] = centre(hospital);
      expect(g.isWalkableAt(cx, cy), `seed ${seed}`).toBe(true);
    }
  });

  it('a secured station recruits a squad there for the base materials', () => {
    const e = survival();
    const w = e.world;
    const station = site(e, 'station');
    const home = site(e, 'command');
    const squads = w.squads.length;
    e.enqueue({ type: 'recruit', kind: 'police' });
    run(e, 1);
    expect(w.squads.length).toBe(squads);

    station.control = 100;
    home.materials = ECONOMY.recruitCost.police + 10;
    e.enqueue({ type: 'recruit', kind: 'police' });
    const ev = run(e, 1);
    expect(ev).toContain('squad_recruited');
    expect(w.squads.length).toBe(squads + 1);
    expect(home.materials).toBe(10);
    const q = w.squads[w.squads.length - 1];
    expect(q.name).toBe(ECONOMY.recruitNames[0]);
    expect(w.siteAt(q.ax, q.ay)?.id).toBe(station.id);

    e.enqueue({ type: 'recruit', kind: 'marines' });
    run(e, 1);
    expect(w.squads.length).toBe(squads + 1);
  });

  it('a secured station sells a truck, which takes over from a wrecked mission truck', () => {
    const e = SimulationEngine.create(3, 'last_train', { zombies: 0 });
    const w = e.world;
    const station = site(e, 'station');
    const home = site(e, 'command');
    const old = w.mission!.trucks[0];
    w.vehicle(old)!.hp = 0;
    run(e, 2);
    e.enqueue({ type: 'buy_truck' });
    run(e, 1);
    expect(w.mission!.trucks[0]).toBe(old);

    station.control = 100;
    home.materials = ECONOMY.truckCost;
    e.enqueue({ type: 'buy_truck' });
    const ev = run(e, 1);
    expect(ev).toContain('truck_bought');
    expect(home.materials).toBe(0);
    const fresh = w.mission!.trucks[0];
    expect(fresh).not.toBe(old);
    expect(w.siteAt(w.vehicle(fresh)!.x, w.vehicle(fresh)!.y)?.id).toBe(station.id);
  });
});
