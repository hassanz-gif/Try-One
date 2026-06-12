// Ring-world verification: boots the actual game with the REAL GLTFLoader and
// REAL assets (sentinel.glb + ringcity.glb), then asserts ring placement,
// camera mapping, kill pipeline, chests and no runtime errors.
// Run from repo root:  node tools/realcheck.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');

function makeEl(id){const s={id,tabIndex:0,_c:[],dataset:{},checked:false,value:'',style:new Proxy({},{get:()=>'',set:()=>true}),classList:{_s:new Set(),add(c){this._s.add(c)},remove(c){this._s.delete(c)},toggle(c,f){const h=this._s.has(c);const o=f===undefined?!h:!!f;o?this._s.add(c):this._s.delete(c);return o},contains(c){return this._s.has(c)}},set textContent(v){this._t=v},get textContent(){return this._t||''},set innerHTML(v){this._h=v},get innerHTML(){return this._h||''},get children(){return s._c},get lastChild(){return s._c[s._c.length-1]},appendChild(c){s._c.push(c);return c},prepend(c){s._c.unshift(c);return c},remove(){},addEventListener(t,fn){(s._e=s._e||{})[t]=(s._e&&s._e[t]||[]);s._e[t].push(fn)},removeEventListener(){},focus(){},querySelector(){return null},querySelectorAll(){return[]},getBoundingClientRect(){return{left:0,top:0,width:1280,height:720}},requestPointerLock(){return Promise.resolve()},getContext(){return{}},dispatch(t,ev){(s._e&&s._e[t]||[]).forEach(fn=>fn(ev||{}))}};return s}
const E={};
global.document={getElementById:id=>E[id]||(E[id]=makeEl(id)),createElement:()=>makeEl('dyn'),createElementNS:()=>({}),addEventListener(t,fn){(this._e=this._e||{})[t]=(this._e&&this._e[t]||[]);this._e[t].push(fn)},pointerLockElement:null,exitPointerLock(){},dispatch(t,ev){(this._e&&this._e[t]||[]).forEach(fn=>fn(ev||{}))}};
global.window={innerWidth:1280,innerHeight:720,devicePixelRatio:1,AudioContext:undefined,addEventListener(t,fn){(this._e=this._e||{})[t]=(this._e&&this._e[t]||[]);this._e[t].push(fn)},dispatch(t,ev){(this._e&&this._e[t]||[]).forEach(fn=>fn(ev||{}))}};
global.self=global; global.URL={createObjectURL:()=>'blob:x',revokeObjectURL(){}};
global.performance={now:()=>Date.now()}; global.setTimeout=()=>0; global.clearTimeout=()=>{}; global.setInterval=()=>0;
global.localStorage={getItem(){return null},setItem(){},removeItem(){}};
let raf=null; global.requestAnimationFrame=cb=>{raf=cb;return 1};
const mod={exports:{}}; new Function('module','exports','self','window','document',fs.readFileSync(path.join(root,'src/three.min.js'),'utf8'))(mod,mod.exports,global,global.window,global.document);
const THREE=mod.exports; global.THREE=THREE;
let elapsed=0; THREE.Clock.prototype.getDelta=function(){elapsed+=0.05;this.elapsedTime=elapsed;return 0.05};
let canvas=null; THREE.WebGLRenderer=function(){canvas=makeEl('cv');return{domElement:canvas,shadowMap:{},outputEncoding:0,toneMapping:0,toneMappingExposure:1,setPixelRatio(){},setSize(){},render(s){s&&s.updateMatrixWorld(true)}}};
THREE.ImageLoader.prototype.load=function(u,ok){const img={width:4,height:4};if(ok)ok(img);return img;};
new Function(fs.readFileSync(path.join(root,'src/GLTFLoader.js'),'utf8'))();
THREE.GLTFLoader.prototype.load=function(url,onLoad,p,onErr){
  const file = url.indexOf('ringcity')>=0 ? 'assets/ringcity.glb' : 'assets/sentinel.glb';
  const buf=fs.readFileSync(path.join(root,file));
  this.parse(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'',onLoad,onErr);
};
let errors=[]; process.on('uncaughtException',e=>errors.push(e.stack));
process.on('exit',()=>{ if(errors.length) console.log('UNCAUGHT:\n'+errors[0]); });
new Function(fs.readFileSync(path.join(root,'src/game.js'),'utf8'))();
const G=global.window.__GAME__;
const el=id=>E[id]||(E[id]=makeEl(id));
function frame(n=1){for(let i=0;i<n;i++){const cb=raf;raf=null;if(cb)cb()}}
function click(id){el(id).dispatch('click',{stopPropagation(){},preventDefault(){}})}
function key(c){const ev={code:c,preventDefault(){},stopPropagation(){}};canvas.dispatch('keydown',ev);global.window.dispatch('keydown',ev);}
function up(c){const ev={code:c};canvas.dispatch('keyup',ev);global.window.dispatch('keyup',ev);}

