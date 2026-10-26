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

  BH.sb.rpc('public_stands').then(function (r) {
    var sel = form.elements.stand, list = (r && r.data) || [];
    if (!list.length) {
      sel.innerHTML = '<option value="">No pick-up point is set up yet</option>';
      go.disabled = true;
      showErr('Booking is not ready yet. Please call us.');
      return;
    }
    sel.innerHTML = list.map(function (x) { return '<option value="' + esc(x.id) + '">' + esc(x.label) + '</option>'; }).join('');
    if (list.length === 1) { $('standRow').hidden = true; }
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
