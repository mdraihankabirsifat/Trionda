/* ═══════════════════════════════════════════════════════════
   Space Ball Runner — game.js
   A minimal 3D space-themed rolling ball runner using Three.js
   
   Architecture:
   ─────────────
   1. SETUP     — Scene, camera, renderer, lighting
   2. STARFIELD — Particle-based space background
   3. PLAYER    — Glowing sphere with trail effect
   4. TRACK     — Procedural segment spawning with zones
   5. ORBS      — Collectible energy orbs
   6. GAME LOOP — Physics, input, scoring, game state
   ═══════════════════════════════════════════════════════════ */


// ─────────────────────────────────────────────────────────────
// 1. CONSTANTS & CONFIGURATION
// ─────────────────────────────────────────────────────────────

const CONFIG = {
  // Track
  trackWidth:         10,       // Width of each track segment
  trackThickness:     0.5,      // Height/thickness of the platform
  segmentLength:      24,       // Length of each segment along Z
  segmentsAhead:      14,       // How many segments to keep spawned ahead
  segmentDestroyDist: 40,       // Distance behind player before cleanup

  // Player
  ballRadius:         0.5,
  laneSpeed:          14,       // Lateral movement speed
  trackHalfWidth:     4.2,      // How far left/right the ball can go
  gravity:           -25,       // Downward acceleration when falling
  fallThreshold:     -8,        // Y pos that triggers game over

  // Speed
  baseSpeed:          8,        // Starting forward speed
  speedIncRate:       0.12,     // Speed increase per second
  maxSpeed:           35,       // Speed cap

  // Speed zones
  slowMultiplier:     0.45,     // Blue zone multiplier
  fastMultiplier:     1.9,      // Red zone multiplier
  zoneDuration:       2.8,      // How long zone effect lasts (seconds)
  specialChance:      0.22,     // Chance a segment is special (0-1)

  // Collectibles
  orbChance:          0.45,     // Chance a segment has orbs
  orbsPerSegment:     3,
  orbRadius:          0.3,
  orbPointValue:      10,
  orbBobSpeed:        2.5,
  orbBobHeight:       0.35,
  orbRotateSpeed:     2,

  // Stars
  starCount:          2500,
  starSpread:         300,

  // Camera
  camOffset:          new THREE.Vector3(0, 5.5, -9),
  camLookAhead:       8,
  camSmoothing:       0.08,

  // Edge glow rails
  railWidth:          0.18,
  railHeight:         0.35,
};


// ─────────────────────────────────────────────────────────────
// 2. GAME STATE
// ─────────────────────────────────────────────────────────────

const state = {
  started:        false,
  gameOver:       false,
  score:          0,
  distance:       0,
  timePlayed:     0,
  currentSpeed:   CONFIG.baseSpeed,

  // Speed zone effect
  zoneMultiplier: 1,
  zoneTimer:      0,

  // Player physics
  ballVelY:       0,
  onGround:       true,

  // Input
  inputLeft:      false,
  inputRight:     false,

  // Touch input
  touchStartX:    0,
  touchDeltaX:    0,
};


// ─────────────────────────────────────────────────────────────
// 3. DOM REFERENCES
// ─────────────────────────────────────────────────────────────

const dom = {
  canvas:         document.getElementById('game-canvas'),
  scoreValue:     document.getElementById('score-value'),
  speedValue:     document.getElementById('speed-value'),
  startScreen:    document.getElementById('start-screen'),
  gameoverScreen: document.getElementById('gameover-screen'),
  finalScore:     document.getElementById('final-score'),
  finalDistance:   document.getElementById('final-distance'),
  restartBtn:     document.getElementById('restart-btn'),
  zoneIndicator:  document.getElementById('zone-indicator'),
};


// ─────────────────────────────────────────────────────────────
// 4. THREE.JS SETUP — Scene, Camera, Renderer
// ─────────────────────────────────────────────────────────────

// Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x030108);
scene.fog = new THREE.FogExp2(0x030108, 0.012);

// Camera (perspective, behind the ball)
const camera = new THREE.PerspectiveCamera(
  65,                                           // FOV
  window.innerWidth / window.innerHeight,       // Aspect
  0.1,                                          // Near
  500                                           // Far
);
camera.position.set(0, 6, -10);

// Renderer
const renderer = new THREE.WebGLRenderer({
  canvas: dom.canvas,
  antialias: true,
  alpha: false,
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = false; // Keep it lightweight

// Handle window resize
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});


