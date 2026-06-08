# BLOX FORCES

A **Roblox / Phantom-Forces-inspired wave-survival FPS**, built on **Three.js (r128)**
with everything generated procedurally from primitives — no external models or textures.
Hold a sci-fi ruin against escalating waves of futuristic hostiles.

## Play

Open **`index.html`** in any modern browser (Chrome/Edge/Firefox/Safari) — just
double-click it. It's a **single self-contained file** with Three.js inlined, so there's
nothing to install and it runs fully offline. No web server needed.

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
  game.js         The game (scene, terrain, weapons, enemies, loot, HUD, loop)
  shell.html      HTML + CSS + HUD markup (with <!--THREE--> / <!--GAME--> slots)
  three.min.js    Vendored Three.js r128 (build input, inlined into index.html)
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
