/* ═══════════════════════════════════════════════════════════
   Space Ball Runner — game.js
   3D space rolling ball runner with Three.js
   
   Features: Obstacles, Boosters, Ball Themes, Sound System,
   Menus, High Score, Difficulty Scaling
   ═══════════════════════════════════════════════════════════ */


// ─────────────────────────────────────────────────────────────
// 1. CONFIGURATION
// ─────────────────────────────────────────────────────────────

const CONFIG = {
  // Track geometry
  trackWidth:         10,
  trackThickness:     0.5,
  segmentLength:      24,
  segmentsAhead:      14,
  segmentDestroyDist: 50,
  railWidth:          0.18,
  railHeight:         0.35,

  // Player ball
  ballRadius:         0.75,
  laneSpeed:          14,
  trackHalfWidth:     4.2,
  gravity:           -28,
  fallThreshold:     -8,

  // Speed (decays over time, boosters restore it, player can adjust)
  baseSpeed:          10,
  speedDecayRate:     0.28,
  minSpeed:           4,
  maxSpeed:           28,

  // Health System
  maxHealth:          5,
  invincibleDuration: 1.5,
  healthRegenInterval:20,

  // Boosters
  boosterChance:      0.5,
  boosterSpeedBoost:  4.5,
  boosterRadius:      0.4,

  // Obstacles
  obstacleChance:     0.6,

  // Stars
  starCount:          2500,
  starSpread:         300,

  // Camera
  camOffset:          new THREE.Vector3(0, 5.5, -9),
  camLookAhead:       8,
  camSmoothing:       0.08,
};


// ─────────────────────────────────────────────────────────────
// 2. GAME STATE
// ─────────────────────────────────────────────────────────────

const state = {
  phase:          'menu',  // 'menu' | 'playing' | 'paused' | 'gameover'
  prevPhase:      'menu',  // for settings/about overlay return
  score:          0,
  distance:       0,
  timePlayed:     0,
  currentSpeed:   CONFIG.baseSpeed,
  ballVelY:       0,
  onGround:       true,
  inputLeft:      false,
  inputRight:     false,
  inputUp:        false,
  inputDown:      false,
  touchStartX:    0,
  touchDeltaX:    0,
  selectedTheme:  'space',
  highScore:      0,
  boostersCollected: 0,
  health:         5,
  invincibleTimer:0,
  healthRegenTimer:0,
};


// ─────────────────────────────────────────────────────────────
// 3. DOM REFERENCES
// ─────────────────────────────────────────────────────────────

const dom = {
  canvas:          document.getElementById('game-canvas'),
  hud:             document.getElementById('hud'),
  scoreValue:      document.getElementById('score-value'),
  bestValue:       document.getElementById('best-value'),
  healthValue:     document.getElementById('health-value'),
  speedValue:      document.getElementById('speed-value'),
  pauseBtn:        document.getElementById('pause-btn'),
  boostFlash:      document.getElementById('boost-flash'),
  hitFlash:        document.getElementById('hit-flash'),
  boostIndicator:  document.getElementById('boost-indicator'),
  // Screens
  startScreen:     document.getElementById('start-screen'),
  pauseScreen:     document.getElementById('pause-screen'),
  gameoverScreen:  document.getElementById('gameover-screen'),
  settingsPanel:   document.getElementById('settings-panel'),
  aboutPanel:      document.getElementById('about-panel'),
  // Start screen
  startHighscore:  document.getElementById('start-highscore'),
  themeSelector:   document.getElementById('theme-selector'),
  // Game over
  finalScore:      document.getElementById('final-score'),
  finalBest:       document.getElementById('final-best'),
  finalDistance:    document.getElementById('final-distance'),
  newBestLabel:    document.getElementById('new-best-label'),
  // Settings
  musicToggle:     document.getElementById('music-toggle'),
  sfxToggle:       document.getElementById('sfx-toggle'),
  musicVol:        document.getElementById('music-vol'),
  sfxVol:          document.getElementById('sfx-vol'),
};


// ─────────────────────────────────────────────────────────────
// 4. SOUND SYSTEM — Web Audio API (no external files)
// ─────────────────────────────────────────────────────────────

