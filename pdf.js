/*
  A small PDF maker (no outside library): tables of text, with optional photos.
  BH.pdf.build({ title, subtitle, columns:[{key,label,w,align}], rows:[{cells:{...}, image:ArrayBuffer|null}],
                 totals:[[label,value],...], note:'text' }) -> Blob
*/
(function () {
  'use strict';
  var BH = window.BH = window.BH || {};
  var HW = [278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584, 761, 556, 278, 222, 556, 333, 1000, 556, 556, 333, 1000, 667, 333, 1000, 278, 611, 278, 278, 222, 222, 333, 333, 350, 556, 1000, 333, 1000, 500, 333, 944, 278, 500, 667, 278, 333, 556, 556, 556, 556, 260, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 556, 537, 278, 333, 333, 365, 556, 834, 834, 834, 611, 667, 667, 667, 667, 667, 667, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 500, 556, 556, 556, 556, 278, 278, 278, 278, 556, 556, 556, 556, 556, 556, 556, 584, 611, 556, 556, 556, 556, 500, 556, 500];
  var BW = [278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611, 975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556, 333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611, 611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584, 761, 556, 278, 278, 556, 500, 1000, 556, 556, 333, 1000, 667, 333, 1000, 278, 611, 278, 278, 278, 278, 500, 500, 350, 556, 1000, 333, 1000, 556, 333, 944, 278, 500, 667, 278, 333, 556, 556, 556, 556, 280, 556, 333, 737, 370, 556, 584, 333, 737, 333, 400, 584, 333, 333, 333, 611, 556, 278, 333, 333, 365, 556, 834, 834, 834, 611, 722, 722, 722, 722, 722, 722, 1000, 722, 667, 667, 667, 667, 278, 278, 278, 278, 722, 722, 778, 778, 778, 778, 778, 584, 778, 722, 722, 722, 722, 667, 667, 611, 556, 556, 556, 556, 556, 556, 889, 556, 556, 556, 556, 556, 278, 278, 278, 278, 611, 611, 611, 611, 611, 611, 611, 584, 611, 611, 611, 611, 611, 556, 611, 556];

  var MAP = { 8216: "'", 8217: "'", 8220: '"', 8221: '"', 8211: '-', 8212: '-', 8230: '...', 8364: 128, 160: 32 };
  function code(ch) {
    var c = ch.charCodeAt(0);
    if (MAP[c] !== undefined) { c = typeof MAP[c] === 'string' ? MAP[c].charCodeAt(0) : MAP[c]; }
    return c > 255 ? 63 : (c < 32 ? 32 : c);
  }
  function clean(s) {
    s = String(s == null ? '' : s);
    try { s = s.normalize('NFC'); } catch (e) { /* ignore */ }
    var out = '';
    for (var i = 0; i < s.length; i++) { out += String.fromCharCode(code(s.charAt(i))); }
    return out;
  }
  function width(s, size, bold) {
    var t = bold ? BW : HW, w = 0;
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i) - 32; w += (t[c] === undefined ? 556 : t[c]); }
    return w * size / 1000;
  }
  function fit(s, maxW, size, bold) {
    s = clean(s);
    if (width(s, size, bold) <= maxW) { return s; }
    var ell = '...';
    while (s.length > 1 && width(s + ell, size, bold) > maxW) { s = s.slice(0, -1); }
    return s + ell;
  }
  function esc(s) { return s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)'); }
  function num(n) { return (Math.round(n * 100) / 100).toString(); }

  /* size of a JPEG picture (reads the SOF marker) */
  function jpegInfo(buf) {
    var b = new Uint8Array(buf);
    if (b.length < 4 || b[0] !== 0xFF || b[1] !== 0xD8) { return null; }
    var i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xFF) { i++; continue; }
      var m = b[i + 1];
      if (m === 0xFF) { i++; continue; }
      if (m >= 0xC0 && m <= 0xCF && m !== 0xC4 && m !== 0xC8 && m !== 0xCC) {
        return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8], comps: b[i + 9], bytes: b };
      }
      i += 2 + ((b[i + 2] << 8) | b[i + 3]);
    }
    return null;
  }

  function build(o) {
    var PW = 842, PH = 595, M = 28, ROWFONT = 8.5, HEADFONT = 8.5;
    var cols = o.columns, totalW = cols.reduce(function (a, c) { return a + c.w; }, 0), usable = PW - 2 * M;
    var xs = [], x = M, widths = cols.map(function (c) { return c.w * usable / totalW; });
    widths.forEach(function (w) { xs.push(x); x += w; });
    var withImg = o.rows.some(function (r) { return r.image; });
    var rowH = withImg ? 44 : 19;
    var headH = 22, topFirst = 74, topNext = 40, bottom = 34;

    var pages = [], cur = null, y = 0, images = [], imgIndex = new Map();
    function newPage(first) {
      cur = { ops: [], imgs: {} };
      pages.push(cur);
      y = PH - (first ? topFirst : topNext);
      if (first) {
        cur.ops.push('BT /F2 17 Tf ' + num(M) + ' ' + num(PH - 38) + ' Td (' + esc(fit(o.title, usable, 17, true)) + ') Tj ET');
        if (o.subtitle) { cur.ops.push('BT /F1 9.5 Tf 0.35 0.4 0.5 rg ' + num(M) + ' ' + num(PH - 54) + ' Td (' + esc(fit(o.subtitle, usable, 9.5, false)) + ') Tj 0 g ET'); }
      }
      header();
    }
    function header() {
      cur.ops.push('0.91 0.93 0.97 rg ' + num(M) + ' ' + num(y - headH + 4) + ' ' + num(usable) + ' ' + num(headH) + ' re f 0 g');
      cols.forEach(function (c, i) {
        var t = fit(c.label, widths[i] - 8, HEADFONT, true);
        var tx = c.align === 'right' ? xs[i] + widths[i] - 4 - width(t, HEADFONT, true) : xs[i] + 4;
        cur.ops.push('BT /F2 ' + HEADFONT + ' Tf ' + num(tx) + ' ' + num(y - headH + 11) + ' Td (' + esc(t) + ') Tj ET');
      });
      y -= headH;
    }
    function imageRef(img) {
      if (!imgIndex.has(img)) { imgIndex.set(img, images.length); images.push(img); }
      return 'Im' + imgIndex.get(img);
    }
    newPage(true);
    o.rows.forEach(function (r, ri) {
      if (y - rowH < bottom) { newPage(false); }
      if (ri % 2 === 1) { cur.ops.push('0.97 0.975 0.985 rg ' + num(M) + ' ' + num(y - rowH + 4) + ' ' + num(usable) + ' ' + num(rowH) + ' re f 0 g'); }
      cols.forEach(function (c, i) {
        if (c.key === '_photo') {
          if (r.image) {
            var inf = r.image, side = rowH - 8, k = Math.min(side / inf.w, side / inf.h), dw = inf.w * k, dh = inf.h * k;
            var nm = imageRef(inf);
            cur.imgs[nm] = true;
            cur.ops.push('q ' + num(dw) + ' 0 0 ' + num(dh) + ' ' + num(xs[i] + 4) + ' ' + num(y - rowH + 8) + ' cm /' + nm + ' Do Q');
          }
          return;
        }
        var raw = r.cells[c.key], t = fit(raw, widths[i] - 8, ROWFONT, false);
        var tx = c.align === 'right' ? xs[i] + widths[i] - 4 - width(t, ROWFONT, false) : xs[i] + 4;
        var col = (r.red && r.red[c.key]) ? '0.78 0.12 0.1 rg ' : '';
        cur.ops.push('BT /F1 ' + ROWFONT + ' Tf ' + col + num(tx) + ' ' + num(y - rowH / 2 - 0.5) + ' Td (' + esc(t) + ') Tj 0 g ET');
      });
      cur.ops.push('0.85 0.87 0.92 RG 0.5 w ' + num(M) + ' ' + num(y - rowH + 4) + ' m ' + num(M + usable) + ' ' + num(y - rowH + 4) + ' l S');
      y -= rowH;
    });
    if (!o.rows.length) { cur.ops.push('BT /F1 10 Tf ' + num(M + 4) + ' ' + num(y - 16) + ' Td (No records.) Tj ET'); y -= 26; }
    var tot = o.totals || [];
    if (tot.length) {
      if (y - 16 * tot.length - 14 < bottom) { newPage(false); }
      y -= 8;
      tot.forEach(function (t) {
        var s = clean(t[0]) + ':  ' + clean(t[1]);
        cur.ops.push('BT /F2 10 Tf ' + num(M + usable - 4 - width(s, 10, true)) + ' ' + num(y - 10) + ' Td (' + esc(s) + ') Tj ET');
        y -= 16;
      });
    }
    if (o.note) {
      if (y - 24 < bottom) { newPage(false); }
      cur.ops.push('BT /F1 8.5 Tf 0.35 0.4 0.5 rg ' + num(M + 4) + ' ' + num(y - 14) + ' Td (' + esc(fit(o.note, usable - 8, 8.5, false)) + ') Tj 0 g ET');
    }
    pages.forEach(function (p, i) {
      var f = 'Page ' + (i + 1) + ' of ' + pages.length;
      p.ops.push('BT /F1 8 Tf 0.45 0.5 0.6 rg ' + num(PW - M - width(f, 8, false)) + ' ' + num(16) + ' Td (' + esc(f) + ') Tj 0 g ET');
      p.ops.push('BT /F1 8 Tf 0.45 0.5 0.6 rg ' + num(M) + ' 16 Td (' + esc(fit(o.footer || '', usable - 100, 8, false)) + ') Tj 0 g ET');
    });

    /* ----- write the file ----- */
    var chunks = [], offset = 0, offs = {};
    function put(s) { var b; if (typeof s === 'string') { b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) { b[i] = s.charCodeAt(i) & 255; } } else { b = s; } chunks.push(b); offset += b.length; }
    function obj(id, body) { offs[id] = offset; put(id + ' 0 obj\n'); put(body); put('\nendobj\n'); }
    var nObj = 4 + images.length + pages.length * 2;
    put('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    var imgBase = 5, pageBase = imgBase + images.length;
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    var kids = pages.map(function (p, i) { return (pageBase + i * 2 + 1) + ' 0 R'; }).join(' ');
    obj(2, '<< /Type /Pages /Kids [' + kids + '] /Count ' + pages.length + ' >>');
    obj(3, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    obj(4, '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    images.forEach(function (im, i) {
      offs[imgBase + i] = offset;
      put((imgBase + i) + ' 0 obj\n<< /Type /XObject /Subtype /Image /Width ' + im.w + ' /Height ' + im.h + ' /ColorSpace /'
        + (im.comps === 1 ? 'DeviceGray' : im.comps === 4 ? 'DeviceCMYK' : 'DeviceRGB') + ' /BitsPerComponent 8 /Filter /DCTDecode'
        + (im.comps === 4 ? ' /Decode [1 0 1 0 1 0 1 0]' : '') + ' /Length ' + im.bytes.length + ' >>\nstream\n');
      put(im.bytes);
      put('\nendstream\nendobj\n');
    });
    pages.forEach(function (p, i) {
      var cid = pageBase + i * 2, pid = cid + 1, content = p.ops.join('\n');
      offs[cid] = offset;
      put(cid + ' 0 obj\n<< /Length ' + content.length + ' >>\nstream\n'); put(content); put('\nendstream\nendobj\n');
      var xo = Object.keys(p.imgs).map(function (n) { return '/' + n + ' ' + (imgBase + parseInt(n.slice(2), 10)) + ' 0 R'; }).join(' ');
      obj(pid, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + PW + ' ' + PH + '] /Contents ' + cid + ' 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >>'
        + (xo ? ' /XObject << ' + xo + ' >>' : '') + ' >> >>');
    });
    var xref = offset;
    put('xref\n0 ' + (nObj + 1) + '\n0000000000 65535 f \n');
    for (var id = 1; id <= nObj; id++) { put(('0000000000' + offs[id]).slice(-10) + ' 00000 n \n'); }
    put('trailer\n<< /Size ' + (nObj + 1) + ' /Root 1 0 R /Info << /Title (' + esc(clean(o.title)) + ') /Creator (' + esc(clean(o.creator || 'Bike hire')) + ') >> >>\nstartxref\n' + xref + '\n%%EOF\n');
    return new Blob(chunks, { type: 'application/pdf' });
  }

  /* turn a downloaded picture into something the PDF can hold (a JPEG) */
  function toJpeg(blob) {
    return blob.arrayBuffer().then(function (buf) {
      var inf = jpegInfo(buf);
      if (inf) { return inf; }
      return new Promise(function (resolve) {
        var img = new Image(), url = URL.createObjectURL(blob);
        img.onload = function () {
          var k = Math.min(1, 600 / Math.max(img.naturalWidth, img.naturalHeight)), cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(img.naturalWidth * k)); cv.height = Math.max(1, Math.round(img.naturalHeight * k));
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          cv.toBlob(function (b) { URL.revokeObjectURL(url); if (!b) { resolve(null); return; } b.arrayBuffer().then(function (ab) { resolve(jpegInfo(ab)); }); }, 'image/jpeg', 0.75);
        };
        img.onerror = function () { URL.revokeObjectURL(url); resolve(null); };
        img.src = url;
      });
    }).catch(function () { return null; });
  }

  BH.pdf = { build: build, toJpeg: toJpeg, jpegInfo: jpegInfo, textWidth: width };
})();
