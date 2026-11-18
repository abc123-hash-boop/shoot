import * as THREE from 'three';
import { Sfx } from './audio';

export type Phase = 'menu' | 'playing' | 'paused' | 'over';

export interface RadarDot {
  x: number;
  y: number;
  k: number; // 0 grunt, 1 runner, 2 tank
}

export interface HudState {
  hp: number;
  maxHp: number;
  weapon: number;
  weaponName: string;
  mag: number;
  magSize: number;
  reserve: number;
  reloading: number; // -1 or 0..1
  score: number;
  kills: number;
  headshots: number;
  accuracy: number;
  wave: number;
  remaining: number;
  spread: number;
  banner: string;
  bannerSub: string;
  bannerSeq: number;
  hitSeq: number;
  hitKind: number; // 0 body, 1 head, 2 kill, 3 headshot kill
  dmgSeq: number;
  dmgAngle: number;
  pickupSeq: number;
  pickupText: string;
  radar: RadarDot[];
  best: number;
  sprinting: boolean;
}

export interface GameCallbacks {
  onHud: (h: HudState) => void;
  onPhase: (p: Phase) => void;
}

const HALF = 30;
const EYE = 1.7;
const PR = 0.4;
const RADAR_RANGE = 36;
const rand = (a: number, b: number) => a + Math.random() * (b - a);

interface WeaponDef {
  name: string;
  auto: boolean;
  dmg: number;
  head: number;
  pellets: number;
  delay: number;
  mag: number;
  reload: number;
  reloadPer: number;
  baseSpread: number;
  add: number;
  max: number;
  recover: number;
  pelletSpread: number;
  kick: number;
  startReserve: number;
  reserveMax: number;
  ammoPickup: number;
}

const WEAPONS: WeaponDef[] = [
  {
    name: '突击步枪', auto: true, dmg: 24, head: 2.5, pellets: 1, delay: 0.09, mag: 30, reload: 1.7, reloadPer: 0,
    baseSpread: 0.003, add: 0.0055, max: 0.034, recover: 0.09, pelletSpread: 0, kick: 0.011,
    startReserve: 120, reserveMax: 240, ammoPickup: 40,
  },
  {
    name: '霰弹枪', auto: false, dmg: 13, head: 1.6, pellets: 9, delay: 0.85, mag: 6, reload: 0.5, reloadPer: 0.42,
    baseSpread: 0.012, add: 0.0, max: 0.012, recover: 0.1, pelletSpread: 0.055, kick: 0.07,
    startReserve: 24, reserveMax: 48, ammoPickup: 8,
  },
];

interface KindDef {
  hp: number; speed: number; range: number; fire: number; dmg: number; pspeed: number;
  scale: number; score: number; color: number; glow: number; melee: boolean; idx: number;
}
const KINDS: Record<string, KindDef> = {
  grunt: { hp: 70, speed: 3.3, range: 14, fire: 2.0, dmg: 9, pspeed: 21, scale: 1, score: 100, color: 0x3d4a63, glow: 0xff3b30, melee: false, idx: 0 },
  runner: { hp: 42, speed: 6.6, range: 0, fire: 0.8, dmg: 12, pspeed: 0, scale: 0.9, score: 120, color: 0x2f5d3a, glow: 0xb6ff3a, melee: true, idx: 1 },
  tank: { hp: 300, speed: 2.1, range: 18, fire: 1.3, dmg: 12, pspeed: 25, scale: 1.45, score: 300, color: 0x5a3030, glow: 0xff9d00, melee: false, idx: 2 },
};

interface Box { minX: number; maxX: number; minZ: number; maxZ: number; h: number }

// x, z, w, d, h
const LAYOUT: [number, number, number, number, number][] = [
  [-10, -9, 4, 4, 2.2], [10, -9, 4, 4, 2.2], [-10, 9, 4, 4, 2.2], [10, 9, 4, 4, 2.2],
  [0, -17, 12, 1.4, 3.2], [0, 17, 12, 1.4, 3.2],
  [-22, 0, 1.4, 10, 3.2], [22, 0, 1.4, 10, 3.2],
  [-19, -19, 2.4, 2.4, 6], [19, -19, 2.4, 2.4, 6], [-19, 19, 2.4, 2.4, 6], [19, 19, 2.4, 2.4, 6],
  [-5, -13, 2, 2, 1.6], [5, 13, 2, 2, 1.6], [-14, 3, 2, 2, 1.6], [14, -3, 2, 2, 1.6],
  [-4, 7, 1.6, 1.6, 1.2], [4, -7, 1.6, 1.6, 1.2], [-15, -14, 2, 2, 2], [15, 14, 2, 2, 2],
];

const SPAWNS: [number, number][] = [
  [-26, -26], [0, -26], [26, -26], [-26, 0], [26, 0], [-26, 26], [0, 26], [26, 26],
  [-26, -12], [26, 12], [-12, 26], [12, -26],
];

interface Enemy {
  kind: string;
  def: KindDef;
  group: THREE.Group;
  parts: THREE.Mesh[];
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
  glowMat: THREE.MeshStandardMaterial;
  flashMats: THREE.MeshStandardMaterial[];
  barGroup: THREE.Group;
  barFg: THREE.Mesh;
  hp: number;
  maxHp: number;
  x: number;
  z: number;
  atkT: number;
  windup: number;
  strafeDir: number;
  strafeT: number;
  walkT: number;
  flashT: number;
  spawnT: number;
  losT: number;
  los: boolean;
  stuck: number;
  detour: number;
}

interface Projectile {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  dmg: number;
  life: number;
  sx: number;
  sz: number;
}

interface Pickup {
  group: THREE.Group;
  type: 'health' | 'ammo';
  life: number;
  t: number;
}

interface Particle {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  life: number;
  max: number;
  grav: number;
}

