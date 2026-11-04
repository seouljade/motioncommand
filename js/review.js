/* 사후검토: 개인·교관 화면, 차트, 잘못된 습관 분석 */
(function () {
  'use strict';
  var INFO = window.MCGesture.INFO;
  var $ = function (id) { return document.getElementById(id); };
  var MNAME = { M1: 'M1 기본 이착륙', M2: 'M2 좌우 기동', M3: 'M3 정밀 호버링', M4: 'M4 종합 임무', M5: 'M5 전후 기동' };
  var ERR = {
    e1: { ko: '제스처 오인식', tip: '과제와 다른 명령이 확정됐습니다. 손 모양을 끝까지 만든 뒤 유지하세요.' },
    e2: { ko: '유지 시간 미달', tip: '손 모양을 만든 뒤 이동은 0.5초, 전원은 1초 그대로 유지하세요.' },
    e3: { ko: '공중 전원차단 시도', tip: '비행 중에는 전원을 끄지 않습니다. 엄지 아래로 착륙한 뒤 손바닥 아래로 전원을 끄세요.' },
    e4: { ko: '훈련 구역 이탈', tip: '목표에 가까워지면 손을 화면 밖으로 빼서 정지시키는 습관을 들이세요.' },
    e5: { ko: '시간 초과', tip: '단계를 넘어갈 때 망설입니다. 수신호 순서를 먼저 외우고 시작하세요.' },
    e6: { ko: '손 인식 이탈', tip: '손을 카메라 화면 가운데, 가슴 높이에 두세요.' }
  };
  var GOT_TIP = {
    UP: '엄지척으로 잘못 인식됐습니다. 의도하지 않을 때는 엄지를 주먹 안으로 넣으세요.',
    DOWN: '엄지 아래로 잘못 인식됐습니다. 엄지 방향이 수직 ±45° 안에 들어가지 않도록 주의하세요.',
    LEFT: '검지 왼쪽으로 잘못 인식됐습니다. 가리킬 때가 아니면 검지를 접으세요.',
    RIGHT: '검지 오른쪽으로 잘못 인식됐습니다. 가리킬 때가 아니면 검지를 접으세요.',
    FORWARD: '숫자 1(전진)로 잘못 인식됐습니다. 좌우를 가리킬 때는 검지를 수평으로 눕히고, 명령이 아니면 검지를 접으세요.',
    BACK: '숫자 2(후진)로 잘못 인식됐습니다. 손을 펴거나 쥐는 중에는 검지·중지만 세워진 모양으로 멈추지 마세요.',
    POWER_ON: '엄지와 검지 끝이 닿아 OK로 인식됐습니다. 두 손가락 사이를 띄우세요.',
    POWER_OFF: '손을 펴서 눕히는 동작이 전원 끄기로 인식됐습니다. 명령 사이에는 손을 화면 밖으로 빼세요.'
  };

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function key(r) { return r.rank + ' ' + r.name; }
  function avg(a) { return a.length ? a.reduce(function (s, v) { return s + v; }, 0) / a.length : 0; }
  function pct(n) { return Math.round(n * 100) + '%'; }
  function fmtDate(iso) { var d = new Date(iso); if (isNaN(d)) return '-'; return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function errSum(r) { return r.e1 + r.e2 + r.e3 + r.e4 + r.e5 + r.e6; }

  function habits(rows) {
    var items = {};
    function add(k, label, tip, n) { if (!n) return; items[k] = items[k] || { label: label, tip: tip, n: 0 }; items[k].n += n; }
    rows.forEach(function (r) {
      (r.confusions || []).forEach(function (c) {
        var exp = INFO[c.expected] ? INFO[c.expected].sign : c.expected, got = INFO[c.got] ? INFO[c.got].sign : c.got;
        add('c:' + c.expected + '>' + c.got, '‘' + exp + '’ 단계에서 ‘' + got + '’로 인식', GOT_TIP[c.got] || ERR.e1.tip, 1);
      });
      ['e2', 'e3', 'e4', 'e5', 'e6'].forEach(function (k) { add(k, ERR[k].ko, ERR[k].tip, r[k]); });
      var unexplained = r.e1 - (r.confusions || []).length;
      if (unexplained > 0) add('e1', ERR.e1.ko, ERR.e1.tip, unexplained);
    });
    return Object.keys(items).map(function (k) { return items[k]; }).sort(function (a, b) { return b.n - a.n; }).slice(0, 3);
  }

  /* ── SVG 차트 ─────────────────────── */
  function trendChart(rows) {
    if (!rows.length) return '<p class="empty">기록이 없습니다.</p>';
    var W = 520, H = 220, L = 34, Rr = 12, T = 14, B = 30;
    var n = rows.length, iw = W - L - Rr, ih = H - T - B;
    var x = function (i) { return L + (n === 1 ? iw / 2 : iw * i / (n - 1)); };
    var y = function (v) { return T + ih * (1 - v / 100); };
    var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" class="svgc" role="img" aria-label="회차별 점수 추이">';
    [0, 50, 100].forEach(function (v) { s += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + y(v) + '" y2="' + y(v) + '" class="gl"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end" class="tk">' + v + '</text>'; });
    s += '<line x1="' + L + '" x2="' + (W - Rr) + '" y1="' + y(80) + '" y2="' + y(80) + '" class="pass"/><text x="' + (W - Rr) + '" y="' + (y(80) - 5) + '" text-anchor="end" class="tk acc">합격선 80</text>';
    var d = rows.map(function (r, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(r.score).toFixed(1); }).join(' ');
    var area = d + ' L' + x(n - 1).toFixed(1) + ' ' + y(0) + ' L' + x(0).toFixed(1) + ' ' + y(0) + ' Z';
    s += '<path d="' + area + '" class="area"/><path d="' + d + '" class="line"/>';
    rows.forEach(function (r, i) {
      var last = i === n - 1;
      s += '<circle cx="' + x(i).toFixed(1) + '" cy="' + y(r.score).toFixed(1) + '" r="' + (last ? 5.5 : 4) + '" class="' + (r.score >= 80 ? 'pt-ok' : 'pt-bad') + '"><title>' + (i + 1) + '회차 ' + r.mission + ' · ' + r.score + '점</title></circle>';
    });
    var stepLbl = Math.ceil(n / 8);
    rows.forEach(function (r, i) { if (i % stepLbl === 0 || i === n - 1) s += '<text x="' + x(i).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="middle" class="tk">' + (i + 1) + '</text>'; });
    s += '<text x="' + (L + iw / 2) + '" y="' + (H) + '" text-anchor="middle" class="tk mut">회차</text></svg>';
    return s;
  }

  function barChart(items, opts) {
    opts = opts || {};
    if (!items.length) return '<p class="empty">기록이 없습니다.</p>';
    var max = opts.max || Math.max.apply(null, items.map(function (i) { return i.v; }).concat([1]));
    return '<div class="bars">' + items.map(function (it) {
      var w = Math.max(0, Math.min(100, it.v / max * 100));
      return '<div class="bar-row"><span class="bl">' + esc(it.label) + '</span><span class="bt"><i class="' + (it.cls || '') + '" style="width:' + w.toFixed(1) + '%"></i></span><b class="bv">' + esc(it.txt != null ? it.txt : it.v) + '</b></div>';
    }).join('') + '</div>';
  }

  function kpi(label, value, sub, cls) {
    return '<div class="kpi ' + (cls || '') + '"><span>' + esc(label) + '</span><b>' + esc(value) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
  }

  /* ── 개인 화면 ────────────────────── */
  function renderMe(rows, onReplay) {
    var n = rows.length;
    var scores = rows.map(function (r) { return r.score; });
    var pass = rows.filter(function (r) { return r.score >= 80; }).length;
    var lastS = n ? scores[n - 1] : null, prevS = n > 1 ? scores[n - 2] : null;
    var delta = lastS != null && prevS != null ? lastS - prevS : null;
    $('kpiMe').innerHTML =
      kpi('훈련 횟수', n + '회') +
      kpi('평균 점수', n ? Math.round(avg(scores)) + '점' : '-') +
      kpi('합격률', n ? pct(pass / n) : '-', '80점 이상') +
      kpi('평균 소요 시간', n ? (Math.round(avg(rows.map(function (r) { return r.duration_s; })) * 10) / 10) + '초' : '-') +
      kpi('최근 점수', lastS != null ? lastS + '점' : '-', delta != null ? (delta >= 0 ? '▲ ' : '▼ ') + Math.abs(delta) + '점 (직전 대비)' : '', delta != null ? (delta >= 0 ? 'up' : 'down') : '');
    $('chartTrend').innerHTML = trendChart(rows);
    $('chartMission').innerHTML = barChart(['M1', 'M2', 'M3', 'M4', 'M5'].map(function (m) {
      var a = rows.filter(function (r) { return r.mission === m; });
      var ok = a.filter(function (r) { return r.success; }).length;
      return { label: m, v: a.length ? ok / a.length * 100 : 0, txt: a.length ? pct(ok / a.length) + ' (' + ok + '/' + a.length + ')' : '미실시', cls: 'acc' };
    }), { max: 100 });
    var h = habits(rows);
    $('habits').innerHTML = h.length ? h.map(function (x) { return '<li><div><b>' + esc(x.label) + '</b><em>' + x.n + '회</em></div><p>' + esc(x.tip) + '</p></li>'; }).join('')
      : '<li class="empty">' + (n ? '반복되는 실수가 없습니다. 잘하고 있습니다.' : '훈련 미션을 마치면 자주 하는 실수와 교정 방법이 여기에 나타납니다.') + '</li>';
    var head = '<thead><tr><th>회차</th><th>일시</th><th>과제</th><th>결과</th><th class="num">점수</th><th class="num">시간</th><th>실수</th><th>입력</th><th>재생</th></tr></thead>';
    var body = rows.slice().reverse().map(function (r, i) {
      var errs = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'].filter(function (k) { return r[k]; }).map(function (k) { return '<span class="tag" title="' + ERR[k].ko + '">' + k.toUpperCase() + '×' + r[k] + '</span>'; }).join('') || '<span class="mut">없음</span>';
      return '<tr><td class="num">' + (n - i) + '</td><td>' + fmtDate(r.created_at) + '</td><td>' + esc(MNAME[r.mission] || r.mission) + '</td><td>' + (r.success ? '<span class="pill ok">성공</span>' : '<span class="pill bad">실패</span>') + '</td><td class="num"><b>' + r.score + '</b></td><td class="num">' + r.duration_s + 's</td><td>' + errs + '</td><td>' + (r.input_mode === 'camera' ? '카메라' : '수동') + '</td><td>' +
        (r.has_track || r.track ? '<button class="btn btn-sm" type="button" data-replay="' + (n - 1 - i) + '">다시 보기</button>' : '<span class="mut" title="재생 기능 추가 전 기록이거나 CSV로 가져온 기록">—</span>') + '</td></tr>';
    }).join('');
    $('tblMe').innerHTML = head + '<tbody>' + (body || '<tr><td colspan="9" class="empty">아직 기록이 없습니다. 조작 시뮬레이션에서 훈련 과제를 수행해 보세요.</td></tr>') + '</tbody>';
    $('tblMe').querySelectorAll('[data-replay]').forEach(function (b) {
      var k = +b.getAttribute('data-replay');
      b.addEventListener('click', function () { if (onReplay) onReplay(rows[k], k + 1); });
    });
  }

  /* ── 회차 재생 목록 ────────────────── */
  function renderReplayList(rows, who, onReplay) {
    var names = []; rows.forEach(function (r) { if (names.indexOf(key(r)) < 0) names.push(key(r)); });
    $('fReplayWho').innerHTML = '<option value="">전체 훈련자</option>' + names.map(function (n) { return '<option' + (n === who ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('');
    var list = rows.filter(function (r) { return !who || key(r) === who; }).slice().reverse();
    var head = '<thead><tr><th>일시</th><th>훈련자</th><th>과제</th><th>결과</th><th class="num">점수</th><th class="num">시간</th><th>실수</th><th>재생</th></tr></thead>';
    var body = list.map(function (r, i) {
      var errs = errSum(r) ? '<span class="tag">' + errSum(r) + '건</span>' : '<span class="mut">없음</span>';
      var can = r.has_track || r.track;
      return '<tr' + (can ? '' : ' class="mut-row"') + '><td>' + fmtDate(r.created_at) + '</td><td>' + esc(key(r)) + '</td><td>' + esc(MNAME[r.mission] || r.mission) + '</td><td>' + (r.success ? '<span class="pill ok">성공</span>' : '<span class="pill bad">실패</span>') + '</td><td class="num"><b>' + r.score + '</b></td><td class="num">' + r.duration_s + 's</td><td>' + errs + '</td><td>' +
        (can ? '<button class="btn btn-sm btn-primary" type="button" data-replay="' + i + '">▶ 다시 보기</button>' : '<span class="mut" title="재생 기능 추가(v1.8) 전 회차이거나 CSV로 가져온 기록">재생 데이터 없음</span>') + '</td></tr>';
    }).join('');
    $('tblReplay').innerHTML = head + '<tbody>' + (body || '<tr><td colspan="8" class="empty">아직 기록이 없습니다. 조작 시뮬레이션에서 훈련 과제를 수행하면 여기서 다시 볼 수 있습니다.</td></tr>') + '</tbody>';
    $('tblReplay').querySelectorAll('[data-replay]').forEach(function (b) {
      b.addEventListener('click', function () { var r = list[+b.getAttribute('data-replay')]; onReplay(r, null); });
    });
  }

  /* ── 교관 화면 ────────────────────── */
  function renderAll(rows, onPick) {
    var groups = {};
    rows.forEach(function (r) { (groups[key(r)] = groups[key(r)] || []).push(r); });
    var names = Object.keys(groups);
    var scores = rows.map(function (r) { return r.score; });
    var pass = rows.filter(function (r) { return r.score >= 80; }).length;
    var errTot = { e1: 0, e2: 0, e3: 0, e4: 0, e5: 0, e6: 0 };
    rows.forEach(function (r) { Object.keys(errTot).forEach(function (k) { errTot[k] += r[k]; }); });
    var topErr = Object.keys(errTot).sort(function (a, b) { return errTot[b] - errTot[a]; })[0];
    $('kpiAll').innerHTML =
      kpi('훈련자', names.length + '명') +
      kpi('총 훈련', rows.length + '회') +
      kpi('평균 점수', rows.length ? Math.round(avg(scores)) + '점' : '-') +
      kpi('합격률', rows.length ? pct(pass / rows.length) : '-') +
      kpi('가장 많은 실수', rows.length && errTot[topErr] ? ERR[topErr].ko : '-', rows.length && errTot[topErr] ? errTot[topErr] + '회' : '');
    $('chartErr').innerHTML = barChart(Object.keys(errTot).map(function (k) { return { label: k.toUpperCase() + ' ' + ERR[k].ko, v: errTot[k], cls: k === 'e3' ? 'bad' : 'warn' }; }));
    $('chartMissionAll').innerHTML = barChart(['M1', 'M2', 'M3', 'M4', 'M5'].map(function (m) {
      var a = rows.filter(function (r) { return r.mission === m; });
      var ok = a.filter(function (r) { return r.success; }).length;
      return { label: m, v: a.length ? avg(a.map(function (r) { return r.score; })) : 0, txt: a.length ? Math.round(avg(a.map(function (r) { return r.score; }))) + '점 · 성공 ' + pct(ok / a.length) + ' · ' + a.length + '회' : '미실시', cls: 'acc' };
    }), { max: 100 });
    var head = '<thead><tr><th>훈련자</th><th class="num">횟수</th><th class="num">평균</th><th class="num">최고</th><th class="num">합격률</th><th>최근 훈련</th><th>주요 습관</th><th></th></tr></thead>';
    var body = names.sort(function (a, b) { return avg(groups[b].map(function (r) { return r.score; })) - avg(groups[a].map(function (r) { return r.score; })); }).map(function (nm) {
      var g = groups[nm], sc = g.map(function (r) { return r.score; });
      var h = habits(g)[0];
      var p = g.filter(function (r) { return r.score >= 80; }).length;
      return '<tr><td><b>' + esc(nm) + '</b></td><td class="num">' + g.length + '</td><td class="num">' + Math.round(avg(sc)) + '</td><td class="num">' + Math.max.apply(null, sc) + '</td><td class="num">' + pct(p / g.length) + '</td><td>' + fmtDate(g[g.length - 1].created_at) + '</td><td>' + (h ? esc(h.label) + ' <span class="mut">' + h.n + '회</span>' : '<span class="mut">없음</span>') + '</td><td><button class="btn btn-sm" type="button" data-pick="' + esc(nm) + '">상세</button></td></tr>';
    }).join('');
    $('tblAll').innerHTML = head + '<tbody>' + (body || '<tr><td colspan="8" class="empty">아직 기록이 없습니다.</td></tr>') + '</tbody>';
    $('tblAll').querySelectorAll('[data-pick]').forEach(function (b) { b.addEventListener('click', function () { onPick(b.getAttribute('data-pick')); }); });
  }

  /* ── 예시 기록 (화면에 '예시'로 표시) ── */
  function sampleRows() {
    var people = [['상병', '예시-김OO'], ['하사', '예시-이OO'], ['중위', '예시-박OO']];
    var out = [], t0 = Date.now() - 1000 * 60 * 60 * 30;
    var seq = ['M1', 'M1', 'M2', 'M3', 'M5', 'M2', 'M4', 'M3', 'M5', 'M4'];
    people.forEach(function (p, pi) {
      seq.forEach(function (m, i) {
        var skill = 0.45 + i * 0.07 + pi * 0.04;
        var e1 = Math.max(0, Math.round((1 - skill) * 4 - (i % 2)));
        var e3 = i < 3 && pi !== 1 ? 1 : 0;
        var e2 = Math.max(0, Math.round((1 - skill) * 6));
        var success = skill > 0.55 || i % 3 === 1;
        var score = Math.max(20, Math.min(98, Math.round((success ? 60 : 18) + skill * 26 - e1 * 2 - e3 * 2)));
        var conf = [];
        for (var k = 0; k < e1; k++) conf.push(pi === 0 ? { expected: 'UP', got: 'LEFT' } : pi === 1 ? { expected: 'POWER_OFF', got: 'DOWN' } : { expected: 'DOWN', got: 'POWER_OFF' });
        var track = window.MCReplay ? MCReplay.synth(m, { success: success, e1: Math.min(e1, 2), seed: pi * 31 + i * 7 + 3 }) : null;
        out.push({ track: track, has_track: !!track, id: 'sample-' + pi + '-' + i, created_at: new Date(t0 + (i * 3 + pi) * 3600e3).toISOString(), rank: p[0], name: p[1], mission: m, success: success, score: score, duration_s: track ? track.p[track.p.length - 1][0] : Math.round(30 + (1 - skill) * 60), e1: e1, e2: e2, e3: e3, e4: i === 2 ? 1 : 0, e5: success ? 0 : 1, e6: 0, confusions: conf, input_mode: 'camera', device: 'pc' });
      });
    });
    return out;
  }

  window.MCReview = { renderMe: renderMe, renderAll: renderAll, renderReplayList: renderReplayList, sampleRows: sampleRows, habits: habits, ERR: ERR, MNAME: MNAME, key: key };
})();
