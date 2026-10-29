/* Students check whether their booking was approved. */
(function () {
  'use strict';
  var BH = window.BH, esc = BH.esc;
  function $(id) { return document.getElementById(id); }
  BH.renderTopbar('public');
  if (BH.notConfigured()) { return; }
  BH.loadSettings().then(function () { BH.renderTopbar('public'); });

  var form = $('codeForm'), errEl = $('stErr'), out = $('result'), timer = null, current = '';
  function showErr(m) { errEl.textContent = m; errEl.hidden = !m; }

  function dayLabel(ds) {
    try { return new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ds + 'T12:00:00Z')); }
    catch (e) { return ds; }
  }
  function clock(t) {
    var m = /^(\d\d):(\d\d)$/.exec(t || '');
    if (!m) { return ''; }
    var h = +m[1];
    return (h % 12 || 12) + ':' + m[2] + ' ' + (h < 12 ? 'AM' : 'PM');
  }
  function dur(min) {
    if (min < 60) { return min + ' minutes'; }
    var h = Math.floor(min / 60), m = min % 60;
    return h + (h === 1 ? ' hour' : ' hours') + (m ? ' ' + m + ' minutes' : '');
  }

  function render(b) {
    var when = dayLabel(b.date) + (b.time ? ' at ' + clock(b.time) : '');
    var dir = (b.lat != null && b.lng != null ? BH.mapsLink(b.lat, b.lng) : '') || BH.safeLink(b.map_link) || (b.location ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(b.location) : '');
    var phone = String(b.stand_phone || '').replace(/[^0-9+]/g, '');
    var html = '';
    if (b.status === 'pending') {
      html = '<div class="banner pending"><h2>Waiting for an answer</h2><p>We received your request for <b>' + esc(when) + '</b> (' + esc(dur(b.minutes)) + '). Check this page again later. This page refreshes by itself.</p></div>';
    } else if (b.status === 'approved') {
      html = '<div class="banner approved"><h2>Yes, you are allowed &#10003;</h2><p>You can hire a bike on <b>' + esc(when) + '</b> for ' + esc(dur(b.minutes)) + '.</p>'
        + (b.bike ? '<p>Your bike: <b>Bike ' + esc(b.bike) + '</b></p>' : '')
        + (b.message ? '<p>Message: &ldquo;' + esc(b.message) + '&rdquo;</p>' : '')
        + '<p>Bring your registration number and come to <b>' + esc(b.stand) + '</b>' + (b.location ? ', ' + esc(b.location) : '') + '.</p>'
        + (b.rate ? '<p>Price: ' + esc(BH.currency + ' ' + b.rate) + ' per hour (' + esc(BH.currency + ' ' + BH.bookedPrice(b.rate, b.minutes)) + ' for your booking).</p>' : '') + '</div>';
    } else if (b.status === 'declined') {
      html = '<div class="banner declined"><h2>Sorry, not this time</h2><p>You were not allowed a bike on ' + esc(when) + '.</p>'
        + (b.message ? '<p>Message: &ldquo;' + esc(b.message) + '&rdquo;</p>' : '') + '<p>You can send a new request for another day.</p></div>';
    } else if (b.status === 'cancelled') {
      html = '<div class="banner cancelled"><h2>This request was cancelled</h2></div>';
    } else {
      html = '<div class="banner done"><h2>Done</h2><p>This booking was completed. Thank you for riding with us.</p></div>';
    }
    if (b.status === 'approved' || b.status === 'pending') {
      html += '<div class="chips">'
        + (dir ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(dir) + '">Directions</a>' : '')
        + (phone ? '<a class="btn" href="tel:' + esc(phone) + '">Call ' + esc(b.stand) + '</a>' : '')
        + '<button class="btn ghost" type="button" id="cancelBtn">Cancel this request</button></div>';
    }
    html += '<p class="muted small">Code ' + esc(b.code) + '</p>';
    out.innerHTML = html;
    var cb = $('cancelBtn');
    if (cb) {
      cb.addEventListener('click', function () {
        if (!window.confirm('Cancel this request?')) { return; }
        BH.sb.rpc('cancel_booking', { p_code: b.code }).then(function (r) {
          if (r.error) { showErr(r.error.message); return; }
          check(b.code, true);
        });
      });
    }
  }

  function check(code, quiet) {
    code = String(code || '').trim().toUpperCase();
    if (!code) { return; }
    current = code;
    if (!quiet) { showErr(''); }
    clearTimeout(timer);
    BH.sb.rpc('booking_status', { p_code: code }).then(function (r) {
      if (r.error) {
        if (!quiet) { showErr(/failed to fetch|network/i.test(r.error.message) ? 'No connection. Check your internet and try again.' : r.error.message); }
        return;
      }
      if (!r.data) { out.innerHTML = ''; showErr('We could not find that code. Check it and try again.'); return; }
      showErr('');
      render(r.data);
      if (r.data.status === 'pending' || r.data.status === 'approved') { timer = setTimeout(function () { check(current, true); }, 30000); }
    }, function () { if (!quiet) { showErr('No connection. Check your internet and try again.'); } });
  }

  form.addEventListener('submit', function (e) { e.preventDefault(); check(form.elements.code.value); });

  var list = BH.lsGet('bh_codes', []);
  var LABEL = { pending: 'Waiting', approved: 'Approved', declined: 'Declined', cancelled: 'Cancelled', done: 'Done' };
  if (list.length) {
    $('mine').hidden = false;
    $('mineList').innerHTML = list.map(function (x) {
      return '<li><a href="status.html?code=' + encodeURIComponent(x.code) + '"><span>' + esc(x.name) + '<small class="muted" data-st="' + esc(x.code) + '"></small></span><span>' + esc(x.code) + '</span></a></li>';
    }).join('');
    /* show the latest answer next to each saved code */
    list.slice(0, 6).forEach(function (x) {
      BH.sb.rpc('booking_status', { p_code: x.code }).then(function (r) {
        var el = document.querySelector('[data-st="' + x.code + '"]');
        if (el && r && !r.error && r.data) { el.textContent = ' - ' + (LABEL[r.data.status] || r.data.status); }
      }, function () { /* offline */ });
    });
  }
  var q = /[?&]code=([A-Za-z0-9]+)/.exec(location.search);
  var start = q ? q[1] : (list[0] && list[0].code) || '';
  if (start) { form.elements.code.value = start.toUpperCase(); check(start); }
})();