// ─────────────────────────────────────────────────────────────
// 5. LIGHTING — Ambient + Directional for space feel
// ─────────────────────────────────────────────────────────────

// Subtle purple ambient light (space feel)
const ambientLight = new THREE.AmbientLight(0x1a0e33, 0.6);
scene.add(ambientLight);

// Main directional light (sun-like, from above-right)
const dirLight = new THREE.DirectionalLight(0xc8b0ff, 0.8);
dirLight.position.set(5, 15, 10);
scene.add(dirLight);

// Subtle hemisphere light (sky = purple, ground = dark blue)
const hemiLight = new THREE.HemisphereLight(0x4a2080, 0x080420, 0.4);
scene.add(hemiLight);

// Point light that follows the ball (local glow)
const ballLight = new THREE.PointLight(0x7df0ff, 1.2, 15);
scene.add(ballLight);


// ─────────────────────────────────────────────────────────────
// 6. STARFIELD — Thousands of tiny points in space
// ─────────────────────────────────────────────────────────────

function createStarfield() {
  const starGeo = new THREE.BufferGeometry();
  const positions = new Float32Array(CONFIG.starCount * 3);
  const colors = new Float32Array(CONFIG.starCount * 3);
  const sizes = new Float32Array(CONFIG.starCount);

  // Color palette for stars
  const starColors = [
    new THREE.Color(1.0, 1.0, 1.0),       // White
    new THREE.Color(0.7, 0.8, 1.0),       // Pale blue
    new THREE.Color(1.0, 0.9, 0.7),       // Warm yellow
    new THREE.Color(0.8, 0.7, 1.0),       // Lavender
    new THREE.Color(0.5, 0.9, 1.0),       // Cyan
  ];

  for (let i = 0; i < CONFIG.starCount; i++) {
    const i3 = i * 3;

    // Random position in a large sphere around origin
    const r = CONFIG.starSpread;
    positions[i3]     = (Math.random() - 0.5) * r;
    positions[i3 + 1] = (Math.random() - 0.5) * r;
    positions[i3 + 2] = (Math.random() - 0.5) * r * 3; // Elongated along Z (forward)

    // Random color from palette
    const col = starColors[Math.floor(Math.random() * starColors.length)];
    colors[i3]     = col.r;
    colors[i3 + 1] = col.g;
    colors[i3 + 2] = col.b;

    // Random size
    sizes[i] = Math.random() * 1.5 + 0.3;
  }

  starGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  starGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

  const starMat = new THREE.PointsMaterial({
    size: 0.6,
    vertexColors: true,
    transparent: true,
    opacity: 0.85,
    sizeAttenuation: true,
  });

  const stars = new THREE.Points(starGeo, starMat);
  scene.add(stars);
  return stars;
}

const starfield = createStarfield();


// ─────────────────────────────────────────────────────────────
// 7. PLAYER BALL — Glowing sphere
// ─────────────────────────────────────────────────────────────

// Main ball mesh
const ballGeo = new THREE.SphereGeometry(CONFIG.ballRadius, 24, 24);
const ballMat = new THREE.MeshStandardMaterial({
  color: 0x40d0f0,
  emissive: 0x20a0d0,
  emissiveIntensity: 0.7,
  metalness: 0.3,
  roughness: 0.2,
});
const ball = new THREE.Mesh(ballGeo, ballMat);
ball.position.set(0, CONFIG.ballRadius + CONFIG.trackThickness / 2 + 0.05, 0);
scene.add(ball);

// Outer glow shell (slightly larger, transparent)
const glowGeo = new THREE.SphereGeometry(CONFIG.ballRadius * 1.35, 20, 20);
const glowMat = new THREE.MeshBasicMaterial({
  color: 0x60e0ff,
  transparent: true,
  opacity: 0.12,
});
const ballGlow = new THREE.Mesh(glowGeo, glowMat);
ball.add(ballGlow); // Child of ball so it follows automatically

// Trail — series of small fading spheres behind the ball
const trailSpheres = [];
const TRAIL_COUNT = 18;
const trailGeo = new THREE.SphereGeometry(0.12, 8, 8);

