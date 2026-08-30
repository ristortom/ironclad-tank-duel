const canvas = document.getElementById('battlefield');
const ctx = canvas.getContext('2d');
const W = canvas.width;
const H = canvas.height;

const maps = [
  {
    id: 'training', name: 'Training Grounds', description: 'Open sightlines / low cover', short: 'OPEN RANGE',
    player: { x: 105, y: 300 }, enemy: { x: 855, y: 300 },
    obstacles: [{ x: 410, y: 90, w: 140, h: 34 }, { x: 410, y: 476, w: 140, h: 34 }, { x: 262, y: 214, w: 72, h: 172 }, { x: 626, y: 214, w: 72, h: 172 }]
  },
  {
    id: 'crossroads', name: 'Crossroads', description: 'Four lanes / central bunker', short: 'TACTICAL',
    player: { x: 100, y: 115 }, enemy: { x: 860, y: 485 },
    obstacles: [{ x: 345, y: 65, w: 45, h: 160 }, { x: 570, y: 375, w: 45, h: 160 }, { x: 345, y: 375, w: 45, h: 160 }, { x: 570, y: 65, w: 45, h: 160 }, { x: 430, y: 253, w: 100, h: 94 }]
  },
  {
    id: 'fortress', name: 'The Fortress', description: 'Tight corridors / hard cover', short: 'SIEGE',
    player: { x: 125, y: 475 }, enemy: { x: 835, y: 125 },
    obstacles: [{ x: 220, y: 80, w: 45, h: 185 }, { x: 220, y: 335, w: 45, h: 185 }, { x: 695, y: 80, w: 45, h: 185 }, { x: 695, y: 335, w: 45, h: 185 }, { x: 350, y: 170, w: 260, h: 38 }, { x: 350, y: 392, w: 260, h: 38 }]
  }
];

const state = { mapIndex: 0, hitsToDestroy: 1, player: null, enemy: null, bullets: [], sparks: [], keys: {}, running: true, paused: false, elapsed: 0, lastTime: 0, round: 1, playerShots: 0, playerHits: 0, fireCooldown: 0, enemyFireCooldown: 1.3, enemyTurn: 0 };
const mapList = document.getElementById('map-list');
const hitOptions = document.querySelectorAll('.hit-option');

function makeMapButtons() {
  mapList.innerHTML = maps.map((map, i) => `<button class="map-button ${i === state.mapIndex ? 'active' : ''}" data-map="${i}"><span class="map-icon"></span><strong>${map.name}</strong><span>${map.short} · ${map.description}</span></button>`).join('');
  mapList.querySelectorAll('.map-button').forEach(button => button.addEventListener('click', () => { state.mapIndex = Number(button.dataset.map); makeMapButtons(); resetBattle(); }));
}

function resetBattle() {
  const map = maps[state.mapIndex];
  state.player = { ...map.player, angle: 0, hp: state.hitsToDestroy, maxHp: state.hitsToDestroy, color: '#48aaa0', recoil: 0 };
  state.enemy = { ...map.enemy, angle: Math.PI, hp: state.hitsToDestroy, maxHp: state.hitsToDestroy, color: '#e76b45', recoil: 0 };
  state.bullets = []; state.sparks = []; state.elapsed = 0; state.lastTime = performance.now(); state.running = true; state.paused = false; state.playerShots = 0; state.playerHits = 0; state.fireCooldown = 0; state.enemyFireCooldown = 1.15; state.enemyTurn = 0;
  document.getElementById('arena-title').textContent = map.name;
  document.getElementById('arena-status-text').textContent = 'ENGAGED';
  document.getElementById('game-message').classList.add('hidden');
  document.getElementById('pause-badge').classList.add('hidden');
  updateHud();
}

function updateHud() {
  if (!state.player || !state.enemy) return;
  document.getElementById('player-armor').innerHTML = armorPips(state.player.hp, state.player.maxHp);
  document.getElementById('enemy-armor').innerHTML = armorPips(state.enemy.hp, state.enemy.maxHp);
  document.getElementById('timer').textContent = formatTime(state.elapsed);
  document.getElementById('round-number').textContent = String(state.round).padStart(2, '0');
}
function armorPips(hp, max) { return Array.from({ length: max }, (_, i) => `<i class="armor-pip ${i >= hp ? 'spent' : ''}"></i>`).join(''); }
function formatTime(seconds) { const s = Math.floor(seconds); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }

