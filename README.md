# BLOX FORCES

A **sci-fi wave-survival FPS** for the browser, built on **Three.js (r128)** — procedural
terrain, 5 weapons with attachments, loot caches, crafting, three gamemodes and a
selectable character. Ships as one self-contained `index.html`.

## Play

From the project folder:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

The local server is needed so the browser may load `assets/sentinel.glb` (your character).
Double-clicking `index.html` also works — the game just skips the GLB character model.

## Game flow

**Main menu → Start Game → pick a gamemode → pick a character → Deploy.**

| Gamemode | Rules |
|---|---|
| **Wave Survival** | Escalating waves, boss every 5th. Survive. |
| **Endless Horde** | Continuous swarm; threat tier climbs with time. Score chase. |
| **Target Rush** | Eliminate 30 hostiles as fast as possible. Best time saved. |

| Character | Stats |
|---|---|
| **Golden Sentinel** | Balanced — HP 100, speed 100% (imported GLB, animated) |
| **Blox Trooper** | Scout — HP 80, speed 118% |
| **Night Vanguard** | Heavy — HP 135, speed 88% |

Best score/wave per mode (and best Rush time) are saved in your browser and shown on the
menu and game-over screens. **Settings** (sensitivity, FOV, SFX/music volume, invert-Y)
persist too, and are also reachable from the pause menu.

## Controls

| Input | Action |
|------|--------|
| `W` `A` `S` `D` | Move · `Shift` sprint · `Space` jump |
| Mouse | Look (click + drag fallback) · `L-click` fire · `R-click` aim |
| `R` | Reload |
| `E` | Open a supply cache |
| `G` | Grenade · `Q` use medkit |
| `Tab` / `I` | Inventory (weapons, attachments, items, crafting) |
| `T` | Cycle attachment |
| `1`–`5` | SMG · Machine Gun · Shotgun · Sniper · Rocket |
| `V` | First / third person |
| `Esc` | Pause (Resume / Settings / Quit) |
| `H` | Help overlay |

## Loot, armor & crafting

- **Supply caches** spawn around the map under cyan light beacons. Press `E` to open:
  2–3 random drops — ammo, medkits, grenades, **armor plates**, or **scrap**.
- **Armor** (blue bar) soaks 60% of incoming damage until it's depleted.
- **Scrap** drops from caches and ~30% of kills (bosses drop big). Spend it in the
  inventory's **Quick craft**: Medkit (15) · Grenade (10) · Armor +25 (20) · Ammo (10).
- Enemies also drop direct pickups (ammo / medkit / grenade) you walk over.

## Combat

5 weapons with distinct feel (spread, recoil, ADS zoom, reload), attachments (Red Dot,
Scope, Extended Mag, Compensator), grenades, rockets with splash, headshot bonuses,
hitmarkers, killfeed, compass, low-health warning pulse, and 5 sci-fi enemy types
(crawler / skitter / brute / plasma drone / boss) that scale with difficulty.

## Project layout

```
index.html        Self-contained build (Three.js + GLTFLoader + game inlined)
build.js          node build.js → assembles index.html from src/
src/
  game.js         All game logic
  shell.html      HTML/CSS shell (menus, HUD, inventory)
  three.min.js    Vendored Three.js r128
  GLTFLoader.js   Vendored GLB loader
assets/
  sentinel.glb    Golden Sentinel character (rigged + animated, from Meshy)
```

Headless testing: the repo's flow harness drives the real game (menus → all 3 modes →
combat → chests → crafting → death → restart) against real Three.js in Node with a
stubbed DOM, asserting 30 checks with zero runtime errors.
