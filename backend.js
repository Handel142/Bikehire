/*
  Talks to Supabase for the staff pages. One function, BH.api(action, options),
  gives every screen the same simple answers: {ok:true,...} or {error:"..."}.

  Operator actions (lease, return, add time, add/remove bikes) are first saved in a
  small queue on the phone and then sent. If there is no internet they simply wait
  in the queue and are sent when the connection returns (offline mode).
*/
(function () {
  'use strict';
  var BH = window.BH;
  if (!BH) { return; }
  var sb = BH.sb;

  /* ---------- helpers ---------- */
  function uuid() {
    if (window.crypto && crypto.randomUUID) { return crypto.randomUUID(); }
    var b = new Uint8Array(16);
    (window.crypto || window.msCrypto).getRandomValues(b);
    b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
    var h = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
    return h.slice(0, 8) + '-' + h.slice(8, 12) + '-' + h.slice(12, 16) + '-' + h.slice(16, 20) + '-' + h.slice(20);
  }
  BH.uuid = uuid;
  function iso(sec) { return new Date(sec * 1000).toISOString(); }
  function nowSec() { return Date.now() / 1000; }

  var NET_RE = /failed to fetch|networkerror|network request failed|load failed|fetch failed|timed? ?out|network/i;
  var AUTH_RE = /jwt|not authenticated|invalid claim|refresh token|session/i;
  function classify(err) {
    var msg = String((err && (err.message || err.error_description)) || err || '');
    var code = err && err.code;
    if ((!code || code === '') && (NET_RE.test(msg) || navigator.onLine === false)) { return { kind: 'net' }; }
    if (/^(PGRST30[0-9]|401|403)$/.test(String(code || '')) || (AUTH_RE.test(msg) && !/violates/i.test(msg))) { return { kind: 'auth', error: msg }; }
    var m = /^REG_ACTIVE:(.*)$/.exec(msg);
    if (m) { return { kind: 'fail', confirm: true, error: m[1] }; }
    return { kind: 'fail', error: msg || 'Something went wrong. Try again.' };
  }
  function rpc(name, args) {
    return sb.rpc(name, args || {}).then(function (r) {
      if (r.error) { return classify(r.error); }
      return { kind: 'done', res: r.data };
    }, function (e) { return classify(e); });
  }
  function offlineErr() { return { error: 'No connection. Check your internet and try again.', offline: true }; }
  function direct(name, args, shape) {
    return rpc(name, args).then(function (x) {
      if (x.kind === 'done') { return shape ? shape(x.res) : (x.res && typeof x.res === 'object' ? Object.assign({ ok: true }, x.res) : { ok: true }); }
      if (x.kind === 'net') { return offlineErr(); }
      if (x.kind === 'auth') { return { error: 'Please log in again.', auth: true }; }
      return { error: x.error };
    });
  }

  /* ---------- offline queue (IndexedDB, with a memory fallback) ---------- */
  var mem = [], memSeq = 1, useMem = !window.indexedDB, dbp = null;
  function idb() {
    if (dbp) { return dbp; }
    dbp = new Promise(function (resolve, reject) {
      var r;
      try { r = indexedDB.open('bh-offline', 1); } catch (e) { reject(e); return; }
      r.onupgradeneeded = function () { r.result.createObjectStore('queue', { keyPath: 'qid', autoIncrement: true }); };
      r.onsuccess = function () { resolve(r.result); };
      r.onerror = function () { reject(r.error); };
    });
    return dbp;
  }
  function withStore(mode, fn) {
    return idb().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction('queue', mode), out = fn(t.objectStore('queue'));
        t.oncomplete = function () { resolve(out && out.result); };
        t.onerror = t.onabort = function () { reject(t.error); };
      });
    });
  }
  function qAdd(it) {
    if (!useMem) {
      return withStore('readwrite', function (s) { return s.add(it); }).catch(function () { useMem = true; return qAdd(it); });
    }
    it.qid = memSeq++; mem.push(it); return Promise.resolve(it.qid);
  }
  function qAll() {
    if (!useMem) {
      return withStore('readonly', function (s) { return s.getAll(); }).then(function (a) { return a || []; }, function () { useMem = true; return qAll(); });
    }
    return Promise.resolve(mem.slice());
  }
  function qPut(it) {
    if (!useMem) { return withStore('readwrite', function (s) { return s.put(it); }).catch(function () { /* ignore */ }); }
    for (var i = 0; i < mem.length; i++) { if (mem[i].qid === it.qid) { mem[i] = it; } }
    return Promise.resolve();
  }
  function qDel(qid) {
    if (!useMem) { return withStore('readwrite', function (s) { return s['delete'](qid); }).catch(function () { /* ignore */ }); }
    mem = mem.filter(function (x) { return x.qid !== qid; });
    return Promise.resolve();
  }
  function myQueue() {
    return qAll().then(function (all) {
      var uid = BH.me && BH.me.id;
      return all.filter(function (x) { return x.uid === uid; }).sort(function (a, b) { return a.qid - b.qid; });
    });
  }

  var queueLen = 0;
  BH.queueCount = function () { return queueLen; };
  function refreshCount() { return myQueue().then(function (q) { queueLen = q.length; return q; }, function () { return []; }); }

  /* ---------- running one queued item against the server ---------- */
  function bikeIdFor(it) {
    var id = it.data.bike_id;
    if (!/^tmp-/.test(String(id))) { return Promise.resolve(id); }
    return sb.from('bikes').select('id').eq('number', it.data.bike_number).eq('active', true).maybeSingle().then(function (r) {
      return r && r.data ? r.data.id : null;
    }, function () { return null; });
  }

  function runLease(it) {
    var d = it.data;
    function send(path) {
      return bikeIdFor(it).then(function (bid) {
        if (!bid) { return { kind: 'fail', error: 'That bike was not found.' }; }
        return rpc('lease_bike', {
          p_id: d.id, p_bike: bid, p_name: d.name, p_reg: d.reg, p_phone: d.phone || '',
          p_start: iso(d.start), p_minutes: d.minutes, p_photo: path, p_booking: d.booking_id || null, p_force: !!d.force
        });
      });
    }
    if (it.photoPath) { return send(it.photoPath); }
    if (!it.blob) { return Promise.resolve({ kind: 'fail', error: "Take the renter's photo first." }); }
    var path = BH.me.id + '/' + d.id + '.jpg';
    return sb.storage.from('renter-photos').upload(path, it.blob, { contentType: 'image/jpeg', upsert: true }).then(function (r) {
      if (r.error) { return classify(r.error); }
      it.photoPath = path;
      return qPut(it).then(function () { return send(path); });
    }, function (e) { return classify(e); });
  }

  function runItem(it) {
    var d = it.data;
    switch (it.type) {
      case 'lease': return runLease(it);
      case 'return': return rpc('return_bike', { p_rental: d.rental_id, p_returned: iso(d.at) });
      case 'extend': return rpc('extend_rental', { p_rental: d.rental_id, p_new_due: iso(d.new_due) });
      case 'add_bike': return rpc('add_bikes', { p_numbers: d.numbers });
      case 'remove_bike':
        return bikeIdFor(it).then(function (bid) {
          if (!bid) { return { kind: 'done', res: { ok: true } }; }
          return rpc('remove_bike', { p_bike: bid });
        });
      default: return Promise.resolve({ kind: 'fail', error: 'Unknown action.' });
    }
  }

  var flushing = null;
  function doFlush() {
    var results = {}, stopped = null;
    return myQueue().then(function (q) {
      var i = 0;
      function next() {
        if (i >= q.length) { return; }
        var it = q[i++];
        return runItem(it).then(function (x) {
          if (x.kind === 'done') { results[it.qid] = x.res; return qDel(it.qid).then(next); }
          if (x.kind === 'fail') {
            results[it.qid] = { error: x.error, confirm: !!x.confirm, failed: true };
            return qDel(it.qid).then(next);
          }
          stopped = x.kind; // 'net' or 'auth': keep everything and stop here
        });
      }
      return next();
    }).then(refreshCount).then(function () { return { results: results, stopped: stopped }; });
  }
  function flush() {
    if (!flushing) {
      flushing = doFlush().then(function (r) { flushing = null; return r; }, function (e) { flushing = null; throw e; });
    }
    return flushing;
  }
  BH.flushQueue = function () {
    return flush().then(function (f) {
      var n = 0, errs = [];
      Object.keys(f.results).forEach(function (k) { var r = f.results[k]; if (r && r.failed) { errs.push(r.error); } else { n++; } });
      return { synced: n, errors: errs, stopped: f.stopped };
    });
  };

  function settle(qid, tries) {
    return flush().then(function (f) {
      if (f.results[qid] !== undefined) { return { done: true, res: f.results[qid] }; }
      if (f.stopped) { return { done: false, stopped: f.stopped }; }
      if (tries > 3) { return { done: false, stopped: 'net' }; }
      return settle(qid, (tries || 0) + 1);
    });
  }

  /* Save an operator action, try to send it now, report what happened. */
  function act(type, data, blob, queuedAnswer, shape) {
    var it = { type: type, data: data, uid: BH.me.id, at: Date.now(), blob: blob || null };
    return qAdd(it).then(function (qid) {
      return refreshCount().then(function () {
        if (navigator.onLine === false) { return { done: false, stopped: 'net' }; }
        return settle(qid, 0);
      });
    }).then(function (s) {
      if (!s.done) {
        if (s.stopped === 'auth') { return Object.assign({ ok: true, queued: true, needLogin: true }, queuedAnswer || {}); }
        return Object.assign({ ok: true, queued: true }, queuedAnswer || {});
      }
      var r = s.res;
      if (r && r.error) { return { error: r.error, confirm: !!r.confirm }; }
      return shape ? shape(r) : Object.assign({ ok: true }, r || {});
    });
  }

  /* ---------- the operator screen: server state + anything still waiting ---------- */
  function stateKey() { return 'bh_state_' + (BH.me && BH.me.id); }
  var localPhotos = {};
  function localPhoto(it) {
    if (!it.blob) { return ''; }
    if (!localPhotos[it.qid]) { try { localPhotos[it.qid] = URL.createObjectURL(it.blob); } catch (e) { return ''; } }
    return localPhotos[it.qid];
  }
  function billableLocal(start, end, grace) {
    var net = Math.max(0, Math.max(0, end - start) - grace * 60);
    return Math.max(1, Math.ceil(net / 3600));
  }

  function overlay(st, queue) {
    st = JSON.parse(JSON.stringify(st));
    function bikeBy(id) { for (var i = 0; i < st.bikes.length; i++) { if (st.bikes[i].id === id) { return st.bikes[i]; } } return null; }
    function bikeByNum(n) { for (var i = 0; i < st.bikes.length; i++) { if (String(st.bikes[i].number).toLowerCase() === String(n).toLowerCase()) { return st.bikes[i]; } } return null; }
    function rentalBy(id) { for (var i = 0; i < st.bikes.length; i++) { if (st.bikes[i].rental && st.bikes[i].rental.id === id) { return st.bikes[i]; } } return null; }
    queue.forEach(function (it) {
      var d = it.data, b;
      if (it.type === 'add_bike') {
        d.numbers.forEach(function (n) { if (!bikeByNum(n)) { st.bikes.push({ id: 'tmp-' + n, number: n, note: '', rental: null, pending: true }); } });
      } else if (it.type === 'remove_bike') {
        st.bikes = st.bikes.filter(function (x) { return x.id !== d.bike_id || x.rental; });
      } else if (it.type === 'lease') {
        b = bikeBy(d.bike_id) || bikeByNum(d.bike_number);
        if (b && !b.rental) {
          b.rental = {
            id: d.id, bike_id: b.id, bike: b.number, name: d.name, reg: d.reg, phone: d.phone || '',
            photo: localPhoto(it), has_photo: true, start: d.start, due: d.start + d.minutes * 60, returned: null,
            minutes: d.minutes, rate: BH.rate, grace: BH.grace, amount: null, operator: BH.me.display_name, pending: true
          };
          st.today.leases++;
        }
        if (d.booking_id) { st.requests = (st.requests || []).filter(function (q) { return q.id !== d.booking_id; }); }
      } else if (it.type === 'return') {
        b = rentalBy(d.rental_id);
        if (b) {
          var r = b.rental;
          st.today.returned++;
          st.today.earned += billableLocal(r.start, d.at, r.grace) * r.rate;
          b.rental = null;
        }
      } else if (it.type === 'extend') {
        b = rentalBy(d.rental_id);
        if (b && d.new_due > b.rental.due) {
          b.rental.minutes += Math.round((d.new_due - b.rental.due) / 60);
          b.rental.due = d.new_due;
        }
      }
    });
    return st;
  }

  function loadState() {
    return refreshCount().then(function () { return myQueue(); }).then(function (queue) {
      var pre = queue.length && navigator.onLine !== false ? flush().then(myQueue) : Promise.resolve(queue);
      return pre;
    }).then(function (queue) {
      return rpc('operator_state').then(function (x) {
        if (x.kind === 'done') {
          BH.lsSet(stateKey(), x.res);
          var out = overlay(x.res, queue);
          out.ok = true; out.pending = queue.length; out.offline = false;
          return out;
        }
        var cached = BH.lsGet(stateKey(), null);
        if (x.kind === 'auth') { return { error: 'Please log in again.', auth: true }; }
        if (x.kind === 'net' && cached) {
          var o = overlay(cached, queue);
          o.ok = true; o.pending = queue.length; o.offline = true; o.now = Date.now() / 1000;
          return o;
        }
        return x.kind === 'net' ? offlineErr() : { error: x.error };
      });
    });
  }

  /* ---------- public entry point ---------- */
  function mapDirect(res) { return Object.assign({ ok: true }, res || {}); }

  BH.api = function (action, opts) {
    opts = opts || {};
    var b = opts.body || {}, p = opts.params || {};
    switch (action) {
      case 'state': return loadState();

      case 'lease': {
        var data = {
          id: b.id, bike_id: b.bike_id, bike_number: b.bike_number, name: b.renter_name, reg: b.reg_no,
          phone: b.phone || '', start: Math.floor(b.start), minutes: b.minutes, booking_id: b.booking_id || null, force: !!b.force
        };
        return act('lease', data, b.photo, {});
      }
      case 'return': {
        var at = Math.floor(b.at || nowSec());
        return act('return', { rental_id: b.rental_id, at: at }, null, b.local || {});
      }
      case 'extend': return act('extend', { rental_id: b.rental_id, new_due: Math.floor(b.new_due) }, null, {});
      case 'add_bike': {
        var nums;
        try { nums = BH.parseBikeNumbers(b.numbers); } catch (e) { return Promise.resolve({ error: e.message }); }
        return act('add_bike', { numbers: nums }, null, { added: nums.length, skipped: 0 });
      }
      case 'remove_bike': return act('remove_bike', { bike_id: b.bike_id, bike_number: b.bike_number }, null, {});

      case 'history':
        return direct('history_search', { p_q: p.q || '', p_status: p.status || 'all', p_limit: +p.limit || 30, p_offset: +p.offset || 0 });
      case 'export':
        return direct('history_search', { p_q: '', p_status: 'all', p_limit: 5000, p_offset: 0 });

      case 'overview': return direct('admin_overview', {});
      case 'toggle_operator': return direct('admin_toggle_operator', { p_user: b.id, p_active: !!b.active });
      case 'reset_password': return direct('admin_set_password', { p_user: b.id, p_password: b.password });
      case 'update_operator': return direct('admin_update_operator', { p_user: b.id, p_name: b.name, p_phone: b.phone || '', p_stand: b.stand || '' });
      case 'decide': return direct('decide_booking', { p_id: b.id, p_decision: b.decision, p_message: b.message || '', p_bike: b.bike || '' });

      case 'create_operator': return createOperator(b);

      case 'save_settings': {
        var rows = Object.keys(b).map(function (k) { return { k: k, v: String(b[k] == null ? '' : b[k]) }; });
        return sb.from('site_settings').upsert(rows, { onConflict: 'k' }).then(function (r) {
          if (r.error) { var c = classify(r.error); return c.kind === 'net' ? offlineErr() : { error: c.error }; }
          return { ok: true };
        }, function () { return offlineErr(); });
      }
      default:
        return Promise.resolve({ error: 'Unknown action.' });
    }
  };

  /* ---------- registering an operator (admin) ---------- */
  function createOperator(b) {
    var email = String(b.email || '').trim().toLowerCase();
    if (String(b.password || '').length < 8) { return Promise.resolve({ error: 'Password must be at least 8 characters.' }); }
    return rpc('create_invite', { p_email: email, p_name: b.display_name, p_phone: b.phone || '', p_stand: b.stand || '' }).then(function (x) {
      if (x.kind === 'net') { return offlineErr(); }
      if (x.kind !== 'done') { return { error: x.error || 'Could not register this operator.' }; }
      var cfg = window.BH_CONFIG;
      // A second, temporary connection creates the account so the admin stays signed in.
      var tmp = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'bh-temp-signup' }
      });
      return tmp.auth.signUp({ email: email, password: b.password, options: { data: { invite: x.res } } }).then(function (r) {
        if (r.error) {
          var m = String(r.error.message || '');
          if (/already registered|already been registered/i.test(m)) { return { error: 'That email already has an account.' }; }
          if (/database error|sign-ups are closed/i.test(m)) { return { error: 'Could not register this operator. Try again in a moment.' }; }
          if (/rate limit/i.test(m)) { return { error: 'Too many sign-ups for now. Wait a few minutes and try again.' }; }
          return { error: m || 'Could not register this operator.' };
        }
        return { ok: true };
      }, function () { return offlineErr(); });
    });
  }

  /* ---------- bike numbers: "12", "1-10", "3, 5, 8" ---------- */
  BH.parseBikeNumbers = function (input) {
    var out = [], seen = {};
    String(input || '').split(',').forEach(function (part) {
      part = part.replace(/\s+/g, ' ').trim();
      if (!part) { return; }
      var m = /^(\d{1,4})\s*-\s*(\d{1,4})$/.exec(part);
      if (m) {
        var a = +m[1], z = +m[2], t;
        if (z < a) { t = a; a = z; z = t; }
        if (z - a > 99) { throw new Error('Add at most 100 bikes at a time.'); }
        for (var i = a; i <= z; i++) { if (!seen[i]) { seen[i] = 1; out.push(String(i)); } }
      } else {
        if (!/^[A-Za-z0-9 _-]{1,20}$/.test(part)) { throw new Error('Bike numbers can use letters, digits, spaces and dashes (max 20 characters).'); }
        if (!seen[part.toLowerCase()]) { seen[part.toLowerCase()] = 1; out.push(part); }
      }
    });
    if (!out.length) { throw new Error('Type a bike number, a range like 1-10, or a list like 3, 5, 8.'); }
    if (out.length > 100) { throw new Error('Add at most 100 bikes at a time.'); }
    return out;
  };

  /* keep trying while the page is open */
  window.addEventListener('online', function () { if (BH.me && BH.me.role === 'operator') { BH.flushQueue().then(function (r) { if (BH.onSynced) { BH.onSynced(r); } }); } });
  BH.isOffline = function () { return navigator.onLine === false; };
})();
