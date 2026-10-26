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

  function render() {
    var s = BH.settings;
    document.title = s.business_name + ' | Bicycle hire';
    BH.renderTopbar('public');

    $('heroTitle').innerHTML = lines(s.hero_title).map(esc).join('<br>');
    $('heroText').textContent = s.hero_text;
    var price = BH.currency + ' ' + Number(BH.rate).toLocaleString('en-US');
    $('priceTag').innerHTML = '<b>' + esc(price) + '</b><span>per hour</span>';
    $('priceTag').setAttribute('aria-label', 'Price: ' + price + ' per hour');

    $('bookBtn').hidden = s.booking_enabled !== '1';
    var phoneDigits = String(s.contact_phone || '').replace(/[^0-9+]/g, '');
    var call = $('callBtn');
    if (phoneDigits) { call.href = 'tel:' + phoneDigits; call.textContent = 'Call ' + s.contact_phone; call.hidden = false; } else { call.hidden = true; }

    $('howTitle').textContent = s.how_title;
    $('steps').innerHTML = [1, 2, 3].map(function (n) {
      return '<li><h3>' + esc(s['step' + n + '_title']) + '</h3><p>' + esc(s['step' + n + '_text']) + '</p></li>';
    }).join('');

    $('priceTitle').textContent = s.price_title;
    $('priceMain').innerHTML = '<b>' + esc(price) + ' per hour.</b> We allow ' + esc(BH.grace) + ' minutes of grace.';
    $('priceText').innerHTML = lines(s.price_text).map(function (l) { return '<p>' + esc(l) + '</p>'; }).join('');

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

    $('footInfo').innerHTML = '<p><b>' + esc(s.business_name) + '</b></p>'
      + (s.location ? '<p>' + esc(s.location) + '</p>' : '')
      + (phoneDigits ? '<p><a href="tel:' + esc(phoneDigits) + '">' + esc(s.contact_phone) + '</a></p>' : '')
      + (s.footer_text ? '<p>' + esc(s.footer_text) + '</p>' : '');
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
    var img = e.target.closest ? e.target.closest('.post img') : null;
    if (img) { openImg(img.src); }
  });

  render();
  if (BH.sb) {
    BH.loadSettings().then(render);
    BH.sb.from('posts').select('*').eq('published', true).order('created_at', { ascending: false }).then(function (r) {
      renderPosts((r && r.data) || []);
    }, function () { /* offline: no posts */ });
  }
})();
