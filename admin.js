/* Master admin: live view, requests, operators, history, website content, settings. */
(function () {
  'use strict';
  var BH = window.BH;
  if (!BH || !BH.u) { return; }
  BH.boot('admin', function (me) {
  var U = BH.u, $ = U.$, $$ = U.$$, esc = U.esc, api = U.api, toast = U.toast, money = U.money, statusOf = U.statusOf;
  var sb = BH.sb;

  var data = null, tab = 'live', history = null, webLoaded = false, repLoaded = false, setLoaded = false;
  var panels = { live: $('#p-live'), req: $('#p-req'), ops: $('#p-ops'), hist: $('#p-hist'), rep: $('#p-rep'), web: $('#p-web'), set: $('#p-set') };
  var tabsEl = $('#atabs');
  var statsEl = $('#astats'), liveEl = $('#liveList'), opsEl = $('#opList'), reqEl = $('#reqList');
  var baseTitle = document.title;

  statsEl.innerHTML = '<div class="stat"><b id="a-out">0</b><span>Bikes out now</span></div>'
    + '<div class="stat" id="a-late-box"><b id="a-late">0</b><span>Overdue</span></div>'
    + '<div class="stat"><b id="a-leases">0</b><span>Leased today</span></div>'
    + '<div class="stat"><b id="a-money">-</b><span>Collected today</span></div>';

  function lateCount() {
    if (!data) { return 0; }
    return data.live.filter(function (r) { return statusOf(r) === 'late'; }).length;
  }
  function updateStats() {
    if (!data) { return; }
    var late = lateCount();
    $('#a-out').textContent = data.live.length - late;
    $('#a-late').textContent = late;
    $('#a-late-box').className = 'stat' + (late ? ' late' : '');
    $('#a-leases').textContent = data.today.leases;
    $('#a-money').textContent = money(data.today.earned);
    document.title = (late ? '(' + late + ' overdue) ' : '') + baseTitle;
  }

  function renderLive() {
    if (!data) { return; }
    updateStats();
    var rank = { late: 0, out: 1 };
    var multi = (data.stands || []).filter(function (x) { return x.active; }).length > 1;
    var list = data.live.slice().sort(function (a, b) {
      if (multi && (a.stand || '') !== (b.stand || '')) { return String(a.stand || '').toLowerCase() < String(b.stand || '').toLowerCase() ? -1 : 1; }
      var sa = statusOf(a), sb2 = statusOf(b);
      return sa !== sb2 ? rank[sa] - rank[sb2] : a.due - b.due;
    });
    var htm = '', last = null;
    list.forEach(function (r) {
      if (multi && r.stand !== last) { last = r.stand; htm += '<h3 class="grp">' + esc(r.stand || 'No pick-up point') + '</h3>'; }
      htm += U.rowHtml(r, true);
    });
    liveEl.innerHTML = list.length ? htm : '<div class="panel center muted">No bikes are out right now.</div>';
    U.tickLive();
  }
  BH.onFlip = renderLive;
  BH.tick = updateStats;

  function renderRequests() {
    if (!data) { return; }
    var list = data.requests || [];
    var pending = list.filter(function (q) { return q.status === 'pending'; }).length;
    var btn = $('[data-tab="req"]', tabsEl);
    if (btn) { btn.textContent = 'Requests ' + list.length; btn.classList.toggle('hot', pending > 0); }
    reqEl.innerHTML = list.length
      ? '<div class="req-grid">' + list.map(function (q) { return U.reqHtml(q, { showStand: true, canLease: false }); }).join('') + '</div>'
      : '<div class="panel center muted">No booking requests right now.</div>';
  }
  reqEl.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-ra]') : null;
    if (!el || !data) { return; }
    var id = el.getAttribute('data-id'), q = null;
    (data.requests || []).forEach(function (x) { if (x.id === id) { q = x; } });
    if (!q) { return; }
    U.openDecide(q, el.getAttribute('data-ra') === 'approve' ? 'approved' : 'declined', null, load);
  });

  function standOptions(sel, withNew) {
    return (data.stands || []).filter(function (x) { return x.active || x.id === sel; }).map(function (x) {
      return '<option value="' + esc(x.id) + '"' + (x.id === sel ? ' selected' : '') + '>' + esc(x.name) + '</option>';
    }).join('') + (withNew ? '<option value="__new__">+ A new pick-up point...</option>' : '');
  }
  function renderOps() {
    if (!data) { return; }
    var st = $('#standList');
    st.innerHTML = (data.stands || []).length ? data.stands.map(function (x) {
      return '<div class="oprow' + (x.active ? '' : ' off') + '"><div><b>' + esc(x.name) + '</b> ' + (x.active ? '' : '<span class="pill done">Closed</span>')
        + '<div class="meta small">' + esc(BH.currency + ' ' + x.rate) + ' per hour' + (x.rate_own == null ? ' (standard price)' : ' (own price)')
        + (x.lat != null ? ' &middot; map position set' : ' &middot; <b>no map position</b>') + (x.address ? ' &middot; ' + esc(x.address) : '') + '</div>'
        + '<div class="meta small">' + x.bikes + ' bikes' + (x.broken ? ' (' + x.broken + ' broken)' : '') + ' &middot; ' + x.out + ' out &middot; ' + x.overdue + ' overdue &middot; ' + x.pending + ' waiting requests</div>'
        + '<div class="meta small">Operators: ' + ((x.members || []).length ? esc(x.members.join(', ')) : '<i>none</i>') + '</div></div>'
        + '<div class="op-actions"><button class="btn small" data-st="edit" data-id="' + esc(x.id) + '">Edit</button></div></div>';
    }).join('') : '<p class="muted small">No pick-up points yet. Add one, or register an operator with a new pick-up point.</p>';
    var ps = $('#opStand'), keep = ps.value;
    ps.innerHTML = standOptions(keep, true);
    if (keep && ps.querySelector('option[value="' + keep + '"]')) { ps.value = keep; }
    $('#newStandRow').hidden = ps.value !== '__new__';
    opsEl.innerHTML = data.operators.length
      ? data.operators.map(function (o) {
        return '<div class="oprow' + (o.active ? '' : ' off') + '"><div>'
          + '<b>' + esc(o.name) + '</b> ' + (o.active ? '' : '<span class="pill done">Disabled</span>')
          + '<div class="meta small">' + esc(o.email) + (o.phone ? ' · ' + esc(o.phone) : '') + '</div>'
          + '<div class="meta small">Pick-up point: ' + (o.stand ? esc(o.stand) : '<i>none yet</i>') + '</div></div>'
          + '<div class="op-actions"><button class="btn small" data-op="edit" data-id="' + esc(o.id) + '">Edit</button>'
          + '<button class="btn small" data-op="reset" data-id="' + esc(o.id) + '">Reset password</button>'
          + '<button class="btn small" data-op="toggle" data-id="' + esc(o.id) + '" data-active="' + (o.active ? 0 : 1) + '">' + (o.active ? 'Disable' : 'Enable') + '</button></div></div>';
      }).join('')
      : '<div class="panel center muted">No operators yet. Add the first one above.</div>';
  }
  $('#opStand').addEventListener('change', function () { $('#newStandRow').hidden = this.value !== '__new__'; });

  /* pick-up points: add / edit */
  function openStandForm(x) {
    var lat = x ? x.lat : null, lng = x ? x.lng : null;
    var m = U.openModal('<form id="sForm" autocomplete="off"><h2>' + (x ? 'Edit pick-up point' : 'Add a pick-up point') + '</h2>'
      + '<label>Name<input name="name" maxlength="60" required value="' + esc(x ? x.name : '') + '"></label>'
      + '<label>Price per hour (' + esc(BH.currency) + ')<input name="rate" type="number" min="1" max="100000" step="1" inputmode="numeric" placeholder="Empty = standard price (' + esc(String(data.default_rate || BH.rate)) + ')" value="' + (x && x.rate_own != null ? esc(String(x.rate_own)) : '') + '"></label>'
      + '<label>Where is it? (words)<input name="address" maxlength="200" value="' + esc(x ? x.address || '' : '') + '"></label>'
      + '<fieldset><legend>Map position</legend><div class="chips"><button type="button" class="btn small" id="sLoc">Use my location now</button><button type="button" class="btn small ghost" id="sClr">Clear</button></div>'
      + '<label>or paste a Google Maps link<input name="link" placeholder="https://maps.app.goo.gl/... or -1.2921, 36.8219"></label><p class="muted small" id="sLocState"></p></fieldset>'
      + (x ? '<label class="checkrow"><input type="checkbox" name="active"' + (x.active ? ' checked' : '') + '> Open (students can book here and see it on the map)</label>' : '')
      + '<p class="err" id="sErr" role="alert" hidden></p>'
      + '<div class="row"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit" id="sGo">Save</button></div></form>');
    var form = $('#sForm', m), err = $('#sErr', m), ls = $('#sLocState', m);
    function show() { ls.textContent = lat != null && lng != null ? 'Position: ' + Number(lat).toFixed(5) + ', ' + Number(lng).toFixed(5) : 'No map position yet.'; }
    show();
    $('#sLoc', m).addEventListener('click', function () {
      if (!navigator.geolocation) { ls.textContent = 'This device cannot share its location.'; return; }
      ls.textContent = 'Finding you...';
      navigator.geolocation.getCurrentPosition(function (q) { lat = q.coords.latitude; lng = q.coords.longitude; show(); },
        function () { ls.textContent = 'Could not get the location. Paste a map link instead.'; }, { enableHighAccuracy: true, timeout: 20000 });
    });
    $('#sClr', m).addEventListener('click', function () { lat = null; lng = null; show(); });
    form.elements.link.addEventListener('input', function () { var q = BH.parseMapLink(this.value); if (q) { lat = q.lat; lng = q.lng; show(); } });
    form.addEventListener('submit', function (e) {
      e.preventDefault(); err.hidden = true;
      var rv = form.elements.rate.value.trim(), rate = rv === '' ? null : parseInt(rv, 10);
      if (rate !== null && !(rate >= 1)) { err.textContent = 'Enter a price of 1 or more, or leave it empty.'; err.hidden = false; return; }
      var go = $('#sGo', m); go.disabled = true;
      api('save_stand', { body: { id: x ? x.id : null, name: form.elements.name.value.trim(), rate: rate, lat: lat, lng: lng,
        address: form.elements.address.value.trim(), active: x ? form.elements.active.checked : true } }).then(function (res) {
        go.disabled = false;
        if (res.error) { err.textContent = res.error; err.hidden = false; return; }
        U.closeModal(); toast('Saved.'); load();
      });
    });
  }
  $('#newStand').addEventListener('click', function () { openStandForm(null); });
  $('#standList').addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-st]') : null;
    if (!el) { return; }
    var x = null; (data.stands || []).forEach(function (y) { if (y.id === el.getAttribute('data-id')) { x = y; } });
    if (x) { openStandForm(x); }
  });

  function load() {
    return api('overview').then(function (res) {
      if (res.error) { if (!data) { toast(res.error, 'err'); } return; }
      U.syncClock(res.now);
      data = res;
      renderLive();
      renderRequests();
      renderOps();
    });
  }

  function show(name) {
    tab = name;
    Object.keys(panels).forEach(function (k) { panels[k].hidden = (k !== name); });
    $$('.tab', tabsEl).forEach(function (b) { b.setAttribute('aria-selected', b.getAttribute('data-tab') === name ? 'true' : 'false'); });
    if (name === 'hist') {
      if (!history) { history = U.createHistory(panels.hist, true); }
      history.reload();
    }
    if (name === 'rep' && !repLoaded) { repLoaded = true; initReports(); }
    if (name === 'set' && !setLoaded) { setLoaded = true; initSettingsExtra(); }
    if (name === 'web' && !webLoaded) { webLoaded = true; initWebsite(); }
    if (name === 'live' || name === 'ops' || name === 'req') { load(); }
  }
  tabsEl.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-tab]') : null;
    if (el) { show(el.getAttribute('data-tab')); }
  });

  /* live list: open details */
  function openRow(e) {
    var el = e.target.closest ? e.target.closest('.hrow') : null;
    if (!el || !data) { return; }
    var id = el.getAttribute('data-id');
    for (var i = 0; i < data.live.length; i++) { if (data.live[i].id === id) { U.openDetails(data.live[i]); return; } }
  }
  liveEl.addEventListener('click', openRow);
  liveEl.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openRow(e); } });

  /* operators: register */
  var opForm = $('#opForm'), opErr = $('#opErr');
  opForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('button[type=submit]', opForm);
    btn.disabled = true;
    opErr.hidden = true;
    var body = {};
    ['display_name', 'email', 'phone', 'password'].forEach(function (k) { body[k] = opForm.elements[k].value; });
    var sv = opForm.elements.stand_id.value;
    if (sv === '__new__') {
      body.new_stand = opForm.elements.new_stand.value.trim();
      if (body.new_stand.length < 2) { btn.disabled = false; opErr.textContent = 'Type the name of the new pick-up point.'; opErr.hidden = false; return; }
    } else { body.stand_id = sv || null; }
    api('create_operator', { body: body }).then(function (res) {
      btn.disabled = false;
      if (res.error) { opErr.textContent = res.error; opErr.hidden = false; return; }
      toast('Operator ' + body.display_name + ' registered. Give them their email and password.');
      opForm.reset();
      $('#newStandRow').hidden = true;
      load();
    });
  });

  /* operators: edit, reset password, enable / disable */
  opsEl.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-op]') : null;
    if (!el) { return; }
    var id = el.getAttribute('data-id');
    var op = null;
    data.operators.forEach(function (o) { if (o.id === id) { op = o; } });
    if (!op) { return; }
    var what = el.getAttribute('data-op');
    if (what === 'toggle') {
      var enable = el.getAttribute('data-active') === '1';
      if (!enable && !window.confirm('Disable ' + op.name + '? They will not be able to log in. Their records stay.')) { return; }
      api('toggle_operator', { body: { id: id, active: enable } }).then(function (res) {
        if (res.error) { toast(res.error, 'err'); return; }
        toast(op.name + (enable ? ' enabled.' : ' disabled.'));
        load();
      });
    } else if (what === 'edit') {
      var m = U.openModal('<form id="edForm" autocomplete="off"><h2>Edit ' + esc(op.name) + '</h2>'
        + '<label>Name<input name="name" maxlength="60" required value="' + esc(op.name) + '"></label>'
        + '<label>Phone (optional)<input name="phone" type="tel" maxlength="20" value="' + esc(op.phone) + '"></label>'
        + '<label>Pick-up point<select name="stand_id">' + standOptions(op.stand_id, false) + '</select></label>'
        + '<p class="err" id="edErr" role="alert" hidden></p>'
        + '<div class="row"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Save</button></div></form>');
      $('#edForm', m).addEventListener('submit', function (ev) {
        ev.preventDefault();
        var f = this.elements, pe = $('#edErr', m);
        api('update_operator', { body: { id: id, name: f.name.value, phone: f.phone.value, stand_id: f.stand_id.value } }).then(function (res) {
          if (res.error) { pe.textContent = res.error; pe.hidden = false; return; }
          U.closeModal(); toast('Saved.'); load();
        });
      });
    } else {
      var m2 = U.openModal('<form id="pwForm" autocomplete="off"><h2>New password for ' + esc(op.name) + '</h2>'
        + '<label>New password<input name="password" type="text" minlength="8" required autofocus autocomplete="off"></label>'
        + '<p class="muted small">At least 8 characters. Tell the operator, then ask them to change it under Account.</p>'
        + '<p class="err" id="pwErr" role="alert" hidden></p>'
        + '<div class="row"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Save password</button></div></form>');
      $('#pwForm', m2).addEventListener('submit', function (ev) {
        ev.preventDefault();
        var pe = $('#pwErr', m2);
        api('reset_password', { body: { id: id, password: this.elements.password.value } }).then(function (res) {
          if (res.error) { pe.textContent = res.error; pe.hidden = false; return; }
          U.closeModal();
          toast('Password changed for ' + op.name + '.');
        });
      });
    }
  });

  /* ---------- business settings (price, name, time zone) ---------- */
  var setForm = $('#setForm'), setErr = $('#setErr');
  function fillSettings() {
    var s = BH.settings;
    ['business_name', 'currency', 'rate', 'grace_minutes', 'timezone'].forEach(function (k) { setForm.elements[k].value = s[k] || ''; });
  }
  fillSettings();
  BH.loadSettings().then(fillSettings);
  setForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var btn = $('button[type=submit]', setForm);
    setErr.hidden = true;
    var body = {};
    ['business_name', 'currency', 'rate', 'grace_minutes', 'timezone'].forEach(function (k) { body[k] = setForm.elements[k].value.trim(); });
    try { new Intl.DateTimeFormat('en-GB', { timeZone: body.timezone }); }
    catch (er) { setErr.textContent = 'That time zone name is not valid. Example: Africa/Nairobi'; setErr.hidden = false; return; }
    if (!(+body.rate >= 1) || !(+body.grace_minutes >= 0)) { setErr.textContent = 'Check the price and grace minutes.'; setErr.hidden = false; return; }
    btn.disabled = true;
    api('save_settings', { body: body }).then(function (res) {
      btn.disabled = false;
      if (res.error) { setErr.textContent = res.error; setErr.hidden = false; return; }
      toast('Settings saved.');
      BH.loadSettings().then(function () { BH.renderTopbar('staff'); });
    });
  });

  /* =====================================================================
     WEBSITE TAB: words, contact, colours, logo, news
     ===================================================================== */
  var TEXT_FIELDS = [
    ['Top bar (header)', [
      ['header_note', 'A small note in the top bar, for example: Open 7am to 7pm (optional)', 'text'],
      ['header_note_link', 'Where the note goes when tapped (optional). Type whatsapp, book, or paste a web link', 'text']]],
    ['Top of the page', [
      ['hero_title', 'Big headline (press Enter for a new line)', 'area', 2],
      ['hero_text', 'Line under the headline', 'area', 2]]],
    ['How it works', [
      ['how_title', 'Section title', 'text'],
      ['step1_title', 'Step 1 title', 'text'], ['step1_text', 'Step 1 words', 'area', 2],
      ['step2_title', 'Step 2 title', 'text'], ['step2_text', 'Step 2 words', 'area', 2],
      ['step3_title', 'Step 3 title', 'text'], ['step3_text', 'Step 3 words', 'area', 2]]],
    ['Find bikes near me', [
      ['finder_on', 'Show the "Find bikes near me" section on the home page', 'check'],
      ['finder_title', 'Section title', 'text']]],
    ['Services you offer (the list is added further down)', [
      ['services_title', 'Section title', 'text'],
      ['services_intro', 'Words above the list (optional)', 'area', 2]]],
    ['Price section', [
      ['price_title', 'Section title', 'text'],
      ['price_text', 'Words (each new line is a new paragraph). The price per hour is added automatically on top.', 'area', 5]]],
    ['News and offers', [
      ['news_title', 'Section title (the posts you add below appear here)', 'text']]],
    ['Booking by students', [
      ['booking_enabled', 'Let students send booking requests on the website', 'check'],
      ['booking_intro', 'Words shown above the booking form', 'area', 3]]],
    ['Contact and location', [
      ['contact_phone', 'Phone number shown on the website', 'tel'],
      ['whatsapp', 'WhatsApp number (digits only, with country code, for example 2547XXXXXXXX)', 'tel'],
      ['location', 'Address or place name (for example: Main gate, next to the library)', 'text'],
      ['location_note', 'Directions in words (optional)', 'area', 3],
      ['map_link', 'Google Maps link for the Directions button (optional). In Google Maps tap Share > Copy link.', 'text'],
      ['map_embed', 'Map to show on the page (optional). In Google Maps tap Share > Embed a map > Copy HTML, then paste it here.', 'area', 3]]],
    ['Bottom of the page (footer)', [
      ['footer_about', 'About us: a few words about your business (optional)', 'area', 3],
      ['footer_text', 'Extra line (optional)', 'text'],
      ['flink1_text', 'Link 1 words', 'text'], ['flink1_url', 'Link 1 goes to (web link, whatsapp or book)', 'text'],
      ['flink2_text', 'Link 2 words', 'text'], ['flink2_url', 'Link 2 goes to', 'text'],
      ['flink3_text', 'Link 3 words', 'text'], ['flink3_url', 'Link 3 goes to', 'text'],
      ['social_instagram', 'Instagram link (optional)', 'text'], ['social_facebook', 'Facebook link (optional)', 'text'],
      ['social_tiktok', 'TikTok link (optional)', 'text'], ['social_youtube', 'YouTube link (optional)', 'text']]]
  ];
  var COLORS = [
    ['color_primary', 'Main colour (top bar, big buttons)', '#1b3ec9'],
    ['color_accent', 'Accent colour (price tag, highlights)', '#ffd23f'],
    ['color_header', 'Top bar colour (leave on default to match the main colour)', '#1b3ec9'],
    ['color_page', 'Page background', '#edf1f9']
  ];

  function fieldHtml(f, val) {
    var k = f[0], label = f[1], type = f[2];
    if (type === 'check') {
      return '<label class="checkrow"><input type="checkbox" name="' + k + '"' + (val === '1' ? ' checked' : '') + '> ' + esc(label) + '</label>';
    }
    if (type === 'area') {
      return '<label>' + esc(label) + '<textarea name="' + k + '" rows="' + (f[3] || 3) + '" maxlength="1200">' + esc(val || '') + '</textarea></label>';
    }
    return '<label>' + esc(label) + '<input name="' + k + '" type="' + (type === 'tel' ? 'tel' : 'text') + '" maxlength="500" value="' + esc(val || '') + '"></label>';
  }

  function safeEmbed(raw) {
    raw = String(raw || '').trim();
    var m = /src\s*=\s*["']([^"']+)["']/i.exec(raw);
    var url = m ? m[1] : raw;
    return /^https:\/\/(www\.google\.com\/maps\/embed|maps\.google\.com\/maps\?|www\.openstreetmap\.org\/export\/embed\.html)/i.test(url) ? url.replace(/&amp;/g, '&') : '';
  }

  function resizeImage(file, max, quality) {
    return new Promise(function (resolve, reject) {
      var img = new Image(), url = URL.createObjectURL(file);
      img.onload = function () {
        var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
        var cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(w * k)); cv.height = Math.max(1, Math.round(h * k));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        cv.toBlob(function (b) { URL.revokeObjectURL(url); if (b) { resolve(b); } else { reject(new Error('resize')); } }, 'image/jpeg', quality);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('That file is not a picture.')); };
      img.src = url;
    });
  }

  function uploadMedia(path, blob, type) {
    return sb.storage.from('site-media').upload(path, blob, { contentType: type, upsert: true }).then(function (r) {
      if (r.error) { throw new Error(r.error.message || 'Upload failed.'); }
      return path;
    });
  }

  function initWebsite() {
    var root = panels.web;
    var s = BH.settings;
    var html = '<form class="panel" id="webForm" autocomplete="off"><h2>Words, contact and colours</h2>'
      + '<p class="muted">Change anything here and press Save at the bottom. Your website updates straight away.</p>';
    TEXT_FIELDS.forEach(function (g) {
      html += '<h3 class="grp">' + esc(g[0]) + '</h3>' + g[1].map(function (f) { return fieldHtml(f, s[f[0]]); }).join('');
    });
    html += '<h3 class="grp">Colours</h3><div class="colors">' + COLORS.map(function (c) {
      var has = /^#[0-9a-f]{6}$/i.test(s[c[0]] || '');
      return '<div class="colorrow"><label>' + esc(c[1]) + '<input type="color" name="' + c[0] + '" value="' + (has ? s[c[0]] : c[2]) + '"' + (has ? '' : ' disabled') + '></label>'
        + '<label class="checkrow small"><input type="checkbox" data-default="' + c[0] + '"' + (has ? '' : ' checked') + '> Use the default</label></div>';
    }).join('') + '</div>'
      + '<p class="err" id="webErr" role="alert" hidden></p>'
      + '<button class="btn primary" type="submit">Save</button> <a class="btn" href="index.html" target="_blank" rel="noopener">View website</a></form>'
      + '<section class="panel" id="logoBox"><h2>Logo</h2><p class="muted">Upload one or more logos, then choose which one to use. You can switch or remove them any time.</p>'
      + '<div id="logoList" class="logos"></div>'
      + '<div class="row" style="justify-content:flex-start"><label class="btn primary" for="logoFile" style="margin:0">Add a logo</label><input id="logoFile" type="file" accept="image/*" hidden>'
      + '<button class="btn" type="button" id="logoDefault">Use the default bicycle logo</button></div>'
      + '<p class="err" id="logoErr" role="alert" hidden></p></section>'
      + '<section class="panel" id="heroBox"><h2>Picture on the home page</h2><p class="muted">The yellow bicycle drawing can be replaced by your own picture, or hidden.</p>'
      + '<div class="chips" id="heroOpts"><button type="button" class="chip" data-hero="default">Bicycle drawing</button><button type="button" class="chip" data-hero="custom">My own picture</button><button type="button" class="chip" data-hero="none">No picture</button></div>'
      + '<div class="photo-box"><div class="photo-preview" id="heroPrev" style="width:160px;height:100px"></div>'
      + '<div class="photo-actions"><label class="btn small" for="heroFile" style="margin:0">Upload a picture</label><input id="heroFile" type="file" accept="image/*" hidden></div></div>'
      + '<p class="err" id="heroErr" role="alert" hidden></p></section>'
      + '<section class="panel" id="svcBox"><h2>Services list</h2><p class="muted">For example: websites, landing pages, coding. Each one has a title, words and an optional picture and button. They show on the home page under the services title above.</p>'
      + '<div class="row" style="justify-content:flex-start;margin:0 0 12px"><button class="btn primary" type="button" id="newSvc">Add a service</button></div><div id="svcList"></div></section>'
      + '<section class="panel" id="popBox"></section>'
      + '<section class="panel" id="newsBox"><h2>News and offers</h2><p class="muted">Add posts with a title, words and a picture. They show on your home page. Hide a post to take it down without deleting it.</p>'
      + '<div class="row" style="justify-content:flex-start;margin:0 0 12px"><button class="btn primary" type="button" id="newPost">Add a post</button></div>'
      + '<div id="postList"></div></section>';
    root.innerHTML = html;

    var form = $('#webForm', root), werr = $('#webErr', root);
    $$('[data-default]', form).forEach(function (cb) {
      cb.addEventListener('change', function () { form.elements[cb.getAttribute('data-default')].disabled = cb.checked; });
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      werr.hidden = true;
      var body = {}, f = form.elements;
      TEXT_FIELDS.forEach(function (g) {
        g[1].forEach(function (fd) {
          var k = fd[0];
          body[k] = fd[2] === 'check' ? (f[k].checked ? '1' : '0') : f[k].value.trim();
        });
      });
      body.whatsapp = body.whatsapp.replace(/\D/g, '');
      if (body.map_embed && !safeEmbed(body.map_embed)) {
        werr.textContent = 'That map code is not from Google Maps or OpenStreetMap. Use Share > Embed a map > Copy HTML.'; werr.hidden = false; return;
      }
      if (body.map_embed) { body.map_embed = safeEmbed(body.map_embed); }
      COLORS.forEach(function (c) {
        var cb = $('[data-default="' + c[0] + '"]', form);
        body[c[0]] = cb.checked ? '' : f[c[0]].value;
      });
      var btn = $('button[type=submit]', form);
      btn.disabled = true;
      api('save_settings', { body: body }).then(function (res) {
        btn.disabled = false;
        if (res.error) { werr.textContent = res.error; werr.hidden = false; return; }
        toast('Saved. Your website is updated.');
        BH.loadSettings().then(function () { BH.renderTopbar('staff'); });
      });
    });

    /* ----- logos ----- */
    var logoList = $('#logoList', root), logoErr = $('#logoErr', root);
    function showLogoErr(m) { logoErr.textContent = m; logoErr.hidden = !m; }
    function loadLogos() {
      sb.from('logos').select('id,path,created_at').order('created_at', { ascending: false }).then(function (r) {
        var rows = (r && r.data) || [];
        var active = BH.settings.logo_path;
        logoList.innerHTML = rows.length ? rows.map(function (l) {
          var on = l.path === active;
          return '<div class="logoitem' + (on ? ' on' : '') + '"><img src="' + esc(BH.publicUrl('site-media', l.path)) + '" alt="Logo">'
            + (on ? '<span class="pill free">In use</span>' : '<button class="btn small" data-logo="use" data-id="' + esc(l.id) + '" data-path="' + esc(l.path) + '">Use this</button>')
            + '<button class="btn small ghost" data-logo="del" data-id="' + esc(l.id) + '" data-path="' + esc(l.path) + '">Delete</button></div>';
        }).join('') : '<p class="muted small">No logos added yet. The default bicycle logo is showing.</p>';
      });
    }
    loadLogos();
    function setLogo(path) {
      return api('save_settings', { body: { logo_path: path } }).then(function (res) {
        if (res.error) { showLogoErr(res.error); return; }
        return BH.loadSettings().then(function () { BH.renderTopbar('staff'); loadLogos(); toast(path ? 'Logo changed.' : 'Default logo restored.'); });
      });
    }
    $('#logoDefault', root).addEventListener('click', function () { showLogoErr(''); setLogo(''); });
    $('#logoFile', root).addEventListener('change', function () {
      var file = this.files && this.files[0];
      this.value = '';
      if (!file) { return; }
      showLogoErr('');
      var keep = /^image\/(svg\+xml|png|webp|gif)$/.test(file.type);
      if (keep && file.size > 2 * 1024 * 1024) { showLogoErr('That logo file is too big (limit 2 MB).'); return; }
      var ext = file.type === 'image/svg+xml' ? 'svg' : file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : file.type === 'image/gif' ? 'gif' : 'jpg';
      var path = 'logos/' + BH.uuid() + '.' + ext;
      (keep ? Promise.resolve(file) : resizeImage(file, 600, 0.9)).then(function (blob) {
        return uploadMedia(path, blob, keep ? file.type : 'image/jpeg');
      }).then(function () {
        return sb.from('logos').insert({ path: path });
      }).then(function (r) {
        if (r && r.error) { throw new Error(r.error.message); }
        loadLogos(); toast('Logo added. Press "Use this" to show it.');
      }).catch(function (er) { showLogoErr(er.message || 'Could not add the logo.'); });
    });
    logoList.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-logo]') : null;
      if (!el) { return; }
      var id = el.getAttribute('data-id'), path = el.getAttribute('data-path');
      if (el.getAttribute('data-logo') === 'use') { setLogo(path); return; }
      if (!window.confirm('Delete this logo?')) { return; }
      var wasActive = BH.settings.logo_path === path;
      sb.from('logos').delete().eq('id', id).then(function (r) {
        if (r.error) { showLogoErr(r.error.message); return; }
        sb.storage.from('site-media').remove([path]);
        if (wasActive) { setLogo(''); } else { loadLogos(); }
      });
    });

    /* ----- home page picture ----- */
    var heroErr = $('#heroErr', root), heroPrev = $('#heroPrev', root);
    function paintHero() {
      var mode = BH.settings.hero_art || 'default';
      $$('[data-hero]', root).forEach(function (c) { c.setAttribute('aria-pressed', c.getAttribute('data-hero') === mode ? 'true' : 'false'); });
      heroPrev.innerHTML = mode === 'custom' && BH.settings.hero_image ? '<img alt="" src="' + esc(BH.publicUrl('site-media', BH.settings.hero_image)) + '">'
        : (mode === 'none' ? 'No picture' : 'Bicycle drawing');
    }
    paintHero();
    function saveHero(body, msg) {
      return api('save_settings', { body: body }).then(function (res) {
        if (res.error) { heroErr.textContent = res.error; heroErr.hidden = false; return; }
        return BH.loadSettings().then(function () { paintHero(); toast(msg || 'Saved.'); });
      });
    }
    $('#heroOpts', root).addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-hero]') : null;
      if (!el) { return; }
      heroErr.hidden = true;
      var mode = el.getAttribute('data-hero');
      if (mode === 'custom' && !BH.settings.hero_image) { heroErr.textContent = 'Upload your picture first.'; heroErr.hidden = false; return; }
      saveHero({ hero_art: mode });
    });
    $('#heroFile', root).addEventListener('change', function () {
      var file = this.files && this.files[0]; this.value = '';
      if (!file) { return; }
      heroErr.hidden = true;
      var keep = /^image\/(svg\+xml|png|webp)$/.test(file.type);
      if (keep && file.size > 2 * 1024 * 1024) { heroErr.textContent = 'That file is too big (limit 2 MB).'; heroErr.hidden = false; return; }
      var ext = file.type === 'image/svg+xml' ? 'svg' : file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
      var path = 'hero/' + BH.uuid() + '.' + ext, old = BH.settings.hero_image;
      (keep ? Promise.resolve(file) : resizeImage(file, 1200, 0.85)).then(function (b) { return uploadMedia(path, b, keep ? file.type : 'image/jpeg'); })
        .then(function () { return saveHero({ hero_image: path, hero_art: 'custom' }, 'Picture changed.'); })
        .then(function () { if (old && old !== path) { sb.storage.from('site-media').remove([old]); } })
        .catch(function (er) { heroErr.textContent = er.message || 'Could not upload.'; heroErr.hidden = false; });
    });

    /* ----- pop-up advert ----- */
    initPopup($('#popBox', root));

    /* ----- news and offers ----- */
    var postList = $('#postList', root), svcList = $('#svcList', root), posts = [];
    function rowOf(p) {
      return '<div class="oprow' + (p.published ? '' : ' off') + '"><div class="postrow">'
        + (p.image ? '<img class="postthumb" src="' + esc(BH.publicUrl('site-media', p.image)) + '" alt="">' : '')
        + '<div><b>' + esc(p.title) + '</b> ' + (p.published ? '' : '<span class="pill done">Hidden</span>')
        + '<div class="meta small">' + esc((p.body || '').slice(0, 90)) + '</div></div></div>'
        + '<div class="op-actions"><button class="btn small" data-post="edit" data-id="' + esc(p.id) + '">Edit</button>'
        + '<button class="btn small" data-post="toggle" data-id="' + esc(p.id) + '">' + (p.published ? 'Hide' : 'Show') + '</button>'
        + '<button class="btn small ghost" data-post="del" data-id="' + esc(p.id) + '">Delete</button></div></div>';
    }
    function loadPosts() {
      sb.from('posts').select('*').order('created_at', { ascending: false }).then(function (r) {
        posts = (r && r.data) || [];
        function rowsFor(kind, empty) {
          var list = posts.filter(function (p) { return (p.kind || 'news') === kind; });
          return list.length ? list.map(rowOf).join('') : '<p class="muted small">' + empty + '</p>';
        }
        postList.innerHTML = rowsFor('news', 'No posts yet.');
        svcList.innerHTML = rowsFor('service', 'No services added yet.');
      });
    }
    loadPosts();
    $('#newPost', root).addEventListener('click', function () { openPost(null, 'news'); });
    $('#newSvc', root).addEventListener('click', function () { openPost(null, 'service'); });
    function onPostClick(e) {
      var el = e.target.closest ? e.target.closest('[data-post]') : null;
      if (!el) { return; }
      var id = el.getAttribute('data-id'), p = null;
      posts.forEach(function (x) { if (x.id === id) { p = x; } });
      if (!p) { return; }
      var what = el.getAttribute('data-post');
      if (what === 'edit') { openPost(p, p.kind || 'news'); }
      else if (what === 'toggle') {
        sb.from('posts').update({ published: !p.published }).eq('id', id).then(function (r) {
          if (r.error) { toast(r.error.message, 'err'); return; }
          loadPosts();
        });
      } else if (window.confirm('Delete "' + p.title + '"?')) {
        sb.from('posts').delete().eq('id', id).then(function (r) {
          if (r.error) { toast(r.error.message, 'err'); return; }
          if (p.image) { sb.storage.from('site-media').remove([p.image]); }
          loadPosts();
        });
      }
    }
    postList.addEventListener('click', onPostClick);
    svcList.addEventListener('click', onPostClick);

    function openPost(p, kind) {
      var image = p ? p.image : '', newBlob = null, isSvc = kind === 'service';
      var m = U.openModal('<form id="postForm" autocomplete="off"><h2>' + (p ? (isSvc ? 'Edit service' : 'Edit post') : (isSvc ? 'Add a service' : 'Add a post')) + '</h2>'
        + '<label>Title<input name="title" maxlength="120" required value="' + esc(p ? p.title : '') + '"></label>'
        + '<label>What do you want to say?<textarea name="body" rows="5" maxlength="1500">' + esc(p ? p.body : '') + '</textarea></label>'
        + '<div class="photo-box"><div class="photo-preview" id="postPrev" style="width:140px;height:90px">' + (image ? '<img alt="" src="' + esc(BH.publicUrl('site-media', image)) + '">' : 'No picture') + '</div>'
        + '<div class="photo-actions"><label class="btn small" for="postFile" style="margin:0">' + (image ? 'Change picture' : 'Add a picture') + '</label><input id="postFile" type="file" accept="image/*" hidden>'
        + '<button type="button" class="link small" id="postNoImg" style="background:none;border:0;padding:0">Remove picture</button></div></div>'
        + '<label>Button words (optional, for example: Call now)<input name="button_text" maxlength="40" value="' + esc(p ? p.button_text : '') + '"></label>'
        + '<label>Button goes to (optional). Type <b>whatsapp</b>, <b>book</b>, or paste a web link<input name="button_link" maxlength="300" value="' + esc(p ? p.button_link : '') + '"></label>'
        + '<label class="checkrow"><input type="checkbox" name="published"' + (!p || p.published ? ' checked' : '') + '> Show on the website</label>'
        + '<p class="err" id="postErr" role="alert" hidden></p>'
        + '<div class="row"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Save post</button></div></form>');
      var prev = $('#postPrev', m), perr = $('#postErr', m);
      $('#postFile', m).addEventListener('change', function () {
        var file = this.files && this.files[0];
        this.value = '';
        if (!file) { return; }
        resizeImage(file, 1280, 0.82).then(function (b) {
          newBlob = b; image = '__new__';
          prev.innerHTML = '<img alt="" src="' + URL.createObjectURL(b) + '">';
        }, function (er) { perr.textContent = er.message; perr.hidden = false; });
      });
      $('#postNoImg', m).addEventListener('click', function () { newBlob = null; image = ''; prev.textContent = 'No picture'; });
      $('#postForm', m).addEventListener('submit', function (ev) {
        ev.preventDefault();
        var f = this.elements, btn = $('button[type=submit]', m);
        perr.hidden = true; btn.disabled = true;
        var old = p ? p.image : '';
        var path = image;
        var step = Promise.resolve();
        if (image === '__new__') {
          path = 'posts/' + BH.uuid() + '.jpg';
          step = uploadMedia(path, newBlob, 'image/jpeg');
        }
        step.then(function () {
          var row = { title: f.title.value.trim(), body: f.body.value.trim(), image: path, button_text: f.button_text.value.trim(),
            button_link: f.button_link.value.trim(), published: f.published.checked, kind: isSvc ? 'service' : 'news' };
          return p ? sb.from('posts').update(row).eq('id', p.id) : sb.from('posts').insert(row);
        }).then(function (r) {
          if (r && r.error) { throw new Error(r.error.message); }
          if (old && old !== path) { sb.storage.from('site-media').remove([old]); }
          U.closeModal(); toast('Post saved.'); loadPosts();
        }).catch(function (er) { btn.disabled = false; perr.textContent = er.message || 'Could not save the post.'; perr.hidden = false; });
      });
    }
  }


  /* =====================================================================
     REPORTS TAB: takings
     ===================================================================== */
  function initReports() {
    var f = $('#repFrom'), t = $('#repTo'), out = $('#repOut'), err = $('#repErr'), today = U.todayStr();
    function setRange(k) {
      var from = today;
      if (k === 'week') { from = U.addDays(today, -6); }
      if (k === 'month') { from = today.slice(0, 8) + '01'; }
      f.value = from; t.value = today;
      $$('#repChips .chip').forEach(function (c) { c.setAttribute('aria-pressed', c.getAttribute('data-r') === k ? 'true' : 'false'); });
    }
    setRange('month');
    $('#repChips').addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-r]') : null;
      if (el) { setRange(el.getAttribute('data-r')); run(); }
    });
    function run() {
      err.hidden = true; out.innerHTML = '<p class="muted">Loading...</p>';
      $$('#repChips .chip').forEach(function (c) { if (c.getAttribute('aria-pressed') === 'true' && false) { c.blur(); } });
      api('report', { body: { from: f.value, to: t.value } }).then(function (r) {
        if (r.error) { out.innerHTML = ''; err.textContent = r.error; err.hidden = false; return; }
        var days = r.by_day || [], stands = r.by_stand || [], max = 1;
        days.forEach(function (d) { if (d.collected > max) { max = d.collected; } });
        out.innerHTML = '<div class="stats"><div class="stat"><b>' + esc(money(r.total)) + '</b><span>Collected</span></div>'
          + '<div class="stat"><b>' + r.count + '</b><span>Rentals returned</span></div>'
          + '<div class="stat' + (r.late ? ' late' : '') + '"><b>' + r.late + '</b><span>Returned late</span></div></div>'
          + (stands.length > 1 || (stands[0] && stands[0].stand) ? '<h3 class="grp">By pick-up point</h3><table class="rtable"><thead><tr><th>Pick-up point</th><th>Rentals</th><th>Collected</th></tr></thead><tbody>'
            + stands.map(function (x) { return '<tr><td>' + esc(x.stand) + '</td><td>' + x.count + '</td><td>' + esc(money(x.collected)) + '</td></tr>'; }).join('') + '</tbody></table>' : '')
          + '<h3 class="grp">By day</h3>' + (days.length ? '<div class="bars">' + days.map(function (d) {
            return '<div class="barrow"><span class="bl">' + esc(d.day.slice(5)) + '</span><span class="bar"><i style="width:' + Math.max(2, Math.round(d.collected / max * 100)) + '%"></i></span><span class="bv">' + esc(money(d.collected)) + ' &middot; ' + d.count + '</span></div>';
          }).join('') + '</div>' : '<p class="muted small">No returned rentals in this range.</p>')
          + '<p class="muted small">Counts bikes that were returned in this range. Bikes still out are not included until they come back.</p>';
      });
    }
    $('#repGo').addEventListener('click', function () {
      $$('#repChips .chip').forEach(function (c) { c.setAttribute('aria-pressed', 'false'); });
      run();
    });
    run();
  }

  /* =====================================================================
     SETTINGS TAB extras: warning list, clearing old records, activity log
     ===================================================================== */
  function initSettingsExtra() {
    var root = $('#setExtra');
    root.innerHTML = '<section class="panel" id="flagBox"><h2>Warning list</h2><p class="muted small">Registration numbers you want operators to be warned about when they lease. It only shows a warning. The operator decides.</p>'
      + '<form id="flagForm" class="fgrid" autocomplete="off"><label>Registration number<input name="reg" maxlength="40" required></label><label>Note (shown to operators)<input name="note" maxlength="200" required placeholder="For example: did not return bike on 3 May"></label>'
      + '<div><button class="btn primary" type="submit">Add to warning list</button></div></form><p class="err" id="flagErr" role="alert" hidden></p><div id="flagList"></div></section>'
      + '<section class="panel" id="purgeBox"><h2>Clear old records</h2><p class="muted small">Free up space and remove customers\' details you no longer need. This cannot be undone, so you must download a backup first. Only returned rentals older than the date you pick are touched. Bikes still out are never touched.</p>'
      + '<div class="fgrid"><label>Clear records before this date<input type="date" id="pgDate"></label>'
      + '<label>What to clear<select id="pgMode"><option value="photos">Photos only (keep the names and amounts)</option><option value="all">Everything: rentals, photos and old booking requests</option></select></label></div>'
      + '<div id="pgSteps"></div><p class="err" id="pgErr" role="alert" hidden></p>'
      + '<button class="btn" type="button" id="pgPrev">1. Check what will be cleared</button></section>'
      + '<section class="panel"><h2>Activity log</h2><div id="auditList"><p class="muted small">Loading...</p></div></section>';

    /* warning list */
    var flagErr = $('#flagErr');
    function loadFlags() {
      api('flags').then(function (r) {
        $('#flagList').innerHTML = r.error ? '' : ((r.flags || []).length ? r.flags.map(function (x) {
          return '<div class="oprow"><div><b>' + esc(x.reg) + '</b><div class="meta small">' + esc(x.note) + '</div></div><div class="op-actions"><button class="btn small ghost" data-flag="' + esc(x.id) + '">Remove</button></div></div>';
        }).join('') : '<p class="muted small">The list is empty.</p>');
      });
    }
    loadFlags();
    $('#flagForm').addEventListener('submit', function (e) {
      e.preventDefault(); flagErr.hidden = true;
      var f = this;
      api('add_flag', { body: { reg: f.elements.reg.value, note: f.elements.note.value } }).then(function (r) {
        if (r.error) { flagErr.textContent = r.error; flagErr.hidden = false; return; }
        f.reset(); toast('Added to the warning list.'); loadFlags();
      });
    });
    $('#flagList').addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-flag]') : null;
      if (!el) { return; }
      api('remove_flag', { body: { id: el.getAttribute('data-flag') } }).then(function (r) {
        if (r.error) { toast(r.error, 'err'); return; }
        loadFlags();
      });
    });

    /* clearing old records: preview, forced backup, typed DELETE */
    var dateEl = $('#pgDate'), modeEl = $('#pgMode'), stepsEl = $('#pgSteps'), pgErr = $('#pgErr');
    dateEl.max = U.addDays(U.todayStr(), -7);
    dateEl.value = U.addDays(U.todayStr(), -90);
    var backedUp = false, previewed = null;
    function pgReset() { backedUp = false; previewed = null; stepsEl.innerHTML = ''; pgErr.hidden = true; }
    dateEl.addEventListener('change', pgReset); modeEl.addEventListener('change', pgReset);
    $('#pgPrev').addEventListener('click', function () {
      pgReset();
      if (!dateEl.value) { pgErr.textContent = 'Pick a date.'; pgErr.hidden = false; return; }
      api('purge_preview', { body: { before: dateEl.value, mode: modeEl.value } }).then(function (r) {
        if (r.error) { pgErr.textContent = r.error; pgErr.hidden = false; return; }
        previewed = { before: dateEl.value, mode: modeEl.value };
        var all = modeEl.value === 'all';
        stepsEl.innerHTML = '<div class="panel warn"><p><b>This will clear:</b> ' + r.photos + ' photo' + (r.photos === 1 ? '' : 's')
          + (all ? ', ' + r.rentals + ' rental record' + (r.rentals === 1 ? '' : 's') + ' and ' + r.bookings + ' old booking request' + (r.bookings === 1 ? '' : 's') : '')
          + ' from before ' + esc(dateEl.value) + '.</p>'
          + '<p><b>2. Download your backup.</b> The CSV is required. Photos cannot be recovered after clearing, so if you want to keep them, also download the PDF with photos.</p>'
          + '<div class="chips"><button class="btn primary" type="button" id="pgCsv">Download CSV backup</button>'
          + (r.photos ? '<button class="btn" type="button" id="pgPdf">Download PDF with photos</button>' : '') + '</div><p class="muted small" id="pgBk"></p>'
          + '<label>3. Type <b>DELETE</b> to confirm<input id="pgType" autocomplete="off" disabled></label>'
          + '<button class="btn danger" type="button" id="pgGo" disabled>Clear these records</button></div>';
        var typed = $('#pgType'), go = $('#pgGo'), bk = $('#pgBk');
        function gate() { go.disabled = !(backedUp && typed.value === 'DELETE'); }
        typed.addEventListener('input', gate);
        function backupOf(fmt, btn) {
          btn.disabled = true; var lbl = btn.textContent; btn.textContent = 'Preparing...';
          var cut = U.dayStart(previewed.before);
          api('export', { params: { from: null, to: cut } }).then(function (x) {
            if (x.error) { throw new Error(x.error); }
            var list = (x.rentals || []).filter(function (q) { return q.returned; });
            if (fmt === 'csv') { U.saveBlob(U.makeCsv(list), 'backup-before-' + previewed.before + '.csv'); return; }
            if (list.length > 300) { throw new Error('The PDF with photos holds up to 300 rentals and you have ' + list.length + '. Use the History tab to download it in smaller date ranges first.'); }
            return U.makePdf(list, 'Before ' + previewed.before, true, function (d, n) { btn.textContent = 'Photos ' + d + '/' + n; })
              .then(function (blob) { U.saveBlob(blob, 'backup-with-photos-before-' + previewed.before + '.pdf'); });
          }).then(function () {
            if (fmt === 'csv') { backedUp = true; bk.textContent = 'CSV backup downloaded. Check that it opened and saved on your phone before you continue.'; typed.disabled = false; gate(); }
            else { bk.textContent = 'PDF downloaded.'; }
            btn.disabled = false; btn.textContent = lbl;
          }, function (er) { btn.disabled = false; btn.textContent = lbl; bk.textContent = er.message || 'Could not make the backup.'; });
        }
        $('#pgCsv').addEventListener('click', function () { backupOf('csv', this); });
        var pdfBtn = $('#pgPdf'); if (pdfBtn) { pdfBtn.addEventListener('click', function () { backupOf('pdf', this); }); }
        go.addEventListener('click', function () {
          if (!backedUp || typed.value !== 'DELETE') { return; }
          go.disabled = true; go.textContent = 'Clearing...';
          api('purge', { body: { before: previewed.before, mode: previewed.mode, confirm: 'DELETE' } }).then(function (res) {
            if (res.error) { go.textContent = 'Clear these records'; pgErr.textContent = res.error; pgErr.hidden = false; return; }
            var paths = res.photos || [], chunks = [];
            for (var i = 0; i < paths.length; i += 100) { chunks.push(paths.slice(i, i + 100)); }
            var failed = 0;
            return chunks.reduce(function (pr, c) {
              return pr.then(function () { return sb.storage.from('renter-photos').remove(c).then(function (rr) { if (rr.error) { failed += c.length; } }, function () { failed += c.length; }); });
            }, Promise.resolve()).then(function () {
              stepsEl.innerHTML = '<p class="ok">Done. Cleared ' + (res.rentals || 0) + ' rentals, ' + (res.bookings || 0) + ' booking requests and ' + (paths.length - failed) + ' photos.'
                + (failed ? ' ' + failed + ' photo files could not be removed from storage. Press the button again later to retry.' : '') + '</p>';
              backedUp = false; loadAudit();
            });
          });
        });
      });
    });

    function loadAudit() {
      api('audit').then(function (r) {
        $('#auditList').innerHTML = r.error ? '<p class="muted small">Could not load.</p>' : ((r.items || []).length ? '<ul class="plain">' + r.items.map(function (x) {
          return '<li><b>' + esc(x.action) + '</b> <span class="muted small">' + esc(U.fmtTime(x.at)) + '</span><div class="meta small">' + esc(x.detail || '') + '</div></li>';
        }).join('') + '</ul>' : '<p class="muted small">Nothing yet.</p>');
      });
    }
    loadAudit();
  }

  /* =====================================================================
     POP-UP ADVERT manager (inside the Website tab)
     ===================================================================== */
  function initPopup(box) {
    var s = BH.settings, img = s.popup_image || '', vf = s.popup_video_file || '', newImg = null, newVid = null;
    box.innerHTML = '<h2>Pop-up advert</h2><p class="muted">A message that appears when someone opens your home page. It has a close (X) button. Add a picture, or a video, or both words and picture.</p>'
      + '<form id="popForm" autocomplete="off">'
      + '<label class="checkrow"><input type="checkbox" name="popup_on"' + (s.popup_on === '1' ? ' checked' : '') + '> Show the pop-up</label>'
      + '<label>Heading<input name="popup_title" maxlength="100" value="' + esc(s.popup_title || '') + '"></label>'
      + '<label>Words<textarea name="popup_body" rows="3" maxlength="600">' + esc(s.popup_body || '') + '</textarea></label>'
      + '<div class="photo-box"><div class="photo-preview" id="popImgPrev" style="width:160px;height:100px"></div><div class="photo-actions">'
      + '<label class="btn small" for="popImgFile" style="margin:0">Add a picture</label><input id="popImgFile" type="file" accept="image/*" hidden>'
      + '<button type="button" class="link small" id="popImgNo" style="background:none;border:0;padding:0">Remove picture</button></div></div>'
      + '<fieldset><legend>Video (optional)</legend>'
      + '<label>YouTube or Vimeo link<input name="popup_video" maxlength="300" placeholder="https://www.youtube.com/watch?v=..." value="' + esc(s.popup_video || '') + '"></label>'
      + '<div class="row" style="justify-content:flex-start"><label class="btn small" for="popVidFile" style="margin:0">or upload a video (MP4 or WebM, up to 20 MB)</label><input id="popVidFile" type="file" accept="video/mp4,video/webm" hidden>'
      + '<button type="button" class="link small" id="popVidNo" style="background:none;border:0;padding:0">Remove uploaded video</button></div><p class="muted small" id="popVidState"></p></fieldset>'
      + '<div class="fgrid"><label>Button words (optional)<input name="popup_btn_text" maxlength="40" value="' + esc(s.popup_btn_text || '') + '"></label>'
      + '<label>Button goes to (whatsapp, book, or a web link)<input name="popup_btn_link" maxlength="300" value="' + esc(s.popup_btn_link || '') + '"></label>'
      + '<label>Start showing on (optional)<input type="date" name="popup_start" value="' + esc(s.popup_start || '') + '"></label>'
      + '<label>Stop showing after (optional)<input type="date" name="popup_end" value="' + esc(s.popup_end || '') + '"></label>'
      + '<label>How often to show it to the same person<select name="popup_freq"><option value="once">Once only</option><option value="daily">Once a day</option><option value="always">Every visit</option></select></label>'
      + '<label>Seconds to wait before it appears<input type="number" name="popup_delay" min="0" max="60" value="' + esc(s.popup_delay || '2') + '"></label></div>'
      + '<p class="err" id="popErr" role="alert" hidden></p>'
      + '<div class="row" style="justify-content:flex-start"><button class="btn primary" type="submit" id="popSave">Save pop-up</button><button class="btn" type="button" id="popPrev">Preview</button></div></form>';
    var form = $('#popForm', box), err = $('#popErr', box), prev = $('#popImgPrev', box), vstate = $('#popVidState', box);
    form.elements.popup_freq.value = s.popup_freq || 'daily';
    function paint() {
      if (newImg) { prev.innerHTML = '<img alt="" src="' + URL.createObjectURL(newImg) + '">'; }
      else if (img) { prev.innerHTML = '<img alt="" src="' + esc(BH.publicUrl('site-media', img)) + '">'; }
      else { prev.textContent = 'No picture'; }
      vstate.textContent = newVid ? 'New video ready: ' + newVid.name : (vf ? 'An uploaded video is saved.' : '');
    }
    paint();
    $('#popImgFile', box).addEventListener('change', function () {
      var file = this.files && this.files[0]; this.value = '';
      if (!file) { return; }
      resizeImage(file, 1280, 0.82).then(function (b) { newImg = b; paint(); }, function (er) { err.textContent = er.message; err.hidden = false; });
    });
    $('#popImgNo', box).addEventListener('click', function () { newImg = null; img = ''; paint(); });
    $('#popVidFile', box).addEventListener('change', function () {
      var file = this.files && this.files[0]; this.value = '';
      if (!file) { return; }
      if (!/^video\/(mp4|webm)$/.test(file.type)) { err.textContent = 'Use an MP4 or WebM video.'; err.hidden = false; return; }
      if (file.size > 20 * 1024 * 1024) { err.textContent = 'That video is too big (limit 20 MB). Upload it to YouTube and paste the link instead.'; err.hidden = false; return; }
      err.hidden = true; newVid = file; paint();
    });
    $('#popVidNo', box).addEventListener('click', function () { newVid = null; vf = ''; paint(); });

    function values() {
      var f = form.elements;
      return { popup_on: f.popup_on.checked ? '1' : '0', popup_title: f.popup_title.value.trim(), popup_body: f.popup_body.value.trim(),
        popup_video: f.popup_video.value.trim(), popup_btn_text: f.popup_btn_text.value.trim(), popup_btn_link: f.popup_btn_link.value.trim(),
        popup_start: f.popup_start.value, popup_end: f.popup_end.value, popup_freq: f.popup_freq.value, popup_delay: String(Math.max(0, Math.min(60, parseInt(f.popup_delay.value, 10) || 0))) };
    }
    $('#popPrev', box).addEventListener('click', function () {
      var v = values();
      v.popup_on = '1';
      v.popup_image = newImg ? URL.createObjectURL(newImg) : img;
      v.popup_video_file = newVid ? URL.createObjectURL(newVid) : vf;
      v.__previewBlob = true;
      if (BH.showPopup) { BH.showPopup(Object.assign({}, BH.settings, v), true); }
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault(); err.hidden = true;
      var v = values();
      if (v.popup_video && !BH.parseVideo(v.popup_video)) { err.textContent = 'That video link is not from YouTube or Vimeo. Paste the full link.'; err.hidden = false; return; }
      if (v.popup_on === '1' && !(v.popup_title || v.popup_body || img || newImg || v.popup_video || vf || newVid)) { err.textContent = 'Add some words, a picture or a video first.'; err.hidden = false; return; }
      if (v.popup_start && v.popup_end && v.popup_end < v.popup_start) { err.textContent = 'The stop date is before the start date.'; err.hidden = false; return; }
      var btn = $('#popSave', box); btn.disabled = true;
      var oldImg = BH.settings.popup_image, oldVid = BH.settings.popup_video_file;
      var chain = Promise.resolve();
      if (newImg) { var ip = 'popup/' + BH.uuid() + '.jpg'; chain = chain.then(function () { return uploadMedia(ip, newImg, 'image/jpeg'); }).then(function () { img = ip; newImg = null; }); }
      if (newVid) { var ve = newVid.type === 'video/webm' ? 'webm' : 'mp4', vp = 'popup/' + BH.uuid() + '.' + ve; chain = chain.then(function () { return uploadMedia(vp, newVid, newVid.type); }).then(function () { vf = vp; newVid = null; }); }
      chain.then(function () {
        v.popup_image = img; v.popup_video_file = vf; v.popup_rev = String(Date.now());
        return api('save_settings', { body: v });
      }).then(function (res) {
        btn.disabled = false;
        if (res.error) { err.textContent = res.error; err.hidden = false; return; }
        [[oldImg, img], [oldVid, vf]].forEach(function (p) { if (p[0] && p[0] !== p[1]) { sb.storage.from('site-media').remove([p[0]]); } });
        toast('Pop-up saved.'); paint();
        return BH.loadSettings();
      }).catch(function (er) { btn.disabled = false; err.textContent = er.message || 'Could not save.'; err.hidden = false; });
    });
  }

  load();
  setInterval(function () { if (tab === 'live' || tab === 'ops' || tab === 'req') { load(); } }, 20000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && (tab === 'live' || tab === 'ops' || tab === 'req')) { load(); } });
  });
})();
