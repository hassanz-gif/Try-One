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

const out = shell
  .replace('<!--THREE-->', '<!-- Three.js r128 (inlined) -->\n<script>\n' + three + '\n</script>')
  .replace('<!--GLTFLOADER-->', '<!-- THREE.GLTFLoader r128 (inlined) -->\n<script>\n' + gltf + '\n</script>')
  .replace('<!--GAME-->', '<!-- BLOX FORCES game (inlined) -->\n<script>\n' + game + '\n</script>');

fs.writeFileSync(path.join(root, 'index.html'), out);
console.log('built index.html (' + out.length + ' bytes)');
