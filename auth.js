/* Login, first-time setup and account pages. */
(function () {
  'use strict';
  var BH = window.BH, esc = BH.esc;
  function $(id) { return document.getElementById(id); }
  var errEl = $('err');
  function showErr(m) { if (errEl) { errEl.textContent = m; errEl.hidden = !m; } }
  function brand() {
    if ($('authName')) { $('authName').textContent = BH.settings.business_name; }
    if ($('authLogo')) { $('authLogo').innerHTML = BH.logoHtml(); $('authLogo').style.color = 'var(--yellow)'; }
  }
  brand();
  if (BH.notConfigured()) { return; }
  var sb = BH.sb;
  BH.loadSettings().then(brand);
  function net(e) { return /failed to fetch|network|load failed/i.test(String((e && e.message) || e)); }

  /* ---------- login ---------- */
  if ($('loginForm')) {
    try { var m = sessionStorage.getItem('bh_login_msg'); if (m) { showErr(m); sessionStorage.removeItem('bh_login_msg'); } } catch (e) { /* ignore */ }
    sb.rpc('needs_setup').then(function (r) { if (r && r.data === true) { window.location.replace('setup.html'); } });
    sb.auth.getSession().then(function (r) {
      var s = r && r.data && r.data.session;
      if (s) { BH.getProfile(s.user.id).then(function (p) { if (p.data && p.data.active) { window.location.replace(BH.homeFor(p.data.role)); } }); }
    });
    $('loginForm').addEventListener('submit', function (e) {
      e.preventDefault();
      showErr('');
      var f = this.elements, btn = this.querySelector('button[type=submit]');
      btn.disabled = true;
      sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value }).then(function (r) {
        if (r.error) {
          btn.disabled = false;
          showErr(net(r.error) ? 'No connection. Check your internet and try again.' : /banned/i.test(r.error.message) ? 'This account is disabled.' : 'Wrong email or password.');
          return;
        }
        BH.getProfile(r.data.user.id).then(function (p) {
          if (!p.data || !p.data.active) {
            return sb.auth.signOut().then(function () { btn.disabled = false; showErr('This account is not active. Ask the admin.'); });
          }
          BH.lsSet('bh_me', p.data);
          window.location.href = BH.homeFor(p.data.role);
        });
      }, function () { btn.disabled = false; showErr('No connection. Check your internet and try again.'); });
    });
  }

  /* ---------- first-time setup ---------- */
  if ($('setupForm')) {
    sb.rpc('needs_setup').then(function (r) { if (r && r.data === false) { window.location.replace('login.html'); } });
    $('setupForm').addEventListener('submit', function (e) {
      e.preventDefault();
      showErr('');
      var f = this.elements, btn = this.querySelector('button[type=submit]');
      if (f.password.value.length < 8) { showErr('Password must be at least 8 characters.'); return; }
      if (f.password.value !== f.password2.value) { showErr('The two passwords do not match.'); return; }
      btn.disabled = true;
      sb.auth.signUp({
        email: f.email.value.trim(), password: f.password.value,
        options: { data: { setup_code: f.setup_code.value, display_name: f.display_name.value.trim(), business_name: f.business_name.value.trim() } }
      }).then(function (r) {
        btn.disabled = false;
        if (r.error) {
          showErr(net(r.error) ? 'No connection. Check your internet and try again.'
            : /database error|setup code|closed/i.test(r.error.message) ? 'That did not work. The setup code is wrong, or the admin account already exists.'
            : /already registered/i.test(r.error.message) ? 'That email already has an account. Go to the login page.'
            : r.error.message);
          return;
        }
        if (r.data && r.data.session) { window.location.href = 'admin.html'; return; }
        showErr('Account created, but Supabase is asking for email confirmation. In Supabase open Authentication > Sign In / Providers > Email, turn OFF "Confirm email", save, then log in on the login page.');
      }, function () { btn.disabled = false; showErr('No connection. Check your internet and try again.'); });
    });
  }

  /* ---------- account ---------- */
  if ($('pwForm')) {
    BH.requireRole(null).then(function (me) {
      BH.renderTopbar('staff');
      BH.loadSettings().then(function () { BH.renderTopbar('staff'); });
      $('who').innerHTML = 'Signed in as <b>' + esc(me.display_name) + '</b> (' + esc(me.email) + ')';
      $('pwForm').addEventListener('submit', function (e) {
        e.preventDefault();
        showErr(''); $('okmsg').hidden = true;
        var f = this.elements, btn = this.querySelector('button[type=submit]');
        if (f['new'].value.length < 8) { showErr('The new password must be at least 8 characters.'); return; }
        if (f['new'].value !== f.new2.value) { showErr('The two new passwords do not match.'); return; }
        btn.disabled = true;
        sb.auth.signInWithPassword({ email: me.email, password: f.current.value }).then(function (r) {
          if (r.error) { btn.disabled = false; showErr(net(r.error) ? 'No connection. Try again.' : 'Your current password is wrong.'); return; }
          return sb.auth.updateUser({ password: f['new'].value }).then(function (u) {
            btn.disabled = false;
            if (u.error) { showErr(u.error.message); return; }
            $('pwForm').reset();
            $('okmsg').textContent = 'Password changed.'; $('okmsg').hidden = false;
          });
        }, function () { btn.disabled = false; showErr('No connection. Try again.'); });
      });
    });
  }
})();