for (let i = 0; i < TRAIL_COUNT; i++) {
  const trailMat = new THREE.MeshBasicMaterial({
    color: 0x60e0ff,
    transparent: true,
    opacity: 0.4 * (1 - i / TRAIL_COUNT),  // Fade out further from ball
  });
  const trailSphere = new THREE.Mesh(trailGeo, trailMat);
  trailSphere.scale.setScalar(1 - (i / TRAIL_COUNT) * 0.6);
  trailSphere.visible = false;
  scene.add(trailSphere);
  trailSpheres.push({
    mesh: trailSphere,
    pos: new THREE.Vector3(),
  });
}

// Trail position history (ring buffer)
const trailHistory = [];
const TRAIL_RECORD_INTERVAL = 0.016; // ~60fps recording
let trailRecordTimer = 0;


// ─────────────────────────────────────────────────────────────
// 8. TRACK SEGMENTS — Procedural generation
// ─────────────────────────────────────────────────────────────

/*
  Segment types:
  - "normal"  → Dark purple/grey platform
  - "slow"    → Blue glowing platform (slows the ball)
  - "fast"    → Red/orange glowing platform (speeds up the ball)
*/

// Material presets for each segment type
const segmentMaterials = {
  normal: {
    platform: new THREE.MeshStandardMaterial({
      color: 0x1a0e33,
      emissive: 0x0d0520,
      emissiveIntensity: 0.3,
      metalness: 0.6,
      roughness: 0.4,
    }),
    rail: new THREE.MeshBasicMaterial({
      color: 0x5030a0,
      transparent: true,
      opacity: 0.8,
    }),
  },
  slow: {
    platform: new THREE.MeshStandardMaterial({
      color: 0x0a1840,
      emissive: 0x1060e0,
      emissiveIntensity: 0.6,
      metalness: 0.5,
      roughness: 0.3,
    }),
    rail: new THREE.MeshBasicMaterial({
      color: 0x40a0ff,
      transparent: true,
      opacity: 0.9,
    }),
  },
  fast: {
    platform: new THREE.MeshStandardMaterial({
      color: 0x3a1005,
      emissive: 0xe05010,
      emissiveIntensity: 0.6,
      metalness: 0.5,
      roughness: 0.3,
    }),
    rail: new THREE.MeshBasicMaterial({
      color: 0xff6020,
      transparent: true,
      opacity: 0.9,
    }),
  },
};

// Active segments and orbs arrays
const segments = [];
const orbs = [];
let nextSpawnZ = 0;
let segmentsCreated = 0;


/**
 * Creates a single track segment at the given Z position.
 * @param {number} z       — Z position for the segment center
 * @param {string} type    — "normal", "slow", or "fast"
 * @returns {object}       — Segment data object
 */
function createSegment(z, type) {
  const group = new THREE.Group();
  group.position.set(0, 0, z);

  const mats = segmentMaterials[type];
  const W = CONFIG.trackWidth;
  const H = CONFIG.trackThickness;
  const L = CONFIG.segmentLength;

  // ── Main platform ──
  const platGeo = new THREE.BoxGeometry(W, H, L);
  const platform = new THREE.Mesh(platGeo, mats.platform);
  platform.position.y = 0;
  group.add(platform);

  // ── Left rail ──
  const railGeo = new THREE.BoxGeometry(CONFIG.railWidth, CONFIG.railHeight, L);
  const leftRail = new THREE.Mesh(railGeo, mats.rail);
  leftRail.position.set(
    -(W / 2) + CONFIG.railWidth / 2,
    H / 2 + CONFIG.railHeight / 2,
    0
  );
  group.add(leftRail);

  // ── Right rail ──
  const rightRail = new THREE.Mesh(railGeo, mats.rail);
  rightRail.position.set(
    W / 2 - CONFIG.railWidth / 2,
    H / 2 + CONFIG.railHeight / 2,
    0
  );
  group.add(rightRail);

  // ── Zone glow plane (for slow/fast segments) ──
  if (type === 'slow' || type === 'fast') {
    const glowColor = type === 'slow' ? 0x2080ff : 0xff4010;
    const glowPlaneGeo = new THREE.PlaneGeometry(W * 0.9, L * 0.9);
    const glowPlaneMat = new THREE.MeshBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: 0.08,
      side: THREE.DoubleSide,
    });
    const glowPlane = new THREE.Mesh(glowPlaneGeo, glowPlaneMat);
    glowPlane.rotation.x = -Math.PI / 2;
    glowPlane.position.y = H / 2 + 0.02;
    group.add(glowPlane);

    // Add floating zone light
    const zoneLight = new THREE.PointLight(glowColor, 0.8, 18);
    zoneLight.position.set(0, 3, 0);
    group.add(zoneLight);
  }

  scene.add(group);

  const segData = {
    group,
    type,
    z,
    length: L,
    zStart: z - L / 2,   // World Z start of this segment
    zEnd: z + L / 2,     // World Z end of this segment
    triggered: false,     // Has the speed zone been triggered?
  };

  segments.push(segData);
  return segData;
}


