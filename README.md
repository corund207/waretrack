<p align="center">
  <img src="docs/logo.svg" width="72" alt="WareTrack logo" />
</p>

<h1 align="center">WareTrack</h1>

<p align="center">
  <b>A logistics park that builds and runs itself. Sit back and watch.</b><br/>
  Road, rail, sea and air freight feeding a live, multi-stage supply chain, rendered as a lifelike 3D world in the browser.
</p>

<p align="center">
  <a href="__LIVE_URL__"><b>▶ Live demo</b></a> ·
  <a href="#screenshots">Screenshots</a> ·
  <a href="#run-it-locally">Run locally</a> ·
  <a href="#development">Development</a>
</p>

<p align="center">
  <a href="https://github.com/corund207/waretrack/actions/workflows/ci.yml"><img src="https://github.com/corund207/waretrack/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <img src="https://img.shields.io/badge/version-v5.8.0-2f56e0" alt="version" />
  <img src="https://img.shields.io/badge/three.js-r147-black" alt="three.js" />
  <img src="https://img.shields.io/badge/build-zero%20dependencies-3ddc84" alt="no dependencies" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license" /></a>
</p>

![WareTrack: a fully grown logistics park](docs/screenshots/02-overview.png)

It starts as empty land with a highway and a forest. A director AI earns capital, plans projects and builds the
park itself: roads get paved, trees cleared, tower cranes go up, mixer trucks pour concrete, and buildings rise floor
by floor. Each new facility then joins a fully simulated supply chain, where every container, ULD and tanker load is
a real object you can click and follow from the ship, train or plane all the way to the factory dock.