setImmediate(()=>setImmediate(()=>{
  const ok={};
  frame(8);
  ok.charLoaded = G.modelLoaded===true;
  ok.menuCharVisible = G.playerModel && G.playerModel.visible===true;
  // deploy
  click('btnPlay'); click('mode-survival'); click('char-sentinel'); click('btnDeploy');
  frame(4);
  // camera must sit ON the ring: radius ≈ R - EYE_H at spawn (bottom)
  const cr = Math.hypot(G.camera.position.x, G.camera.position.y);
  console.log('camera radius:', cr.toFixed(1), '(expect ~', (98.5-2.3).toFixed(1), ') z=', G.camera.position.z.toFixed(1));
  ok.cameraOnRing = Math.abs(cr-(98.5-2.3))<1.5;
  // walk along the loop: x advances, camera stays at the floor radius
  key('KeyW'); frame(40); up('KeyW');
  const cr2 = Math.hypot(G.camera.position.x, G.camera.position.y);
  console.log('after walk: sim x=', G.player.x.toFixed(1), 'camera radius:', cr2.toFixed(1));
  ok.walkAdvances = Math.abs(G.player.x)>3;
  ok.staysOnFloor = Math.abs(cr2-(98.5-2.3))<1.5;
  // jump: radius decreases (toward the axis), then returns
  key('Space'); frame(6);
  const crJump = Math.hypot(G.camera.position.x, G.camera.position.y);
  ok.jumpTowardAxis = crJump < cr2 - 0.5;
  frame(40);
  // enemy spawns on the ring (world radius near floor)
  for(let i=0;i<400 && raf && !G.enemies.some(e=>e.alive);i++) frame();
  const e0 = G.enemies.find(e=>e.alive);
  if(e0){
    const er = Math.hypot(e0.grp.position.x, e0.grp.position.y);
    console.log('enemy world radius:', er.toFixed(1), 'type:', e0.type);
    ok.enemyOnRing = er > 80 && er < 99.5;
  } else ok.enemyOnRing = false;
  // kill pipeline: god mode, teleport-turret in SIM coords, fire
  G.state.hp=1e9; G.state.maxHp=1e9;
  G.WEAPON_ORDER.forEach(k=>G.ammo[k].reserve=9999);
  canvas.dispatch('mousedown',{button:0});
  let kills0=G.state.kills;
  for(let i=0;i<900 && raf;i++){
    G.WEAPON_ORDER.forEach(k=>G.ammo[k].reserve=9999);
    const a=G.enemies.filter(e=>e.alive);
    if(a.length){
      let b=null,nd=1e9; for(const e of a){const d=Math.hypot(e.sim.x-G.player.x,e.sim.z-G.player.z); if(d<nd){nd=d;b=e;}}
      // stand 6 sim-units from it and aim at its world position
      G.player.x = b.sim.x - 6; G.player.z = b.sim.z; G.player.feetY = 0;
      frame(1);
      // aim: convert enemy world pos into camera-relative yaw/pitch via lookAt-style math
      const cw=G.camera.position, ew=b.grp.position;
      // direction in local ring frame at player: use sim deltas (small arc ≈ flat)
      const dx=b.sim.x-G.player.x, dz=b.sim.z-G.player.z, dh=(b.h||1.2)+1.2-(G.player.feetY+2.3);
      G.yaw=Math.atan2(-dx,-dz)+Math.PI; // forward(-sin,-cos): solve to face +x dir
      G.yaw=Math.atan2(dx,dz)+Math.PI;   // equivalent
      G.pitch=Math.atan2(dh,Math.hypot(dx,dz));
    } else frame(1);
    if(G.state.kills>kills0+2) break;
  }
  console.log('kills:', G.state.kills);
  ok.killsOnRing = G.state.kills>kills0;
  // chest spawns in sim space near player
  for(let i=0;i<400 && raf && G.chests.length===0;i++) frame();
  ok.chestSpawns = G.chests.length>0;
  if(ok.chestSpawns){
    const c=G.chests[0];
    G.player.x=c.sim.x+1; G.player.z=c.sim.z+1; frame(2);
    key('KeyE'); frame(2);
    ok.chestOpens = c.open===true;
  } else ok.chestOpens=false;
  ok.noErrors = errors.length===0;
  console.log(JSON.stringify(ok));
  const pass=Object.values(ok).every(Boolean);
  console.log(pass?'RINGCHECK OK':'RINGCHECK FAIL');
  if(errors[0])console.log(errors[0].split('\n').slice(0,4).join('\n'));
  process.exit(pass?0:1);
}));