function circleRectCollision(x, y, r, rect) { const cx = Math.max(rect.x, Math.min(x, rect.x + rect.w)); const cy = Math.max(rect.y, Math.min(y, rect.y + rect.h)); return (x - cx) ** 2 + (y - cy) ** 2 < r ** 2; }
function blocked(x, y, r = 18) { return x < r + 9 || x > W - r - 9 || y < r + 9 || y > H - r - 9 || maps[state.mapIndex].obstacles.some(o => circleRectCollision(x, y, r + 1, o)); }
function moveTank(tank, dx, dy) { const nx = tank.x + dx; const ny = tank.y + dy; if (!blocked(nx, tank.y, 17)) tank.x = nx; if (!blocked(tank.x, ny, 17)) tank.y = ny; }
function angleDelta(a, b) { return Math.atan2(Math.sin(b - a), Math.cos(b - a)); }
function hasLineOfSight(a, b) { const distance = Math.hypot(b.x - a.x, b.y - a.y); const steps = Math.ceil(distance / 10); for (let i = 1; i < steps; i++) { const x = a.x + (b.x - a.x) * i / steps; const y = a.y + (b.y - a.y) * i / steps; if (maps[state.mapIndex].obstacles.some(o => x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h)) return false; } return true; }

function fire(tank, owner) {
  const barrel = 28; const x = tank.x + Math.cos(tank.angle) * barrel; const y = tank.y + Math.sin(tank.angle) * barrel;
  if (blocked(x, y, 4)) return;
  state.bullets.push({ x, y, vx: Math.cos(tank.angle) * 390, vy: Math.sin(tank.angle) * 390, owner, life: 2.5 });
  tank.recoil = 1; addSparks(x, y, owner === 'player' ? '#a8e4d0' : '#ffd1a1', 5);
  if (owner === 'player') state.playerShots++;
}
function addSparks(x, y, color, amount = 8) { for (let i = 0; i < amount; i++) { const a = Math.random() * Math.PI * 2; const speed = 20 + Math.random() * 70; state.sparks.push({ x, y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, life: .25 + Math.random() * .3, color }); } }

function update(dt) {
  if (!state.running || state.paused) return;
  state.elapsed += dt; state.fireCooldown -= dt; state.enemyFireCooldown -= dt; state.player.recoil = Math.max(0, state.player.recoil - dt * 6); state.enemy.recoil = Math.max(0, state.enemy.recoil - dt * 6);
  const p = state.player; const turnSpeed = 2.5; const moveSpeed = 145;
  if (state.keys.ArrowLeft) p.angle -= turnSpeed * dt; if (state.keys.ArrowRight) p.angle += turnSpeed * dt;
  let direction = 0; if (state.keys.ArrowUp) direction++; if (state.keys.ArrowDown) direction--;
  if (direction) moveTank(p, Math.cos(p.angle) * moveSpeed * direction * dt, Math.sin(p.angle) * moveSpeed * direction * dt);
  if (state.keys[' '] && state.fireCooldown <= 0) { fire(p, 'player'); state.fireCooldown = .42; }

  const e = state.enemy; const targetAngle = Math.atan2(p.y - e.y, p.x - e.x); const delta = angleDelta(e.angle, targetAngle); e.angle += Math.sign(delta) * Math.min(Math.abs(delta), 1.25 * dt); state.enemyTurn -= dt;
  const dist = Math.hypot(p.x - e.x, p.y - e.y); const toward = Math.abs(delta) < 1.8 && dist > 170; const strafe = Math.sin(state.elapsed * .8) * .22;
  if (toward || (dist > 240 && Math.abs(delta) < 2.6)) { const speed = 65; const tryAngle = e.angle + strafe; moveTank(e, Math.cos(tryAngle) * speed * dt, Math.sin(tryAngle) * speed * dt); }
  if (state.enemyFireCooldown <= 0 && hasLineOfSight(e, p) && Math.abs(delta) < .2) { fire(e, 'enemy'); state.enemyFireCooldown = 1.1 + Math.random() * .7; }

  for (let i = state.bullets.length - 1; i >= 0; i--) { const b = state.bullets[i]; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; let remove = b.life <= 0 || b.x < 0 || b.x > W || b.y < 0 || b.y > H;
    if (!remove && maps[state.mapIndex].obstacles.some(o => b.x > o.x && b.x < o.x + o.w && b.y > o.y && b.y < o.y + o.h)) { addSparks(b.x, b.y, '#dfc48e', 10); remove = true; }
    const target = b.owner === 'player' ? e : p; if (!remove && Math.hypot(b.x - target.x, b.y - target.y) < 19) { target.hp--; if (b.owner === 'player') state.playerHits++; addSparks(b.x, b.y, b.owner === 'player' ? '#7fe3c5' : '#ffab7c', 18); remove = true; if (target.hp <= 0) finish(b.owner === 'player'); }
    if (remove) state.bullets.splice(i, 1);
  }
  for (let i = state.sparks.length - 1; i >= 0; i--) { const s = state.sparks[i]; s.x += s.vx * dt; s.y += s.vy * dt; s.vx *= .93; s.vy *= .93; s.life -= dt; if (s.life <= 0) state.sparks.splice(i, 1); }
  updateHud();
}

