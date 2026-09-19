/* ===================================================================
   KAGE: ZERO SECOND — прототип боевой системы
   Механики: движение, Echo (запись и повтор действий), ZERO SECOND,
   один враг, простая боевая система.
   Всё в одном файле, чтобы было легко читать и менять шаг за шагом.
   =================================================================== */

// ---------- НАСТРОЙКИ (можно менять и сразу видеть эффект) ----------
const PLAYER_SPEED = 5.2;
const ENEMY_SPEED = 2.4;
const PLAYER_MAX_HP = 100;
const ENEMY_MAX_HP = 60;
const ATTACK_RANGE = 2.0;
const ATTACK_COOLDOWN = 0.45;
const BASE_DAMAGE = 12;
const ENEMY_ATTACK_RANGE = 1.6;
const ENEMY_ATTACK_COOLDOWN = 1.1;
const ENEMY_DAMAGE = 9;
const AGGRO_RANGE = 12;
const HISTORY_DURATION = 4.0;      // сколько секунд действий Echo помнит
const COUNTER_WINDOW_DURATION = 0.8; // окно двойного урона после ZERO SECOND

// ---------- БАЗОВАЯ СЦЕНА THREE.JS ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05050c);
scene.fog = new THREE.FogExp2(0x05050c, 0.035);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 200);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
document.body.appendChild(renderer.domElement);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Свет
scene.add(new THREE.AmbientLight(0x8888ff, 0.5));
const key = new THREE.DirectionalLight(0xffffff, 0.9);
key.position.set(5, 10, 5);
scene.add(key);
const neonA = new THREE.PointLight(0x2dd4ff, 2.5, 30);
neonA.position.set(-8, 3, -8);
scene.add(neonA);
const neonB = new THREE.PointLight(0xff3b6b, 2.5, 30);
neonB.position.set(8, 3, 8);
scene.add(neonB);

// Пол + неоновая сетка (город Aster-9, черновой намёк)
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(60, 60),
  new THREE.MeshStandardMaterial({ color: 0x0a0a16, roughness: 1 })
);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

const grid = new THREE.GridHelper(60, 40, 0x2dd4ff, 0x7f5cff);
grid.position.y = 0.01;
scene.add(grid);

// ---------- КОСМИЧЕСКОЕ НЕБО: ЗВЁЗДЫ + ПЛАНЕТЫ ----------
function createStarfield(count = 1600) {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = 90 + Math.random() * 80;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random()); // только верхняя полусфера — небо, не под землёй
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi) + 8;
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: 0xffffff, size: 0.7, sizeAttenuation: true, fog: false });
  scene.add(new THREE.Points(geometry, material));
}
createStarfield();

function createPlanet({ radius, color, x, y, z, ring = false }) {
  const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35, roughness: 0.6, fog: false });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(radius, 20, 20), mat);
  planet.position.set(x, y, z);
  scene.add(planet);
  if (ring) {
    const ringMesh = new THREE.Mesh(
      new THREE.RingGeometry(radius * 1.4, radius * 1.9, 32),
      new THREE.MeshBasicMaterial({ color: 0xd9c48f, side: THREE.DoubleSide, transparent: true, opacity: 0.55, fog: false })
    );
    ringMesh.rotation.x = Math.PI / 2 - 0.35;
    ringMesh.position.set(x, y, z);
    scene.add(ringMesh);
  }
}

createPlanet({ radius: 3.2, color: 0x7f5cff, x: -55, y: 30, z: -70, ring: true });
createPlanet({ radius: 1.8, color: 0xff9d5c, x: 60, y: 22, z: -60 });
createPlanet({ radius: 2.4, color: 0x2dd4ff, x: 40, y: 45, z: 65 });
createPlanet({ radius: 1.3, color: 0xff5c8a, x: -35, y: 50, z: 55 });
createPlanet({ radius: 2.0, color: 0x9cf6ff, x: 0, y: 60, z: -85 });

