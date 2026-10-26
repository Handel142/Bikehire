/* Master admin: live view, requests, operators, history, website content, settings. */
(function () {
  'use strict';
  var BH = window.BH;
  if (!BH || !BH.u) { return; }
  BH.boot('admin', function (me) {
  var U = BH.u, $ = U.$, $$ = U.$$, esc = U.esc, api = U.api, toast = U.toast, money = U.money, statusOf = U.statusOf;
  var sb = BH.sb;

  var data = null, tab = 'live', history = null, webLoaded = false;
  var panels = { live: $('#p-live'), req: $('#p-req'), ops: $('#p-ops'), hist: $('#p-hist'), web: $('#p-web'), set: $('#p-set') };
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
    var list = data.live.slice().sort(function (a, b) {
      var sa = statusOf(a), sb2 = statusOf(b);
      return sa !== sb2 ? rank[sa] - rank[sb2] : a.due - b.due;
    });
    liveEl.innerHTML = list.length
      ? list.map(function (r) { return U.rowHtml(r, true); }).join('')
      : '<div class="panel center muted">No bikes are out right now.</div>';
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

  function renderOps() {
    if (!data) { return; }
    opsEl.innerHTML = data.operators.length
      ? data.operators.map(function (o) {
        return '<div class="oprow' + (o.active ? '' : ' off') + '"><div>'
          + '<b>' + esc(o.name) + '</b> ' + (o.active ? '' : '<span class="pill done">Disabled</span>')
          + '<div class="meta small">' + esc(o.email) + (o.phone ? ' · ' + esc(o.phone) : '') + '</div>'
          + '<div class="meta small">Pick-up name: ' + (o.stand ? esc(o.stand) : '<i>same as their name</i>') + '</div>'
          + '<div class="meta small">' + o.bikes + ' bikes · ' + o.out + ' out · ' + o.overdue + ' overdue · ' + o.pending + ' waiting requests</div></div>'
          + '<div class="op-actions"><button class="btn small" data-op="edit" data-id="' + esc(o.id) + '">Edit</button>'
          + '<button class="btn small" data-op="reset" data-id="' + esc(o.id) + '">Reset password</button>'
          + '<button class="btn small" data-op="toggle" data-id="' + esc(o.id) + '" data-active="' + (o.active ? 0 : 1) + '">' + (o.active ? 'Disable' : 'Enable') + '</button></div></div>';
      }).join('')
      : '<div class="panel center muted">No operators yet. Add the first one above.</div>';
  }

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
    ['display_name', 'email', 'phone', 'stand', 'password'].forEach(function (k) { body[k] = opForm.elements[k].value; });
    api('create_operator', { body: body }).then(function (res) {
      btn.disabled = false;
      if (res.error) { opErr.textContent = res.error; opErr.hidden = false; return; }
      toast('Operator ' + body.display_name + ' registered. Give them their email and password.');
      opForm.reset();
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
        + '<label>Pick-up name shown to students<input name="stand" maxlength="60" placeholder="For example: Main gate" value="' + esc(op.stand) + '"></label>'
        + '<p class="err" id="edErr" role="alert" hidden></p>'
        + '<div class="row"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit">Save</button></div></form>');
      $('#edForm', m).addEventListener('submit', function (ev) {
        ev.preventDefault();
        var f = this.elements, pe = $('#edErr', m);
        api('update_operator', { body: { id: id, name: f.name.value, phone: f.phone.value, stand: f.stand.value } }).then(function (res) {
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
    ['Top of the page', [
      ['hero_title', 'Big headline (press Enter for a new line)', 'area', 2],
      ['hero_text', 'Line under the headline', 'area', 2]]],
    ['How it works', [
      ['how_title', 'Section title', 'text'],
      ['step1_title', 'Step 1 title', 'text'], ['step1_text', 'Step 1 words', 'area', 2],
      ['step2_title', 'Step 2 title', 'text'], ['step2_text', 'Step 2 words', 'area', 2],
      ['step3_title', 'Step 3 title', 'text'], ['step3_text', 'Step 3 words', 'area', 2]]],
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
    ['Bottom of the page', [
      ['footer_text', 'Extra line in the footer (optional)', 'text']]]
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

    /* ----- news and offers ----- */
    var postList = $('#postList', root), posts = [];
    function loadPosts() {
      sb.from('posts').select('*').order('created_at', { ascending: false }).then(function (r) {
        posts = (r && r.data) || [];
        postList.innerHTML = posts.length ? posts.map(function (p) {
          return '<div class="oprow' + (p.published ? '' : ' off') + '"><div class="postrow">'
            + (p.image ? '<img class="postthumb" src="' + esc(BH.publicUrl('site-media', p.image)) + '" alt="">' : '')
            + '<div><b>' + esc(p.title) + '</b> ' + (p.published ? '' : '<span class="pill done">Hidden</span>')
            + '<div class="meta small">' + esc((p.body || '').slice(0, 90)) + '</div></div></div>'
            + '<div class="op-actions"><button class="btn small" data-post="edit" data-id="' + esc(p.id) + '">Edit</button>'
            + '<button class="btn small" data-post="toggle" data-id="' + esc(p.id) + '">' + (p.published ? 'Hide' : 'Show') + '</button>'
            + '<button class="btn small ghost" data-post="del" data-id="' + esc(p.id) + '">Delete</button></div></div>';
        }).join('') : '<p class="muted small">No posts yet.</p>';
      });
    }
    loadPosts();
    $('#newPost', root).addEventListener('click', function () { openPost(null); });
    postList.addEventListener('click', function (e) {
      var el = e.target.closest ? e.target.closest('[data-post]') : null;
      if (!el) { return; }
      var id = el.getAttribute('data-id'), p = null;
      posts.forEach(function (x) { if (x.id === id) { p = x; } });
      if (!p) { return; }
      var what = el.getAttribute('data-post');
      if (what === 'edit') { openPost(p); }
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
    });

    function openPost(p) {
      var image = p ? p.image : '', newBlob = null;
      var m = U.openModal('<form id="postForm" autocomplete="off"><h2>' + (p ? 'Edit post' : 'Add a post') + '</h2>'
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
            button_link: f.button_link.value.trim(), published: f.published.checked };
          return p ? sb.from('posts').update(row).eq('id', p.id) : sb.from('posts').insert(row);
        }).then(function (r) {
          if (r && r.error) { throw new Error(r.error.message); }
          if (old && old !== path) { sb.storage.from('site-media').remove([old]); }
          U.closeModal(); toast('Post saved.'); loadPosts();
        }).catch(function (er) { btn.disabled = false; perr.textContent = er.message || 'Could not save the post.'; perr.hidden = false; });
      });
    }
  }

  load();
  setInterval(function () { if (tab === 'live' || tab === 'ops' || tab === 'req') { load(); } }, 20000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden && (tab === 'live' || tab === 'ops' || tab === 'req')) { load(); } });
  });
})();
