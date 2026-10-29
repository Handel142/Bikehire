/* Students book a bike without an account. */
(function () {
  'use strict';
  var BH = window.BH, esc = BH.esc;
  function $(id) { return document.getElementById(id); }
  BH.renderTopbar('public');
  if (BH.notConfigured()) { return; }
  var form = $('bookForm'), err = $('bookErr'), go = $('bookGo');

  function applySettings() {
    var s = BH.settings;
    BH.renderTopbar('public');
    $('bookIntro').textContent = s.booking_intro;
    var open = s.booking_enabled === '1';
    $('closed').hidden = open;
    form.hidden = !open;
  }
  applySettings();
  BH.loadSettings().then(applySettings);

  form.elements.date.min = BH.todayStr(0);
  form.elements.date.max = BH.todayStr(30);
  form.elements.date.value = BH.todayStr(0);

  function showErr(m) { err.textContent = m; err.hidden = !m; }
  function friendly(e) {
    var m = String((e && e.message) || e || '');
    if (!e.code && /failed to fetch|network|load failed/i.test(m)) { return 'No connection. Check your internet and try again.'; }
    return m || 'Something went wrong. Try again.';
  }

  var stands = [];
  function showPrice() {
    var el = $('bookPrice'); if (!el) { return; }
    var sel = form.elements.stand, x = null, mins = parseInt(form.elements.minutes.value, 10);
    stands.forEach(function (y) { if (y.id === sel.value) { x = y; } });
    if (!x || !(mins > 0)) { el.textContent = ''; return; }
    el.textContent = 'Price for this booking: ' + BH.currency + ' ' + BH.bookedPrice(x.rate, mins).toLocaleString('en-US') + '. You pay for the full time you book, even if you return early. Extra time after the grace period is charged at ' + BH.currency + ' ' + x.rate + ' per hour.';
  }
  BH.sb.rpc('public_stands').then(function (r) {
    var sel = form.elements.stand, list = (r && r.data) || [];
    if (!list.length) {
      sel.innerHTML = '<option value="">No pick-up point is set up yet</option>';
      go.disabled = true;
      showErr('Booking is not ready yet. Please call us.');
      return;
    }
    sel.innerHTML = list.map(function (x) {
      var free = x.free || 0;
      return '<option value="' + esc(x.id) + '">' + esc(x.label) + ' - ' + esc(BH.currency + ' ' + x.rate) + '/hour - ' + (free ? free + ' free' : 'none free now') + '</option>';
    }).join('');
    var want = /[?&]stand=([0-9a-f-]{36})/i.exec(location.search);
    if (want && list.some(function (x) { return x.id === want[1]; })) { sel.value = want[1]; }
    if (list.length === 1) { $('standRow').hidden = true; }
    stands = list; showPrice();
    sel.addEventListener('change', showPrice);
    form.elements.minutes.addEventListener('change', showPrice);
  }, function () { showErr('No connection. Check your internet and refresh.'); });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    showErr('');
    var f = form.elements;
    go.disabled = true;
    go.textContent = 'Sending...';
    BH.sb.rpc('create_booking', {
      p_stand: f.stand.value, p_name: f.name.value, p_reg: f.reg.value, p_phone: f.phone.value,
      p_date: f.date.value, p_time: f.time.value || '', p_minutes: parseInt(f.minutes.value, 10),
      p_note: f.note.value, p_hp: f.website.value
    }).then(function (r) {
      go.disabled = false;
      go.textContent = 'Send my request';
      if (r.error) { showErr(friendly(r.error)); return; }
      var code = r.data && r.data.code;
      if (!code) { showErr('Something went wrong. Try again.'); return; }
      var list = BH.lsGet('bh_codes', []);
      list.unshift({ code: code, name: f.name.value.trim(), date: f.date.value });
      BH.lsSet('bh_codes', list.slice(0, 10));
      form.hidden = true;
      $('bookDone').hidden = false;
      $('doneCode').textContent = code;
      $('seeStatus').href = 'status.html?code=' + encodeURIComponent(code);
      $('copyCode').addEventListener('click', function () {
        var b = this;
        function ok() { b.textContent = 'Copied'; setTimeout(function () { b.textContent = 'Copy code'; }, 1500); }
        if (navigator.clipboard) { navigator.clipboard.writeText(code).then(ok, function () { /* ignore */ }); }
      });
      window.scrollTo(0, 0);
    }, function (er) {
      go.disabled = false; go.textContent = 'Send my request'; showErr(friendly(er));
    });
  });
})();
