# Balancing

Every value here is [EST] unless tagged otherwise, and lives in `packages/shared/src/balance/*.ts` (one file per table). When a value changes, update this file and add a line to the change log at the bottom with the reason.

Target feel: an idle National Guard squad that is never reached kills about 700 common zombies before running dry, but dies in under a minute if 30 zombies reach contact.

## Zombies (`balance/zombies.ts`)

| Kind | HP | Speed (m/s) | Damage per hit | Bite chance | Share |
| --- | --- | --- | --- | --- | --- |
| Common | 30 | 1.4 | 8 | 15% | 85% |
| Runner | 20 | 4.0 | 6 | 15% | 10% |
| Brute | 120 | 1.0 | 20 | 10% | 5% |

Perception radius 25 m (line of sight); chase on noise > 40; attack range 1.2 m; one hit per 1.0 s.

## Weapons (`balance/weapons.ts`)

| Weapon | Range (m) | Shots/s | Damage | Accuracy | Area radius (m) | Ammo per soldier |
| --- | --- | --- | --- | --- | --- | --- |
| Rifle | 60 | 2 | 34 | 0.55 | 0 | 180 |
| Light machine gun | 80 | 8 | 30 | 0.35 | 0 | 500 |
| Shotgun (police) | 15 | 1 | 60 × 6 pellets | 0.5 | 0 | 40 |
| .50 HMG (vehicle) | 150 | 8 | 80 | 0.4 | 0 | 1,200 |
| 25 mm cannon | 300 | 3 | 120 | 0.6 | 2 | 600 |
| 120 mm tank gun | 400 | 0.15 | 400 | 0.8 | 8 | 40 |
| 30 mm (attack helicopter) | 500 | 10 | 100 | 0.4 | 3 | 1,200 |

Noise: shot 60 within 55 m; explosion 200 within 150 m; decay 10% per tick.

## Squads (`balance/units.ts`)

| Kind | Soldiers | HP each | Weapons | Speed (m/s) | Availability |
| --- | --- | --- | --- | --- | --- |
| National Guard | 8 | 100 | 7 rifles, 1 LMG | 3.0 | start |
| Police | 6 | 80 | 4 shotguns, 2 rifles | 3.2 | start |
| Marines | 10 | 120 | 8 rifles, 2 LMGs | 3.0 | reinforcement every 6 min |

The vertical slice uses two squads of 6 (5 rifles + 1 LMG).

## Vehicles (`balance/vehicles.ts`)

| Vehicle | HP | Speed (m/s) | Weapons | Passengers | Cargo | Fuel per km |
| --- | --- | --- | --- | --- | --- | --- |
| Light utility (Humvee) | 400 | 20 | .50 | 4 | 0.5 t | 2% |
| Wheeled APC (LAV) | 900 | 18 | 25 mm | 6 | 0 | 3% |
| Tracked IFV (Bradley) | 1,200 | 12 | 25 mm | 6 | 0 | 4% |
| Tank | 3,000 | 11 | 120 mm + .50 | 0 | 0 | 6% |
| Cargo truck (hooklift) | 500 | 15 | none | 2 | 8 t or 20 refugees | 3% |
| Transport helicopter | 600 | 50 | 2 LMG | 11 | 4 t slung | 5% |
| Attack helicopter | 800 | 60 | 30 mm + rockets | 0 | 0 | 6% |

## Fire support (`balance/support.ts`)

| Asset | Delay (s) | Radius (m) | Damage | Initial magazine | Cooldown (s) | Range |
| --- | --- | --- | --- | --- | --- | --- |
| 155 mm howitzer battery | 25 | 25 | 600 | 60 rounds | 10 between salvos | 20 km from base |
| Rocket launcher | 40 | 60 | 1,000 | 12 | 60 | 60 km |
| 5" naval gun | 20 | 20 | 500 | 300 | 3 | 20 km from ship |
| Cruise missile | 90 | 80 | 3,000 | 8 | 120 | whole city |
| Airstrike (fighter) | 60 | line 200 × 30 | 800 | 12 sorties | 180 | whole city |
| Gunship (orbit) | 45 | 15 per shot | 200 | 1 orbit of 120 s | 600 | whole city |
| Drone (vision orbit) | 30 | vision 300 | 0 | 2 orbits of 300 s | 300 | whole city |

