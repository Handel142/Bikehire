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
    step3_title: 'Ride and return on time', step3_text: 'Your time starts when you leave. Bring the bike back by the time written down and pay for the hours you used.',
    price_title: 'Price',
    price_text: 'You pay by the hour, rounded up.\nIf you keep the bike past your time, each extra hour costs the same.\nBring your student registration number each time you hire.',
    news_title: 'News and offers', footer_text: '', logo_path: '',
    color_primary: '', color_accent: '', color_header: '', color_page: ''
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
  };
  BH.applySettings();

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
    return BH.sb.from('profiles').select('id,email,display_name,phone,stand_name,role,active').eq('id', uid).maybeSingle()
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
      if (s.booking_enabled === '1') { nav += '<a href="book.html">Book a bike</a>'; }
      nav += me ? '<a href="' + homeFor(me.role) + '">Staff area</a>' : '<a href="login.html">Staff login</a>';
    } else if (BH.me) {
      nav += '<a href="' + homeFor(BH.me.role) + '">' + (BH.me.role === 'admin' ? 'Admin' : 'Bikes') + '</a>'
        + '<a href="account.html">Account</a><button class="linkbtn" type="button" id="logoutBtn">Log out</button>';
    }
    el.className = 'topbar';
    el.innerHTML = '<div class="topbar-in"><a class="brand" href="index.html">' + BH.logoHtml() + '<span>' + BH.esc(s.business_name) + '</span></a>'
      + '<nav class="topnav">' + nav + '</nav></div>';
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

  /* ---------- works offline: remember the pages ---------- */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () { /* ignore */ }); });
  }
})();