const Sound = {
  ctx: null,
  musicGain: null,
  sfxGain: null,
  musicOn: true,
  sfxOn: true,
  musicVol: 0.3,
  sfxVol: 0.5,
  musicNodes: [],

  /** Create AudioContext on first user interaction */
  init() {
    if (this.ctx) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = this.musicVol;
    this.musicGain.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = this.sfxVol;
    this.sfxGain.connect(this.ctx.destination);
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  },

  /** Booster pickup — rising arpeggio C5-E5-G5 */
  playBooster() {
    if (!this.sfxOn || !this.ctx) return;
    const t = this.ctx.currentTime;
    [523, 659, 784].forEach((f, i) => {
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = f;
      g.gain.setValueAtTime(0.25, t + i * 0.07);
      g.gain.exponentialRampToValueAtTime(0.001, t + i * 0.07 + 0.18);
      osc.connect(g); g.connect(this.sfxGain);
      osc.start(t + i * 0.07); osc.stop(t + i * 0.07 + 0.22);
    });
  },

  /** Obstacle hit — low noise burst + descending tone */
  playHit() {
    if (!this.sfxOn || !this.ctx) return;
    const t = this.ctx.currentTime;
    // Noise burst
    const buf = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.25, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (d.length * 0.08));
    const ns = this.ctx.createBufferSource(); ns.buffer = buf;
    const ng = this.ctx.createGain();
    ng.gain.setValueAtTime(0.4, t); ng.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
    ns.connect(ng); ng.connect(this.sfxGain);
    ns.start(t); ns.stop(t + 0.3);
    // Low tone sweep
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.3);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.25, t); og.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    osc.connect(og); og.connect(this.sfxGain);
    osc.start(t); osc.stop(t + 0.35);
  },

  /** Button click — short blip */
  playClick() {
    if (!this.sfxOn || !this.ctx) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = 'sine'; osc.frequency.value = 1100;
    g.gain.setValueAtTime(0.15, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    osc.connect(g); g.connect(this.sfxGain);
    osc.start(t); osc.stop(t + 0.06);
  },

  /** Start ambient background music — layered drones */
  startMusic() {
    if (!this.musicOn || !this.ctx) return;
    this.stopMusic();
    const make = (type, freq, vol) => {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type; o.frequency.value = freq; g.gain.value = vol;
      o.connect(g); g.connect(this.musicGain); o.start();
      this.musicNodes.push(o);
    };
    make('sine', 55, 0.12);       // Deep bass A1
    make('triangle', 110, 0.06);  // Mid pad A2
    make('sine', 220, 0.03);      // Upper A3
    make('sine', 330, 0.015);     // Shimmer E4
    // LFO tremolo on last node
    const lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain();
    lfo.frequency.value = 0.4; lg.gain.value = 0.01;
    lfo.connect(lg); lfo.start();
    this.musicNodes.push(lfo);
  },

  stopMusic() {
    for (const n of this.musicNodes) { try { n.stop(); } catch(e) {} }
    this.musicNodes = [];
  },

  setMusicVol(v) { this.musicVol = v; if (this.musicGain) this.musicGain.gain.value = v; },
  setSfxVol(v)   { this.sfxVol = v;   if (this.sfxGain)   this.sfxGain.gain.value = v; },
  toggleMusic(on) { this.musicOn = on; on ? this.startMusic() : this.stopMusic(); },
  toggleSfx(on)   { this.sfxOn = on; },
};


// ─────────────────────────────────────────────────────────────
// 5. HIGH SCORE — localStorage
// ─────────────────────────────────────────────────────────────

const LS_KEY = 'spaceBallRunner_highScore';

function loadHighScore() {
  state.highScore = parseInt(localStorage.getItem(LS_KEY) || '0', 10);
  dom.startHighscore.textContent = state.highScore;
}

function saveHighScore(score) {
  if (score > state.highScore) {
    state.highScore = score;
    localStorage.setItem(LS_KEY, score);
  }
}


// ─────────────────────────────────────────────────────────────
// 6. THREE.JS SETUP
// ─────────────────────────────────────────────────────────────

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030108);
scene.fog = new THREE.FogExp2(0x030108, 0.011);

const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 6, -10);

const renderer = new THREE.WebGLRenderer({ canvas: dom.canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});


// ─────────────────────────────────────────────────────────────
// 7. LIGHTING
// ─────────────────────────────────────────────────────────────

scene.add(new THREE.AmbientLight(0x1a0e33, 0.6));
const dirLight = new THREE.DirectionalLight(0xc8b0ff, 0.8);
dirLight.position.set(5, 15, 10);
scene.add(dirLight);
scene.add(new THREE.HemisphereLight(0x4a2080, 0x080420, 0.4));

const ballLight = new THREE.PointLight(0x7df0ff, 1.2, 15);
scene.add(ballLight);


// ─────────────────────────────────────────────────────────────
// 8. STARFIELD
// ─────────────────────────────────────────────────────────────

function createStarfield() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(CONFIG.starCount * 3);
  const col = new Float32Array(CONFIG.starCount * 3);
  const palette = [
    [1, 1, 1], [0.7, 0.8, 1], [1, 0.9, 0.7], [0.8, 0.7, 1], [0.5, 0.9, 1]
  ];
  for (let i = 0; i < CONFIG.starCount; i++) {
    const i3 = i * 3;
    const r = CONFIG.starSpread;
    pos[i3]     = (Math.random() - 0.5) * r;
    pos[i3 + 1] = (Math.random() - 0.5) * r;
    pos[i3 + 2] = (Math.random() - 0.5) * r * 3;
    const c = palette[Math.floor(Math.random() * palette.length)];
    col[i3] = c[0]; col[i3 + 1] = c[1]; col[i3 + 2] = c[2];
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 0.55, vertexColors: true, transparent: true, opacity: 0.85, sizeAttenuation: true });
  const stars = new THREE.Points(geo, mat);
  scene.add(stars);
  return stars;
}
const starfield = createStarfield();


