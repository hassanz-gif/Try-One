# BLOX FORCES

A **Roblox / Phantom-Forces-inspired wave-survival FPS**, built on **Three.js (r128)**
with everything generated procedurally from primitives — no external models or textures.
Hold a sci-fi ruin against escalating waves of futuristic hostiles.

## Play

Open **`index.html`** in any modern browser — just double-click it. The game itself is
self-contained and runs offline.

**To see your 3D character (the Golden Sentinel), run it from a local server** instead of
double-clicking, because browsers block loading the `.glb` model over `file://`:

```bash
# from the project folder
python3 -m http.server 8000
# then open http://localhost:8000 in your browser
```

If you just double-click `index.html`, the game still plays fine — it simply skips the
character model (you'll see a console note). The local server is only needed to load
`assets/sentinel.glb`.

## Your character — the Golden Sentinel

A rigged, animated GLB (made in Meshy, ~20k tris, 8 clips) is wired in as your character:
- **Menu showcase** — he stands on the deploy screen, idling.
- **First / third person** — press **`V`** to toggle. In first person you see your own
  body/arms; in third person the camera pulls behind him and he walks/runs/idles.

Drop a different model at `assets/sentinel.glb` (rigged, with clips named like
`Idle_02` / `Walking` / `Running` / `Dead`) to swap characters. Scale/facing are tuned by
the `MODEL` constants near the top of the character section in `src/game.js`.

## Controls

| Input | Action |
|------|--------|
| `W` `A` `S` `D` | Move |
| `Shift` | Sprint |
| `Space` | Jump (terrain + structures are climbable) |
| Mouse | Look — or **click + drag** if pointer-lock is blocked |
| Left click | Fire (hold for automatic weapons) |
| Right click | Aim down sights (ADS / scope zoom) |
| `R` | Reload |
| `G` | Throw grenade |
| `T` | Cycle the current weapon's attachment |
| `1`–`5` | SMG · Machine Gun · Shotgun · Sniper · Rocket |
| `V` | Toggle first / third person |
| `H` | Toggle help |
| `Esc` | Release the mouse cursor |

## Gameplay

- **Survive escalating waves.** Each wave adds more, tougher, faster hostiles; a **boss**
  appears every 5th wave. Clear a wave for a score bonus and a grenade resupply.
- **5 weapons**, each with its own feel: **SMG** (fast, low damage), **Machine Gun**
  (big mag, sustained fire), **Shotgun** (close-range pellet spread), **Sniper** (one-shot
  headshots, scope zoom), and **Rocket Launcher** (travel-time projectile with splash).
- **Attachments** — cycle with `T`: Red Dot, Scope, Extended Mag, Compensator. Each tweaks
  spread, zoom, mag size or recoil, and shows on the weapon.
- **Grenades** (`G`) arc and explode for area damage.
- **Sci-fi hostiles** with distinct behaviour: **Crawlers** (basic), **Skitters** (fast
  swarmers), **Brutes** (slow tanks), **Drones** (hovering, plasma-firing flyers), and a
  giant **Boss**.
- **Loot drops** — fallen enemies drop **ammo**, **health**, or **grenades**; walk over to
  grab them. Manage your resources.
- **Aim for the head** for bonus damage and score. Health regenerates a few seconds after
  you stop taking damage. Die and you can redeploy from the game-over screen.

## Map

A large open arena with **heightfield terrain** (rolling hills you walk up and down),
a central stepped landmark, ruined pillars, crashed pods, energy pylons, crystal cover and
crate clusters — fight across the whole space, not a flat box.

## Project layout

This is built from small source files into one self-contained `index.html`:

```
index.html        Generated single-file build you download & play (Three.js + game inlined)
build.js          Assembles index.html from src/ (node build.js)
src/
  game.js         The game (scene, terrain, weapons, enemies, loot, character, loop)
  shell.html      HTML + CSS + HUD markup (with inline-script slots)
  three.min.js    Vendored Three.js r128 (build input, inlined into index.html)
  GLTFLoader.js   Vendored r128 GLB loader (build input, inlined into index.html)
assets/
  sentinel.glb    The Golden Sentinel character model (loaded at runtime, not inlined)
README.md
```

To rebuild after editing `src/`:

```bash
node build.js     # writes a fresh self-contained index.html
```

## Coming next

Local-network **multiplayer** (co-op and PvP via a tiny bundled server you run with one
command) is planned as the next iteration.

## Notes

- Pointer-lock is decoupled from an `entered` flag, with a drag-to-look fallback, so it
  works even inside sandboxed preview iframes.
- Movement uses penetration-aware sliding (you can't get wedged on cover); ground enemies
  wall-follow around obstacles and lingering drones descend, so every wave can be cleared.
- All weapon, enemy and brand names are original, brand-free homages built from primitives.