// ---------- ИГРОК: ФИГУРА МАГА ----------
// Строим силуэт мага из простых форм: плащ (конус/цилиндр), капюшон,
// накидка сзади и посох со светящимся навершием — вместо простого кубика.
function makeMageMesh(color) {
  const group = new THREE.Group();

  // мантия/плащ — сужается кверху
  const robe = new THREE.Mesh(
    new THREE.CylinderGeometry(0.24, 0.5, 1.3, 10),
    new THREE.MeshStandardMaterial({ color: 0x14141f, emissive: color, emissiveIntensity: 0.12 })
  );
  robe.position.y = 0.75;
  group.add(robe);

  // светящаяся кайма понизу мантии
  const trim = new THREE.Mesh(
    new THREE.TorusGeometry(0.46, 0.035, 8, 20),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.4 })
  );
  trim.rotation.x = Math.PI / 2;
  trim.position.y = 0.16;
  group.add(trim);

  // голова
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 14, 14),
    new THREE.MeshStandardMaterial({ color: 0xf0cba6 })
  );
  head.position.y = 1.53;
  group.add(head);

  // капюшон
  const hood = new THREE.Mesh(
    new THREE.ConeGeometry(0.32, 0.5, 12, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x14141f, emissive: color, emissiveIntensity: 0.2, side: THREE.DoubleSide })
  );
  hood.position.y = 1.72;
  group.add(hood);

  // накидка сзади — сразу показывает, где "спина"
  const cape = new THREE.Mesh(
    new THREE.PlaneGeometry(0.62, 1.05),
    new THREE.MeshStandardMaterial({ color: 0x181828, emissive: color, emissiveIntensity: 0.15, side: THREE.DoubleSide })
  );
  cape.position.set(0, 1.0, -0.27);
  group.add(cape);

  // посох, направлен вперёд-вбок — показывает, куда смотрит маг
  const staff = new THREE.Mesh(
    new THREE.CylinderGeometry(0.03, 0.03, 1.25, 6),
    new THREE.MeshStandardMaterial({ color: 0x3a2a1a })
  );
  staff.position.set(0.32, 0.95, 0.22);
  staff.rotation.z = 0.18;
  group.add(staff);

  // светящийся орб на посохе — "спецэффект"
  const orb = new THREE.Mesh(
    new THREE.SphereGeometry(0.1, 12, 12),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 2.2 })
  );
  orb.position.set(0.37, 1.58, 0.28);
  group.add(orb);

  const glow = new THREE.PointLight(color, 1.3, 3.5);
  glow.position.copy(orb.position);
  group.add(glow);

  group.userData.bodyMesh = robe;
  group.userData.orbMesh = orb;
  return group;
}

const player = makeMageMesh(0x2dd4ff);
player.position.set(0, 0, 0);
scene.add(player);

const enemyTemplate = 0xff3b6b;
let enemy = makeMageMesh(enemyTemplate);
enemy.position.set(6, 0, -4);
scene.add(enemy);

// ---------- СОСТОЯНИЕ ----------
const state = {
  playerHp: PLAYER_MAX_HP,
  enemyHp: ENEMY_MAX_HP,
  enemyAlive: true,
  attackCooldown: 0,
  enemyAttackCooldown: 0,
  counterWindow: 0,
  history: [],          // {t,x,z,ry} — записанные позиции игрока
  echoActive: false,
  echo: null,
  echoData: null,
  echoStart: 0,
  gameOver: false,
};

// ---------- ВВОД ----------
const keys = {};
window.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'KeyE') tryCreateEcho();
  if (e.code === 'KeyQ') tryZeroSecond();
  if (e.code === 'Space') tryAttack();
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });

// ---------- UI ----------
const playerHpBar = document.getElementById('playerHpBar');
const enemyHpBar = document.getElementById('enemyHpBar');
const echoStatusEl = document.getElementById('echoStatus');
const zeroStatusEl = document.getElementById('zeroStatus');
const banner = document.getElementById('banner');

function showBanner(text, ms = 1200) {
  banner.textContent = text;
  banner.classList.remove('hidden');
  clearTimeout(showBanner._t);
  showBanner._t = setTimeout(() => banner.classList.add('hidden'), ms);
}

// ---------- ЛОГИКА: ДВИЖЕНИЕ ----------
function updateMovement(delta) {
  if (state.gameOver) return;
  const dir = new THREE.Vector3();
  if (keys['KeyW']) dir.z -= 1;
  if (keys['KeyS']) dir.z += 1;
  if (keys['KeyA']) dir.x -= 1;
  if (keys['KeyD']) dir.x += 1;

  if (dir.lengthSq() > 0) {
    dir.normalize();
    player.position.x += dir.x * PLAYER_SPEED * delta;
    player.position.z += dir.z * PLAYER_SPEED * delta;
    player.rotation.y = Math.atan2(dir.x, dir.z);
  }

  // Границы арены
  player.position.x = THREE.MathUtils.clamp(player.position.x, -25, 25);
  player.position.z = THREE.MathUtils.clamp(player.position.z, -25, 25);
}

