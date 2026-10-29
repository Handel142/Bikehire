/* Shared by every page: database connection, settings, colours, logo, sign-in checks. */
(function () {
  'use strict';
  var CFG = window.BH_CONFIG || {};
  var BH = window.BH = window.BH || {};

  BH.configured = !!(CFG.supabaseUrl && CFG.supabaseKey && !/PASTE/i.test(CFG.supabaseUrl + CFG.supabaseKey));
  BH.sb = null;
  if (BH.configured && window.supabase && window.supabase.createClient) {
    BH.sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
    });
  }

  function lsGet(k, d) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch (e) { return d; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  BH.lsGet = lsGet; BH.lsSet = lsSet;

  BH.esc = function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  /* ---------- settings (everything the admin can edit) ---------- */
  var DEFAULTS = {
    business_name: 'Campus Bike Hire', currency: 'KSh', rate: '50', grace_minutes: '5', timezone: 'Africa/Nairobi',
    contact_phone: '', whatsapp: '', location: '', location_note: '', map_link: '', map_embed: '',
    booking_enabled: '1',
    booking_intro: 'Reserve a bike for a day and time. You do not need an account. You will get a code to check if your request was approved.',
    hero_title: 'Grab a bike.\nRide by the hour.',
    hero_text: 'Quick bicycle hire for students. Pick a bike, ride, and bring it back on time.',
    how_title: 'How it works',
    step1_title: 'Choose a bike', step1_text: 'Pick any free bike from the stand and tell the attendant how long you want it.',
    step2_title: 'Give your details', step2_text: 'The attendant notes your name and registration number and takes a quick photo. That is how every bike stays accounted for.',
    step3_title: 'Ride and return on time', step3_text: 'Your time starts when you leave. Bring the bike back by the time written down and pay for the time you booked.',
    price_title: 'Price',
    price_text: 'You pay for the time you book, at the hourly price.\nIf you keep the bike past your time and the grace period, the extra time is charged at the same hourly rate.\nBring your student registration number each time you hire.',
    news_title: 'News and offers', footer_text: '', logo_path: '',
    color_primary: '', color_accent: '', color_header: '', color_page: '',
    header_note: '', header_note_link: '', footer_about: '',
    flink1_text: '', flink1_url: '', flink2_text: '', flink2_url: '', flink3_text: '', flink3_url: '',
    social_instagram: '', social_facebook: '', social_tiktok: '', social_youtube: '',
    hero_art: 'default', hero_image: '', finder_title: 'Find bikes near you', finder_on: '1',
    services_title: 'Other things we offer', services_intro: '',
    popup_on: '0', popup_title: '', popup_body: '', popup_image: '', popup_video: '', popup_video_file: '',
    popup_btn_text: '', popup_btn_link: '', popup_start: '', popup_end: '', popup_freq: 'daily', popup_delay: '2', popup_rev: ''
  };
  BH.defaults = DEFAULTS;
  BH.settings = Object.assign({}, DEFAULTS, lsGet('bh_settings', {}));

  function hexOk(v) { return /^#[0-9a-f]{6}$/i.test(v || ''); }
  function mix(h, t, a) {
    var n = parseInt(h.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    function c(x) { return Math.round(x + (t - x) * a); }
    return '#' + [c(r), c(g), c(b)].map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
  }

  BH.applySettings = function () {
    var s = BH.settings, root = document.documentElement.style;
    function set(name, val) { if (val) { root.setProperty(name, val); } else { root.removeProperty(name); } }
    set('--blue', hexOk(s.color_primary) ? s.color_primary : '');
    set('--blue-d', hexOk(s.color_primary) ? mix(s.color_primary, 0, 0.28) : '');
    set('--blue-l', hexOk(s.color_primary) ? mix(s.color_primary, 255, 0.88) : '');
    set('--yellow', hexOk(s.color_accent) ? s.color_accent : '');
    set('--header', hexOk(s.color_header) ? s.color_header : '');
    set('--bg', hexOk(s.color_page) ? s.color_page : '');
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) { meta.setAttribute('content', hexOk(s.color_header) ? s.color_header : (hexOk(s.color_primary) ? s.color_primary : '#1b3ec9')); }
    BH.tz = s.timezone || 'Africa/Nairobi';
    BH.currency = s.currency || 'KSh';
    BH.rate = parseInt(s.rate, 10) || 50;
    BH.grace = parseInt(s.grace_minutes, 10);
    if (isNaN(BH.grace)) { BH.grace = 5; }
    if (BH.applyIcons) { BH.applyIcons(); }
  };

  BH.loadSettings = function () {
    if (!BH.sb) { return Promise.resolve(BH.settings); }
    return BH.sb.from('site_settings').select('k,v').then(function (r) {
      if (r.error || !r.data) { return BH.settings; }
      var m = {};
      r.data.forEach(function (row) { m[row.k] = row.v; });
      BH.settings = Object.assign({}, DEFAULTS, m);
      lsSet('bh_settings', BH.settings);
      BH.applySettings();
      return BH.settings;
    }, function () { return BH.settings; });
  };


  /* only allow map embeds from Google Maps or OpenStreetMap */
  BH.safeEmbed = function (raw) {
    raw = String(raw || '').trim();
    var m = /src\s*=\s*["']([^"']+)["']/i.exec(raw);
    var url = m ? m[1] : raw;
    return /^https:\/\/(www\.google\.com\/maps\/embed|maps\.google\.com\/maps\?|www\.openstreetmap\.org\/export\/embed\.html)/i.test(url) ? url.replace(/&amp;/g, '&') : '';
  };
  /* turn what an admin typed into a safe link */
  BH.safeLink = function (v, ctx) {
    v = String(v || '').trim();
    if (!v) { return ''; }
    var low = v.toLowerCase();
    if (low === 'whatsapp') {
      var n = String(BH.settings.whatsapp || '').replace(/\D/g, '');
      return n ? 'https://wa.me/' + n + (ctx ? '?text=' + encodeURIComponent(ctx) : '') : '';
    }
    if (low === 'book') { return 'book.html'; }
    if (/^(https?:|tel:|mailto:|#)/i.test(v)) { return v; }
    if (/^[a-z][a-z0-9+.-]*:/i.test(v)) { return ''; }
    if (/^[\w-]+\.html(#.*)?$/i.test(v)) { return v; }
    return 'https://' + v;
  };
  BH.todayStr = function (plusDays) {
    var d = new Date(Date.now() + (plusDays || 0) * 86400000);
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: BH.tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d); }
    catch (e) { return d.toISOString().slice(0, 10); }
  };

  /* ---------- logo ---------- */
  BH.publicUrl = function (bucket, path) {
    return String(CFG.supabaseUrl || '').replace(/\/$/, '') + '/storage/v1/object/public/' + bucket + '/' + String(path).split('/').map(encodeURIComponent).join('/');
  };
  BH.logoHtml = function () {
    var p = BH.settings.logo_path;
    if (p) { return '<img class="logo-img" src="' + BH.esc(BH.publicUrl('site-media', p)) + '" alt="" width="28" height="28">'; }
    return '<svg class="logo" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">'
      + '<circle cx="16" cy="16" r="12.5" fill="none" stroke="currentColor" stroke-width="3"/>'
      + '<circle cx="16" cy="16" r="2.6" fill="currentColor"/>'
      + '<path d="M16 3.5v9.9M16 18.6v9.9M3.5 16h9.9M18.6 16h9.9" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>';
  };

  /* ---------- signed-in user ---------- */
  BH.me = null;
  function homeFor(role) { return role === 'admin' ? 'admin.html' : 'dashboard.html'; }
  BH.homeFor = homeFor;

  BH.getProfile = function (uid) {
    return BH.sb.from('profiles').select('id,email,display_name,phone,stand_name,stand_id,role,active').eq('id', uid).maybeSingle()
      .then(function (r) { return r.error ? { error: r.error } : { data: r.data }; }, function (e) { return { error: e }; });
  };

  /* role: 'admin' | 'operator' | null (any staff). Redirects to login when not allowed. */
  BH.requireRole = function (role) {
    function toLogin(msg) {
      if (msg) { try { sessionStorage.setItem('bh_login_msg', msg); } catch (e) { /* ignore */ } }
      window.location.replace('login.html');
      return new Promise(function () { /* never resolves */ });
    }
    if (!BH.sb) { return toLogin(); }
    return BH.sb.auth.getSession().then(function (r) {
      var session = r && r.data && r.data.session;
      var hint = lsGet('bh_me', null);
      if (!session) {
        if (navigator.onLine === false && hint && (!role || hint.role === role)) {
          BH.me = hint; BH.offlineAuth = true; return hint;
        }
        return toLogin();
      }
      return BH.getProfile(session.user.id).then(function (p) {
        var prof = p.data;
        if (p.error) {
          if (hint && hint.id === session.user.id) { prof = hint; BH.offlineAuth = true; } else { return toLogin(); }
        }
        if (!prof || prof.active === false) {
          return BH.sb.auth.signOut().then(function () { localStorage.removeItem('bh_me'); return toLogin('This account is not active.'); });
        }
        if (role && prof.role !== role) { window.location.replace(homeFor(prof.role)); return new Promise(function () {}); }
        lsSet('bh_me', prof);
        BH.me = prof;
        return prof;
      });
    }, function () {
      var hint = lsGet('bh_me', null);
      if (hint && (!role || hint.role === role)) { BH.me = hint; BH.offlineAuth = true; return hint; }
      return toLogin();
    });
  };

  BH.logout = function () {
    var go = function () { try { localStorage.removeItem('bh_me'); } catch (e) { /* ignore */ } window.location.href = 'login.html'; };
    if (!BH.sb) { return go(); }
    return BH.sb.auth.signOut().then(go, go);
  };

  /* ---------- top bar ---------- */
  BH.renderTopbar = function (mode) {
    var el = document.getElementById('topbar');
    if (!el) { return; }
    var s = BH.settings, nav = '';
    if (mode === 'public') {
      var me = lsGet('bh_me', null);
      nav += me ? '<a href="' + homeFor(me.role) + '">Staff area</a>' : '<a href="login.html">Staff login</a>';
    } else if (BH.me) {
      nav += '<a href="' + homeFor(BH.me.role) + '">' + (BH.me.role === 'admin' ? 'Admin' : 'Bikes') + '</a>'
        + '<a href="account.html">Account</a><button class="linkbtn" type="button" id="logoutBtn">Log out</button>';
    }
    var note = '';
    if (mode === 'public' && String(s.header_note || '').trim()) {
      var nl = BH.safeLink(s.header_note_link);
      note = '<div class="hnote">' + (nl ? '<a href="' + BH.esc(nl) + '"' + (/^https?:/i.test(nl) ? ' target="_blank" rel="noopener"' : '') + '>' : '<span>')
        + BH.esc(String(s.header_note).slice(0, 160)) + (nl ? '</a>' : '</span>') + '</div>';
    }
    el.className = 'topbar';
    el.innerHTML = '<div class="topbar-in"><a class="brand" href="index.html">' + BH.logoHtml() + '<span>' + BH.esc(s.business_name) + '</span></a>'
      + '<nav class="topnav">' + nav + '</nav></div>' + note;
    var lb = document.getElementById('logoutBtn');
    if (lb) {
      lb.addEventListener('click', function () {
        if (BH.queueCount && BH.queueCount() > 0 && !window.confirm('Some changes have not synced yet. They stay on this phone and will sync when you log in again. Log out anyway?')) { return; }
        BH.logout();
      });
    }
  };

  /* Show a clear message when the site is not connected to Supabase yet. */
  BH.notConfigured = function () {
    if (BH.configured && BH.sb) { return false; }
    var d = document.createElement('div');
    d.className = 'err';
    d.style.cssText = 'margin:16px;max-width:640px;margin-inline:auto';
    d.innerHTML = BH.configured
      ? 'The database library did not load. Check your internet connection and refresh.'
      : 'This website is not connected to its database yet. Open <b>config.js</b> and paste your Supabase Project URL and anon key (see the setup guide, step 3).';
    document.body.insertBefore(d, document.body.firstChild);
    return true;
  };

  /* ---------- signed photo links (staff only) ---------- */
  var photoCache = {};
  BH.photoUrl = function (path) {
    var c = photoCache[path];
    if (c && c.exp > Date.now()) { return c.p; }
    var p = BH.sb ? BH.sb.storage.from('renter-photos').createSignedUrl(path, 3600).then(function (r) {
      return (r && r.data && r.data.signedUrl) || '';
    }, function () { return ''; }) : Promise.resolve('');
    photoCache[path] = { p: p, exp: Date.now() + 50 * 60000 };
    p.then(function (u) { if (!u) { delete photoCache[path]; } });
    return p;
  };


  /* ---------- start a staff page: check sign-in, draw the top bar, then run the page ---------- */
  BH.boot = function (role, run) {
    if (BH.notConfigured()) { return; }
    BH.requireRole(role).then(function (me) {
      BH.renderTopbar('staff');
      run(me);
      BH.loadSettings().then(function () { BH.renderTopbar('staff'); });
    });
  };


  /* ---------- small shared helpers ---------- */
  /* What a rental costs at a given moment (whole seconds, same maths as the database).
     r = { start, due, grace, rate, billing } with times in seconds. */
  BH.amountFor = function (r, end) {
    end = Math.floor(end);
    if (r.billing === 'v2') {
      var secs = Math.max(0, r.due - r.start) + (end > r.due + r.grace * 60 ? end - r.due : 0);
      return Math.floor((r.rate * secs * 2 + 3600) / 7200);
    }
    var net = Math.max(0, Math.max(0, end - r.start) - r.grace * 60);
    return Math.max(1, Math.ceil(net / 3600)) * r.rate;
  };
  BH.baseFor = function (r) { return BH.amountFor(r, r.due); };
  BH.bookedPrice = function (rate, minutes) { return Math.floor((rate * minutes * 60 * 2 + 3600) / 7200); };

  BH.distKm = function (lat1, lng1, lat2, lng2) {
    var R = 6371, rad = Math.PI / 180;
    var dLat = (lat2 - lat1) * rad, dLng = (lng2 - lng1) * rad;
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(a)));
  };
  BH.fmtKm = function (km) { return km < 1 ? Math.max(50, Math.round(km * 1000 / 50) * 50) + ' m' : km.toFixed(km < 10 ? 1 : 0) + ' km'; };
  /* a phone number the way WhatsApp wants it (Kenya numbers like 0712 345 678 become 254712345678) */
  BH.waNumber = function (phone) {
    var d = String(phone || '').replace(/\D/g, '');
    if (!d) { return ''; }
    if (d.indexOf('00') === 0) { d = d.slice(2); }
    if (d.charAt(0) === '0') { d = '254' + d.slice(1); }
    else if (/^[17]\d{8}$/.test(d)) { d = '254' + d; }
    return d.length >= 10 && d.length <= 15 ? d : '';
  };
  /* find latitude and longitude inside a long Google Maps link or typed "lat, lng" */
  BH.parseMapLink = function (txt) {
    txt = String(txt || '').trim();
    var m = /^\s*(-?\d{1,2}(?:\.\d+)?)\s*[, ]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/.exec(txt)
      || /@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)/.exec(txt)
      || /!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)/.exec(txt)
      || /[?&](?:q|ll|query|destination)=(-?\d{1,2}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/.exec(txt);
    if (!m) { return null; }
    var lat = parseFloat(m[1]), lng = parseFloat(m[2]);
    return (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) ? { lat: lat, lng: lng } : null;
  };
  BH.mapsLink = function (lat, lng, label) {
    if (lat != null && lng != null) { return 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(lat + ',' + lng); }
    return label ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(label) : '';
  };

  /* ---------- logo as the phone icon, and "install on this phone" ---------- */
  var iconKey = '';
  BH.applyIcons = function () {
    var s = BH.settings, logo = s.logo_path ? BH.publicUrl('site-media', s.logo_path) : '';
    var key = [logo, s.business_name, s.color_header, s.color_primary].join('|');
    if (key === iconKey) { return; }
    iconKey = key;
    function get(rel) {
      var l = document.querySelector('link[rel="' + rel + '"]');
      if (!l) { l = document.createElement('link'); l.rel = rel; document.head.appendChild(l); }
      return l;
    }
    var ic = get('icon'), ap = get('apple-touch-icon'), mf = get('manifest');
    if (!ic.getAttribute('data-orig')) { ic.setAttribute('data-orig', ic.getAttribute('href') || 'favicon.svg'); }
    if (!ap.getAttribute('data-orig')) { ap.setAttribute('data-orig', ap.getAttribute('href') || 'apple-touch-icon.png'); }
    if (!mf.getAttribute('data-orig')) { mf.setAttribute('data-orig', mf.getAttribute('href') || 'manifest.webmanifest'); }
    if (!logo) {
      ic.setAttribute('href', ic.getAttribute('data-orig')); ic.setAttribute('type', 'image/svg+xml');
      ap.setAttribute('href', ap.getAttribute('data-orig'));
      mf.setAttribute('href', mf.getAttribute('data-orig'));
      return;
    }
    var ext = (/\.([a-z0-9]+)$/i.exec(s.logo_path) || [0, 'png'])[1].toLowerCase();
    var type = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : ext === 'webp' ? 'image/webp' : ext === 'gif' ? 'image/gif' : 'image/png';
    ic.setAttribute('href', logo); ic.setAttribute('type', type);
    ap.setAttribute('href', logo);
    try {
      var theme = /^#[0-9a-f]{6}$/i.test(s.color_header || '') ? s.color_header : (/^#[0-9a-f]{6}$/i.test(s.color_primary || '') ? s.color_primary : '#1b3ec9');
      var icons = ext === 'svg'
        ? [{ src: logo, sizes: 'any', type: type, purpose: 'any' }]
        : [{ src: logo, sizes: '192x192', type: type, purpose: 'any' }, { src: logo, sizes: '512x512', type: type, purpose: 'any' }];
      var start = location.origin + location.pathname;
      var man = { name: s.business_name, short_name: String(s.business_name).slice(0, 14), start_url: start, scope: location.origin + '/',
        display: 'standalone', background_color: '#ffffff', theme_color: theme, icons: icons };
      mf.setAttribute('href', URL.createObjectURL(new Blob([JSON.stringify(man)], { type: 'application/manifest+json' })));
    } catch (e) { /* keep the ready-made manifest */ }
  };

  BH.installEvt = null;
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); BH.installEvt = e; if (BH.onInstallable) { BH.onInstallable(); } });
  window.addEventListener('appinstalled', function () { BH.installEvt = null; if (BH.onInstallable) { BH.onInstallable(); } });
  BH.isStandalone = function () {
    return !!(window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true;
  };
  /* fills a box with the right "install" help for this phone */
  BH.installBox = function (el) {
    if (!el) { return; }
    function draw() {
      if (BH.isStandalone()) { el.innerHTML = '<p class="muted small">This is already installed on your phone.</p>'; return; }
      if (BH.installEvt) {
        el.innerHTML = '<button type="button" class="btn primary" id="doInstall">Install on this phone</button>';
        el.querySelector('#doInstall').addEventListener('click', function () {
          var ev = BH.installEvt; if (!ev) { return; }
          ev.prompt();
          ev.userChoice.then(function () { BH.installEvt = null; draw(); }, function () { /* ignore */ });
        });
        return;
      }
      var ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      el.innerHTML = '<p class="muted small">' + (ios
        ? 'On iPhone: tap the Share button in Safari, then <b>Add to Home Screen</b>.'
        : 'Open your browser menu (the three dots) and choose <b>Install app</b> or <b>Add to Home screen</b>.') + '</p>';
    }
    draw();
    BH.onInstallable = draw;
  };

  BH.applySettings();

  /* ---------- works offline: remember the pages ---------- */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* ignore */ }); });
  }
})();