## Structures (`balance/structures.ts`)

Implemented in v0.1 (values in code). HP counts zombie attacks (1 per attack, 1 attack/s per zombie). Materials are base stock units (base starts with 400).

| Structure | Cells | Height (m) | HP | Materials | Build time (s) | Effect |
| --- | --- | --- | --- | --- | --- | --- |
| Sandbags (id `hesco`) | 1 × 1 | 1.2 | 300 | 20 | 15 | blocks movement, not sight; climbable with pile 5 |
| Concrete wall | 1 × 1 | 3.5 | 600 | 40 | 30 | blocks movement and sight; climbable with pile 14 |
| Gate | 1 × 1 | 3.0 | 450 | 30 | 25 | open/close (G); closed blocks movement and sight; climbable with pile 12 |
| MG nest | 1 × 1 | 1.2 | 250 | 35 | 20 | crewed: 9 shots/s, 45 m, 45% base accuracy, 35 dmg, 100-round belts with a 6 s change, fires over walls, uses base ammo; any zombie within 8 m with no soldier closer goes for it, firing or not, and beat on it instead of climbing it |

Planned (not implemented yet):

| Structure | Cells | Height (m) | HP | Materials (t) | Build time (s) | Effect |
| --- | --- | --- | --- | --- | --- | --- |
| Scaffold | 1 × 1 | 3.0 | 200 | 0.3 | 8 | soldiers fire from the wall top |
| CIWS | 2 × 2 | 3.0 | 800 | 3.0 | 60 | auto cannon, 50 shots/s, 100 m, 3,000 rounds |
| Mortar pit | 2 × 2 | 0 | 400 | 1.0 | 20 | indirect fire 50 to 1,500 m, radius 10 m |
| Ammo depot | 3 × 3 | 2.5 | 600 | 2.0 | 30 | resupply point, 50,000 rounds |
| Fuel point | 3 × 3 | 2.0 | 400 | 2.0 | 30 | refuels vehicles, 20,000 L |
| Light tower | 1 × 1 | 8.0 | 150 | 0.3 | 8 | lights 40 m at night |

## Logistics (`balance/logistics.ts`)

| Value | Slice |
| --- | --- |
| Resupply radius | 30 m from a base or depot |
| Resupply rate | 10 rounds per soldier per second |
| Cargo truck | 400 HP, 7 m/s, 6,000 rounds or 400 materials (survival: 2,500 rounds and 200 materials) |
| Blocked when | 4 zombies within 3 m ahead |
| Push through | 35% speed, 12 damage per tick to zombies at the bumper |
| Reroute | zombie cells cost +120; gives up after 6 s blocked |
| Truck noise | 45 within 25 m |

## Mission "O Último Comboio" (`balance/mission.ts`)

| Value | Slice |
| --- | --- |
| Civilians | 40 (scale with command post HP: 800) |
| Base stock at start | 300 rounds, 160 materials |
| Truck cargo | 4,000 rounds, 240 materials |
| Waves | 60, 100, 150 zombies |
| Warning | 20 to 40 s; 20 s calm between waves |
| Wave spawn | at least 200 m from the base |
| District lost | control 0; drops 1/s at 5:1 zombies to soldiers (15+ zombies) |

## Squad tactics (`balance/tactics.ts`)

