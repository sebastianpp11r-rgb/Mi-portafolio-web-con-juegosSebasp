(() => {
  'use strict';

  const W = 900, H = 520, CY = H / 2, STEP = 1 / 60, STORE = 'arcade2d_stats';
  const $ = id => document.getElementById(id), cv = $('cv'), ctx = cv ? cv.getContext('2d') : null;
  if (!cv || !ctx) return;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const keys = {}, key = c => (keys[c] ? 1 : 0);
  let G = null, gname = '', mode = 1, state = 'home';
  let s1 = 0, s2 = 0, acc = 0, last = 0, goalTimer = 0, scorer = 0, flash = '', frames = 0, fpsClock = 0, muted = false, actx = null, shake = 0, diff = 1, pendingScore = 0, touch = matchMedia("(pointer: coarse)").matches;
  const p2Name = () => (mode === 1 ? 'IA' : 'J2');

  function beep(f, d = 0.07, type = 'square') {
    if (muted) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = f; g.gain.value = 0.05;
      o.connect(g); g.connect(actx.destination); o.start(); o.stop(actx.currentTime + d);
    } catch (e) {}
  }

  /* --- TRAIL Y PARTÍCULAS --- */
  const TR = 16, trail = Array.from({ length: TR }, () => ({ x: 0, y: 0 })); let tr = 0;
  const pushTrail = (x, y) => { const t = trail[tr++ % TR]; t.x = x; t.y = y; };
  const resetTrail = (x, y) => trail.forEach(t => { t.x = x; t.y = y; });

  function drawTrail(r, color) {
    ctx.fillStyle = color;
    for (let i = 0; i < TR; i++) {
      const p = trail[(tr + i) % TR];
      ctx.globalAlpha = (i / TR) * 0.4; ctx.beginPath(); ctx.arc(p.x, p.y, r * (i / TR), 0, 6.283); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const parts = Array.from({ length: 90 }, () => ({ x: 0, y: 0, vx: 0, vy: 0, l: 0, c: '#fff' }));
  function burst(x, y, c) {
    for (const p of parts) { const a = Math.random() * 6.283, s = 1 + Math.random() * 6; p.x = x; p.y = y; p.vx = Math.cos(a) * s; p.vy = Math.sin(a) * s; p.l = 40 + Math.random() * 30; p.c = c; }
  }
  function stepParts() { for (const p of parts) if (p.l > 0) { p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.l--; } }
  function drawParts() { for (const p of parts) if (p.l > 0) { ctx.globalAlpha = p.l / 70; ctx.fillStyle = p.c; ctx.fillRect(p.x, p.y, 4, 4); } ctx.globalAlpha = 1; }

  function drawFlash() {
    if (!flash) return;
    ctx.textAlign = 'center'; ctx.font = 'bold 54px "Courier New",monospace'; ctx.lineWidth = 7; ctx.strokeStyle = '#052e16';
    ctx.strokeText(flash, W / 2, CY - 100); ctx.fillStyle = '#fde047'; ctx.fillText(flash, W / 2, CY - 100);
  }

  /* --- PÚBLICO ALREDEDOR --- */
  const blues = ['#3b82f6', '#93c5fd', '#1d4ed8', '#fff'], reds = ['#ef4444', '#fca5a5', '#b91c1c', '#fff'], crowd = [];
  const addFan = (x, y) => crowd.push({ x, y, p: x * 1.7 + y, c: (x < W / 2 ? blues : reds)[crowd.length % 4] });
  for (let x = 8; x < W; x += 14) { addFan(x, 10); addFan(x + 7, 520 - 10); }
  for (let y = 36; y < 520 - 24; y += 14) { addFan(11, y); addFan(27, y + 7); addFan(W - 11, y); addFan(W - 27, y + 7); }

  function drawCrowd(now) {
    const party = goalTimer > 0, amp = party ? 6 : 1.6, sp = party ? 0.02 : 0.004;
    for (const f of crowd) { ctx.fillStyle = f.c; ctx.beginPath(); ctx.arc(f.x, f.y - Math.abs(Math.sin(now * sp + f.p)) * amp, 5.5, 0, 6.283); ctx.fill(); }
  }

  /* --- FÚTBOL 2D --- */
  const L = 40, R = W - 40, T = 20, B = H - 20, GT = CY - 90, GB = CY + 90, PSPEED = 5.2, KSPEED = 3.4;
  const mkb = (r, c) => ({ x: 0, y: 0, vx: 0, vy: 0, r, c });
  const p1 = mkb(22, '#3b82f6'), p2 = mkb(22, '#ef4444'), k1 = mkb(18, '#93c5fd'), k2 = mkb(18, '#fca5a5');
  const fb = { x: W / 2, y: CY, vx: 0, vy: 0, r: 12, max: 9, rot: 0 };
  const movers = [p1, p2, k1, k2];
  const posts = [[L, GT], [L, GB], [R, GT], [R, GB]].map(([x, y]) => ({ x, y, vx: 0, vy: 0, r: 6 }));

  function fReset(dir) {
    p1.x = L + 170; p1.y = CY; p2.x = R - 170; p2.y = CY; k1.x = L + 34; k1.y = CY; k2.x = R - 34; k2.y = CY;
    fb.x = W / 2; fb.y = CY; fb.vx = dir * 3; fb.vy = (Math.random() - 0.5) * 3; fb.max = 9;
    movers.forEach(m => { m.vx = 0; m.vy = 0; }); resetTrail(fb.x, fb.y);
  }
  function move(b, dx, dy, sp) {
    if (dx || dy) { const m = Math.hypot(dx, dy); b.vx = dx / m * sp; b.vy = dy / m * sp; } else { b.vx = 0; b.vy = 0; }
    b.x = clamp(b.x + b.vx, L + b.r, R - b.r); b.y = clamp(b.y + b.vy, T + b.r, B - b.r);
  }
  function fAI() {
    let tx, ty = fb.y;
    if (fb.x < W * 0.3) tx = W * 0.62;
    else if (fb.x < p2.x + 10) tx = fb.x + 24;
    else { tx = fb.x + 30; ty = fb.y + (fb.y < CY ? 55 : -55); }
    const dx = tx - p2.x, dy = ty - p2.y;
    move(p2, Math.abs(dx) > 4 ? Math.sign(dx) : 0, Math.abs(dy) > 4 ? Math.sign(dy) : 0, [3.4, 4.3, 5.2][diff]);
  }
  function keeper(k) { k.vx = 0; k.vy = clamp(clamp(fb.y, GT - 5, GB + 5) - k.y, -KSPEED, KSPEED); k.y += k.vy; }
  function hit(b, boost) {
    const dx = fb.x - b.x, dy = fb.y - b.y, d = Math.hypot(dx, dy), m = fb.r + b.r;
    if (d >= m || d === 0) return;
    const nx = dx / d, ny = dy / d;
    fb.x = b.x + nx * m; fb.y = b.y + ny * m;
    const vn = (fb.vx - b.vx) * nx + (fb.vy - b.vy) * ny;
    if (vn < 0) { fb.vx -= 1.9 * vn * nx; fb.vy -= 1.9 * vn * ny; if (boost) fb.max = Math.min(18, fb.max + 0.35); beep(boost ? 300 : 700, 0.05); }
    fb.vx += b.vx * 0.4; fb.vy += b.vy * 0.4;
  }
  function fStep() {
    let dx = key('KeyD') - key('KeyA'), dy = key('KeyS') - key('KeyW');
    if (mode === 1) { dx += key('ArrowRight') - key('ArrowLeft'); dy += key('ArrowDown') - key('ArrowUp'); }
    move(p1, Math.sign(dx), Math.sign(dy), PSPEED);
    if (mode === 2) move(p2, key('ArrowRight') - key('ArrowLeft'), key('ArrowDown') - key('ArrowUp'), PSPEED); else fAI();
    keeper(k1); keeper(k2);
    const ex = p2.x - p1.x, ey = p2.y - p1.y, ed = Math.hypot(ex, ey), em = p1.r + p2.r;
    if (ed > 0 && ed < em) { const q = (em - ed) / 2; p1.x -= ex / ed * q; p1.y -= ey / ed * q; p2.x += ex / ed * q; p2.y += ey / ed * q; }
    fb.x += fb.vx; fb.y += fb.vy; fb.vx *= 0.992; fb.vy *= 0.992;
    for (const m of movers) hit(m, true);
    for (const p of posts) hit(p, false);
    if (fb.y - fb.r < T) { fb.y = T + fb.r; fb.vy = Math.abs(fb.vy); }
    if (fb.y + fb.r > B) { fb.y = B - fb.r; fb.vy = -Math.abs(fb.vy); }
    const inGoal = fb.y > GT && fb.y < GB;
    if (!inGoal && fb.x - fb.r < L) { fb.x = L + fb.r; fb.vx = Math.abs(fb.vx); }
    if (!inGoal && fb.x + fb.r > R) { fb.x = R - fb.r; fb.vx = -Math.abs(fb.vx); }
    const sp = Math.hypot(fb.vx, fb.vy);
    if (sp > fb.max) { fb.vx *= fb.max / sp; fb.vy *= fb.max / sp; }
    pushTrail(fb.x, fb.y);
    if (fb.x + fb.r < L) goal(2); else if (fb.x - fb.r > R) goal(1);
  }

  function ball(b, fill, stroke) {
    ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.beginPath(); ctx.ellipse(b.x + 3, b.y + b.r * 0.9, b.r * 0.9, b.r * 0.45, 0, 0, 6.283); ctx.fill(); ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, 6.283); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = stroke; ctx.stroke();
  }
  function fDraw() {
    ctx.fillStyle = '#0d3a22'; ctx.fillRect(0, 0, W, H); drawCrowd(performance.now());
    const sw = (R - L) / 10;
    for (let i = 0; i < 10; i++) { ctx.fillStyle = i % 2 ? '#16a34a' : '#15803d'; ctx.fillRect(L + i * sw, T, sw, B - T); }
    ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 3; ctx.strokeRect(L, T, R - L, B - T);
    ctx.beginPath(); ctx.moveTo(W / 2, T); ctx.lineTo(W / 2, B); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2, CY, 70, 0, 6.283); ctx.stroke();
    ctx.strokeRect(L, CY - 130, 110, 260); ctx.strokeRect(R - 110, CY - 130, 110, 260);
    ctx.fillStyle = 'rgba(255,255,255,.22)'; ctx.fillRect(0, GT, L, GB - GT); ctx.fillRect(R, GT, L, GB - GT);
    ctx.strokeRect(1, GT, L - 1, GB - GT); ctx.strokeRect(R, GT, L - 1, GB - GT);
    ctx.save(); ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.beginPath();
    for (let y = GT; y <= GB; y += 15) { ctx.moveTo(0, y); ctx.lineTo(L, y); ctx.moveTo(R, y); ctx.lineTo(W, y); }
    for (let x = 8; x < L; x += 8) { ctx.moveTo(x, GT); ctx.lineTo(x, GB); ctx.moveTo(W - x, GT); ctx.lineTo(W - x, GB); }
    ctx.stroke(); ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.85)'; [[L + 80, CY], [R - 80, CY], [W / 2, CY]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x, y, 3, 0, 6.283); ctx.fill(); });
    ctx.fillStyle = '#fff'; for (const p of posts) { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill(); }
    ball(k1, k1.c, '#fff'); ball(k2, k2.c, '#fff'); ball(p1, p1.c, '#fff'); ball(p2, p2.c, '#fff');
    ctx.fillStyle = '#fff'; ctx.font = 'bold 15px system-ui,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('J1', p1.x, p1.y + 5); ctx.fillText(p2Name(), p2.x, p2.y + 5);
    drawTrail(fb.r, '#fff'); ball(fb, '#fff', '#111');
    if (state === 'play') fb.rot += Math.hypot(fb.vx, fb.vy) * 0.06;
    ctx.fillStyle = '#111';
    for (let i = 0; i < 3; i++) { const a = fb.rot + i * 2.094; ctx.beginPath(); ctx.arc(fb.x + Math.cos(a) * fb.r * 0.5, fb.y + Math.sin(a) * fb.r * 0.5, fb.r * 0.22, 0, 6.283); ctx.fill(); } drawParts(); drawFlash();
  }

  /* --- PING-PONG --- */
  const PW = 14, PH = 96, PX1 = 36, PX2 = W - 36 - PW, PR = 9, PSP = 6.8;
  const pad1 = { y: 0, vy: 0 }, pad2 = { y: 0, vy: 0 }, pb = { x: 0, y: 0, vx: 0, vy: 0, sp: 6.5, spin: 0 };

  function pReset(dir) {
    pad1.y = pad2.y = CY - PH / 2; pad1.vy = pad2.vy = 0;
    pb.x = W / 2; pb.y = CY; pb.sp = 6.5; pb.spin = 0;
    const a = (Math.random() - 0.5) * 0.7; pb.vx = dir * pb.sp * Math.cos(a); pb.vy = pb.sp * Math.sin(a); resetTrail(pb.x, pb.y);
  }

  function paddleHit(p, px, dir, pSpeedY) {
    if (pb.vx * dir >= 0) return;
    if (pb.x + PR > px && pb.x - PR < px + PW && pb.y + PR > p.y && pb.y - PR < p.y + PH) {
      const rel = clamp((pb.y - (p.y + PH / 2)) / (PH / 2), -1, 1);
      const a = rel * 0.82;
      pb.sp = Math.min(18, pb.sp * 1.07);
      pb.spin = pSpeedY * 0.35;
      pb.vx = dir * pb.sp * Math.cos(a);
      pb.vy = pb.sp * Math.sin(a) + pb.spin;
      pb.x = dir === 1 ? px + PW + PR : px - PR;
      
      shake = pb.sp > 11 ? 8 : 3;
      burst(pb.x, pb.y, pb.sp > 11 ? '#fbbf24' : '#22d3ee');
      beep(pb.sp > 11 ? 750 : 520, 0.06);
    }
  }

  function pStep() {
    let d1 = key('KeyS') - key('KeyW'); if (mode === 1) d1 += key('ArrowDown') - key('ArrowUp');
    const oldY1 = pad1.y;
    pad1.y = clamp(pad1.y + Math.sign(d1) * PSP, 30, H - 30 - PH);
    pad1.vy = pad1.y - oldY1;

    const oldY2 = pad2.y;
    if (mode === 2) {
      const d2 = key('ArrowDown') - key('ArrowUp');
      pad2.y = clamp(pad2.y + d2 * PSP, 30, H - 30 - PH);
    } else {
      const targetY = (pb.vx > 0 ? pb.y + (Math.sin(pb.x * 0.01) * [25, 12, 0][diff]) : CY) - (PH / 2);
      const df = targetY - pad2.y;
      if (Math.abs(df) > 8) pad2.y = clamp(pad2.y + Math.sign(df) * [3.6, 4.8, 6.2][diff], 30, H - 30 - PH);
    }
    pad2.vy = pad2.y - oldY2;

    pb.vy += pb.spin * 0.02;
    pb.spin *= 0.98;
    pb.x += pb.vx; pb.y += pb.vy;

    if (pb.y < 30 + PR) { pb.y = 30 + PR; pb.vy = Math.abs(pb.vy); beep(240, 0.04); }
    if (pb.y > H - 30 - PR) { pb.y = H - 30 - PR; pb.vy = -Math.abs(pb.vy); beep(240, 0.04); }

    paddleHit(pad1, PX1, 1, pad1.vy);
    paddleHit(pad2, PX2, -1, pad2.vy);
    pushTrail(pb.x, pb.y);

    if (pb.x < -PR) goal(2); else if (pb.x > W + PR) goal(1);
  }

  function pDraw() {
    ctx.fillStyle = '#060a1a'; ctx.fillRect(0, 0, W, H);
    drawCrowd(performance.now());

    ctx.fillStyle = '#0f172a'; ctx.fillRect(25, 25, W - 50, H - 50);
    ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = 3; ctx.strokeRect(25, 25, W - 50, H - 50);

    ctx.setLineDash([8, 8]); ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(W / 2, 20); ctx.lineTo(W / 2, H - 20); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#22d3ee'; ctx.fillRect(W / 2 - 3, 18, 6, 8); ctx.fillRect(W / 2 - 3, H - 26, 6, 8);

    ctx.font = 'bold 110px "Courier New",monospace'; ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(255,255,255,.08)';
    ctx.fillText(s1, W / 4, CY + 40); ctx.fillText(s2, 3 * W / 4, CY + 40);

    ctx.shadowBlur = 14; ctx.shadowColor = '#22d3ee'; ctx.fillStyle = '#22d3ee'; ctx.fillRect(PX1, pad1.y, PW, PH);
    ctx.shadowColor = '#f43f5e'; ctx.fillStyle = '#f43f5e'; ctx.fillRect(PX2, pad2.y, PW, PH);
    ctx.shadowBlur = 0;

    const isSmash = pb.sp > 11;
    drawTrail(PR, isSmash ? '#fbbf24' : '#fff');

    ctx.shadowBlur = isSmash ? 18 : 8;
    ctx.shadowColor = isSmash ? '#fbbf24' : '#fff';
    ctx.fillStyle = isSmash ? '#fde047' : '#fff';
    ctx.beginPath(); ctx.arc(pb.x, pb.y, PR, 0, 6.283); ctx.fill();
    ctx.shadowBlur = 0;

    drawParts(); drawFlash();
  }

  const futbol = { name: 'Fútbol 2D Atari', win: 5, word: 'GOL', ball: fb, reset: fReset, step: fStep, draw: fDraw, spd: () => fb.max, help: '<li><strong>J1:</strong> <kbd>W</kbd> <kbd>A</kbd> <kbd>S</kbd> <kbd>D</kbd></li><li><strong>J2:</strong> <kbd>↑</kbd> <kbd>↓</kbd> <kbd>←</kbd> <kbd>→</kbd></li><li><kbd>Espacio</kbd> pausa/continúa</li>' };
  const pong = { name: 'Ping-Pong', win: 7, word: 'PUNTO', ball: pb, reset: pReset, step: pStep, draw: pDraw, spd: () => pb.sp, help: '<li><strong>J1:</strong> <kbd>W</kbd> <kbd>S</kbd></li><li><strong>J2:</strong> <kbd>↑</kbd> <kbd>↓</kbd></li><li>Mueve la pala rápido para dar efecto de rosca. <kbd>Espacio</kbd> pausa.</li>' };

  function goal(who) {
    who === 1 ? s1++ : s2++; scorer = who; shake = 14; updateHud(); beep(660, 0.25, 'triangle');
    burst(who === 1 ? W - 50 : 50, G.ball.y, who === 1 ? '#22d3ee' : '#f43f5e');
    if (s1 >= G.win || s2 >= G.win) { endMatch(); return; }
    flash = '¡' + G.word + ' de ' + (who === 1 ? 'J1' : p2Name()) + '!'; goalTimer = 75;
  }
  function step() {
    stepParts();
    if (goalTimer > 0) { if (--goalTimer === 0) { flash = ''; G.reset(scorer === 1 ? 1 : -1); } return; }
    G.step();
  }
  function updateHud() { if ($('score')) $('score').textContent = 'J1 ' + s1 + ' – ' + s2 + ' ' + p2Name(); }
  function showOverlay(title, text, btn) { if ($('ovTitle')) $('ovTitle').textContent = title; if ($('ovText')) $('ovText').textContent = text; if ($('bMain')) $('bMain').textContent = btn; if ($('iniRow')) $('iniRow').hidden = true; if ($('overlay')) $('overlay').hidden = false; if ($('bMain')) $('bMain').focus(); }
  function begin() { s1 = 0; s2 = 0; goalTimer = 0; flash = ''; state = 'play'; if ($('overlay')) $('overlay').hidden = true; acc = 0; G.reset(Math.random() < 0.5 ? 1 : -1); updateHud(); }
  function pause() { if (state === 'play') { state = 'pause'; showOverlay('Pausa', 'Pulsa Espacio o el botón para continuar.', 'Continuar'); } }
  function resume() { if (state === 'pause') { state = 'play'; if ($('overlay')) $('overlay').hidden = true; } }
  function openGame(name, m) {
    G = name === 'futbol' ? futbol : pong; gname = name; mode = m; s1 = s2 = 0;
    if ($('home')) $('home').hidden = true; if ($('gameView')) $('gameView').hidden = false; if ($('gTitle')) $('gTitle').textContent = G.name + (m === 1 ? ' · vs IA (' + ['fácil', 'normal', 'difícil'][diff] + ')' : ' · 2 Jugadores');
    if ($('help')) $('help').innerHTML = G.help; updateHud(); G.reset(1); state = 'ready';
    showOverlay(G.name, 'Llega a ' + G.win + ' puntos para ganar.', 'Empezar'); draw();
  }
  function toMenu() { state = 'home'; if ($('gameView')) $('gameView').hidden = true; if ($('home')) $('home').hidden = false; renderStats(); }
  
  function endMatch() {
    state = 'over'; const winner = s1 > s2 ? 'J1' : p2Name();
    saveMatch(gname, { ts: Date.now(), fecha: new Date().toLocaleDateString('es-CO'), modo: mode, j1: s1, j2: s2, ganador: winner });
    showOverlay('¡Ganó ' + winner + '!', 'Marcador final: ' + s1 + ' – ' + s2, 'Revancha');
    pendingScore = mode === 1 && s1 > s2 ? ((s1 - s2) * 100 + s1 * 50) * (diff + 1) : 0;
    const top = load()[gname].top;
    if (pendingScore > 0 && (top.length < 5 || pendingScore > top[top.length - 1].score)) {
      if ($('ovText')) $('ovText').textContent += ' ¡Lograste un nuevo Récord! Ingresa 3 letras.';
      if ($('iniRow')) $('iniRow').hidden = false;
      if ($('ini')) { $('ini').value = ''; $('ini').focus(); }
    }
  }

  /* --- LOCALSTORAGE Y ESTADÍSTICAS --- */
  function load() {
    try {
      const d = JSON.parse(localStorage.getItem(STORE));
      if (d && d.futbol && d.pong) return d;
    } catch (e) {}
    return {
      futbol: { historial: [], top: [], records: { vsIA: 0, derrotasIA: 0, partidas2J: 0, mayorDiferencia: 0 } },
      pong: { historial: [], top: [], records: { vsIA: 0, derrotasIA: 0, partidas2J: 0, mayorDiferencia: 0 } }
    };
  }

  function saveMatch(g, m) {
    const d = load(), x = d[g], r = x.records;
    x.historial.unshift(m); x.historial = x.historial.slice(0, 10);
    if (m.modo === 1) { m.ganador === 'J1' ? r.vsIA++ : r.derrotasIA++; } else r.partidas2J++;
    r.mayorDiferencia = Math.max(r.mayorDiferencia, Math.abs(m.j1 - m.j2));
    try { localStorage.setItem(STORE, JSON.stringify(d)); } catch (e) {}
    renderStats();
  }

  function saveTop() {
    if (!gname || pendingScore <= 0) return;
    const ini = ($('ini').value.replace(/[^A-Za-z]/g, '') || 'AAA').toUpperCase().slice(0, 3);
    const d = load(), t = d[gname].top;
    t.push({ ini, score: pendingScore, nivel: ['Fácil', 'Normal', 'Difícil'][diff], fecha: new Date().toLocaleDateString('es-CO') });
    t.sort((a, b) => b.score - a.score);
    d[gname].top = t.slice(0, 5);
    try { localStorage.setItem(STORE, JSON.stringify(d)); } catch (e) {}
    pendingScore = 0;
    if ($('iniRow')) $('iniRow').hidden = true;
    renderStats();
  }

  function renderStats() {
    const d = load();
    [['futbol', 'recF'], ['pong', 'recP']].forEach(([g, id]) => {
      const r = d[g].records;
      if ($(id)) $(id).textContent = `vs IA: ${r.vsIA} Ganadas / ${r.derrotasIA} Perdidas | 2J: ${r.partidas2J}`;
    });

    [['futbol', 'topF'], ['pong', 'topP']].forEach(([g, id]) => {
      const ol = $(id);
      if (!ol) return;
      ol.textContent = '';
      const list = d[g].top;
      if (list.length === 0) {
        const li = document.createElement('li'); li.textContent = 'Sin récord'; ol.appendChild(li);
      } else {
        list.forEach(item => {
          const li = document.createElement('li');
          li.textContent = `${item.ini} - ${item.score} pts (${item.nivel})`;
          ol.appendChild(li);
        });
      }
    });

    const ul = $('history');
    if (ul) {
      ul.textContent = '';
      const allHist = d.futbol.historial.map(m => ({ ...m, game: 'Fútbol' }))
        .concat(d.pong.historial.map(m => ({ ...m, game: 'Pong' })))
        .sort((a, b) => b.ts - a.ts).slice(0, 5);

      if (allHist.length === 0) {
        const li = document.createElement('li'); li.textContent = 'Sin partidas recientes'; ul.appendChild(li);
      } else {
        allHist.forEach(m => {
          const li = document.createElement('li');
          li.textContent = `${m.game} (${m.modo === 1 ? 'VS IA' : '2J'}) - ${m.j1} vs ${m.j2} - Ganó: ${m.ganador}`;
          ul.appendChild(li);
        });
      }
    }
  }

  /* --- CONTROLADORES DE EVENTOS --- */
  // Botones de Dificultad
  document.querySelectorAll('[data-diff]').forEach(btn => {
    btn.addEventListener('click', () => {
      diff = parseInt(btn.dataset.diff, 10);
      document.querySelectorAll('[data-diff]').forEach(b => b.setAttribute('aria-pressed', String(b === btn)));
    });
  });

  if ($('bSave')) $('bSave').addEventListener('click', saveTop);
  if ($('ini')) $('ini').addEventListener('keydown', e => { if (e.key === 'Enter') saveTop(); });

  if ($('btnReset')) {
    $('btnReset').addEventListener('click', () => {
      try { localStorage.removeItem(STORE); } catch (e) {}
      renderStats();
    });
  }

  function draw() {
    if (!G) return;
    if (shake > 0.5) { ctx.save(); ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); G.draw(); ctx.restore(); shake *= 0.9; }
    else { shake = 0; G.draw(); }
  }

  function loop(t) {
    requestAnimationFrame(loop);
    const dt = Math.min((t - last) / 1000, 0.1); last = t;
    if (state === 'play') { acc += dt; while (acc >= STEP) { step(); acc -= STEP; } draw(); }
  }

  const GK = ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
  addEventListener('keydown', e => {
    if (state !== 'home' && GK.includes(e.code)) e.preventDefault();
    if (e.code === 'Space') { if (state === 'play') pause(); else if (state === 'pause') resume(); return; }
    keys[e.code] = true;
  });
  addEventListener('keyup', e => { keys[e.code] = false; });
  document.querySelectorAll('[data-game]').forEach(b => b.addEventListener('click', () => openGame(b.dataset.game, +b.dataset.mode)));
  if ($('bMain')) $('bMain').addEventListener('click', () => (state === 'pause' ? resume() : begin()));
  if ($('bMenu')) $('bMenu').addEventListener('click', toMenu);
  if ($('btnMenu')) $('btnMenu').addEventListener('click', toMenu);
  if ($('btnPause')) $('btnPause').addEventListener('click', () => (state === 'play' ? pause() : resume()));

  G = futbol;
  renderStats();
  last = performance.now();
  requestAnimationFrame(loop);
})();
