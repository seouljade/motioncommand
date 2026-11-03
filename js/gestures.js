/* MotionCommand — 손 관절 21점 기반 규칙 분류기
 * 입력: MediaPipe Hands landmarks (정규화 좌표, 원본 카메라 기준)
 * 출력: { id, conf, detail }
 * 좌표는 거울 반전(x → 1 - x)해 "조종자 시점"으로 판정한다.
 */
(function (root) {
  'use strict';

  var G = {
    POWER_ON: 'POWER_ON',
    UP: 'UP',
    DOWN: 'DOWN',
    LEFT: 'LEFT',
    RIGHT: 'RIGHT',
    POWER_OFF: 'POWER_OFF',
    HOVER: 'HOVER',     // 손 없음 / 판정 불가 → 제자리 정지
    UNKNOWN: 'UNKNOWN'  // 손은 있으나 정의되지 않은 모양
  };

  var INFO = {
    POWER_ON:  { ko: '전원 켜기', sign: 'OK 모양', hold: 1.0, kind: 'event' },
    UP:        { ko: '상승', sign: '엄지척', hold: 0.5, kind: 'move' },
    DOWN:      { ko: '하강', sign: '엄지 아래', hold: 0.5, kind: 'move' },
    LEFT:      { ko: '좌측 이동', sign: '검지로 왼쪽', hold: 0.5, kind: 'move' },
    RIGHT:     { ko: '우측 이동', sign: '검지로 오른쪽', hold: 0.5, kind: 'move' },
    POWER_OFF: { ko: '전원 끄기', sign: '손바닥 아래로', hold: 1.0, kind: 'event' },
    HOVER:     { ko: '정지(호버링)', sign: '손을 화면 밖으로', hold: 0, kind: 'idle' },
    UNKNOWN:   { ko: '판정 불가', sign: '정의되지 않은 모양', hold: 0, kind: 'idle' }
  };

  function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: (a.z || 0) - (b.z || 0) }; }
  function len(v) { return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z); }
  function dist(a, b) { return len(sub(a, b)); }
  function cos(u, v) { var l = len(u) * len(v); return l ? (u.x * v.x + u.y * v.y + u.z * v.z) / l : 0; }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // 손가락 펴짐: 끝마디가 손목에서 PIP보다 충분히 멀고, MCP→PIP와 PIP→TIP가 거의 일직선
  function fingerExt(P, m, p, t) {
    return dist(P[0], P[t]) > dist(P[0], P[p]) * 1.12 && cos(sub(P[p], P[m]), sub(P[t], P[p])) > 0.55;
  }

  function classify(landmarks, handScore) {
    if (!landmarks || landmarks.length < 21) return { id: G.HOVER, conf: 0, detail: '손 미검출' };
    var P = landmarks.map(function (p) { return { x: 1 - p.x, y: p.y, z: p.z || 0 }; });
    var s = dist(P[0], P[9]) || 1e-6; // 손 크기 기준(손목~중지 MCP)
    var base = typeof handScore === 'number' ? handScore : 0.9;

    var idx = fingerExt(P, 5, 6, 8);
    var mid = fingerExt(P, 9, 10, 12);
    var ring = fingerExt(P, 13, 14, 16);
    var pinky = fingerExt(P, 17, 18, 20);
    var thumbExt = dist(P[4], P[5]) > 0.45 * s &&
      cos(sub(P[3], P[2]), sub(P[4], P[3])) > 0.5 &&
      dist(P[4], P[0]) > dist(P[3], P[0]);
    var fingers = { thumb: thumbExt, index: idx, middle: mid, ring: ring, pinky: pinky };

    // G1 OK: 엄지·검지 끝 맞닿음 + 중지·약지·소지 펴짐
    var pinch = dist(P[4], P[8]) / s;
    if (pinch < 0.35 && (!idx || pinch < 0.2) && mid && ring && pinky) {
      return { id: G.POWER_ON, conf: base * clamp(1.15 - pinch, 0.6, 1), fingers: fingers, detail: '엄지-검지 접촉 ' + pinch.toFixed(2) };
    }

    // 다섯(네) 손가락 모두 펴짐 → 손바닥 아래(수평) 또는 정면 손바닥(정의되지 않음)
    if (idx && mid && ring && pinky) {
      var minX = 1, maxX = 0, minY = 1, maxY = 0;
      P.forEach(function (p) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); });
      var w = maxX - minX, h = maxY - minY;
      var ratio = h / (w || 1e-6);
      if (ratio < 0.8) {
        return { id: G.POWER_OFF, conf: base * clamp(1.5 - ratio, 0.6, 1), fingers: fingers, detail: '손 수평 h/w ' + ratio.toFixed(2) };
      }
      return { id: G.UNKNOWN, conf: base, fingers: fingers, detail: '손바닥 정면(명령 없음)' };
    }

    // G2/G3 엄지척 / 엄지 아래: 네 손가락 접힘 + 엄지 펴짐, 수직 ±45°
    if (!idx && !mid && !ring && !pinky && thumbExt) {
      var v = sub(P[4], P[2]);
      if (Math.abs(v.y) > Math.abs(v.x)) {
        var q = clamp(Math.abs(v.y) / (Math.abs(v.x) + Math.abs(v.y)), 0.5, 1);
        return { id: v.y < 0 ? G.UP : G.DOWN, conf: base * (0.5 + q / 2), fingers: fingers, detail: '엄지 각도 ' + Math.round(Math.atan2(-v.y, v.x) * 180 / Math.PI) + '°' };
      }
      return { id: G.UNKNOWN, conf: base, fingers: fingers, detail: '엄지가 수평에 가까움' };
    }

    // G4/G5 검지 좌·우: 검지만 펴짐, 수평 방향
    if (idx && !mid && !ring && !pinky) {
      var d = sub(P[8], P[5]);
      if (Math.abs(d.x) > Math.abs(d.y) * 1.2) {
        var r = clamp(Math.abs(d.x) / (Math.abs(d.x) + Math.abs(d.y)), 0.5, 1);
        return { id: d.x < 0 ? G.LEFT : G.RIGHT, conf: base * (0.5 + r / 2), fingers: fingers, detail: '검지 방향 ' + (d.x < 0 ? '←' : '→') };
      }
      return { id: G.UNKNOWN, conf: base, fingers: fingers, detail: '검지가 수직에 가까움' };
    }

    return { id: G.UNKNOWN, conf: base, fingers: fingers, detail: '정의되지 않은 손 모양' };
  }

  /* 유지 시간 필터: 같은 제스처가 hold 시간 이상 유지돼야 확정 */
  function Debouncer(opts) {
    this.threshold = (opts && opts.threshold) || 0.7;
    this.scale = (opts && opts.holdScale) || 1;
    this.cand = null; this.candStart = 0; this.fired = false;
    this.active = G.HOVER; this.progress = 0;
    this.onConfirm = null; this.onBreak = null;
  }
  Debouncer.prototype.update = function (raw, now) {
    var id = raw.id;
    if (id !== G.HOVER && raw.conf < this.threshold) id = G.UNKNOWN;
    if (id === G.HOVER || id === G.UNKNOWN) {
      this._break(now);
      this.cand = null; this.active = G.HOVER; this.progress = 0;
      return { active: this.active, cand: null, progress: 0, rawId: id };
    }
    if (id !== this.cand) {
      this._break(now);
      this.cand = id; this.candStart = now; this.fired = false; this.active = G.HOVER;
    }
    var hold = INFO[id].hold * this.scale;
    var el = (now - this.candStart) / 1000;
    this.progress = hold ? clamp(el / hold, 0, 1) : 1;
    if (el >= hold) {
      if (!this.fired) { this.fired = true; if (this.onConfirm) this.onConfirm(id); }
      this.active = INFO[id].kind === 'move' ? id : G.HOVER;
    }
    return { active: this.active, cand: this.cand, progress: this.progress, rawId: id };
  };
  Debouncer.prototype._break = function (now) {
    if (this.cand && !this.fired) {
      var el = (now - this.candStart) / 1000;
      var hold = INFO[this.cand].hold * this.scale;
      if (el > 0.2 && el < hold && this.onBreak) this.onBreak(this.cand);
    }
  };

  var api = { G: G, INFO: INFO, classify: classify, Debouncer: Debouncer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MCGesture = api;
})(this);
