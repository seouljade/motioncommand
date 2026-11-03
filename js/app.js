/* MotionCommand 앱: 화면 전환, 환경 점검, 훈련 연결, 사후검토, 매뉴얼 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var INFO = MCGesture.INFO;
  var ROUTES = ['intro', 'setup', 'sim', 'review', 'learn', 'maker'];
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  var CARDS = [
    { id: 'POWER_ON', how: '엄지와 검지 끝을 맞대 동그라미를 만들고, 나머지 세 손가락은 편다.', act: '프로펠러가 돌고 이륙 대기 상태가 된다.', miss: '엄지와 검지가 덜 닿으면 손바닥 정면(명령 없음)으로 판정된다. 동그라미를 확실하게.' },
    { id: 'UP', how: '주먹을 쥐고 엄지만 위로 세운다.', act: '유지하는 동안 초속 1.5m로 상승한다.', miss: '엄지를 옆으로 눕히면 인식되지 않는다. 수직에서 ±45° 안쪽을 유지.' },
    { id: 'DOWN', how: '주먹을 쥐고 엄지만 아래로 향한다.', act: '유지하는 동안 하강하고, 지면에 닿으면 멈춘다.', miss: '손가락이 풀리면 손바닥 아래(전원 끄기)와 섞인다. 나머지 손가락은 꽉 쥔다.' },
    { id: 'LEFT', how: '검지만 펴서 내 왼쪽을 가리킨다. 손등이 카메라를 향해도 된다.', act: '초속 2m로 왼쪽으로 이동한다.', miss: '중지가 같이 펴지면 판정 불가. 화면은 거울처럼 보이므로 내 기준 왼쪽을 가리키면 된다.' },
    { id: 'RIGHT', how: '검지만 펴서 내 오른쪽을 가리킨다.', act: '초속 2m로 오른쪽으로 이동한다.', miss: '검지가 위로 들리면(수직에 가까우면) 판정 불가. 수평으로 가리킨다.' },
    { id: 'POWER_OFF', how: '다섯 손가락을 펴고 손바닥이 바닥을 향하도록 손을 수평으로 눕힌다.', act: '지상에서는 전원 차단. 공중이면 자동 착륙한 뒤 전원을 끈다.', miss: '손을 세우면 손바닥 정면(명령 없음)으로 판정된다. 비행 중 사용은 실수로 기록된다.' },
    { id: 'HOVER', how: '손을 카메라 화면 밖으로 뺀다. 애매한 손 모양도 정지로 처리된다.', act: '그 자리에 멈춰 호버링한다.', miss: '명령과 명령 사이에는 손을 빼는 습관이 가장 안전하다.' }
  ];

  /* ── 라우팅 ───────────────────────── */
  function route() {
    var r = (location.hash || '#intro').slice(1);
    if (ROUTES.indexOf(r) < 0) r = 'intro';
    document.querySelectorAll('.page').forEach(function (p) { p.hidden = p.dataset.page !== r; });
    document.querySelectorAll('.nav a').forEach(function (a) { a.classList.toggle('on', a.dataset.route === r); if (a.dataset.route === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    MCSim.setVisible(r === 'sim');
    if (r === 'setup') envCheck();
    if (r === 'review') loadReview();
    var navOn = document.querySelector('.nav a.on'); if (navOn && navOn.scrollIntoView) navOn.scrollIntoView({ block: 'nearest', inline: 'center' });
    window.scrollTo(0, 0);
  }

  /* ── 수신호 카드 ───────────────────── */
  function cardHTML(c) {
    var inf = INFO[c.id];
    var hold = inf.hold ? inf.hold.toFixed(1) + '초 유지' : '즉시';
    return '<article class="g-card" data-g="' + c.id + '">' +
      '<div class="g-fig">' + MCHand.svg(c.id, 112) + '</div>' +
      '<div class="g-body"><p class="g-top"><b>' + inf.ko + '</b><span class="pill">' + hold + '</span></p>' +
      '<p class="g-sign">' + inf.sign + '</p>' +
      '<dl><dt>동작</dt><dd>' + c.how + '</dd><dt>드론</dt><dd>' + c.act + '</dd><dt>주의</dt><dd>' + c.miss + '</dd></dl></div></article>';
  }
  function renderCards() {
    $('gestureCards').innerHTML = CARDS.map(cardHTML).join('');
    $('heroSignals').innerHTML = CARDS.map(function (c) {
      return '<div class="sig"><span class="sig-fig">' + MCHand.svg(c.id, 64) + '</span><b>' + INFO[c.id].ko + '</b><small>' + INFO[c.id].sign + '</small></div>';
    }).join('');
    $('lmFigure').innerHTML = MCHand.landmarkFigure();
  }

  /* ── 매뉴얼 (인쇄 → PDF) ──────────── */
  function buildManual() {
    var d = new Date();
    $('manualPrint').innerHTML =
      '<header class="m-head"><img src="assets/emblem-army-tiger-mark.jpg" alt="" width="40" height="40"><div><h1>MotionCommand 조작 매뉴얼</h1><p>제스처 기반 드론 통제 훈련체계 · 수신호 7종 · ' + d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate() + ' 출력</p></div></header>' +
      '<section><h2>시작 전 점검</h2><ol><li>크롬 또는 엣지 최신 버전으로 HTTPS 주소에 접속</li><li>주소창 자물쇠 아이콘 → 카메라 <b>허용</b></li><li>환경설정 화면에서 7개 항목 정상 확인</li><li>카메라에서 50cm~1m, 손은 가슴 높이, 역광 피하기</li></ol></section>' +
      '<section><h2>수신호 7종</h2><div class="m-grid">' + CARDS.map(cardHTML).join('') + '</div></section>' +
      '<section><h2>안전 규칙</h2><ul><li>애매하면 항상 정지(호버링)</li><li>전원이 꺼져 있으면 OK 외 명령 무시</li><li>공중에서 전원 끄기 → 자동 착륙 후 차단, 훈련에서는 실수로 기록</li><li>두 손이 보이면 먼저 잡힌 손만 인식</li></ul></section>' +
      '<footer>연구·교육용 시제품 · 문의 seouljade@kma.ac.kr</footer>';
  }

  /* ── 환경 점검 ─────────────────────── */
  function setEnv(k, state, text) {
    var li = document.querySelector('#envList [data-k="' + k + '"]');
    if (!li) return;
    li.className = state; li.querySelector('em').textContent = text;
  }
  function browserName() {
    var u = navigator.userAgent;
    if (/Edg\//.test(u)) return ['엣지', 'ok'];
    if (/Whale\//.test(u)) return ['웨일', 'ok'];
    if (/SamsungBrowser/.test(u)) return ['삼성 인터넷', 'ok'];
    if (/Chrome\//.test(u)) return ['크롬', 'ok'];
    if (/Firefox\//.test(u)) return ['파이어폭스 (크롬·엣지 권장)', 'warn'];
    if (/Safari\//.test(u)) return ['사파리 (크롬·엣지 권장)', 'warn'];
    return ['알 수 없음 (크롬·엣지 권장)', 'warn'];
  }
  function envCheck() {
    var b = browserName(); setEnv('browser', b[1], b[0]);
    setEnv('secure', window.isSecureContext ? 'ok' : 'bad', window.isSecureContext ? '정상' : 'HTTPS 아님 — 카메라 사용 불가');
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then(function (ds) {
        var n = ds.filter(function (d) { return d.kind === 'videoinput'; }).length;
        setEnv('device', n ? 'ok' : 'bad', n ? n + '대 감지됨' : '카메라 없음 — 수동 입력으로 체험 가능');
      }).catch(function () { setEnv('device', 'warn', '확인 불가'); });
    } else setEnv('device', 'bad', '지원되지 않음');
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'camera' }).then(function (p) {
        var map = { granted: ['ok', '허용됨'], denied: ['bad', '차단됨 — 아래 안내대로 허용'], prompt: ['warn', '아직 묻지 않음 (켜면 허용 창이 뜸)'] };
        var m = map[p.state] || ['warn', p.state]; setEnv('perm', m[0], m[1]);
        p.onchange = envCheck;
      }).catch(function () { setEnv('perm', MCSim.cam.on ? 'ok' : 'warn', MCSim.cam.on ? '허용됨' : '카메라를 켜면 확인됩니다'); });
    } else setEnv('perm', MCSim.cam.on ? 'ok' : 'warn', MCSim.cam.on ? '허용됨' : '카메라를 켜면 확인됩니다');
    var c = MCSim.cam;
    setEnv('stream', c.on ? 'ok' : (c.err ? 'bad' : ''), c.on ? '켜짐' : (c.err || '꺼짐'));
    var mm = { idle: ['', '카메라를 켜면 불러옵니다'], loading: ['warn', '불러오는 중… (처음 한 번, 약 10MB)'], ready: ['ok', '준비 완료'], error: ['bad', '불러오기 실패 — 인터넷 확인'] }[c.model];
    setEnv('model', mm[0], mm[1]);
    setEnv('store', MCStore.mode === 'supabase' ? 'ok' : 'warn', MCStore.mode === 'supabase' ? '공유 저장소(Supabase) 연결' : '이 기기에 저장 (공유 저장소 미설정)');
    $('envCamMsg').hidden = c.on;
    $('envCamMsg').textContent = c.err || '카메라가 꺼져 있습니다';
  }

  /* ── 상태 표시줄 ───────────────────── */
  function chip(k, state, text) {
    var el = document.querySelector('#statusBar [data-k="' + k + '"]');
    if (!el) return; el.className = 'chip ' + state + (k === 'mission' ? ' mission-chip' : '');
    el.lastChild.textContent = text;
  }
  function status() {
    var c = MCSim.cam, S = MCSim.state, m = MCSim.mission;
    chip('cam', c.on ? 'ok' : (c.err ? 'bad' : ''), c.on ? '카메라 켜짐' : '카메라 꺼짐');
    chip('model', { idle: '', loading: 'warn', ready: 'ok', error: 'bad' }[c.model], { idle: 'AI 모델 대기', loading: 'AI 모델 로딩', ready: 'AI 모델 준비', error: 'AI 모델 오류' }[c.model]);
    chip('input', c.on && c.model === 'ready' ? 'ok' : '', c.on && c.model === 'ready' ? '입력: 카메라 + 수동' : '입력: 수동(버튼·키보드)');
    chip('power', S.power ? 'ok' : '', S.power ? '드론 전원 켜짐' : '드론 전원 꺼짐');
    chip('store', MCStore.mode === 'supabase' ? 'ok' : 'warn', MCStore.mode === 'supabase' ? '저장: 공유' : '저장: 이 기기');
    chip('mission', m && m.running ? 'warn' : '', m && m.running ? m.def.title + ' 진행 중' : '자유비행');
    $('camEmpty').hidden = c.on;
    $('btnCam').textContent = c.on ? '카메라 켜짐' : '카메라 켜기';
    $('btnCam').disabled = c.on;
    $('btnStart').disabled = !!(m && m.running);
    $('btnStop').disabled = !(m && m.running);
    if (location.hash === '#setup') envCheck();
  }

  /* ── 훈련 설정 ─────────────────────── */
  var RANKS = ['이병', '일병', '상병', '병장', '하사', '중사', '상사', '원사', '준위', '소위', '중위', '대위', '소령', '중령', '대령', '군무원', '생도', '기타'];
  function setupForm() {
    $('fRank').innerHTML = RANKS.map(function (r) { return '<option>' + r + '</option>'; }).join('');
    $('fRank').value = ls('mc.rank') || '중위';
    $('fName').value = ls('mc.name') || '';
    var M = MCSim.MISSIONS;
    $('fMission').innerHTML = ['M1', 'M2', 'M3', 'M4', 'FREE'].map(function (k) { return '<option value="' + k + '">' + M[k].title + (M[k].limit ? ' · ' + M[k].limit + '초' : '') + '</option>'; }).join('');
    $('fMission').value = ls('mc.mission') || 'M1';
    var desc = function () { $('missionDesc').textContent = M[$('fMission').value].desc; ls('mc.mission', $('fMission').value); };
    $('fMission').addEventListener('change', desc); desc();
    $('fRank').addEventListener('change', function () { ls('mc.rank', $('fRank').value); });
    $('fName').addEventListener('input', function () { ls('mc.name', $('fName').value.trim()); $('fName').classList.remove('invalid'); });

    $('btnStart').addEventListener('click', function () {
      var code = $('fMission').value, name = $('fName').value.trim();
      if (code !== 'FREE' && !name) { $('fName').classList.add('invalid'); $('fName').focus(); $('missionDesc').textContent = '기록을 남기려면 이름 또는 훈련번호를 입력하세요.'; return; }
      $('resultCard').hidden = true;
      MCSim.startMission(code, { rank: $('fRank').value, name: name });
      status();
    });
    $('btnStop').addEventListener('click', function () { MCSim.stopMission('중단'); });
    $('btnReset').addEventListener('click', function () { MCSim.resetDrone(); $('resultCard').hidden = true; status(); });
    $('btnCam').addEventListener('click', function () { MCSim.startCamera().then(status); });
    $('btnEnvCam').addEventListener('click', function () { MCSim.startCamera().then(envCheck); });
    $('btnEnvRefresh').addEventListener('click', envCheck);
    $('fThr').addEventListener('input', function () { var v = +$('fThr').value; $('oThr').textContent = v.toFixed(2); MCSim.setThreshold(v); });
    $('fHold').addEventListener('input', function () { var v = +$('fHold').value; $('oHold').textContent = v.toFixed(1) + '×'; MCSim.setHoldScale(v); });
  }

  /* ── 결과 카드 ─────────────────────── */
  function showResult(ev, saved) {
    var a = ev.attempt, b = ev.breakdown, pass = a.score >= 80;
    var h = MCReview.habits([a]);
    var where = saved.where === 'supabase' ? '공유 저장소에 저장됨' : saved.where === 'local-fallback' ? '공유 저장소 연결 실패 — 이 기기에 임시 저장됨' : '이 기기에 저장됨';
    $('resultCard').innerHTML =
      '<div class="res-score ' + (pass ? 'ok' : 'bad') + '"><span>' + (MCReview.MNAME[a.mission] || a.mission) + '</span><b>' + a.score + '<small>점</small></b><em>' + (pass ? '합격' : a.success ? '성공 · 합격 미달' : ev.reason) + '</em></div>' +
      '<div class="res-body"><div class="res-break">' +
      '<div><span>과제 수행</span><b>' + b.base + ' / 60</b><small>' + b.stepsDone + '/' + b.steps + ' 단계</small></div>' +
      '<div><span>소요 시간</span><b>' + b.time + ' / 20</b><small>' + a.duration_s + '초</small></div>' +
      '<div><span>정확도</span><b>' + b.accuracy + ' / 20</b><small>실수 ' + (a.e1 + a.e2 + a.e3 + a.e4 + a.e6) + '건</small></div></div>' +
      (h.length ? '<ul class="res-tips">' + h.map(function (x) { return '<li><b>' + x.label + ' ' + x.n + '회</b> ' + x.tip + '</li>'; }).join('') + '</ul>' : '<p class="res-tips">실수 없이 마쳤습니다.</p>') +
      '<p class="small">' + a.rank + ' ' + a.name + ' · ' + where + '</p>' +
      '<div class="btn-row"><button class="btn btn-primary" type="button" id="btnAgain">다시 하기</button><a class="btn" href="#review">사후검토 보기</a></div></div>';
    $('resultCard').hidden = false;
    $('btnAgain').addEventListener('click', function () { $('btnStart').click(); });
    $('resultCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ── 사후검토 ─────────────────────── */
  var RV = { rows: [], sample: false, tab: 'me', pick: null };
  function loadReview() {
    $('storeNote').textContent = MCStore.mode === 'supabase' ? '공유 저장소(Supabase)의 모든 훈련 기록을 불러옵니다. 다른 기기에서 한 훈련도 함께 보입니다.' : '기록은 이 기기의 브라우저에 저장됩니다. 교관에게 제출하려면 CSV로 내보내세요. 교관은 여러 사람의 CSV를 가져와 한 번에 볼 수 있습니다.';
    MCStore.list().then(function (rows) { RV.rows = rows; renderReview(); });
  }
  function currentRows() { return RV.sample ? MCReview.sampleRows() : RV.rows; }
  function renderReview() {
    var rows = currentRows().slice().sort(function (a, b) { return new Date(a.created_at) - new Date(b.created_at); });
    $('sampleFlag').hidden = !RV.sample;
    var names = []; rows.forEach(function (r) { var k = MCReview.key(r); if (names.indexOf(k) < 0) names.push(k); });
    var me = ($('fRank').value + ' ' + ($('fName').value || '').trim());
    if (!RV.pick || names.indexOf(RV.pick) < 0) RV.pick = names.indexOf(me) >= 0 ? me : names[0] || null;
    $('fTrainee').innerHTML = names.length ? names.map(function (n) { return '<option' + (n === RV.pick ? ' selected' : '') + '>' + n.replace(/</g, '&lt;') + '</option>'; }).join('') : '<option>기록 없음</option>';
    $('fTrainee').disabled = !names.length;
    $('tabMe').setAttribute('aria-selected', RV.tab === 'me'); $('tabAll').setAttribute('aria-selected', RV.tab === 'all');
    $('reviewMe').hidden = RV.tab !== 'me'; $('reviewAll').hidden = RV.tab !== 'all';
    $('pickWrap').hidden = RV.tab !== 'me';
    if (RV.tab === 'me') MCReview.renderMe(rows.filter(function (r) { return MCReview.key(r) === RV.pick; }));
    else MCReview.renderAll(rows, function (n) { RV.pick = n; RV.tab = 'me'; renderReview(); });
  }
  function setupReview() {
    $('tabMe').addEventListener('click', function () { RV.tab = 'me'; renderReview(); });
    $('tabAll').addEventListener('click', function () { RV.tab = 'all'; renderReview(); });
    $('fTrainee').addEventListener('change', function () { RV.pick = $('fTrainee').value; renderReview(); });
    $('btnRefresh').addEventListener('click', loadReview);
    $('btnSample').addEventListener('click', function () { RV.sample = true; RV.pick = null; renderReview(); });
    $('btnSampleOff').addEventListener('click', function () { RV.sample = false; RV.pick = null; renderReview(); });
    $('btnCsv').addEventListener('click', function () {
      var rows = currentRows();
      if (!rows.length) { $('storeNote').textContent = '내보낼 기록이 없습니다.'; return; }
      var blob = new Blob([MCStore.toCSV(rows)], { type: 'text/csv;charset=utf-8' });
      var a = document.createElement('a'); var d = new Date();
      a.href = URL.createObjectURL(blob);
      a.download = 'MotionCommand_훈련기록_' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + (RV.sample ? '_예시' : '') + '.csv';
      document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    });
    $('fCsv').addEventListener('change', function (e) {
      var f = e.target.files && e.target.files[0]; if (!f) return;
      var r = new FileReader();
      r.onload = function () {
        var rows = MCStore.parseCSV(String(r.result));
        var n = MCStore.importRows(rows);
        $('storeNote').textContent = 'CSV에서 ' + rows.length + '건을 읽어 새 기록 ' + n + '건을 추가했습니다.';
        RV.sample = false; RV.tab = 'all';
        MCStore.list().then(function (all) { RV.rows = all; renderReview(); });
      };
      r.readAsText(f, 'utf-8'); e.target.value = '';
    });
  }

  /* ── 기타 ─────────────────────────── */
  function setupMisc() {
    $('btnManual').addEventListener('click', function () { buildManual(); window.print(); });
    $('btnCopyMail').addEventListener('click', function () {
      var t = $('mailText').textContent, btn = $('btnCopyMail');
      var done = function () { btn.textContent = '복사됨'; setTimeout(function () { btn.textContent = '주소 복사'; }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(done).catch(sel); else sel();
      function sel() { var r = document.createRange(); r.selectNodeContents($('mailText')); var s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    });
    document.querySelectorAll('[data-jump]').forEach(function (a) {
      a.addEventListener('click', function (e) { e.preventDefault(); var t = $(a.dataset.jump); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    });
  }

  /* ── 시작 ─────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    MCStore.init();
    renderCards();
    MCSim.init();
    setupForm(); setupReview(); setupMisc();
    MCSim.on('status', status);
    MCSim.on('finish', function (ev) {
      MCStore.add(ev.attempt).then(function (saved) { showResult(ev, saved); RV.rows.push(saved.row); });
    });
    setInterval(status, 1000);
    window.addEventListener('hashchange', route);
    route(); status();
  });
})();