// ---------- ЛОГИКА: ЗАПИСЬ ИСТОРИИ ДЛЯ ECHO ----------
function recordHistory(elapsed) {
  state.history.push({
    t: elapsed,
    x: player.position.x,
    z: player.position.z,
    ry: player.rotation.y,
  });
  // обрезаем старые записи
  while (state.history.length && elapsed - state.history[0].t > HISTORY_DURATION) {
    state.history.shift();
  }
}

// ---------- ECHO: СОЗДАНИЕ ----------
function tryCreateEcho() {
  if (state.gameOver || state.echoActive) return;
  if (state.history.length < 2) return; // нечего повторять

  state.echoData = state.history.slice(); // копия записанного пути
  state.echoStart = performance.now() / 1000;
  state.echoActive = true;

  const first = state.echoData[0];
  state.echo = makeMageMesh(0x9cf6ff);
  state.echo.position.set(first.x, 0, first.z);
  state.echo.rotation.y = first.ry;
  state.echo.traverse((obj) => {
    if (obj.isMesh) {
      obj.material = obj.material.clone();
      obj.material.transparent = true;
      obj.material.opacity = 0.45;
    }
  });
  scene.add(state.echo);
}

// ---------- ECHO: ВОСПРОИЗВЕДЕНИЕ ----------
function updateEcho(elapsedClock) {
  if (!state.echoActive) return;
  const data = state.echoData;
  const t0 = data[0].t;
  const tEnd = data[data.length - 1].t;
  const duration = Math.max(tEnd - t0, 0.0001);
  const playbackNow = (performance.now() / 1000 - state.echoStart);
  const targetT = t0 + playbackNow;

  if (playbackNow >= duration) {
    // повтор закончился — Echo угасает
    scene.remove(state.echo);
    state.echo = null;
    state.echoActive = false;
    return;
  }

  // находим два соседних кадра записи и интерполируем между ними
  let a = data[0], b = data[data.length - 1];
  for (let i = 0; i < data.length - 1; i++) {
    if (data[i].t <= targetT && data[i + 1].t >= targetT) {
      a = data[i]; b = data[i + 1];
      break;
    }
  }
  const span = Math.max(b.t - a.t, 0.0001);
  const f = THREE.MathUtils.clamp((targetT - a.t) / span, 0, 1);
  state.echo.position.x = THREE.MathUtils.lerp(a.x, b.x, f);
  state.echo.position.z = THREE.MathUtils.lerp(a.z, b.z, f);
  state.echo.rotation.y = a.ry + (b.ry - a.ry) * f;
}

// ---------- ZERO SECOND ----------
function tryZeroSecond() {
  if (state.gameOver || !state.echoActive) {
    zeroFlash(false);
    return;
  }
  // меняем игрока местами с текущей позицией Echo
  player.position.x = state.echo.position.x;
  player.position.z = state.echo.position.z;
  player.rotation.y = state.echo.rotation.y;

  scene.remove(state.echo);
  state.echo = null;
  state.echoActive = false;
  state.history = []; // начинаем запись заново, чтобы не было путаницы

  state.counterWindow = COUNTER_WINDOW_DURATION;
  showBanner('ZERO SECOND', 700);
  zeroFlash(true);
}

function zeroFlash(success) {
  const body = player.userData.bodyMesh;
  const original = body.material.emissiveIntensity;
  body.material.emissiveIntensity = success ? 1.2 : 0.15;
  setTimeout(() => { body.material.emissiveIntensity = original; }, 200);
}

// ---------- АТАКА ИГРОКА ----------
function tryAttack() {
  if (state.gameOver || state.attackCooldown > 0 || !state.enemyAlive) return;
  state.attackCooldown = ATTACK_COOLDOWN;

  const toEnemy = new THREE.Vector3().subVectors(enemy.position, player.position);
  const dist = toEnemy.length();
  if (dist > ATTACK_RANGE) return;

  const forward = new THREE.Vector3(Math.sin(player.rotation.y), 0, Math.cos(player.rotation.y));
  toEnemy.normalize();
  const facing = forward.dot(toEnemy);
  if (facing < 0.3) return; // враг не перед игроком

  const damage = state.counterWindow > 0 ? BASE_DAMAGE * 2 : BASE_DAMAGE;
  state.enemyHp = Math.max(0, state.enemyHp - damage);
  flashHit(enemy);

  if (state.enemyHp <= 0) {
    defeatEnemy();
  }
}

