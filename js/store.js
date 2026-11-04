/* 훈련 기록 저장소: Supabase(공유) 또는 이 기기(localStorage) */
(function () {
  'use strict';
  var CFG = window.MC_CONFIG || {};
  var LOCAL_KEY = 'motioncommand.attempts.v1';
  var IMPORT_KEY = 'motioncommand.imported.v1';
  var client = null;
  var mode = 'local';
  var lastError = '';

  function lsGet(k) { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (e) { return []; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  function uid() { return 'loc-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function init() {
    if (CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY && window.supabase && window.supabase.createClient) {
      try {
        client = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
        mode = 'supabase';
      } catch (e) { client = null; mode = 'local'; lastError = String(e.message || e); }
    }
    return { mode: mode };
  }

  var FIELDS = ['id', 'created_at', 'rank', 'name', 'mission', 'success', 'score', 'duration_s', 'e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'confusions', 'input_mode', 'device'];

  function normalize(r) {
    return {
      id: r.id || uid(),
      created_at: r.created_at || new Date().toISOString(),
      rank: String(r.rank || '').slice(0, 10),
      name: String(r.name || '').slice(0, 20),
      mission: r.mission,
      success: r.success === true || r.success === 'true' || r.success === 'TRUE' || r.success === 1,
      score: Math.max(0, Math.min(100, Math.round(+r.score || 0))),
      duration_s: Math.round((+r.duration_s || 0) * 10) / 10,
      e1: +r.e1 || 0, e2: +r.e2 || 0, e3: +r.e3 || 0, e4: +r.e4 || 0, e5: +r.e5 || 0, e6: +r.e6 || 0,
      confusions: Array.isArray(r.confusions) ? r.confusions : (function () { try { return JSON.parse(r.confusions || '[]'); } catch (e) { return []; } })(),
      input_mode: r.input_mode === 'keyboard' ? 'keyboard' : 'camera',
      device: r.device || '',
      track: parseTrack(r.track),
      has_track: !!(r.has_track || r.track)
    };
  }
  function parseTrack(t) {
    if (!t) return null;
    if (typeof t === 'string') { try { t = JSON.parse(t); } catch (e) { return null; } }
    return t && Array.isArray(t.p) ? t : null;
  }

  function add(attempt) {
    var row = normalize(attempt);
    if (mode === 'supabase') {
      var payload = Object.assign({}, row); delete payload.id; delete payload.created_at; delete payload.has_track;
      return client.from(CFG.TABLE).insert(payload).then(function (res) {
        if (res.error) throw res.error;
        return { ok: true, where: 'supabase', row: row };
      }).catch(function (e) {
        lastError = String(e.message || e);
        saveLocal(row);
        return { ok: true, where: 'local-fallback', row: row, error: lastError };
      });
    }
    saveLocal(row);
    return Promise.resolve({ ok: true, where: 'local', row: row });
  }
  // 기기 저장 공간이 부족하면 궤적만 빼고 점수 기록은 지킨다
  function saveLocal(row) {
    var all = lsGet(LOCAL_KEY); all.push(row);
    if (lsSet(LOCAL_KEY, all)) return;
    all[all.length - 1] = Object.assign({}, row, { track: null, has_track: false });
    lsSet(LOCAL_KEY, all);
  }

  // 재생용 궤적: 목록에는 싣지 않고 다시 보기를 누를 때 그 회차만 불러온다
  function getTrack(row) {
    if (row.track) return Promise.resolve(row.track);
    if (row._src !== 'supabase' || !client) return Promise.resolve(null);
    return client.from(CFG.TABLE).select('track').eq('id', row.id).single().then(function (res) {
      if (res.error) throw res.error;
      return parseTrack(res.data && res.data.track);
    });
  }

  function list() {
    var local = lsGet(LOCAL_KEY).map(function (r) { r._src = 'local'; return r; });
    var imported = lsGet(IMPORT_KEY).map(function (r) { r._src = 'import'; return r; });
    if (mode !== 'supabase') return Promise.resolve(local.concat(imported));
    return client.from(CFG.TABLE).select(FIELDS.join(',') + ',has_track:track->v').order('created_at', { ascending: false }).limit(5000).then(function (res) {
      if (res.error) throw res.error;
      // 서버 조회 한도에 걸려도 최신 기록이 남도록 최신순으로 받아 시간순으로 되돌린다
      var remote = res.data.slice().reverse().map(function (r) { var n = normalize(r); n._src = 'supabase'; return n; });
      return remote.concat(local, imported);
    }).catch(function (e) {
      lastError = String(e.message || e);
      return local.concat(imported);
    });
  }

  function csvCell(v) {
    if (v === null || v === undefined) return '';
    var s = typeof v === 'object' ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }
  function toCSV(rows) {
    var head = FIELDS.join(',');
    return '﻿' + head + '\n' + rows.map(function (r) { return FIELDS.map(function (f) { return csvCell(r[f]); }).join(','); }).join('\n');
  }
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    var rows = [], cur = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (c === '"') q = false;
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === ',') { cur.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; cur.push(cell); rows.push(cur); cur = []; cell = ''; }
      else cell += c;
    }
    if (cell || cur.length) { cur.push(cell); rows.push(cur); }
    rows = rows.filter(function (r) { return r.length > 1; });
    if (!rows.length) return [];
    var head = rows.shift();
    return rows.map(function (r) { var o = {}; head.forEach(function (h, k) { o[h.trim()] = r[k]; }); return o; })
      .filter(function (o) { return o.mission && o.name; })
      .map(normalize);
  }
  function importRows(rows) {
    var cur = lsGet(IMPORT_KEY);
    var seen = {}; cur.forEach(function (r) { seen[r.id] = 1; });
    var added = 0;
    rows.forEach(function (r) { if (!seen[r.id]) { cur.push(r); seen[r.id] = 1; added++; } });
    lsSet(IMPORT_KEY, cur);
    return added;
  }

  window.MCStore = {
    init: init, add: add, list: list, getTrack: getTrack, toCSV: toCSV, parseCSV: parseCSV, importRows: importRows,
    get mode() { return mode; }, get lastError() { return lastError; }
  };
})();