function finish(playerWon) { state.running = false; document.getElementById('arena-status-text').textContent = playerWon ? 'VICTORY' : 'DEFEAT'; const msg = document.getElementById('game-message'); document.getElementById('message-kicker').textContent = playerWon ? 'HOSTILE UNIT DISABLED' : 'RAVEN-01 LOST'; document.getElementById('message-title').textContent = playerWon ? 'Target destroyed' : 'Tank destroyed'; document.getElementById('message-copy').textContent = playerWon ? `Direct hits: ${state.playerHits} · Time: ${formatTime(state.elapsed)}` : 'The machine found your weak side. Reset and try again.'; msg.classList.remove('hidden'); }

function draw() {
  const map = maps[state.mapIndex]; ctx.clearRect(0, 0, W, H); drawGround(); map.obstacles.forEach(drawObstacle); state.bullets.forEach(drawBullet); drawTank(state.player, false); drawTank(state.enemy, true); state.sparks.forEach(drawSpark);
}
function drawGround() { ctx.fillStyle = '#304b48'; ctx.fillRect(0, 0, W, H); ctx.strokeStyle = 'rgba(173, 196, 166, .09)'; ctx.lineWidth = 1; for (let x = 20; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); } for (let y = 20; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); } ctx.strokeStyle = 'rgba(238, 218, 161, .13)'; ctx.setLineDash([3, 9]); ctx.strokeRect(16, 16, W - 32, H - 32); ctx.setLineDash([]); }
function drawObstacle(o) { ctx.fillStyle = 'rgba(18, 34, 33, .38)'; ctx.fillRect(o.x + 5, o.y + 6, o.w, o.h); ctx.fillStyle = '#75895e'; ctx.fillRect(o.x, o.y, o.w, o.h); ctx.strokeStyle = '#9aae78'; ctx.lineWidth = 2; ctx.strokeRect(o.x + 1, o.y + 1, o.w - 2, o.h - 2); ctx.strokeStyle = 'rgba(37, 65, 59, .45)'; ctx.lineWidth = 1; for (let x = o.x + 13; x < o.x + o.w; x += 22) { ctx.beginPath(); ctx.moveTo(x, o.y); ctx.lineTo(x, o.y + o.h); ctx.stroke(); } }
function drawBullet(b) { ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.atan2(b.vy, b.vx)); ctx.fillStyle = b.owner === 'player' ? '#b6ffe2' : '#ffc28f'; ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 9; ctx.fillRect(-7, -2, 14, 4); ctx.restore(); }
function drawTank(t, enemy) { ctx.save(); ctx.translate(t.x, t.y); ctx.rotate(t.angle); ctx.globalAlpha = t.hp > 0 ? 1 : .45; ctx.fillStyle = 'rgba(10,20,20,.32)'; ctx.fillRect(-17, -12, 35, 27); ctx.fillStyle = enemy ? '#a84732' : '#237b76'; ctx.fillRect(-17, -12, 34, 24); ctx.fillStyle = enemy ? '#d96342' : '#42a79b'; ctx.fillRect(-11, -9, 22, 18); ctx.fillStyle = enemy ? '#ee8560' : '#8bd0b3'; ctx.fillRect(-6, -6, 12, 12); ctx.fillStyle = enemy ? '#ffd0aa' : '#d5f2cf'; ctx.fillRect(2, -2, 29 - t.recoil * 7, 4); ctx.fillStyle = enemy ? '#73352d' : '#155b5b'; ctx.fillRect(-15, -15, 7, 30); ctx.fillRect(8, -15, 7, 30); ctx.restore();
  ctx.save(); ctx.globalAlpha = .23; ctx.strokeStyle = enemy ? '#ffad8d' : '#95ead0'; ctx.beginPath(); ctx.arc(t.x, t.y, 27, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
}
function drawSpark(s) { ctx.globalAlpha = Math.max(0, s.life * 3); ctx.fillStyle = s.color; ctx.fillRect(s.x, s.y, 3, 3); ctx.globalAlpha = 1; }

function loop(now) { const dt = Math.min((now - state.lastTime) / 1000, .05); state.lastTime = now; update(dt); draw(); requestAnimationFrame(loop); }
window.addEventListener('keydown', e => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault(); state.keys[e.key] = true; if (e.key.toLowerCase() === 'p' && state.running) { state.paused = !state.paused; document.getElementById('pause-badge').classList.toggle('hidden', !state.paused); document.getElementById('arena-status-text').textContent = state.paused ? 'PAUSED' : 'ENGAGED'; } });
window.addEventListener('keyup', e => { state.keys[e.key] = false; });
document.getElementById('reset-button').addEventListener('click', resetBattle);
document.getElementById('message-button').addEventListener('click', resetBattle);
hitOptions.forEach(option => option.addEventListener('click', () => { hitOptions.forEach(b => b.classList.remove('active')); option.classList.add('active'); state.hitsToDestroy = Number(option.dataset.hits); resetBattle(); }));
makeMapButtons(); resetBattle(); requestAnimationFrame(loop);
