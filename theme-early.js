/* Applies your saved colours before the page paints, so there is no flash. */
(function () {
  try {
    var s = JSON.parse(localStorage.getItem('bh_settings') || '{}');
    var hex = /^#[0-9a-f]{6}$/i;
    var root = document.documentElement.style;
    function mix(h, t, a) {
      var n = parseInt(h.slice(1), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
      function c(x) { return Math.round(x + (t - x) * a); }
      return '#' + [c(r), c(g), c(b)].map(function (v) { return ('0' + v.toString(16)).slice(-2); }).join('');
    }
    if (hex.test(s.color_primary || '')) {
      root.setProperty('--blue', s.color_primary);
      root.setProperty('--blue-d', mix(s.color_primary, 0, 0.28));
      root.setProperty('--blue-l', mix(s.color_primary, 255, 0.88));
    }
    if (hex.test(s.color_accent || '')) { root.setProperty('--yellow', s.color_accent); }
    if (hex.test(s.color_header || '')) { root.setProperty('--header', s.color_header); }
    if (hex.test(s.color_page || '')) { root.setProperty('--bg', s.color_page); }
  } catch (e) { /* ignore */ }
})();
