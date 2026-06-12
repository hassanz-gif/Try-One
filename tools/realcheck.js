// Real-asset verification: boots the actual game with the REAL GLTFLoader and
// REAL assets/sentinel.glb, then asserts character size, ground placement,
// menu showcase, and locomotion animation (idle / jog / sprint clips + speeds).
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
THREE.GLTFLoader.prototype.load=function(url,onLoad,p,onErr){const buf=fs.readFileSync(path.join(root,'assets/sentinel.glb'));this.parse(buf.buffer.slice(buf.byteOffset,buf.byteOffset+buf.byteLength),'',onLoad,onErr);};
let errors=[]; process.on('uncaughtException',e=>errors.push(e.stack));
new Function(fs.readFileSync(path.join(root,'src/game.js'),'utf8'))();
const G=global.window.__GAME__;
const el=id=>E[id]||(E[id]=makeEl(id));
function frame(n=1){for(let i=0;i<n;i++){const cb=raf;raf=null;if(cb)cb()}}
function click(id){el(id).dispatch('click',{stopPropagation(){},preventDefault(){}})}
function key(c){const ev={code:c,preventDefault(){},stopPropagation(){}};canvas.dispatch('keydown',ev);global.window.dispatch('keydown',ev);}
function up(c){const ev={code:c};canvas.dispatch('keyup',ev);global.window.dispatch('keyup',ev);}
function boneH(m){m.updateMatrixWorld(true);let mn=1e9,mx=-1e9;const v=new THREE.Vector3();m.traverse(o=>{if(o.isBone){v.setFromMatrixPosition(o.matrixWorld);if(v.y<mn)mn=v.y;if(v.y>mx)mx=v.y}});return{h:mx-mn,min:mn}}

setImmediate(()=>setImmediate(()=>{
  const ok={};
  frame(8);
  ok.modelLoaded = G.modelLoaded===true;
  // menu showcase: visible, player-sized, on the ground
  const pm=G.playerModel, ext=boneH(pm);
  const ground=G.terrainHeight(pm.position.x,pm.position.z);
  console.log('menu: height='+ext.h.toFixed(2)+'m feetY='+ext.min.toFixed(2)+' ground='+ground.toFixed(2)+' visible='+pm.visible);
  ok.menuVisible = pm.visible===true;
  ok.sizeOK = ext.h>1.6 && ext.h<3.2;
  ok.onGround = Math.abs(ext.min-ground)<0.6;
  // deploy in third person; locomotion clips
  click('btnPlay'); click('mode-survival'); click('char-sentinel'); click('btnDeploy');
  G.state.view='third'; frame(2);
  key('KeyW'); frame(3);
  console.log('jog   -> '+G.curClipName+' @'+G.curClipSpeed.toFixed(2));
  ok.jog = G.curClipName==='Running' && Math.abs(G.curClipSpeed-0.85)<0.01;
  key('ShiftLeft'); frame(3);
  console.log('sprint-> '+G.curClipName+' @'+G.curClipSpeed.toFixed(2));
  ok.sprint = G.curClipName==='Running' && G.curClipSpeed>1.3;
  up('KeyW'); up('ShiftLeft'); frame(4);
  console.log('idle  -> '+G.curClipName);
  ok.idle = G.curClipName==='Idle_02';
  // facing: the face (headfront bone) must point the way the player moves/aims
  {
    pm.updateMatrixWorld(true);
    let head=null, front=null; pm.traverse(o=>{ if(o.name==='Head')head=o; if(o.name==='headfront')front=o; });
    const hp=new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
    const fp=new THREE.Vector3().setFromMatrixPosition(front.matrixWorld);
    const fwd={x:-Math.sin(G.yaw), z:-Math.cos(G.yaw)};
    const dot=(fp.x-hp.x)*fwd.x+(fp.z-hp.z)*fwd.z;
    // Render-verified: face = local +Z (headfront bone agrees). Default yaw+PI
    // points the face along player-forward (away from camera) => dot > 0.
    console.log('facing default dot:', dot.toFixed(3), '(expect > 0 = back to camera)');
    ok.facingDefaultBack = dot>0;
    G.settings.flipChar = true; frame(2);
    pm.updateMatrixWorld(true);
    const fp2=new THREE.Vector3().setFromMatrixPosition(front.matrixWorld);
    const hp2=new THREE.Vector3().setFromMatrixPosition(head.matrixWorld);
    const dot2=(fp2.x-hp2.x)*fwd.x+(fp2.z-hp2.z)*fwd.z;
    console.log('facing flipped dot:', dot2.toFixed(3), '(expect < 0)');
    ok.facingToggleFlips = dot2<0;
    G.settings.flipChar = false;
    // F key flips live and persists the setting
    key('KeyF'); frame(2);
    ok.fKeyFlips = G.settings.flipChar===true;
    key('KeyF'); frame(2);
    ok.fKeyFlipsBack = G.settings.flipChar===false;
  }
  ok.noErrors = errors.length===0;
  console.log(JSON.stringify(ok));
  const pass=Object.values(ok).every(Boolean);
  console.log(pass?'REALCHECK OK':'REALCHECK FAIL');
  if(errors[0])console.log(errors[0].split('\n').slice(0,3).join('\n'));
  process.exit(pass?0:1);
}));
