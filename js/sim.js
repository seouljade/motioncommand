/* MotionCommand 시뮬레이터: 카메라 손 인식 + 3D 드론 + 훈련 미션 채점 */
(function () {
  'use strict';
  var CFG = window.MC_CONFIG || {};
  var GS = window.MCGesture, G = GS.G, INFO = GS.INFO;
  var $ = function (id) { return document.getElementById(id); };

  /* ── 상태 ───────────────────────────── */
  var S = {
    power: false, alt: 0, x: 0, vx: 0, vy: 0, bat: 100, autoLand: false, wasAir: false,
    rotor: 0, edgeHit: false
  };
  var cam = { stream: null, on: false, model: 'idle', landmarker: null, lastT: -1, lastRes: null, lastSeen: 0, err: '' };
  var input = { pad: null, usedPad: false, raw: { id: G.HOVER, conf: 0 }, active: G.HOVER };
  var deb = new GS.Debouncer({ threshold: 0.7, holdScale: 1 });
  var mission = null; // 진행 중 미션
  var listeners = { status: [], finish: [], log: [] };
  var visible = false;

  function emit(k, v) { (listeners[k] || []).forEach(function (f) { try { f(v); } catch (e) { console.error(e); } }); }

  /* ── 미션 정의 ───────────────────────── */
  var MISSIONS = {
    FREE: { code: 'FREE', title: '자유비행', limit: 0, desc: '채점 없이 수신호를 자유롭게 연습합니다. 기록은 저장되지 않습니다.', steps: [] },
    M1: {
      code: 'M1', title: 'M1 기본 이착륙', limit: 60,
      desc: '전원을 켜고 고도 3m 링까지 상승한 뒤, 착륙해서 전원을 끕니다. 제한 60초.',
      steps: [
        { t: 'OK 수신호로 전원 켜기', allow: ['POWER_ON'], ok: function (s) { return s.power; } },
        { t: '엄지척으로 고도 3m 링 통과', allow: ['UP', 'DOWN'], ok: function (s) { return s.alt >= 3; } },
        { t: '엄지 아래로 착륙', allow: ['DOWN', 'UP'], ok: function (s) { return s.alt <= 0.01; } },
        { t: '손바닥 아래로 전원 끄기', allow: ['POWER_OFF'], ok: function (s) { return !s.power; } }
      ]
    },
    M2: {
      code: 'M2', title: 'M2 좌우 기동', limit: 90,
      desc: '이륙해 고도 2m 이상을 확보한 뒤 왼쪽 표적(−4m), 오른쪽 표적(+4m) 순서로 도달합니다. 제한 90초.',
      steps: [
        { t: '전원 켜고 고도 2m 이상 상승', allow: ['POWER_ON', 'UP', 'DOWN'], ok: function (s) { return s.power && s.alt >= 2; } },
        { t: '검지로 왼쪽 표적(−4m) 도달', allow: ['LEFT', 'UP', 'DOWN'], ok: function (s) { return s.x <= -3.5 && s.alt >= 1; }, target: -4 },
        { t: '검지로 오른쪽 표적(+4m) 도달', allow: ['RIGHT', 'UP', 'DOWN'], ok: function (s) { return s.x >= 3.5 && s.alt >= 1; }, target: 4 }
      ]
    },
    M3: {
      code: 'M3', title: 'M3 정밀 호버링', limit: 60,
      desc: '고도 2.5–3.5m, 좌우 ±1m 상자 안으로 들어가 5초간 머뭅니다. 손을 화면 밖으로 빼면 정지합니다. 제한 60초.',
      steps: [
        { t: 'OK 수신호로 전원 켜기', allow: ['POWER_ON'], ok: function (s) { return s.power; } },
        { t: '목표 상자(고도 3m) 진입', allow: ['UP', 'DOWN', 'LEFT', 'RIGHT'], ok: inBox },
        { t: '상자 안에서 5초 정지 유지', allow: ['UP', 'DOWN', 'LEFT', 'RIGHT'], stay: 5, ok: inBox }
      ]
    },
    M4: {
      code: 'M4', title: 'M4 종합 임무', limit: 120,
      desc: '전원 켜기 → 3m 상승 → 왼쪽 표적 → 오른쪽 표적 → 착륙 → 전원 끄기. 제한 120초.',
      steps: [
        { t: 'OK 수신호로 전원 켜기', allow: ['POWER_ON'], ok: function (s) { return s.power; } },
        { t: '고도 3m 링까지 상승', allow: ['UP', 'DOWN'], ok: function (s) { return s.alt >= 3; } },
        { t: '왼쪽 표적(−4m) 도달', allow: ['LEFT', 'UP', 'DOWN'], ok: function (s) { return s.x <= -3.5 && s.alt >= 1; }, target: -4 },
        { t: '오른쪽 표적(+4m) 도달', allow: ['RIGHT', 'UP', 'DOWN'], ok: function (s) { return s.x >= 3.5 && s.alt >= 1; }, target: 4 },
        { t: '착륙', allow: ['DOWN', 'UP', 'LEFT'], ok: function (s) { return s.alt <= 0.01; } },
        { t: '손바닥 아래로 전원 끄기', allow: ['POWER_OFF'], ok: function (s) { return !s.power; } }
      ]
    }
  };
  function inBox(s) { return s.power && s.alt >= 2.5 && s.alt <= 3.5 && Math.abs(s.x) <= 1; }

  /* ── 로그·토스트 ─────────────────────── */
  var logEl, toastEl, toastTimer;
  function stamp() {
    if (mission && mission.running) return 'T+' + mission.t.toFixed(1) + 's';
    var d = new Date(); return d.toTimeString().slice(0, 8);
  }
  function log(text, kind) {
    var li = document.createElement('li');
    li.className = kind || '';
    var t = document.createElement('time'); t.textContent = stamp();
    var s = document.createElement('span'); s.textContent = text;
    li.appendChild(t); li.appendChild(s);
    logEl.insertBefore(li, logEl.firstChild);
    while (logEl.children.length > 30) logEl.removeChild(logEl.lastChild);
    emit('log', { text: text, kind: kind });
  }
  function toast(text, kind) {
    toastEl.textContent = text; toastEl.className = 'toast ' + (kind || ''); toastEl.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(function () { toastEl.hidden = true; }, 1800);
  }

  /* ── 제스처 확정 이벤트 ─────────────── */
  deb.onConfirm = function (id) {
    var inf = INFO[id];
    if (mission && mission.running) checkAllowed(id);
    if (id === G.POWER_ON) {
      if (!S.power) { S.power = true; S.autoLand = false; log('전원 켜기 — 프로펠러 회전', 'ok'); toast('전원 켜짐', 'ok'); }
      else log('이미 전원이 켜져 있습니다', 'mute');
    } else if (id === G.POWER_OFF) {
      if (!S.power) { log('이미 전원이 꺼져 있습니다', 'mute'); }
      else if (S.alt > 0.05) {
        S.autoLand = true;
        log('공중 전원차단 시도 → 자동 착륙 후 전원 차단', 'warn'); toast('자동 착륙 중', 'warn');
        if (mission && mission.running) addErr('e3');
      } else { S.power = false; log('전원 끄기', 'ok'); toast('전원 꺼짐'); }
    } else {
      if (!S.power) log(inf.ko + ' — 전원이 꺼져 있어 무시됨', 'mute');
      else log(inf.ko + ' (' + inf.sign + ')');
    }
  };
  deb.onBreak = function (id) { if (mission && mission.running) { mission.err.e2++; } };

  function checkAllowed(id) {
    var st = mission.def.steps[mission.step];
    if (!st) return;
    if (id === G.POWER_OFF && S.alt > 0.05) return; // E3로 따로 기록
    if (st.allow.indexOf(id) < 0) {
      mission.err.e1++;
      mission.confusions.push({ expected: st.allow[0], got: id, step: mission.step + 1 });
      log('과제와 다른 명령: ' + INFO[id].ko + ' (기대: ' + INFO[st.allow[0]].ko + ')', 'bad');
    }
  }
  function addErr(k) { mission.err[k]++; }

  /* ── 3D ─────────────────────────────── */
  var R = { ok: false };
  function css(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return v || fallback;
  }
  function init3D(canvas) {
    if (!window.THREE) { $('no3d').hidden = false; return; }
    var T = window.THREE;
    var renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    var scene = new T.Scene();
    scene.background = new T.Color('#0d1410');
    scene.fog = new T.Fog('#0d1410', 14, 30);
    var camera = new T.PerspectiveCamera(50, 1, 0.1, 100);

    scene.add(new T.HemisphereLight('#cfe3d2', '#1a2a1f', 0.9));
    var sun = new T.DirectionalLight('#ffffff', 0.8); sun.position.set(4, 10, 6); scene.add(sun);

    var ground = new T.Mesh(new T.PlaneGeometry(40, 40), new T.MeshStandardMaterial({ color: '#16221a', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2; scene.add(ground);
    var grid = new T.GridHelper(20, 20, '#3f5a46', '#24352a'); grid.position.y = 0.001; scene.add(grid);

    // 훈련 구역 경계
    var bm = new T.LineBasicMaterial({ color: '#b7791f', transparent: true, opacity: 0.55 });
    [-8, 8].forEach(function (x) {
      var g = new T.BufferGeometry().setFromPoints([new T.Vector3(x, 0, -2), new T.Vector3(x, 8, -2), new T.Vector3(x, 8, 2), new T.Vector3(x, 0, 2)]);
      scene.add(new T.Line(g, bm));
    });

    // 이착륙장
    var pad = new T.Mesh(new T.RingGeometry(0.55, 0.75, 40), new T.MeshBasicMaterial({ color: '#7fb58a', side: T.DoubleSide }));
    pad.rotation.x = -Math.PI / 2; pad.position.y = 0.01; scene.add(pad);

    // 드론
    var drone = new T.Group();
    var dark = new T.MeshStandardMaterial({ color: '#2b3a2f', roughness: 0.6, metalness: 0.3 });
    var olive = new T.MeshStandardMaterial({ color: '#56704f', roughness: 0.5, metalness: 0.2 });
    var body = new T.Mesh(new T.BoxGeometry(0.62, 0.16, 0.62), olive); drone.add(body);
    var top = new T.Mesh(new T.BoxGeometry(0.36, 0.1, 0.36), dark); top.position.y = 0.12; drone.add(top);
    var rotors = [];
    [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (p) {
      var arm = new T.Mesh(new T.BoxGeometry(0.75, 0.05, 0.07), dark);
      arm.position.set(p[0] * 0.34, 0.02, p[1] * 0.34); arm.rotation.y = p[0] * p[1] > 0 ? -Math.PI / 4 : Math.PI / 4; drone.add(arm);
      var motor = new T.Mesh(new T.CylinderGeometry(0.07, 0.07, 0.1, 16), dark);
      motor.position.set(p[0] * 0.6, 0.06, p[1] * 0.6); drone.add(motor);
      var rotor = new T.Group();
      var bladeM = new T.MeshStandardMaterial({ color: '#d9e4da', transparent: true, opacity: 0.85 });
      var b1 = new T.Mesh(new T.BoxGeometry(0.56, 0.012, 0.06), bladeM); rotor.add(b1);
      var b2 = b1.clone(); b2.rotation.y = Math.PI / 2; rotor.add(b2);
      var disc = new T.Mesh(new T.CircleGeometry(0.29, 24), new T.MeshBasicMaterial({ color: '#d9e4da', transparent: true, opacity: 0, side: T.DoubleSide }));
      disc.rotation.x = -Math.PI / 2; rotor.add(disc); rotor.userData.disc = disc;
      rotor.position.set(p[0] * 0.6, 0.12, p[1] * 0.6); drone.add(rotor); rotors.push(rotor);
    });
    var led = new T.Mesh(new T.SphereGeometry(0.045, 12, 12), new T.MeshBasicMaterial({ color: '#b23a2e' }));
    led.position.set(0, 0.02, 0.33); drone.add(led);
    drone.position.y = 0.1; scene.add(drone);

    var shadow = new T.Mesh(new T.CircleGeometry(0.55, 32), new T.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35 }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.012; scene.add(shadow);

    // 미션 표식
    var marks = new T.Group(); scene.add(marks);

    R = { ok: true, T: T, renderer: renderer, scene: scene, camera: camera, drone: drone, rotors: rotors, led: led, shadow: shadow, marks: marks, yaw: 0, pitch: 0.32 };
    bindOrbit(canvas);
    resize3D();
    if (window.ResizeObserver) new ResizeObserver(resize3D).observe(canvas.parentElement);
  }

  function bindOrbit(canvas) {
    var drag = null;
    canvas.addEventListener('pointerdown', function (e) { drag = { x: e.clientX, y: e.clientY, yaw: R.yaw, pitch: R.pitch }; canvas.setPointerCapture(e.pointerId); });
    canvas.addEventListener('pointermove', function (e) {
      if (!drag) return;
      R.yaw = drag.yaw - (e.clientX - drag.x) * 0.006;
      R.pitch = Math.max(0.05, Math.min(1.2, drag.pitch + (e.clientY - drag.y) * 0.004));
    });
    ['pointerup', 'pointercancel'].forEach(function (k) { canvas.addEventListener(k, function () { drag = null; }); });
    canvas.addEventListener('dblclick', function () { R.yaw = 0; R.pitch = 0.32; });
  }

  function resize3D() {
    if (!R.ok) return;
    var el = R.renderer.domElement.parentElement;
    var w = el.clientWidth, h = el.clientHeight;
    if (!w || !h) return;
    R.renderer.setSize(w, h, false);
    R.camera.aspect = w / h; R.camera.updateProjectionMatrix();
  }

  function buildMarks(code) {
    if (!R.ok) return;
    var T = R.T, g = R.marks;
    while (g.children.length) g.remove(g.children[0]);
    var amber = '#e0a447', green = '#7fb58a';
    function ring(y) {
      var m = new T.Mesh(new T.TorusGeometry(0.9, 0.05, 10, 48), new T.MeshBasicMaterial({ color: amber }));
      m.position.set(0, y, 0); m.userData.kind = 'ring'; g.add(m);
    }
    function column(x) {
      var m = new T.Mesh(new T.CylinderGeometry(0.45, 0.45, 4, 24, 1, true), new T.MeshBasicMaterial({ color: green, transparent: true, opacity: 0.18, side: T.DoubleSide }));
      m.position.set(x, 2, 0); m.userData.kind = 'col'; m.userData.x = x; g.add(m);
      var base = new T.Mesh(new T.RingGeometry(0.4, 0.55, 32), new T.MeshBasicMaterial({ color: green, side: T.DoubleSide }));
      base.rotation.x = -Math.PI / 2; base.position.set(x, 0.015, 0); g.add(base);
    }
    function box() {
      var geo = new T.EdgesGeometry(new T.BoxGeometry(2, 1, 1.6));
      var m = new T.LineSegments(geo, new T.LineBasicMaterial({ color: amber }));
      m.position.set(0, 3, 0); m.userData.kind = 'box'; g.add(m);
    }
    if (code === 'M1') ring(3);
    if (code === 'M2') { column(-4); column(4); }
    if (code === 'M3') box();
    if (code === 'M4') { ring(3); column(-4); column(4); }
  }

  function render3D(dt) {
    if (!R.ok) return;
    var d = R.drone;
    d.position.set(S.x, S.alt + 0.1, 0);
    d.rotation.z = -S.vx * 0.12;
    d.rotation.x = S.vy * 0.03;
    var spin = S.power ? (S.alt > 0.02 ? 42 : 26) : Math.max(0, (R.spinLeft || 0));
    if (!S.power && R.spinLeft > 0) R.spinLeft -= dt * 30; else if (S.power) R.spinLeft = 26;
    R.rotors.forEach(function (r, i) {
      r.rotation.y += (i % 2 ? -1 : 1) * spin * dt;
      r.userData.disc.material.opacity = spin > 10 ? 0.16 : 0;
    });
    R.led.material.color.set(S.power ? (S.autoLand ? '#e0a447' : '#4fd37a') : '#b23a2e');
    R.shadow.position.x = S.x;
    var sc = Math.max(0.35, 1 - S.alt * 0.08); R.shadow.scale.set(sc, sc, sc);
    R.shadow.material.opacity = 0.35 * sc;

    // 현재 목표 강조
    var tgt = mission && mission.running ? (mission.def.steps[mission.step] || {}).target : null;
    R.marks.children.forEach(function (m) {
      if (m.userData.kind === 'col') m.material.opacity = (tgt === m.userData.x) ? 0.26 + 0.08 * Math.sin(performance.now() / 250) : 0.08;
      if (m.userData.kind === 'ring') m.rotation.y += dt * 0.6;
    });

    var asp = R.camera.aspect || 1.4; var dist = asp < 1 ? 14 : asp < 1.3 ? 12 : 10.5;
    var cx = S.x * 0.3, cy = 1.6 + S.alt * 0.45;
    R.camera.position.set(cx + Math.sin(R.yaw) * dist * Math.cos(R.pitch), cy + Math.sin(R.pitch) * dist, Math.cos(R.yaw) * dist * Math.cos(R.pitch));
    R.camera.lookAt(cx, cy - 0.4, 0);
    R.renderer.render(R.scene, R.camera);
  }

  /* ── 물리 ───────────────────────────── */
  function physics(dt, active) {
    var tx = 0, ty = 0;
    if (S.power && !S.autoLand) {
      if (active === G.UP) ty = 1.5;
      if (active === G.DOWN) ty = -1.5;
      if (active === G.LEFT && S.alt > 0.05) tx = -2;
      if (active === G.RIGHT && S.alt > 0.05) tx = 2;
    }
    if (S.autoLand) { ty = -1.1; tx = 0; }
    var k = Math.min(1, dt * 4);
    S.vx += (tx - S.vx) * k; S.vy += (ty - S.vy) * k;
    S.x += S.vx * dt; S.alt += S.vy * dt;

    var hit = false;
    if (S.alt <= 0) { S.alt = 0; if (S.vy < 0) S.vy = 0; S.vx *= 0.5; }
    if (S.alt > 8) { S.alt = 8; S.vy = 0; hit = true; }
    if (S.x < -8) { S.x = -8; S.vx = 0; hit = true; }
    if (S.x > 8) { S.x = 8; S.vx = 0; hit = true; }
    if (hit && !S.edgeHit) { log('훈련 구역 경계 도달', 'warn'); toast('구역 경계', 'warn'); if (mission && mission.running) addErr('e4'); }
    S.edgeHit = hit;
    if (S.alt > 0.5) S.wasAir = true;

    if (S.autoLand && S.alt <= 0.001) { S.autoLand = false; S.power = false; log('착륙 완료 — 전원 차단', 'ok'); toast('전원 꺼짐'); }
    if (S.power) { S.bat = Math.max(0, S.bat - dt * 0.35); if (S.bat <= 0 && S.alt > 0 && !S.autoLand) { S.autoLand = true; log('배터리 소진 — 자동 착륙', 'warn'); } }
  }

  /* ── 미션 진행 ───────────────────────── */
  function startMission(code, trainee) {
    var def = MISSIONS[code];
    resetDrone(true);
    if (code === 'FREE') { mission = null; buildMarks(null); renderMissionHud(); log('자유비행 모드'); return; }
    mission = { def: def, code: code, trainee: trainee, running: true, t: 0, step: 0, stay: 0, absent: 0, absentCounted: false,
      err: { e1: 0, e2: 0, e3: 0, e4: 0, e5: 0, e6: 0 }, confusions: [], usedPad: false };
    input.usedPad = false;
    buildMarks(code);
    renderMissionHud();
    log(def.title + ' 시작 — ' + def.steps[0].t, 'ok');
    toast(def.title + ' 시작', 'ok');
    emit('status');
  }

  function stopMission(reason) {
    if (!mission || !mission.running) return;
    finish(false, reason || '중단');
  }

  function stepMission(dt) {
    if (!mission || !mission.running) return;
    mission.t += dt;
    if (input.pad) mission.usedPad = true;
    var st = mission.def.steps[mission.step];
    if (st) {
      if (st.stay) {
        if (st.ok(S) && input.active === G.HOVER) mission.stay += dt;
        else if (!st.ok(S)) mission.stay = 0;
        if (mission.stay >= st.stay) advance();
      } else if (st.ok(S)) advance();
    }
    // E6 손 인식 이탈(카메라 모드, 정지 유지 과제 제외)
    var stayStep = st && st.stay;
    if (cam.on && !input.pad && !stayStep && input.raw.id === G.HOVER) {
      mission.absent += dt;
      if (mission.absent > 5 && !mission.absentCounted) { mission.absentCounted = true; addErr('e6'); log('손이 5초 이상 보이지 않음', 'warn'); }
    } else { mission.absent = 0; mission.absentCounted = false; }

    if (mission.running && mission.t >= mission.def.limit) { addErr('e5'); finish(false, '시간 초과'); }
    renderMissionHud();
  }

  function advance() {
    mission.step++; mission.stay = 0;
    var n = mission.def.steps[mission.step];
    if (n) { log('단계 완료 → ' + n.t, 'ok'); toast('단계 ' + mission.step + ' 완료', 'ok'); }
    else finish(true, '성공');
  }

  function finish(success, reason) {
    var m = mission; m.running = false;
    var def = m.def, e = m.err;
    var accuracy = Math.max(0, 20 - 2 * (e.e1 + e.e3 + e.e4 + e.e6) - 2 * Math.floor(e.e2 / 3));
    var time = success ? Math.round(20 * Math.max(0, Math.min(1, (def.limit - m.t) / (def.limit * 0.6)))) : 0;
    var base = success ? 60 : Math.round(30 * (m.step / def.steps.length));
    var score = Math.max(0, Math.min(100, base + time + accuracy));
    var attempt = {
      created_at: new Date().toISOString(), rank: m.trainee.rank, name: m.trainee.name, mission: m.code,
      success: success, score: score, duration_s: Math.round(m.t * 10) / 10,
      e1: e.e1, e2: e.e2, e3: e.e3, e4: e.e4, e5: e.e5, e6: e.e6,
      confusions: m.confusions.slice(0, 50), input_mode: (!cam.on || m.usedPad) ? 'keyboard' : 'camera',
      device: /Mobi|Android|iPhone/i.test(navigator.userAgent) ? 'mobile' : 'pc'
    };
    log(def.title + ' 종료 — ' + reason + ' · ' + score + '점', success ? 'ok' : 'bad');
    toast(success ? '임무 성공 ' + score + '점' : reason, success ? 'ok' : 'bad');
    renderMissionHud();
    emit('finish', { attempt: attempt, breakdown: { base: base, time: time, accuracy: accuracy, stepsDone: m.step, steps: def.steps.length }, reason: reason });
    emit('status');
  }

  var hudEls = {};
  function renderMissionHud() {
    var box = $('missionHud');
    if (!mission) { box.hidden = true; return; }
    box.hidden = false;
    $('mTitle').textContent = mission.def.title;
    $('mTime').textContent = mission.t.toFixed(1) + ' / ' + mission.def.limit + 's';
    var ol = $('mSteps');
    if (ol.dataset.code !== mission.code + mission.step + (mission.running ? 1 : 0) + Math.floor(mission.stay)) {
      ol.dataset.code = mission.code + mission.step + (mission.running ? 1 : 0) + Math.floor(mission.stay);
      ol.innerHTML = '';
      mission.def.steps.forEach(function (s, i) {
        var li = document.createElement('li');
        li.className = i < mission.step ? 'done' : (i === mission.step && mission.running ? 'cur' : '');
        li.textContent = s.t + (s.stay && i === mission.step ? ' (' + mission.stay.toFixed(0) + '/' + s.stay + 's)' : '');
        ol.appendChild(li);
      });
    }
  }

  function resetDrone(silent) {
    S.power = false; S.alt = 0; S.x = 0; S.vx = 0; S.vy = 0; S.bat = 100; S.autoLand = false; S.wasAir = false; S.edgeHit = false;
    if (!silent) log('드론 초기화');
  }

  /* ── 카메라 & 모델 ───────────────────── */
  function startCamera() {
    if (cam.on) return Promise.resolve(true);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      cam.err = '이 브라우저에서는 카메라를 쓸 수 없습니다 (HTTPS 주소인지 확인)';
      emit('status'); return Promise.resolve(false);
    }
    return navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }, audio: false })
      .then(function (stream) {
        cam.stream = stream; cam.on = true; cam.err = '';
        ['camVideo', 'envVideo'].forEach(function (id) { var v = $(id); if (v) { v.srcObject = stream; v.play().catch(function () {}); } });
        stream.getVideoTracks()[0].addEventListener('ended', function () { cam.on = false; emit('status'); });
        log('카메라 켜짐', 'ok');
        emit('status');
        loadModel();
        return true;
      })
      .catch(function (e) {
        cam.err = e && e.name === 'NotAllowedError' ? '카메라 권한이 차단되었습니다. 주소창 자물쇠 아이콘에서 허용하세요.'
          : e && e.name === 'NotFoundError' ? '연결된 카메라가 없습니다.'
          : e && e.name === 'NotReadableError' ? '다른 앱이 카메라를 쓰고 있습니다.'
          : '카메라를 켜지 못했습니다: ' + (e && e.message ? e.message : e);
        log(cam.err, 'bad'); emit('status');
        return false;
      });
  }

  function loadModel() {
    if (cam.model === 'loading' || cam.model === 'ready') return;
    cam.model = 'loading'; emit('status');
    var v = CFG.MP_VERSION || '0.10.14';
    var base = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@' + v;
    import(base + '/vision_bundle.mjs').then(function (mod) {
      return mod.FilesetResolver.forVisionTasks(base + '/wasm').then(function (fs) {
        var opts = function (delegate) {
          return { baseOptions: { modelAssetPath: CFG.MP_MODEL, delegate: delegate }, runningMode: 'VIDEO', numHands: 1,
            minHandDetectionConfidence: 0.5, minHandPresenceConfidence: 0.5, minTrackingConfidence: 0.5 };
        };
        return mod.HandLandmarker.createFromOptions(fs, opts('GPU')).catch(function () { return mod.HandLandmarker.createFromOptions(fs, opts('CPU')); });
      });
    }).then(function (lm) {
      cam.landmarker = lm; cam.model = 'ready'; log('손 인식 AI 모델 준비 완료', 'ok'); emit('status');
    }).catch(function (e) {
      cam.model = 'error'; cam.err = '손 인식 모델을 불러오지 못했습니다. 인터넷 연결을 확인하세요.';
      log(cam.err, 'bad'); console.error(e); emit('status');
    });
  }

  var camCanvas, camCtx;
  var BONES = [[0, 1], [1, 2], [2, 3], [3, 4], [0, 5], [5, 6], [6, 7], [7, 8], [5, 9], [9, 10], [10, 11], [11, 12], [9, 13], [13, 14], [14, 15], [15, 16], [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]];
  function detect() {
    var v = $('camVideo');
    if (!cam.on || !cam.landmarker || v.readyState < 2) return null;
    if (v.currentTime === cam.lastT) return cam.lastRes;
    cam.lastT = v.currentTime;
    try { cam.lastRes = cam.landmarker.detectForVideo(v, performance.now()); } catch (e) { cam.lastRes = null; }
    drawOverlay(cam.lastRes, v);
    return cam.lastRes;
  }
  function drawOverlay(res, v) {
    var w = camCanvas.clientWidth, h = camCanvas.clientHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (camCanvas.width !== Math.round(w * dpr)) { camCanvas.width = Math.round(w * dpr); camCanvas.height = Math.round(h * dpr); }
    var c = camCtx; c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
    if (!res || !res.landmarks || !res.landmarks.length) return;
    // object-fit: cover 보정
    var vw = v.videoWidth || 640, vh = v.videoHeight || 480;
    var sc = Math.max(w / vw, h / vh), ox = (w - vw * sc) / 2, oy = (h - vh * sc) / 2;
    var pts = res.landmarks[0].map(function (p) { return [w - (p.x * vw * sc + ox), p.y * vh * sc + oy]; });
    var colr = input.active !== G.HOVER ? '#e0a447' : '#7fb58a';
    c.lineWidth = 3; c.strokeStyle = colr; c.lineCap = 'round';
    BONES.forEach(function (b) { c.beginPath(); c.moveTo(pts[b[0]][0], pts[b[0]][1]); c.lineTo(pts[b[1]][0], pts[b[1]][1]); c.stroke(); });
    pts.forEach(function (p, i) { c.beginPath(); c.fillStyle = [4, 8, 12, 16, 20].indexOf(i) >= 0 ? '#ffffff' : colr; c.arc(p[0], p[1], i === 0 ? 5 : 3.5, 0, Math.PI * 2); c.fill(); });
  }

  /* ── 수동 입력 (화면 버튼·키보드) ─────── */
  var KEYMAP = { p: 'POWER_ON', P: 'POWER_ON', ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', o: 'POWER_OFF', O: 'POWER_OFF' };
  function bindPad(padEl) {
    ['POWER_ON', 'UP', 'DOWN', 'LEFT', 'RIGHT', 'POWER_OFF'].forEach(function (id) {
      var b = document.createElement('button');
      b.type = 'button'; b.className = 'pad-btn'; b.dataset.g = id;
      b.innerHTML = MCHand.svg(id, 44) + '<span><b>' + INFO[id].ko + '</b><small>' + INFO[id].sign + '</small></span>';
      var down = function (e) { e.preventDefault(); input.pad = id; input.usedPad = true; b.classList.add('on'); };
      var up = function () { if (input.pad === id) input.pad = null; b.classList.remove('on'); };
      b.addEventListener('pointerdown', down);
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (k) { b.addEventListener(k, up); });
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      padEl.appendChild(b);
    });
    window.addEventListener('keydown', function (e) {
      if (!visible) return;
      var tag = (e.target && e.target.tagName) || '';
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      var g = KEYMAP[e.key]; if (!g) return;
      e.preventDefault(); input.pad = g; input.usedPad = true;
      var b = padEl.querySelector('[data-g="' + g + '"]'); if (b) b.classList.add('on');
    });
    window.addEventListener('keyup', function (e) {
      var g = KEYMAP[e.key]; if (!g) return;
      if (input.pad === g) input.pad = null;
      var b = padEl.querySelector('[data-g="' + g + '"]'); if (b) b.classList.remove('on');
    });
    window.addEventListener('blur', function () { input.pad = null; padEl.querySelectorAll('.on').forEach(function (b) { b.classList.remove('on'); }); });
  }

  /* ── 판독 표시 ───────────────────────── */
  function renderReadout(raw, d) {
    var shown = d.cand || raw.id;
    var inf = INFO[shown] || INFO.HOVER;
    $('gName').textContent = inf.ko;
    $('gSign').textContent = shown === G.HOVER || shown === G.UNKNOWN ? '' : inf.sign;
    var conf = raw.id === G.HOVER ? 0 : raw.conf;
    $('gConf').style.width = Math.round(conf * 100) + '%';
    $('gConf').className = conf >= deb.threshold ? 'okc' : 'lowc';
    $('gConfTxt').textContent = Math.round(conf * 100) + '%';
    $('gHold').style.width = Math.round(d.progress * 100) + '%';
    var hold = d.cand ? INFO[d.cand].hold * deb.scale : 0;
    $('gHoldTxt').textContent = (d.progress * hold).toFixed(1) + 's';
    $('gDetail').textContent = input.pad ? '수동 입력 중' : (raw.detail || (cam.on ? '손을 카메라에 보여주세요' : '카메라 꺼짐 — 수동 입력 사용 가능'));
    $('hAlt').textContent = S.alt.toFixed(1);
    $('hX').textContent = (S.x >= 0 ? '+' : '') + S.x.toFixed(1);
    $('hBat').textContent = Math.round(S.bat);
    $('hState').textContent = !S.power ? '전원 꺼짐' : S.autoLand ? '자동 착륙' : S.alt < 0.02 ? '이륙 대기' : (input.active === G.HOVER ? '호버링' : INFO[input.active].ko);
  }

  /* ── 메인 루프 ───────────────────────── */
  var last = performance.now(), frame = 0;
  function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now; frame++;
    var raw;
    if (input.pad) raw = { id: input.pad, conf: 1, detail: '수동 입력' };
    else if (cam.on && cam.model === 'ready' && visible) {
      var res = detect();
      if (res && res.landmarks && res.landmarks.length) {
        var score = res.handedness && res.handedness[0] && res.handedness[0][0] ? res.handedness[0][0].score : 0.9;
        raw = GS.classify(res.landmarks[0], score); cam.lastSeen = now;
      } else raw = { id: G.HOVER, conf: 0, detail: '손이 보이지 않음 → 정지' };
    } else raw = { id: G.HOVER, conf: 0 };
    input.raw = raw;
    var d = deb.update(raw, now);
    input.active = d.active;
    physics(dt, input.active);
    stepMission(dt);
    if (visible) { render3D(dt); if (frame % 2 === 0) renderReadout(raw, d); }
    requestAnimationFrame(loop);
  }

  /* ── 공개 API ───────────────────────── */
  window.MCSim = {
    MISSIONS: MISSIONS, state: S, cam: cam,
    init: function () {
      logEl = $('log'); toastEl = $('toast');
      camCanvas = $('camCanvas'); camCtx = camCanvas.getContext('2d');
      init3D($('droneCanvas'));
      bindPad($('pad'));
      requestAnimationFrame(loop);
    },
    on: function (k, f) { (listeners[k] = listeners[k] || []).push(f); },
    startCamera: startCamera,
    startMission: startMission, stopMission: stopMission,
    resetDrone: function () { if (mission && mission.running) stopMission('중단'); resetDrone(false); },
    setVisible: function (v) { visible = v; if (v) setTimeout(resize3D, 30); },
    setThreshold: function (t) { deb.threshold = t; },
    setHoldScale: function (s) { deb.scale = s; },
    get mission() { return mission; },
    get inputMode() { return input.pad ? 'pad' : (cam.on && cam.model === 'ready' ? 'camera' : 'pad'); }
  };
})();