function flashHit(target) {
  const body = target.userData.bodyMesh;
  const original = body.material.emissiveIntensity;
  body.material.emissiveIntensity = 1.5;
  setTimeout(() => { body.material.emissiveIntensity = original; }, 150);
}

function defeatEnemy() {
  state.enemyAlive = false;
  showBanner('ВРАГ ПОВЕРЖЕН', 1000);
  scene.remove(enemy);
  setTimeout(respawnEnemy, 2500);
}

function respawnEnemy() {
  enemy = makeMageMesh(enemyTemplate);
  const angle = Math.random() * Math.PI * 2;
  enemy.position.set(Math.cos(angle) * 8, 0, Math.sin(angle) * 8);
  scene.add(enemy);
  state.enemyHp = ENEMY_MAX_HP;
  state.enemyAlive = true;
}

// ---------- ИИ ВРАГА ----------
function updateEnemy(delta) {
  if (state.gameOver || !state.enemyAlive) return;

  const toPlayer = new THREE.Vector3().subVectors(player.position, enemy.position);
  const dist = toPlayer.length();

  if (dist < AGGRO_RANGE && dist > ENEMY_ATTACK_RANGE) {
    toPlayer.normalize();
    enemy.position.x += toPlayer.x * ENEMY_SPEED * delta;
    enemy.position.z += toPlayer.z * ENEMY_SPEED * delta;
    enemy.rotation.y = Math.atan2(toPlayer.x, toPlayer.z);
  }

  if (dist <= ENEMY_ATTACK_RANGE && state.enemyAttackCooldown <= 0) {
    state.enemyAttackCooldown = ENEMY_ATTACK_COOLDOWN;
    if (state.counterWindow <= 0) { // во время окна ZERO SECOND игрок неуязвим
      state.playerHp = Math.max(0, state.playerHp - ENEMY_DAMAGE);
      flashHit(player);
      if (state.playerHp <= 0) triggerGameOver();
    }
  }
}

function triggerGameOver() {
  state.gameOver = true;
  showBanner('ВЫ ПОГИБЛИ — перезагрузите страницу', 999999);
}

// ---------- ГЛАВНЫЙ ЦИКЛ ----------
const clock = new THREE.Clock();
let elapsedTime = 0;

function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  elapsedTime += delta;

  if (!state.gameOver) {
    updateMovement(delta);
    recordHistory(elapsedTime);
    updateEcho(elapsedTime);
    updateEnemy(delta);

    if (state.attackCooldown > 0) state.attackCooldown -= delta;
    if (state.enemyAttackCooldown > 0) state.enemyAttackCooldown -= delta;
    if (state.counterWindow > 0) state.counterWindow -= delta;
  }

  // Камера от третьего лица, плавно следует за игроком
  const camOffset = new THREE.Vector3(
    -Math.sin(player.rotation.y) * 6,
    4.5,
    -Math.cos(player.rotation.y) * 6
  );
  const desiredCamPos = new THREE.Vector3().addVectors(player.position, camOffset);
  camera.position.lerp(desiredCamPos, 0.08);
  camera.lookAt(player.position.x, player.position.y + 1, player.position.z);

  updateUI();
  renderer.render(scene, camera);
}

function updateUI() {
  playerHpBar.style.width = `${(state.playerHp / PLAYER_MAX_HP) * 100}%`;
  enemyHpBar.style.width = state.enemyAlive
    ? `${(state.enemyHp / ENEMY_MAX_HP) * 100}%`
    : '0%';

  echoStatusEl.textContent = state.echoActive
    ? 'ECHO: активен (Q — ZERO SECOND)'
    : 'ECHO: готов (E)';

  zeroStatusEl.textContent = state.counterWindow > 0
    ? 'ZERO SECOND: контратака x2!'
    : (state.echoActive ? 'ZERO SECOND: доступен (Q)' : 'ZERO SECOND: нужен Echo');
}

animate();