/**
 * Picks a random segment type, weighted toward normal.
 */
function pickSegmentType() {
  if (Math.random() > CONFIG.specialChance) return 'normal';
  return Math.random() < 0.5 ? 'slow' : 'fast';
}


/**
 * Spawns segments ahead of the player as needed.
 */
function spawnSegments() {
  const targetZ = ball.position.z + CONFIG.segmentsAhead * CONFIG.segmentLength;

  while (nextSpawnZ < targetZ) {
    // First 3 segments are always normal
    const type = segmentsCreated < 3 ? 'normal' : pickSegmentType();
    const seg = createSegment(nextSpawnZ, type);

    // Spawn collectible orbs on some segments
    if (segmentsCreated >= 2 && Math.random() < CONFIG.orbChance) {
      spawnOrbs(seg);
    }

    nextSpawnZ += CONFIG.segmentLength;
    segmentsCreated++;
  }
}


/**
 * Removes segments that are far behind the player.
 */
function cleanupSegments() {
  for (let i = segments.length - 1; i >= 0; i--) {
    const seg = segments[i];
    if (ball.position.z - seg.z > CONFIG.segmentDestroyDist) {
      scene.remove(seg.group);
      // Dispose geometries/materials to free memory
      seg.group.traverse((child) => {
        if (child.geometry) child.geometry.dispose();
        if (child.material) child.material.dispose();
      });
      segments.splice(i, 1);
    }
  }
}


// ─────────────────────────────────────────────────────────────
// 9. COLLECTIBLE ENERGY ORBS
// ─────────────────────────────────────────────────────────────

const orbMat = new THREE.MeshStandardMaterial({
  color: 0x30ffc0,
  emissive: 0x20e0a0,
  emissiveIntensity: 0.9,
  metalness: 0.2,
  roughness: 0.1,
});

const orbGlowMat = new THREE.MeshBasicMaterial({
  color: 0x40ffd0,
  transparent: true,
  opacity: 0.15,
});

const orbGeo = new THREE.SphereGeometry(CONFIG.orbRadius, 12, 12);
const orbGlowGeo = new THREE.SphereGeometry(CONFIG.orbRadius * 1.8, 10, 10);


/**
 * Spawns collectible orbs on a given track segment.
 */
function spawnOrbs(segment) {
  const halfW = CONFIG.trackWidth * 0.35;

  for (let i = 0; i < CONFIG.orbsPerSegment; i++) {
    const orbMesh = new THREE.Mesh(orbGeo, orbMat);
    const x = (Math.random() - 0.5) * halfW * 2;
    const z = segment.z + (Math.random() - 0.5) * (segment.length - 4);
    const y = CONFIG.trackThickness / 2 + 1.2;

    orbMesh.position.set(x, y, z);

    // Add glow shell
    const glowShell = new THREE.Mesh(orbGlowGeo, orbGlowMat);
    orbMesh.add(glowShell);

    // Add a small point light
    const orbLight = new THREE.PointLight(0x40ffd0, 0.4, 5);
    orbMesh.add(orbLight);

    scene.add(orbMesh);

    orbs.push({
      mesh: orbMesh,
      baseY: y,
      z,
      collected: false,
      phase: Math.random() * Math.PI * 2, // Random start phase for bobbing
    });
  }
}


/**
 * Updates orb animations (rotation, bobbing) and checks collection.
 */
