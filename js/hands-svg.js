/* 수신호 손 그림 (SVG) + 손 관절 21점 도식 */
(function () {
  'use strict';
  var FX = [37, 48.5, 60, 71.5];       // 검지·중지·약지·소지 x
  var FH = [34, 38, 35, 28];           // 펴진 길이

  function finger(i, ext) {
    if (ext) return '<rect x="' + FX[i] + '" y="' + (60 - FH[i]) + '" width="10.5" height="' + (FH[i] + 4) + '" rx="5.25"/>';
    return '<rect x="' + FX[i] + '" y="47" width="10.5" height="15" rx="5.25"/>';
  }
  function palm() { return '<rect x="35" y="54" width="48" height="40" rx="13"/>'; }
  function thumbOpen() { return '<rect x="30" y="60" width="11" height="30" rx="5.5" transform="rotate(-40 35 88)"/>'; }
  function thumbUp() { return '<rect x="25" y="20" width="12" height="46" rx="6"/>'; }
  function thumbFold() { return '<rect x="40" y="70" width="28" height="10" rx="5"/>'; }

  function hand(parts, transform) {
    return '<g class="hand" ' + (transform ? 'transform="' + transform + '"' : '') + '>' + parts.join('') + '</g>';
  }
  function arrow(d) { return '<path class="arw" d="' + d + '"/>'; }

  var SHAPES = {
    POWER_ON: function () {
      return hand([palm(), finger(1, 1), finger(2, 1), finger(3, 1), finger(0, 0),
        '<circle cx="36" cy="46" r="10" class="ring"/>']);
    },
    UP: function () {
      return hand([palm(), finger(0, 0), finger(1, 0), finger(2, 0), finger(3, 0), thumbUp()]) +
        arrow('M100 70 V28 M92 38 L100 28 L108 38');
    },
    DOWN: function () {
      return hand([palm(), finger(0, 0), finger(1, 0), finger(2, 0), finger(3, 0), thumbUp()], 'rotate(180 60 60)') +
        arrow('M14 46 V90 M6 80 L14 90 L22 80');
    },
    LEFT: function () {
      return hand([palm(), finger(0, 1), finger(1, 0), finger(2, 0), finger(3, 0), thumbFold()], 'rotate(-90 60 66) translate(0 4)') +
        arrow('M58 104 H14 M24 96 L14 104 L24 112');
    },
    RIGHT: function () {
      return hand([palm(), finger(0, 1), finger(1, 0), finger(2, 0), finger(3, 0), thumbFold()], 'rotate(90 60 66) translate(0 4)') +
        arrow('M62 104 H106 M96 96 L106 104 L96 112');
    },
    FORWARD: function () {
      return hand([palm(), finger(0, 1), finger(1, 0), finger(2, 0), finger(3, 0), thumbFold()], 'translate(-8 0)') +
        arrow('M94 50 L103 40 L112 50 M94 64 L103 54 L112 64') + '<text class="g-lbl" x="103" y="80" text-anchor="middle">앞</text>';
    },
    BACK: function () {
      return hand([palm(), finger(0, 1), finger(1, 1), finger(2, 0), finger(3, 0), thumbFold()], 'translate(-8 0)') +
        arrow('M94 40 L103 50 L112 40 M94 54 L103 64 L112 54') + '<text class="g-lbl" x="103" y="80" text-anchor="middle">뒤</text>';
    },
    POWER_OFF: function () {
      return hand([palm(), finger(0, 1), finger(1, 1), finger(2, 1), finger(3, 1)], 'translate(2 -8) rotate(90 60 60)') +
        '<path class="arw" d="M30 98 H90"/><path class="arw" d="M60 100 V114 M53 107 L60 114 L67 107"/>';
    },
    HOVER: function () {
      return '<rect class="frame" x="10" y="12" width="78" height="96" rx="8"/>' +
        hand([palm(), finger(0, 1), finger(1, 1), finger(2, 1), finger(3, 1), thumbOpen()], 'translate(44 4) scale(0.8)') +
        arrow('M64 60 H112 M102 52 L112 60 L102 68');
    }
  };

  function svg(id, size) {
    var s = size || 120;
    var f = SHAPES[id] || SHAPES.HOVER;
    return '<svg class="hand-svg" viewBox="0 0 120 120" width="' + s + '" height="' + s + '" role="img" aria-hidden="true">' + f() + '</svg>';
  }

  /* 손 관절 21점 도식 */
  var LM = [[150, 300], [112, 268], [90, 230], [76, 196], [64, 166],
    [128, 172], [120, 124], [116, 94], [113, 66],
    [156, 166], [156, 112], [156, 78], [156, 48],
    [182, 170], [188, 122], [192, 92], [195, 66],
    [204, 182], [216, 146], [224, 122], [230, 100]];
  var CH = [[0, 1, 2, 3, 4], [0, 5, 6, 7, 8], [9, 10, 11, 12], [13, 14, 15, 16], [0, 17, 18, 19, 20], [5, 9, 13, 17]];
  var COL = ['--c1', '--c2', '--c3', '--c4', '--c5', '--muted'];
  function landmarkFigure() {
    var out = '<svg viewBox="0 0 300 330" class="lm-svg" role="img" aria-label="손 관절 21점 번호 도식">';
    CH.forEach(function (c, k) {
      var d = c.map(function (i, j) { return (j ? 'L' : 'M') + LM[i][0] + ' ' + LM[i][1]; }).join(' ');
      out += '<path d="' + d + '" fill="none" stroke="var(' + COL[k] + ')" stroke-width="' + (k === 5 ? 2 : 4) + '" stroke-linecap="round" stroke-linejoin="round"/>';
    });
    LM.forEach(function (p, i) {
      var k = i === 0 ? 5 : Math.ceil(i / 4) - 1;
      if (i >= 1 && i <= 4) k = 0;
      out += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="7" fill="var(--surface)" stroke="var(' + COL[k] + ')" stroke-width="3"/>';
      var dx = (i >= 17 ? 12 : i >= 1 && i <= 4 ? -24 : 10), dy = (i === 0 ? 22 : 4);
      out += '<text x="' + (p[0] + dx) + '" y="' + (p[1] + dy) + '" font-size="12" fill="var(--ink)" font-family="IBM Plex Mono, monospace">' + i + '</text>';
    });
    out += '<text x="150" y="324" text-anchor="middle" font-size="12" fill="var(--muted)">0 = 손목 (WRIST)</text></svg>';
    return out;
  }

  window.MCHand = { svg: svg, landmarkFigure: landmarkFigure };
})();
