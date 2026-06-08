# BLOX FORCES

A small **Roblox / Phantom-Forces-inspired wave-survival FPS**, built as a single
self-contained HTML file with **Three.js (r128)** — no build step, no external assets.
Everything (the blocky arena, the enemies, the weapons, the HUD) is generated
procedurally from primitives at runtime.

It started life as a first-person lab walkthrough and was reworked into a shooter:
a blocky arena, two weapons, and endless waves of blocky hostiles to hold off.

## Play

Open `index.html` in any modern browser (Chrome/Edge/Firefox/Safari). That's it —
`lib/three.min.js` is vendored locally so it runs fully offline.

## Controls

| Input | Action |
|------|--------|
| `W` `A` `S` `D` | Move |
| `Shift` | Sprint |
| `Space` | Jump (you can hop onto crates) |
| Mouse | Look — or **click + drag** if pointer-lock is blocked (e.g. in an embedded preview) |
| Left click | Fire (hold for the automatic rifle) |
| `R` | Reload |
| `1` / `2` | Switch to Rifle / Pistol |
| `H` | Toggle the controls panel |
| `Esc` | Release the mouse cursor |

## Gameplay

- **Survive escalating waves.** Each wave sends more, tougher, faster hostiles.
- **Aim for the head** — headshots deal bonus damage and are worth more points.
- **Two weapons:** the **AK-BLOX** automatic rifle and the hard-hitting semi-auto
  **M9-BLOX** pistol, each with its own fire rate, magazine, spread and reload.
- **Stay mobile.** Standing still gets you swarmed; kite enemies around the cover.
- Health regenerates a few seconds after you stop taking damage.
- Clear a wave for a bonus; die and you can redeploy from the game-over screen.

## Project layout

```
index.html          The whole game (scene, arena, enemies, weapons, HUD, loop)
lib/three.min.js     Vendored Three.js r128 (UMD build) so the game runs offline
README.md
```

## Notes

- Pointer-lock is decoupled from an `entered` flag, so the game still works (via
  drag-to-look) when pointer-lock is denied inside sandboxed iframes.
- Movement uses penetration-aware sliding so the player can never get wedged
  against cover, and enemies wall-follow around obstacles so a wave can always be
  cleared.
- "AK-BLOX", "M9-BLOX" and the blocky hostiles are original, brand-free homages
  built entirely from boxes.
