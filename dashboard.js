/* Operator screen: bikes, leasing, returns, add time, booking requests, history. */
(function () {
  'use strict';
  var BH = window.BH;
  if (!BH || !BH.u) { return; }
  BH.boot('operator', function (me) {
  var U = BH.u, $ = U.$, $$ = U.$$, esc = U.esc, api = U.api, toast = U.toast, fmtTime = U.fmtTime, fmtDur = U.fmtDur,
    money = U.money, now = U.now, openModal = U.openModal, closeModal = U.closeModal, statusOf = U.statusOf,
    natCmp = U.natCmp, liveAttrs = U.liveAttrs, thumbHtml = U.thumbHtml, syncClock = U.syncClock;

  $('#hello').textContent = 'Hello, ' + me.display_name;
  var S = null, filter = 'all', findText = '', view = 'bikes', history = null;
  var grid = $('#grid'), tabsEl = $('#tabs'), historyEl = $('#history'), alertEl = $('#alert'), statsEl = $('#stats');
  var reqEl = $('#requests'), netEl = $('#netbar');
  var baseTitle = document.title;

  statsEl.innerHTML = '<div class="stat"><b id="st-free">0</b><span>Free bikes</span></div>'
    + '<div class="stat"><b id="st-out">0</b><span>Out now</span></div>'
    + '<div class="stat" id="st-late-box"><b id="st-late">0</b><span>Overdue</span></div>'
    + '<div class="stat"><b id="st-money">-</b><span>Collected today</span></div>';

  function counts() {
    var c = { all: 0, out: 0, late: 0, free: 0 };
    if (!S) { return c; }
    S.bikes.forEach(function (b) {
      var s = statusOf(b.rental);
      c.all++;
      if (s === 'free') { c.free++; } else { c.out++; if (s === 'late') { c.late++; } }
    });
    return c;
  }

  function updateStats() {
    var c = counts();
    $('#st-free').textContent = c.free;
    $('#st-out').textContent = c.out - c.late;
    $('#st-late').textContent = c.late;
    $('#st-late-box').className = 'stat' + (c.late ? ' late' : '');
    $('#st-money').textContent = S ? money(S.today.earned) : '-';
    var waiting = S ? (S.requests || []).filter(function (q) { return q.status === 'pending'; }).length : 0;
    document.title = (c.late ? '(' + c.late + ' overdue) ' : '') + (waiting ? '[' + waiting + ' request' + (waiting === 1 ? '' : 's') + '] ' : '') + baseTitle;
    return c;
  }

  function updateAlert(c) {
    if (!S || !c.late) { alertEl.hidden = true; return; }
    var names = S.bikes.filter(function (b) { return statusOf(b.rental) === 'late'; })
      .sort(function (a, b) { return a.rental.due - b.rental.due; })
      .slice(0, 3).map(function (b) { return 'Bike ' + b.number + ' (' + b.rental.name + ')'; });
    alertEl.textContent = c.late + (c.late === 1 ? ' bike is' : ' bikes are') + ' overdue: ' + names.join(', ') + (c.late > 3 ? ' and more' : '');
    alertEl.hidden = false;
  }

  /* offline / waiting-to-send bar */
  var syncing = false;
  function renderNet() {
    var pending = S ? S.pending || 0 : BH.queueCount();
    var off = BH.isOffline() || (S && S.offline);
    if (!off && !pending) { netEl.hidden = true; return; }
    netEl.hidden = false;
    netEl.className = 'netbar' + (off ? ' off' : '');
    netEl.innerHTML = '<span>' + (off ? 'You are offline. ' : '') + (pending
      ? pending + (pending === 1 ? ' change is' : ' changes are') + ' saved on this phone and will be sent when you are online.'
      : 'Changes are saved on this phone and sent when you are back online.') + '</span>'
      + (pending && !BH.isOffline() ? '<button type="button" class="btn small" id="syncNow">' + (syncing ? 'Sending...' : 'Send now') + '</button>' : '');
    var b = $('#syncNow');
    if (b) { b.addEventListener('click', function () { syncNow(true); }); }
  }
  function syncNow(manual) {
    if (syncing) { return; }
    syncing = true; renderNet();
    BH.flushQueue().then(function (r) {
      syncing = false;
      if (r.errors && r.errors.length) { r.errors.forEach(function (m) { toast('Could not send one change: ' + m, 'err'); }); }
      if (r.synced) { toast(r.synced + (r.synced === 1 ? ' change' : ' changes') + ' sent.'); }
      else if (manual && r.stopped) { toast('Still no connection. Your changes are safe on this phone.', 'err'); }
      load();
    });
  }
  BH.onSynced = function (r) {
    if (r.errors && r.errors.length) { r.errors.forEach(function (m) { toast('Could not send one change: ' + m, 'err'); }); }
    if (r.synced) { toast(r.synced + (r.synced === 1 ? ' change' : ' changes') + ' sent.'); }
    load();
  };
  window.addEventListener('offline', function () { renderNet(); tickNetClock(); });
  function tickNetClock() { /* clock shows offline automatically */ }

  function renderTabs(c) {
    var waiting = S ? (S.requests || []).length : 0;
    var defs = [['all', 'All ' + c.all], ['out', 'Out ' + c.out], ['late', 'Overdue ' + c.late], ['free', 'Free ' + c.free],
      ['requests', 'Requests ' + waiting], ['history', 'History']];
    tabsEl.innerHTML = defs.map(function (d) {
      var sel = (view === 'history' || view === 'requests') ? d[0] === view : d[0] === filter;
      var hot = d[0] === 'requests' && S && (S.requests || []).some(function (q) { return q.status === 'pending'; });
      return '<button type="button" class="tab' + (hot ? ' hot' : '') + '" role="tab" data-tab="' + d[0] + '" aria-selected="' + sel + '">' + esc(d[1]) + '</button>';
    }).join('');
  }

  function cardHtml(b) {
    var r = b.rental, s = statusOf(r);
    var top = '<div class="card-top"><div class="bike-no"><small>Bike</small>' + esc(b.number) + '</div>'
      + '<span class="pill ' + s + '">' + (s === 'free' ? 'Free' : s === 'late' ? 'Overdue' : 'Out') + '</span></div>';
    if (!r) {
      return '<article class="card free">' + top
        + '<div class="actions"><button class="btn primary" data-act="lease" data-bike="' + esc(b.id) + '">Lease this bike</button>'
        + '<button class="btn ghost small" style="flex:0 0 auto" data-act="remove" data-bike="' + esc(b.id) + '" aria-label="Remove bike ' + esc(b.number) + '">Remove</button></div></article>';
    }
    return '<article class="card ' + s + '"' + liveAttrs(r) + '>' + top
      + '<div class="who"><span class="thumb">' + thumbHtml(r, '') + '</span>'
      + '<button type="button" class="who-text who-btn" data-act="details" data-rental="' + esc(r.id) + '" aria-label="Open details for ' + esc(r.name) + '"><b>' + esc(r.name) + '</b><div class="meta">' + esc(r.reg) + (r.phone ? ' · ' + esc(r.phone) : '') + '</div></button></div>'
      + '<div class="timer"><span class="t-label"></span><span class="t-val"></span></div>'
      + '<div class="meta">Out ' + esc(fmtTime(r.start)) + ' · due ' + esc(fmtTime(r.due)) + (r.pending ? ' · <b>waiting to send</b>' : '') + '<br>Owes <b class="amt"></b> so far</div>'
      + '<div class="actions"><button class="btn primary" data-act="return" data-rental="' + esc(r.id) + '">Return</button>'
      + '<button class="btn" data-act="extend" data-rental="' + esc(r.id) + '">Add time</button></div></article>';
  }

  function render() {
    if (!S) { return; }
    var c = updateStats();
    updateAlert(c);
    renderTabs(c);
    renderNet();
    if (view === 'requests') { renderRequests(); return; }
    if (view === 'history') { return; }
    var ft = findText.toLowerCase();
    var list = S.bikes.filter(function (b) {
      var s = statusOf(b.rental);
      if (filter === 'out' && s === 'free') { return false; }
      if (filter === 'late' && s !== 'late') { return false; }
      if (filter === 'free' && s !== 'free') { return false; }
      if (ft) {
        var hay = (b.number + ' ' + (b.rental ? b.rental.name + ' ' + b.rental.reg + ' ' + b.rental.phone : '')).toLowerCase();
        if (hay.indexOf(ft) < 0) { return false; }
      }
      return true;
    });
    var rank = { late: 0, out: 1, free: 2 };
    list.sort(function (a, b) {
      var sa = statusOf(a.rental), sb = statusOf(b.rental);
      if (sa !== sb) { return rank[sa] - rank[sb]; }
      if (a.rental && b.rental) { return a.rental.due - b.rental.due; }
      return natCmp(a.number, b.number);
    });
    if (list.length) {
      grid.innerHTML = list.map(cardHtml).join('');
    } else if (!S.bikes.length) {
      grid.innerHTML = '<div class="empty"><h2>Add your bikes to start</h2><p class="muted">Type each bike number once, for example 1-10.</p><button class="btn primary" data-act="addbikes">Add bikes</button></div>';
    } else {
      grid.innerHTML = '<div class="empty muted">No bikes match.</div>';
    }
    U.tickLive();
  }
  BH.onFlip = render;

  function load() {
    return api('state').then(function (res) {
      if (res.auth) { toast('Please log in again to send your saved changes.', 'err'); return; }
      if (res.error) { if (!S) { toast(res.error, 'err'); } return; }
      syncClock(res.now);
      S = res;
      render();
    });
  }

  function findBike(id) {
    for (var i = 0; i < S.bikes.length; i++) { if (S.bikes[i].id === id) { return S.bikes[i]; } }
    return null;
  }
  function findRental(id) {
    for (var i = 0; i < S.bikes.length; i++) { if (S.bikes[i].rental && S.bikes[i].rental.id === id) { return S.bikes[i].rental; } }
    return null;
  }
  function freeBikes() { return S.bikes.filter(function (b) { return !b.rental; }); }

  /* ----- lease ----- */
  function openLease(bikeId, prefill) {
    prefill = prefill || {};
    var bike = bikeId ? findBike(bikeId) : null;
    if (!bike && !prefill.pick) { return; }
    var minutes = prefill.minutes && prefill.minutes >= 15 ? prefill.minutes : 60, photoBlob = null, leaseId = BH.uuid();
    var preset = [60, 120, 180, 240];
    var isPreset = preset.indexOf(minutes) >= 0;
    var chips = preset.map(function (mm) {
      return '<button type="button" class="chip" data-m="' + mm + '" aria-pressed="' + (mm === minutes) + '">' + (mm / 60) + ' h</button>';
    }).join('') + '<button type="button" class="chip" data-m="other" aria-pressed="' + (!isPreset) + '">Other</button>'
      + '<input type="number" id="otherM" min="15" max="1440" step="5" inputmode="numeric" placeholder="Minutes" aria-label="Minutes"' + (isPreset ? ' hidden' : ' value="' + minutes + '"') + '>';
    var pickHtml = '';
    if (!bike) {
      pickHtml = '<label>Bike<select name="bike_id" required><option value="">Choose a free bike</option>'
        + freeBikes().sort(function (a, b) { return natCmp(a.number, b.number); }).map(function (b) {
          return '<option value="' + esc(b.id) + '"' + (prefill.bikeNumber && String(b.number).toLowerCase() === String(prefill.bikeNumber).toLowerCase() ? ' selected' : '') + '>Bike ' + esc(b.number) + '</option>';
        }).join('') + '</select></label>';
    }
    var m = openModal(
      '<form id="leaseForm" autocomplete="off"><h2>' + (bike ? 'Lease bike ' + esc(bike.number) : 'Lease a bike') + '</h2>'
      + pickHtml
      + '<div class="photo-box"><div class="photo-preview" id="pp">No photo yet</div>'
      + '<div class="photo-actions"><label class="btn primary" for="photoCam" style="margin:0">Take photo</label>'
      + '<input id="photoCam" type="file" accept="image/*" capture="user" hidden>'
      + '<label class="link small" for="photoFile" style="margin:0">or choose a file</label>'
      + '<input id="photoFile" type="file" accept="image/*" hidden></div></div>'
      + '<label>Full name<input name="renter_name" maxlength="80" required autocomplete="off" value="' + esc(prefill.name || '') + '"></label>'
      + '<label>Registration number<input name="reg_no" maxlength="40" required autocomplete="off" autocapitalize="characters" value="' + esc(prefill.reg || '') + '"></label>'
      + '<label>Phone (optional)<input name="phone" type="tel" inputmode="tel" maxlength="20" autocomplete="off" value="' + esc(prefill.phone || '') + '"></label>'
      + '<fieldset><legend>How long?</legend><div class="chips">' + chips + '</div></fieldset>'
      + '<div class="summary" id="sum"></div><p class="err" id="err" role="alert" hidden></p>'
      + '<div class="row"><button type="button" class="btn" data-close>Cancel</button><button type="submit" class="btn primary" id="go">Start rental</button></div></form>'
    );
    var form = $('#leaseForm', m), sum = $('#sum', m), err = $('#err', m), go = $('#go', m), other = $('#otherM', m), pp = $('#pp', m);
    function setErr(msg) { err.textContent = msg; err.hidden = !msg; }
    function updateSum() {
      var ok = minutes >= 15 && minutes <= 1440;
      sum.textContent = ok
        ? money(Math.ceil(minutes / 60) * BH.rate) + ' for ' + U.fmtMin(minutes) + '. Due back ' + fmtTime(now() + minutes * 60) + '.'
        : 'Enter minutes from 15 to 1440.';
    }
    updateSum();
    $$('.chip', m).forEach(function (chip) {
      chip.addEventListener('click', function () {
        $$('.chip', m).forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
        var v = chip.getAttribute('data-m');
        if (v === 'other') { other.hidden = false; other.focus(); minutes = parseInt(other.value, 10) || 0; }
        else { other.hidden = true; minutes = parseInt(v, 10); }
        updateSum();
      });
    });
    other.addEventListener('input', function () { minutes = parseInt(other.value, 10) || 0; updateSum(); });

    function showPreview(blob) {
      var img = document.createElement('img');
      img.alt = 'Renter photo';
      img.src = URL.createObjectURL(blob);
      pp.innerHTML = '';
      pp.appendChild(img);
    }
    function shrink(file) {
      return new Promise(function (resolve, reject) {
        var img = new Image(), url = URL.createObjectURL(file);
        img.onload = function () {
          var max = 1280, w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, max / Math.max(w, h));
          var cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(w * k));
          cv.height = Math.max(1, Math.round(h * k));
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          cv.toBlob(function (b) { URL.revokeObjectURL(url); if (b) { resolve(b); } else { reject(); } }, 'image/jpeg', 0.8);
        };
        img.onerror = function () { URL.revokeObjectURL(url); reject(); };
        img.src = url;
      });
    }
    function takeFile(input) {
      var f = input.files && input.files[0];
      if (!f) { return; }
      shrink(f).then(function (b) { photoBlob = b; showPreview(b); setErr(''); },
        function () { setErr('That file is not a photo we can use. Take the photo again.'); });
      input.value = '';
    }
    $('#photoCam', m).addEventListener('change', function () { takeFile(this); });
    $('#photoFile', m).addEventListener('change', function () { takeFile(this); });

    function send(payload, name, number) {
      go.disabled = true;
      go.textContent = 'Saving...';
      api('lease', { body: payload }).then(function (res) {
        go.disabled = false;
        go.textContent = 'Start rental';
        if (res.confirm) {
          if (window.confirm(res.error + '\n\nLease this bike anyway?')) { payload.force = true; send(payload, name, number); }
          return;
        }
        if (res.error) { setErr(res.error); return; }
        closeModal();
        toast(res.queued ? 'Bike ' + number + ' leased to ' + name + '. Saved on this phone, will send when online.' : 'Bike ' + number + ' leased to ' + name + '.');
        load();
      });
    }
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var chosen = bike || findBike(form.elements.bike_id ? form.elements.bike_id.value : '');
      if (!chosen) { setErr('Choose a bike.'); return; }
      if (!photoBlob) { setErr("Take the renter's photo first."); return; }
      if (!(minutes >= 15 && minutes <= 1440)) { setErr('Enter minutes from 15 to 1440.'); return; }
      var name = form.elements.renter_name.value.trim(), reg = form.elements.reg_no.value.trim();
      if (name.length < 2) { setErr("Enter the renter's full name."); return; }
      if (reg.length < 2) { setErr("Enter the renter's registration number."); return; }
      setErr('');
      var payload = {
        id: leaseId, bike_id: chosen.id, bike_number: chosen.number, renter_name: name, reg_no: reg,
        phone: form.elements.phone.value.trim(), start: now(), minutes: minutes, photo: photoBlob,
        booking_id: prefill.bookingId || null, force: false
      };
      var dup = S.bikes.some(function (b) { return b.rental && String(b.rental.reg).toLowerCase() === reg.toLowerCase(); });
      if (dup && !window.confirm('Registration number ' + reg + ' already has a bike out.\n\nLease this bike anyway?')) { return; }
      if (dup) { payload.force = true; }
      send(payload, name, chosen.number);
    });
    form.elements.renter_name.focus();
  }

  /* ----- return ----- */
  function openReturn(rid) {
    var r = findRental(rid);
    if (!r) { return; }
    var t = now(), late = t > r.due;
    var m = openModal(
      '<h2>Return bike ' + esc(r.bike) + '</h2>'
      + '<div class="who" style="margin-bottom:8px">' + (r.has_photo ? '<span class="thumb">' + thumbHtml(r, '') + '</span>' : '')
      + '<div class="who-text"><b>' + esc(r.name) + '</b><div class="meta">' + esc(r.reg) + '</div></div></div>'
      + '<dl class="dl"><dt>Taken</dt><dd>' + esc(fmtTime(r.start)) + '</dd><dt>Due back</dt><dd>' + esc(fmtTime(r.due)) + '</dd>'
      + '<dt>Time used</dt><dd>' + esc(fmtDur(t - r.start)) + '</dd>'
      + (late ? '<dt>Late by</dt><dd style="color:var(--red)">' + esc(fmtDur(t - r.due)) + '</dd>' : '') + '</dl>'
      + '<div class="collect"><span>Collect</span><b>' + esc(money(U.amountNow(r))) + '</b></div>'
      + '<p class="muted small">The final amount is set when you confirm.</p>'
      + '<div class="row"><button class="btn" data-close>Cancel</button><button class="btn primary" id="confirmRet">Confirm return</button></div>'
    );
    var btn = $('#confirmRet', m);
    btn.addEventListener('click', function () {
      btn.disabled = true;
      btn.textContent = 'Saving...';
      var at = now(), hrs = U.billable(r.start, at, r.grace);
      var local = { amount: hrs * r.rate, hours: hrs, bike: r.bike, name: r.name, late: Math.max(0, Math.floor(at - r.due)) };
      api('return', { body: { rental_id: rid, at: at, local: local } }).then(function (res) {
        if (res.error) { toast(res.error, 'err'); closeModal(); load(); return; }
        openModal('<h2>Bike ' + esc(res.bike) + ' returned</h2><p>' + esc(res.name) + ' - billed for ' + res.hours + (res.hours === 1 ? ' hour' : ' hours') + '.</p>'
          + '<div class="collect"><span>Collect</span><b>' + esc(money(res.amount)) + '</b></div>'
          + (res.queued ? '<p class="muted small">Saved on this phone. It will be sent when you are online.</p>' : '')
          + '<div class="row"><button class="btn primary" data-close autofocus>Done</button></div>');
        load();
      });
    });
  }

  /* ----- add time (in minutes) ----- */
  function openExtend(rid) {
    var r = findRental(rid);
    if (!r) { return; }
    var add = 15;
    var m = openModal(
      '<h2>Add time to bike ' + esc(r.bike) + '</h2><p class="muted">' + esc(r.name) + ' is due back ' + esc(fmtTime(r.due)) + '.</p>'
      + '<div class="chips">' + [[15, '+15 min'], [30, '+30 min'], [60, '+1 h'], [120, '+2 h']].map(function (x) {
        return '<button type="button" class="chip" data-m="' + x[0] + '" aria-pressed="' + (x[0] === 15) + '">' + x[1] + '</button>';
      }).join('')
      + '<button type="button" class="chip" data-m="other" aria-pressed="false">Other</button>'
      + '<input type="number" id="otherM" min="1" max="1440" step="1" inputmode="numeric" placeholder="Minutes" aria-label="Minutes" hidden></div>'
      + '<div class="summary" id="sum"></div><p class="err" id="err" role="alert" hidden></p>'
      + '<div class="row"><button class="btn" data-close>Cancel</button><button class="btn primary" id="go">Add time</button></div>'
    );
    var sum = $('#sum', m), other = $('#otherM', m), err = $('#err', m), go = $('#go', m);
    function upd() {
      sum.textContent = (add >= 1 && add <= 1440) ? 'New due time: ' + fmtTime(r.due + add * 60) + '.' : 'Enter minutes from 1 to 1440.';
    }
    upd();
    $$('.chip', m).forEach(function (chip) {
      chip.addEventListener('click', function () {
        $$('.chip', m).forEach(function (c) { c.setAttribute('aria-pressed', c === chip ? 'true' : 'false'); });
        var v = chip.getAttribute('data-m');
        if (v === 'other') { other.hidden = false; other.focus(); add = parseInt(other.value, 10) || 0; }
        else { other.hidden = true; add = parseInt(v, 10); }
        upd();
      });
    });
    other.addEventListener('input', function () { add = parseInt(other.value, 10) || 0; upd(); });
    go.addEventListener('click', function () {
      if (!(add >= 1 && add <= 1440)) { return; }
      go.disabled = true;
      api('extend', { body: { rental_id: rid, new_due: r.due + add * 60 } }).then(function (res) {
        if (res.error) { err.textContent = res.error; err.hidden = false; go.disabled = false; return; }
        closeModal();
        toast('Added ' + U.fmtMin(add) + ' to bike ' + r.bike + '.' + (res.queued ? ' Saved on this phone.' : ''));
        load();
      });
    });
  }
  BH.openReturn = openReturn;
  BH.openExtend = openExtend;

  /* ----- add / remove bikes ----- */
  function openAddBikes() {
    var m = openModal(
      '<form id="addForm" autocomplete="off"><h2>Add bikes</h2>'
      + '<label>Bike numbers<input name="numbers" placeholder="12, or 1-10, or 3, 5, 8" required autofocus></label>'
      + '<p class="muted small">Use a single number, a range like 1-10, or a list separated by commas.</p>'
      + '<p class="err" id="err" role="alert" hidden></p>'
      + '<div class="row"><button type="button" class="btn" data-close>Cancel</button><button class="btn primary" type="submit" id="go">Add bikes</button></div></form>'
    );
    var err = $('#err', m), go = $('#go', m);
    $('#addForm', m).addEventListener('submit', function (e) {
      e.preventDefault();
      go.disabled = true;
      api('add_bike', { body: { numbers: this.elements.numbers.value } }).then(function (res) {
        go.disabled = false;
        if (res.error) { err.textContent = res.error; err.hidden = false; return; }
        closeModal();
        toast(res.added + (res.added === 1 ? ' bike added' : ' bikes added') + (res.skipped ? ' (' + res.skipped + ' already existed)' : '') + '.');
        load();
      });
    });
  }

  /* ----- booking requests ----- */
  function renderRequests() {
    var list = (S && S.requests) || [];
    reqEl.innerHTML = list.length
      ? '<p class="muted small">Students book on your website without an account. Approve or decline, and they see your answer when they check their code.</p>'
        + '<div class="req-grid">' + list.map(function (q) { return U.reqHtml(q, { canLease: true }); }).join('') + '</div>'
      : '<div class="panel center muted">No booking requests right now.</div>';
  }
  reqEl.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-ra]') : null;
    if (!el || !S) { return; }
    var id = el.getAttribute('data-id'), act = el.getAttribute('data-ra'), q = null;
    (S.requests || []).forEach(function (x) { if (x.id === id) { q = x; } });
    if (!q) { return; }
    var nums = freeBikes().sort(function (a, b) { return natCmp(a.number, b.number); }).map(function (b) { return b.number; });
    if (act === 'approve') { U.openDecide(q, 'approved', nums, load); }
    else if (act === 'decline') { U.openDecide(q, 'declined', nums, load); }
    else if (act === 'lease') {
      var pre = { pick: true, name: q.name, reg: q.reg, phone: q.phone, minutes: q.minutes, bookingId: q.id, bikeNumber: q.bike };
      var match = q.bike ? S.bikes.filter(function (b) { return !b.rental && String(b.number).toLowerCase() === String(q.bike).toLowerCase(); })[0] : null;
      if (match) { openLease(match.id, pre); } else { openLease(null, pre); }
    }
  });

  /* ----- clicks ----- */
  grid.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (!el) { return; }
    var act = el.getAttribute('data-act');
    var bid = el.getAttribute('data-bike'), rid = el.getAttribute('data-rental');
    if (act === 'lease') { openLease(bid); }
    else if (act === 'return') { openReturn(rid); }
    else if (act === 'extend') { openExtend(rid); }
    else if (act === 'details') { var r = findRental(rid); if (r) { U.openDetails(r); } }
    else if (act === 'addbikes') { openAddBikes(); }
    else if (act === 'remove') {
      var b = findBike(bid);
      if (b && window.confirm('Remove bike ' + b.number + ' from your list? Its past rentals stay in History.')) {
        api('remove_bike', { body: { bike_id: bid, bike_number: b.number } }).then(function (res) {
          if (res.error) { toast(res.error, 'err'); return; }
          toast('Bike ' + b.number + ' removed.');
          load();
        });
      }
    }
  });
  tabsEl.addEventListener('click', function (e) {
    var el = e.target.closest ? e.target.closest('[data-tab]') : null;
    if (!el) { return; }
    var tab = el.getAttribute('data-tab');
    var tb = $('.toolbar');
    grid.hidden = tab === 'history' || tab === 'requests';
    tb.hidden = tab === 'history' || tab === 'requests';
    historyEl.hidden = tab !== 'history';
    reqEl.hidden = tab !== 'requests';
    if (tab === 'history') {
      view = 'history';
      if (!history) { history = U.createHistory(historyEl, false); }
      history.reload();
    } else if (tab === 'requests') {
      view = 'requests';
    } else {
      view = 'bikes';
      filter = tab;
    }
    render();
  });
  $('#find').addEventListener('input', function () { findText = this.value; render(); });
  $('#addBikes').addEventListener('click', openAddBikes);

  load();
  setInterval(load, 20000);
  document.addEventListener('visibilitychange', function () { if (!document.hidden) { load(); } });
  window.addEventListener('online', function () { setTimeout(load, 500); });
  });
})();
