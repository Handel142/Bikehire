/* Public home page. Everything shown here comes from what the admin saved. */
(function () {
  'use strict';
  var BH = window.BH, esc = BH.esc;
  function $(id) { return document.getElementById(id); }
  BH.notConfigured();

  function lines(text) {
    return String(text || '').split(/\n+/).map(function (l) { return l.trim(); }).filter(Boolean);
  }
  function openImg(src) {
    var l = document.createElement('div');
    l.className = 'lightbox';
    l.innerHTML = '<button type="button" class="lb-close" aria-label="Close">&times;</button><div class="lb-scroll"><img class="lb-img" alt="" src="' + esc(src) + '"></div>';
    l.addEventListener('click', function () { document.body.removeChild(l); document.body.classList.remove('noscroll'); });
    document.body.appendChild(l);
    document.body.classList.add('noscroll');
  }

  var stands = null;   /* pick-up points from the database */
  var userPos = null, showAllStands = false, nearMsg = '';

  function money(n) { return BH.currency + ' ' + Number(n).toLocaleString('en-US'); }
  function ratesInfo() {
    var rs = (stands || []).map(function (x) { return x.rate; }).filter(function (x) { return x > 0; });
    if (!rs.length) { return { min: BH.rate, same: true }; }
    var min = Math.min.apply(null, rs), max = Math.max.apply(null, rs);
    return { min: min, same: min === max };
  }

  function render() {
    var s = BH.settings;
    document.title = s.business_name + ' | Bicycle hire';
    BH.renderTopbar('public');

    $('heroTitle').innerHTML = lines(s.hero_title).map(esc).join('<br>');
    $('heroText').textContent = s.hero_text;
    var ri = ratesInfo();
    var price = money(ri.min);
    $('priceTag').innerHTML = (ri.same ? '' : '<small>from</small>') + '<b>' + esc(price) + '</b><span>per hour</span>';
    $('priceTag').setAttribute('aria-label', 'Price: ' + (ri.same ? '' : 'from ') + price + ' per hour');

    /* picture next to the headline */
    var art = s.hero_art || 'default', himg = $('heroImg'), svg = document.querySelector('.bike-art');
    if (art === 'custom' && s.hero_image) { himg.src = BH.publicUrl('site-media', s.hero_image); himg.hidden = false; svg.style.display = 'none'; }
    else { himg.hidden = true; svg.style.display = art === 'none' ? 'none' : ''; }
    $('heroArt').classList.toggle('no-art', art === 'none' || (art === 'custom' && !s.hero_image && false));

    $('bookBtn').hidden = s.booking_enabled !== '1';
    $('findBtn').hidden = s.finder_on !== '1';
    var phoneDigits = String(s.contact_phone || '').replace(/[^0-9+]/g, '');
    var call = $('callBtn');
    if (phoneDigits) { call.href = 'tel:' + phoneDigits; call.textContent = 'Call ' + s.contact_phone; call.hidden = false; } else { call.hidden = true; }

    $('finder').hidden = s.finder_on !== '1';
    $('finderTitle').textContent = s.finder_title || 'Find bikes near you';

    $('howTitle').textContent = s.how_title;
    $('steps').innerHTML = [1, 2, 3].map(function (n) {
      return '<li><h3>' + esc(s['step' + n + '_title']) + '</h3><p>' + esc(s['step' + n + '_text']) + '</p></li>';
    }).join('');

    $('priceTitle').textContent = s.price_title;
    var pm;
    if (stands && stands.length > 1 && !ri.same) {
      pm = '<b>Price per hour:</b> ' + stands.map(function (x) { return esc(x.label) + ' ' + esc(money(x.rate)); }).join(' &middot; ');
    } else { pm = '<b>' + esc(price) + ' per hour.</b>'; }
    $('priceMain').innerHTML = pm + ' Grace time: ' + esc(BH.grace) + ' minutes.';
    $('priceText').innerHTML = lines(s.price_text).map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('');

    $('svcTitle').textContent = s.services_title || 'Other things we offer';
    var si = $('svcIntro'); si.textContent = s.services_intro || ''; si.hidden = !s.services_intro;

    /* where to find us */
    var embed = BH.safeEmbed(s.map_embed);
    var dir = BH.safeLink(s.map_link) || (s.location ? 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(s.location) : '');
    var wa = BH.safeLink('whatsapp', 'Hello! I found you on your website.');
    var box = $('whereBox');
    if (s.location || s.location_note || embed || s.map_link) {
      $('where').hidden = false;
      box.className = 'where' + (embed ? ' has-map' : '');
      box.innerHTML = '<div>'
        + (s.location ? '<h3>' + esc(s.location) + '</h3>' : '')
        + (s.location_note ? '<p style="white-space:pre-line">' + esc(s.location_note) + '</p>' : '')
        + '<div class="chips" style="margin-top:8px">'
        + (dir ? '<a class="btn primary" target="_blank" rel="noopener" href="' + esc(dir) + '">Get directions</a>' : '')
        + (phoneDigits ? '<a class="btn" href="tel:' + esc(phoneDigits) + '">Call ' + esc(s.contact_phone) + '</a>' : '')
        + (wa ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(wa) + '">WhatsApp</a>' : '')
        + '</div></div>'
        + (embed ? '<iframe class="map" title="Map to ' + esc(s.location || 'our stand') + '" loading="lazy" referrerpolicy="no-referrer" src="' + esc(embed) + '"></iframe>' : '');
    } else { $('where').hidden = true; }

    renderFooter(s, phoneDigits);
    renderStands();
  }

  function renderFooter(s, phoneDigits) {
    $('footInfo').innerHTML = '<p><b>' + esc(s.business_name) + '</b></p>'
      + (s.footer_about ? '<p style="white-space:pre-line">' + esc(s.footer_about) + '</p>' : '')
      + (s.location ? '<p>' + esc(s.location) + '</p>' : '')
      + (phoneDigits ? '<p><a href="tel:' + esc(phoneDigits) + '">' + esc(s.contact_phone) + '</a></p>' : '')
      + (s.footer_text ? '<p>' + esc(s.footer_text) + '</p>' : '');
    var links = [];
    if (s.booking_enabled === '1') { links.push(['Book a bike', 'book.html']); }
    links.push(['Check my request', 'status.html']);
    [1, 2, 3].forEach(function (n) {
      var t = String(s['flink' + n + '_text'] || '').trim(), u = BH.safeLink(s['flink' + n + '_url']);
      if (t && u) { links.push([t, u]); }
    });
    $('footLinks').innerHTML = '<ul class="flinks">' + links.map(function (l) {
      return '<li><a href="' + esc(l[1]) + '"' + (/^https?:/i.test(l[1]) ? ' target="_blank" rel="noopener"' : '') + '>' + esc(l[0]) + '</a></li>';
    }).join('') + '</ul>';
    var soc = [['social_instagram', 'Instagram'], ['social_facebook', 'Facebook'], ['social_tiktok', 'TikTok'], ['social_youtube', 'YouTube']].map(function (x) {
      var u = BH.safeLink(s[x[0]]);
      return /^https?:/i.test(u) ? '<a href="' + esc(u) + '" target="_blank" rel="noopener">' + x[1] + '</a>' : '';
    }).join('');
    $('footSocial').innerHTML = soc;
    $('footSocial').hidden = !soc;
  }

  /* ----- find bikes near me ----- */
  function ordered() {
    var list = (stands || []).map(function (x) {
      var d = userPos && x.lat != null && x.lng != null ? BH.distKm(userPos.lat, userPos.lng, x.lat, x.lng) : null;
      return { s: x, d: d };
    });
    list.sort(function (a, b) {
      if (a.d != null && b.d != null) { return a.d - b.d; }
      if (a.d != null) { return -1; }
      if (b.d != null) { return 1; }
      return String(a.s.label).toLowerCase() < String(b.s.label).toLowerCase() ? -1 : 1;
    });
    return list;
  }
  function renderStands() {
    var box = $('standCards');
    if (BH.settings.finder_on !== '1') { return; }
    $('nearMsg').textContent = nearMsg;
    if (stands === null) { box.innerHTML = '<p class="muted">Loading pick-up points...</p>'; $('standMore').hidden = true; return; }
    if (!stands.length) { box.innerHTML = '<p class="muted">No pick-up points are open right now. Please check again later.</p>'; $('standMore').hidden = true; return; }
    var list = ordered(), total = list.length, cut = !showAllStands && total > 3;
    if (cut) { list = list.slice(0, 3); }
    box.innerHTML = list.map(function (o, i) {
      var x = o.s, free = x.free || 0;
      var dir = BH.mapsLink(x.lat, x.lng, x.address || x.label);
      var phone = String(x.phone || '').replace(/[^0-9+]/g, '');
      return '<article class="stand' + (i === 0 && o.d != null ? ' nearest' : '') + '">'
        + '<div class="stand-top"><h3>' + esc(x.label) + '</h3>' + (o.d != null ? '<span class="dist">' + esc(BH.fmtKm(o.d)) + ' away</span>' : '') + '</div>'
        + (x.address ? '<p class="muted">' + esc(x.address) + '</p>' : '')
        + '<p><span class="pill ' + (free ? 'free' : 'out') + '">' + (free ? free + (free === 1 ? ' bike free' : ' bikes free') : 'No free bikes right now') + '</span> <b>' + esc(money(x.rate)) + '</b> per hour</p>'
        + '<div class="chips">' + (BH.settings.booking_enabled === '1' ? '<a class="btn primary" href="book.html?stand=' + encodeURIComponent(x.id) + '">Book here</a>' : '')
        + (dir ? '<a class="btn" target="_blank" rel="noopener" href="' + esc(dir) + '">Directions</a>' : '')
        + (phone ? '<a class="btn" href="tel:' + esc(phone) + '">Call</a>' : '') + '</div></article>';
    }).join('');
    var more = $('standMore');
    more.hidden = total <= 3;
    more.textContent = showAllStands ? 'Show fewer' : 'View all ' + total + ' pick-up points';
  }
  $('standMore').addEventListener('click', function () { showAllStands = !showAllStands; renderStands(); });
  $('nearBtn').addEventListener('click', function () {
    var btn = this;
    if (!navigator.geolocation) { nearMsg = 'This phone cannot share its location. The list below is in alphabetical order.'; renderStands(); return; }
    nearMsg = 'Finding where you are...'; renderStands(); btn.disabled = true;
    navigator.geolocation.getCurrentPosition(function (p) {
      btn.disabled = false;
      userPos = { lat: p.coords.latitude, lng: p.coords.longitude };
      var any = (stands || []).some(function (x) { return x.lat != null; });
      nearMsg = any ? 'Closest pick-up points first.' : 'The pick-up points have not shared their map position yet, so we cannot sort them.';
      renderStands();
    }, function (er) {
      btn.disabled = false;
      nearMsg = er && er.code === 1 ? 'Location is blocked. Allow location for this site in your browser, then try again. You can still use the list below.'
        : 'We could not find your location. You can still use the list below.';
      renderStands();
    }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 });
  });
  function loadStands() {
    if (!BH.sb) { return; }
    var cache = BH.lsGet('bh_stands', null);
    if (cache && cache.length) { stands = cache; render(); }
    BH.sb.rpc('public_stands').then(function (r) {
      if (r && !r.error && Array.isArray(r.data)) { stands = r.data; BH.lsSet('bh_stands', stands); }
      else if (stands === null) { stands = []; }
      render();
    }, function () { if (stands === null) { stands = []; render(); } });
  }

  function renderServices(rows) {
    if (!rows.length) { $('svcSec').hidden = true; return; }
    $('svcSec').hidden = false;
    $('svcGrid').innerHTML = rows.map(function (p) {
      var href = p.button_link ? BH.safeLink(p.button_link, 'Hello! I am interested in: ' + p.title) : '';
      var ext = /^https?:/i.test(href);
      return '<article class="post">'
        + (p.image ? '<img src="' + esc(BH.publicUrl('site-media', p.image)) + '" alt="" loading="lazy">' : '')
        + '<div class="post-body"><h3>' + esc(p.title) + '</h3>' + (p.body ? '<p style="white-space:pre-line">' + esc(p.body) + '</p>' : '')
        + (href && p.button_text ? '<a class="btn primary" href="' + esc(href) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + esc(p.button_text) + '</a>' : '')
        + '</div></article>';
    }).join('');
  }

  function renderPosts(rows) {
    var s = BH.settings;
    if (!rows.length) { $('newsSec').hidden = true; return; }
    $('newsSec').hidden = false;
    $('newsTitle').textContent = s.news_title;
    $('news').innerHTML = rows.map(function (p) {
      var href = p.button_link ? BH.safeLink(p.button_link, 'Hello! I am interested in: ' + p.title) : '';
      var ext = /^https?:/i.test(href);
      return '<article class="post">'
        + (p.image ? '<img src="' + esc(BH.publicUrl('site-media', p.image)) + '" alt="" loading="lazy">' : '')
        + '<div class="post-body"><h3>' + esc(p.title) + '</h3>' + (p.body ? '<p>' + esc(p.body) + '</p>' : '')
        + (href && p.button_text ? '<a class="btn primary" href="' + esc(href) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + esc(p.button_text) + '</a>' : '')
        + '</div></article>';
    }).join('');
  }
  document.addEventListener('click', function (e) {
    var img = e.target.closest ? e.target.closest('.post img, .hero-img') : null;
    if (img) { openImg(img.src); }
  });

  render();
  BH.installBox($('installBox'));
  if (BH.sb) {
    loadStands();
    BH.loadSettings().then(function () { render(); if (BH.showPopup) { BH.showPopup(BH.settings, false); } });
    BH.sb.from('posts').select('*').eq('published', true).order('created_at', { ascending: false }).then(function (r) {
      var rows = (r && r.data) || [];
      renderPosts(rows.filter(function (p) { return (p.kind || 'news') === 'news'; }));
      renderServices(rows.filter(function (p) { return p.kind === 'service'; }));
    }, function () { /* offline: no posts */ });
  }
})();