// ─────────────────────────────────────────────────────────────
// 9. BALL THEMES & PROCEDURAL TEXTURES
// ─────────────────────────────────────────────────────────────

/** Theme definitions */
const THEMES = {
  space: {
    color: 0x40d0f0, emissive: 0x20a0d0, emissiveI: 0.7,
    metal: 0.3, rough: 0.2, glowCol: 0x60e0ff, glowOp: 0.12,
    trailCol: 0x60e0ff, lightCol: 0x7df0ff, texture: null,
  },
  neon: {
    color: 0xff20a0, emissive: 0xff1090, emissiveI: 1.0,
    metal: 0.1, rough: 0.1, glowCol: 0xff40c0, glowOp: 0.18,
    trailCol: 0xff40c0, lightCol: 0xff60d0, texture: null,
  },
  football: {
    color: 0xffffff, emissive: 0x111111, emissiveI: 0.05,
    metal: 0.0, rough: 0.6, glowCol: 0xffffff, glowOp: 0.04,
    trailCol: 0x999999, lightCol: 0xffffff, texture: 'football',
  },
  worldcup: {
    color: 0xffd700, emissive: 0xcc9900, emissiveI: 0.35,
    metal: 0.7, rough: 0.2, glowCol: 0xffe040, glowOp: 0.1,
    trailCol: 0xffe040, lightCol: 0xffd700, texture: 'worldcup',
  },
};