No build step and no framework: plain JavaScript and [three.js](https://threejs.org), served as static files.

## Screenshots

| | |
|---|---|
| ![Founding day](docs/screenshots/01-founding.png) **Day one.** Bare land, the first plot being paved and built. | ![Factory docks](docs/screenshots/03-factory-docks.png) **Factory receiving.** Raw material arrives at the dock and belts feed the process line. |
| ![Seaport](docs/screenshots/04-seaport.png) **Seaport.** STS cranes discharge the exact containers each purchase order was booked on. | ![Rail terminal](docs/screenshots/05-rail-terminal.png) **Rail terminal.** The gantry grounds boxes and loads them onto container movers. |
| ![Air cargo](docs/screenshots/06-air-cargo.png) **Air cargo.** Freighters turn around at the stands, and ULDs are tugged to the landside rack. | ![Supply chain](docs/screenshots/07-supply-chain.png) **Supply panel.** Live plant stockpiles, terminals, depot and road dispatch state. |
| ![Truck detail](docs/screenshots/08-truck-card.png) **Everything is clickable.** A vehicle with its order, container and traffic state. | ![Cinema mode](docs/screenshots/09-cinema.png) **Cinema mode.** An autonomous camera director with the dashboard hidden. |

## Run it locally

```
npm start              # serves the source at http://localhost:8000 (next free port if 8000 is taken)
npm run start:dist     # builds, then serves dist/ exactly as deployed
```

The server is plain Node (no dependencies, no `npm install` needed) and sends `no-store` headers so a reload always
picks up edited code. `--port`, `--host 0.0.0.0` and `PORT=…` are supported. Opening `index.html` directly also works. three.js is bundled in `js/vendor/`. The version badge next to the logo
shows which build you are looking at (deployed builds also show the commit hash).

## What grows

| Phase | What appears |
|------|--------------|
| Founded | Avenue paved, first **warehouse** with dock bays, apron and yard forklifts, and pallet slots |
| Manufacturing | **Factories**: ore silos → smelter (glowing ingots on an elevated belt) → sawtooth assembly hall → a conveyor bridge carrying cartons into the paired warehouse, with smoking chimneys |
| Rail freight | A track-laying train builds the double-track **mainline**. **Rail terminals** get two sidings, so two trains are worked at once, three gantry cranes over a 34-slot stack and five truck spots. A freight call goes out for every free siding with cargo booked, mine trains run whenever the container works can load one, and through freight keeps to the westbound main. Besides a yard on each park avenue (except the airfield's), three more yards open out along the mainline at −840, −1080 and 1320, each paving its own access avenue |
| Seaport | **Port terminals** with ship-to-shore cranes. Feeder vessels berth, unload and load, and cargo ships pass offshore |
| Air cargo | **Airfield**, cargo terminal with landside belt docks, 4 stands with ULD tugs, and a control tower. Freighters fly in over the park, land, turn around and take off |
| Mega hub | Power plants with steaming cooling towers and pylon lines, **container depots**, a **truck stop** with fuel canopies and a diner, cold-storage, fulfilment and bulk warehouses, substations, water towers, solar farms, tank farms, an HQ tower and staff parking with shuttle-bus stops, filling about 100 plots across 6 avenues |

No raw material is ever trucked in from outside. Every input arrives by train, ship, air freighter or
pipeline (or from another plant in the park), and **autonomous container movers** carry it the last leg from the
terminal crane to the plant. No road truck ever works a rail or port terminal: movers also carry the export
boxes and the empties. Trucks are left with customer distribution, air cargo feeders and returning
surplus empties to the shipping lines. A full
build-out takes roughly an hour at 1× (use 2×/4×/8× to speed it up).

## Supply chain: order-driven and physically traced

**Purchase orders.** Each plant keeps live stockpiles of its inputs, shown as ore heaps, coil rows, log stacks,
crates and tank levels. When stock plus open orders falls below the reorder point, it raises a purchase order. The
order is routed the way it would be in real life:

| Mode | What happens |
|------|--------------|
| **Sea** | The order is booked on the next vessel. The ship arrives with *that* container on deck, the STS crane discharges it straight onto a container mover waiting on a crane spot, and the mover drives that exact box to the plant |
| **Rail** | The order rides a specific train's flatcar (mine trains bring bulk in open-top bins). The gantry lifts it onto a container mover |
| **Air** | The order is built into a ULD on a specific flight. It's tugged off, clears customs and appears on the landside rack, a ULD mover carries it to the plant, and the empty ULD goes back to the airport |
| **Pipeline** | Chemicals and propane are pumped from the gas field straight into the plant's tanks |
| **In-park transfer** | A mover is loaded at the producer's shipping bay and drives the intermediate product to the consumer |

Liquids travel in ISO tank containers and are pumped off through a hose; open loads (ore, coal, logs, coils, glass)
ride in open-top bins and flat-racks with the cargo in view. After unloading, a mover takes its empty back to the
yard it came from.

**The mover fleet.** Movers live at **mover depots**, each with 20 drive-through charging bays under pantograph
charging masts. A job takes the charged mover nearest its first stop. It drives out, works its legs and comes back
to its own bay; if another container is already waiting when it drops an empty, it takes that job straight on. A
crane terminal's spots are booked when a mover is dispatched, so movers never queue at a yard gate out on the
avenue; the air terminal's ULD docks and the plants also let a few wait in their own staging lanes.
Movers run faster than road trucks and keep a reserve for factory supply: exports and empty repositioning only take
a mover when no container is waiting for one. The first depot opens with a full fleet of 20 just before the first
rail terminal. Whenever jobs wait for a free mover, fleet control orders enough for every waiting container plus the
reserve: each one comes in on a heavy-haul lowloader that drives down an empty bay's lane, where the new mover
reverses off the deck onto its charger, one lowloader at a time and never while the roads are congested (a jam is
not a mover shortage). Before the last bays fill, the planner builds another depot (8 movers to start) on the
avenue with the fewest depots, so no one avenue carries the whole fleet home.

Stock only rises when the delivery is physically received at the dock: containers are opened and destuffed, ULDs
broken down, tanks pumped through a hose. Click any container, ULD or vehicle to see its order and full journey log.
The **Orders** tab follows every order from placement to delivery.

**Multi-stage industry**

| Primary plant | Turns | Into | Supplies |
|---------------|-------|------|----------|
| Steel Mill | Iron ore (sea/rail) | Steel coils | Appliances, Auto Parts |
| Copper Refinery | Copper ore (sea/rail) | Copper wire | Electronics |
| Chemical Plant | Chemicals + propane (pipeline/rail) | Plastic resin | Electronics, Appliances |
| Sawmill | Timber logs | Lumber | Furniture |
| Glass Works | Silica sand (rail) | Float glass | Beverages |

Assembly plants (Electronics, Appliances, Auto Parts, Beverages, Furniture, Pharma) send finished cartons over a belt
bridge into their paired warehouse. From there, goods go out to customers, to the airport, or into export containers
that leave on trains and ships. Until a primary plant exists, its product is imported by rail or sea. The planner builds a new
primary plant once enough assembly lines depend on it. Plants starve, visibly and on their cards, when a delivery is
late, and run out of space ("Output full") when nobody collects.

**Loads you can see.** Raw materials from ships and trains travel in **open-frame containers**: open-tops heaped
with ore or sand, and flat-racks carrying crates or glass on A-frame racks. Cranes lift them with the cargo in plain
view. Utility trailers show what they carry too: steel coils in cradles, log stakes, lumber bundles and wire reels.
At the factory dock each piece is swung off the top of the load onto the dock belt, so the load visibly shrinks until
the bed is bare. At a producer's shipping bay, a shuttle's bed fills from the headboard back as product comes off
the line.

**Container terminals (rail yards and seaport) run on one shared engine**, `js/terminal.js`:
- **Cranes acting as one.** Rail yards run three gantries on one pair of rails, the seaport two quay cranes. Split
  lines divide the yard between them and follow the queued work, so each crane gets an equal share. Each crane
  takes only lifts in its own stretch, so all work at the same time without blocking each other. When one crane
  runs short of work its lines shift toward it. A lift that spans two stretches goes ahead with rail claims, and the
  neighbour steps aside, with trucks taking priority.
- **Truck lanes with a bypass.** Each crane area has a service lane with numbered spots and a bypass lane beside it,
  so trucks can drive around parked ones and enter or leave in any order. Each spot has a straight run-in, so the
  rig is square before it stops.
- **Forward thinking.** At the gate a truck is given the spot nearest its box. Once it's a few seconds out, the crane
  is already lifting the box and holding it over the spot. Trucks are dispatched as soon as their train or ship
  arrives, and a box still aboard goes straight from wagon or deck onto the truck.
- **Never parked.** An idle crane moves to where its next work will be, or restacks boxes nearer the truck spots.
- **Empties go to the depot by truck.** They never ride a train or ship. A nearly full depot sends surplus empties
  back to the shipping lines.

**Seaport traffic.** Separate inbound and outbound tracks, and an anchorage where the next ship waits while the berth
is busy. Ships enter and leave only with clearance, two harbour tugs escort them on and off the berth, and moving
ships leave a wake.

**Airport.** Parallel runways: 09R for arrivals, 09L for departures. Arrivals cross 09L at the east end only when it's
clear, and departures never roll while anything is crossing. There are six stands, pushback clearance with a
reserved stretch of taxiway, and wingtip spacing on the taxiway. Landings flare with tyre smoke at touchdown, and
departures rotate at take-off.

**Roads.** The highway and avenues have two lanes each way. Turns that stay on your own side of the road use the
outer lane; turns across traffic use the inner lane. Vehicles pick their lane when they join the highway, and
trucks take wider, smoother corners.

**Distribution centers.** Trucks drive down the yard road, pull past their door and reverse square onto the
dock, guided by bay lines. They pull straight out when they're done. The roller door opens, and a dock forklift
inside drives onto the leveler and puts its forks into the trailer, one pallet at a time. Separate **forklift doors**
between the dock doors, with yellow guard posts and marked walkways, let the yard forklifts carry pallets between
the outdoor yard and the building. They stage stock out when the yard runs low and put it away when it fills up.

**Realistic handling:** terminal appointments with a truck queue at the gate, staging lanes inside plant gates,
street-turned empties, a container depot, and long lead times for sea freight that primary plants buffer against.

## Traffic

- Collision avoidance: each vehicle knows its body shape, follows the car ahead, predicts crossing conflicts and
  yields by right of way (junction > highway > avenue > yard). A deadlock breaker handles circular waits.
- **Queue-actuated traffic signals** at every highway junction. Green time follows the queue on each axis, and a
  signal hands over as soon as its queue is empty and the cross street is waiting.
- **Junction box manager.** Movements whose swept paths would cross never share the box. Opposing through traffic and
  paired right turns go together. No vehicle enters a junction unless its whole body fits beyond the exit
  ("don't block the box").
- **Dispatch metering.** Dispatch watches how much traffic is queued. It meters new truck releases when the roads get
  busy and holds them when they're jammed (see *Supply → Roads*). Finished trucks leave by the nearest exit.
- **Articulated semis.** Every rig is a tractor and a semi-trailer hinged at the fifth wheel. Pulling forward, the
  trailer trails the tractor through bends like a real one and cuts slightly inside. Reversing onto a dock, the
  trailer leads and the tractor follows it in. Collision bodies follow both parts.
- **Off-street docking.** Every unload path is laid out clear of buildings, belts, stockpiles, crane legs and pylons,
  and a geometry audit checks each vehicle's full body sweep. Factories have a **drive-through receiving road**: movers
  enter at one gate, run down a bypass lane, pull alongside a bay beside the dock wall, are unloaded sideways onto
  the dock belt and drive straight on out of the other gate, never reversing. At warehouses and the air terminal,
  trucks pull past the bay and **reverse onto the dock**, while traffic behind holds back to give them room. Terminal
  trucks enter and leave the crane lanes from the ends, outside the gantry's travel. Yard forklifts yield to moving
  trucks.
- **Gate barriers** lift for vehicles at every plot entrance. Terminals add an OCR portal where trucks stop for the
  gate-in check.
- The vehicle card's *Traffic* row says why a vehicle is waiting: red light, junction busy, exit blocked, or queued
  behind another vehicle.
- The version is shown next to the logo (currently **v5.8.0**). Hard-refresh (Ctrl+F5) if it doesn't match.
- Vehicle variety: cab-over and long-hood rigs; box, curtainsider, reefer, tanker, coil, log, container and dump
  trailers; concrete mixers; sedans, SUVs, vans, pickups and shuttle buses. Through trains carry tank, hopper and box
  wagons, and tankers and bulk carriers pass offshore.

## Watching

- **Auto camera** (on by default, **C**) cuts to new construction, freighters on approach, trains arriving and ships
  berthing. Between events it follows trucks, shows factory belts and gives slow orbits and overviews. Any mouse or
  keyboard input hands you control, and it resumes after 30 s.
- **Cinema mode** (**U**) hides the dashboard and leaves a slim status ticker.
- **Dark mode** (**N**, or the moon button in the map toolbar) switches the dashboard to dark and the park to night:
  a moonlit sky, with street lamps, headlights and office windows lit. It follows your system setting until you
  pick one, then remembers your choice.
- Click anything for its live detail card, and use **Follow** to ride along with a vehicle.
- Drag to pan, scroll to zoom, right-drag or **Q/E** to rotate, right-drag up/down or **R/F** to tilt (down to the
  horizon), **H** home, **/** search, **Space** pause, **1–4** set speed.

## Code map

- `js/core.js`: sim clock, coroutines, path following, traffic yielding
- `js/look.js`: the lifelike look: physically based materials, real-world palette, procedural grass, asphalt,
  concrete, gravel and water, sky dome with sun, haze and clouds, image-based lighting, night lights
- `js/assets.js`: downloaded 3D models (truck cabs, cars, vans, the 787, locomotives, forklifts): decoded from
  `js/models_data.js`, fitted to the park and cloned per vehicle; the hand-built models are the fallback
- `js/models.js`, `js/models_ext.js`: hand-built models (merged vertex-coloured geometry with chamfered edges)
- `js/world.js`: terrain, highway, coast, instanced forest, plot grid, avenue paving, rail line, road router, pylons
- `js/fx.js`: smoke, steam and dust particles, and instanced conveyor belts
- `js/fac_*.js`: facilities (warehouse, factory, rail, port, airport, depot and truck stop, misc)
- `js/traffic.js`: traffic engine (avoidance, signals, gates), vehicles, multi-leg missions, ambient traffic
- `js/supply.js`: materials, recipes, container contents and journeys, demand-driven dispatcher
- `js/models_fleet.js`: rigs and trailers, cars and buses, wagons, ships, signals, barriers, lamps
- `js/growth.js`: economy, project planner, construction sequence, milestones
- `js/cinema.js`: autonomous camera director
- `js/ui.js`, `js/main.js`: dashboard, renderer, input, overlays, main loop
- `js/theme.js`: light / dark theme for the dashboard and the 3D scene

## Development

```
npm install            # dev dependency: puppeteer (headless Chrome for the tests)
npm test               # static checks → build → simulation test
npm run screenshots    # regenerate docs/screenshots and docs/social-preview.png
npm run pack-models    # re-pack assets/models/*.glb into js/models_data.js after changing a model
```

- `npm run test:static` parses every script, makes sure every asset referenced by `index.html` exists, and checks that
  every cache-busting tag and `package.json` match `WT.VERSION`.
- `npm run build` copies the site to `dist/`, tags every asset URL with a hash of the file contents (so any change
  busts browser caches, even for uncommitted work) and stamps the version badge with the commit hash.
- `npm run test:sim` boots the built site in headless Chrome with a fixed random seed and grows the park through
  most of a day. It fails on any page error, on stalled growth or unfed factories, on vehicles piling into each
  other or traffic locking up, or if any truck path (docks, reverse manoeuvres, staging lanes, public roads)
  sweeps through a building, belt, stockpile, crane or tree.

### CI / CD

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and pull request:

1. **Test**: static checks, build, then the full simulation test.
2. **Deploy**: only runs if the tests pass. `main` goes to **production** on Vercel, and other branches get a
   **preview** URL.

Deployment needs three repository secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID`. Vercel's own
Git auto-deploys are switched off in `vercel.json`, so nothing reaches the live site without passing CI.

## Credits

The realistic vehicles are CC BY 4.0 models from Sketchfab, optimised for the park with
[`scripts/optimise-models.mjs`](scripts/optimise-models.mjs). The full list, with links, is in
[`assets/models/CREDITS.md`](assets/models/CREDITS.md):

- **DAF XF105** tractor unit by Alvin.Woodly
- **BMW E30** by roh3d
- **Mercedes-Benz G-Class** by Lexyc16
- **DHL delivery van** by maregajavier
- **Boeing 787 Dreamliner** by maurogsw
- **Diesel locomotive** by Leaf_dev
- **Warehouse forklift** by absologixemployee

## License

[MIT](LICENSE) for the code. three.js is © Three.js Authors (MIT). The 3D models in `assets/models` (and packed in
`js/models_data.js`) keep their own CC BY 4.0 licences; see [Credits](#credits).

