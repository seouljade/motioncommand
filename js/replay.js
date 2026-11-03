/* 사후검토 회차 재생: 저장된 비행 궤적과 인식된 수신호를 3D로 다시 그린다
 * 카메라 영상은 개인정보 보호 원칙에 따라 저장하지 않으므로 재생하지 않는다. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var INFO = window.MCGesture.INFO;

  function gName(g) { return g === 'READY' ? '준비 중' : (INFO[g] ? INFO[g].ko : '—'); }
  function gSign(g) { return g === 'READY' ? '손이 보이지 않음 — 드론은 제자리 유지' : g === 'HOVER' || g === 'UNKNOWN' ? '' : (INFO[g] ? INFO[g].sign : ''); }
  function gShape(g) { return INFO[g] && g !== 'UNKNOWN' ? g : 'HOVER'; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function errKo(k) { var E = window.MCReview && window.MCReview.ERR; return E && E[k] ? E[k].ko : k; }

  var V = { row: null, tr: null, t: 0, dur: 0, playing: false, speed: 1, raf: 0, last: 0, R: null, yaw: 0, pitch: 0.32 };

  /* ── 궤적 보간 ─────────────────────── */
  function idxAt(p, t) {
    var lo = 0, hi = p.length - 1;
    while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (p[mid][0] <= t) lo = mid; else hi = mid - 1; }
    return lo;
  }
  function stateAt(t) {
    var p = V.tr.p, i = idxAt(p, t), a = p[i], b = p[Math.min(i + 1, p.length - 1)];
    var k = b[0] > a[0] ? Math.max(0, Math.min(1, (t - a[0]) / (b[0] - a[0]))) : 0;
    return { i: i, x: a[1] + (b[1] - a[1]) * k, alt: a[2] + (b[2] - a[2]) * k, vx: (b[1] - a[1]) / Math.max(0.05, b[0] - a[0]),
      power: !!(a[3] & 1), autoLand: !!(a[3] & 2), g: a[4] };
  }

  /* ── 3D ───────────────────────────── */
  function ensure3D() {
    if (V.R || !window.THREE || !window.MCSim) return;
    var T = window.THREE, canvas = $('rpCanvas');
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    var w = MCSim.world.make(T);
    var trail = new T.Group(); w.scene.add(trail);
    V.R = { T: T, renderer: renderer, w: w, trail: trail, spin: 0 };
    var drag = null;
    canvas.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, yaw: V.yaw, pitch: V.pitch }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag) return;
      V.yaw = drag.yaw - (e.clientX - drag.x) * 0.006;
      V.pitch = Math.max(0.05, Math.min(1.2, drag.pitch + (e.clientY - drag.y) * 0.004));
      if (!V.playing) draw(0);
    });
    ['pointerup', 'pointercancel'].forEach(function (k) { canvas.addEventListener(k, function () { drag = null; }); });
    canvas.addEventListener('dblclick', function () { V.yaw = 0; V.pitch = 0.32; draw(0); });
  }
  function resize() {
    if (!V.R) return;
    var el = $('rpCanvas').parentElement, w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    V.R.renderer.setSize(w, h, false);
    V.R.w.camera.aspect = w / h; V.R.w.camera.updateProjectionMatrix();
  }
  function buildTrail() {
    var R = V.R, T = R.T, g = R.trail;
    while (g.children.length) g.remove(g.children[0]);
    MCSim.world.marks(T, R.w.marks, V.row.mission);
    var pts = V.tr.p.map(function (s) { return new T.Vector3(s[1], s[2] + 0.1, 0); });
    var full = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: '#6f8f76', transparent: true, opacity: 0.45 }));
    var done = new T.Line(new T.BufferGeometry().setFromPoints(pts), new T.LineBasicMaterial({ color: '#e0a447' }));
    g.add(full); g.add(done); R.done = done;
    // 실수 지점
    V.tr.ev.forEach(function (e) {
      if (e.k !== 'e') return;
      var s = stateAt(e.t);
      var m = new T.Mesh(new T.SphereGeometry(0.13, 12, 12), new T.MeshBasicMaterial({ color: '#ec7b6e' }));
      m.position.set(s.x, s.alt + 0.1, 0); g.add(m);
    });
  }
  function draw(dt) {
    var R = V.R; if (!R) return;
    var s = stateAt(V.t), w = R.w;
    w.drone.position.set(s.x, s.alt + 0.1, 0);
    w.drone.rotation.z = -Math.max(-2, Math.min(2, s.vx)) * 0.12;
    var spin = s.power ? (s.alt > 0.02 ? 42 : 26) : 0;
    w.rotors.forEach(function (r, i) { r.rotation.y += (i % 2 ? -1 : 1) * spin * dt; r.userData.disc.material.opacity = spin > 10 ? 0.16 : 0; });
    w.led.material.color.set(s.power ? (s.autoLand ? '#e0a447' : '#4fd37a') : '#b23a2e');
    w.shadow.position.x = s.x;
    var sc = Math.max(0.35, 1 - s.alt * 0.08); w.shadow.scale.set(sc, sc, sc); w.shadow.material.opacity = 0.35 * sc;
    R.done.geometry.setDrawRange(0, s.i + 1);
    w.marks.children.forEach(function (m) { if (m.userData.kind === 'ring') m.rotation.y += dt * 0.6; });
    var cam = w.camera, asp = cam.aspect || 1.4, dist = asp < 1 ? 14 : asp < 1.3 ? 12 : 10.5;
    var cx = s.x * 0.3, cy = 1.6 + s.alt * 0.45;
    cam.position.set(cx + Math.sin(V.yaw) * dist * Math.cos(V.pitch), cy + Math.sin(V.pitch) * dist, Math.cos(V.yaw) * dist * Math.cos(V.pitch));
    cam.lookAt(cx, cy - 0.4, 0);
    R.renderer.render(w.scene, cam);
    readout(s);
  }

  /* ── 판독·단계·이벤트 ──────────────── */
  var shownG = null;
  function readout(s) {
    $('rpTime').textContent = 'T+' + V.t.toFixed(1) + 's / ' + V.dur.toFixed(1) + 's';
    $('rpSeek').value = V.t;
    $('rpAlt').textContent = s.alt.toFixed(1);
    $('rpX').textContent = (s.x >= 0 ? '+' : '') + s.x.toFixed(1);
    $('rpState').textContent = !s.power ? '전원 꺼짐' : s.autoLand ? '자동 착륙' : s.alt < 0.02 ? '이륙 대기' : '비행 중';
    if (s.g !== shownG) {
      shownG = s.g;
      $('rpHand').innerHTML = MCHand.svg(gShape(s.g), 72);
      $('rpG').textContent = gName(s.g);
      $('rpGSign').textContent = gSign(s.g);
      $('rpGesture').className = 'rp-gesture g-' + s.g;
    }
    $('rpCursor').style.left = (V.dur ? V.t / V.dur * 100 : 0) + '%';
    var stepDone = V.tr.ev.filter(function (e) { return e.k === 's' && e.t <= V.t; }).length;
    [].forEach.call($('rpSteps').children, function (li, i) { li.className = i < stepDone ? 'done' : i === stepDone ? 'cur' : ''; });
    [].forEach.call($('rpEvents').children, function (li) { li.classList.toggle('past', +li.dataset.t <= V.t); });
  }
  function evText(e) {
    if (e.k === 'g') return '수신호 확정 · ' + gName(e.g);
    if (e.k === 'e') return '실수 · ' + e.e.toUpperCase() + ' ' + errKo(e.e);
    return '단계 ' + e.s + ' 완료';
  }
  function buildPanels() {
    var tr = V.tr, dur = V.dur;
    $('rpSteps').innerHTML = (tr.steps || []).map(function (t) { return '<li>' + esc(t) + '</li>'; }).join('');
    $('rpEvents').innerHTML = tr.ev.length ? tr.ev.map(function (e) {
      return '<li class="ev-' + e.k + '" data-t="' + e.t + '"><button type="button" class="linklike"><time>' + e.t.toFixed(1) + 's</time>' + esc(evText(e)) + '</button></li>';
    }).join('') : '<li class="empty">기록된 이벤트가 없습니다.</li>';
    $('rpEvents').querySelectorAll('li[data-t]').forEach(function (li) { li.querySelector('button').addEventListener('click', function () { seek(+li.dataset.t); }); });
    // 수신호 타임라인: 같은 수신호가 이어진 구간을 한 칸으로
    var segs = [], p = tr.p;
    p.forEach(function (s, i) {
      var end = i + 1 < p.length ? p[i + 1][0] : dur;
      var last = segs[segs.length - 1];
      if (last && last.g === s[4]) last.end = end; else segs.push({ g: s[4], start: s[0], end: end });
    });
    var html = segs.map(function (g) {
      return '<span class="seg g-' + g.g + '" style="left:' + (g.start / dur * 100) + '%;width:' + Math.max(0.2, (g.end - g.start) / dur * 100) + '%" title="' + esc(gName(g.g)) + ' ' + g.start.toFixed(1) + '–' + g.end.toFixed(1) + 's"></span>';
    }).join('');
    html += tr.ev.filter(function (e) { return e.k === 'e'; }).map(function (e) {
      return '<i class="tick" style="left:' + (e.t / dur * 100) + '%" title="' + esc(evText(e)) + ' (' + e.t.toFixed(1) + 's)"></i>';
    }).join('');
    $('rpBar').innerHTML = html + '<b class="cursor" id="rpCursor"></b>';
    var used = []; segs.forEach(function (g) { if (used.indexOf(g.g) < 0) used.push(g.g); });
    $('rpLegend').innerHTML = used.map(function (g) { return '<span><i class="g-' + g + '"></i>' + esc(gName(g)) + '</span>'; }).join('') + (tr.ev.some(function (e) { return e.k === 'e'; }) ? '<span><i class="tick-key"></i>실수</span>' : '');
    var seekEl = $('rpSeek'); seekEl.max = dur; seekEl.step = 0.1;
  }

  /* ── 재생 제어 ────────────────────── */
  function setPlaying(on) {
    if (on && V.t >= V.dur) V.t = 0;
    V.playing = on;
    $('rpPlay').textContent = on ? '일시정지' : (V.t >= V.dur ? '처음부터' : '재생');
  }
  function seek(t) { V.t = Math.max(0, Math.min(V.dur, t)); draw(0); setPlaying(V.playing); }
  function tick(now) {
    var dt = Math.min(0.05, (now - V.last) / 1000); V.last = now;
    if (V.playing) {
      V.t += dt * V.speed;
      if (V.t >= V.dur) { V.t = V.dur; setPlaying(false); }
    }
    draw(dt);
    V.raf = requestAnimationFrame(tick);
  }

  function open(row, num, trackPromise) {
    var dlg = $('replayDlg');
    V.row = row; V.tr = null; shownG = null;
    $('rpTitle').textContent = (num ? num + '회차 · ' : '') + ((window.MCReview && MCReview.MNAME[row.mission]) || row.mission);
    $('rpMeta').textContent = row.rank + ' ' + row.name + ' · ' + row.score + '점 · ' + (row.success ? '성공' : '실패') + ' · ' + (row.input_mode === 'camera' ? '카메라 입력' : '수동 입력');
    $('rpBody').hidden = true; $('rpMsg').hidden = false; $('rpMsg').textContent = '비행 기록을 불러오는 중…';
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
    Promise.resolve(trackPromise).then(function (tr) {
      if (!tr || !tr.p || tr.p.length < 2) { $('rpMsg').textContent = '이 회차에는 재생할 비행 기록이 없습니다. 재생 기능을 추가하기 전에 수행한 회차입니다.'; return; }
      if (!window.THREE) { $('rpMsg').textContent = '3D 라이브러리를 불러오지 못해 재생할 수 없습니다. 인터넷 연결을 확인하세요.'; return; }
      V.tr = tr; V.dur = tr.p[tr.p.length - 1][0]; V.t = 0; V.speed = +$('rpSpeed').value || 1;
      $('rpMsg').hidden = true; $('rpBody').hidden = false;
      ensure3D(); resize(); buildTrail(); buildPanels();
      setPlaying(true);
      cancelAnimationFrame(V.raf); V.last = performance.now(); V.raf = requestAnimationFrame(tick);
    }).catch(function () { $('rpMsg').textContent = '비행 기록을 불러오지 못했습니다. 잠시 후 다시 시도하세요.'; });
  }
  function close() { cancelAnimationFrame(V.raf); V.playing = false; }

  /* ── 예시 기록용 가상 궤적 ───────────── */
  // 실제 미션 판정 규칙(MCSim.MISSIONS)으로 단계 완료를 계산해 실제 기록과 같은 형식으로 만든다.
  var PLANS = {
    M1: [['READY', 1.2], ['POWER_ON', 1.3], ['READY', 0.6], ['UP', 'alt', 3.15], ['READY', 0.8], ['DOWN', 'alt', 0], ['READY', 0.6], ['POWER_OFF', 1.3]],
    M2: [['READY', 1], ['POWER_ON', 1.3], ['UP', 'alt', 2.3], ['READY', 0.5], ['LEFT', 'x', -3.7], ['READY', 0.7], ['RIGHT', 'x', 3.7], ['READY', 0.6]],
    M3: [['READY', 1], ['POWER_ON', 1.3], ['UP', 'alt', 3.0], ['READY', 5.6]],
    M4: [['READY', 1], ['POWER_ON', 1.3], ['UP', 'alt', 3.15], ['READY', 0.5], ['LEFT', 'x', -3.7], ['READY', 0.6], ['RIGHT', 'x', 3.7], ['READY', 0.6], ['DOWN', 'alt', 0], ['READY', 0.6], ['POWER_OFF', 1.3]]
  };
  var WRONG = { UP: 'LEFT', DOWN: 'POWER_OFF', LEFT: 'UP', RIGHT: 'DOWN', POWER_ON: 'UNKNOWN', POWER_OFF: 'DOWN' };
  function synth(code, opt) {
    opt = opt || {};
    var def = MCSim.MISSIONS[code], plan = PLANS[code];
    var seed = opt.seed || 1, rnd = function () { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    // 실수(E1)는 앞쪽 동작 단계 앞에 잘못된 수신호를 끼워 넣는다
    var phases = [], wrong = opt.e1 || 0;
    plan.forEach(function (ph, i) {
      if (wrong > 0 && ph[0] !== 'READY' && i > 0 && WRONG[ph[0]] && WRONG[ph[0]] !== 'UNKNOWN') { phases.push([WRONG[ph[0]], 1.0, 0, true], ['READY', 0.5]); wrong--; }
      phases.push(ph);
    });
    if (opt.success === false) phases = phases.slice(0, Math.max(3, Math.round(phases.length * 0.6))).concat([['READY', 2.5]]);
    var S = { power: false, alt: 0, x: 0, vx: 0, vy: 0, autoLand: false }, t = 0, dt = 0.05, step = 0, stay = 0;
    var p = [], ev = [], next = 0, r1 = function (v) { return Math.round(v * 10) / 10; }, r2 = function (v) { return Math.round(v * 100) / 100; };
    function rec(g) { p.push([r1(t), r2(S.x), r2(S.alt), (S.power ? 1 : 0) | (S.autoLand ? 2 : 0), g]); }
    phases.forEach(function (ph) {
      var g = ph[0], kind = INFO[g] ? INFO[g].kind : 'idle', hold = INFO[g] ? INFO[g].hold : 0, tau = 0, fired = false;
      var limit = typeof ph[1] === 'number' ? ph[1] * (0.85 + rnd() * 0.3) : 12;
      while (tau < limit) {
        if (ph[1] === 'alt' && (ph[2] > 0 ? S.alt >= ph[2] : S.alt <= 0.001) && tau > 0.6) break;
        if (ph[1] === 'x' && (ph[2] < 0 ? S.x <= ph[2] : S.x >= ph[2])) break;
        if (!fired && g !== 'READY' && tau >= hold) {
          fired = true; ev.push({ t: r1(t), k: 'g', g: g });
          if (ph[3]) ev.push({ t: r1(t), k: 'e', e: 'e1' });
          if (g === 'POWER_ON') S.power = true;
          if (g === 'POWER_OFF' && S.alt <= 0.05) S.power = false;
        }
        var active = S.power && kind === 'move' && fired ? g : null;
        var ty = active === 'UP' ? 1.5 : active === 'DOWN' ? -1.5 : 0, tx = active === 'LEFT' && S.alt > 0.05 ? -2 : active === 'RIGHT' && S.alt > 0.05 ? 2 : 0;
        var k = Math.min(1, dt * 4); S.vx += (tx - S.vx) * k; S.vy += (ty - S.vy) * k;
        S.x += S.vx * dt; S.alt += S.vy * dt; if (S.alt <= 0) { S.alt = 0; if (S.vy < 0) S.vy = 0; S.vx *= 0.5; }
        var st = def.steps[step];
        if (st) {
          if (st.stay) { if (st.ok(S) && !active) stay += dt; else if (!st.ok(S)) stay = 0; if (stay >= st.stay) { step++; ev.push({ t: r1(t), k: 's', s: step }); } }
          else if (st.ok(S)) { step++; stay = 0; ev.push({ t: r1(t), k: 's', s: step }); }
        }
        if (t >= next) { rec(g); next += 0.2; }
        t += dt; tau += dt;
      }
    });
    rec('READY');
    return { v: 1, dt: 0.2, steps: def.steps.map(function (s) { return s.t; }), p: p, ev: ev, sample: true };
  }

  document.addEventListener('DOMContentLoaded', function () {
    var dlg = $('replayDlg'); if (!dlg) return;
    $('rpClose').addEventListener('click', function () { if (dlg.close) dlg.close(); else dlg.removeAttribute('open'); close(); });
    dlg.addEventListener('close', close);
    $('rpPlay').addEventListener('click', function () { setPlaying(!V.playing); });
    $('rpSpeed').addEventListener('change', function () { V.speed = +$('rpSpeed').value || 1; });
    $('rpSeek').addEventListener('input', function () { V.playing = false; seek(+$('rpSeek').value); });
    $('rpBar').addEventListener('click', function (e) {
      var r = $('rpBar').getBoundingClientRect(); if (!V.tr) return;
      seek((e.clientX - r.left) / r.width * V.dur);
    });
    if (window.ResizeObserver) new ResizeObserver(function () { resize(); if (V.tr && !V.playing) draw(0); }).observe($('rpCanvas').parentElement);
  });

  window.MCReplay = { open: open, synth: synth };
})();
