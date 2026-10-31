import { describe, expect, it } from 'vitest';
import { BUILDING_SHAPE, Ground, MISSIONS, STRUCTURE_FLOW_PENALTY } from '@vazante/shared';
import { FlowJob, SimulationEngine, computeFlowField, generateCityMap, type Grid } from '../src/index.ts';

function reachable(grid: Grid, start: number): Uint8Array {
  const seen = new Uint8Array(grid.size);
  const stack = [start];
  seen[start] = 1;
  while (stack.length) {
    const c = stack.pop()!;
    const x = c % grid.width;
    const y = (c - x) / grid.width;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (!grid.inBounds(x + dx, y + dy)) continue;
      const n = grid.idx(x + dx, y + dy);
      if (!seen[n] && grid.isWalkable(n)) {
        seen[n] = 1;
        stack.push(n);
      }
    }
  }
  return seen;
}

describe('Porto Velário', () => {
  it('is a 2 km city with a bay, a river, six districts, a base and three depots', () => {
    const m = generateCityMap(3);
    expect(m.grid.width).toBe(512);
    expect(m.districts).toHaveLength(6);
    expect(m.sites.filter((s) => s.kind === 'depot')).toHaveLength(3);
    let water = 0;
    for (let c = 0; c < m.grid.size; c++) if (m.grid.ground[c] === Ground.Water) water++;
    expect(water / m.grid.size).toBeGreaterThan(0.06);
    expect(m.buildings.length).toBeGreaterThan(2000);
  });

  it('each seed moves the strategic points, each to a district of its own at a playable distance', () => {
    const layouts = new Set<string>();
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { grid, sites } = generateCityMap(seed);
      layouts.add(sites.map((s) => `${s.x0},${s.y0}`).join(' '));
      const centre = (s: (typeof sites)[number]) => [(s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2];
      const [bx, by] = centre(sites[0]);
      const districts = new Set(sites.map((s) => grid.district[grid.idx(Math.round(centre(s)[0]), Math.round(centre(s)[1]))]));
      expect(districts.size).toBe(sites.length);
      for (const s of sites.slice(1)) {
        const [x, y] = centre(s);
        const d = Math.sqrt((x - bx) ** 2 + (y - by) ** 2);
        expect(d).toBeGreaterThan(160);
        expect(d).toBeLessThan(510);
      }
    }
    expect(layouts.size).toBe(6);
  });

  it('never puts two strategic points close together: 400 m apart at the very least, over 50 seeds', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const { sites } = generateCityMap(seed);
      const c = sites.slice(1).map((s) => [(s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2]);
      for (let i = 0; i < c.length; i++) {
        for (let j = i + 1; j < c.length; j++) {
          const d = Math.sqrt((c[i][0] - c[j][0]) ** 2 + (c[i][1] - c[j][1]) ** 2) * 4;
          expect(d, `seed ${seed}`).toBeGreaterThanOrEqual(400);
        }
      }
    }
  });

  it('has one district of each land use, and the Depósito Norte always stands in the industrial one, over 30 seeds', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const { grid, districts, sites, buildings } = generateCityMap(seed);
      const zones = districts.map((d) => d.zone);
      expect(zones.filter((z) => z === 'industrial'), `seed ${seed}`).toHaveLength(1);
      expect(zones.filter((z) => z === 'downtown'), `seed ${seed}`).toHaveLength(1);
      expect(zones, `seed ${seed}`).toContain('residential');
      const depot = sites.find((s) => s.name === 'Depósito Norte')!;
      const id = grid.district[grid.idx((depot.x0 + depot.x1) >> 1, (depot.y0 + depot.y1) >> 1)];
      expect(districts.find((d) => d.id === id)!.zone, `seed ${seed}`).toBe('industrial');
      // Each block takes the look of its district (a block across a border follows its centre).
      const warehouses = buildings.filter((b) => b.style === 'warehouse');
      const inIndustrial = warehouses.filter((b) => districts.find((d) => d.id === grid.district[grid.idx(b.x0, b.y0)])!.zone === 'industrial');
      expect(inIndustrial.length / warehouses.length, `seed ${seed}`).toBeGreaterThan(0.9);
      for (const b of buildings) if (b.style === 'house') expect(b.height).toBeLessThanOrEqual(6);
    }
  });

  it('downtown stands taller than the houses', () => {
    const { grid, districts, buildings } = generateCityMap(3);
    const zoneOf = (b: (typeof buildings)[number]) => districts.find((d) => d.id === grid.district[grid.idx(b.x0, b.y0)])!.zone;
    const mean = (zone: string) => {
      const hs = buildings.filter((b) => zoneOf(b) === zone).map((b) => b.height);
      return hs.reduce((a, h) => a + h, 0) / hs.length;
    };
    expect(mean('downtown')).toBeGreaterThan(mean('residential') * 4);
    expect(buildings.some((b) => b.style === 'tower')).toBe(true);
  });

  it('no building is a sliver: at least BUILDING_SHAPE.minSide cells wide and at most 3 floors per cell of width', () => {
    for (const seed of [1, 2, 3]) {
      for (const b of generateCityMap(seed).buildings) {
        const narrowest = Math.min(b.x1 - b.x0 + 1, b.y1 - b.y0 + 1);
        expect(narrowest).toBeGreaterThanOrEqual(BUILDING_SHAPE.minSide);
        expect(b.height / 3).toBeLessThanOrEqual(narrowest * BUILDING_SHAPE.floorsPerCell);
      }
    }
  });

  it('every street cell and every depot is reachable from the base, across the river', () => {
    for (const seed of [1, 2, 3]) {
      const { grid, sites } = generateCityMap(seed);
      const base = sites.find((s) => s.kind === 'base')!;
      const seen = reachable(grid, grid.idx(base.x0 + 2, base.y0 + 2));
      for (let c = 0; c < grid.size; c++) if (grid.ground[c] === Ground.Street) expect(seen[c], `seed ${seed} cell ${c}`).toBe(1);
      for (const s of sites) expect(seen[grid.idx(s.x0 + 2, s.y0 + 2)]).toBe(1);
    }
  });

  it('survival plays on a 1.5 km city with the same layout rules, scaled: own districts, 300 m apart, all reachable, over 30 seeds', () => {
    expect(MISSIONS.survival.citySize).toBe(384);
    for (let seed = 1; seed <= 30; seed++) {
      const { grid, sites, districts } = generateCityMap(seed, 384);
      expect(grid.width).toBe(384);
      expect(districts).toHaveLength(6);
      expect(sites.filter((s) => s.kind === 'depot')).toHaveLength(3);
      const centre = (s: (typeof sites)[number]) => [(s.x0 + s.x1) / 2, (s.y0 + s.y1) / 2];
      const ids = sites.map((s) => grid.district[grid.idx(Math.round(centre(s)[0]), Math.round(centre(s)[1]))]);
      expect(new Set(ids).size, `seed ${seed}`).toBe(sites.length);
      const depot = sites.find((s) => s.name === 'Depósito Norte')!;
      expect(districts.find((d) => d.id === ids[sites.indexOf(depot)])!.zone, `seed ${seed}`).toBe('industrial');
      const c = sites.slice(1).map(centre);
      for (let i = 0; i < c.length; i++) {
        for (let j = i + 1; j < c.length; j++) expect(Math.hypot(c[i][0] - c[j][0], c[i][1] - c[j][1]) * 4, `seed ${seed}`).toBeGreaterThanOrEqual(300);
      }
      if (seed <= 3) {
        const base = sites[0];
        const seen = reachable(grid, grid.idx(base.x0 + 2, base.y0 + 2));
        for (const s of sites) expect(seen[grid.idx(s.x0 + 2, s.y0 + 2)], `seed ${seed} ${s.name}`).toBe(1);
      }
    }
  });

  it('survival starts with the infected scaled to the smaller city', () => {
    const e = SimulationEngine.create(5, 'survival');
    expect(e.world.grid.width).toBe(384);
    const alive = e.world.zombies.alive;
    expect(alive).toBeGreaterThan(1500);
    expect(alive).toBeLessThanOrEqual(MISSIONS.survival.zombies);
  });

  it('the flow field computed in slices equals the one computed at once', () => {
    const { grid, sites } = generateCityMap(2);
    const sources = sites.map((s) => grid.idx(s.x0 + 3, s.y0 + 3));
    computeFlowField(grid, sources, STRUCTURE_FLOW_PENALTY);
    const whole = grid.flow.slice();
    grid.flow.fill(0);
    const job = new FlowJob();
    job.begin(grid, sources, STRUCTURE_FLOW_PENALTY);
    let slices = 1;
    while (!job.run(grid, 5000)) slices++;
    expect(slices).toBeGreaterThan(10);
    expect(grid.flow).toEqual(whole);
  });

  it('a save taken while the flow rebuild is half done loads and runs on identically', () => {
    const a = SimulationEngine.create(4, 'city_war', { zombies: 1500 });
    a.runTicks(7);
    expect(a.world.flowJob.active).toBe(true);
    const b = SimulationEngine.load(a.save());
    a.runTicks(40);
    b.runTicks(40);
    expect(b.hashState()).toBe(a.hashState());
  });

  it('the slice map still finishes its flow rebuild in the tick it starts', () => {
    const e = SimulationEngine.create(1);
    for (let t = 0; t < 30; t++) {
      e.tick();
      expect(e.world.flowJob.active).toBe(false);
    }
  });
});
