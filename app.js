/* Staff pages: shared helpers (dates, money, popups, photo viewer, history, booking requests). */
(function () {
  'use strict';
  var BH = window.BH;
  if (!BH) { return; }

  var offset = 0; // server time minus this device's time, in seconds

  /* ---------- tiny helpers ---------- */
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  var esc = BH.esc;
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function now() { return Date.now() / 1000 + offset; }
  function syncClock(serverNow) { if (serverNow) { offset = serverNow - Date.now() / 1000; } }
  function natCmp(a, b) { return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' }); }

  var fmtCache = {};
  function dtf(opts, tz) {
    var k = JSON.stringify(opts) + (tz || '');
    if (!fmtCache[k]) {
      var o = {}, key;
      for (key in opts) { o[key] = opts[key]; }
      try {
        o.timeZone = tz || BH.tz;
        fmtCache[k] = new Intl.DateTimeFormat('en-GB', o);
      } catch (e) {
        delete o.timeZone;
        fmtCache[k] = new Intl.DateTimeFormat('en-GB', o);
      }
    }
    return fmtCache[k];
  }
  function fmtTime(ts) {
    var d = new Date(ts * 1000);
    var t = dtf({ hour: 'numeric', minute: '2-digit', hour12: true }).format(d);
    var day = dtf({ day: 'numeric', month: 'short' }).format(d);
    var today = dtf({ day: 'numeric', month: 'short' }).format(new Date(now() * 1000));
    if (day === today) { return t; }
    return dtf({ weekday: 'short' }).format(d) + ' ' + day + ', ' + t;
  }
  function fmtFull(ts) {
    return dtf({ weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true }).format(new Date(ts * 1000));
  }
  function fmtDur(sec) {
    sec = Math.max(0, Math.floor(sec));
    var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return h ? h + 'h ' + pad(m) + 'm ' + pad(s) + 's' : m + 'm ' + pad(s) + 's';
  }
  function fmtMin(min) {
    min = Math.round(min);
    if (min < 60) { return min + ' min'; }
    var h = Math.floor(min / 60), m = min % 60;
    return h + ' h' + (m ? ' ' + m + ' min' : '');
  }
  function fmtClock(hhmm) {
    var m = /^(\d\d):(\d\d)$/.exec(hhmm || '');
    if (!m) { return ''; }
    var h = +m[1];
    return (h % 12 || 12) + ':' + m[2] + ' ' + (h < 12 ? 'AM' : 'PM');
  }
  function todayStr() {
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: BH.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now() * 1000)); }
    catch (e) { return new Date(now() * 1000).toISOString().slice(0, 10); }
  }
  function fmtDay(ds) {
    var t = todayStr();
    if (ds === t) { return 'Today'; }
    var tm = new Date(t + 'T12:00:00Z'); tm.setUTCDate(tm.getUTCDate() + 1);
    if (ds === tm.toISOString().slice(0, 10)) { return 'Tomorrow'; }
    return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(ds + 'T12:00:00Z'));
  }
  function money(n) { return BH.currency + ' ' + Number(n || 0).toLocaleString('en-US'); }
  function amountNow(r) { return BH.amountFor(r, now()); }
  function extraNow(r) { return Math.max(0, BH.amountFor(r, now()) - BH.baseFor(r)); }
  function statusOf(r) {
    if (!r) { return 'free'; }
    if (r.returned) { return 'done'; }
    return now() > r.due ? 'late' : 'out';
  }
  function api(action, opts) { return BH.api(action, opts || {}); }

  /* ---------- popup and message ---------- */
  function closeModal() {
    var o = $('.overlay');
    if (o) { o.parentNode.removeChild(o); }
    if (!$('.lightbox')) { document.body.classList.remove('noscroll'); }
  }
  function openModal(html) {
    closeModal();
    var o = document.createElement('div');
    o.className = 'overlay';
    o.innerHTML = '<div class="modal" role="dialog" aria-modal="true">' + html + '</div>';
    o.addEventListener('mousedown', function (e) { if (e.target === o) { closeModal(); } });
    document.body.appendChild(o);
    document.body.classList.add('noscroll');
    var m = o.firstChild;
    $$('[data-close]', m).forEach(function (b) { b.addEventListener('click', closeModal); });
    var f = $('[autofocus]', m);
    if (f) { f.focus(); }
    return m;
  }

  function toast(msg, kind) {
    var box = $('#toasts');
    if (!box) { return; }
    var t = document.createElement('div');
    t.className = 'toast ' + (kind || '');
    t.setAttribute('role', kind === 'err' ? 'alert' : 'status');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(function () {
      t.classList.add('out');
      setTimeout(function () { if (t.parentNode) { t.parentNode.removeChild(t); } }, 350);
    }, kind === 'err' ? 6000 : 3800);
  }

  /* ---------- photos: signed links, and a big viewer when tapped ---------- */
  function hydrate(root) {
    var list = [];
    if (root.matches && root.matches('img[data-ph]')) { list.push(root); }
    list = list.concat($$('img[data-ph]', root));
    list.forEach(function (img) {
      if (img.getAttribute('data-ph-done')) { return; }
      img.setAttribute('data-ph-done', '1');
      var p = img.getAttribute('data-ph');
      if (!p) { img.style.visibility = 'hidden'; return; }
      if (/^(blob:|data:)/.test(p)) { img.src = p; return; }
      BH.photoUrl(p).then(function (u) {
        if (u) { img.src = u; } else { img.style.visibility = 'hidden'; }
      });
    });
  }
  if (window.MutationObserver) {
    new MutationObserver(function (muts) {
      muts.forEach(function (m) {
        Array.prototype.forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) { hydrate(n); } });
      });
    }).observe(document.body, { childList: true, subtree: true });
  }
  hydrate(document.body);

  function closeLightbox() {
    var l = $('.lightbox');
    if (l) { l.parentNode.removeChild(l); }
    if (!$('.overlay')) { document.body.classList.remove('noscroll'); }
  }
  function openPhoto(src, caption) {
    closeLightbox();
    var l = document.createElement('div');
    l.className = 'lightbox';
    l.setAttribute('role', 'dialog');
    l.setAttribute('aria-label', 'Photo');
    l.innerHTML = '<button type="button" class="lb-close" aria-label="Close photo">&times;</button>'
      + '<div class="lb-scroll"><img class="lb-img" alt="' + esc(caption || 'Photo') + '" src="' + esc(src) + '"></div>'
      + (caption ? '<p class="lb-cap">' + esc(caption) + '</p>' : '') + '<p class="lb-hint">Tap the photo to zoom. Tap outside to close.</p>';
    document.body.appendChild(l);
    document.body.classList.add('noscroll');
    var img = $('.lb-img', l), sc = $('.lb-scroll', l);
    img.addEventListener('click', function (e) { e.stopPropagation(); l.classList.toggle('zoom'); });
    sc.addEventListener('click', function (e) { if (e.target === sc) { closeLightbox(); } });
    $('.lb-close', l).addEventListener('click', closeLightbox);
    l.addEventListener('click', function (e) { if (e.target === l) { closeLightbox(); } });
    $('.lb-close', l).focus();
  }
  document.addEventListener('click', function (e) {
    var img = e.target.closest ? e.target.closest('img[data-ph]') : null;
    if (!img || img.closest('.lightbox') || !img.getAttribute('src')) { return; }
    e.preventDefault();
    e.stopPropagation();
    openPhoto(img.getAttribute('src'), img.getAttribute('data-cap') || '');
  }, true);
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') { return; }
    if ($('.lightbox')) { closeLightbox(); } else { closeModal(); }
  });

  /* ---------- live timers: tick every second ---------- */
  function tickLive() {
    var t = now(), flip = false;
    $$('[data-due]').forEach(function (el) {
      var left = +el.getAttribute('data-due') - t;
      var late = left < 0;
      if (late !== el.classList.contains('late')) { flip = true; }
      var v = $('.t-val', el);
      if (v) { v.textContent = fmtDur(Math.abs(left)); }
      var l = $('.t-label', el);
      if (l) { l.textContent = late ? 'Overdue by' : 'Time left'; }
      var a = $('.amt', el);
      if (a) {
        var rr = { start: +el.getAttribute('data-start'), due: +el.getAttribute('data-due'), grace: +el.getAttribute('data-grace'),
          rate: +el.getAttribute('data-rate'), billing: el.getAttribute('data-billing') || 'v1' };
        var tot = BH.amountFor(rr, t), extra = Math.max(0, tot - BH.baseFor(rr));
        a.textContent = money(tot);
        var ov = $('.over', el);
        if (ov) { ov.textContent = extra > 0 && late ? ' (includes ' + money(extra) + ' overtime)' : ''; }
      }
    });
    if (flip && BH.onFlip) { BH.onFlip(); }
  }
  function tickClock() {
    var c = $('#clock');
    if (c) { c.textContent = fmtFull(now()) + ' (' + BH.tz + ')' + (BH.isOffline() ? ' - offline' : ''); }
  }
  setInterval(function () { tickLive(); tickClock(); if (BH.tick) { BH.tick(); } }, 1000);
  tickClock();

  /* ---------- rows, details, history ---------- */
  function liveAttrs(r) {
    return ' data-due="' + r.due + '" data-start="' + r.start + '" data-grace="' + r.grace + '" data-rate="' + r.rate + '" data-billing="' + esc(r.billing || 'v1') + '"';
  }
  function thumbHtml(r, cls) {
    if (!r.has_photo) { return '<div class="' + cls + '"></div>'; }
    return '<img class="' + cls + '" data-ph="' + esc(r.photo || '') + '" data-cap="' + esc(r.name + ' · ' + r.reg) + '" alt="" loading="lazy">';
  }

  function rowHtml(r, showOp) {
    var s = statusOf(r);
    var line2 = 'Bike ' + esc(r.bike) + ' · ' + esc(r.reg) + (r.phone ? ' · ' + esc(r.phone) : '');
    var line3 = 'Out ' + esc(fmtTime(r.start)) + (r.returned ? ' → back ' + esc(fmtTime(r.returned)) : ' · due ' + esc(fmtTime(r.due)));
    if (showOp && r.stand) { line3 += ' · ' + esc(r.stand); }
    if (showOp && r.operator) { line3 += ' · ' + esc(r.operator); }
    var side;
    if (s === 'done') {
      side = '<span class="pill done">Returned</span><div class="meta small">' + esc(money(r.amount)) + '</div>';
    } else {
      side = '<span class="pill ' + s + '">' + (s === 'late' ? 'Overdue' : 'Out') + '</span>'
        + '<div class="meta small"><span class="t-label"></span></div><span class="t-val"></span>'
        + '<div class="meta small"><span class="amt"></span><span class="over"></span></div>';
    }
    return '<div class="hrow ' + (s === 'late' ? 'late' : '') + '" role="button" tabindex="0" data-id="' + esc(r.id) + '"'
      + (s === 'done' ? '' : liveAttrs(r)) + '>'
      + thumbHtml(r, 'hthumb')
      + '<div class="hmain"><b>' + esc(r.name) + '</b><div class="meta small">' + line2 + '</div><div class="meta small">' + line3 + '</div></div>'
      + '<div class="hside">' + side + '</div></div>';
  }

  function openDetails(r) {
    var s = statusOf(r);
    var dl = [
      ['Bike', esc(r.bike)],
      r.stand ? ['Pick-up', esc(r.stand)] : null,
      ['Registration no', esc(r.reg)],
      ['Phone', r.phone ? '<a href="tel:' + esc(r.phone) + '">' + esc(r.phone) + '</a>' : 'Not given'],
      ['Taken', esc(fmtTime(r.start))],
      ['Due back', esc(fmtTime(r.due))],
      ['Booked', esc(fmtMin(r.minutes)) + ' at ' + esc(money(r.rate)) + ' per hour']
    ].filter(Boolean);
    if (r.returned) {
      var ex = Math.max(0, (r.amount || 0) - BH.baseFor(r));
      dl.push(['Returned', esc(fmtTime(r.returned))], ['Paid', esc(money(r.amount)) + (r.billing === 'v2' && ex > 0 ? ' (includes ' + esc(money(ex)) + ' overtime)' : '')]);
    } else {
      dl.push(['Amount so far', esc(money(amountNow(r)))]);
    }
    if (r.operator) {
      dl.push(['Operator', esc(r.operator) + (r.operator_phone ? ' (<a href="tel:' + esc(r.operator_phone) + '">' + esc(r.operator_phone) + '</a>)' : '')]);
    }
    var canAct = BH.me && BH.me.role === 'operator' && s !== 'done' && BH.openReturn;
    var html = '<h2>' + esc(r.name) + ' <span class="pill ' + s + '">' + (s === 'late' ? 'Overdue' : s === 'done' ? 'Returned' : 'Out') + '</span></h2>'
      + (r.has_photo ? '<img class="bigphoto" data-ph="' + esc(r.photo || '') + '" data-cap="' + esc(r.name + ' · ' + r.reg) + '" alt="Photo of ' + esc(r.name) + '"><p class="muted small center" style="margin-top:6px">Tap the photo to see it bigger.</p>' : '')
      + '<dl class="dl">' + dl.map(function (x) { return '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd>'; }).join('') + '</dl>'
      + '<div class="row"><button class="btn" data-close>Close</button>'
      + (BH.me && BH.me.role === 'admin' ? '<button class="btn" data-x="flag">Add to warning list</button>' : '')
      + (canAct ? '<button class="btn" data-x="extend">Add time</button><button class="btn primary" data-x="return">Return bike</button>' : '') + '</div>';
    var m = openModal(html);
    if (canAct) {
      $('[data-x="return"]', m).addEventListener('click', function () { BH.openReturn(r.id); });
      $('[data-x="extend"]', m).addEventListener('click', function () { BH.openExtend(r.id); });
    }
    var fl = $('[data-x="flag"]', m);
    if (fl) {
      fl.addEventListener('click', function () {
        var note = window.prompt('Write a short note about ' + r.name + ' (' + r.reg + '). Operators will see it when this registration number is used.', '');
        if (!note || note.trim().length < 2) { return; }
        api('add_flag', { body: { reg: r.reg, note: note.trim() } }).then(function (res) {
          if (res.error) { toast(res.error, 'err'); return; }
          toast('Added to the warning list.');
        });
      });
    }
  }

  /* ---------- downloads: CSV and PDF ---------- */
  function csvCell(v) {
    v = String(v == null ? '' : v);
    if (v !== '' && '=+-@\t\r'.indexOf(v.charAt(0)) >= 0) { v = "'" + v; }
    return '"' + v.replace(/"/g, '""') + '"';
  }
  function csvDate(ts) {
    if (!ts) { return ''; }
    var p = {};
    dtf({ year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date(ts * 1000))
      .forEach(function (x) { p[x.type] = x.value; });
    return p.year + '-' + p.month + '-' + p.day + ' ' + (p.hour === '24' ? '00' : p.hour) + ':' + p.minute;
  }
  function saveBlob(blob, name) {
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.parentNode.removeChild(a); }, 1500);
  }
  /* the moment a calendar day starts in the business time zone (seconds) */
  function dayStart(ds) {
    var m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(ds);
    if (!m) { return 0; }
    var guess = Date.UTC(+m[1], +m[2] - 1, +m[3]) / 1000;
    function off(ts) {
      var p = {};
      dtf({ year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(new Date(ts * 1000))
        .forEach(function (x) { p[x.type] = x.value; });
      return Date.UTC(+p.year, +p.month - 1, +p.day, p.hour === '24' ? 0 : +p.hour, +p.minute, +p.second) / 1000 - ts;
    }
    var t = guess - off(guess);
    return guess - off(t);
  }
  function addDays(ds, n) {
    var d = new Date(ds + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10);
  }
  function statusText(r, t) { return r.returned ? 'Returned' : (r.due < t ? 'Overdue' : 'Out'); }

  function makeCsv(rentals) {
    var t = now();
    var lines = [['Pick-up', 'Bike', 'Renter', 'Registration no', 'Phone', 'Taken', 'Due', 'Returned', 'Minutes booked', 'Rate per hour', 'Amount', 'Overtime part', 'Status', 'Operator']];
    rentals.forEach(function (r) {
      var extra = r.returned && r.billing === 'v2' ? Math.max(0, (r.amount || 0) - BH.baseFor(r)) : '';
      lines.push([r.stand || '', r.bike, r.name, r.reg, r.phone, csvDate(r.start), csvDate(r.due), csvDate(r.returned), r.minutes, r.rate,
        r.amount == null ? '' : r.amount, extra, statusText(r, t), r.operator]);
    });
    return new Blob(['﻿' + lines.map(function (l) { return l.map(csvCell).join(','); }).join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  }

  function fetchPhotos(rentals, onProgress) {
    var idx = 0, done = 0, out = {}, N = 5;
    var list = rentals.filter(function (r) { return r.has_photo && r.photo; });
    return new Promise(function (resolve) {
      if (!list.length) { resolve(out); return; }
      function next() {
        if (idx >= list.length) { if (done >= list.length) { resolve(out); } return; }
        var r = list[idx++];
        BH.photoUrl(r.photo).then(function (u) {
          if (!u) { return null; }
          return fetch(u).then(function (res) { return res.ok ? res.blob() : null; });
        }).then(function (blob) { return blob ? BH.pdf.toJpeg(blob) : null; })
          .catch(function () { return null; })
          .then(function (info) {
            if (info) { out[r.id] = info; }
            done++;
            if (onProgress) { onProgress(done, list.length); }
            if (done >= list.length) { resolve(out); } else { next(); }
          });
      }
      for (var i = 0; i < Math.min(N, list.length); i++) { next(); }
    });
  }

  function makePdf(rentals, label, withPhotos, onProgress) {
    var t = now(), staffName = BH.me ? BH.me.display_name : '';
    var photosP = withPhotos ? fetchPhotos(rentals, onProgress) : Promise.resolve({});
    return photosP.then(function (photos) {
      var cols = [];
      if (withPhotos) { cols.push({ key: '_photo', label: 'Photo', w: 40 }); }
      cols = cols.concat([
        { key: 'name', label: 'Renter', w: 105 }, { key: 'reg', label: 'Registration no', w: 78 }, { key: 'phone', label: 'Phone', w: 68 },
        { key: 'bike', label: 'Bike', w: 32 }, { key: 'stand', label: 'Pick-up', w: 70 }, { key: 'taken', label: 'Taken', w: 82 },
        { key: 'due', label: 'Due', w: 82 }, { key: 'ret', label: 'Returned', w: 82 }, { key: 'amt', label: 'Amount', w: 52, align: 'right' },
        { key: 'status', label: 'Status', w: 48 }]);
      var total = 0, out = 0, late = 0;
      var rows = rentals.map(function (r) {
        if (r.returned) { total += r.amount || 0; } else { out++; }
        if (!r.returned && r.due < t) { late++; }
        var st = statusText(r, t);
        return {
          cells: { name: r.name, reg: r.reg, phone: r.phone || '', bike: r.bike, stand: r.stand || '', taken: csvDate(r.start), due: csvDate(r.due),
            ret: csvDate(r.returned), amt: r.amount == null ? '' : money(r.amount), status: st },
          image: photos[r.id] || null, red: st === 'Overdue' ? { status: 1 } : null
        };
      });
      var s = BH.settings;
      return BH.pdf.build({
        title: s.business_name + ' - Rental history',
        subtitle: label + '  |  Created ' + csvDate(t) + (staffName ? ' by ' + staffName : ''),
        columns: cols, rows: rows,
        totals: [['Rentals listed', String(rentals.length)], ['Collected (returned bikes)', money(total)], ['Still out', out + (late ? ' (' + late + ' overdue)' : '')]],
        note: 'This list contains customers\' personal details. Keep it safe and share it only when you must.',
        footer: s.business_name, creator: s.business_name
      });
    });
  }

  function openExport() {
    var today = todayStr();
    var m = openModal('<form id="exForm" autocomplete="off"><h2>Download history</h2>'
      + '<label>Which rentals?<select name="range">'
      + '<option value="all">Everything</option><option value="today">Today</option><option value="week">Last 7 days</option>'
      + '<option value="month">This month</option><option value="custom">Choose dates</option></select></label>'
      + '<div class="fgrid" id="exDates" hidden><label>From<input type="date" name="from" value="' + today + '"></label><label>To<input type="date" name="to" value="' + today + '"></label></div>'
      + '<fieldset><legend>File type</legend><div class="chips">'
      + '<button type="button" class="chip" data-f="pdf" aria-pressed="true">PDF</button><button type="button" class="chip" data-f="csv" aria-pressed="false">CSV (Excel)</button></div></fieldset>'
      + '<label class="checkrow" id="exPhotoRow"><input type="checkbox" name="photos"> Include renters\' photos in the PDF</label>'
      + '<p class="muted small" id="exNote">Photos make the file bigger and slower to make (up to 300 rentals at a time). They are people\'s pictures, so only include them when you need to.</p>'
      + '<p class="err" id="exErr" role="alert" hidden></p>'
      + '<div class="row"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit" id="exGo">Download</button></div></form>');
    var form = $('#exForm', m), fmt = 'pdf', err = $('#exErr', m), go = $('#exGo', m);
    form.elements.range.addEventListener('change', function () { $('#exDates', m).hidden = this.value !== 'custom'; });
    $$('.chip', m).forEach(function (c) {
      c.addEventListener('click', function () {
        fmt = c.getAttribute('data-f');
        $$('.chip', m).forEach(function (x) { x.setAttribute('aria-pressed', x === c ? 'true' : 'false'); });
        $('#exPhotoRow', m).hidden = fmt !== 'pdf'; $('#exNote', m).hidden = fmt !== 'pdf';
      });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      err.hidden = true;
      var rg = form.elements.range.value, from = null, to = null, label = 'All rentals';
      if (rg === 'today') { from = dayStart(today); to = dayStart(addDays(today, 1)); label = 'Today (' + today + ')'; }
      else if (rg === 'week') { from = dayStart(addDays(today, -6)); to = dayStart(addDays(today, 1)); label = 'Last 7 days (to ' + today + ')'; }
      else if (rg === 'month') { from = dayStart(today.slice(0, 8) + '01'); to = dayStart(addDays(today, 1)); label = 'This month (' + today.slice(0, 7) + ')'; }
      else if (rg === 'custom') {
        var f = form.elements.from.value, t2 = form.elements.to.value;
        if (!f || !t2 || t2 < f) { err.textContent = 'Choose a start date and an end date that is the same day or later.'; err.hidden = false; return; }
        from = dayStart(f); to = dayStart(addDays(t2, 1)); label = f + ' to ' + t2;
      }
      var withPhotos = fmt === 'pdf' && form.elements.photos.checked;
      go.disabled = true; go.textContent = 'Preparing...';
      api('export', { params: { from: from, to: to } }).then(function (res) {
        if (res.error) { throw new Error(res.error); }
        var list = res.rentals || [];
        if (withPhotos && list.length > 300) { throw new Error('A PDF with photos can hold up to 300 rentals. You chose ' + list.length + '. Pick a shorter range.'); }
        if (fmt === 'csv') { saveBlob(makeCsv(list), 'rentals-' + today + '.csv'); return; }
        return makePdf(list, label, withPhotos, function (d, n) { go.textContent = 'Photos ' + d + '/' + n + '...'; }).then(function (blob) {
          saveBlob(blob, 'rentals-' + today + '.pdf');
        });
      }).then(function () { closeModal(); toast('Download ready.'); }, function (er) {
        go.disabled = false; go.textContent = 'Download';
        err.textContent = er.message || 'Could not make the file.'; err.hidden = false;
      });
    });
  }
  function downloadCsv() {
    return api('export', {}).then(function (res) {
      if (res.error) { toast(res.error, 'err'); return; }
      saveBlob(makeCsv(res.rentals), 'rentals-' + todayStr() + '.csv');
    });
  }

  function createHistory(root, showOp) {
    root.innerHTML = '<div class="hfilters">'
      + '<input type="search" class="h-q" placeholder="Search name, reg. no., phone or bike" aria-label="Search rentals" autocomplete="off">'
      + '<select class="h-status" aria-label="Show"><option value="all">All</option><option value="out">Out now</option><option value="overdue">Overdue</option><option value="returned">Returned</option></select>'
      + '<button type="button" class="btn small h-csv">Download</button></div>'
      + '<div class="h-list"></div><div class="center"><button type="button" class="btn h-more" hidden>Show more</button></div>';
    var q = $('.h-q', root), st = $('.h-status', root), list = $('.h-list', root), more = $('.h-more', root);
    var rows = [], pos = 0, timer = null, token = 0;

    function load(reset) {
      if (reset) { pos = 0; }
      var mine = ++token;
      api('history', { params: { q: q.value, status: st.value, limit: 30, offset: pos } }).then(function (res) {
        if (mine !== token) { return; }
        if (res.error) { toast(res.error, 'err'); return; }
        syncClock(res.now);
        if (reset) { rows = []; list.innerHTML = ''; }
        rows = rows.concat(res.rentals);
        list.insertAdjacentHTML('beforeend', res.rentals.map(function (r) { return rowHtml(r, showOp); }).join(''));
        pos += res.rentals.length;
        more.hidden = !res.more;
        if (!rows.length) { list.innerHTML = '<p class="muted center">No rentals found.</p>'; }
        tickLive();
      });
    }
    q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { load(true); }, 300); });
    st.addEventListener('change', function () { load(true); });
    more.addEventListener('click', function () { load(false); });
    $('.h-csv', root).addEventListener('click', function () { openExport(); });
    function open(e) {
      var el = e.target.closest ? e.target.closest('.hrow') : null;
      if (!el) { return; }
      var id = el.getAttribute('data-id');
      for (var i = 0; i < rows.length; i++) { if (rows[i].id === id) { openDetails(rows[i]); return; } }
    }
    list.addEventListener('click', open);
    list.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(e); } });
    return { reload: function () { load(true); } };
  }

  /* ---------- booking requests from students ---------- */
  function siteBase() { return location.origin + location.pathname.replace(/[^/]*$/, ''); }
  /* a WhatsApp link with the answer already written */
  function waLink(q, decision, message, bike) {
    var num = BH.waNumber(q.phone);
    if (!num) { return ''; }
    var when = fmtDay(q.date) + (q.time ? ' at ' + fmtClock(q.time) : '');
    var first = String(q.name || '').trim().split(/\s+/)[0] || 'there';
    var link = siteBase() + 'status.html?code=' + encodeURIComponent(q.code);
    var text = 'Hello ' + first + ', about your bike request for ' + when + (q.stand ? ' at ' + q.stand : '') + ': '
      + (decision === 'approved'
        ? 'it is APPROVED.' + (bike ? ' Your bike: ' + bike + '.' : '')
        : 'sorry, it was not approved.')
      + (message ? ' ' + message : '') + ' You can also check here: ' + link;
    return 'https://wa.me/' + num + '?text=' + encodeURIComponent(text);
  }
  function reqHtml(q, o) {
    o = o || {};
    var st = q.status;
    var when = fmtDay(q.date) + (q.time ? ' at ' + fmtClock(q.time) : '') + ' · ' + fmtMin(q.minutes);
    var btns = '';
    if (st === 'pending') {
      btns = '<button class="btn primary" data-ra="approve" data-id="' + esc(q.id) + '">Approve</button>'
        + '<button class="btn" data-ra="decline" data-id="' + esc(q.id) + '">Decline</button>';
    } else {
      var wa = waLink(q, 'approved', q.message, q.bike);
      btns = (o.canLease ? '<button class="btn primary" data-ra="lease" data-id="' + esc(q.id) + '">Lease now</button>' : '')
        + (wa ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(wa) + '">WhatsApp</a>' : '')
        + '<button class="btn ghost" data-ra="decline" data-id="' + esc(q.id) + '">Cancel approval</button>';
    }
    return '<article class="req ' + esc(st) + '">'
      + '<div class="req-top"><b>' + esc(q.name) + '</b><span class="pill ' + (st === 'approved' ? 'free' : 'out') + '">' + (st === 'approved' ? 'Approved' : 'Waiting') + '</span></div>'
      + '<div class="req-when">' + esc(when) + '</div>'
      + '<div class="meta">' + esc(q.reg) + ' · <a href="tel:' + esc(q.phone) + '">' + esc(q.phone) + '</a></div>'
      + (q.flag ? '<div class="flagline">&#9888; ' + esc(q.flag) + '</div>' : '')
      + (o.showStand && q.stand ? '<div class="meta small">Pick-up: ' + esc(q.stand) + '</div>' : '')
      + (q.note ? '<div class="meta">&ldquo;' + esc(q.note) + '&rdquo;</div>' : '')
      + (st === 'approved' && (q.bike || q.message) ? '<div class="meta small">' + (q.bike ? 'Bike ' + esc(q.bike) + '. ' : '') + esc(q.message) + '</div>' : '')
      + '<div class="meta small">Code ' + esc(q.code) + '</div>'
      + '<div class="actions">' + btns + '</div></article>';
  }

  function openDecide(q, decision, freeBikes, done) {
    var approve = decision === 'approved';
    var bikeSel = '';
    if (approve && freeBikes) {
      bikeSel = '<label>Bike for this student (optional)<select name="bike"><option value="">No bike chosen yet</option>'
        + (freeBikes || []).map(function (b) { return '<option value="' + esc(b) + '">Bike ' + esc(b) + '</option>'; }).join('') + '</select></label>';
    }
    var m = openModal('<form id="decForm" autocomplete="off"><h2>' + (approve ? 'Approve' : 'Decline') + ' ' + esc(q.name) + '?</h2>'
      + '<p class="muted">' + esc(fmtDay(q.date) + (q.time ? ' at ' + fmtClock(q.time) : '') + ' · ' + fmtMin(q.minutes)) + '</p>'
      + (q.flag ? '<p class="flagline">&#9888; ' + esc(q.flag) + '</p>' : '')
      + bikeSel
      + '<label>Message to the student (optional)<textarea name="message" rows="3" maxlength="300" placeholder="' + (approve ? 'For example: Come to the main gate at 10.' : 'For example: Sorry, no bikes are free that day.') + '"></textarea></label>'
      + '<p class="muted small">The student sees this when they check their code on the website.</p>'
      + '<p class="err" id="decErr" role="alert" hidden></p>'
      + '<div class="row"><button type="button" class="btn" data-close>Back</button><button class="btn ' + (approve ? 'primary' : 'danger') + '" type="submit">' + (approve ? 'Approve' : 'Decline') + '</button></div></form>');
    $('#decForm', m).addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('button[type=submit]', m);
      var message = this.elements.message.value, bike = approve && this.elements.bike ? this.elements.bike.value : '';
      btn.disabled = true;
      api('decide', { body: { id: q.id, decision: decision, message: message, bike: bike } }).then(function (res) {
        btn.disabled = false;
        if (res.error) { var er = $('#decErr', m); er.textContent = res.error; er.hidden = false; return; }
        var wa = waLink(q, decision, message, bike);
        if (wa) {
          openModal('<h2>' + (approve ? 'Approved' : 'Declined') + '</h2><p>' + esc(q.name) + ' can see your answer when they check their code on the website.</p>'
            + '<p>You can also tell them straight away on WhatsApp:</p>'
            + '<div class="row"><button class="btn" data-close>Done</button><a class="btn primary" target="_blank" rel="noopener" href="' + esc(wa) + '">Open WhatsApp</a></div>');
        } else {
          closeModal();
          toast(approve ? 'Approved. ' + q.name + ' can see this on the website.' : 'Declined.');
        }
        if (done) { done(); }
      });
    });
  }

  BH.u = {
    $: $, $$: $$, esc: esc, api: api, now: now, syncClock: syncClock, fmtTime: fmtTime, fmtDur: fmtDur, fmtMin: fmtMin,
    fmtDay: fmtDay, fmtClock: fmtClock, todayStr: todayStr, money: money, statusOf: statusOf, extraNow: extraNow,
    saveBlob: saveBlob, makeCsv: makeCsv, makePdf: makePdf, dayStart: dayStart, addDays: addDays, csvDate: csvDate, openExport: openExport, waLink: waLink,
    natCmp: natCmp, toast: toast, openModal: openModal, closeModal: closeModal, rowHtml: rowHtml, openDetails: openDetails,
    createHistory: createHistory, liveAttrs: liveAttrs, thumbHtml: thumbHtml, tickLive: tickLive, amountNow: amountNow,
    openPhoto: openPhoto, reqHtml: reqHtml, openDecide: openDecide, downloadCsv: downloadCsv
  };
})();