function updateOrbs(dt) {
  const ballPos = ball.position;

  for (let i = orbs.length - 1; i >= 0; i--) {
    const orb = orbs[i];

    if (orb.collected) continue;

    // Animate: rotate and bob
    orb.mesh.rotation.y += CONFIG.orbRotateSpeed * dt;
    orb.mesh.position.y = orb.baseY +
      Math.sin(performance.now() * 0.001 * CONFIG.orbBobSpeed + orb.phase) * CONFIG.orbBobHeight;

    // Collection check — simple distance
    const dx = ballPos.x - orb.mesh.position.x;
    const dy = ballPos.y - orb.mesh.position.y;
    const dz = ballPos.z - orb.mesh.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (dist < CONFIG.ballRadius + CONFIG.orbRadius + 0.4) {
      // Collected!
      orb.collected = true;
      state.score += CONFIG.orbPointValue;
      scene.remove(orb.mesh);
      orbs.splice(i, 1);
      continue;
    }

    // Cleanup if far behind
    if (ballPos.z - orb.z > 30) {
      scene.remove(orb.mesh);
      orbs.splice(i, 1);
    }
  }
}


// ─────────────────────────────────────────────────────────────
// 10. COLLISION DETECTION — Track surface check
// ─────────────────────────────────────────────────────────────

/**
 * Checks if the ball is above a track segment.
 * Returns the segment if found, or null if the ball is in a gap.
 */
function getSegmentUnderBall() {
  const bx = ball.position.x;
  const bz = ball.position.z;
  const halfW = CONFIG.trackWidth / 2;

  for (const seg of segments) {
    // Check if ball Z is within segment Z range
    if (bz >= seg.zStart && bz <= seg.zEnd) {
      // Check if ball X is within track width
      if (bx >= -halfW && bx <= halfW) {
        return seg;
      }
    }
  }
  return null;
}


// ─────────────────────────────────────────────────────────────
// 11. SPEED ZONES — Apply slow/fast effects
// ─────────────────────────────────────────────────────────────

/**
 * Checks if the ball entered a speed zone and applies the effect.
 */
function checkSpeedZones() {
  const bz = ball.position.z;

  for (const seg of segments) {
    if (seg.triggered) continue;
    if (seg.type === 'normal') continue;

    // Check if ball is inside this segment
    if (bz >= seg.zStart && bz <= seg.zEnd) {
      seg.triggered = true;

      if (seg.type === 'slow') {
        state.zoneMultiplier = CONFIG.slowMultiplier;
        state.zoneTimer = CONFIG.zoneDuration;
        showZoneIndicator('slow', '▼ SLOW ZONE');
      } else if (seg.type === 'fast') {
        state.zoneMultiplier = CONFIG.fastMultiplier;
        state.zoneTimer = CONFIG.zoneDuration;
        showZoneIndicator('fast', '▲ BOOST ZONE');
      }
    }
  }
}


/**
 * Shows the zone effect indicator at the bottom of the screen.
 */
function showZoneIndicator(type, text) {
  const el = dom.zoneIndicator;
  el.textContent = text;
  el.className = `visible ${type}`;

  // Hide after zone duration
  clearTimeout(el._hideTimeout);
  el._hideTimeout = setTimeout(() => {
    el.className = '';
  }, CONFIG.zoneDuration * 1000);
}


// ─────────────────────────────────────────────────────────────
// 12. INPUT HANDLING — Keyboard + Touch
// ─────────────────────────────────────────────────────────────