| Constant | Value | Effect |
| --- | --- | --- |
| Stagger per non-lethal hit | rifle 0.4 s, LMG 0.3 s, shotgun 0.9 s (brutes half) | zombie moves at 15% speed and cannot attack; sustained fire holds a line back |
| Fire distribution | +80% effective distance per squadmate already on a target | a squad spreads fire over the front instead of all on the nearest |
| Cover | walkable cell next to a wall, barrier, closed gate or building | hit chance ×1.15, stress gain ×0.55 |
| Cover search | 2 cells around each slot, obstacle on the enemy side, every 1 s | only while holding in `hold` or `defensive` stance |
| Stress gain | 3/s per zombie within 8 m (max 10), +6/s out of ammo, +1/s in the dark | ×0.75 with 3+ squadmates within 10 m |
| Stress shocks | bitten 30, squadmate down 22 (others nearby 11), squadmate bitten 12 (6) | within 15 m |
| Recovery | 8/s with no zombie within 8 m, 16/s at a lit base or depot | |
| Nerve | hit chance −35% at full stress | |
| Panic | at 92 stress: runs from the nearest zombie for 3 s, holds fire; then stress ≤ 60 and no new panic for 30 s | the player keeps control in direct mode |
| Contact call | `squad_contact` on first engagement, then at most every 30 s per squad | radio blip and alert |
| Suppress stance (T) | fire ×1.5 at 85% hit chance; every burst staggers all infected within 3 m of the target for 2× the weapon's stagger | holds a crowd back; burns ammunition |
| Firing on the move | half the fire rate (and hit chance ×0.6) | walking into contact costs; stop and hold |
| Flank and rear | a zombie within 8 m behind the squad's front counts 2.5× for stress | a squad caught from behind breaks |

## Difficulty (`balance/difficulty.ts`)

Veteran is the reference; every other table in this file is tuned for it. Chosen on the briefing, fixed for the game and stored in saves.

| | Recruit | Veteran | Nightmare |
| --- | --- | --- | --- |
| Zombies in the city at start | ×0.7 | ×1 (200) | ×1.3 |
| Wave size | ×0.65 | ×1 (60, 100, 150) | ×1.4 |
| Wave warning | +15 s | 20 to 40 s | −10 s (at least 5 s) |
| Zombie damage | ×0.7 | ×1 | ×1.25 |
| Bite chance | ×0.5 | ×1 | ×1.4 |
| Stress gain | ×0.7 | ×1 | ×1.25 |
| Base materials / ammo | +80 / +300 | 160 / 300 | −40 / −100 |

## World and AI (`balance/world.ts`)

| Constant | Value |
| --- | --- |
| Tick | 0.1 s (10 Hz) |
| Time scale (all speed steps) | ×1.25 (1.25x, 2.5x, 5x) |
| Initial zombies, full city | 60,000 (Ebbtide claims "a million" for LA) |
| Initial civilians, full city | 40,000 |
| Agent pool capacity | 16,384 |
| Day/night cycle | 20 game minutes; vision −50% at night without light |
| Choir directive interval | 5 s; max 3 active |
| Warning before an attack | 20 to 40 s |
| Turn time after bite | 60 to 180 s |
| Rise time after death by zombie | 20 s |

## Land use (`balance/zones.ts`)

Every district has a zone that sets its lots and buildings. In Porto Velário the Depósito Norte
district is always industrial, Centro is downtown (Alto da Sé when Centro is industrial), the rest
of the north row is houses and the rest of the waterfront row is mixed. On the slice map: NW
downtown, NE (depot) industrial, SW (base) houses, SE mixed.

| Zone | Lot side (cells) | Built | Floors (3 m) | Parks | Drawn as |
| --- | --- | --- | --- | --- | --- |
| Downtown | 4–8 | 85 % | 4–18 | ×0.6 | blocks; towers on a podium from 9 floors |
| Mixed | 3–7 | 78 % | 2–7 | ×1 | apartment blocks |
| Residential | 3–4 | 80 % | 1–2 | ×1.4 | houses under tiled gable roofs, gardens |
| Industrial | 6–11 | 75 % | 2–3 | ×0.3 | warehouses under barrel or metal roofs, concrete yards |

A strip at a block edge narrower than the smallest lot joins the lot before it. Lots under 2 cells
stay empty, and a building has at most 3 floors per cell of its narrowest side (BUILDING_SHAPE).

## Change log

