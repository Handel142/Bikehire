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
  function billable(start, end, grace) {
    var net = Math.max(0, Math.max(0, end - start) - grace * 60);
    return Math.max(1, Math.ceil(net / 3600));
  }
  function amountNow(r) { return billable(r.start, now(), r.grace) * r.rate; }
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
        a.textContent = money(billable(+el.getAttribute('data-start'), t, +el.getAttribute('data-grace')) * +el.getAttribute('data-rate'));
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
    return ' data-due="' + r.due + '" data-start="' + r.start + '" data-grace="' + r.grace + '" data-rate="' + r.rate + '"';
  }
  function thumbHtml(r, cls) {
    if (!r.has_photo) { return '<div class="' + cls + '"></div>'; }
    return '<img class="' + cls + '" data-ph="' + esc(r.photo || '') + '" data-cap="' + esc(r.name + ' · ' + r.reg) + '" alt="" loading="lazy">';
  }

  function rowHtml(r, showOp) {
    var s = statusOf(r);
    var line2 = 'Bike ' + esc(r.bike) + ' · ' + esc(r.reg) + (r.phone ? ' · ' + esc(r.phone) : '');
    var line3 = 'Out ' + esc(fmtTime(r.start)) + (r.returned ? ' → back ' + esc(fmtTime(r.returned)) : ' · due ' + esc(fmtTime(r.due)));
    if (showOp && r.operator) { line3 += ' · ' + esc(r.operator); }
    var side;
    if (s === 'done') {
      side = '<span class="pill done">Returned</span><div class="meta small">' + esc(money(r.amount)) + '</div>';
    } else {
      side = '<span class="pill ' + s + '">' + (s === 'late' ? 'Overdue' : 'Out') + '</span>'
        + '<div class="meta small"><span class="t-label"></span></div><span class="t-val"></span>'
        + '<div class="meta small amt"></div>';
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
      ['Registration no', esc(r.reg)],
      ['Phone', r.phone ? '<a href="tel:' + esc(r.phone) + '">' + esc(r.phone) + '</a>' : 'Not given'],
      ['Taken', esc(fmtTime(r.start))],
      ['Due back', esc(fmtTime(r.due))]
    ];
    if (r.returned) {
      dl.push(['Returned', esc(fmtTime(r.returned))], ['Paid', esc(money(r.amount))]);
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
      + (canAct ? '<button class="btn" data-x="extend">Add time</button><button class="btn primary" data-x="return">Return bike</button>' : '') + '</div>';
    var m = openModal(html);
    if (canAct) {
      $('[data-x="return"]', m).addEventListener('click', function () { BH.openReturn(r.id); });
      $('[data-x="extend"]', m).addEventListener('click', function () { BH.openExtend(r.id); });
    }
  }

  /* ---------- CSV download ---------- */
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
  function downloadCsv() {
    return api('export').then(function (res) {
      if (res.error) { toast(res.error, 'err'); return; }
      var t = now();
      var lines = [['Bike', 'Renter', 'Registration no', 'Phone', 'Taken', 'Due', 'Returned', 'Minutes booked', 'Rate per hour', 'Amount', 'Status', 'Operator']];
      res.rentals.forEach(function (r) {
        var status = r.returned ? 'Returned' : (r.due < t ? 'Overdue' : 'Out');
        lines.push([r.bike, r.name, r.reg, r.phone, csvDate(r.start), csvDate(r.due), csvDate(r.returned), r.minutes, r.rate,
          r.amount == null ? '' : r.amount, status, r.operator]);
      });
      var text = '﻿' + lines.map(function (l) { return l.map(csvCell).join(','); }).join('\r\n') + '\r\n';
      var a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
      a.download = 'rentals-' + todayStr() + '.csv';
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.parentNode.removeChild(a); }, 1000);
    });
  }

  function createHistory(root, showOp) {
    root.innerHTML = '<div class="hfilters">'
      + '<input type="search" class="h-q" placeholder="Search name, reg. no., phone or bike" aria-label="Search rentals" autocomplete="off">'
      + '<select class="h-status" aria-label="Show"><option value="all">All</option><option value="out">Out now</option><option value="overdue">Overdue</option><option value="returned">Returned</option></select>'
      + '<button type="button" class="btn small h-csv">Download CSV</button></div>'
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
    $('.h-csv', root).addEventListener('click', function () { downloadCsv(); });
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
  function reqHtml(q, o) {
    o = o || {};
    var st = q.status;
    var when = fmtDay(q.date) + (q.time ? ' at ' + fmtClock(q.time) : '') + ' · ' + fmtMin(q.minutes);
    var btns = '';
    if (st === 'pending') {
      btns = '<button class="btn primary" data-ra="approve" data-id="' + esc(q.id) + '">Approve</button>'
        + '<button class="btn" data-ra="decline" data-id="' + esc(q.id) + '">Decline</button>';
    } else {
      btns = (o.canLease ? '<button class="btn primary" data-ra="lease" data-id="' + esc(q.id) + '">Lease now</button>' : '')
        + '<button class="btn ghost" data-ra="decline" data-id="' + esc(q.id) + '">Cancel approval</button>';
    }
    return '<article class="req ' + esc(st) + '">'
      + '<div class="req-top"><b>' + esc(q.name) + '</b><span class="pill ' + (st === 'approved' ? 'free' : 'out') + '">' + (st === 'approved' ? 'Approved' : 'Waiting') + '</span></div>'
      + '<div class="req-when">' + esc(when) + '</div>'
      + '<div class="meta">' + esc(q.reg) + ' · <a href="tel:' + esc(q.phone) + '">' + esc(q.phone) + '</a></div>'
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
      + bikeSel
      + '<label>Message to the student (optional)<textarea name="message" rows="3" maxlength="300" placeholder="' + (approve ? 'For example: Come to the main gate at 10.' : 'For example: Sorry, no bikes are free that day.') + '"></textarea></label>'
      + '<p class="muted small">The student sees this when they check their code on the website.</p>'
      + '<p class="err" id="decErr" role="alert" hidden></p>'
      + '<div class="row"><button type="button" class="btn" data-close>Back</button><button class="btn ' + (approve ? 'primary' : 'danger') + '" type="submit">' + (approve ? 'Approve' : 'Decline') + '</button></div></form>');
    $('#decForm', m).addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = $('button[type=submit]', m);
      btn.disabled = true;
      api('decide', { body: { id: q.id, decision: decision, message: this.elements.message.value, bike: approve && this.elements.bike ? this.elements.bike.value : '' } }).then(function (res) {
        btn.disabled = false;
        if (res.error) { var er = $('#decErr', m); er.textContent = res.error; er.hidden = false; return; }
        closeModal();
        toast(approve ? 'Approved. ' + q.name + ' can see this on the website.' : 'Declined.');
        if (done) { done(); }
      });
    });
  }

  BH.u = {
    $: $, $$: $$, esc: esc, api: api, now: now, syncClock: syncClock, fmtTime: fmtTime, fmtDur: fmtDur, fmtMin: fmtMin,
    fmtDay: fmtDay, fmtClock: fmtClock, todayStr: todayStr, money: money, billable: billable, statusOf: statusOf,
    natCmp: natCmp, toast: toast, openModal: openModal, closeModal: closeModal, rowHtml: rowHtml, openDetails: openDetails,
    createHistory: createHistory, liveAttrs: liveAttrs, thumbHtml: thumbHtml, tickLive: tickLive, amountNow: amountNow,
    openPhoto: openPhoto, reqHtml: reqHtml, openDecide: openDecide, downloadCsv: downloadCsv
  };
})();