/** Generate a football-pattern canvas texture */
function createFootballTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#f5f5f5'; x.fillRect(0, 0, 256, 256);
  // Black pentagons
  x.fillStyle = '#1a1a1a';
  const spots = [[64,50],[192,50],[128,128],[40,170],[216,170],[100,240],[156,240],[0,0],[256,0],[0,256],[256,256]];
  for (const [sx, sy] of spots) {
    x.beginPath();
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      const px = sx + Math.cos(a) * 22, py = sy + Math.sin(a) * 22;
      i === 0 ? x.moveTo(px, py) : x.lineTo(px, py);
    }
    x.closePath(); x.fill();
  }
  // Seam lines
  x.strokeStyle = '#bbb'; x.lineWidth = 1.5;
  for (const [sx, sy] of spots) {
    for (let i = 0; i < 5; i++) {
      const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
      x.beginPath();
      x.moveTo(sx + Math.cos(a) * 22, sy + Math.sin(a) * 22);
      x.lineTo(sx + Math.cos(a) * 38, sy + Math.sin(a) * 38);
      x.stroke();
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Generate a golden World Cup canvas texture */
function createWorldCupTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#fff8e0'; x.fillRect(0, 0, 256, 256);
  // Gold triangular panels
  x.fillStyle = '#daa520';
  const tris = [
    [[0,0],[128,64],[0,128]], [[256,0],[128,64],[256,128]],
    [[0,128],[128,192],[0,256]], [[256,128],[128,192],[256,256]],
    [[128,64],[64,128],[128,192]], [[128,64],[192,128],[128,192]],
  ];
  for (const t of tris) {
    x.beginPath(); x.moveTo(t[0][0],t[0][1]); x.lineTo(t[1][0],t[1][1]); x.lineTo(t[2][0],t[2][1]);
    x.closePath(); x.fill();
  }
  x.strokeStyle = '#b8860b'; x.lineWidth = 2;
  for (const t of tris) {
    x.beginPath(); x.moveTo(t[0][0],t[0][1]); x.lineTo(t[1][0],t[1][1]); x.lineTo(t[2][0],t[2][1]);
    x.closePath(); x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// Pre-create textures
const textures = {
  football: createFootballTexture(),
  worldcup: createWorldCupTexture(),
};


// ─────────────────────────────────────────────────────────────
// 10. PLAYER BALL
// ─────────────────────────────────────────────────────────────

const ballGeo = new THREE.SphereGeometry(CONFIG.ballRadius, 28, 28);
const ballMat = new THREE.MeshStandardMaterial({
  color: 0x40d0f0, emissive: 0x20a0d0, emissiveIntensity: 0.7,
  metalness: 0.3, roughness: 0.2,
});
const ball = new THREE.Mesh(ballGeo, ballMat);
ball.position.set(0, CONFIG.ballRadius + CONFIG.trackThickness / 2 + 0.05, 0);
scene.add(ball);

// Outer glow shell
const glowMat = new THREE.MeshBasicMaterial({ color: 0x60e0ff, transparent: true, opacity: 0.12 });
const ballGlow = new THREE.Mesh(
  new THREE.SphereGeometry(CONFIG.ballRadius * 1.4, 18, 18), glowMat
);
ball.add(ballGlow);

/** Applies the selected theme to the ball */
function applyTheme(themeKey) {
  const t = THEMES[themeKey];
  if (!t) return;
  state.selectedTheme = themeKey;
  ballMat.color.setHex(t.color);
  ballMat.emissive.setHex(t.emissive);
  ballMat.emissiveIntensity = t.emissiveI;
  ballMat.metalness = t.metal;
  ballMat.roughness = t.rough;
  ballMat.map = t.texture ? textures[t.texture] : null;
  ballMat.needsUpdate = true;
  glowMat.color.setHex(t.glowCol);
  glowMat.opacity = t.glowOp;
  ballLight.color.setHex(t.lightCol);
  // Update trail colors
  for (const ts of trailSpheres) {
    ts.mesh.material.color.setHex(t.trailCol);
  }
}

// Trail
const trailSpheres = [];
const TRAIL_COUNT = 16;
const trailGeo = new THREE.SphereGeometry(0.1, 6, 6);
for (let i = 0; i < TRAIL_COUNT; i++) {
  const m = new THREE.MeshBasicMaterial({
    color: 0x60e0ff, transparent: true, opacity: 0.35 * (1 - i / TRAIL_COUNT)
  });
  const s = new THREE.Mesh(trailGeo, m);
  s.scale.setScalar(1 - (i / TRAIL_COUNT) * 0.6);
  s.visible = false; scene.add(s);
  trailSpheres.push({ mesh: s });
}
const trailHistory = [];
let trailTimer = 0;


// ─────────────────────────────────────────────────────────────
// 11. TRACK SEGMENTS
// ─────────────────────────────────────────────────────────────

const trackMat = new THREE.MeshStandardMaterial({
  color: 0x1a0e33, emissive: 0x0d0520, emissiveIntensity: 0.3,
  metalness: 0.6, roughness: 0.4,
});
const railMat = new THREE.MeshBasicMaterial({ color: 0x5030a0, transparent: true, opacity: 0.8 });

const segments = [];
let nextSpawnZ = 0;
let segCount = 0;

function createSegment(z) {
  const g = new THREE.Group();
  g.position.set(0, 0, z);
  const W = CONFIG.trackWidth, H = CONFIG.trackThickness, L = CONFIG.segmentLength;
  // Platform
  g.add(new THREE.Mesh(new THREE.BoxGeometry(W, H, L), trackMat));
  // Rails
  const rGeo = new THREE.BoxGeometry(CONFIG.railWidth, CONFIG.railHeight, L);
  const lr = new THREE.Mesh(rGeo, railMat);
  lr.position.set(-W/2 + CONFIG.railWidth/2, H/2 + CONFIG.railHeight/2, 0);
  g.add(lr);
  const rr = new THREE.Mesh(rGeo, railMat);
  rr.position.set(W/2 - CONFIG.railWidth/2, H/2 + CONFIG.railHeight/2, 0);
  g.add(rr);
  scene.add(g);
  const seg = { group: g, z, zStart: z - L/2, zEnd: z + L/2 };
  segments.push(seg);
  return seg;
}

function spawnSegments() {
  const target = ball.position.z + CONFIG.segmentsAhead * CONFIG.segmentLength;
  while (nextSpawnZ < target) {
    const seg = createSegment(nextSpawnZ);
    if (segCount >= 3) {
      if (Math.random() < CONFIG.obstacleChance) spawnObstacles(seg);
      if (Math.random() < CONFIG.boosterChance) spawnBooster(seg);
    }
    nextSpawnZ += CONFIG.segmentLength;
    segCount++;
  }
}

function cleanupSegments() {
  for (let i = segments.length - 1; i >= 0; i--) {
    if (ball.position.z - segments[i].z > CONFIG.segmentDestroyDist) {
      scene.remove(segments[i].group);
      segments[i].group.traverse(c => { if (c.geometry) c.geometry.dispose(); });
      segments.splice(i, 1);
    }
  }
}


// ─────────────────────────────────────────────────────────────
// 12. OBSTACLES
// ─────────────────────────────────────────────────────────────

const obstacleSmallGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
const obstacleBigGeo   = new THREE.BoxGeometry(0.9, 2.2, 0.9);
const obstacleWideGeo  = new THREE.BoxGeometry(2.2, 1.2, 0.9);

const obsFixedMat = new THREE.MeshStandardMaterial({
  color: 0x500010, emissive: 0xbb2020, emissiveIntensity: 0.55,
  metalness: 0.4, roughness: 0.3,
});
const obsMovingMat = new THREE.MeshStandardMaterial({
  color: 0x503000, emissive: 0xd07020, emissiveIntensity: 0.55,
  metalness: 0.4, roughness: 0.3,
});

const obstacles = [];

/** Returns difficulty parameters based on current score */
function getDifficulty() {
  const s = state.score;
  return {
    count:      Math.min(1 + Math.floor(s / 250), 5),
    movingPct:  Math.min(0.15 + s / 2500, 0.65),
    moveSpeed:  Math.min(2 + s / 800, 6.5),
    widePct:    Math.min(s / 5000, 0.25),
  };
}

function spawnObstacles(seg) {
  const diff = getDifficulty();
  const L = CONFIG.segmentLength;
  const halfW = CONFIG.trackWidth / 2 - 1.2;
  const count = diff.count;

  for (let i = 0; i < count; i++) {
    const isMoving = Math.random() < diff.movingPct;
    const isWide   = !isMoving && Math.random() < diff.widePct;
    const isBig    = !isWide && Math.random() < 0.3;
    const geo = isWide ? obstacleWideGeo : (isBig ? obstacleBigGeo : obstacleSmallGeo);
    const mat = isMoving ? obsMovingMat : obsFixedMat;
    const mesh = new THREE.Mesh(geo, mat);

    const zOff = ((i + 1) / (count + 1)) * L - L / 2;
    const x = (Math.random() - 0.5) * halfW * 2;
    const yH = isWide ? 0.6 : (isBig ? 1.1 : 0.45);
    const y = CONFIG.trackThickness / 2 + yH;
    mesh.position.set(x, y, seg.z + zOff);
    scene.add(mesh);

    obstacles.push({
      mesh, z: seg.z + zOff, baseX: x,
      isMoving, movePhase: Math.random() * Math.PI * 2,
      moveAmp: 1.4 + Math.random() * 1.8, moveSpeed: diff.moveSpeed,
      hw: isWide ? 1.1 : 0.45,      // half-width for collision
      hh: isBig ? 1.1 : (isWide ? 0.6 : 0.45),  // half-height
    });
  }
}

function updateObstacles(dt) {
  const bz = ball.position.z;
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const o = obstacles[i];
    // Moving obstacles oscillate left-right
    if (o.isMoving) {
      o.movePhase += o.moveSpeed * dt;
      o.mesh.position.x = o.baseX + Math.sin(o.movePhase) * o.moveAmp;
      // Clamp to track
      const hw = CONFIG.trackWidth / 2 - 0.5;
      o.mesh.position.x = Math.max(-hw, Math.min(hw, o.mesh.position.x));
    }
    // Cleanup behind player
    if (bz - o.z > CONFIG.segmentDestroyDist) {
      scene.remove(o.mesh);
      obstacles.splice(i, 1);
    }
  }
}


// ─────────────────────────────────────────────────────────────
// 13. BOOSTERS — Diamond-shaped speed pickups
// ─────────────────────────────────────────────────────────────

const boosterGeo = new THREE.OctahedronGeometry(CONFIG.boosterRadius);
const boosterMat = new THREE.MeshStandardMaterial({
  color: 0xffb000, emissive: 0xff8c00, emissiveIntensity: 1.5,
  metalness: 0.2, roughness: 0.1,
});
const boosterGlowMat = new THREE.MeshBasicMaterial({
  color: 0xffcc00, transparent: true, opacity: 0.25,
});
const boosterGlowGeo = new THREE.OctahedronGeometry(CONFIG.boosterRadius * 1.9);

const boosters = [];

function spawnBooster(seg) {
  const halfW = CONFIG.trackWidth * 0.3;
  const x = (Math.random() - 0.5) * halfW * 2;
  const z = seg.z + (Math.random() - 0.5) * (seg.length || CONFIG.segmentLength) * 0.6;
  const y = CONFIG.trackThickness / 2 + 1.3;

  const mesh = new THREE.Mesh(boosterGeo, boosterMat);
  mesh.position.set(x, y, z);
  // Glow shell
  mesh.add(new THREE.Mesh(boosterGlowGeo, boosterGlowMat));
  scene.add(mesh);

  boosters.push({ mesh, z, baseY: y, phase: Math.random() * Math.PI * 2, collected: false });
}

function updateBoosters(dt) {
  const bp = ball.position;
  for (let i = boosters.length - 1; i >= 0; i--) {
    const b = boosters[i];
    if (b.collected) continue;
    // Animate
    b.mesh.rotation.y += 2.5 * dt;
    b.mesh.position.y = b.baseY + Math.sin(performance.now() * 0.002 + b.phase) * 0.3;
    // Collection check
    const dx = bp.x - b.mesh.position.x;
    const dy = bp.y - b.mesh.position.y;
    const dz = bp.z - b.mesh.position.z;
    if (Math.sqrt(dx*dx + dy*dy + dz*dz) < CONFIG.ballRadius + CONFIG.boosterRadius + 0.4) {
      b.collected = true;
      scene.remove(b.mesh);
      boosters.splice(i, 1);
      // Apply boost
      state.currentSpeed = Math.min(CONFIG.maxSpeed, state.currentSpeed + CONFIG.boosterSpeedBoost);
      state.boostersCollected++;
      state.score += 25;
      Sound.playBooster();
      flashBoost();
      continue;
    }
    // Cleanup behind
    if (bp.z - b.z > 35) { scene.remove(b.mesh); boosters.splice(i, 1); }
  }
}

/** Brief screen flash on booster collection */
function flashBoost() {
  dom.boostFlash.classList.add('active');
  dom.boostIndicator.classList.add('visible');
  setTimeout(() => dom.boostFlash.classList.remove('active'), 150);
  setTimeout(() => dom.boostIndicator.classList.remove('visible'), 800);
}


// ─────────────────────────────────────────────────────────────
// 14. COLLISION DETECTION
// ─────────────────────────────────────────────────────────────

/** Check if ball is on a track segment (returns segment or null) */
function getSegmentUnder() {
  const bx = ball.position.x, bz = ball.position.z;
  const hw = CONFIG.trackWidth / 2;
  for (const s of segments) {
    if (bz >= s.zStart && bz <= s.zEnd && bx >= -hw && bx <= hw) return s;
  }
  return null;
}

/** Check obstacle collision — returns true if hit */
function checkObstacleHit() {
  const bx = ball.position.x, by = ball.position.y, bz = ball.position.z;
  const br = CONFIG.ballRadius * 0.85; // slight forgiveness
  for (const o of obstacles) {
    const ox = o.mesh.position.x, oy = o.mesh.position.y, oz = o.mesh.position.z;
    const dx = Math.max(0, Math.abs(bx - ox) - o.hw);
    const dy = Math.max(0, Math.abs(by - oy) - o.hh);
    const dz = Math.max(0, Math.abs(bz - oz) - 0.45);
    if (Math.sqrt(dx*dx + dy*dy + dz*dz) < br) return true;
  }
  return false;
}


// ─────────────────────────────────────────────────────────────
// 15. INPUT HANDLING
// ─────────────────────────────────────────────────────────────

window.addEventListener('keydown', e => {
  if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft')  state.inputLeft = true;
  if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') state.inputRight = true;
  if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp')    state.inputUp = true;
  if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown')  state.inputDown = true;
  if (e.key === 'Escape' || e.key === 'p' || e.key === 'P') {
    if (state.phase === 'playing') pauseGame();
    else if (state.phase === 'paused') resumeGame();
  }
});
window.addEventListener('keyup', e => {
  if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft')  state.inputLeft = false;
  if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') state.inputRight = false;
  if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp')    state.inputUp = false;
  if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown')  state.inputDown = false;
});

// Touch
window.addEventListener('touchstart', e => {
  state.touchStartX = e.touches[0].clientX;
  state.touchDeltaX = 0;
}, { passive: true });
window.addEventListener('touchmove', e => {
  state.touchDeltaX = (e.touches[0].clientX - state.touchStartX) * 0.012;
  state.touchStartX = e.touches[0].clientX;
}, { passive: true });
window.addEventListener('touchend', () => { state.touchDeltaX = 0; }, { passive: true });


// ─────────────────────────────────────────────────────────────
// 16. MENU & GAME STATE MANAGEMENT
// ─────────────────────────────────────────────────────────────

function showOverlay(el)  { el.classList.add('visible'); }
function hideOverlay(el)  { el.classList.remove('visible'); }
function hideAll() {
  [dom.startScreen, dom.pauseScreen, dom.gameoverScreen, dom.settingsPanel, dom.aboutPanel]
    .forEach(hideOverlay);
}

function startGame() {
  Sound.init(); Sound.resume(); Sound.startMusic(); Sound.playClick();
  resetGameState();
  hideAll();
  dom.hud.classList.add('visible');
  state.phase = 'playing';
}

function pauseGame() {
  if (state.phase !== 'playing') return;
  state.phase = 'paused';
  Sound.playClick();
  Sound.stopMusic();
  showOverlay(dom.pauseScreen);
}

function resumeGame() {
  if (state.phase !== 'paused') return;
  state.phase = 'playing';
  Sound.playClick();
  Sound.startMusic();
  hideOverlay(dom.pauseScreen);
  lastTime = performance.now(); // prevent dt spike
}

function triggerGameOver() {
  if (state.phase === 'gameover') return;
  state.phase = 'gameover';
  Sound.playHit(); Sound.stopMusic();

  // Hit flash
  dom.hitFlash.classList.add('active');
  setTimeout(() => dom.hitFlash.classList.remove('active'), 250);

  const finalScore = Math.floor(state.score);
  const isNewBest = finalScore > state.highScore;
  saveHighScore(finalScore);

  dom.finalScore.textContent = 'Score: ' + finalScore;
  dom.finalBest.textContent = 'Best: ' + state.highScore;
  dom.finalDistance.textContent = 'Distance: ' + Math.floor(state.distance) + 'm';
  dom.newBestLabel.style.display = isNewBest ? 'block' : 'none';

  setTimeout(() => showOverlay(dom.gameoverScreen), 400);
}

function goToMenu() {
  Sound.playClick(); Sound.stopMusic();
  resetGameState();
  hideAll();
  dom.hud.classList.remove('visible');
  state.phase = 'menu';
  loadHighScore();
  showOverlay(dom.startScreen);
  // Reset ball position for menu view
  ball.position.set(0, CONFIG.ballRadius + CONFIG.trackThickness / 2 + 0.05, 0);
  camera.position.copy(ball.position).add(CONFIG.camOffset);
}

function resetGameState() {
  state.score = 0; state.distance = 0; state.timePlayed = 0;
  state.currentSpeed = CONFIG.baseSpeed; state.ballVelY = 0;
  state.onGround = true; state.boostersCollected = 0;
  state.inputLeft = false; state.inputRight = false; state.touchDeltaX = 0;
  state.inputUp = false; state.inputDown = false;
  state.health = CONFIG.maxHealth; state.invincibleTimer = 0; state.healthRegenTimer = 0;

  // Clear world objects
  for (const s of segments) { scene.remove(s.group); s.group.traverse(c => { if (c.geometry) c.geometry.dispose(); }); }
  segments.length = 0;
  for (const o of obstacles) scene.remove(o.mesh);
  obstacles.length = 0;
  for (const b of boosters) scene.remove(b.mesh);
  boosters.length = 0;
  trailHistory.length = 0;
  for (const t of trailSpheres) t.mesh.visible = false;

  // Reset spawner
  nextSpawnZ = 0; segCount = 0;
  ball.position.set(0, CONFIG.ballRadius + CONFIG.trackThickness / 2 + 0.05, 0);
  spawnSegments();
}

// ── Button Wiring ──

document.getElementById('start-btn').addEventListener('click', startGame);
dom.pauseBtn.addEventListener('click', () => {
  if (state.phase === 'playing') pauseGame();
  else if (state.phase === 'paused') resumeGame();
});
document.getElementById('resume-btn').addEventListener('click', resumeGame);
document.getElementById('restart-btn').addEventListener('click', () => { Sound.playClick(); startGame(); });
document.getElementById('pause-restart-btn').addEventListener('click', () => { Sound.playClick(); hideOverlay(dom.pauseScreen); startGame(); });
document.getElementById('pause-menu-btn').addEventListener('click', goToMenu);
document.getElementById('gameover-menu-btn').addEventListener('click', goToMenu);

// Settings
let settingsReturnTo = null;
function openSettings(from) {
  settingsReturnTo = from;
  Sound.playClick();
  showOverlay(dom.settingsPanel);
}
document.getElementById('start-settings-btn').addEventListener('click', () => openSettings('start'));
document.getElementById('pause-settings-btn').addEventListener('click', () => openSettings('pause'));
document.getElementById('settings-back-btn').addEventListener('click', () => {
  Sound.playClick();
  hideOverlay(dom.settingsPanel);
});

// About
document.getElementById('start-about-btn').addEventListener('click', () => { Sound.playClick(); showOverlay(dom.aboutPanel); });
document.getElementById('about-back-btn').addEventListener('click', () => { Sound.playClick(); hideOverlay(dom.aboutPanel); });

// Settings controls
dom.musicToggle.addEventListener('change', e => { Sound.init(); Sound.toggleMusic(e.target.checked); });
dom.sfxToggle.addEventListener('change', e => { Sound.init(); Sound.toggleSfx(e.target.checked); });
dom.musicVol.addEventListener('input', e => { Sound.init(); Sound.setMusicVol(e.target.value / 100); });
dom.sfxVol.addEventListener('input', e => { Sound.init(); Sound.setSfxVol(e.target.value / 100); });

// Theme selector
dom.themeSelector.addEventListener('click', e => {
  const opt = e.target.closest('.theme-option');
  if (!opt) return;
  Sound.init(); Sound.playClick();
  dom.themeSelector.querySelectorAll('.theme-option').forEach(o => o.classList.remove('selected'));
  opt.classList.add('selected');
  applyTheme(opt.dataset.theme);
});


// ─────────────────────────────────────────────────────────────
// 17. CAMERA
// ─────────────────────────────────────────────────────────────

const camTarget = new THREE.Vector3();

function updateCamera() {
  camTarget.copy(ball.position).add(CONFIG.camOffset);
  camera.position.lerp(camTarget, CONFIG.camSmoothing);
  camera.lookAt(
    ball.position.x * 0.3,
    ball.position.y + 1,
    ball.position.z + CONFIG.camLookAhead
  );
}


// ─────────────────────────────────────────────────────────────
// 18. TRAIL
// ─────────────────────────────────────────────────────────────

function updateTrail(dt) {
  if (state.phase !== 'playing') return;
  trailTimer += dt;
  if (trailTimer >= 0.016) {
    trailTimer = 0;
    trailHistory.unshift(ball.position.clone());
    if (trailHistory.length > TRAIL_COUNT * 3) trailHistory.length = TRAIL_COUNT * 3;
  }
  for (let i = 0; i < TRAIL_COUNT; i++) {
    const idx = (i + 1) * 2;
    if (idx < trailHistory.length) {
      trailSpheres[i].mesh.position.copy(trailHistory[idx]);
      trailSpheres[i].mesh.visible = true;
    }
  }
}


// ─────────────────────────────────────────────────────────────
// 19. HUD UPDATE
// ─────────────────────────────────────────────────────────────

function updateHUD() {
  dom.scoreValue.textContent = Math.floor(state.score);
  dom.bestValue.textContent = state.highScore;
  dom.speedValue.textContent = state.currentSpeed.toFixed(1);
  dom.healthValue.textContent = '❤️'.repeat(state.health);
}


// ─────────────────────────────────────────────────────────────
// 20. MAIN GAME LOOP
// ─────────────────────────────────────────────────────────────

let lastTime = performance.now();

function gameLoop() {
  requestAnimationFrame(gameLoop);

  const now = performance.now();
  let dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;

  // ── Always-on visuals ──
  updateCamera();
  starfield.position.z = ball.position.z;
  ballLight.position.copy(ball.position).add(new THREE.Vector3(0, 2, 0));
  glowMat.opacity = THEMES[state.selectedTheme].glowOp + Math.sin(now * 0.003) * 0.03;

  // ── Only run game logic when playing ──
  if (state.phase !== 'playing') {
    renderer.render(scene, camera);
    return;
  }

  state.timePlayed += dt;

  // ── Health Regen ──
  if (state.health < CONFIG.maxHealth) {
    state.healthRegenTimer += dt;
    if (state.healthRegenTimer >= CONFIG.healthRegenInterval) {
      state.health++;
      state.healthRegenTimer = 0;
    }
  }

  // ── Invincibility ──
  let isInvincible = false;
  if (state.invincibleTimer > 0) {
    state.invincibleTimer -= dt;
    isInvincible = true;
    // Blinking effect
    ball.visible = Math.floor(now / 100) % 2 === 0;
  } else {
    ball.visible = true;
  }

  // ── Speed: manual control & decay ──
  if (state.inputUp) {
    state.currentSpeed += 5 * dt;
  } else if (state.inputDown) {
    state.currentSpeed -= 5 * dt;
  } else {
    // Decay if no input
    state.currentSpeed -= CONFIG.speedDecayRate * dt;
  }
  state.currentSpeed = Math.max(CONFIG.minSpeed, Math.min(CONFIG.maxSpeed, state.currentSpeed));

  // ── Forward movement ──
  ball.position.z += state.currentSpeed * dt;
  state.distance += state.currentSpeed * dt;

  // ── Score: increases faster at higher speed ──
  state.score += state.currentSpeed * dt * 0.5;

  // ── Lateral movement ──
  let lateral = 0;
  if (state.inputLeft)  lateral -= 1;
  if (state.inputRight) lateral += 1;
  if (Math.abs(state.touchDeltaX) > 0.01) lateral = state.touchDeltaX;
  ball.position.x += lateral * CONFIG.laneSpeed * dt;
  ball.position.x = Math.max(-CONFIG.trackHalfWidth, Math.min(CONFIG.trackHalfWidth, ball.position.x));

  // ── Gravity / ground ──
  const segUnder = getSegmentUnder();
  const groundY = CONFIG.ballRadius + CONFIG.trackThickness / 2 + 0.05;
  if (segUnder) {
    if (ball.position.y <= groundY) {
      ball.position.y = groundY;
      state.ballVelY = 0; state.onGround = true;
    } else {
      state.ballVelY += CONFIG.gravity * dt;
      ball.position.y += state.ballVelY * dt;
    }
  } else {
    state.onGround = false;
    state.ballVelY += CONFIG.gravity * dt;
    ball.position.y += state.ballVelY * dt;
  }

  // ── Ball rolling rotation (realistic physics) ──
  // Circumference = 2 * PI * r. Rotation angle = distance / r.
  ball.rotation.x += (state.currentSpeed * dt) / CONFIG.ballRadius;
  ball.rotation.z -= (lateral * CONFIG.laneSpeed * dt) / CONFIG.ballRadius;

  // ── Fall check ──
  if (ball.position.y < CONFIG.fallThreshold) {
    triggerGameOver();
    renderer.render(scene, camera);
    return;
  }

  // ── Obstacle collision ──
  if (!isInvincible && checkObstacleHit()) {
    state.health--;
    Sound.playHit();
    
    // Hit flash
    dom.hitFlash.classList.add('active');
    setTimeout(() => dom.hitFlash.classList.remove('active'), 250);
    
    // Camera shake
    CONFIG.camOffset.x = (Math.random() - 0.5) * 1.5;
    CONFIG.camOffset.y = 5.5 + (Math.random() - 0.5) * 1.5;
    setTimeout(() => { CONFIG.camOffset.set(0, 5.5, -9); }, 200);

    if (state.health <= 0) {
      triggerGameOver();
      renderer.render(scene, camera);
      return;
    } else {
      state.invincibleTimer = CONFIG.invincibleDuration;
      // Slight speed penalty on hit
      state.currentSpeed = Math.max(CONFIG.minSpeed, state.currentSpeed - 3);
    }
  }

  // ── Updates ──
  spawnSegments();
  cleanupSegments();
  updateObstacles(dt);
  updateBoosters(dt);
  updateTrail(dt);
  updateHUD();

  renderer.render(scene, camera);
}


// ─────────────────────────────────────────────────────────────
// 21. INITIALIZE
// ─────────────────────────────────────────────────────────────

loadHighScore();
spawnSegments();
camera.position.copy(ball.position).add(CONFIG.camOffset);
applyTheme('space');
gameLoop();