// Keyboard
window.addEventListener('keydown', (e) => {
  if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft')  state.inputLeft = true;
  if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') state.inputRight = true;

  // Start the game on any key press
  if (!state.started && !state.gameOver) {
    startGame();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft')  state.inputLeft = false;
  if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') state.inputRight = false;
});

// Touch (swipe/drag left-right)
window.addEventListener('touchstart', (e) => {
  state.touchStartX = e.touches[0].clientX;
  state.touchDeltaX = 0;

  // Start game on touch
  if (!state.started && !state.gameOver) {
    startGame();
  }
}, { passive: true });

window.addEventListener('touchmove', (e) => {
  const dx = e.touches[0].clientX - state.touchStartX;
  state.touchDeltaX = dx * 0.012; // Sensitivity factor
  state.touchStartX = e.touches[0].clientX;
}, { passive: true });

window.addEventListener('touchend', () => {
  state.touchDeltaX = 0;
}, { passive: true });

// Restart button
dom.restartBtn.addEventListener('click', restartGame);


// ─────────────────────────────────────────────────────────────
// 13. GAME STATE MANAGEMENT
// ─────────────────────────────────────────────────────────────

/**
 * Starts the game from the title screen.
 */
function startGame() {
  state.started = true;
  dom.startScreen.classList.add('hidden');
}


/**
 * Triggers game over state.
 */
function triggerGameOver() {
  if (state.gameOver) return;
  state.gameOver = true;

  // Update final score display
  const totalScore = state.score + Math.floor(state.distance);
  dom.finalScore.textContent = `Score: ${totalScore}`;
  dom.finalDistance.textContent = `Distance: ${Math.floor(state.distance)}m`;

  // Show game over screen with a small delay
  setTimeout(() => {
    dom.gameoverScreen.classList.add('visible');
  }, 300);
}


/**
 * Restarts the game — resets everything.
 */
function restartGame() {
  // Reset state
  state.started = true;
  state.gameOver = false;
  state.score = 0;
  state.distance = 0;
  state.timePlayed = 0;
  state.currentSpeed = CONFIG.baseSpeed;
  state.zoneMultiplier = 1;
  state.zoneTimer = 0;
  state.ballVelY = 0;
  state.onGround = true;
  state.inputLeft = false;
  state.inputRight = false;
  state.touchDeltaX = 0;

  // Remove all segments
  for (const seg of segments) {
    scene.remove(seg.group);
    seg.group.traverse((child) => {
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    });
  }
  segments.length = 0;

  // Remove all orbs
  for (const orb of orbs) {
    scene.remove(orb.mesh);
  }
  orbs.length = 0;

  // Reset ball position
  ball.position.set(0, CONFIG.ballRadius + CONFIG.trackThickness / 2 + 0.05, 0);

  // Reset spawn position
  nextSpawnZ = 0;
  segmentsCreated = 0;

  // Clear trail
  trailHistory.length = 0;
  for (const t of trailSpheres) {
    t.mesh.visible = false;
  }

  // Hide screens
  dom.gameoverScreen.classList.remove('visible');
  dom.startScreen.classList.add('hidden');
  dom.zoneIndicator.className = '';

  // Spawn initial segments
  spawnSegments();
}


// ─────────────────────────────────────────────────────────────
// 14. UPDATE HUD
// ─────────────────────────────────────────────────────────────

function updateHUD() {
  const totalScore = state.score + Math.floor(state.distance);
  dom.scoreValue.textContent = totalScore;
  dom.speedValue.textContent = state.currentSpeed.toFixed(1);
}


// ─────────────────────────────────────────────────────────────
// 15. CAMERA FOLLOW
// ─────────────────────────────────────────────────────────────

// Smooth camera position (lerped)
const camTargetPos = new THREE.Vector3();

function updateCamera(dt) {
  // Desired camera position = ball position + offset
  camTargetPos.copy(ball.position).add(CONFIG.camOffset);

  // Smooth interpolation (lerp)
  camera.position.lerp(camTargetPos, CONFIG.camSmoothing);

  // Look ahead of the ball
  const lookTarget = new THREE.Vector3(
    ball.position.x * 0.3,                          // Slight lateral follow
    ball.position.y + 1,                            // Slightly above ball
    ball.position.z + CONFIG.camLookAhead           // Look ahead
  );
  camera.lookAt(lookTarget);
}


// ─────────────────────────────────────────────────────────────
// 16. TRAIL UPDATE
// ─────────────────────────────────────────────────────────────

function updateTrail(dt) {
  if (!state.started || state.gameOver) return;

  // Record ball position periodically
  trailRecordTimer += dt;
  if (trailRecordTimer >= TRAIL_RECORD_INTERVAL) {
    trailRecordTimer = 0;
    trailHistory.unshift(ball.position.clone());
    if (trailHistory.length > TRAIL_COUNT * 3) {
      trailHistory.length = TRAIL_COUNT * 3;
    }
  }

  // Position trail spheres along history
  for (let i = 0; i < TRAIL_COUNT; i++) {
    const histIdx = (i + 1) * 2; // Sample every 2nd position for spacing
    if (histIdx < trailHistory.length) {
      trailSpheres[i].mesh.position.copy(trailHistory[histIdx]);
      trailSpheres[i].mesh.visible = true;
    }
  }
}


// ─────────────────────────────────────────────────────────────
// 17. MAIN GAME LOOP
// ─────────────────────────────────────────────────────────────

let lastTime = performance.now();

function gameLoop() {
  requestAnimationFrame(gameLoop);

  const now = performance.now();
  let dt = (now - lastTime) / 1000; // Delta time in seconds
  lastTime = now;

  // Clamp delta to avoid spiral of death on tab switch
  dt = Math.min(dt, 0.05);

  // ─── Always update visuals ───
  updateCamera(dt);

  // Move starfield with the ball so stars are always around the player
  starfield.position.z = ball.position.z;

  // Ball light follows ball
  ballLight.position.copy(ball.position);
  ballLight.position.y += 2;

  // Animate ball glow pulsing
  const pulseVal = 0.09 + Math.sin(now * 0.003) * 0.04;
  glowMat.opacity = pulseVal;

  // ─── Game logic (only when playing) ───
  if (!state.started || state.gameOver) {
    renderer.render(scene, camera);
    return;
  }

  state.timePlayed += dt;

  // ── Speed calculation ──
  // Base speed increases over time
  let timeSpeed = CONFIG.baseSpeed + CONFIG.speedIncRate * state.timePlayed;
  timeSpeed = Math.min(timeSpeed, CONFIG.maxSpeed);

  // Apply zone multiplier
  if (state.zoneTimer > 0) {
    state.zoneTimer -= dt;
    state.currentSpeed = timeSpeed * state.zoneMultiplier;
  } else {
    state.zoneMultiplier = 1;
    state.currentSpeed = timeSpeed;
  }

  // ── Forward movement ──
  ball.position.z += state.currentSpeed * dt;
  state.distance += state.currentSpeed * dt;

  // ── Lateral movement ──
  let lateralInput = 0;

  if (state.inputLeft)  lateralInput -= 1;
  if (state.inputRight) lateralInput += 1;

  // Touch input overrides keyboard if active
  if (Math.abs(state.touchDeltaX) > 0.01) {
    lateralInput = state.touchDeltaX;
  }

  ball.position.x += lateralInput * CONFIG.laneSpeed * dt;

  // Clamp to track width
  ball.position.x = Math.max(-CONFIG.trackHalfWidth, Math.min(CONFIG.trackHalfWidth, ball.position.x));

  // ── Gravity / ground detection ──
  const segUnder = getSegmentUnderBall();
  const groundY = CONFIG.ballRadius + CONFIG.trackThickness / 2 + 0.05;

  if (segUnder) {
    // On a track segment
    if (ball.position.y <= groundY) {
      ball.position.y = groundY;
      state.ballVelY = 0;
      state.onGround = true;
    } else {
      // Falling onto the track
      state.ballVelY += CONFIG.gravity * dt;
      ball.position.y += state.ballVelY * dt;
    }
  } else {
    // No track underneath — fall!
    state.onGround = false;
    state.ballVelY += CONFIG.gravity * dt;
    ball.position.y += state.ballVelY * dt;
  }

  // ── Ball visual rotation (rolling effect) ──
  ball.rotation.x += state.currentSpeed * dt * 2;
  ball.rotation.z -= lateralInput * CONFIG.laneSpeed * dt * 1.5;

  // ── Fall detection ──
  if (ball.position.y < CONFIG.fallThreshold) {
    triggerGameOver();
  }

  // ── Speed zones ──
  checkSpeedZones();

  // ── Track spawning & cleanup ──
  spawnSegments();
  cleanupSegments();

  // ── Orbs ──
  updateOrbs(dt);

  // ── Trail ──
  updateTrail(dt);

  // ── Ball material color based on zone ──
  if (state.zoneTimer > 0) {
    if (state.zoneMultiplier < 1) {
      // Slow zone — ball turns blue
      ballMat.emissive.setHex(0x1060e0);
      ballMat.color.setHex(0x3080f0);
      glowMat.color.setHex(0x4090ff);
    } else {
      // Fast zone — ball turns orange
      ballMat.emissive.setHex(0xe05010);
      ballMat.color.setHex(0xf07030);
      glowMat.color.setHex(0xff6020);
    }
  } else {
    // Default cyan
    ballMat.emissive.setHex(0x20a0d0);
    ballMat.color.setHex(0x40d0f0);
    glowMat.color.setHex(0x60e0ff);
  }

  // ── HUD ──
  updateHUD();

  // ── Render ──
  renderer.render(scene, camera);
}


// ─────────────────────────────────────────────────────────────
// 18. INITIALIZE & START
// ─────────────────────────────────────────────────────────────

// Spawn the initial track
spawnSegments();

// Position camera at the ball
camera.position.copy(ball.position).add(CONFIG.camOffset);

// Start the game loop
gameLoop();