export const INITIAL_HUD: HudState = {
  hp: 100, maxHp: 100, weapon: 0, weaponName: WEAPONS[0].name, mag: 30, magSize: 30, reserve: 120, reloading: -1,
  score: 0, kills: 0, headshots: 0, accuracy: 0, wave: 0, remaining: 0, spread: 0.003,
  banner: '', bannerSub: '', bannerSeq: 0, hitSeq: 0, hitKind: 0, dmgSeq: 0, dmgAngle: 0,
  pickupSeq: 0, pickupText: '', radar: [], best: 0, sprinting: false,
};

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function speckle(g: CanvasRenderingContext2D, s: number, n: number, a: number) {
  for (let i = 0; i < n; i++) {
    const v = Math.random() < 0.5 ? 0 : 255;
    g.fillStyle = `rgba(${v},${v},${v},${Math.random() * a})`;
    g.fillRect(Math.random() * s, Math.random() * s, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

function boxGeo(w: number, h: number, d: number, tile: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let i = 0; i < uv.count; i++) {
    const f = Math.floor(i / 4);
    uv.setXY(i, (uv.getX(i) * dims[f][0]) / tile, (uv.getY(i) * dims[f][1]) / tile);
  }
  return g;
}

export class Game {
  phase: Phase = 'menu';
  private cb: GameCallbacks;
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private gunScene = new THREE.Scene();
  private gunCam: THREE.PerspectiveCamera;
  private gunRoot = new THREE.Group();
  private rifleModel = new THREE.Group();
  private shotgunModel = new THREE.Group();
  private pump = new THREE.Object3D();
  private flashMesh: THREE.Mesh;
  private flashLight: THREE.PointLight;
  private gunFlashLight: THREE.PointLight;
  private sfx = new Sfx();
  private raf = 0;
  private last = 0;
  private disposed = false;
  private keys = new Set<string>();
  private mouseDown = false;
  private fallback = false;

  // world
  private boxes: Box[] = [];
  private obstacleMeshes: THREE.Mesh[] = [];
  private worldMeshes: THREE.Object3D[] = [];
  private shotRay = new THREE.Raycaster();
  private losRay = new THREE.Raycaster();

  // player
  private px = 0;
  private pz = 0;
  private py = 0;
  private vx = 0;
  private vz = 0;
  private vy = 0;
  private yaw = 0;
  private pitch = 0;
  private hp = 100;
  private bobT = 0;
  private shake = 0;
  private onGround = true;
  private sprinting = false;

  // weapons
  private cur = 0;
  private mags = [WEAPONS[0].mag, WEAPONS[1].mag];
  private reserves = [WEAPONS[0].startReserve, WEAPONS[1].startReserve];
  private cooldown = 0;
  private reloadT = -1;
  private reloadDur = 0;
  private spread = 0.003;
  private gunKick = 0;
  private pumpT = 0;
  private switchT = 0;
  private swayX = 0;
  private swayY = 0;
  private flashT = 0;

  // game state
  private score = 0;
  private kills = 0;
  private headshots = 0;
  private shots = 0;
  private hitsLanded = 0;
  private best = 0;
  private wave = 0;
  private waveActive = false;
  private breakT = 1.5;
  private queue: string[] = [];
  private spawnT = 0;
  private enemies: Enemy[] = [];
  private projectiles: Projectile[] = [];
  private pickups: Pickup[] = [];
  private particles: Particle[] = [];
  private tracers: { mesh: THREE.Mesh; life: number }[] = [];
  private tracerIdx = 0;
  private decals: THREE.Mesh[] = [];
  private decalIdx = 0;
  private banner = '';
  private bannerSub = '';
  private bannerSeq = 0;
  private hitSeq = 0;
  private hitKind = 0;
  private dmgSeq = 0;
  private dmgAngle = 0;
  private pickupSeq = 0;
  private pickupText = '';
  private hudT = 0;
  private menuT = 0;

  // shared resources
  private projGeo = new THREE.SphereGeometry(0.15, 10, 10);
  private projMats: THREE.MeshBasicMaterial[] = [];
  private partGeo = new THREE.BoxGeometry(0.07, 0.07, 0.07);
  private tracerMat = new THREE.MeshBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  private tracerGeo = new THREE.BoxGeometry(1, 1, 1);
  private darkMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.5, metalness: 0.6 });

  // bound handlers
  private handlers: [EventTarget, string, EventListener][] = [];

  constructor(container: HTMLElement, cb: GameCallbacks) {
    this.container = container;
    this.cb = cb;
    try {
      this.best = Number(localStorage.getItem('arena-best') || 0);
    } catch {
      this.best = 0;
    }

    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.outline = 'none';
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(78, w / h, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.gunCam = new THREE.PerspectiveCamera(55, w / h, 0.01, 10);

    for (const c of [0xff5a2a, 0xffcc33, 0xff2a2a]) {
      this.projMats.push(new THREE.MeshBasicMaterial({ color: c }));
    }

    this.buildWorld();
    this.buildGun();

    this.flashMesh = this.gunRoot.getObjectByName('flash') as THREE.Mesh;
    this.flashLight = new THREE.PointLight(0xffb060, 0, 14, 2);
    this.scene.add(this.flashLight);
    this.gunFlashLight = new THREE.PointLight(0xffb060, 0, 3, 2);
    this.gunScene.add(this.gunFlashLight);

    // pools
    for (let i = 0; i < 32; i++) {
      const m = new THREE.Mesh(this.tracerGeo, this.tracerMat);
      m.visible = false;
      this.scene.add(m);
      this.tracers.push({ mesh: m, life: 0 });
    }
    const decalGeo = new THREE.CircleGeometry(0.07, 8);
    const decalMat = new THREE.MeshBasicMaterial({
      color: 0x000000, transparent: true, opacity: 0.55, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -4,
    });
    for (let i = 0; i < 50; i++) {
      const m = new THREE.Mesh(decalGeo, decalMat);
      m.visible = false;
      this.scene.add(m);
      this.decals.push(m);
    }
    for (let i = 0; i < 260; i++) {
      const m = new THREE.Mesh(this.partGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      m.visible = false;
      this.scene.add(m);
      this.particles.push({ mesh: m, vel: new THREE.Vector3(), life: 0, max: 1, grav: 0 });
    }

    this.bindEvents();
    this.resetState();
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.loop);
    this.flush(true);
  }

  // ---------------------------------------------------------------- world
  private buildWorld() {
    const scene = this.scene;
    scene.fog = new THREE.Fog(0x1b1830, 45, 150);

    // sky
    const skyTex = canvasTex(512, (g, s) => {
      const grd = g.createLinearGradient(0, 0, 0, s);
      grd.addColorStop(0, '#05060f');
      grd.addColorStop(0.45, '#1a1536');
      grd.addColorStop(0.7, '#5a2c52');
      grd.addColorStop(0.86, '#d9693f');
      grd.addColorStop(1, '#2a1830');
      g.fillStyle = grd;
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 160; i++) {
        g.fillStyle = `rgba(255,255,255,${Math.random() * 0.8})`;
        g.fillRect(Math.random() * s, Math.random() * s * 0.4, 1.2, 1.2);
      }
    }, false);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(300, 32, 16),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }),
    );
    scene.add(sky);

    // textures
    const floorTex = canvasTex(256, (g, s) => {
      g.fillStyle = '#383d46';
      g.fillRect(0, 0, s, s);
      speckle(g, s, 1800, 0.12);
      g.strokeStyle = '#1f2229';
      g.lineWidth = 4;
      g.strokeRect(0, 0, s, s);
      g.strokeStyle = 'rgba(120,200,255,0.22)';
      g.lineWidth = 1.5;
      g.strokeRect(6, 6, s - 12, s - 12);
      g.fillStyle = 'rgba(255,255,255,0.08)';
      g.fillRect(s / 2 - 1, 0, 2, s);
      g.fillRect(0, s / 2 - 1, s, 2);
    });
    floorTex.repeat.set(HALF / 2, HALF / 2);

    const crateTex = canvasTex(256, (g, s) => {
      g.fillStyle = '#9a6a35';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 4; i++) {
        g.fillStyle = i % 2 ? '#8d5f2e' : '#a87a42';
        g.fillRect(0, (i * s) / 4, s, s / 4);
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(0, (i * s) / 4, s, 3);
      }
      for (let i = 0; i < 90; i++) {
        g.fillStyle = `rgba(60,30,10,${Math.random() * 0.25})`;
        g.fillRect(Math.random() * s, Math.random() * s, 20 + Math.random() * 50, 1);
      }
      g.strokeStyle = '#4b2f14';
      g.lineWidth = 22;
      g.strokeRect(11, 11, s - 22, s - 22);
      g.lineWidth = 12;
      g.beginPath();
      g.moveTo(14, 14); g.lineTo(s - 14, s - 14);
      g.moveTo(s - 14, 14); g.lineTo(14, s - 14);
      g.stroke();
      g.fillStyle = '#c9a56a';
      for (const [x, y] of [[14, 14], [s - 14, 14], [14, s - 14], [s - 14, s - 14]]) {
        g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill();
      }
    });

    const concreteTex = canvasTex(256, (g, s) => {
      g.fillStyle = '#5d6471';
      g.fillRect(0, 0, s, s);
      speckle(g, s, 2500, 0.18);
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 3;
      g.strokeRect(0, 0, s, s);
      g.beginPath(); g.moveTo(0, s / 2); g.lineTo(s, s / 2); g.stroke();
      g.fillStyle = '#35d0ff';
      g.fillRect(14, s / 2 - 14, s - 28, 4);
      g.fillStyle = 'rgba(53,208,255,0.25)';
      g.fillRect(14, s / 2 - 18, s - 28, 12);
    });

    const wallTex = canvasTex(256, (g, s) => {
      g.fillStyle = '#2a2f3d';
      g.fillRect(0, 0, s, s);
      speckle(g, s, 1500, 0.1);
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 3;
      g.strokeRect(0, 0, s, s);
      g.beginPath(); g.moveTo(s / 2, 0); g.lineTo(s / 2, s * 0.8); g.stroke();
      // hazard band
      g.save();
      g.beginPath(); g.rect(0, s * 0.86, s, s * 0.14); g.clip();
      g.fillStyle = '#e8b81a';
      g.fillRect(0, s * 0.86, s, s * 0.14);
      g.fillStyle = '#16181f';
      for (let x = -s; x < s * 2; x += 36) {
        g.beginPath();
        g.moveTo(x, s); g.lineTo(x + 18, s); g.lineTo(x + 18 + 36, s * 0.86); g.lineTo(x + 36, s * 0.86);
        g.fill();
      }
      g.restore();
      g.fillStyle = '#ff4a3a';
      g.fillRect(s * 0.1, s * 0.12, s * 0.3, 5);
    });

    // ground
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(HALF * 2, HALF * 2),
      new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85, metalness: 0.15 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    scene.add(floor);
    this.worldMeshes.push(floor);

    // outer ground
    const outer = new THREE.Mesh(
      new THREE.PlaneGeometry(600, 600),
      new THREE.MeshStandardMaterial({ color: 0x14131f, roughness: 1 }),
    );
    outer.rotation.x = -Math.PI / 2;
    outer.position.y = -0.05;
    scene.add(outer);

    // perimeter walls
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.7, metalness: 0.3 });
    const T = 2;
    const WH = 8;
    const wallDefs: [number, number, number, number][] = [
      [0, -HALF - T / 2, HALF * 2 + T * 2, T],
      [0, HALF + T / 2, HALF * 2 + T * 2, T],
      [-HALF - T / 2, 0, T, HALF * 2],
      [HALF + T / 2, 0, T, HALF * 2],
    ];
    for (const [x, z, w, d] of wallDefs) {
      const m = new THREE.Mesh(boxGeo(w, WH, d, 8), wallMat);
      m.position.set(x, WH / 2, z);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      this.worldMeshes.push(m);
      this.obstacleMeshes.push(m);
    }

    // obstacles
    const crateMat = new THREE.MeshStandardMaterial({ map: crateTex, roughness: 0.8 });
    const concMat = new THREE.MeshStandardMaterial({ map: concreteTex, roughness: 0.75, metalness: 0.1 });
    for (const [x, z, w, d, h] of LAYOUT) {
      const isCrate = h <= 2.2;
      const isPillar = h >= 6;
      const mat = isPillar ? wallMat : isCrate ? crateMat : concMat;
      const m = new THREE.Mesh(boxGeo(w, h, d, isPillar ? 6 : isCrate ? 2 : 3.2), mat);
      m.position.set(x, h / 2, z);
      m.castShadow = true;
      m.receiveShadow = true;
      scene.add(m);
      this.worldMeshes.push(m);
      this.obstacleMeshes.push(m);
      this.boxes.push({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2, h });
      if (isPillar) {
        const cap = new THREE.Mesh(
          new THREE.BoxGeometry(w + 0.2, 0.2, d + 0.2),
          new THREE.MeshBasicMaterial({ color: 0x35d0ff }),
        );
        cap.position.set(x, h + 0.1, z);
        scene.add(cap);
      }
    }

    // skyline
    const winTex = canvasTex(128, (g, s) => {
      g.fillStyle = '#0d0f1a';
      g.fillRect(0, 0, s, s);
      for (let y = 4; y < s; y += 10) {
        for (let x = 4; x < s; x += 10) {
          if (Math.random() < 0.28) {
            g.fillStyle = Math.random() < 0.5 ? '#ffd27a' : '#6fd6ff';
            g.globalAlpha = 0.4 + Math.random() * 0.6;
            g.fillRect(x, y, 5, 6);
            g.globalAlpha = 1;
          }
        }
      }
    });
    const bm = new THREE.MeshBasicMaterial({ map: winTex });
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2 + Math.random() * 0.1;
      const r = rand(58, 110);
      const bw = rand(8, 18);
      const bh = rand(14, 60);
      const geo = boxGeo(bw, bh, rand(8, 18), 14);
      const b = new THREE.Mesh(geo, bm);
      b.position.set(Math.cos(a) * r, bh / 2, Math.sin(a) * r);
      b.rotation.y = Math.random() * 3;
      scene.add(b);
    }

    // lights
    scene.add(new THREE.HemisphereLight(0x9aa4d8, 0x2d2336, 1.0));
    const sun = new THREE.DirectionalLight(0xcdd6ff, 1.5);
    sun.position.set(22, 42, 14);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = -38; sc.right = 38; sc.top = 38; sc.bottom = -38; sc.near = 5; sc.far = 110;
    sun.shadow.bias = -0.0006;
    sun.shadow.normalBias = 0.04;
    scene.add(sun);

    const poleCols = [0xff6a2a, 0x35d0ff, 0x35d0ff, 0xff6a2a];
    [[-26, -26], [26, -26], [-26, 26], [26, 26]].forEach(([x, z], i) => {
      const col = poleCols[i];
      const l = new THREE.PointLight(col, 90, 48, 2);
      l.position.set(x, 6, z);
      scene.add(l);
      const pole = new THREE.Mesh(new THREE.BoxGeometry(0.4, 6, 0.4), this.darkMat);
      pole.position.set(x, 3, z);
      scene.add(pole);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.9), new THREE.MeshBasicMaterial({ color: col }));
      lamp.position.set(x, 6.1, z);
      scene.add(lamp);
    });

    // gun-scene lights
    this.gunScene.add(new THREE.AmbientLight(0xffffff, 1.3));
    const gl = new THREE.DirectionalLight(0xffffff, 2.4);
    gl.position.set(1, 2, 1.5);
    this.gunScene.add(gl);
    const gl2 = new THREE.DirectionalLight(0x6fa0ff, 1.0);
    gl2.position.set(-2, -1, 0.5);
    this.gunScene.add(gl2);
  }

  // ---------------------------------------------------------------- gun models
  private buildGun() {
    const M = (c: number, r = 0.5, m = 0.6, e = 0x000000, ei = 0) =>
      new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m, emissive: e, emissiveIntensity: ei });
    const dark = M(0x1b1e25, 0.45, 0.75);
    const mid = M(0x3b414d, 0.5, 0.6);
    const acc = M(0xff7a1a, 0.5, 0.2, 0xff5a00, 0.6);
    const wood = M(0x6b4423, 0.8, 0.05);
    const glove = M(0x22252b, 0.9, 0.05);
    const box = (p: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, rx = 0) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.rotation.x = rx;
      p.add(m);
      return m;
    };
    const cyl = (p: THREE.Object3D, r: number, len: number, mat: THREE.Material, x: number, y: number, z: number) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 12), mat);
      m.rotation.x = Math.PI / 2;
      m.position.set(x, y, z);
      p.add(m);
      return m;
    };

    // rifle
    const r = this.rifleModel;
    box(r, 0.07, 0.11, 0.5, dark, 0, 0, -0.05);
    box(r, 0.06, 0.075, 0.3, mid, 0, 0.005, -0.46);
    cyl(r, 0.014, 0.32, dark, 0, 0.01, -0.78);
    cyl(r, 0.022, 0.07, mid, 0, 0.01, -0.95);
    box(r, 0.05, 0.17, 0.09, mid, 0, -0.13, -0.02, 0.15);
    box(r, 0.045, 0.11, 0.055, dark, 0, -0.1, 0.17, -0.3);
    box(r, 0.055, 0.1, 0.26, mid, 0, -0.02, 0.33);
    box(r, 0.02, 0.03, 0.04, dark, 0, 0.075, -0.3);
    box(r, 0.02, 0.035, 0.025, dark, 0, 0.078, 0.1);
    box(r, 0.074, 0.016, 0.22, acc, 0, 0.03, -0.05);
    box(r, 0.075, 0.075, 0.13, glove, 0, -0.065, -0.48);
    box(r, 0.065, 0.09, 0.09, glove, 0, -0.11, 0.17, -0.3);
    const rm = new THREE.Object3D();
    rm.position.set(0, 0.01, -0.98);
    rm.name = 'muzzle0';
    r.add(rm);

    // shotgun
    const s = this.shotgunModel;
    box(s, 0.08, 0.11, 0.42, dark, 0, 0, 0);
    cyl(s, 0.024, 0.75, mid, 0, 0.025, -0.55);
    cyl(s, 0.02, 0.6, dark, 0, -0.03, -0.5);
    cyl(s, 0.03, 0.04, mid, 0, 0.025, -0.93);
    box(s, 0.03, 0.025, 0.03, acc, 0, 0.065, -0.92);
    this.pump.position.set(0, 0, 0);
    s.add(this.pump);
    box(this.pump, 0.075, 0.065, 0.22, wood, 0, -0.04, -0.5);
    box(this.pump, 0.08, 0.075, 0.12, glove, 0, -0.045, -0.5);
    box(s, 0.06, 0.13, 0.36, wood, 0, -0.035, 0.34, -0.08);
    box(s, 0.045, 0.11, 0.055, dark, 0, -0.1, 0.12, -0.3);
    box(s, 0.065, 0.09, 0.09, glove, 0, -0.11, 0.12, -0.3);
    const sm = new THREE.Object3D();
    sm.position.set(0, 0.025, -0.96);
    sm.name = 'muzzle1';
    s.add(sm);

    // muzzle flash
    const flashTex = canvasTex(128, (g, sz) => {
      const grd = g.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
      grd.addColorStop(0, 'rgba(255,255,230,1)');
      grd.addColorStop(0.25, 'rgba(255,200,90,0.9)');
      grd.addColorStop(0.6, 'rgba(255,110,20,0.35)');
      grd.addColorStop(1, 'rgba(255,60,0,0)');
      g.fillStyle = grd;
      g.fillRect(0, 0, sz, sz);
      g.fillStyle = 'rgba(255,230,160,0.9)';
      for (let i = 0; i < 6; i++) {
        g.save();
        g.translate(sz / 2, sz / 2);
        g.rotate((i * Math.PI) / 3 + 0.3);
        g.fillRect(-1.5, 0, 3, sz * 0.48);
        g.restore();
      }
    }, false);
    const flash = new THREE.Mesh(
      new THREE.PlaneGeometry(0.55, 0.55),
      new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false }),
    );
    flash.name = 'flash';
    flash.visible = false;
    flash.renderOrder = 10;
    this.gunRoot.add(flash);

    this.gunRoot.add(r);
    this.gunRoot.add(s);
    this.gunScene.add(this.gunRoot);
    this.gunScene.add(this.gunCam);
    this.gunRoot.visible = false;
  }

  // ---------------------------------------------------------------- events
  private on(target: EventTarget, type: string, fn: (e: never) => void) {
    target.addEventListener(type, fn as EventListener);
    this.handlers.push([target, type, fn as EventListener]);
  }

  private get locked() {
    return document.pointerLockElement === this.renderer.domElement;
  }

  private bindEvents() {
    const cv = this.renderer.domElement;
    this.on(window, 'keydown', (e: KeyboardEvent) => {
      if (this.phase === 'playing') {
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
        if (!e.repeat) {
          if (e.code === 'KeyR') this.startReload();
          if (e.code === 'Digit1') this.switchWeapon(0);
          if (e.code === 'Digit2') this.switchWeapon(1);
          if (e.code === 'KeyQ') this.switchWeapon(1 - this.cur);
          if (e.code === 'Escape' || e.code === 'KeyP') this.pause();
          if (e.code === 'KeyM') this.sfx.muted = !this.sfx.muted;
        }
      } else if (this.phase === 'paused' && e.code === 'KeyP' && !e.repeat) {
        this.resume();
      }
      this.keys.add(e.code);
    });
    this.on(window, 'keyup', (e: KeyboardEvent) => this.keys.delete(e.code));
    this.on(window, 'blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    this.on(window, 'mousemove', (e: MouseEvent) => {
      if (this.phase !== 'playing') return;
      if (!this.locked && !this.fallback) return;
      const mx = Math.abs(e.movementX) > 300 ? 0 : e.movementX;
      const my = Math.abs(e.movementY) > 300 ? 0 : e.movementY;
      this.yaw -= mx * 0.0022;
      this.pitch -= my * 0.0022;
      this.swayX += mx * 0.00025;
      this.swayY += my * 0.00025;
    });
    this.on(window, 'mousedown', (e: MouseEvent) => {
      if (this.phase !== 'playing') return;
      if (!this.locked) this.requestLock();
      if (e.button === 0) this.mouseDown = true;
    });
    this.on(window, 'mouseup', (e: MouseEvent) => {
      if (e.button === 0) this.mouseDown = false;
    });
    this.on(window, 'wheel', (e: WheelEvent) => {
      if (this.phase === 'playing' && Math.abs(e.deltaY) > 4) this.switchWeapon(1 - this.cur);
    });
    this.on(window, 'contextmenu', (e: Event) => e.preventDefault());
    this.on(document, 'pointerlockchange', () => {
      if (this.locked) {
        this.fallback = false;
      } else if (this.phase === 'playing') {
        this.pause();
      }
    });
    this.on(document, 'pointerlockerror', () => {
      this.fallback = true;
    });
    this.on(window, 'resize', () => this.resize());
    void cv;
  }

  private requestLock() {
    try {
      const r = this.renderer.domElement.requestPointerLock() as unknown as Promise<void> | undefined;
      if (r && typeof r.catch === 'function') r.catch(() => { this.fallback = true; });
    } catch {
      this.fallback = true;
    }
  }

  private resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.gunCam.aspect = w / h;
    this.gunCam.updateProjectionMatrix();
  }

  // ---------------------------------------------------------------- public control
  start() {
    this.sfx.init();
    this.resetState();
    this.setPhase('playing');
    this.requestLock();
    this.sfx.wave();
  }

  resume() {
    if (this.phase !== 'paused') return;
    this.sfx.init();
    this.setPhase('playing');
    this.requestLock();
  }

  pause() {
    if (this.phase !== 'playing') return;
    this.mouseDown = false;
    this.keys.clear();
    this.setPhase('paused');
    if (this.locked) document.exitPointerLock();
  }

  toMenu() {
    this.resetState();
    this.setPhase('menu');
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    for (const [t, ty, fn] of this.handlers) t.removeEventListener(ty, fn);
    if (document.pointerLockElement) document.exitPointerLock();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  private setPhase(p: Phase) {
    this.phase = p;
    this.gunRoot.visible = p === 'playing' || p === 'paused';
    this.cb.onPhase(p);
    this.flush(true);
  }

  private resetState() {
    this.px = 0; this.pz = 0; this.py = 0; this.vx = 0; this.vz = 0; this.vy = 0;
    this.yaw = 0; this.pitch = 0; this.hp = 100; this.shake = 0; this.onGround = true;
    this.cur = 0;
    this.mags = [WEAPONS[0].mag, WEAPONS[1].mag];
    this.reserves = [WEAPONS[0].startReserve, WEAPONS[1].startReserve];
    this.cooldown = 0; this.reloadT = -1; this.spread = WEAPONS[0].baseSpread;
    this.gunKick = 0; this.switchT = 0;
    this.rifleModel.visible = true;
    this.shotgunModel.visible = false;
    this.score = 0; this.kills = 0; this.headshots = 0; this.shots = 0; this.hitsLanded = 0;
    this.wave = 0; this.waveActive = false; this.breakT = 1.8; this.queue = []; this.spawnT = 0;
    for (const e of this.enemies) this.scene.remove(e.group);
    this.enemies = [];
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    this.projectiles = [];
    for (const p of this.pickups) this.scene.remove(p.group);
    this.pickups = [];
    for (const p of this.particles) { p.life = 0; p.mesh.visible = false; }
    for (const d of this.decals) d.visible = false;
    this.mouseDown = false;
    this.keys.clear();
    this.banner = '';
  }

  // ---------------------------------------------------------------- main loop
  private loop = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    this.update(dt);
    this.render();
  };

  private render() {
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);
    if (this.gunRoot.visible) {
      this.renderer.clearDepth();
      this.renderer.render(this.gunScene, this.gunCam);
    }
  }

  private update(dt: number) {
    if (this.phase === 'playing') {
      this.updatePlayer(dt);
      this.updateWeapon(dt);
      this.updateWaves(dt);
      this.updateEnemies(dt);
      this.updateProjectiles(dt);
      this.updatePickups(dt);
    } else if (this.phase === 'menu' || this.phase === 'over') {
      this.menuT += dt * 0.12;
      const r = 24;
      this.camera.position.set(Math.cos(this.menuT) * r, 9 + Math.sin(this.menuT * 1.7) * 1.5, Math.sin(this.menuT) * r);
      this.camera.lookAt(0, 2, 0);
      this.camera.rotation.z = 0;
      if (this.phase === 'over') {
        this.updateEnemies(dt, true);
      }
    }
    this.updateEffects(dt);
    this.hudT += dt;
    if (this.hudT > 0.06) {
      this.hudT = 0;
      this.flush();
    }
  }

  // ---------------------------------------------------------------- collision
  private collides(x: number, z: number, r: number, feetY = 0) {
    if (x < -HALF + r || x > HALF - r || z < -HALF + r || z > HALF - r) return true;
    for (const b of this.boxes) {
      if (feetY >= b.h - 0.05) continue;
      if (x > b.minX - r && x < b.maxX + r && z > b.minZ - r && z < b.maxZ + r) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- player
  private updatePlayer(dt: number) {
    const k = this.keys;
    // arrow-key look
    const lookSpd = 2.2;
    if (k.has('ArrowLeft')) this.yaw += lookSpd * dt;
    if (k.has('ArrowRight')) this.yaw -= lookSpd * dt;
    if (k.has('ArrowUp')) this.pitch += lookSpd * dt;
    if (k.has('ArrowDown')) this.pitch -= lookSpd * dt;
    this.pitch = Math.max(-1.52, Math.min(1.52, this.pitch));

    let ix = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
    let iz = (k.has('KeyS') ? 1 : 0) - (k.has('KeyW') ? 1 : 0);
    const len = Math.hypot(ix, iz);
    if (len > 0) { ix /= len; iz /= len; }
    this.sprinting = (k.has('ShiftLeft') || k.has('ShiftRight')) && iz < -0.1 && this.reloadT < 0;
    const speed = this.sprinting ? 9 : 5.6;
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    const tx = (ix * cos + iz * sin) * speed;
    const tz = (-ix * sin + iz * cos) * speed;
    const accel = this.onGround ? 14 : 3.5;
    const f = Math.min(1, accel * dt);
    this.vx += (tx - this.vx) * f;
    this.vz += (tz - this.vz) * f;

    if (k.has('Space') && this.onGround) {
      this.vy = 8.2;
      this.onGround = false;
      this.sfx.jump();
    }
    this.vy -= 24 * dt;
    this.py += this.vy * dt;
    if (this.py <= 0) {
      if (!this.onGround && this.vy < -6) this.sfx.land();
      this.py = 0;
      this.vy = 0;
      this.onGround = true;
    }

    const nx = this.px + this.vx * dt;
    if (!this.collides(nx, this.pz, PR, this.py)) this.px = nx; else this.vx = 0;
    const nz = this.pz + this.vz * dt;
    if (!this.collides(this.px, nz, PR, this.py)) this.pz = nz; else this.vz = 0;

    const hs = Math.hypot(this.vx, this.vz);
    if (this.onGround) this.bobT += hs * dt * 1.5;
    const bob = this.onGround ? Math.sin(this.bobT * 2) * 0.035 * Math.min(1, hs / 5) : 0;

    this.shake = Math.max(0, this.shake - dt * 1.6);
    const camY = this.py + EYE + bob;
    this.camera.position.set(this.px, camY, this.pz);
    this.camera.rotation.set(this.pitch, this.yaw, (Math.random() - 0.5) * this.shake * 0.08 + Math.sin(this.bobT) * 0.002 * Math.min(1, hs / 5));
    this.camera.fov += ((this.sprinting ? 86 : 78) - this.camera.fov) * Math.min(1, dt * 8);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();
    this.flashLight.position.copy(this.camera.position);
  }

  // ---------------------------------------------------------------- weapons
  private switchWeapon(i: number) {
    if (i === this.cur || this.switchT > 0) return;
    this.reloadT = -1;
    this.cur = i;
    this.switchT = 0.34;
    this.cooldown = Math.max(this.cooldown, 0.3);
    this.spread = WEAPONS[i].baseSpread;
    this.sfx.switchWeapon();
  }

  private startReload() {
    const w = WEAPONS[this.cur];
    if (this.reloadT >= 0) return;
    const missing = w.mag - this.mags[this.cur];
    if (missing <= 0 || this.reserves[this.cur] <= 0) return;
    const n = Math.min(missing, this.reserves[this.cur]);
    this.reloadDur = w.reload + w.reloadPer * n;
    this.reloadT = 0;
    this.sfx.reload(this.cur === 1);
  }

  private updateWeapon(dt: number) {
    const w = WEAPONS[this.cur];
    this.cooldown -= dt;
    if (this.switchT > 0) {
      const before = this.switchT;
      this.switchT -= dt;
      if (before > 0.17 && this.switchT <= 0.17) {
        this.rifleModel.visible = this.cur === 0;
        this.shotgunModel.visible = this.cur === 1;
      }
    }
    if (this.reloadT >= 0) {
      this.reloadT += dt;
      if (this.reloadT >= this.reloadDur) {
        const missing = w.mag - this.mags[this.cur];
        const n = Math.min(missing, this.reserves[this.cur]);
        this.mags[this.cur] += n;
        this.reserves[this.cur] -= n;
        this.reloadT = -1;
      }
    }
    this.spread = Math.max(w.baseSpread, this.spread - w.recover * dt);

    if (this.mouseDown && this.cooldown <= 0 && this.reloadT < 0 && this.switchT <= 0 && !this.sprinting) {
      if (this.mags[this.cur] > 0) {
        this.shoot();
      } else if (this.reserves[this.cur] > 0) {
        this.startReload();
      } else {
        this.cooldown = 0.3;
        this.sfx.empty();
      }
    }
    if (this.mags[this.cur] === 0 && this.reserves[this.cur] > 0 && this.reloadT < 0 && this.cooldown <= 0 && this.switchT <= 0) {
      this.startReload();
    }

    // flash decay
    this.flashT -= dt;
    if (this.flashT <= 0) {
      this.flashMesh.visible = false;
      this.flashLight.intensity = 0;
      this.gunFlashLight.intensity = 0;
    }

    // gun animation
    this.gunKick = Math.max(0, this.gunKick - dt * (this.cur === 0 ? 14 : 5));
    this.pumpT = Math.max(0, this.pumpT - dt);
    this.swayX *= Math.max(0, 1 - dt * 10);
    this.swayY *= Math.max(0, 1 - dt * 10);
    const hs = Math.hypot(this.vx, this.vz);
    const mv = this.onGround ? Math.min(1, hs / 5.6) : 0;
    const bobX = Math.cos(this.bobT) * 0.012 * mv;
    const bobY = Math.abs(Math.sin(this.bobT)) * 0.014 * mv;
    let rx = 0, ry = 0, rz = 0, py = 0, pz = 0;
    // reload motion
    if (this.reloadT >= 0) {
      const p = Math.min(1, this.reloadT / this.reloadDur);
      const s = Math.sin(p * Math.PI);
      if (this.cur === 0) {
        rx -= s * 0.5; rz += s * 0.35; py -= s * 0.12;
      } else {
        rx -= s * 0.35; py -= s * 0.08;
        this.pump.position.z = Math.sin(p * Math.PI * 2 * Math.max(1, (this.reloadDur - 0.5) / 0.42)) * 0.04;
      }
    }
    // switch motion
    if (this.switchT > 0) {
      const p = this.switchT / 0.34;
      const d = 1 - Math.abs(p * 2 - 1); // 0 at ends, 1 in the middle (gun fully lowered)
      py -= d * 0.35;
      rx -= d * 0.6;
    }
    if (this.sprinting) {
      ry += 0.5; rx -= 0.25; py -= 0.04; pz += 0.02;
    }
    rx += this.gunKick * (this.cur === 0 ? 0.09 : 0.3);
    pz += this.gunKick * (this.cur === 0 ? 0.04 : 0.12);
    if (this.cur === 1) {
      const pp = this.pumpT > 0 ? Math.sin((1 - this.pumpT / 0.45) * Math.PI) : 0;
      if (this.reloadT < 0) this.pump.position.z = this.pumpT > 0 && this.pumpT < 0.45 ? pp * 0.14 : 0;
    } else {
      this.pump.position.z = 0;
    }
    this.gunRoot.position.set(0.17 + bobX - this.swayX * 0.6, -0.19 - bobY + py + this.swayY * 0.4, -0.35 + pz);
    this.gunRoot.rotation.set(rx + this.swayY * 0.6, 0.035 + ry + this.swayX * 1.2, rz);
  }

  private shoot() {
    const w = WEAPONS[this.cur];
    this.mags[this.cur]--;
    this.cooldown = w.delay;
    this.shots++;
    this.gunKick = 1;
    if (this.cur === 1) this.pumpT = 0.45 + 0.0;

    // spread
    const moving = Math.hypot(this.vx, this.vz) > 1;
    const curSpread = (w.pellets > 1 ? w.pelletSpread : this.spread) + (moving ? 0.008 : 0) + (this.onGround ? 0 : 0.03);

    const fwd = new THREE.Vector3();
    this.camera.getWorldDirection(fwd);
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
    const origin = this.camera.position.clone();
    const muzzle = this.camera.localToWorld(new THREE.Vector3(0.17, -0.15, -0.9));

    const targets: THREE.Object3D[] = [...this.worldMeshes];
    for (const e of this.enemies) for (const p of e.parts) targets.push(p);

    let bestKind = -1;
    let anyHit = false;
    const killed = new Set<Enemy>();
    for (let i = 0; i < w.pellets; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.sqrt(Math.random()) * curSpread;
      const dir = fwd.clone().addScaledVector(right, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
      this.shotRay.set(origin, dir);
      this.shotRay.far = 120;
      const hits = this.shotRay.intersectObjects(targets, false);
      let end = origin.clone().addScaledVector(dir, 90);
      if (hits.length) {
        const h = hits[0];
        end = h.point.clone();
        const en = h.object.userData.enemy as Enemy | undefined;
        if (en && !killed.has(en)) {
          anyHit = true;
          const head = !!h.object.userData.head;
          const dmg = w.dmg * (head ? w.head : 1);
          en.hp -= dmg;
          en.flashT = 0.09;
          this.burst(h.point, head ? 10 : 6, head ? 0xffd24a : 0xff3b2a, 3.5, 0.5, 9);
          let kind = head ? 1 : 0;
          if (en.hp <= 0) {
            killed.add(en);
            this.killEnemy(en, head);
            kind = head ? 3 : 2;
          } else {
            if (head) this.sfx.headshot(); else this.sfx.hit();
          }
          bestKind = Math.max(bestKind, kind);
        } else if (!en) {
          const n = h.face ? h.face.normal.clone().transformDirection(h.object.matrixWorld) : new THREE.Vector3(0, 1, 0);
          this.impact(h.point, n);
        }
      }
      if (this.cur === 1 || this.shots % 2 === 0) this.addTracer(muzzle, end);
    }
    if (anyHit) {
      this.hitsLanded++;
      this.hitSeq++;
      this.hitKind = bestKind;
    }

    // recoil
    const k = w.kick;
    this.pitch += k * (0.7 + Math.random() * 0.6);
    this.yaw += (Math.random() - 0.5) * k * 0.7;
    this.spread = Math.min(w.max, this.spread + w.add);

    // flash
    this.flashT = 0.045;
    this.flashMesh.visible = true;
    const mz = this.gunRoot.getObjectByName(`muzzle${this.cur}`)!;
    this.flashMesh.position.copy(mz.position);
    this.flashMesh.position.z -= 0.03;
    this.flashMesh.rotation.z = Math.random() * 6;
    this.flashMesh.scale.setScalar(this.cur === 1 ? 1.7 : 1 + Math.random() * 0.3);
    this.flashLight.intensity = this.cur === 1 ? 70 : 40;
    this.gunFlashLight.intensity = 6;
    this.gunFlashLight.position.set(0.17, -0.15, -0.9);

    if (this.cur === 0) this.sfx.rifle(); else this.sfx.shotgun();
    if (this.mags[this.cur] === 0 && this.reserves[this.cur] > 0) {
      // auto reload after a beat
      this.cooldown = Math.max(this.cooldown, 0.2);
    }
  }

  private addTracer(a: THREE.Vector3, b: THREE.Vector3) {
    const t = this.tracers[this.tracerIdx++ % this.tracers.length];
    const len = a.distanceTo(b);
    t.mesh.position.copy(a).lerp(b, 0.5);
    t.mesh.lookAt(b);
    t.mesh.scale.set(0.012, 0.012, len);
    t.mesh.visible = true;
    t.life = 0.05;
  }

  private impact(p: THREE.Vector3, n: THREE.Vector3) {
    // sparks
    for (let i = 0; i < 5; i++) {
      this.spawnParticle(p, n.clone().multiplyScalar(rand(1, 4)).add(new THREE.Vector3(rand(-1.5, 1.5), rand(0, 2.5), rand(-1.5, 1.5))), 0xffd070, 0.35, 8);
    }
    // decal
    const d = this.decals[this.decalIdx++ % this.decals.length];
    d.position.copy(p).addScaledVector(n, 0.012);
    d.lookAt(p.clone().add(n));
    d.visible = true;
  }

  private burst(p: THREE.Vector3, n: number, color: number, speed: number, life: number, grav: number) {
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(rand(-1, 1), rand(-0.3, 1.2), rand(-1, 1)).normalize().multiplyScalar(rand(0.3, 1) * speed);
      this.spawnParticle(p, v, color, life * rand(0.6, 1.2), grav);
    }
  }

  private spawnParticle(p: THREE.Vector3, v: THREE.Vector3, color: number, life: number, grav: number) {
    for (const q of this.particles) {
      if (q.life <= 0) {
        q.life = q.max = life;
        q.grav = grav;
        q.vel.copy(v);
        q.mesh.position.copy(p);
        (q.mesh.material as THREE.MeshBasicMaterial).color.setHex(color);
        q.mesh.visible = true;
        q.mesh.scale.setScalar(1);
        return;
      }
    }
  }

  private updateEffects(dt: number) {
    for (const q of this.particles) {
      if (q.life <= 0) continue;
      q.life -= dt;
      if (q.life <= 0) { q.mesh.visible = false; continue; }
      q.vel.y -= q.grav * dt;
      q.mesh.position.addScaledVector(q.vel, dt);
      if (q.mesh.position.y < 0.03) {
        q.mesh.position.y = 0.03;
        q.vel.multiplyScalar(0.4);
        q.vel.y = Math.abs(q.vel.y) * 0.3;
      }
      q.mesh.scale.setScalar(Math.max(0.1, q.life / q.max));
    }
    for (const t of this.tracers) {
      if (t.life > 0) {
        t.life -= dt;
        if (t.life <= 0) t.mesh.visible = false;
      }
    }
  }

  // ---------------------------------------------------------------- enemies
  private buildEnemy(kind: string): Enemy {
    const def = KINDS[kind];
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshStandardMaterial({ color: def.color, roughness: 0.55, metalness: 0.45 });
    const headMat = new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.4, metalness: 0.7 });
    const glowMat = new THREE.MeshStandardMaterial({ color: def.glow, emissive: def.glow, emissiveIntensity: 2.2 });
    const parts: THREE.Mesh[] = [];
    const flashMats = [bodyMat, headMat];
    const add = (parent: THREE.Object3D, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, hit = true, head = false) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
      m.position.set(x, y, z);
      m.castShadow = true;
      parent.add(m);
      if (hit) parts.push(m);
      if (head) m.userData.head = true;
      return m;
    };
    add(g, 0.85, 0.95, 0.5, bodyMat, 0, 1.3, 0);
    add(g, 0.62, 0.25, 0.42, this.darkMat, 0, 0.72, 0);
    add(g, 0.5, 0.12, 0.05, glowMat, 0, 1.45, 0.26, false);
    add(g, 0.4, 0.4, 0.4, headMat, 0, 2.02, 0, true, true);
    add(g, 0.32, 0.1, 0.06, glowMat, 0, 2.05, 0.2, false);
    add(g, 0.12, 0.28, 0.12, this.darkMat, 0, 2.3, -0.05, false);

    const legL = new THREE.Group(); legL.position.set(-0.2, 0.7, 0); g.add(legL);
    const legR = new THREE.Group(); legR.position.set(0.2, 0.7, 0); g.add(legR);
    add(legL, 0.26, 0.72, 0.3, bodyMat, 0, -0.36, 0);
    add(legR, 0.26, 0.72, 0.3, bodyMat, 0, -0.36, 0);
    const armL = new THREE.Group(); armL.position.set(-0.57, 1.7, 0); g.add(armL);
    const armR = new THREE.Group(); armR.position.set(0.57, 1.7, 0); g.add(armR);
    add(armL, 0.22, 0.75, 0.22, bodyMat, 0, -0.32, 0);
    add(armR, 0.22, 0.75, 0.22, bodyMat, 0, -0.32, 0);
    if (!def.melee) {
      armL.rotation.x = -1.35;
      armR.rotation.x = -1.35;
      add(armR, 0.14, 0.14, 0.6, this.darkMat, 0, -0.62, 0.15, false);
      add(armR, 0.08, 0.08, 0.15, glowMat, 0, -0.62, 0.52, false);
    } else {
      add(armL, 0.12, 0.12, 0.4, glowMat, 0, -0.75, 0.1, false); // claws
      add(armR, 0.12, 0.12, 0.4, glowMat, 0, -0.75, 0.1, false);
      armL.rotation.x = -0.6; armR.rotation.x = -0.6;
    }
    if (kind === 'tank') {
      add(g, 1.3, 0.3, 0.7, this.darkMat, 0, 1.85, 0, true);
    }

    // health bar
    const barGroup = new THREE.Group();
    barGroup.position.y = 2.75;
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.12), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.6, depthTest: false }));
    const fg = new THREE.Mesh(new THREE.PlaneGeometry(1.06, 0.08), new THREE.MeshBasicMaterial({ color: 0xff3b30, depthTest: false }));
    bg.renderOrder = 20; fg.renderOrder = 21;
    fg.position.z = 0.001;
    barGroup.add(bg, fg);
    barGroup.visible = false;
    g.add(barGroup);

    return {
      kind, def, group: g, parts, legL, legR, armL, armR, glowMat, flashMats, barGroup, barFg: fg,
      hp: 0, maxHp: 0, x: 0, z: 0, atkT: rand(0.8, 2), windup: 0, strafeDir: Math.random() < 0.5 ? -1 : 1,
      strafeT: rand(1, 3), walkT: Math.random() * 6, flashT: 0, spawnT: 0, losT: 0, los: false, stuck: 0, detour: 0,
    };
  }

  private spawnEnemy(kind: string) {
    const e = this.buildEnemy(kind);
    // choose spawn far from player
    const cands = SPAWNS.filter(([x, z]) => Math.hypot(x - this.px, z - this.pz) > 18);
    const [sx, sz] = cands[Math.floor(Math.random() * cands.length)] || SPAWNS[0];
    e.x = sx + rand(-1.5, 1.5);
    e.z = sz + rand(-1.5, 1.5);
    const mult = 1 + 0.09 * (this.wave - 1);
    e.maxHp = e.hp = Math.round(e.def.hp * mult);
    e.group.position.set(e.x, 0, e.z);
    e.group.scale.setScalar(0.01);
    for (const p of e.parts) p.userData.enemy = e;
    this.scene.add(e.group);
    this.enemies.push(e);
    this.burst(new THREE.Vector3(e.x, 1, e.z), 14, e.def.glow, 4, 0.7, 2);
  }

  private hasLOS(from: THREE.Vector3, to: THREE.Vector3) {
    const dir = to.clone().sub(from);
    const dist = dir.length();
    dir.normalize();
    this.losRay.set(from, dir);
    this.losRay.far = dist;
    return this.losRay.intersectObjects(this.obstacleMeshes, false).length === 0;
  }

  private updateEnemies(dt: number, idle = false) {
    const camQ = this.camera.quaternion;
    const tmpQ = new THREE.Quaternion();
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      const def = e.def;
      const s = def.scale;
      e.spawnT = Math.min(1, e.spawnT + dt * 2.2);
      const ease = 1 - Math.pow(1 - e.spawnT, 3);
      e.group.scale.setScalar(s * (0.3 + 0.7 * ease));

      const dx = this.px - e.x;
      const dz = this.pz - e.z;
      const dist = Math.hypot(dx, dz) || 0.001;
      const nx = dx / dist;
      const nz = dz / dist;

      // flash
      if (e.flashT > 0) {
        e.flashT -= dt;
        for (const m of e.flashMats) { m.emissive.setHex(0xffffff); m.emissiveIntensity = 0.7; }
        if (e.flashT <= 0) for (const m of e.flashMats) { m.emissive.setHex(0x000000); m.emissiveIntensity = 0; }
      }
      // bar
      const ratio = Math.max(0, e.hp / e.maxHp);
      e.barGroup.visible = e.hp < e.maxHp;
      e.barFg.scale.x = Math.max(0.001, ratio);
      e.barFg.position.x = -(1 - ratio) * 0.53;
      tmpQ.copy(e.group.quaternion).invert().multiply(camQ);
      e.barGroup.quaternion.copy(tmpQ);

      if (idle || e.spawnT < 1) {
        e.group.position.set(e.x, 0, e.z);
        continue;
      }

      e.group.rotation.y = Math.atan2(nx, nz);

      e.losT -= dt;
      if (e.losT <= 0) {
        e.losT = 0.22 + Math.random() * 0.1;
        e.los = this.hasLOS(new THREE.Vector3(e.x, 1.5 * s, e.z), new THREE.Vector3(this.px, this.py + 1.3, this.pz));
      }

      let mx = 0;
      let mz = 0;
      e.strafeT -= dt;
      if (e.strafeT <= 0) { e.strafeT = rand(1.5, 3.5); e.strafeDir = Math.random() < 0.5 ? -1 : 1; }
      if (e.detour > 0) {
        e.detour -= dt;
        mx = -nz * e.strafeDir;
        mz = nx * e.strafeDir;
      } else if (def.melee) {
        if (dist > 1.4) { mx = nx; mz = nz; }
      } else if (!e.los || dist > def.range) {
        mx = nx; mz = nz;
      } else if (dist < def.range * 0.5) {
        mx = -nx * 0.8; mz = -nz * 0.8;
      } else {
        mx = -nz * e.strafeDir * 0.6;
        mz = nx * e.strafeDir * 0.6;
      }
      // separation
      for (const o of this.enemies) {
        if (o === e) continue;
        const ox = e.x - o.x;
        const oz = e.z - o.z;
        const od = Math.hypot(ox, oz);
        if (od < 1.4 && od > 0.001) { mx += (ox / od) * (1.4 - od); mz += (oz / od) * (1.4 - od); }
      }
      const sp = def.speed;
      const stepX = mx * sp * dt;
      const stepZ = mz * sp * dt;
      const r = 0.5 * s;
      let blocked = 0;
      if (!this.collides(e.x + stepX, e.z, r)) e.x += stepX; else blocked++;
      if (!this.collides(e.x, e.z + stepZ, r)) e.z += stepZ; else blocked++;
      if (blocked > 0 && Math.hypot(mx, mz) > 0.3) {
        e.stuck += dt;
        if (e.stuck > 0.35) { e.stuck = 0; e.detour = rand(0.8, 1.6); e.strafeDir = Math.random() < 0.5 ? -1 : 1; }
      } else e.stuck = Math.max(0, e.stuck - dt);
      e.group.position.set(e.x, 0, e.z);

      // animation
      const moveAmt = Math.hypot(mx, mz);
      if (moveAmt > 0.05) e.walkT += dt * sp * 2.4;
      const sw = Math.sin(e.walkT) * 0.75 * Math.min(1, moveAmt);
      e.legL.rotation.x = sw;
      e.legR.rotation.x = -sw;
      if (def.melee) {
        e.armL.rotation.x = -0.9 - sw * 0.5;
        e.armR.rotation.x = -0.9 + sw * 0.5;
      }
      e.group.position.y = Math.abs(Math.sin(e.walkT)) * 0.06 * Math.min(1, moveAmt);

      // attacks
      if (!def.melee) {
        if (e.windup > 0) {
          e.windup -= dt;
          e.glowMat.emissiveIntensity = 2.2 + (1 - e.windup / 0.45) * 7;
          if (e.windup <= 0) {
            e.glowMat.emissiveIntensity = 2.2;
            this.enemyShoot(e);
          }
        } else {
          e.atkT -= dt;
          if (e.atkT <= 0 && e.los && dist < def.range + 10) {
            e.windup = 0.45;
            e.atkT = def.fire * rand(0.8, 1.3);
            this.sfx.enemyCharge(Math.max(0.2, 1 - dist / 45));
          }
        }
      } else if (dist < 1.9 && Math.abs(this.py - 0) < 1.5) {
        e.atkT -= dt;
        if (e.atkT <= 0) {
          e.atkT = def.fire;
          this.sfx.melee();
          this.damagePlayer(def.dmg, e.x, e.z);
        }
      }
    }
  }

  private enemyShoot(e: Enemy) {
    const def = e.def;
    const s = def.scale;
    const origin = new THREE.Vector3(e.x + Math.sin(e.group.rotation.y) * 0.6 * s, 1.35 * s, e.z + Math.cos(e.group.rotation.y) * 0.6 * s);
    const target = new THREE.Vector3(this.px + this.vx * 0.15, this.py + 1.1, this.pz + this.vz * 0.15);
    const count = e.kind === 'tank' ? 3 : 1;
    for (let i = 0; i < count; i++) {
      const dir = target.clone().sub(origin).normalize();
      const inacc = 0.045 + (e.kind === 'tank' ? 0.03 : 0);
      dir.x += rand(-inacc, inacc) + (count > 1 ? (i - 1) * 0.1 : 0);
      dir.y += rand(-inacc, inacc);
      dir.z += rand(-inacc, inacc);
      dir.normalize();
      const mesh = new THREE.Mesh(this.projGeo, this.projMats[def.idx]);
      mesh.position.copy(origin);
      mesh.scale.setScalar(e.kind === 'tank' ? 1.5 : 1);
      this.scene.add(mesh);
      this.projectiles.push({ mesh, vel: dir.multiplyScalar(def.pspeed), dmg: def.dmg, life: 5, sx: e.x, sz: e.z });
    }
    const d = Math.hypot(this.px - e.x, this.pz - e.z);
    this.sfx.enemyShot(Math.max(0.25, 1 - d / 50));
  }

  private killEnemy(e: Enemy, head: boolean) {
    const idx = this.enemies.indexOf(e);
    if (idx >= 0) this.enemies.splice(idx, 1);
    this.scene.remove(e.group);
    const p = new THREE.Vector3(e.x, 1.2 * e.def.scale, e.z);
    this.burst(p, 26, e.def.color, 5, 1.0, 12);
    this.burst(p, 18, e.def.glow, 6, 0.8, 8);
    this.burst(p, 8, 0xffd070, 7, 0.5, 6);
    this.kills++;
    if (head) this.headshots++;
    this.score += e.def.score + (head ? 50 : 0);
    this.sfx.kill();
    this.sfx.enemyDie(Math.max(0.3, 1 - Math.hypot(this.px - e.x, this.pz - e.z) / 50));
    // drops
    const roll = Math.random();
    if (roll < 0.22) this.spawnPickup('health', e.x, e.z);
    else if (roll < 0.5) this.spawnPickup('ammo', e.x, e.z);
  }

  // ---------------------------------------------------------------- projectiles
  private updateProjectiles(dt: number) {
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.life -= dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      const pos = p.mesh.position;
      let remove = p.life <= 0;
      // player hit
      const dx = pos.x - this.px;
      const dz = pos.z - this.pz;
      if (!remove && dx * dx + dz * dz < 0.55 * 0.55 && pos.y > this.py - 0.05 && pos.y < this.py + EYE + 0.2) {
        this.damagePlayer(p.dmg, p.sx, p.sz);
        this.burst(pos, 8, 0xff5a2a, 3, 0.4, 4);
        remove = true;
      }
      // world hit
      if (!remove) {
        if (pos.y < 0.05 || Math.abs(pos.x) > HALF || Math.abs(pos.z) > HALF) remove = true;
        else {
          for (const b of this.boxes) {
            if (pos.y < b.h && pos.x > b.minX && pos.x < b.maxX && pos.z > b.minZ && pos.z < b.maxZ) { remove = true; break; }
          }
        }
        if (remove) this.burst(pos, 6, 0xff8a3a, 3, 0.3, 6);
      }
      if (remove) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(i, 1);
      }
    }
  }

  private damagePlayer(amount: number, sx: number, sz: number) {
    if (this.hp <= 0) return;
    this.hp -= amount;
    this.dmgSeq++;
    // direction indicator
    const dx = sx - this.px;
    const dz = sz - this.pz;
    const l = Math.hypot(dx, dz) || 1;
    const dnx = dx / l;
    const dnz = dz / l;
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    this.dmgAngle = Math.atan2(dnx * rx + dnz * rz, dnx * fx + dnz * fz);
    this.shake = 1;
    this.sfx.hurt();
    if (this.hp <= 0) {
      this.hp = 0;
      this.die();
    }
  }

  private die() {
    this.sfx.over();
    this.mouseDown = false;
    if (this.score > this.best) {
      this.best = this.score;
      try { localStorage.setItem('arena-best', String(this.best)); } catch { /* ignore */ }
    }
    this.setPhase('over');
    if (this.locked) document.exitPointerLock();
  }

  // ---------------------------------------------------------------- pickups
  private spawnPickup(type: 'health' | 'ammo', x: number, z: number) {
    const g = new THREE.Group();
    if (type === 'health') {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.55, 0.55), new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.4 }));
      const gm = new THREE.MeshStandardMaterial({ color: 0x2cff6a, emissive: 0x2cff6a, emissiveIntensity: 1.5 });
      const a = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.16, 0.6), gm);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.6), gm);
      const c = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.16), gm);
      g.add(base, a, b, c);
    } else {
      const base = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x3a4a2a, roughness: 0.6 }));
      const y = new THREE.MeshStandardMaterial({ color: 0xffc933, emissive: 0xffa800, emissiveIntensity: 1.2 });
      for (let i = -1; i <= 1; i++) {
        const bl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 0.42), y);
        bl.position.x = i * 0.18;
        g.add(bl);
      }
      g.add(base);
    }
    g.position.set(x, 0.8, z);
    this.scene.add(g);
    this.pickups.push({ group: g, type, life: 25, t: Math.random() * 6 });
  }

  private updatePickups(dt: number) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.life -= dt;
      p.t += dt;
      p.group.rotation.y += dt * 2;
      p.group.position.y = 0.8 + Math.sin(p.t * 3) * 0.12;
      p.group.visible = p.life > 4 || Math.floor(p.life * 6) % 2 === 0;
      const d = Math.hypot(p.group.position.x - this.px, p.group.position.z - this.pz);
      let take = false;
      if (d < 1.4) {
        if (p.type === 'health') {
          if (this.hp < 100) {
            this.hp = Math.min(100, this.hp + 30);
            this.notifyPickup('+30 生命');
            take = true;
          }
        } else {
          for (let w = 0; w < 2; w++) {
            this.reserves[w] = Math.min(WEAPONS[w].reserveMax, this.reserves[w] + WEAPONS[w].ammoPickup);
          }
          this.notifyPickup('+ 弹药');
          take = true;
        }
      }
      if (take || p.life <= 0) {
        if (take) this.sfx.pickup();
        this.scene.remove(p.group);
        this.pickups.splice(i, 1);
      }
    }
  }

  private notifyPickup(t: string) {
    this.pickupSeq++;
    this.pickupText = t;
  }

  // ---------------------------------------------------------------- waves
  private showBanner(t: string, sub = '') {
    this.banner = t;
    this.bannerSub = sub;
    this.bannerSeq++;
  }

  private startWave() {
    this.wave++;
    const n = Math.min(30, 5 + this.wave * 2);
    const tanks = this.wave >= 3 ? Math.floor((this.wave - 1) / 2) : 0;
    const runners = this.wave >= 2 ? Math.floor(n * 0.3) : 0;
    const q: string[] = [];
    for (let i = 0; i < tanks; i++) q.push('tank');
    for (let i = 0; i < runners; i++) q.push('runner');
    while (q.length < n) q.push('grunt');
    for (let i = q.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [q[i], q[j]] = [q[j], q[i]];
    }
    this.queue = q;
    this.waveActive = true;
    this.spawnT = 0.5;
    this.showBanner(`第 ${this.wave} 波`, `${n} 个敌人来袭`);
    this.sfx.wave();
  }

  private updateWaves(dt: number) {
    if (!this.waveActive) {
      this.breakT -= dt;
      if (this.breakT <= 0) this.startWave();
      return;
    }
    this.spawnT -= dt;
    const maxAlive = Math.min(6 + this.wave, 14);
    if (this.queue.length && this.enemies.length < maxAlive && this.spawnT <= 0) {
      this.spawnEnemy(this.queue.pop()!);
      this.spawnT = Math.max(0.5, 1.6 - this.wave * 0.1);
    }
    if (!this.queue.length && !this.enemies.length) {
      this.waveActive = false;
      this.breakT = 5;
      this.hp = Math.min(100, this.hp + 25);
      for (let w = 0; w < 2; w++) {
        this.reserves[w] = Math.min(WEAPONS[w].reserveMax, this.reserves[w] + Math.round(WEAPONS[w].ammoPickup * 0.6));
      }
      this.score += 200 * this.wave;
      this.showBanner('波次完成', `奖励 +${200 * this.wave} 分 · 恢复生命与弹药`);
      this.sfx.clear();
    }
  }

  // ---------------------------------------------------------------- HUD
  private flush(_force = false) {
    const w = WEAPONS[this.cur];
    const radar: RadarDot[] = [];
    const fx = -Math.sin(this.yaw);
    const fz = -Math.cos(this.yaw);
    const rx = Math.cos(this.yaw);
    const rz = -Math.sin(this.yaw);
    for (const e of this.enemies) {
      const dx = e.x - this.px;
      const dz = e.z - this.pz;
      let x = (dx * rx + dz * rz) / RADAR_RANGE;
      let y = -(dx * fx + dz * fz) / RADAR_RANGE;
      const l = Math.hypot(x, y);
      if (l > 1) { x /= l; y /= l; }
      radar.push({ x, y, k: e.def.idx });
    }
    this.cb.onHud({
      hp: Math.ceil(this.hp),
      maxHp: 100,
      weapon: this.cur,
      weaponName: w.name,
      mag: this.mags[this.cur],
      magSize: w.mag,
      reserve: this.reserves[this.cur],
      reloading: this.reloadT >= 0 ? Math.min(1, this.reloadT / this.reloadDur) : -1,
      score: this.score,
      kills: this.kills,
      headshots: this.headshots,
      accuracy: this.shots ? Math.round((this.hitsLanded / this.shots) * 100) : 0,
      wave: this.wave,
      remaining: this.queue.length + this.enemies.length,
      spread: this.spread + (Math.hypot(this.vx, this.vz) > 1 ? 0.008 : 0) + (this.onGround ? 0 : 0.03) + (this.cur === 1 ? WEAPONS[1].pelletSpread : 0),
      banner: this.banner,
      bannerSub: this.bannerSub,
      bannerSeq: this.bannerSeq,
      hitSeq: this.hitSeq,
      hitKind: this.hitKind,
      dmgSeq: this.dmgSeq,
      dmgAngle: this.dmgAngle,
      pickupSeq: this.pickupSeq,
      pickupText: this.pickupText,
      radar,
      best: this.best,
      sprinting: this.sprinting,
    });
  }
}
