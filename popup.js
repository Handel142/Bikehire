/* Pop-up advert on the public site. Admin controls everything in the Website tab. */
(function () {
  'use strict';
  var BH = window.BH;
  if (!BH) { return; }
  var esc = BH.esc;

  /* only YouTube and Vimeo links become video players */
  BH.parseVideo = function (raw) {
    raw = String(raw || '').trim();
    var m = /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#].*)?$/i.exec(raw);
    if (m) { return { kind: 'youtube', src: 'https://www.youtube-nocookie.com/embed/' + m[1] + '?rel=0&playsinline=1' }; }
    m = /^https?:\/\/(?:www\.)?vimeo\.com\/(?:video\/)?(\d{6,12})(?:[?\/#].*)?$/i.exec(raw);
    if (m) { return { kind: 'vimeo', src: 'https://player.vimeo.com/video/' + m[1] }; }
    return null;
  };

  function mediaUrl(p) { return /^blob:/.test(p) ? p : BH.publicUrl('site-media', p); }

  function due(s, force) {
    if (force) { return true; }
    if (s.popup_on !== '1') { return false; }
    var today = BH.todayStr(0);
    if (s.popup_start && today < s.popup_start) { return false; }
    if (s.popup_end && today > s.popup_end) { return false; }
    if (!(s.popup_title || s.popup_body || s.popup_image || s.popup_video || s.popup_video_file)) { return false; }
    var rec = BH.lsGet('bh_popup', null), freq = s.popup_freq || 'daily';
    if (freq === 'always' || !rec || rec.rev !== (s.popup_rev || '')) { return true; }
    if (freq === 'once') { return false; }
    return rec.day !== today;
  }

  BH.showPopup = function (s, force) {
    if (document.getElementById('popOverlay')) { return; }
    if (!due(s, force)) { return; }
    var delay = force ? 0 : Math.max(0, Math.min(60, parseInt(s.popup_delay, 10) || 0));
    setTimeout(function () { build(s, force); }, delay * 1000);
  };

  function build(s, preview) {
    if (document.getElementById('popOverlay')) { return; }
    var vid = BH.parseVideo(s.popup_video), media = '';
    if (vid) {
      media = '<div class="pop-video"><iframe src="' + esc(vid.src) + '" title="Video" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen referrerpolicy="strict-origin-when-cross-origin" loading="lazy"></iframe></div>';
    } else if (s.popup_video_file) {
      media = '<div class="pop-video"><video controls playsinline preload="metadata" src="' + esc(mediaUrl(s.popup_video_file)) + '"></video></div>';
    } else if (s.popup_image) {
      media = '<img class="pop-img" alt="" src="' + esc(mediaUrl(s.popup_image)) + '">';
    }
    var link = s.popup_btn_text ? BH.safeLink(s.popup_btn_link, 'Hello! I saw your advert: ' + (s.popup_title || '')) : '';
    var ext = /^https?:/i.test(link);
    var el = document.createElement('div');
    el.id = 'popOverlay';
    el.className = 'pop-overlay';
    el.innerHTML = '<div class="pop" role="dialog" aria-modal="true" aria-label="' + esc(s.popup_title || 'Notice') + '">'
      + '<button type="button" class="pop-x" aria-label="Close">&times;</button>' + media
      + ((s.popup_title || s.popup_body || link) ? '<div class="pop-body">'
        + (s.popup_title ? '<h2>' + esc(s.popup_title) + '</h2>' : '')
        + (s.popup_body ? '<p>' + esc(s.popup_body) + '</p>' : '')
        + (link ? '<a class="btn primary" href="' + esc(link) + '"' + (ext ? ' target="_blank" rel="noopener"' : '') + '>' + esc(s.popup_btn_text) + '</a>' : '')
        + '</div>' : '')
      + (preview ? '<p class="pop-note">Preview. This is how visitors will see it.</p>' : '') + '</div>';
    var prevFocus = document.activeElement;
    function close() {
      document.removeEventListener('keydown', onKey);
      if (el.parentNode) { el.parentNode.removeChild(el); }   /* removing it also stops any video */
      document.body.classList.remove('noscroll');
      if (prevFocus && prevFocus.focus) { try { prevFocus.focus(); } catch (e) { /* ignore */ } }
    }
    function onKey(e) { if (e.key === 'Escape') { close(); } }
    el.addEventListener('click', function (e) { if (e.target === el || (e.target.closest && e.target.closest('.pop-x'))) { close(); } });
    document.addEventListener('keydown', onKey);
    document.body.appendChild(el);
    document.body.classList.add('noscroll');
    var x = el.querySelector('.pop-x'); if (x) { x.focus(); }
    if (!preview) { BH.lsSet('bh_popup', { rev: s.popup_rev || '', day: BH.todayStr(0) }); }
  }
})();
