/* MotionCommand 앱: 화면 전환, 환경 점검, 훈련 연결, 사후검토, 매뉴얼 */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var INFO = MCGesture.INFO;
  var ROUTES = ['intro', 'setup', 'sim', 'review', 'learn', 'maker'];
  var pendingJump = null; // 다른 화면으로 이동한 뒤 스크롤할 구역 id
  function ls(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } }

  var CARDS = [
    { id: 'POWER_ON', how: '엄지와 검지 끝을 맞대 동그라미를 만들고, 나머지 세 손가락은 편다.', act: '프로펠러가 돌고 이륙 대기 상태가 된다.', miss: '엄지와 검지가 덜 닿으면 손바닥 정면(명령 없음)으로 판정된다. 동그라미를 확실하게.' },
    { id: 'UP', how: '주먹을 쥐고 엄지만 위로 세운다.', act: '유지하는 동안 초속 1.5m로 상승한다.', miss: '엄지를 옆으로 눕히면 인식되지 않는다. 수직에서 ±45° 안쪽을 유지.' },
    { id: 'DOWN', how: '주먹을 쥐고 엄지만 아래로 향한다.', act: '유지하는 동안 하강하고, 지면에 닿으면 멈춘다.', miss: '손가락이 풀리면 손바닥 아래(전원 끄기)와 섞인다. 나머지 손가락은 꽉 쥔다.' },
    { id: 'LEFT', how: '검지만 펴서 내 왼쪽을 가리킨다. 손등이 카메라를 향해도 된다.', act: '초속 2m로 왼쪽으로 이동한다.', miss: '중지가 같이 펴지면 판정 불가. 화면은 거울처럼 보이므로 내 기준 왼쪽을 가리키면 된다.' },
    { id: 'RIGHT', how: '검지만 펴서 내 오른쪽을 가리킨다.', act: '초속 2m로 오른쪽으로 이동한다.', miss: '검지가 위로 들리면(수직에 가까우면) 전진으로 인식된다. 수평으로 가리킨다.' },
    { id: 'FORWARD', how: '검지 하나만 위로 세운다 (숫자 1). 나머지 손가락과 엄지는 접는다.', act: '유지하는 동안 앞(화면 안쪽)으로 초속 2m 이동한다. 공중에서만 동작.', miss: '검지를 옆으로 기울이면 좌·우 이동으로 인식된다. 손가락을 똑바로 세운다.' },
    { id: 'BACK', how: '검지와 중지를 위로 세운다 (숫자 2, V). 약지·소지·엄지는 접는다.', act: '유지하는 동안 뒤(조종자 쪽)로 초속 2m 이동한다. 공중에서만 동작.', miss: '약지가 같이 펴지면 판정 불가가 된다. 두 손가락만 세운다.' },
    { id: 'POWER_OFF', how: '다섯 손가락을 펴고 손바닥이 바닥을 향하도록 손을 수평으로 눕힌다.', act: '지상에서는 전원 차단. 공중이면 자동 착륙한 뒤 전원을 끈다.', miss: '손을 세우면 손바닥 정면(명령 없음)으로 판정된다. 비행 중 사용은 실수로 기록된다.' },
    { id: 'HOVER', how: '손을 카메라 화면 밖으로 뺀다. 화면에는 "준비 중"으로 표시된다. 애매한 손 모양도 정지로 처리된다.', act: '그 자리에 멈춰 호버링한다.', miss: '명령과 명령 사이에는 손을 빼는 습관이 가장 안전하다.' }
  ];

  /* ── 라우팅 ───────────────────────── */
  function route() {
    var r = (location.hash || '#intro').slice(1);
    if (ROUTES.indexOf(r) < 0) r = 'intro';
    // 미션 중 다른 화면으로 가면 중단으로 저장해 기록이 사라지지 않게 한다
    if (r !== 'sim' && MCSim.mission && MCSim.mission.running) MCSim.stopMission('화면 이동');
    document.querySelectorAll('.page').forEach(function (p) { p.hidden = p.dataset.page !== r; });
    document.querySelectorAll('.nav a').forEach(function (a) { a.classList.toggle('on', a.dataset.route === r); if (a.dataset.route === r) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    MCSim.setVisible(r === 'sim');
    if (r === 'setup') envCheck();
    if (r === 'review') loadReview();
    var navOn = document.querySelector('.nav a.on'); if (navOn && navOn.scrollIntoView) navOn.scrollIntoView({ block: 'nearest', inline: 'center' });
    var jt = pendingJump && $(pendingJump); pendingJump = null;
    if (jt) jt.scrollIntoView({ block: 'start' }); else window.scrollTo(0, 0);
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
  function printDate() { var d = new Date(); return d.getFullYear() + '.' + (d.getMonth() + 1) + '.' + d.getDate(); }
  function manualHead(title, sub) {
    return '<header class="m-head"><img src="assets/emblem-army-tiger-mark.jpg" alt="" width="40" height="40"><div><h1>' + title + '</h1><p>' + sub + ' · ' + printDate() + ' 출력</p></div></header>';
  }
  var MANUAL_FOOT = '<footer>MotionCommand · https://motioncommand.vercel.app · 연구·교육용 시제품이며 실제 드론과 연동되어 있지 않습니다 · 문의 seouljade@kma.ac.kr</footer>';
  function mRow(cells) { return '<tr>' + cells.map(function (c) { return '<td>' + c + '</td>'; }).join('') + '</tr>'; }
  function mTable(head, rows) { return '<table class="m-table"><thead><tr>' + head.map(function (h) { return '<th>' + h + '</th>'; }).join('') + '</tr></thead><tbody>' + rows.map(mRow).join('') + '</tbody></table>'; }

  // 수신호 매뉴얼: 수신호 카드 + 점검 + 안전 규칙
  function buildManual() {
    $('manualPrint').innerHTML =
      manualHead('MotionCommand 수신호 매뉴얼', '제스처 기반 드론 통제 훈련체계 · 수신호 ' + CARDS.length + '종') +
      '<section><h2>시작 전 점검</h2><ol><li>크롬 또는 엣지 최신 버전으로 HTTPS 주소에 접속</li><li>주소창 자물쇠 아이콘 → 카메라 <b>허용</b></li><li>환경설정 화면에서 7개 점검 항목 정상 확인</li><li>카메라에서 50cm~1m, 손은 가슴 높이, 역광 피하기</li></ol></section>' +
      '<section><h2>수신호 ' + CARDS.length + '종</h2><div class="m-grid">' + CARDS.map(cardHTML).join('') + '</div></section>' +
      '<section><h2>안전 규칙</h2><ul><li>손이 보이지 않으면 화면에 "준비 중"으로 표시되고 드론은 제자리에 멈춘다</li><li>애매한 손 모양은 항상 정지(호버링)로 처리한다</li><li>전원이 꺼져 있으면 OK 외 명령은 무시한다</li><li>공중에서 전원 끄기 → 자동 착륙 후 차단, 훈련에서는 실수로 기록</li><li>이동(상승·하강·좌우·전진·후진)은 손 모양을 유지하는 동안만 움직인다</li><li>두 손이 보이면 먼저 잡힌 손만 인식한다</li></ul></section>' +
      MANUAL_FOOT;
  }

  // 체계 활용 매뉴얼: 훈련자·교관이 체계를 처음부터 끝까지 쓰는 절차
  function buildGuide() {
    var M = MCSim.MISSIONS, E = MCReview.ERR;
    $('manualPrint').innerHTML =
      manualHead('MotionCommand 체계 활용 매뉴얼', '훈련자·교관용 운용 절차') +
      '<section><h2>1. 체계 개요</h2><p>MotionCommand는 카메라로 손 수신호를 인식해 드론을 조종하는 방식을 <b>실기체 없이 3D 시뮬레이션으로 훈련</b>하고, 훈련 기록을 교관이 <b>사후검토</b>하는 웹 기반 교육훈련 도구입니다. 별도 설치 없이 PC·스마트폰 브라우저로 접속합니다. <b>실제 드론과 연동되어 있지 않습니다.</b></p></section>' +
      '<section><h2>2. 화면 구성</h2>' + mTable(['메뉴', '용도'], [
        ['① 체계 소개', 'Army TIGER+ 연계, 조종기 대비 장단점, 발전 단계'],
        ['② 환경설정·조작법', '카메라·권한·AI 모델·저장소 자동 점검, 수신호 카드, 매뉴얼 출력'],
        ['③ 조작 시뮬레이션', '카메라 손 인식으로 3D 드론 조종, 훈련 미션 수행·채점'],
        ['④ 사후검토·재생', '개인 점수·습관 분석, <b>회차 재생</b>(3D 궤적·당시 수신호), 교관 전체 현황·CSV'],
        ['⑤ 관련 정보', '포즈 추정·MediaPipe 이론, 드론 기본 지식, 관련 법령'],
        ['⑥ 제작자 정보', '제작자 소개, 논문, 문의처']]) + '</section>' +
      '<section><h2>3. 준비</h2><ol><li>크롬 또는 엣지로 https://motioncommand.vercel.app 접속 (카메라는 HTTPS에서만 동작)</li><li>② 환경설정에서 <b>카메라 켜기</b> → 브라우저 권한 창에서 <b>허용</b></li><li>7개 점검 항목이 초록색인지 확인 (AI 모델은 처음 한 번 약 10MB 내려받음)</li><li>화상회의 등 다른 앱이 카메라를 쓰고 있으면 종료</li><li>카메라에서 50cm~1m, 손은 가슴 높이, 밝은 곳·역광 피하기</li></ol></section>' +
      '<section><h2>4. 훈련 절차</h2><ol><li>③ 조작 시뮬레이션 → <b>계급</b>과 <b>이름(또는 훈련번호)</b> 입력 (군번·소속은 입력하지 않음)</li><li>과제 선택: 처음에는 <b>자유비행</b>으로 수신호를 익히고, 이후 M1부터 순서대로</li><li><b>훈련 시작</b> → 화면 오른쪽 지시문과 단계 목록을 따라 수행</li><li>과제를 마치면 자동으로 채점·저장되고 결과 창이 뜸 → <b>이 회차 다시 보기</b>로 바로 재생</li><li>중간에 그만둘 때는 <b>중단</b>. 미션 중 다른 화면으로 가면 "화면 이동"으로 중단·저장됨</li></ol>' +
        '<p><b>카메라가 없을 때(백업 입력):</b> 화면 버튼이나 키보드를 누르고 있으면 같은 명령이 됩니다.</p>' +
        mTable(['명령', '키', '명령', '키'], [['전원 켜기', 'P', '전원 끄기', 'O'], ['상승 / 하강', '↑ / ↓', '좌측 / 우측 이동', '← / →'], ['전진', 'W', '후진', 'S']]) + '</section>' +
      '<section><h2>5. 훈련 미션과 채점</h2>' + mTable(['미션', '제한', '내용'], ['M1', 'M2', 'M3', 'M4', 'M5'].map(function (k) {
        return [M[k].title, M[k].limit + '초', M[k].desc.replace(/ ?제한 \d+초\.?/, '')];
      })) +
        '<p><b>점수(100점):</b> 과제 성공 60(실패 시 완료한 단계 비율로 최대 30) + 소요 시간 20(성공 시, 빠를수록 높음) + 정확도 20(실수 1회당 −2점, 유지 시간 미달은 3회당 −2점). <b>80점 이상 합격.</b></p>' +
        mTable(['실수 코드', '내용', '교정 방법'], Object.keys(E).map(function (k) { return [k.toUpperCase(), E[k].ko, E[k].tip]; })) + '</section>' +
      '<section><h2>6. 사후검토와 회차 재생</h2><ul><li><b>개인 탭:</b> 훈련자를 고르면 점수 추이, 과제별 성공률, 잘못된 습관 Top 3와 교정 방법, 회차별 기록</li><li><b>회차 재생 탭:</b> 전체 회차 목록에서 <b>▶ 다시 보기</b> → 3D 비행 궤적, 그때 인식된 수신호, 과제 단계, 이벤트(수신호 확정·실수·단계 완료)를 재생. 배속(0.5~4×), 시간 막대, 타임라인을 눌러 원하는 시점으로 이동. 실수 지점은 빨간 점</li><li><b>교관 탭:</b> 훈련자 전체 현황, 실수 유형 분포, 과제별 평균 점수, 훈련자별 <b>상세</b> 보기</li><li><b>CSV 내보내기·가져오기:</b> 공유 저장소를 쓸 수 없는 환경에서는 훈련자가 CSV로 제출하고 교관이 모아서 가져옴 (재생 기록은 CSV에 포함되지 않음)</li><li><b>예시 기록 보기:</b> 시연용 가상 기록. 켜져 있는 동안 실제 기록은 보이지 않으므로 다 본 뒤 <b>예시 끄기</b></li></ul></section>' +
      '<section><h2>7. 교관 운용 절차 (권장)</h2><ol><li><b>사전 교육(10분):</b> ① 체계 소개와 수신호 매뉴얼로 ' + CARDS.length + '종 설명, 안전 규칙 강조</li><li><b>시범(5분):</b> 교관이 자유비행과 M1을 시연하고 회차 재생으로 결과 보는 법 안내</li><li><b>개인 훈련(20~30분):</b> M1 → M2 → M5 → M3 → M4 순으로 수행, 80점 이상이면 다음 과제</li><li><b>사후검토(10분):</b> 교관 탭에서 실수 분포 확인 → 실수가 많은 훈련자의 회차를 재생해 함께 교정</li><li><b>기록 보관:</b> 교관 탭에서 CSV 내보내기</li></ol></section>' +
      '<section><h2>8. 문제 해결</h2>' + mTable(['증상', '조치'], [
        ['카메라가 켜지지 않음', '주소창 자물쇠 → 카메라 허용 후 새로고침. 다른 앱의 카메라 사용 종료'],
        ['손을 인식하지 못함', '조명을 밝게, 역광 피하기, 손을 가슴 높이·화면 가운데에. 환경설정에서 신뢰도 임계값 조정'],
        ['인식 칸이 계속 "준비 중"', '손이 화면 밖에 있거나 너무 가까움. 50cm~1m 거리 유지'],
        ['내 기록이 안 보임', '예시 기록이 켜져 있으면 끄기, 훈련자 선택 확인, 새로고침'],
        ['"새 버전이 배포되었습니다" 안내', '새로고침 버튼을 눌러 최신 버전 적용'],
        ['"재생 데이터 없음"', '재생 기능 추가(v1.8) 전 회차이거나 CSV로 가져온 기록']]) + '</section>' +
      '<section><h2>9. 개인정보·보안</h2><ul><li>카메라 영상은 기기 안에서만 처리하며 전송·저장하지 않습니다. 따라서 회차 재생에도 영상은 없습니다.</li><li>저장 정보: 계급, 이름(또는 훈련번호), 점수, 실수 횟수, 비행 궤적·인식된 수신호</li><li>기록 저장소는 외부 클라우드(Supabase)입니다. 부대 규정에 따라 보안 담당 검토 후 사용하십시오.</li></ul></section>' +
      MANUAL_FOOT;
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
    $('fMission').innerHTML = ['M1', 'M2', 'M3', 'M4', 'M5', 'FREE'].map(function (k) { return '<option value="' + k + '">' + M[k].title + (M[k].limit ? ' · ' + M[k].limit + '초' : '') + '</option>'; }).join('');
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
      '<div class="btn-row"><button class="btn btn-primary" type="button" id="btnAgain">다시 하기</button>' + (saved.row.track ? '<button class="btn" type="button" id="btnResReplay">▶ 이 회차 다시 보기</button>' : '') + '<a class="btn" href="#review" id="btnResReview">사후검토 보기</a></div></div>';
    $('resultCard').hidden = false;
    $('btnAgain').addEventListener('click', function () { $('btnStart').click(); });
    if ($('btnResReplay')) $('btnResReplay').addEventListener('click', function () { openReplay(saved.row, null); });
    $('btnResReview').addEventListener('click', function () { RV.tab = 'me'; });
    $('resultCard').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  /* ── 사후검토 ─────────────────────── */
  var RV = { rows: [], sample: false, tab: 'me', pick: null, who: '' };
  function openReplay(r, num) { MCReplay.open(r, num, MCStore.getTrack(r)); }
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
    $('tabMe').setAttribute('aria-selected', RV.tab === 'me'); $('tabAll').setAttribute('aria-selected', RV.tab === 'all'); $('tabReplay').setAttribute('aria-selected', RV.tab === 'replay');
    $('reviewMe').hidden = RV.tab !== 'me'; $('reviewAll').hidden = RV.tab !== 'all'; $('reviewReplay').hidden = RV.tab !== 'replay';
    $('pickWrap').hidden = RV.tab !== 'me';
    if (RV.tab === 'me') MCReview.renderMe(rows.filter(function (r) { return MCReview.key(r) === RV.pick; }), openReplay);
    else if (RV.tab === 'replay') MCReview.renderReplayList(rows, RV.who, openReplay);
    else MCReview.renderAll(rows, function (n) { RV.pick = n; RV.tab = 'me'; renderReview(); });
  }
  function setupReview() {
    $('tabMe').addEventListener('click', function () { RV.tab = 'me'; renderReview(); });
    $('tabAll').addEventListener('click', function () { RV.tab = 'all'; renderReview(); });
    $('tabReplay').addEventListener('click', function () { RV.tab = 'replay'; renderReview(); });
    $('fReplayWho').addEventListener('change', function () { RV.who = $('fReplayWho').value; renderReview(); });
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
    $('btnGuide').addEventListener('click', function () { buildGuide(); window.print(); });
    $('btnCopyMail').addEventListener('click', function () {
      var t = $('mailText').textContent, btn = $('btnCopyMail');
      var done = function () { btn.textContent = '복사됨'; setTimeout(function () { btn.textContent = '주소 복사'; }, 1500); };
      if (navigator.clipboard) navigator.clipboard.writeText(t).then(done).catch(sel); else sel();
      function sel() { var r = document.createRange(); r.selectNodeContents($('mailText')); var s = getSelection(); s.removeAllRanges(); s.addRange(r); }
    });
    document.querySelectorAll('[data-jump]').forEach(function (a) {
      a.addEventListener('click', function (e) {
        e.preventDefault();
        if (a.hash && a.hash !== location.hash) { pendingJump = a.dataset.jump; location.hash = a.hash; return; }
        var t = $(a.dataset.jump); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });
  }

  /* ── 새 버전 알림 ─────────────────── */
  // 배포 후에도 열려 있던 화면은 예전 코드로 동작하므로, 새 버전이 있으면 새로고침을 안내한다
  function setupVersionCheck() {
    var meta = document.querySelector('meta[name="mc-version"]'); if (!meta || !window.fetch) return;
    var cur = meta.content;
    var check = function () {
      fetch(location.pathname + '?vc=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.text(); }).then(function (t) {
        var m = t.match(/name="mc-version" content="([^"]+)"/);
        if (m && m[1] !== cur) $('updateBar').hidden = false;
      }).catch(function () {});
    };
    $('btnUpdate').addEventListener('click', function () { location.reload(); });
    setInterval(check, 5 * 60 * 1000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') check(); });
  }

  /* ── 시작 ─────────────────────────── */
  document.addEventListener('DOMContentLoaded', function () {
    MCStore.init();
    renderCards();
    MCSim.init();
    setupForm(); setupReview(); setupMisc();
    MCSim.on('status', status);
    MCSim.on('finish', function (ev) {
      MCStore.add(ev.attempt).then(function (saved) {
        showResult(ev, saved);
        // 방금 한 훈련이 바로 보이도록 예시 모드를 끄고 본인을 선택
        RV.sample = false; RV.pick = MCReview.key(saved.row);
        if (location.hash === '#review') loadReview(); else RV.rows.push(saved.row);
      });
    });
    setupVersionCheck();
    setInterval(status, 1000);
    window.addEventListener('hashchange', route);
    route(); status();
  });
})();
