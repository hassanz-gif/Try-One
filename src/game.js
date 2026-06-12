/* ============================================================================
 * BLOX FORCES — wave-survival FPS (content build)
 * Expects global THREE (r128) and the DOM shell in index.html.
 *
 * Systems: heightfield terrain map + structures, 5 weapons (SMG/LMG/Shotgun/
 * Sniper/Rocket) with ADS + attachments, grenades, projectiles & explosions,
 * sci-fi enemy types (crawler/skitter/brute/drone + boss), loot drops, and
 * difficulty that ramps each wave.
 * ========================================================================== */
(() => {
  "use strict";
  const T = THREE;
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const rand = (a, b) => a + Math.random() * (b - a);
  const smooth = (t) => t * t * (3 - 2 * t);

  // ---------------------------------------------------------------------------
  // Persistence: settings + best records (localStorage)
  // ---------------------------------------------------------------------------
  const SAVE_KEY = 'bloxforces_v1';
  function loadSaveObj() { try { if (typeof localStorage === 'undefined') return {}; return JSON.parse(localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; } }
  const _save = loadSaveObj();
  const settings = Object.assign({ sens: 1, fov: 80, sfx: 1, music: 0.5, invertY: false, flipChar: false }, _save.settings);
  const records = Object.assign({ survival: { score: 0, wave: 0 }, horde: { score: 0, wave: 0 }, rush: { time: 0 } }, _save.records);
  function persist() { try { if (typeof localStorage !== 'undefined') localStorage.setItem(SAVE_KEY, JSON.stringify({ settings, records })); } catch (e) {} }
  function fmtTime(s) { const m = Math.floor(s / 60), r = s - m * 60; return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1); }

  // ---------------------------------------------------------------------------
  // Renderer / scene / camera
  // ---------------------------------------------------------------------------
  const app = document.getElementById('app');
  const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  app.appendChild(renderer.domElement);

  const scene = new T.Scene();
  scene.background = new T.Color(0x9ec9ef);
  scene.fog = new T.Fog(0x9ec9ef, 90, 230);

  const camera = new T.PerspectiveCamera(settings.fov, window.innerWidth / window.innerHeight, 0.05, 600);
  scene.add(camera);

  // ---------------------------------------------------------------------------
  // Lighting
  // ---------------------------------------------------------------------------
  scene.add(new T.HemisphereLight(0xdcefff, 0x35502f, 0.85));
  scene.add(new T.AmbientLight(0xffffff, 0.22));
  // dedicated spotlight to showcase the character on the menu podium
  const showcaseLight = new T.SpotLight(0xffffff, 0, 30, 0.7, 0.5, 1);
  showcaseLight.position.set(4, 9, 36);
  scene.add(showcaseLight); scene.add(showcaseLight.target);
  const sun = new T.DirectionalLight(0xfff2d8, 1.05);
  sun.position.set(-60, 90, 40);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  scene.add(sun); scene.add(sun.target);

  // ---------------------------------------------------------------------------
  // World constants
  // ---------------------------------------------------------------------------
  const WORLD = 170, HALF = WORLD / 2;
  const EYE_H = 2.3, PLAYER_R = 0.6;
  const WALK = 8.5, SPRINT = 14, GRAVITY = 26, JUMP_V = 9.5;

  const obstacles = [];     // {minX,maxX,minZ,maxZ,top,bottom} for movement
  const worldSolids = [];   // meshes that block bullets (terrain + structures)

  function registerObstacle(cx, cz, w, d, top, bottom) {
    obstacles.push({ minX: cx - w/2, maxX: cx + w/2, minZ: cz - d/2, maxZ: cz + d/2, top, bottom: bottom || 0 });
  }

  // ---------------------------------------------------------------------------
  // Heightfield terrain (analytic) + visual mesh
  // ---------------------------------------------------------------------------
  function terrainHeight(x, z) {
    let h = 0;
    h += 2.4 * Math.sin(x * 0.045) * Math.cos(z * 0.041);
    h += 1.3 * Math.sin(x * 0.09 + 1.3) * Math.sin(z * 0.075);
    const bump = (cx, cz, amp, sig) => { const dx = x - cx, dz = z - cz; return amp * Math.exp(-(dx*dx + dz*dz) / (2*sig*sig)); };
    h += bump(-44, -30, 11, 24);
    h += bump( 48,  36, 10, 26);
    h += bump( 34, -48, 7, 18);
    h += bump(-52,  44, 8, 20);
    // flatten a combat arena near the centre
    const dC = Math.hypot(x, z);
    const flat = clamp(1 - dC / 34, 0, 1);
    h *= (1 - 0.78 * flat);
    return h;
  }

  function buildTerrain() {
    const seg = 110;
    const geo = new T.PlaneGeometry(WORLD, WORLD, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = [];
    const cLow = new T.Color(0x5fa345), cMid = new T.Color(0x7d8a5b), cHigh = new T.Color(0x9aa3ad), cSand = new T.Color(0xc9b27e);
    const tmp = new T.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const y = terrainHeight(x, z);
      pos.setY(i, y);
      // colour by height + a sandy ring near the central arena
      const dC = Math.hypot(x, z);
      if (dC < 30 && y < 1.2) tmp.copy(cSand).lerp(cLow, clamp(dC / 30, 0, 1));
      else if (y > 6) tmp.copy(cMid).lerp(cHigh, clamp((y - 6) / 6, 0, 1));
      else tmp.copy(cLow).lerp(cMid, clamp(y / 6, 0, 1));
      colors.push(tmp.r, tmp.g, tmp.b);
    }
    geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    const mesh = new T.Mesh(geo, new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, metalness: 0.0 }));
    mesh.receiveShadow = true;
    scene.add(mesh);
    worldSolids.push(mesh);
    return mesh;
  }

  // ---------------------------------------------------------------------------
  // Structures (placed on the terrain)
  // ---------------------------------------------------------------------------
  function block(x, y, z, w, h, d, color, opts = {}) {
    const mat = new T.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.85, metalness: opts.metal ?? 0.0,
      emissive: opts.emissive ?? 0x000000, emissiveIntensity: opts.emissiveIntensity ?? 1 });
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = opts.cast ?? true; mesh.receiveShadow = opts.receive ?? true;
    scene.add(mesh);
    if (opts.collide ?? true) registerObstacle(x, z, w, d, y + h/2, y - h/2);
    if (opts.solid ?? true) worldSolids.push(mesh);
    return mesh;
  }
  // place a box sitting ON the terrain at (x,z)
  function onGround(x, z, w, h, d, color, opts) {
    const gy = terrainHeight(x, z);
    return block(x, gy + h/2, z, w, h, d, color, opts);
  }

  function buildWorld() {
    // border barrier walls (tall, dark, glowing trim) so you can't leave
    const wallH = 16, wc = 0x2a2f3a;
    [[0,-HALF,WORLD,1.5],[0,HALF,WORLD,1.5],[-HALF,0,1.5,WORLD],[HALF,0,1.5,WORLD]].forEach(([x,z,w,d])=>{
      block(x, wallH/2, z, w, wallH, d, wc, { rough: 0.7, metal: 0.3 });
      block(x, wallH - 0.3, z, w, 0.4, d, 0x18324a, { emissive: 0x1e88e5, emissiveIntensity: 1.4, collide: false });
    });

    const STONE = 0x9aa0a6, STONE2 = 0x7b818a, METAL = 0x3b424c, CRYS = 0x22d3ee, ENERGY = 0x7c3aed;

    // Central ruined arena ring: broken pillars around the flat area
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const r = 24;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const hgt = rand(3, 6.5);
      onGround(x, z, 2, hgt, 2, i % 2 ? STONE : STONE2, { rough: 0.92 });
    }

    // A big central landmark: stepped ziggurat you can fight on top of
    const baseY = terrainHeight(0, 0);
    block(0, baseY + 1, 0, 16, 2, 16, STONE2, { rough: 0.92 });
    block(0, baseY + 3, 0, 11, 2, 11, STONE, { rough: 0.92 });
    block(0, baseY + 5, 0, 6, 2, 6, STONE2, { rough: 0.92 });
    block(0, baseY + 6.6, 0, 2.2, 1.2, 2.2, METAL, { metal: 0.6, rough: 0.4 });
    block(0, baseY + 7.6, 0, 1, 1.4, 1, CRYS, { emissive: CRYS, emissiveIntensity: 1.6, rough: 0.2, metal: 0.4 });
    // ramps/steps up to it (approx with stacked low boxes)
    for (let s = 0; s < 4; s++) block(0, baseY + 0.5 + s*0.5, 9 - s*1.4, 5, 1, 1.5, STONE, { rough: 0.9 });

    // Scattered sci-fi structures: crashed pods, energy pylons, crate clusters, rocks
    const spots = [
      [-40,-18],[42,12],[18,40],[-22,44],[-50,8],[52,-10],[-12,-46],[28,-40],
      [-58,-40],[60,40],[-60,52],[44,-52],[8,58],[-30,18],[36,28],[-18,-30]
    ];
    spots.forEach(([x,z], i) => {
      const kind = i % 5;
      if (kind === 0) { // pod
        onGround(x, z, 4, 3, 4, METAL, { metal: 0.5, rough: 0.4 });
        onGround(x, z, 2, 3.6, 2, 0x141821, { metal: 0.4, emissive: 0xef4444, emissiveIntensity: 0.6 });
      } else if (kind === 1) { // pylon
        onGround(x, z, 1.4, 8, 1.4, METAL, { metal: 0.6, rough: 0.35 });
        onGround(x, z, 0.6, 9.4, 0.6, ENERGY, { emissive: ENERGY, emissiveIntensity: 1.8, collide: false });
      } else if (kind === 2) { // crate cluster
        onGround(x, z, 2.4, 2.4, 2.4, 0x8a6a34, { rough: 0.9 });
        onGround(x+0.2, z+2.5, 2.2, 2, 2.2, 0x9a7638, { rough: 0.9 });
        onGround(x+2.6, z, 2, 1.6, 2, 0x8a6a34, { rough: 0.9 });
      } else if (kind === 3) { // rock spire
        onGround(x, z, 3, rand(4,7), 3, STONE2, { rough: 0.95 });
      } else { // crystal cluster (glowing cover)
        onGround(x, z, 2, 3.4, 2, 0x0b2b33, { rough: 0.5 });
        onGround(x+0.3, z+0.2, 0.8, 5, 0.8, CRYS, { emissive: CRYS, emissiveIntensity: 1.4, collide: false });
      }
    });

    // a couple of low blast walls for cover lines near the arena
    [[-10,12,12,1.4],[12,-12,1.4,12],[14,14,10,1.4]].forEach(([x,z,w,d])=>onGround(x,z,w,2.6,d,STONE,{rough:0.9}));
  }

  buildTerrain();
  buildWorld();

  // ---------------------------------------------------------------------------
  // Collision helpers
  // ---------------------------------------------------------------------------
  function maxPenetration(px, pz, feetY, r) {
    let worst = 0;
    for (const o of obstacles) {
      if (o.top <= feetY + 0.5) continue;
      if (feetY + 0.1 >= o.top) continue;
      const cx = clamp(px, o.minX, o.maxX), cz = clamp(pz, o.minZ, o.maxZ);
      const pen = r - Math.hypot(px - cx, pz - cz);
      if (pen > worst) worst = pen;
    }
    return worst;
  }
  function groundHeight(px, pz, feetY) {
    let h = terrainHeight(px, pz);
    for (const o of obstacles) {
      if (px < o.minX || px > o.maxX || pz < o.minZ || pz > o.maxZ) continue;
      if (o.top <= feetY + 0.55 && o.top > h) h = o.top;
    }
    return h;
  }
  function clampToWorld(p, r) {
    const lim = HALF - 2 - r;
    p.x = clamp(p.x, -lim, lim); p.z = clamp(p.z, -lim, lim);
  }
  function tryMove(pos, dx, dz, feetY, r) {
    const cur = maxPenetration(pos.x, pos.z, feetY, r);
    if (dx) { const nx = pos.x + dx; const pen = maxPenetration(nx, pos.z, feetY, r); if (pen <= 0 || pen < cur) pos.x = nx; }
    if (dz) { const nz = pos.z + dz; const pen = maxPenetration(pos.x, nz, feetY, r); if (pen <= 0 || pen < cur) pos.z = nz; }
  }

  // ---------------------------------------------------------------------------
  // Procedural audio (no assets)
  // ---------------------------------------------------------------------------
  let actx = null;
  function audio() { if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} } return actx; }
  function sfx(type, gain = 1) {
    gain *= settings.sfx; if (gain <= 0.001) return;
    const ac = audio(); if (!ac) return;
    const t = ac.currentTime;
    const noise = (dur, lp, vol) => {
      const n = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 2);
      const s = ac.createBufferSource(); s.buffer = buf;
      const g = ac.createGain(); g.gain.setValueAtTime(vol * gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp;
      s.connect(f); f.connect(g); g.connect(ac.destination); s.start(t); s.stop(t + dur + 0.02);
    };
    const tone = (f0, f1, dur, vol, type2) => {
      const o = ac.createOscillator(); o.type = type2 || 'sine'; const g = ac.createGain();
      o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(vol * gain, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + dur + 0.02);
    };
    if (type === 'smg') noise(0.07, 2600, 0.16);
    else if (type === 'lmg') noise(0.10, 2000, 0.22);
    else if (type === 'shotgun') noise(0.18, 1400, 0.34);
    else if (type === 'sniper') { noise(0.20, 3000, 0.3); tone(180, 40, 0.25, 0.2, 'sawtooth'); }
    else if (type === 'rocket') { tone(120, 50, 0.4, 0.3, 'sawtooth'); noise(0.3, 800, 0.2); }
    else if (type === 'explosion') { tone(90, 30, 0.6, 0.4, 'sawtooth'); noise(0.5, 600, 0.4); }
    else if (type === 'hit') tone(880, null, 0.05, 0.12);
    else if (type === 'kill') tone(440, 880, 0.12, 0.16);
    else if (type === 'hurt') tone(160, null, 0.16, 0.18, 'square');
    else if (type === 'reload') tone(300, null, 0.12, 0.1);
    else if (type === 'pickup') tone(660, 1100, 0.12, 0.14);
    else if (type === 'plasma') tone(700, 300, 0.14, 0.12, 'sawtooth');
    else if (type === 'throw') tone(400, 600, 0.12, 0.1);
  }

  // Ambient music: a slow generative pad (no assets). Volume via settings.music.
  let musicTimer = null, musicGain = null;
  function startMusic() {
    if (musicTimer || typeof setInterval !== 'function') return;
    const ac = audio(); if (!ac) return;
    musicGain = ac.createGain(); musicGain.gain.value = settings.music * 0.06; musicGain.connect(ac.destination);
    const scale = [0, 3, 5, 7, 10, 12, 15];
    musicTimer = setInterval(() => {
      if (!actx || settings.music <= 0.001) return;
      const t = actx.currentTime;
      const semi = scale[(Math.random() * scale.length) | 0];
      const base = 110 * Math.pow(2, semi / 12);
      [[base, 'triangle', 1], [base / 2, 'sine', 0.6]].forEach(([f, ty, v]) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = ty; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
        o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 3.5);
      });
    }, 1800);
  }

  // ---------------------------------------------------------------------------
  // Weapons
  // ---------------------------------------------------------------------------
  // attach options each weapon supports; first is "none"
  const ATTACH = {
    none:   { label: 'Iron Sights', spread: 1, recoil: 1, mag: 1, zoom: 1 },
    reddot: { label: 'Red Dot',     spread: 0.7, recoil: 1, mag: 1, zoom: 1 },
    scope:  { label: 'Scope',       spread: 0.6, recoil: 0.9, mag: 1, zoom: 2.2 },
    extmag: { label: 'Extended Mag', spread: 1, recoil: 1, mag: 1.5, zoom: 1 },
    comp:   { label: 'Compensator', spread: 0.85, recoil: 0.55, mag: 1, zoom: 1 },
  };

  const WEAPONS = {
    smg:    { key: '1', name: 'SMG · BLOX-9', auto: true,  fireDelay: 0.07, magSize: 30, reserve: 240, ammo: 30,
              damage: 16, headMult: 1.8, spread: 0.03, reloadTime: 1.5, range: 130, kick: 0.010, adsFov: 0.85,
              type: 'hitscan', attachs: ['none','reddot','extmag','comp'] },
    lmg:    { key: '2', name: 'MG · BLOX-LMG', auto: true, fireDelay: 0.095, magSize: 75, reserve: 300, ammo: 75,
              damage: 24, headMult: 1.8, spread: 0.035, reloadTime: 3.0, range: 170, kick: 0.014, adsFov: 0.8,
              type: 'hitscan', attachs: ['none','reddot','comp'] },
    shotgun:{ key: '3', name: 'Shotgun · BOOMBLOX', auto: false, fireDelay: 0.8, magSize: 6, reserve: 60, ammo: 6,
              damage: 16, headMult: 1.5, spread: 0.09, pellets: 9, reloadTime: 2.4, range: 45, kick: 0.05, adsFov: 0.9,
              type: 'hitscan', attachs: ['none','reddot'] },
    sniper: { key: '4', name: 'Sniper · LONGBLOX', auto: false, fireDelay: 1.1, magSize: 5, reserve: 40, ammo: 5,
              damage: 150, headMult: 3.0, spread: 0.001, reloadTime: 2.6, range: 400, kick: 0.06, adsFov: 0.35,
              type: 'hitscan', scoped: true, attachs: ['scope','none','extmag'] },
    rocket: { key: '5', name: 'Rocket · BLOXOOKA', auto: false, fireDelay: 1.2, magSize: 3, reserve: 18, ammo: 3,
              damage: 90, headMult: 1, spread: 0.004, reloadTime: 3.2, range: 400, kick: 0.08, adsFov: 0.9,
              type: 'projectile', splashR: 7, splashDmg: 120, projSpeed: 70, attachs: ['none','scope'] },
  };
  const WEAPON_ORDER = ['smg', 'lmg', 'shotgun', 'sniper', 'rocket'];

  // viewmodels
  function buildViewmodel(kind) {
    const w = WEAPONS[kind];
    const g = new T.Group();
    const M = (c, m = 0.3, r = 0.6) => new T.MeshStandardMaterial({ color: c, metalness: m, roughness: r, fog: false });
    const body = M(0x2b2f37), dark = M(0x16181c, 0.4, 0.5), accent = M(0x1e88e5, 0.3, 0.4);
    const box = (mat, w2, h, d, x, y, z) => { const m = new T.Mesh(new T.BoxGeometry(w2, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };
    if (kind === 'smg') { box(body,0.1,0.11,0.5,0,0,-0.3); box(dark,0.07,0.05,0.4,0,0.01,-0.6); box(accent,0.09,0.18,0.1,0,-0.13,-0.05); box(body,0.07,0.13,0.09,0,-0.09,0.06); }
    else if (kind === 'lmg') { box(body,0.13,0.13,0.7,0,0,-0.35); box(dark,0.09,0.07,0.55,0,0.01,-0.75); box(accent,0.13,0.2,0.18,0,-0.15,-0.05); box(body,0.09,0.15,0.1,0,-0.1,0.1); box(dark,0.05,0.05,0.3,0,0.11,-0.3); }
    else if (kind === 'shotgun') { box(body,0.11,0.12,0.8,0,0,-0.4); box(dark,0.1,0.1,0.85,0,-0.06,-0.42); box(body,0.09,0.13,0.34,0,-0.02,0.16); box(body,0.07,0.12,0.09,0,-0.08,0.05); }
    else if (kind === 'sniper') { box(body,0.1,0.11,1.0,0,0,-0.5); box(dark,0.07,0.06,0.7,0,0.005,-0.95); box(dark,0.06,0.08,0.34,0,0.13,-0.35); box(M(0x0a0a0a,0.5,0.3),0.05,0.05,0.12,0,0.13,-0.18); box(accent,0.1,0.2,0.1,0,-0.14,-0.05); box(body,0.09,0.14,0.3,0,-0.02,0.2); }
    else { box(M(0x3a4250,0.4,0.5),0.16,0.16,0.95,0,0,-0.45); box(dark,0.2,0.2,0.18,0,0,-0.95); box(accent,0.06,0.06,0.4,0,0.12,-0.4); box(M(0xef4444,0.3,0.4),0.05,0.05,0.05,0,0,-0.95); }

    // (No stand-in arms — first-person arms need a dedicated arms model; the
    //  full Sentinel body is shown in third person instead.)

    // sight/scope visual driven by attachment
    const sight = box(M(0x101216,0.4,0.4), 0.06, 0.06, 0.16, 0, 0.12, -0.25); sight.visible = false;
    const scope = box(M(0x0a0a0a,0.5,0.3), 0.08, 0.09, 0.36, 0, 0.15, -0.3); scope.visible = false;

    const flash = new T.Mesh(new T.PlaneGeometry(0.6, 0.6),
      new T.MeshBasicMaterial({ color: 0xfff0a0, transparent: true, opacity: 0, fog: false, depthWrite: false, blending: T.AdditiveBlending }));
    flash.position.set(0, 0.02, kind === 'sniper' ? -1.35 : kind === 'rocket' ? -1.0 : -0.95);
    g.add(flash);
    const flashLight = new T.PointLight(0xffd27a, 0, 10); flashLight.position.copy(flash.position); g.add(flashLight);

    g.position.set(0.3, -0.28, -0.6);
    g.userData = { flash, flashLight, sight, scope, restPos: g.position.clone(), adsPos: new T.Vector3(0, -0.13, -0.45), muzzleZ: flash.position.z };
    return g;
  }
  const viewmodels = {};
  WEAPON_ORDER.forEach(k => { const vm = buildViewmodel(k); vm.visible = false; camera.add(vm); viewmodels[k] = vm; });

  // ---------------------------------------------------------------------------
  // Enemy types (sci-fi)
  // ---------------------------------------------------------------------------
  const enemies = [];
  const enemyHitMeshes = [];
  const particles = [];
  const tracers = [];
  const projectiles = [];   // rockets, grenades, plasma
  const pickups = [];

  const ENEMY_TYPES = {
    crawler: { hp: 90,  speed: 3.2, dmg: 9,  scale: 1.0, color: 0x394150, accent: 0xef4444, loot: 0.35, score: 10, fly: false },
    skitter: { hp: 42,  speed: 5.4, dmg: 6,  scale: 0.7, color: 0x2c3340, accent: 0xf97316, loot: 0.22, score: 8,  fly: false },
    brute:   { hp: 340, speed: 2.1, dmg: 24, scale: 1.7, color: 0x2a2f3a, accent: 0xa855f7, loot: 0.6,  score: 32, fly: false, knock: 1 },
    drone:   { hp: 70,  speed: 3.6, dmg: 10, scale: 0.9, color: 0x223047, accent: 0x22d3ee, loot: 0.45, score: 16, fly: true, ranged: true },
    boss:    { hp: 2200, speed: 1.9, dmg: 40, scale: 3.2, color: 0x1a1f2b, accent: 0x22d3ee, loot: 1.0, score: 250, fly: false, knock: 1.5, boss: true },
  };

  function makeEnemy(typeName, wave) {
    const cfg = ENEMY_TYPES[typeName];
    const hpMul = 1 + wave * 0.12, spdMul = clamp(1 + wave * 0.03, 1, 1.7), dmgMul = 1 + wave * 0.06;
    const grp = new T.Group();
    const s = cfg.scale;
    const e = {
      type: typeName, cfg, grp, alive: true, dying: 0, flash: 0, contactCD: 0,
      hp: cfg.hp * hpMul, maxHp: cfg.hp * hpMul, speed: cfg.speed * spdMul, dmg: cfg.dmg * dmgMul,
      fly: cfg.fly, ranged: cfg.ranged, knock: cfg.knock || 0, boss: cfg.boss || false,
      hoverH: cfg.fly ? rand(3.5, 5.5) : 0, shootCD: rand(0.5, 1.6), walkT: rand(0, 6), bob: rand(0, 6),
      hitMeshes: [], extraMeshes: [], score: cfg.score, loot: cfg.loot,
    };
    const bodyMat = new T.MeshStandardMaterial({ color: cfg.color, metalness: 0.55, roughness: 0.45 });
    const accMat = new T.MeshStandardMaterial({ color: cfg.accent, emissive: cfg.accent, emissiveIntensity: 1.3, roughness: 0.3, metalness: 0.4 });
    const part = (geo, mat, x, y, z, name) => {
      const m = new T.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
      m.userData.enemy = e; m.userData.part = name || 'body';
      grp.add(m); if (name !== 'deco') { enemyHitMeshes.push(m); e.hitMeshes.push(m); }
      return m;
    };
    const B = (w, h, d) => new T.BoxGeometry(w, h, d);

    if (typeName === 'drone') {
      // hovering sci-fi drone: core + ring + glowing eye
      part(B(1.1*s, 0.7*s, 1.1*s), bodyMat, 0, 0, 0, 'body');
      part(new T.SphereGeometry(0.28*s, 10, 10), accMat, 0, 0, 0.5*s, 'head'); // eye = head (weak point)
      const ringMat = new T.MeshStandardMaterial({ color: cfg.color, metalness: 0.6, roughness: 0.4 });
      const ring = new T.Mesh(new T.TorusGeometry(0.95*s, 0.1*s, 8, 20), ringMat); ring.rotation.x = Math.PI/2; ring.userData.deco = 1; grp.add(ring); e.extraMeshes.push(ring); e.ring = ring;
      e.grpYBase = e.hoverH;
    } else {
      const sc = s;
      const legL = part(B(0.45*sc, 1.3*sc, 0.5*sc), bodyMat, -0.34*sc, 0.65*sc, 0, 'body');
      const legR = part(B(0.45*sc, 1.3*sc, 0.5*sc), bodyMat,  0.34*sc, 0.65*sc, 0, 'body');
      const torso = part(B(1.3*sc, 1.5*sc, 0.7*sc), bodyMat, 0, 2.05*sc, 0, 'body');
      part(B(1.34*sc, 0.25*sc, 0.74*sc), accMat, 0, 2.4*sc, 0, 'deco'); // chest light
      const armL = part(B(0.4*sc, 1.4*sc, 0.46*sc), bodyMat, -0.9*sc, 2.05*sc, 0, 'body');
      const armR = part(B(0.4*sc, 1.4*sc, 0.46*sc), bodyMat,  0.9*sc, 2.05*sc, 0, 'body');
      const head = part(B(0.95*sc, 0.85*sc, 0.95*sc), bodyMat, 0, 3.2*sc, 0, 'head');
      const eye = new T.Mesh(B(0.6*sc, 0.16*sc, 0.05), accMat); eye.position.set(0, 3.25*sc, 0.49*sc); eye.userData.deco = 1; grp.add(eye); e.extraMeshes.push(eye);
      e.legL = legL; e.legR = legR; e.armL = armL; e.armR = armR; e.torso = torso; e.head = head;
    }

    // spawn at edge ring on the terrain, clear of cover
    let sx, sz, tries = 0;
    do {
      const a = rand(0, Math.PI * 2), r = rand(HALF - 22, HALF - 8);
      sx = Math.cos(a) * r; sz = Math.sin(a) * r; tries++;
    } while (maxPenetration(sx, sz, 0, 1.0) > 0 && tries < 25);
    grp.position.set(sx, terrainHeight(sx, sz) + e.hoverH, sz);
    scene.add(grp);
    enemies.push(e);
    return e;
  }

  function removeEnemy(e) {
    for (const m of e.hitMeshes) { const i = enemyHitMeshes.indexOf(m); if (i >= 0) enemyHitMeshes.splice(i, 1); m.geometry.dispose(); }
    for (const m of e.extraMeshes) m.geometry.dispose();
    scene.remove(e.grp);
    const i = enemies.indexOf(e); if (i >= 0) enemies.splice(i, 1);
  }

  // ---------------------------------------------------------------------------
  // Particles / tracers / explosions
  // ---------------------------------------------------------------------------
  function spawnDebris(pos, color, n, spread = 6) {
    for (let i = 0; i < n; i++) {
      const m = new T.Mesh(new T.BoxGeometry(0.25, 0.25, 0.25), new T.MeshStandardMaterial({ color, roughness: 0.7, emissive: color, emissiveIntensity: 0.3 }));
      m.position.copy(pos); m.position.y += rand(0.5, 2); m.castShadow = true; scene.add(m);
      particles.push({ m, v: new T.Vector3(rand(-spread, spread), rand(3, 8), rand(-spread, spread)), life: rand(0.6, 1.2), grav: true });
    }
  }
  function spawnTracer(from, to, color = 0xfff1a8) {
    const line = new T.Line(new T.BufferGeometry().setFromPoints([from, to]), new T.LineBasicMaterial({ color, transparent: true, opacity: 0.85, fog: false }));
    scene.add(line); tracers.push({ line, life: 0.05 });
  }
  function spawnFlashSprite(point, color, size) {
    const m = new T.Mesh(new T.SphereGeometry(size, 10, 10), new T.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, fog: false, blending: T.AdditiveBlending, depthWrite: false }));
    m.position.copy(point); scene.add(m);
    const light = new T.PointLight(color, 4, size * 6); light.position.copy(point); scene.add(light);
    tracers.push({ line: m, light, life: 0.25, grow: size * 3 });
  }
  function explode(point, radius, damage, fromPlayer) {
    sfx('explosion');
    spawnFlashSprite(point, 0xffae42, radius * 0.5);
    spawnDebris(point, 0xffae42, 12, 10);
    if (fromPlayer) {
      for (const e of enemies) {
        if (!e.alive) continue;
        const d = e.grp.position.distanceTo(point);
        if (d < radius) { damageEnemy(e, damage * (1 - d / radius) + damage * 0.2, false); }
      }
    } else {
      const pp = new T.Vector3(player.x, player.feetY + 1, player.z);
      const d = pp.distanceTo(point);
      if (d < radius) hurtPlayer(damage * (1 - d / radius));
    }
    // self-splash for player rockets if too close
    if (fromPlayer) {
      const pp = new T.Vector3(player.x, player.feetY + 1, player.z);
      const d = pp.distanceTo(point);
      if (d < radius) hurtPlayer(damage * 0.4 * (1 - d / radius));
    }
  }

  // ---------------------------------------------------------------------------
  // Pickups / loot
  // ---------------------------------------------------------------------------
  const PICKUP_TYPES = {
    ammo:    { color: 0x4ade80, label: '+AMMO' },
    health:  { color: 0xef4444, label: '+HEALTH' },
    grenade: { color: 0xfbbf24, label: '+GRENADE' },
  };
  function dropLoot(pos, boss) {
    const roll = () => {
      const r = Math.random();
      return r < 0.5 ? 'ammo' : r < 0.78 ? 'health' : 'grenade';
    };
    const n = boss ? 5 : 1;
    for (let i = 0; i < n; i++) spawnPickup(pos, roll(), i);
  }
  function spawnPickup(pos, kind, i = 0) {
    const cfg = PICKUP_TYPES[kind];
    const grp = new T.Group();
    const m = new T.Mesh(new T.BoxGeometry(0.6, 0.6, 0.6), new T.MeshStandardMaterial({ color: cfg.color, emissive: cfg.color, emissiveIntensity: 0.8, metalness: 0.4, roughness: 0.3 }));
    m.castShadow = true; grp.add(m);
    const light = new T.PointLight(cfg.color, 0.6, 4); light.position.y = 0.5; grp.add(light);
    const x = pos.x + rand(-1, 1) * (i ? 1.5 : 0.3), z = pos.z + rand(-1, 1) * (i ? 1.5 : 0.3);
    grp.position.set(x, terrainHeight(x, z) + 0.8, z);
    scene.add(grp);
    pickups.push({ grp, kind, t: rand(0, 6), life: 25 });
  }
  function collectPickup(p) {
    sfx('pickup');
    if (p.kind === 'ammo') { for (const k of WEAPON_ORDER) ammo[k].reserve = Math.min(ammo[k].reserve + Math.round(WEAPONS[k].magSize * 1.5), WEAPONS[k].reserve * 2); toast('+AMMO', 0x4ade80); }
    else if (p.kind === 'health') { addItem('medkit'); toast('+MEDKIT  (Q to use)', 0xef4444); }   // stored, not auto-used
    else if (p.kind === 'grenade') { state.grenades = Math.min(state.maxGrenades, state.grenades + 1); updateWeaponHUD(); toast('+GRENADE', 0xfbbf24); }
    if (state.invOpen) renderInventory();
    scene.remove(p.grp);
    const i = pickups.indexOf(p); if (i >= 0) pickups.splice(i, 1);
  }
  function useMedkit() { useItem('medkit'); }

  // ---------------------------------------------------------------------------
  // Supply caches (loot chests): walk up, press E, loot pours out
  // ---------------------------------------------------------------------------
  const chests = [];
  let chestTimer = 3, nearChest = null;
  function spawnChest() {
    let x, z, tries = 0;
    do { const a = rand(0, Math.PI * 2), r = rand(12, 58); x = Math.cos(a) * r; z = Math.sin(a) * r; tries++; }
    while (maxPenetration(x, z, 0, 1.4) > 0 && tries < 30);
    const grp = new T.Group();
    const base = new T.Mesh(new T.BoxGeometry(1.6, 1.0, 1.1), new T.MeshStandardMaterial({ color: 0x2c3a4d, metalness: 0.6, roughness: 0.35 }));
    base.position.y = 0.5; base.castShadow = true; base.receiveShadow = true; grp.add(base);
    const lidGeo = new T.BoxGeometry(1.6, 0.35, 1.1); lidGeo.translate(0, 0.175, 0.55);   // hinge at back edge
    const lid = new T.Mesh(lidGeo, new T.MeshStandardMaterial({ color: 0x3a4c63, metalness: 0.6, roughness: 0.3 }));
    lid.position.set(0, 1.0, -0.55); lid.castShadow = true; grp.add(lid);
    const stripe = new T.Mesh(new T.BoxGeometry(1.64, 0.12, 1.14), new T.MeshStandardMaterial({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 1.4, metalness: 0.3, roughness: 0.3 }));
    stripe.position.y = 0.78; grp.add(stripe);
    const beacon = new T.Mesh(new T.CylinderGeometry(0.18, 0.18, 9, 8, 1, true),
      new T.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.35, blending: T.AdditiveBlending, depthWrite: false, fog: false, side: T.DoubleSide }));
    beacon.position.y = 5; grp.add(beacon);
    const light = new T.PointLight(0x22d3ee, 0.9, 9); light.position.y = 1.4; grp.add(light);
    grp.position.set(x, terrainHeight(x, z), z);
    scene.add(grp);
    chests.push({ grp, lid, beacon, light, open: false, openT: 0, t: rand(0, 6) });
  }
  function updateChests(dt) {
    chestTimer -= dt;
    if (chestTimer <= 0 && chests.length < 4) { spawnChest(); chestTimer = 14; }
    let near = null, nd = 1e9;
    for (let i = chests.length - 1; i >= 0; i--) {
      const c = chests[i]; c.t += dt;
      if (!c.open) {
        c.light.intensity = 0.8 + Math.sin(c.t * 3) * 0.35;
        const d = Math.hypot(player.x - c.grp.position.x, player.z - c.grp.position.z);
        if (d < 3.2 && d < nd) { nd = d; near = c; }
      } else {
        c.openT += dt;
        c.lid.rotation.x = -Math.min(1, c.openT * 2.2) * 1.9;
        c.beacon.material.opacity = Math.max(0, 0.35 - c.openT * 0.25);
        c.light.intensity = Math.max(0, 1.2 - c.openT);
        if (c.openT > 2.5) { scene.remove(c.grp); chests.splice(i, 1); }
      }
    }
    nearChest = near;
    if (ui.prompt) ui.prompt.classList.toggle('show', !!near && !state.invOpen);
  }
  function tryOpenChest() {
    const c = nearChest; if (!c || c.open) return;
    c.open = true; c.openT = 0; sfx('pickup', 1.3);
    const rolls = 2 + (Math.random() < 0.35 ? 1 : 0);
    for (let i = 0; i < rolls; i++) {
      const r = Math.random();
      if (r < 0.20) { addItem('ammobox'); killfeedAdd('CACHE · +AMMO BOX'); }
      else if (r < 0.38) { addItem('medkit'); killfeedAdd('CACHE · +MEDKIT'); }
      else if (r < 0.52) { state.grenades = Math.min(state.maxGrenades, state.grenades + 1); killfeedAdd('CACHE · +GRENADE'); }
      else if (r < 0.66) { addItem('armorplate'); killfeedAdd('CACHE · +ARMOR PLATE'); }
      else if (r < 0.82) { const s = Math.round(rand(10, 25)); addItem('scrap', s); killfeedAdd('CACHE · +' + s + ' SCRAP'); }
      else { const res = RESOURCES[(Math.random() * RESOURCES.length) | 0], n = 1 + (Math.random() * 3 | 0); addItem(res, n); killfeedAdd('CACHE · +' + n + ' ' + ITEMS[res].name.toUpperCase()); }
    }
    toast('SUPPLY CACHE OPENED', 0x22d3ee);
    spawnDebris(c.grp.position.clone().setY(c.grp.position.y + 1), 0x22d3ee, 6, 4);
    updateWeaponHUD(); updateHealthHUD(); if (state.invOpen) renderInventory();
  }

  // ---------------------------------------------------------------------------
  // Crafting (light): turn scrap into supplies, from the inventory screen
  // ---------------------------------------------------------------------------
  const CRAFTS = {
    medkit:  { cost: 15, label: 'Medkit' },
    grenade: { cost: 10, label: 'Grenade' },
    armor:   { cost: 20, label: 'Armor +25' },
    ammo:    { cost: 10, label: 'Ammo refill' },
  };
  function craft(kind) {
    const c = CRAFTS[kind]; if (!c || itemCount('scrap') < c.cost) return false;
    state.items.scrap -= c.cost;
    if (kind === 'medkit') addItem('medkit');
    else if (kind === 'grenade') state.grenades = Math.min(state.maxGrenades, state.grenades + 1);
    else if (kind === 'armor') addArmor(25);
    else WEAPON_ORDER.forEach(k => ammo[k].reserve = Math.min(ammo[k].reserve + WEAPONS[k].magSize, WEAPONS[k].reserve * 2));
    sfx('reload'); toast('Crafted: ' + c.label, 0x4ade80);
    updateWeaponHUD(); updateHealthHUD(); if (state.invOpen) renderInventory();
    return true;
  }

  // ---------------------------------------------------------------------------
  // Item system — a 64-slot inventory of stackable categories
  // ---------------------------------------------------------------------------
  const ITEMS = {
    medkit:     { name: 'Medkit',      color: '#ef4444', use: true, hint: 'click / Q · +45 HP' },
    armorplate: { name: 'Armor Plate', color: '#3b82f6', use: true, hint: 'click · +25 armor' },
    ammobox:    { name: 'Ammo Box',    color: '#4ade80', use: true, hint: 'click · refill ammo' },
    scrap:      { name: 'Scrap',       color: '#9fb0c4', hint: 'craft material' },
    alloy:      { name: 'Alloy',       color: '#b08d57', hint: 'material' },
    cell:       { name: 'Power Cell',  color: '#22d3ee', hint: 'material' },
    circuit:    { name: 'Circuit',     color: '#34d399', hint: 'material' },
    core:       { name: 'Data Core',   color: '#a855f7', hint: 'rare material' },
    optic:      { name: 'Optic Lens',  color: '#60a5fa', hint: 'material' },
    polymer:    { name: 'Polymer',     color: '#e879f9', hint: 'material' },
    plate:      { name: 'Steel Plate', color: '#94a3b8', hint: 'material' },
    fuel:       { name: 'Fuel Rod',    color: '#f59e0b', hint: 'material' },
  };
  const ITEM_ORDER = ['medkit', 'armorplate', 'ammobox', 'scrap', 'alloy', 'cell', 'circuit', 'core', 'optic', 'polymer', 'plate', 'fuel'];
  const RESOURCES = ['alloy', 'cell', 'circuit', 'core', 'optic', 'polymer', 'plate', 'fuel'];
  const INV_SLOTS = 64;
  function itemCount(id) { return state.items[id] || 0; }
  function addItem(id, n = 1) { state.items[id] = itemCount(id) + n; if (state.invOpen) renderInventory(); }
  function useItem(id) {
    if (itemCount(id) <= 0) return;
    if (id === 'medkit') { if (state.hp >= state.maxHp) return; state.hp = Math.min(state.maxHp, state.hp + 45); updateHealthHUD(); toast('+45 HP', 0x4ade80); }
    else if (id === 'armorplate') { if (state.armor >= state.maxArmor) return; addArmor(25); toast('+25 ARMOR', 0x60a5fa); }
    else if (id === 'ammobox') { WEAPON_ORDER.forEach(k => ammo[k].reserve = Math.min(ammo[k].reserve + WEAPONS[k].magSize * 2, WEAPONS[k].reserve * 2)); updateWeaponHUD(); toast('AMMO REFILLED', 0x4ade80); }
    else return;
    state.items[id]--; sfx('pickup'); if (state.invOpen) renderInventory();
  }
  function gridSlots() {
    const slots = [];
    if (state.grenades > 0) slots.push({ id: 'grenade', name: 'Grenade', color: '#fbbf24', count: state.grenades, hint: 'G to throw' });
    for (const id of ITEM_ORDER) { const n = itemCount(id); if (n > 0) slots.push({ id, name: ITEMS[id].name, color: ITEMS[id].color, count: n, hint: ITEMS[id].hint, use: ITEMS[id].use }); }
    return slots;
  }

  // ---------------------------------------------------------------------------
  // Inventory (Rust-styled): loadout belt, attachments, 64-slot item grid
  // ---------------------------------------------------------------------------
  function toggleInventory(open) {
    const want = open === undefined ? !state.invOpen : open;
    if (want === state.invOpen) return;
    state.invOpen = want;
    if (want) {
      ui.inventory.classList.add('show'); renderInventory();
      state.firingHeld = false; if (document.pointerLockElement) document.exitPointerLock();
    } else {
      ui.inventory.classList.remove('show');
      if (state.phase === 'playing') requestPointer();
      renderer.domElement.focus();
    }
  }
  function renderInventory() {
    if (!ui.inventory) return;
    const W = (k, i) => { const w = WEAPONS[k], a = ammo[k]; return '<div class="wcard' + (k === state.weapon ? ' eq' : '') + '" data-w="' + k + '"><div class="wc-top"><span class="wc-key">' + (i + 1) + '</span><span class="wc-name">' + w.name.split(' · ')[0] + '</span></div><div class="wc-ammo">' + a.mag + ' / ' + a.reserve + '</div><div class="wc-att">' + ATTACH[a.attach].label + '</div></div>'; };
    const cw = WEAPONS[state.weapon], ca = ammo[state.weapon];
    const slots = gridSlots(), scrap = itemCount('scrap');
    let grid = '';
    for (let i = 0; i < INV_SLOTS; i++) {
      const it = slots[i];
      grid += it
        ? '<div class="slot' + (it.use ? ' use' : '') + '" data-use="' + (it.use ? it.id : '') + '" title="' + it.name + (it.hint ? ' — ' + it.hint : '') + '"><span class="slot-ic" style="background:' + it.color + '"></span><span class="slot-n">' + it.name + '</span><span class="slot-x">' + it.count + '</span></div>'
        : '<div class="slot empty"></div>';
    }
    let h = '<div class="inv-card"><div class="inv-head"><span>INVENTORY</span><span class="inv-x">' + slots.length + ' / ' + INV_SLOTS + ' slots · TAB / I / ESC to close</span></div><div class="inv-cols">';
    // operative
    h += '<div class="inv-col"><div class="inv-title">Operative</div><div class="op-name">' + CHARACTERS[state.character].name.toUpperCase() + '</div><div class="op-rank">' + MODES[state.mode].name.toUpperCase() + ' — ' + (state.mode === 'rush' ? fmtTime(state.modeTime) : 'WAVE ' + state.wave) + '</div><div class="op-stats">' +
      '<div><span>Health</span><b>' + Math.max(0, Math.round(state.hp)) + ' / ' + state.maxHp + '</b></div>' +
      '<div><span>Armor</span><b>' + Math.round(state.armor) + ' / ' + state.maxArmor + '</b></div>' +
      '<div><span>Kills</span><b>' + state.kills + '</b></div>' +
      '<div><span>Score</span><b>' + state.score + '</b></div>' +
      '<div><span>Scrap</span><b>' + scrap + '</b></div>' +
      '<div><span>Grenades</span><b>' + state.grenades + '</b></div></div>' +
      '<div class="inv-sub">Quick craft — ' + scrap + ' scrap</div><div class="atts">' +
      Object.keys(CRAFTS).map(k => { const c = CRAFTS[k], can = scrap >= c.cost; return '<div class="att craftbtn' + (can ? '' : ' off') + '" data-craft="' + k + '">' + c.label + ' · ' + c.cost + '</div>'; }).join('') + '</div></div>';
    // 64-slot item grid
    h += '<div class="inv-col"><div class="inv-title">Items — carry up to ' + INV_SLOTS + '</div><div class="invgrid">' + grid + '</div></div>';
    // arsenal + attachments
    h += '<div class="inv-col"><div class="inv-title">Arsenal</div><div class="arsenal">' + WEAPON_ORDER.map((k, i) => W(k, i)).join('') + '</div>';
    h += '<div class="inv-sub">Attachments — ' + cw.name.split(' · ')[0] + '</div><div class="atts">' + cw.attachs.map(at => '<div class="att' + (at === ca.attach ? ' on' : '') + '" data-att="' + at + '">' + ATTACH[at].label + '</div>').join('') + '</div></div>';
    h += '</div></div>';
    ui.inventory.innerHTML = h;
    ui.inventory.querySelectorAll('.wcard').forEach(c => c.addEventListener('click', () => { switchWeapon(c.dataset.w); renderInventory(); }));
    ui.inventory.querySelectorAll('.att:not(.craftbtn)').forEach(c => c.addEventListener('click', () => { setAttachment(c.dataset.att); renderInventory(); }));
    ui.inventory.querySelectorAll('.craftbtn').forEach(c => c.addEventListener('click', () => craft(c.dataset.craft)));
    ui.inventory.querySelectorAll('.slot.use').forEach(c => c.addEventListener('click', () => useItem(c.dataset.use)));
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------
  const state = {
    phase: 'menu', hp: 100, maxHp: 100, lastHurt: -10,
    score: 0, wave: 0, toSpawn: 0, spawnTimer: 0, spawnQueue: [], waveActive: false, waveDelay: 0,
    weapon: 'smg', recoil: 0, recoilV: 0, fireTimer: 0, firingHeld: false, semiLatch: false,
    reloading: false, reloadTimer: 0, ads: false, adsAmt: 0, bob: 0,
    grenades: 3, maxGrenades: 5, nadeCD: 0, pressure: 0, view: 'first', moving: false, swayX: 0, swayY: 0,
    items: { medkit: 1 }, invOpen: false, kills: 0,
    mode: 'survival', character: 'sentinel', paused: false, modeTime: 0, spawned: 0, speedMul: 1,
    armor: 0, maxArmor: 100,
  };

  // ---------------------------------------------------------------------------
  // Gamemodes & playable characters
  // ---------------------------------------------------------------------------
  const MODES = {
    survival: { name: 'Wave Survival', desc: 'Escalating waves, boss every 5th.' },
    horde:    { name: 'Endless Horde', desc: 'Continuous swarm, pure score chase.' },
    rush:     { name: 'Target Rush', desc: 'Eliminate the target count, fast.', target: 30 },
  };
  const CHARACTERS = {
    sentinel: { name: 'Golden Sentinel', hp: 100, speed: 1.0 },
    trooper:  { name: 'Blox Trooper',    hp: 80,  speed: 1.18, colors: { skin: 0xffd33a, shirt: 0x3b82f6, pants: 0x2f9e44 } },
    vanguard: { name: 'Night Vanguard',  hp: 135, speed: 0.88, colors: { skin: 0x8a93a5, shirt: 0x23272f, pants: 0x111318 } },
  };
  const ammo = {};
  WEAPON_ORDER.forEach(k => ammo[k] = { mag: WEAPONS[k].magSize, reserve: WEAPONS[k].reserve, attach: WEAPONS[k].attachs[0] });

  let yaw = 0, pitch = 0;
  const player = { x: 0, z: 26, feetY: 0, vy: 0, grounded: true };

  // ---------------------------------------------------------------------------
  // HUD
  // ---------------------------------------------------------------------------
  const el = (id) => document.getElementById(id);
  const ui = {};
  ['over','overStats','hud','wave','score','enemiesLeft','healthFill','healthNum',
   'weaponName','mag','reserve','reloadTag','attachName','grenades','weaponList',
   'hitmarker','hurt','banner','killfeed','toast','scope','help','inventory','invBtn','viewBtn','armorFill','armorNum','prompt'].forEach(id => ui[id] = el(id));
  function setView(v) {
    state.view = v;
    if (ui.viewBtn) ui.viewBtn.innerHTML = (v === 'third' ? '◉ 3RD PERSON' : '◉ 1ST PERSON') + ' <kbd>V</kbd>';
    toast(v === 'third' ? 'Third person' : 'First person', 0x60a5fa);
  }

  function buildWeaponList() {
    ui.weaponList.innerHTML = '';
    WEAPON_ORDER.forEach(k => {
      const d = document.createElement('div'); d.className = 'wrow'; d.dataset.k = k;
      d.innerHTML = '<span class="wkey">' + WEAPONS[k].key + '</span><span class="wn">' + WEAPONS[k].name.split(' · ')[0] + '</span>';
      ui.weaponList.appendChild(d);
    });
  }
  function updateWeaponHUD() {
    const a = ammo[state.weapon], w = WEAPONS[state.weapon];
    ui.weaponName.textContent = w.name;
    ui.mag.textContent = a.mag; ui.reserve.textContent = a.reserve;
    ui.attachName.textContent = ATTACH[a.attach].label;
    ui.grenades.textContent = state.grenades;
    ui.reloadTag.textContent = state.reloading ? 'RELOADING…' : (a.mag === 0 ? 'PRESS R' : '');
    [...ui.weaponList.children].forEach(c => c.classList.toggle('active', c.dataset.k === state.weapon));
  }
  function updateHealthHUD() {
    const pct = clamp(state.hp / state.maxHp, 0, 1) * 100;
    ui.healthFill.style.width = pct + '%';
    ui.healthFill.style.background = pct > 50 ? 'linear-gradient(90deg,#22c55e,#4ade80)' : pct > 25 ? 'linear-gradient(90deg,#f59e0b,#fbbf24)' : 'linear-gradient(90deg,#b91c1c,#ef4444)';
    ui.healthNum.textContent = Math.max(0, Math.round(state.hp));
    if (ui.armorFill) ui.armorFill.style.width = clamp(state.armor / state.maxArmor, 0, 1) * 100 + '%';
    if (ui.armorNum) ui.armorNum.textContent = 'Armor ' + Math.round(state.armor);
    ui.hurt.classList.toggle('lowhp', state.phase === 'playing' && state.hp > 0 && state.hp < state.maxHp * 0.3);
  }
  function addArmor(n) { state.armor = clamp(state.armor + n, 0, state.maxArmor); updateHealthHUD(); }
  function updateTopHUD() {
    if (state.mode === 'horde') ui.wave.textContent = 'HORDE · THREAT ' + Math.max(1, state.wave);
    else if (state.mode === 'rush') ui.wave.textContent = 'RUSH ' + Math.min(state.kills, MODES.rush.target) + ' / ' + MODES.rush.target + ' · ' + fmtTime(state.modeTime);
    else ui.wave.textContent = 'WAVE ' + state.wave;
    ui.score.textContent = state.score;
    const left = enemies.filter(e => e.alive).length + state.toSpawn;
    ui.enemiesLeft.textContent = left + (left === 1 ? ' hostile' : ' hostiles');
  }
  let hitTimer = 0;
  function showHitmarker(kill) { ui.hitmarker.classList.toggle('kill', kill); ui.hitmarker.style.opacity = '1'; hitTimer = 0.18; }
  function killfeedAdd(txt) { const d = document.createElement('div'); d.innerHTML = txt; ui.killfeed.prepend(d); setTimeout(() => d.remove(), 2600); while (ui.killfeed.children.length > 6) ui.killfeed.lastChild.remove(); }
  let toastTimer = 0;
  function toast(txt, color) { ui.toast.textContent = txt; ui.toast.style.color = '#' + (color || 0xffffff).toString(16).padStart(6, '0'); ui.toast.style.opacity = '1'; toastTimer = 1.1; }
  function banner(big, small) { ui.banner.innerHTML = big + (small ? '<span class="small">' + small + '</span>' : ''); ui.banner.classList.add('show'); clearTimeout(banner._t); banner._t = setTimeout(() => ui.banner.classList.remove('show'), 1900); }

  // ---------------------------------------------------------------------------
  // Waves (difficulty ramps)
  // ---------------------------------------------------------------------------
  function rollType(n) {
    const r = Math.random();
    if (n <= 2) return r < 0.55 ? 'crawler' : 'skitter';
    if (n <= 4) return r < 0.4 ? 'crawler' : r < 0.7 ? 'skitter' : r < 0.88 ? 'brute' : 'drone';
    return r < 0.3 ? 'crawler' : r < 0.55 ? 'skitter' : r < 0.75 ? 'drone' : 'brute';
  }
  function buildSpawnQueue(n) {
    const q = [];
    const count = 5 + Math.floor(n * 2.2);
    for (let i = 0; i < count; i++) q.push(rollType(n));
    if (n % 5 === 0) q.push('boss');         // boss every 5th wave
    if (n % 5 === 0 && n >= 10) q.push('boss');
    return q;
  }
  const MAX_CONCURRENT = () => clamp(8 + state.wave, 8, 20);
  function startWave(n) {
    state.wave = n;
    state.spawnQueue = buildSpawnQueue(n);
    state.toSpawn = state.spawnQueue.length;
    state.spawnTimer = 0; state.waveActive = true;
    banner('WAVE ' + n, state.toSpawn + ' HOSTILES' + (n % 5 === 0 ? ' · ⚠ BOSS' : ''));
    updateTopHUD();
  }
  function updateWaves(dt) {
    // --- Endless Horde: continuous spawning, difficulty tiers by time ---
    if (state.mode === 'horde') {
      state.modeTime += dt;
      const tier = 1 + Math.floor(state.modeTime / 40);
      if (tier !== state.wave) { state.wave = tier; if (tier > 1) banner('THREAT LEVEL ' + tier, 'the swarm intensifies'); updateTopHUD(); }
      state.spawnTimer -= dt;
      const alive = enemies.filter(e => e.alive).length;
      const cap = clamp(6 + tier * 2, 6, 22);
      if (state.spawnTimer <= 0 && alive < cap) {
        makeEnemy(Math.random() < 0.04 && tier >= 3 ? 'boss' : rollType(tier), tier);
        state.spawnTimer = Math.max(0.3, 1.1 - tier * 0.05);
        updateTopHUD();
      }
      state.pressure = 0;
      return;
    }
    // --- Target Rush: fixed kill target, beat the clock ---
    if (state.mode === 'rush') {
      state.modeTime += dt;
      const target = MODES.rush.target;
      if (state.kills >= target) { victory(); return; }
      const alive = enemies.filter(e => e.alive).length;
      if (state.spawned < target + 8 && alive < 8) {
        state.spawnTimer -= dt;
        if (state.spawnTimer <= 0) {
          makeEnemy(rollType(2 + Math.floor(state.kills / 8)), 2);
          state.spawned++; state.spawnTimer = 0.5;
        }
      }
      // stragglers close in so the clock can always be beaten
      state.pressure = (alive > 0 && alive <= 3) ? Math.min(1, state.pressure + dt * 0.1) : 0;
      updateTopHUD();   // live timer
      return;
    }
    // --- Wave Survival ---
    // "cleanup pressure": when a wave's spawns are exhausted and only a handful
    // of stragglers remain, ramp pressure so evasive flyers close in — this
    // guarantees a wave can always be finished.
    const remaining = enemies.filter(e => e.alive).length;
    if (state.waveActive && state.toSpawn === 0 && remaining > 0 && remaining <= 3) state.pressure = Math.min(1, state.pressure + dt * 0.06);
    else state.pressure = 0;
    if (!state.waveActive) { state.waveDelay -= dt; if (state.waveDelay <= 0) startWave(state.wave + 1); return; }
    if (state.toSpawn > 0) {
      state.spawnTimer -= dt;
      if (state.spawnTimer <= 0 && enemies.filter(e => e.alive).length < MAX_CONCURRENT()) {
        const t = state.spawnQueue.pop(); makeEnemy(t, state.wave); state.toSpawn--;
        state.spawnTimer = Math.max(0.3, 1.3 - state.wave * 0.05);
        updateTopHUD();
      }
    } else if (enemies.filter(e => e.alive).length === 0) {
      state.waveActive = false; state.waveDelay = 5.0;
      const bonus = 60 + state.wave * 15; state.score += bonus;
      state.grenades = Math.min(state.maxGrenades, state.grenades + 1);
      banner('WAVE ' + state.wave + ' CLEARED', '+' + bonus + ' · resupplying · next in 5s');
      updateTopHUD(); updateWeaponHUD();
    }
  }

  // ---------------------------------------------------------------------------
  // Shooting
  // ---------------------------------------------------------------------------
  const raycaster = new T.Raycaster();
  const tmpDir = new T.Vector3(), tmpOrigin = new T.Vector3();

  function effectiveSpread(w, a) {
    let s = w.spread * ATTACH[a.attach].spread;
    if (state.ads) s *= 0.35;
    if (!player.grounded) s += 0.04;
    return s;
  }
  function fire() {
    if (state.phase !== 'playing' || state.reloading) return;
    const w = WEAPONS[state.weapon], a = ammo[state.weapon];
    if (a.mag <= 0) { sfx('reload'); startReload(); return; }
    a.mag--; state.fireTimer = w.fireDelay;
    sfx(state.weapon);
    state.recoilV += w.kick * ATTACH[a.attach].recoil;
    const vm = viewmodels[state.weapon];
    vm.userData.flash.material.opacity = 0.95; vm.userData.flash.rotation.z = Math.random() * Math.PI; vm.userData.flash.scale.setScalar(rand(0.7, 1.3));
    vm.userData.flashLight.intensity = 5;
    vm.userData.kick = 1;

    camera.getWorldPosition(tmpOrigin);
    if (w.type === 'projectile') { fireRocket(w); return; }

    const pellets = w.pellets || 1;
    for (let p = 0; p < pellets; p++) {
      camera.getWorldDirection(tmpDir);
      const sp = effectiveSpread(w, a);
      tmpDir.x += rand(-sp, sp); tmpDir.y += rand(-sp, sp); tmpDir.z += rand(-sp, sp); tmpDir.normalize();
      raycaster.set(tmpOrigin, tmpDir); raycaster.far = w.range;
      const hits = raycaster.intersectObjects(enemyHitMeshes.concat(worldSolids), false);
      let end = tmpOrigin.clone().addScaledVector(tmpDir, w.range);
      if (hits.length) {
        const h = hits[0]; end = h.point.clone();
        const e = h.object.userData.enemy;
        if (e && e.alive) { const head = h.object.userData.part === 'head'; damageEnemy(e, w.damage * (head ? w.headMult : 1), head); spawnDebris(h.point, e.cfg.accent, 2, 4); }
        else { spawnDebris(h.point, 0xcfd3d8, 2, 3); }
      }
      spawnTracer(muzzleWorld(vm), end);
    }
  }
  function fireRocket(w) {
    const vm = viewmodels[state.weapon];
    camera.getWorldDirection(tmpDir); tmpDir.normalize();
    const start = muzzleWorld(vm);
    const mesh = new T.Group();
    const body = new T.Mesh(new T.CylinderGeometry(0.12, 0.12, 0.6, 8), new T.MeshStandardMaterial({ color: 0x444c58, metalness: 0.5, roughness: 0.4 }));
    body.rotation.x = Math.PI / 2; mesh.add(body);
    const tip = new T.Mesh(new T.ConeGeometry(0.12, 0.25, 8), new T.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.6 })); tip.rotation.x = Math.PI / 2; tip.position.z = -0.4; mesh.add(tip);
    const glow = new T.PointLight(0xffae42, 2, 8); mesh.add(glow);
    mesh.position.copy(start); scene.add(mesh);
    projectiles.push({ mesh, vel: tmpDir.clone().multiplyScalar(w.projSpeed), life: 5, kind: 'rocket', owner: 'player', splashR: w.splashR, splashDmg: w.splashDmg, prev: start.clone() });
  }
  function muzzleWorld(vm) { return new T.Vector3(vm.position.x, vm.position.y, vm.userData.muzzleZ).applyMatrix4(camera.matrixWorld); }

  function damageEnemy(e, dmg, head) {
    e.hp -= dmg; e.flash = 0.1;
    if (e.knock) {} // brutes resist knockback (placeholder)
    if (e.hp <= 0) {
      e.alive = false; e.dying = e.boss ? 1.2 : 0.6;
      for (const m of e.hitMeshes) { const i = enemyHitMeshes.indexOf(m); if (i >= 0) enemyHitMeshes.splice(i, 1); }
      state.score += head ? Math.round(e.score * 1.6) : e.score; state.kills++;
      const scrap = e.boss ? 25 : (Math.random() < 0.3 ? Math.round(rand(2, 6)) : 0);
      if (scrap) { addItem('scrap', scrap); if (Math.random() < 0.12) addItem(RESOURCES[(Math.random() * RESOURCES.length) | 0]); }
      sfx('kill'); showHitmarker(true);
      killfeedAdd((head ? '<b>HEADSHOT</b> ' : '') + e.type.toUpperCase() + ' · +' + (head ? Math.round(e.score * 1.6) : e.score) + (scrap ? ' · +' + scrap + ' scrap' : ''));
      spawnDebris(e.grp.position, e.cfg.accent, e.boss ? 24 : 8, 8);
      if (e.boss) spawnFlashSprite(e.grp.position.clone().setY(e.grp.position.y + 1), e.cfg.accent, 3);
      if (Math.random() < e.loot || e.boss) dropLoot(e.grp.position, e.boss);
      updateTopHUD();
    } else { sfx('hit'); showHitmarker(false); }
  }

  // ---------------------------------------------------------------------------
  // Grenades
  // ---------------------------------------------------------------------------
  function throwGrenade() {
    if (state.phase !== 'playing' || state.grenades <= 0 || state.nadeCD > 0) return;
    state.grenades--; state.nadeCD = 0.6; updateWeaponHUD(); sfx('throw');
    camera.getWorldDirection(tmpDir); camera.getWorldPosition(tmpOrigin);
    const mesh = new T.Mesh(new T.IcosahedronGeometry(0.22, 0), new T.MeshStandardMaterial({ color: 0x2f7d32, metalness: 0.3, roughness: 0.6, emissive: 0xfbbf24, emissiveIntensity: 0.2 }));
    mesh.position.copy(tmpOrigin).addScaledVector(tmpDir, 0.8); mesh.castShadow = true; scene.add(mesh);
    const vel = tmpDir.clone().multiplyScalar(24); vel.y += 5;
    projectiles.push({ mesh, vel, life: 1.6, kind: 'grenade', owner: 'player', splashR: 7, splashDmg: 110, grav: true, bounce: 0.4 });
  }

  // ---------------------------------------------------------------------------
  // Reload / weapon switch / ADS
  // ---------------------------------------------------------------------------
  function magSizeOf(k) { return Math.round(WEAPONS[k].magSize * ATTACH[ammo[k].attach].mag); }
  function startReload() {
    const a = ammo[state.weapon], w = WEAPONS[state.weapon];
    if (state.reloading || a.mag >= magSizeOf(state.weapon) || a.reserve <= 0) return;
    state.reloading = true; state.reloadTimer = w.reloadTime; sfx('reload'); updateWeaponHUD();
  }
  function finishReload() {
    const a = ammo[state.weapon]; const need = magSizeOf(state.weapon) - a.mag; const take = Math.min(need, a.reserve);
    a.mag += take; a.reserve -= take; state.reloading = false; updateWeaponHUD();
  }
  function switchWeapon(k) {
    if (k === state.weapon || state.reloading) return;
    viewmodels[state.weapon].visible = false; state.weapon = k; viewmodels[k].visible = true;
    state.fireTimer = 0.15; state.ads = false; updateWeaponHUD(); applyAttachVisual();
  }
  function cycleAttachment() {
    const w = WEAPONS[state.weapon], a = ammo[state.weapon];
    const i = w.attachs.indexOf(a.attach); a.attach = w.attachs[(i + 1) % w.attachs.length];
    a.mag = Math.min(a.mag, magSizeOf(state.weapon));
    toast('Attachment: ' + ATTACH[a.attach].label, 0x60a5fa); updateWeaponHUD(); applyAttachVisual();
  }
  function setAttachment(at) {
    const w = WEAPONS[state.weapon], a = ammo[state.weapon];
    if (!w.attachs.includes(at) || a.attach === at) return;
    a.attach = at; a.mag = Math.min(a.mag, magSizeOf(state.weapon));
    updateWeaponHUD(); applyAttachVisual();
  }
  function applyAttachVisual() {
    const vm = viewmodels[state.weapon], a = ammo[state.weapon];
    vm.userData.sight.visible = a.attach === 'reddot';
    vm.userData.scope.visible = a.attach === 'scope';
  }
  function adsZoom() {
    const w = WEAPONS[state.weapon], a = ammo[state.weapon];
    return w.adsFov / ATTACH[a.attach].zoom; // smaller = more zoom
  }

  // ---------------------------------------------------------------------------
  // Player damage / death / reset
  // ---------------------------------------------------------------------------
  function hurtPlayer(dmg) {
    if (state.phase !== 'playing') return;
    const absorb = Math.min(state.armor, dmg * 0.6);   // armor soaks 60% until depleted
    state.armor -= absorb;
    state.hp -= (dmg - absorb); state.lastHurt = clock.elapsedTime; sfx('hurt');
    ui.hurt.style.boxShadow = 'inset 0 0 200px 50px rgba(220,30,30,0.6)';
    clearTimeout(hurtPlayer._t); hurtPlayer._t = setTimeout(() => { ui.hurt.style.boxShadow = 'inset 0 0 200px 30px rgba(220,30,30,0)'; }, 130);
    updateHealthHUD();
    if (state.hp <= 0) gameOver();
  }
  function gameOver() {
    state.phase = 'dead'; ui.hud.classList.remove('on');
    if (state.invOpen) toggleInventory(false);
    // record bests (score/wave modes only; rush records on victory)
    let nb = false;
    const rec = records[state.mode];
    if (rec && state.mode !== 'rush') {
      if (state.score > rec.score) { rec.score = state.score; nb = true; }
      if (state.wave > rec.wave) { rec.wave = state.wave; nb = true; }
      if (nb) persist();
    }
    const eb = el('overEyebrow'), ti = el('overTitle');
    if (eb) { eb.textContent = 'You were overrun'; eb.style.color = 'var(--danger)'; }
    if (ti) { ti.textContent = 'GAME OVER'; ti.style.color = 'var(--danger)'; }
    ui.overStats.innerHTML = 'Final score <b>' + state.score + '</b>' + (nb ? ' — <b style="color:var(--warn)">NEW BEST</b>' : '') +
      '<br>' + (state.mode === 'rush' ? ('Kills <b>' + state.kills + ' / ' + MODES.rush.target + '</b>') : ('Reached <b>Wave ' + state.wave + '</b>')) +
      '<br><span style="color:var(--dim);font-size:12px">' + MODES[state.mode].name + ' · ' + CHARACTERS[state.character].name + '</span>';
    ui.over.classList.add('show'); ui.scope.classList.remove('show');
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function victory() {
    state.phase = 'dead'; ui.hud.classList.remove('on');
    if (state.invOpen) toggleInventory(false);
    const t = state.modeTime;
    const nb = !records.rush.time || t < records.rush.time;
    if (nb) { records.rush.time = t; persist(); }
    const eb = el('overEyebrow'), ti = el('overTitle');
    if (eb) { eb.textContent = 'Mission complete'; eb.style.color = 'var(--accent)'; }
    if (ti) { ti.textContent = 'RUSH CLEARED'; ti.style.color = 'var(--accent)'; }
    ui.overStats.innerHTML = 'Time <b>' + fmtTime(t) + '</b>' + (nb ? ' — <b style="color:var(--warn)">NEW BEST</b>' : '') +
      '<br>Score <b>' + state.score + '</b><br><span style="color:var(--dim);font-size:12px">' + MODES.rush.name + ' · ' + CHARACTERS[state.character].name + '</span>';
    ui.over.classList.add('show'); ui.scope.classList.remove('show');
    sfx('kill', 1.5);
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function resetGame() {
    while (enemies.length) removeEnemy(enemies[0]); enemyHitMeshes.length = 0;
    for (const p of particles) scene.remove(p.m); particles.length = 0;
    for (const tr of tracers) { scene.remove(tr.line); if (tr.light) scene.remove(tr.light); } tracers.length = 0;
    for (const pr of projectiles) scene.remove(pr.mesh); projectiles.length = 0;
    for (const pk of pickups) scene.remove(pk.grp); pickups.length = 0;
    for (const c of chests) scene.remove(c.grp); chests.length = 0; chestTimer = 3; nearChest = null;
    if (ui.prompt) ui.prompt.classList.remove('show');
    state.armor = 0;

    const ch = CHARACTERS[state.character] || CHARACTERS.sentinel;
    state.maxHp = ch.hp; state.hp = ch.hp; state.speedMul = ch.speed;
    state.lastHurt = -10; state.score = 0; state.wave = 0;
    state.modeTime = 0; state.spawned = 0; state.paused = false;
    const pauseEl = el('pause'); if (pauseEl) pauseEl.classList.remove('show');
    state.toSpawn = 0; state.waveActive = false; state.waveDelay = 2.0; state.spawnQueue = [];
    state.weapon = 'smg'; state.reloading = false; state.fireTimer = 0; state.recoil = 0; state.recoilV = 0;
    state.ads = false; state.adsAmt = 0; state.grenades = 3; state.view = 'first';
    if (ui.viewBtn) ui.viewBtn.innerHTML = '◉ 1ST PERSON <kbd>V</kbd>';
    state.items = { medkit: 1 }; state.kills = 0; if (state.invOpen) toggleInventory(false);
    WEAPON_ORDER.forEach(k => { ammo[k] = { mag: WEAPONS[k].magSize, reserve: WEAPONS[k].reserve, attach: WEAPONS[k].attachs[0] }; viewmodels[k].visible = (k === 'smg'); });
    applyAttachVisual();
    if (curClip) { curClip.stop(); curClip = null; }   // reset character animation state
    player.x = 0; player.z = 26; player.feetY = terrainHeight(0, 26); player.vy = 0; player.grounded = true;
    yaw = Math.PI; pitch = -0.05;
    updateHealthHUD(); updateWeaponHUD(); updateTopHUD();
  }
  function startGame() {
    audio(); startMusic(); resetGame(); state.phase = 'playing';
    showMenu(false); ui.over.classList.remove('show'); ui.hud.classList.add('on');
    requestPointer(); renderer.domElement.focus();
    if (state.mode === 'horde') banner('ENDLESS HORDE', 'they never stop coming');
    else if (state.mode === 'rush') banner('TARGET RUSH', MODES.rush.target + ' hostiles · beat the clock');
    else { banner('SURVIVE', 'hostiles inbound'); state.waveDelay = 2.5; }
  }

  // ---------------------------------------------------------------------------
  // Input
  // ---------------------------------------------------------------------------
  const keys = {};
  let pointerLocked = false, dragging = false, sprinting = false;
  renderer.domElement.tabIndex = 0; renderer.domElement.style.outline = 'none';
  function requestPointer() { const p = renderer.domElement.requestPointerLock && renderer.domElement.requestPointerLock(); if (p && p.catch) p.catch(() => {}); }
  document.addEventListener('pointerlockchange', () => {
    pointerLocked = document.pointerLockElement === renderer.domElement;
    // Esc under pointer-lock isn't delivered as a keydown — losing the lock
    // mid-game (without the inventory open) means the player hit Esc: pause.
    if (!pointerLocked && state.phase === 'playing' && !state.invOpen && !state.paused) openPause();
  });
  function applyLook(dx, dy) {
    const sens = 0.0022 * settings.sens * (state.ads ? adsZoom() : 1);
    yaw -= dx * sens; pitch -= dy * sens * (settings.invertY ? -1 : 1);
    const lim = Math.PI / 2 - 0.04; pitch = clamp(pitch, -lim, lim);
    state.swayX += dx; state.swayY += dy;   // feed weapon sway
  }
  document.addEventListener('mousemove', (e) => { if (state.phase !== 'playing') return; if (pointerLocked || dragging) applyLook(e.movementX, e.movementY); });
  renderer.domElement.addEventListener('mousedown', (e) => {
    if (state.phase !== 'playing' || state.paused || state.invOpen) return;   // menus/pause/inventory own the clicks
    if (e.button === 0) { state.firingHeld = true; if (!pointerLocked) { dragging = true; requestPointer(); } renderer.domElement.focus(); }
    else if (e.button === 2) { state.ads = true; }
  });
  window.addEventListener('mouseup', (e) => { if (e.button === 0) { state.firingHeld = false; dragging = false; } else if (e.button === 2) state.ads = false; });
  if (ui.invBtn) ui.invBtn.addEventListener('click', (e) => { e.stopPropagation(); if (state.phase === 'playing' && !state.paused) toggleInventory(); });
  if (ui.viewBtn) ui.viewBtn.addEventListener('click', (e) => { e.stopPropagation(); if (state.phase === 'playing' && !state.paused) setView(state.view === 'first' ? 'third' : 'first'); });
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  const MOVE_CODES = new Set(['KeyW','KeyA','KeyS','KeyD','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ShiftLeft','ShiftRight','Space']);
  function onKeyDown(e) {
    if (e._bfHandled) return; e._bfHandled = true;   // keydown is bound to window AND canvas; bubbling fires it twice — dedupe per-event
    keys[e.code] = true;
    if (state.phase === 'playing') {
      if (e.code === 'Escape') { if (state.invOpen) toggleInventory(false); else if (state.paused) resumeGame(); else openPause(); return; }
      if (state.paused) { if (MOVE_CODES.has(e.code)) e.preventDefault(); return; }
      if (e.code === 'Tab' || e.code === 'KeyI' || e.code === 'KeyE') {
        e.preventDefault();
        // E next to a supply cache opens the cache; otherwise E toggles the
        // inventory — closing goes straight back to gameplay (never pause).
        if (e.code === 'KeyE' && !state.invOpen && nearChest) { tryOpenChest(); return; }
        toggleInventory(); return;
      }
      if (e.code === 'KeyR') startReload();
      else if (e.code === 'KeyF') {   // instant 180° character-facing flip (persisted)
        settings.flipChar = !settings.flipChar; persist();
        const fc = el('setFlip'); if (fc) fc.checked = settings.flipChar;
        toast('FACING FLIPPED 180°', 0x60a5fa);
      }
      else if (e.code === 'KeyG') throwGrenade();
      else if (e.code === 'KeyT') cycleAttachment();
      else if (e.code === 'KeyQ') useMedkit();
      else if (e.code === 'KeyH') ui.help.classList.toggle('show');
      else if (e.code === 'KeyV') setView(state.view === 'first' ? 'third' : 'first');
      else if (e.code.startsWith('Digit')) { const n = +e.code.slice(5); if (n >= 1 && n <= 5) { switchWeapon(WEAPON_ORDER[n - 1]); if (state.invOpen) renderInventory(); } }
    }
    if (MOVE_CODES.has(e.code)) e.preventDefault();
  }
  function onKeyUp(e) { keys[e.code] = false; }
  window.addEventListener('keydown', onKeyDown); window.addEventListener('keyup', onKeyUp);
  renderer.domElement.addEventListener('keydown', onKeyDown); renderer.domElement.addEventListener('keyup', onKeyUp);
  window.addEventListener('load', () => renderer.domElement.focus());

  // ---------------------------------------------------------------------------
  // Updates
  // ---------------------------------------------------------------------------
  const clock = new T.Clock();

  function updatePlayer(dt) {
    const euler = new T.Euler(pitch + state.recoil, yaw, 0, 'YXZ'); camera.quaternion.setFromEuler(euler);
    sprinting = (keys['ShiftLeft'] || keys['ShiftRight']) && (keys['KeyW'] || keys['ArrowUp']) && !state.ads;
    const speed = (sprinting ? SPRINT : (state.ads ? WALK * 0.6 : WALK)) * (state.speedMul || 1);
    const fwdX = -Math.sin(yaw), fwdZ = -Math.cos(yaw), rX = -fwdZ, rZ = fwdX;
    let mx = 0, mz = 0;
    if (keys['KeyW'] || keys['ArrowUp']) { mx += fwdX; mz += fwdZ; }
    if (keys['KeyS'] || keys['ArrowDown']) { mx -= fwdX; mz -= fwdZ; }
    if (keys['KeyA'] || keys['ArrowLeft']) { mx -= rX; mz -= rZ; }
    if (keys['KeyD'] || keys['ArrowRight']) { mx += rX; mz += rZ; }
    const len = Math.hypot(mx, mz); const moving = len > 0;
    if (moving) { mx = mx / len * speed * dt; mz = mz / len * speed * dt; tryMove(player, mx, mz, player.feetY, PLAYER_R); clampToWorld(player, PLAYER_R); }

    if (keys['Space'] && player.grounded) { player.vy = JUMP_V; player.grounded = false; }
    player.vy -= GRAVITY * dt; player.feetY += player.vy * dt;
    const gh = groundHeight(player.x, player.z, player.feetY);
    if (player.feetY <= gh) { player.feetY = gh; player.vy = 0; player.grounded = true; } else player.grounded = false;

    state.moving = moving;
    if (moving && player.grounded) state.bob += dt * (sprinting ? 14 : 9);
    const bobY = (moving && player.grounded) ? Math.sin(state.bob) * 0.05 : 0;
    if (state.view === 'third') {
      // over-the-shoulder camera placed behind the player (forward is -sin,-cos → behind is +)
      const hy = player.feetY + EYE_H;
      camera.position.set(player.x + Math.sin(yaw) * MODEL.tpDist, hy + MODEL.tpUp, player.z + Math.cos(yaw) * MODEL.tpDist);
    } else {
      camera.position.set(player.x, player.feetY + EYE_H + bobY, player.z);
    }

    state.recoil += state.recoilV; state.recoilV *= 0.82; state.recoil *= 0.80;

    // ADS fov + scope overlay
    state.adsAmt = lerp(state.adsAmt, state.ads ? 1 : 0, Math.min(1, dt * 12));
    const targetFov = lerp(settings.fov, settings.fov * adsZoom(), state.adsAmt);
    if (Math.abs(camera.fov - targetFov) > 0.05) { camera.fov = targetFov; camera.updateProjectionMatrix(); }
    const wantScope = state.ads && WEAPONS[state.weapon].scoped && ammo[state.weapon].attach === 'scope';
    ui.scope.classList.toggle('show', !!wantScope && state.adsAmt > 0.6);

    if (clock.elapsedTime - state.lastHurt > 4.5 && state.hp < state.maxHp) { state.hp = Math.min(state.maxHp, state.hp + 11 * dt); updateHealthHUD(); }
    state.nadeCD = Math.max(0, state.nadeCD - dt);
  }

  function updateWeaponVisual(dt) {
    const vm = viewmodels[state.weapon], rest = vm.userData.restPos, ads = vm.userData.adsPos;
    // Sway: weapon lags behind the camera. Consume this frame's look delta, damp by ADS.
    const damp = 1 - 0.6 * state.adsAmt;
    const sX = clamp(state.swayX, -90, 90) * damp, sY = clamp(state.swayY, -90, 90) * damp;
    state.swayX = 0; state.swayY = 0;
    vm.userData.swayY = lerp(vm.userData.swayY || 0, -sX * 0.0011, Math.min(1, dt * 10));
    vm.userData.swayX = lerp(vm.userData.swayX || 0,  sY * 0.0011, Math.min(1, dt * 10));
    // Walk bob + idle breathing
    const moving = state.moving && player.grounded;
    const bobX = moving ? Math.cos(state.bob) * 0.012 * damp : 0;
    const bobY = moving ? Math.abs(Math.sin(state.bob)) * 0.010 * damp : 0;
    const idleY = Math.sin(clock.elapsedTime * 1.6) * 0.004 * damp;

    let kz = 0, ky = 0;
    if (vm.userData.kick > 0) { kz = vm.userData.kick * 0.12; ky = vm.userData.kick * 0.03; vm.userData.kick = Math.max(0, vm.userData.kick - dt * 8); }
    const tx = lerp(rest.x, ads.x, state.adsAmt) + bobX + vm.userData.swayY * 0.35;
    const ty = lerp(rest.y, ads.y, state.adsAmt) - bobY + idleY;
    const tz = lerp(rest.z, ads.z, state.adsAmt);
    vm.position.x += (tx - vm.position.x) * Math.min(1, dt * 16);
    vm.position.y += (ty + ky - vm.position.y) * Math.min(1, dt * 16);
    vm.position.z += (tz + kz - vm.position.z) * Math.min(1, dt * 16);

    let rotX = vm.userData.swayX, rotY = vm.userData.swayY;
    if (state.reloading) rotX = Math.sin((1 - state.reloadTimer / WEAPONS[state.weapon].reloadTime) * Math.PI) * 0.7;
    vm.rotation.x += (rotX - vm.rotation.x) * Math.min(1, dt * 12);
    vm.rotation.y += (rotY - vm.rotation.y) * Math.min(1, dt * 12);
    const fm = vm.userData.flash.material; if (fm.opacity > 0) fm.opacity = Math.max(0, fm.opacity - dt * 12);
    const fl = vm.userData.flashLight; if (fl.intensity > 0) fl.intensity = Math.max(0, fl.intensity - dt * 40);
  }

  function updateFiring(dt) {
    state.fireTimer -= dt;
    if (state.reloading) { state.reloadTimer -= dt; if (state.reloadTimer <= 0) finishReload(); return; }
    const w = WEAPONS[state.weapon];
    if (state.firingHeld && state.fireTimer <= 0) { if (w.auto) fire(); else if (!state.semiLatch) { fire(); state.semiLatch = true; } }
    if (!state.firingHeld) state.semiLatch = false;
    if (ammo[state.weapon].mag === 0 && !state.reloading && state.firingHeld) startReload();
  }

  function updateEnemies(dt) {
    for (let i = enemies.length - 1; i >= 0; i--) {
      const e = enemies[i];
      if (e.flash > 0) { e.flash -= dt; const on = e.flash > 0; for (const m of e.hitMeshes) m.material.emissive && m.material.emissive.setHex(on ? 0xaa2222 : 0x000000); if (e.flash <= 0) for (const m of e.hitMeshes) if (m.material.emissive) m.material.emissive.setHex(0x000000); }
      if (!e.alive) {
        e.dying -= dt; e.grp.rotation.x += dt * 3; e.grp.position.y -= dt * (e.fly ? 4 : 2.5);
        e.grp.scale.setScalar(Math.max(0.01, e.dying / (e.boss ? 1.2 : 0.6)));
        if (e.dying <= 0) removeEnemy(e);
        continue;
      }
      const dx = player.x - e.grp.position.x, dz = player.z - e.grp.position.z, dist = Math.hypot(dx, dz);

      if (e.ranged) {
        // drone: keep ~14 units, strafe, shoot plasma
        let nx = dx / (dist || 1), nz = dz / (dist || 1);
        const desired = lerp(11, 3.5, state.pressure); const towards = dist > desired ? 1 : (dist < desired - 3 ? -1 : 0);
        const sX = -nz, sZ = nx; // strafe (less when closing in for the kill)
        const strafe = lerp(0.45, 0.1, state.pressure);
        let mvx = nx * towards + sX * strafe, mvz = nz * towards + sZ * strafe;
        const ml = Math.hypot(mvx, mvz) || 1; mvx /= ml; mvz /= ml;
        const step = e.speed * dt; const pos = { x: e.grp.position.x, z: e.grp.position.z };
        tryMove(pos, mvx * step, mvz * step, 99, 0.7); clampToWorld(pos, 1);
        e.grp.position.x = pos.x; e.grp.position.z = pos.z;
        // lingering drones descend to player level (cleanup pressure) so they're always finishable
        e.bob += dt * 2; const hov = lerp(e.hoverH, 1.6, state.pressure);
        e.grp.position.y = terrainHeight(pos.x, pos.z) + hov + Math.sin(e.bob) * 0.4;
        e.grp.rotation.y = Math.atan2(dx, dz);
        if (e.ring) e.ring.rotation.z += dt * 3;
        e.shootCD -= dt;
        if (e.shootCD <= 0 && dist < 60) { e.shootCD = rand(1.4, 2.4); fireEnemyPlasma(e); }
      } else {
        let nx = dx / (dist || 1), nz = dz / (dist || 1);
        for (const o of enemies) { if (o === e || !o.alive) continue; const ox = e.grp.position.x - o.grp.position.x, oz = e.grp.position.z - o.grp.position.z, od = Math.hypot(ox, oz); if (od < 1.8 * e.cfg.scale && od > 0.01) { nx += ox / od * 0.5; nz += oz / od * 0.5; } }
        const nl = Math.hypot(nx, nz) || 1; nx /= nl; nz /= nl;
        const step = e.speed * dt; const sx = e.grp.position.x, sz = e.grp.position.z; const pos = { x: sx, z: sz };
        tryMove(pos, nx * step, nz * step, terrainHeight(sx, sz), 0.7 * e.cfg.scale);
        const moved = Math.hypot(pos.x - sx, pos.z - sz);
        if (moved < step * 0.6 && dist > 2.4) { if (e.side === undefined) e.side = Math.random() < 0.5 ? 1 : -1; tryMove(pos, -nz * e.side * step, nx * e.side * step, terrainHeight(sx, sz), 0.7 * e.cfg.scale); e.stall = (e.stall || 0) + dt; if (e.stall > 1.5) { e.side *= -1; e.stall = 0; } } else e.stall = 0;
        clampToWorld(pos, 1);
        e.grp.position.set(pos.x, terrainHeight(pos.x, pos.z), pos.z);
        e.grp.rotation.y = Math.atan2(dx, dz);
        e.walkT += dt * (6 + e.speed); const sw = Math.sin(e.walkT) * 0.5;
        if (e.legL) { e.legL.rotation.x = sw; e.legR.rotation.x = -sw; e.armL.rotation.x = -sw * 0.6; e.armR.rotation.x = sw * 0.6; }
      }

      e.contactCD -= dt;
      const reach = (1.7 + e.cfg.scale) ;
      const vClose = Math.abs((player.feetY) - (e.grp.position.y - e.hoverH)) < 3 + e.hoverH;
      if (!e.ranged && dist < reach && vClose && e.contactCD <= 0) { hurtPlayer(e.dmg); e.contactCD = 0.7; }
    }
  }

  function fireEnemyPlasma(e) {
    sfx('plasma', 0.6);
    const from = new T.Vector3(e.grp.position.x, e.grp.position.y + 0.3, e.grp.position.z);
    const to = new T.Vector3(player.x, player.feetY + 1.4, player.z);
    const dir = to.sub(from).normalize();
    const mesh = new T.Mesh(new T.SphereGeometry(0.25, 8, 8), new T.MeshBasicMaterial({ color: e.cfg.accent, fog: false }));
    mesh.position.copy(from); scene.add(mesh);
    const light = new T.PointLight(e.cfg.accent, 1, 5); mesh.add(light);
    projectiles.push({ mesh, vel: dir.multiplyScalar(38), life: 4, kind: 'plasma', owner: 'enemy', dmg: e.dmg, prev: from.clone() });
  }

  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.life -= dt;
      if (p.prev) p.prev.copy(p.mesh.position);
      if (p.grav) p.vel.y -= GRAVITY * dt;
      p.mesh.position.addScaledVector(p.vel, dt);

      let hit = null, hitPoint = null;
      if (p.kind === 'rocket' || p.kind === 'plasma') {
        const seg = p.mesh.position.clone().sub(p.prev); const dlen = seg.length();
        if (dlen > 0.001) {
          raycaster.set(p.prev, seg.normalize()); raycaster.far = dlen;
          const list = p.owner === 'player' ? enemyHitMeshes.concat(worldSolids) : worldSolids;
          const hits = raycaster.intersectObjects(list, false);
          if (hits.length) { hit = hits[0]; hitPoint = hit.point.clone(); }
        }
        // enemy plasma vs player proximity
        if (p.owner === 'enemy') { const pp = new T.Vector3(player.x, player.feetY + 1.3, player.z); if (p.mesh.position.distanceTo(pp) < 1.2) { hurtPlayer(p.dmg); scene.remove(p.mesh); projectiles.splice(i, 1); continue; } }
      }

      if (p.kind === 'grenade') {
        const gh = terrainHeight(p.mesh.position.x, p.mesh.position.z) + 0.22;
        if (p.mesh.position.y < gh) { p.mesh.position.y = gh; p.vel.y *= -p.bounce; p.vel.x *= 0.6; p.vel.z *= 0.6; }
        p.mesh.rotation.x += dt * 8; p.mesh.rotation.y += dt * 6;
      }

      if (hit) { explode(hitPoint, p.splashR, p.splashDmg, p.owner === 'player'); scene.remove(p.mesh); projectiles.splice(i, 1); continue; }
      if (p.life <= 0) {
        if (p.kind === 'rocket' || p.kind === 'grenade') explode(p.mesh.position.clone(), p.splashR, p.splashDmg, true);
        scene.remove(p.mesh); projectiles.splice(i, 1);
      }
    }
  }

  function updatePickups(dt) {
    const pp = new T.Vector3(player.x, player.feetY + 1, player.z);
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i]; p.t += dt; p.life -= dt;
      p.grp.rotation.y += dt * 2; p.grp.position.y = terrainHeight(p.grp.position.x, p.grp.position.z) + 0.8 + Math.sin(p.t * 2) * 0.15;
      if (p.grp.position.distanceTo(pp) < 2.2) { collectPickup(p); continue; }
      if (p.life <= 0) { scene.remove(p.grp); pickups.splice(i, 1); }
    }
  }

  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) { const p = particles[i]; p.life -= dt; if (p.grav) p.v.y -= GRAVITY * dt; p.m.position.addScaledVector(p.v, dt); const gy = terrainHeight(p.m.position.x, p.m.position.z) + 0.12; if (p.m.position.y < gy) { p.m.position.y = gy; p.v.y *= -0.4; p.v.x *= 0.6; p.v.z *= 0.6; } p.m.rotation.x += dt * 6; p.m.rotation.y += dt * 5; if (p.life <= 0) { scene.remove(p.m); p.m.geometry.dispose(); particles.splice(i, 1); } }
    for (let i = tracers.length - 1; i >= 0; i--) { const tr = tracers[i]; tr.life -= dt; if (tr.line.material) tr.line.material.opacity = Math.max(0, tr.life * (tr.grow ? 4 : 16)); if (tr.grow) tr.line.scale.multiplyScalar(1 + dt * 6); if (tr.light) tr.light.intensity = Math.max(0, tr.light.intensity - dt * 16); if (tr.life <= 0) { scene.remove(tr.line); if (tr.light) scene.remove(tr.light); if (tr.line.geometry) tr.line.geometry.dispose(); tracers.splice(i, 1); } }
  }

  // ---------------------------------------------------------------------------
  // Main loop
  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // Player character model — Golden Sentinel (GLB): menu showcase + 1st/3rd person
  // ---------------------------------------------------------------------------
  // ?v= busts the browser HTTP cache — bump it whenever the model file changes,
  // or stale cached GLBs keep playing old (previously mislabeled) animations.
  const SENTINEL_URL = 'assets/sentinel.glb?v=2';
  const MODEL = { height: 2.5, yawOffset: Math.PI, tpDist: 6.5, tpUp: 1.2 };  // height ≈ player size
  const CLIP = { idle: 'Idle_02', move: 'Running', dead: 'Dead' };  // motion-scanned: Idle_02=calm stand, Running=true run, Idle_03=aim pose (avoid)
  let playerModel = null, playerMixer = null, clips = {}, curClip = null, modelLoaded = false, headBone = null, headBaseScale = null, FOOT_LIFT = 0;

  function loadCharacter() {
    if (typeof THREE.GLTFLoader !== 'function') { console.warn('[sentinel] GLTFLoader unavailable'); return; }
    new THREE.GLTFLoader().load(SENTINEL_URL, (gltf) => {
      const m = gltf.scene;
      m.traverse((o) => {
        if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
        if (!headBone && o.name && /head/i.test(o.name)) headBone = o;
      });
      // Scale to target height using BONE world extents — the true skinned size.
      // (Box3.setFromObject is skinning-blind: Meshy's armature carries a 0.01
      // node scale, so the geometry box reads ~0.02m while the robot is ~1.66m;
      // scaling by the box blew the model up ~110x. Bones don't lie.)
      m.updateMatrixWorld(true);
      let minY = 1e9, maxY = -1e9; const bv = new T.Vector3();
      m.traverse((o) => { if (o.isBone) { bv.setFromMatrixPosition(o.matrixWorld); if (bv.y < minY) minY = bv.y; if (bv.y > maxY) maxY = bv.y; } });
      let h = maxY - minY;
      if (!(h > 0.01)) {   // unrigged fallback: geometry box
        const box = new T.Box3().setFromObject(m); const size = new T.Vector3(); box.getSize(size);
        h = size.y || 1; minY = box.min.y;
      }
      const k = MODEL.height / (h * 1.12);   // 1.12 ≈ head/sole volume beyond end bones
      m.scale.setScalar(k);
      FOOT_LIFT = Math.max(0, -minY * k);
      if (headBone) headBaseScale = headBone.scale.clone();
      playerModel = m; m.visible = false; scene.add(m);
      playerMixer = new T.AnimationMixer(m);
      gltf.animations.forEach((c) => { clips[c.name] = playerMixer.clipAction(c); });
      modelLoaded = true;
      // showcase placement is handled per-frame by updateCharacter()
      console.log('[sentinel] loaded — clips:', gltf.animations.map(a => a.name).join(', '));
    }, undefined, (e) => console.warn('[sentinel] load failed — serve over http(s) to see the character; file:// blocks model loads.', e && (e.message || e)));
  }
  function playClip(name, fade = 0.25, speed = 1) {
    const a = clips[name]; if (!a) return;
    if (a === curClip) { a.timeScale = speed; return; }   // already playing: just retune speed (jog<->sprint)
    a.reset().fadeIn(fade).play(); a.timeScale = speed;
    if (curClip) curClip.fadeOut(fade); curClip = a;
  }
  function setHead(show) { if (!headBone || !headBaseScale) return; show ? headBone.scale.copy(headBaseScale) : headBone.scale.set(1e-4, 1e-4, 1e-4); }
  // Procedural blocky characters (alternates to the GLB Sentinel)
  const procChars = {};
  function makeBlockyChar(c) {
    const grp = new T.Group();
    const mat = (x) => new T.MeshStandardMaterial({ color: x, roughness: 0.8 });
    const part = (w, h, d, col, x, y, z) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat(col)); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; grp.add(m); return m; };
    const legL = part(0.45, 1.3, 0.5, c.pants, -0.32, 0.65, 0), legR = part(0.45, 1.3, 0.5, c.pants, 0.32, 0.65, 0);
    part(1.25, 1.5, 0.65, c.shirt, 0, 2.05, 0);
    const armL = part(0.42, 1.4, 0.46, c.shirt, -0.86, 2.05, 0), armR = part(0.42, 1.4, 0.46, c.shirt, 0.86, 2.05, 0);
    part(0.95, 0.9, 0.95, c.skin, 0, 3.25, 0);
    part(0.7, 0.18, 0.06, 0x10131a, 0, 3.3, 0.49);   // visor
    grp.scale.setScalar(2.5 / 3.7);                   // ≈ player height
    grp.visible = false; scene.add(grp);
    return { kind: 'proc', grp, legL, legR, armL, armR, walkT: 0, lift: 0 };
  }
  function getCharVisual(id) {
    if (id === 'sentinel') return modelLoaded ? { kind: 'glb', grp: playerModel, lift: FOOT_LIFT } : null;
    if (!procChars[id]) procChars[id] = makeBlockyChar(CHARACTERS[id].colors);
    return procChars[id];
  }
  function hideAllChars() {
    if (playerModel) playerModel.visible = false;
    for (const k in procChars) procChars[k].grp.visible = false;
  }
  function updateCharacter(dt) {
    if (playerMixer) playerMixer.update(dt);
    hideAllChars();
    const fp = state.phase === 'playing' && state.view === 'first';
    viewmodels[state.weapon].visible = fp;
    const vis = getCharVisual(state.character);
    if (!vis) return;
    if (state.phase !== 'playing') {
      // menu showcase: selected character idles + rotates on the podium, lit
      vis.grp.visible = true;
      vis.grp.position.set(2.6, terrainHeight(2.6, 30.5) + (vis.lift || 0), 30.5);
      vis.grp.rotation.y += dt * 0.5;
      showcaseLight.intensity = 2.4;
      showcaseLight.target.position.copy(vis.grp.position).y += 1.4;
      if (vis.kind === 'glb') { setHead(true); playClip(CLIP.idle); }
      const ch = el('charHint'); if (ch) ch.innerHTML = '<b>' + CHARACTERS[state.character].name + '</b>' + (vis.kind === 'glb' ? 'your operative' : 'recruit');
      return;
    }
    showcaseLight.intensity = 0;
    if (state.view !== 'third') return;   // FP: camera IS the character
    vis.grp.visible = true;
    vis.grp.position.set(player.x, player.feetY + (vis.lift || 0), player.z);
    // Which 180° is "forward" is texture-dependent and only the player can see
    // it — settings.flipChar (Settings menu) decides, persisted. Default yaw+PI.
    vis.grp.rotation.y = yaw + (settings.flipChar ? 0 : Math.PI);
    if (vis.kind === 'glb') {
      setHead(true);
      if (state.moving) playClip(CLIP.move, 0.18, sprinting ? 1.45 : 0.85);  // jog vs sprint = same run clip, faster
      else playClip(CLIP.idle, 0.25, 1);
    } else {
      vis.walkT += dt * (state.moving ? (sprinting ? 12 : 8) : 0);
      const sw = state.moving ? Math.sin(vis.walkT) * 0.5 : 0;
      vis.legL.rotation.x = sw; vis.legR.rotation.x = -sw;
      vis.armL.rotation.x = -sw * 0.6; vis.armR.rotation.x = sw * 0.6;
    }
  }

  function tick() {
    const dt = Math.min(0.05, clock.getDelta());
    if (state.phase === 'playing' && !state.paused) {
      updatePlayer(dt); updateFiring(dt); updateWeaponVisual(dt); updateEnemies(dt);
      updateProjectiles(dt); updatePickups(dt); updateParticles(dt); updateWaves(dt); updateCharacter(dt); updateChests(dt);
      sun.target.position.set(player.x, 0, player.z); sun.position.set(player.x - 60, 90, player.z + 40);
      if (hitTimer > 0) { hitTimer -= dt; if (hitTimer <= 0) ui.hitmarker.style.opacity = '0'; }
      if (toastTimer > 0) { toastTimer -= dt; if (toastTimer <= 0) ui.toast.style.opacity = '0'; }
      const cmp = el('compass');
      if (cmp) { const deg = ((-yaw * 180 / Math.PI) % 360 + 360) % 360; const dirs = ['N','NE','E','SE','S','SW','W','NW']; cmp.textContent = dirs[Math.round(deg / 45) % 8] + ' · ' + Math.round(deg) + '°'; }
      updateWeaponHUD();
    } else if (state.phase !== 'playing') { updateProjectiles(dt); updateParticles(dt); updateCharacter(dt); }
    renderer.render(scene, camera);   // paused: render the frozen frame
    requestAnimationFrame(tick);
  }

  // ---------------------------------------------------------------------------
  // Menus, pause, settings wiring
  // ---------------------------------------------------------------------------
  const SCREENS = ['m-main', 'm-mode', 'm-char', 'm-settings', 'm-help'];
  let settingsReturn = 'm-main';
  function showScreen(id) { SCREENS.forEach(s => { const n = el(s); if (n) n.classList.toggle('show', s === id); }); }
  function showMenu(on) { const m = el('menu'); if (m) m.classList.toggle('hidden', !on); }
  function setMenuCamera() {
    const th = terrainHeight(2.6, 30.5);
    camera.position.set(6.2, th + 2.7, 34.5);   // frame the character on the right of the menu
    camera.lookAt(2.6, th + 1.4, 30.5);
    camera.fov = settings.fov; camera.updateProjectionMatrix();
  }
  function openPause() {
    if (state.phase !== 'playing' || state.paused || state.invOpen) return;
    state.paused = true; state.firingHeld = false;
    const p = el('pause'); if (p) p.classList.add('show');
    if (document.pointerLockElement) document.exitPointerLock();
  }
  function resumeGame() {
    if (!state.paused) return;
    state.paused = false;
    const p = el('pause'); if (p) p.classList.remove('show');
    showMenu(false);
    requestPointer(); renderer.domElement.focus();
  }
  function quitToMenu() {
    state.paused = false;
    const p = el('pause'); if (p) p.classList.remove('show');
    resetGame(); state.phase = 'menu';
    ui.hud.classList.remove('on'); ui.over.classList.remove('show');
    if (document.pointerLockElement) document.exitPointerLock();
    setMenuCamera(); showMenu(true); showScreen('m-main'); refreshBest();
  }
  function refreshBest() {
    const f = (m) => records[m].score ? (records[m].score + ' pts · wave ' + records[m].wave) : '—';
    const bl = el('bestLine'); if (bl) bl.innerHTML = 'BEST — Survival: <b>' + f('survival') + '</b> · Horde: <b>' + f('horde') + '</b> · Rush: <b>' + (records.rush.time ? fmtTime(records.rush.time) : '—') + '</b>';
    const bs = el('best-survival'); if (bs) bs.textContent = records.survival.score ? ('Best: ' + records.survival.score + ' pts · wave ' + records.survival.wave) : 'No record yet';
    const bh = el('best-horde'); if (bh) bh.textContent = records.horde.score ? ('Best: ' + records.horde.score + ' pts') : 'No record yet';
    const br = el('best-rush'); if (br) br.textContent = records.rush.time ? ('Best: ' + fmtTime(records.rush.time)) : 'No record yet';
  }
  function bindSettings() {
    const rows = [['setSens', 'sens', v => (+v).toFixed(2)], ['setFov', 'fov', v => Math.round(v) + '°'], ['setSfx', 'sfx', v => Math.round(v * 100) + '%'], ['setMusic', 'music', v => Math.round(v * 100) + '%']];
    rows.forEach(([id, key, fmt]) => {
      const inp = el(id), val = el(id + 'V'); if (!inp) return;
      inp.value = settings[key]; if (val) val.textContent = fmt(settings[key]);
      inp.addEventListener('input', () => {
        settings[key] = +inp.value; if (val) val.textContent = fmt(settings[key]);
        if (key === 'fov' && state.phase !== 'playing') { camera.fov = settings.fov; camera.updateProjectionMatrix(); }
        if (key === 'music' && musicGain) musicGain.gain.value = settings.music * 0.06;
        persist();
      });
    });
    const inv = el('setInvert');
    if (inv) { inv.checked = !!settings.invertY; inv.addEventListener('change', () => { settings.invertY = inv.checked; persist(); }); }
    const flip = el('setFlip');
    if (flip) { flip.checked = !!settings.flipChar; flip.addEventListener('change', () => { settings.flipChar = flip.checked; persist(); }); }
  }
  function wireMenus() {
    const on = (id, fn) => { const n = el(id); if (n) n.addEventListener('click', fn); };
    on('btnPlay', () => { showScreen('m-mode'); refreshBest(); });
    on('btnSettings', () => { settingsReturn = 'm-main'; showScreen('m-settings'); });
    on('btnHowto', () => showScreen('m-help'));
    on('modeBack', () => showScreen('m-main'));
    on('charBack', () => showScreen('m-mode'));
    on('helpBack', () => showScreen('m-main'));
    on('settingsBack', () => {
      if (settingsReturn === 'pause') { showMenu(false); const p = el('pause'); if (p) p.classList.add('show'); }
      else showScreen(settingsReturn);
    });
    Object.keys(MODES).forEach(m => on('mode-' + m, () => { state.mode = m; showScreen('m-char'); }));
    Object.keys(CHARACTERS).forEach(c => on('char-' + c, () => {
      state.character = c;
      Object.keys(CHARACTERS).forEach(k => { const n = el('char-' + k); if (n) n.classList.toggle('sel', k === c); });
    }));
    on('btnDeploy', () => startGame());
    on('btnResume', () => resumeGame());
    on('btnPauseSettings', () => { settingsReturn = 'pause'; const p = el('pause'); if (p) p.classList.remove('show'); showMenu(true); showScreen('m-settings'); });
    on('btnQuit', () => quitToMenu());
    on('btnRedeploy', () => { ui.over.classList.remove('show'); startGame(); });
    on('btnMenu', () => quitToMenu());
    bindSettings(); refreshBest();
  }

  wireMenus();
  setMenuCamera();
  buildWeaponList(); applyAttachVisual();
  updateHealthHUD(); updateWeaponHUD(); updateTopHUD();
  loadCharacter();
  tick();

  window.addEventListener('resize', () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });

  // expose a tiny hook for automated tests (no effect in normal play)
  window.__GAME__ = { state, enemies, player, get yaw() { return yaw; }, set yaw(v) { yaw = v; }, get pitch() { return pitch; }, set pitch(v) { pitch = v; }, camera, EYE_H, terrainHeight, WEAPONS, ammo, WEAPON_ORDER, enemyHitMeshes, worldSolids, raycaster, get modelLoaded() { return modelLoaded; }, get playerModel() { return playerModel; }, MODES, CHARACTERS, records, settings, chests, craft, tryOpenChest, addArmor, gridSlots, useItem, addItem, INV_SLOTS, get nearChest() { return nearChest; }, get curClipName() { return curClip ? curClip.getClip().name : null; }, get curClipSpeed() { return curClip ? curClip.timeScale : 0; } };
})();