| Date | Value | Old → new | Reason |
| --- | --- | --- | --- |
| 2026-10-26 | — | — | initial tables from the Vazante spec |
| 2026-10-26 | structure HP | thousands → 250..600 zombie attacks | HP is counted in attacks; old values made walls immortal |
| 2026-10-26 | structure footprint | 2×2 nest, 2×1 gate → 1×1 | one cell per piece for the slice; multi-cell later |
| 2026-10-26 | flow penalty for structures | — → 200 (20 cells) | horde detours around short walls and besieges long ones |
| 2026-10-26 | cargo truck | 500 HP, 15 m/s, 8 t → 400 HP, 7 m/s | the truck has to be escorted; at 15 m/s it outran every threat |
| 2026-10-27 | squad tactics | — → table above | suppression, fire distribution, cover and morale; line battle still 10 of 10 |
| 2026-10-27 | difficulty | — → three levels | recruit for the tutorial and new players, nightmare for veterans of the slice |
| 2026-10-29 | tactical decisions | — → suppress stance, fire on the move ×0.5, rear stress ×2.5, shot noise 40 → 55 m, rifle ammo 210 → 180, LMG 600 → 500 | the balance bot, which only moves and shoots, won all four missions at veteran with 0 to 3 hits taken; now it loses or bleeds on A Ponte, and a bot that uses suppression there wins |
| 2026-10-29 | Retomar a Ribeira | pressure 35/45/55 → 55/70/85, waves 180/260/340 → 280/400/520 | four squads walked through it with no losses |
| 2026-10-29 | strategic point area | site rectangle + 40 m → circle reaching 40 m past the longer side (r 76 m depot, 88 m base) | the area is drawn on the ground and the minimap as a circle; in economy modes districts no longer raise alerts or count as a goal |
| 2026-10-29 | truck wreck | destroyed truck removed, mission lost → wreck keeps its cargo; 3 engineers repair it in 40 s to 50 % HP; the mission fails only if civilians aboard die or no engineer is left (and no held station) | losing the only truck ended the game with no way back |
| 2026-10-29 | engineer repairs | — → 3 HP/s per engineer, 3 at most, on any damaged structure | engineers get a role of their own beyond building |
| 2026-10-30 | medical kits | — → MEDKITS: home base starts with 5; a secured hospital makes 10 a game day into its own stock (a truck carries up to 50 to the base) and no longer makes materials; in the base medical tent one kit fully heals one soldier and cures a bite (used at once on the bitten, and below 60% health). The hospital still heals and cures for free inside it. The Hospital São Lucas site is now one whole city block with its sidewalk ring (blocks of 10+ cells), its building across the back of the block | Diogo wanted the hospital to matter: a stock of cures to manage, refilled only by holding the hospital |
| 2026-10-30 | charge at walls | the stubborn share also charges walls and closed gates (any built defence in the way, not only sandbags and nests); a zombie charging a defence or going for a nest runs ZOMBIE_CHARGE_SPEED_FACTOR 1.25 faster | Diogo saw the horde file round open-ended walls without any frenzy. Siege test (200 commons on a full wall): one nest now holds ~51 s (was 120 s+), two nests hold 120 s, so a stretch of wall needs two nests; the test now asserts that |
| 2026-10-30 | stubborn horde | every zombie followed the flow field round sandbag lines and nests → ZOMBIE_STUBBORN_SHARE 0.6 (by slot) within ZOMBIE_STUBBORN_M 60 of its soldier keep straight on when only sandbags or a nest stand in the way, pile up and climb; walls, gates and buildings still send all round. Nests draw zombies within 8 m whether firing or not | Diogo saw the horde file round sandbags it could simply climb, and leave silent nests alone |
| 2026-10-30 | MG nest fire | accuracy 0.6 → 0.45; endless fire → 100-round belts, 6 s silent to change each | one nest killed ~5 commons a second without pause; now ~4 a second while firing and ~2.6 on average over a belt cycle. The wall-and-nest test still holds 120 s |
| 2026-10-30 | zombies and MG nests | nests walked round (flow penalty) or climbed with a pile of 5 → ZOMBIE_NEST_AGGRO_M 8: a chasing zombie with no soldier within 8 m goes for a nest within 8 m and hits it 1 HP/s | Diogo saw the horde ignore the nests; the wall-and-nest test still holds 120 s |
| 2026-10-30 | HESCO → sandbags | name HESCO → Sandbags / Saco de areia, height 2.2 → 1.2 m (pile 9 → 5, as low as an MG nest); HP and cost unchanged | a low sandbag line the squads fire over, not a tall barrier |
| 2026-10-30 | survival city | 512 cells (2 km), 4000 infected, cap 4000, clear 300 m, refill edge 250 m → 384 cells (1.5 km), 2250, cap 2250, clear 225 m, refill edge 190 m; site distances and gaps scale with the city | the 2 km city felt too big for survival; same density of infected on a smaller map |
| 2026-10-30 | building heights and lots | height by distance to the map centre, lots 3–7 everywhere → land use per district (table above) | districts read as downtown, houses and industry; the Depósito Norte stands in the industrial one |
| 2026-10-30 | time scale | 1x/2x/4x → 1.25x/2.5x/5x | every speed step 25 % faster; host pacing only, the simulation and hashes are unchanged |
| 2026-10-29 | field MG nest | drew on base stock anywhere → own box of 1500 rounds outside every base, topped up by an idle truck within 15 m | a nest far from the base should run dry and need supplying |
| 2026-10-29 | truck at the station | — → 200 materials, 3 trucks at most; replaces a wrecked mission truck | a second way to get a truck back |
| 2026-10-29 | Porto Velário layout | fixed river, base and depots → per seed: river course, base along the middle half of the shore, depot 360–500, hospital 330–480, station 170–300 cells from the base, each in its own district; block length, avenue rhythm and park share vary | "generate another city" barely changed the map: the points were always in the same place |
| 2026-10-30 | depot spacing | ≥ 30 cells between rectangles → ≥ 600 m between centres and ≥ 35° apart in bearing from the base, loosened to 500 then 400 m, else the old fixed layout | two points could land 150–200 m apart across a district boundary; over 200 seeds the closest pair is now 783 m |
| 2026-10-30 | survival day | 40 → 30 min (still from 08:00) | Diogo found 40 min too long; 20 min was too short |
| 2026-10-30 | wall climbing | PILE_UNIT_M 0.5 → 0.25 (14 stacked zombies top a 3.5 m wall, 9 a hesco); once climbable, one zombie per wall cell per second (CLIMB_INTERVAL_S 1); base ammo alerts below 800 and at 0 | Diogo saw hordes pour over walls: 7 zombies were enough and the whole pile went over at once, while the base sat at 0 ammo without warning. Bot at veteran unchanged: night shift, last convoy, hospital 3/3, bridge 2/3, survival 4 nights |
| 2026-10-30 | horde routing | flow field ignores zombies → each zombie beyond the first in a cell adds 10 (one cell of walking) to it, up to 80; lane lean 0.15 → 0.3 and slack 10 → 20 | Diogo saw the whole horde file through one gap in a single line; now a queue makes going round or hitting another stretch of wall look shorter. Bot at veteran: night shift, last convoy, hospital, bridge 3/3 |
| 2026-10-31 | survival materials | base 500 materials, Posto Âncora and the station make 60 a minute when secured, truck 6,000 rounds / 400 materials → base 100; only a secured Depósito Norte makes materials (and ammo) in every economy mode; a survival truck carries at most 2,500 rounds and 200 materials (the Depósito Norte truck starts with 2,500 / 200) | Diogo wanted materials to be scarce and fetched from the depot by convoy, never earned by sitting at the base |
| 2026-10-31 | building shape | edge strips of 1–2 cells became their own lots, any lot took any floor count (a 1-cell tower up to 18 floors) → strips join the previous lot, lots under 2 cells stay empty, floors ≤ 3 × narrowest side in cells (height ≤ 2.25 × width); about 25 % fewer buildings | Diogo saw towers as thin as a wall: 2,445 one-cell buildings over four cities, the worst 13.5 times taller than wide |
