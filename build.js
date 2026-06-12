#!/usr/bin/env node
/* Assemble the single self-contained index.html from src/.
 * Inlines Three.js and the game so the result is one double-clickable file. */
const fs = require('fs');
const path = require('path');

const root = __dirname;
const shell = fs.readFileSync(path.join(root, 'src/shell.html'), 'utf8');
const three = fs.readFileSync(path.join(root, 'src/three.min.js'), 'utf8');
const gltf = fs.readFileSync(path.join(root, 'src/GLTFLoader.js'), 'utf8');
const game = fs.readFileSync(path.join(root, 'src/game.js'), 'utf8');

for (const [name, code] of [['three.min.js', three], ['GLTFLoader.js', gltf], ['game.js', game]]) {
  if (/<\/script/i.test(code)) { console.error('ERROR: ' + name + ' contains </script>, would break inlining'); process.exit(1); }
}

// Build stamp: provable on-screen build identity (bottom-left in game + menu).
let stamp = 'build ' + new Date().toISOString().slice(0, 16).replace('T', ' ');
try { stamp += ' · ' + require('child_process').execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch (e) {}

const out = shell
  .replace('<!--THREE-->', '<!-- Three.js r128 (inlined) -->\n<script>\n' + three + '\n</script>')
  .replace('<!--GLTFLOADER-->', '<!-- THREE.GLTFLoader r128 (inlined) -->\n<script>\n' + gltf + '\n</script>')
  .replace('<!--GAME-->', '<!-- BLOX FORCES game (inlined) -->\n<script>\n' + game + '\n</script>')
  .replace('<!--STAMP-->', '<div id="buildTag">' + stamp + '</div>');

fs.writeFileSync(path.join(root, 'index.html'), out);
console.log('built index.html (' + out.length + ' bytes)');
