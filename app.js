/* Pop-Out Repair Photos. MIT licence. Runs entirely in the browser; photos never leave the device. */
(function () {
  'use strict';
  var STAGES = [
    { k: 'pre', label: 'Pre Repair', short: 'Pre', file: 'Pre' },
    { k: 'during', label: 'In Progress Repair', short: 'During', file: 'During' },
    { k: 'post', label: 'Post Repair', short: 'Post', file: 'Post' }
  ];
  var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'K'];
  var LOCS = FORM.locations;
  var SETTINGS_ID = '__settings__';

  var idb = null;
  var state = { utns: [], settings: null, view: 'home', openId: null, saveOk: true };
  var urls = [];
  var toastTimer = null;
  var saveTimer = null;

  function $(s) { return document.querySelector(s); }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function dstr(t) { var d = new Date(t); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayStr() { var d = new Date(); return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear(); }
  function cleanId(s) { return String(s || '').toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 12); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function S() { return state.settings || { id: SETTINGS_ID, fgjv: '', qua: '', prodName: '', prodDesig: '', quaName: '', quaDesig: '', shlName: '', shlDesig: '', logo: null, sig: null }; }
  function needSetup() { var s = S(); return !s.fgjv || !s.qua; }

  /* ---------- storage (IndexedDB, this phone only) ---------- */
  function openDb() {
    return new Promise(function (res) {
      try {
        var r = indexedDB.open('fgjv0008-caps', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('utns', { keyPath: 'id' }); };
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { res(null); };
        r.onblocked = function () { res(null); };
      } catch (e) { res(null); }
    });
  }
  function dbAll() {
    return new Promise(function (res) {
      if (!idb) return res([]);
      try {
        var q = idb.transaction('utns').objectStore('utns').getAll();
        q.onsuccess = function () { res(q.result || []); };
        q.onerror = function () { res([]); };
      } catch (e) { res([]); }
    });
  }
  function dbPut(rec) {
    return new Promise(function (res) {
      if (!idb) return res(false);
      try {
        var tx = idb.transaction('utns', 'readwrite');
        tx.objectStore('utns').put(rec);
        tx.oncomplete = function () { res(true); };
        tx.onerror = function () { res(false); };
        tx.onabort = function () { res(false); };
      } catch (e) { res(false); }
    });
  }
  function dbDel(id) {
    return new Promise(function (res) {
      if (!idb) return res(false);
      try {
        var tx = idb.transaction('utns', 'readwrite');
        tx.objectStore('utns').delete(id);
        tx.oncomplete = function () { res(true); };
        tx.onerror = function () { res(false); };
        tx.onabort = function () { res(false); };
      } catch (e) { res(false); }
    });
  }
  function save(u) {
    u.updated = Date.now();
    return dbPut(u).then(function (ok) {
      if (!ok && idb) { state.saveOk = false; render(); }
      return ok;
    });
  }
  function normalise(u) {
    if (u.expiry == null) u.expiry = '';
    if (u.date == null) u.date = '';
    u.segments.forEach(function (s) { if (!s.caps) s.caps = []; });
    return u;
  }

  /* ---------- helpers ---------- */
  function getUtn(id) { return state.utns.filter(function (u) { return u.id === id; })[0]; }
  function counts(u) {
    var have = 0, total = 0;
    u.segments.forEach(function (s) { s.caps.forEach(function (c) { STAGES.forEach(function (st) { total++; if (c.photos[st.k]) have++; }); }); });
    return { have: have, total: total };
  }
  function getSeg(u, id) { return u.segments.filter(function (s) { return s.id === id; })[0]; }
  function getCap(seg, id) { return seg ? seg.caps.filter(function (c) { return c.id === id; })[0] : null; }
  function locList(seg) {
    var l = seg.caps.map(function (c) { return c.loc; });
    return l.length < 2 ? l.join('') : l.slice(0, -1).join(', ') + ' & ' + l[l.length - 1];
  }
  function remark(seg) { var n = seg.caps.length; return n + 'x cap' + (n === 1 ? ': ' : ' - ') + locList(seg); }
  function utnLabel(u, seg) { return u.utn + ' ' + seg.label; }
  function toast(msg, ms) {
    clearTimeout(toastTimer);
    var t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.className = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.textContent = msg;
    toastTimer = setTimeout(function () { var x = $('#toast'); if (x) x.remove(); }, ms || 3200);
  }
  function ask(msg, okLabel) {
    return new Promise(function (res) {
      var layer = $('#layer');
      layer.innerHTML = '<div class="modal-bg"><div class="modal" role="dialog" aria-modal="true"><div>' + esc(msg) + '</div><div class="row"><button class="grow" data-m="no">Cancel</button><button class="grow danger" data-m="yes">' + esc(okLabel || 'OK') + '</button></div></div></div>';
      layer.onclick = function (e) {
        var b = e.target.closest('[data-m]');
        if (!b) return;
        layer.innerHTML = ''; layer.onclick = null;
        res(b.getAttribute('data-m') === 'yes');
      };
    });
  }

  /* ---------- images ---------- */
  function loadImg(file) {
    return new Promise(function (res, rej) {
      var u = URL.createObjectURL(file);
      var im = new Image();
      im.onload = function () { URL.revokeObjectURL(u); res(im); };
      im.onerror = function () { URL.revokeObjectURL(u); rej(new Error('image')); };
      im.src = u;
    });
  }
  function bitmap(file) {
    return (typeof createImageBitmap === 'function')
      ? createImageBitmap(file, { imageOrientation: 'from-image' }).catch(function () { return loadImg(file); })
      : loadImg(file);
  }
  function toJpeg(file, maxSide, quality, white) {
    return bitmap(file).then(function (img) {
      var w0 = img.width || img.naturalWidth, h0 = img.height || img.naturalHeight;
      var s = Math.min(1, maxSide / Math.max(w0, h0));
      var w = Math.max(1, Math.round(w0 * s)), h = Math.max(1, Math.round(h0 * s));
      var c = document.createElement('canvas');
      c.width = w; c.height = h;
      var g = c.getContext('2d');
      if (white) { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }
      g.drawImage(img, 0, 0, w, h);
      if (img.close) img.close();
      return new Promise(function (res, rej) {
        c.toBlob(function (b) { b ? res(b) : rej(new Error('encode')); }, 'image/jpeg', quality);
      }).then(function (blob) {
        return blob.arrayBuffer().then(function (buf) { return { buf: buf, w: w, h: h }; });
      });
    });
  }
  function pick(segId, capId, stageK, camera) {
    var u = getUtn(state.openId);
    if (!u) return;
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    if (camera) inp.setAttribute('capture', 'environment');
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      inp.remove();
      if (!f) return;
      toast('Saving photo…', 6000);
      toJpeg(f, 1600, 0.82, false).then(function (r) {
        var cap = getCap(getSeg(u, segId), capId);
        if (!cap) return;
        cap.photos[stageK] = { buf: r.buf, w: r.w, h: r.h, ts: Date.now() };
        return save(u).then(function (ok) { render(); toast(ok ? 'Photo saved' : 'Photo kept for now, but could not be saved to this phone. Export soon.'); });
      }).catch(function () { toast('That photo could not be read. Try again.'); });
    });
    inp.click();
  }
  function pickImage(key, size, msg) {
    var inp = document.createElement('input');
    inp.type = 'file'; inp.accept = 'image/*';
    inp.style.display = 'none';
    document.body.appendChild(inp);
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      inp.remove();
      if (!f) return;
      toJpeg(f, size, 0.92, true).then(function (r) {
        var s = S(); s.id = SETTINGS_ID; s[key] = r;
        state.settings = s;
        return dbPut(s).then(function () { renderKeepSettings(); toast(msg); });
      }).catch(function () { toast('That image could not be read.'); });
    });
    inp.click();
  }

  function pickLogo() { pickImage('logo', 700, 'Logo saved on this phone.'); }
  function pickSig() { pickImage('sig', 800, 'Signature saved on this phone.'); }

  /* ---------- export ---------- */
  function segName(s) { return cleanId(s.label) || 'SEG'; }
  function locName(c) { return (c.loc || '').replace(/\./g, ''); }
  function missingFor(u, segs) {
    var m = [];
    if (needSetup()) m.push('initials in Settings');
    if (!(u.expiry || '').trim()) m.push('expiry (item 3)');
    if (!segs.length) m.push('at least one segment');
    segs.forEach(function (s) {
      if (!s.caps.length) m.push('a cap for segment ' + s.label);
      s.caps.forEach(function (c, i) { if (!c.loc) m.push('location of cap ' + (i + 1) + ' (segment ' + s.label + ')'); });
    });
    return m;
  }
  function shlInitials(n) { return String(n || '').trim().split(/\s+/).map(function (w) { return w.charAt(0).toUpperCase(); }).join(''); }
  function buildForPdf(u, sg) {
    var s = S();
    var shlPresent = !!((s.shlName || '').trim() || (s.shlDesig || '').trim());
    var vals = { expiry: u.expiry.trim() };
    var caps = sg.caps.map(function (c) {
      var photos = {};
      STAGES.forEach(function (st) {
        var p = c.photos[st.k];
        photos[st.k] = p ? { bytes: new Uint8Array(p.buf), w: p.w, h: p.h } : null;
      });
      return { label: c.loc, type: 'IPT', photos: photos };
    });
    return buildPdf({
      utn: utnLabel(u, sg), utnLabel: utnLabel(u, sg),
      formNo: FORM.no, photoFormNo: FORM.no, title1: FORM.title1, title2: FORM.title2, types: FORM.types,
      unitWord: 'CAP', hideType: true,
      logo: s.logo ? { bytes: new Uint8Array(s.logo.buf), w: s.logo.w, h: s.logo.h } : null,
      stages: STAGES, segments: caps,
      page1: {
        sections: FORM.sections.map(function (sec) {
          return { title: sec.title, after: sec.after, rows: sec.rows.map(function (r) { return { t: r.t, on: r.on, r: r.field ? vals[r.field] : r.r }; }) };
        }),
        repairType: FORM.repairType, cms: FORM.cms,
        remarks: [remark(sg)],
        initials: { c: s.fgjv, q: s.qua, s: shlPresent ? shlInitials(s.shlName) : 'Not Present' },
        shlPresent: shlPresent, prodName: s.prodName, prodDesig: s.prodDesig,
        qua: { name: s.quaName, desig: s.quaDesig }, shl: { name: s.shlName, desig: s.shlDesig }, date: (u.date || '').trim(),
        signature: s.sig ? { bytes: new Uint8Array(s.sig.buf), w: s.sig.w, h: s.sig.h } : null
      }
    });
  }
  function pdfName(u, sg) { return FORM.no + ' - ' + utnLabel(u, sg) + '.pdf'; }
  function exportPdf(u, segs) {
    if (segs.length === 1) return saveFile(pdfName(u, segs[0]), new Blob([buildForPdf(u, segs[0])], { type: 'application/pdf' }));
    var files = segs.map(function (sg) { return { name: pdfName(u, sg), data: buildForPdf(u, sg) }; });
    return saveFile('UTN_' + u.utn + '_forms.zip', new Blob([zipStore(files)], { type: 'application/zip' }));
  }
  function photoName(u, s, c, st, p) { return u.utn + '_' + segName(s) + '_' + locName(c) + '_' + st.file + '_' + dstr(p.ts) + '.jpg'; }
  function allPhotos(u) {
    var out = [];
    u.segments.forEach(function (s) { s.caps.forEach(function (c) { STAGES.forEach(function (st) { var p = c.photos[st.k]; if (p) out.push({ name: photoName(u, s, c, st, p), buf: p.buf }); }); }); });
    return out;
  }
  function exportZip(u) {
    var files = allPhotos(u).map(function (x) { return { name: u.utn + '/' + x.name, data: new Uint8Array(x.buf) }; });
    if (!files.length) { toast('No photos to save yet.'); return Promise.resolve(); }
    return saveFile('UTN_' + u.utn + '_photos.zip', new Blob([zipStore(files)], { type: 'application/zip' }));
  }
  function exportJpgs(u) {
    var files = allPhotos(u).map(function (x) { return new File([x.buf], x.name, { type: 'image/jpeg' }); });
    if (!files.length) { toast('No photos to save yet.'); return Promise.resolve(); }
    if (!(navigator.canShare && navigator.canShare({ files: files }))) return Promise.reject({ code: 'noshare' });
    return navigator.share({ files: files }).then(function () { return 'shared'; }, function (e) {
      return Promise.reject(e && e.name === 'AbortError' ? { code: 'declined' } : { code: 'share' });
    });
  }
  /* Save a file: share sheet where available (iPhone: Save to Files), otherwise a normal download. */
  function saveFile(name, blob) {
    var file;
    try { file = new File([blob], name, { type: blob.type }); } catch (e) { file = null; }
    var tryShare = file && navigator.canShare && navigator.canShare({ files: [file] })
      ? navigator.share({ files: [file], title: name }).then(function () { return 'shared'; }, function (e) {
          if (e && e.name === 'AbortError') return Promise.reject({ code: 'declined' });
          return 'fallback';
        })
      : Promise.resolve('fallback');
    return tryShare.then(function (r) {
      if (r === 'shared') return r;
      var a = document.createElement('a');
      var u = URL.createObjectURL(blob);
      a.href = u; a.download = name; a.style.display = 'none';
      document.body.appendChild(a); a.click();
      setTimeout(function () { a.remove(); URL.revokeObjectURL(u); }, 5000);
      return 'downloaded';
    });
  }
  function doExport(kind, segId) {
    var u = getUtn(state.openId);
    if (!u) return;
    var segs = segId ? u.segments.filter(function (s) { return s.id === segId; }) : u.segments;
    if (kind === 'pdf') {
      var m = missingFor(u, segs);
      if (m.length) { toast('Still needed: ' + m.join(', ') + '.', 6000); return; }
    } else if (!counts(u).have) { toast('Take at least one photo first.'); return; }
    toast('Preparing file…', 8000);
    var p;
    try { p = kind === 'pdf' ? exportPdf(u, segs) : kind === 'jpgs' ? exportJpgs(u) : exportZip(u); } catch (e) { toast('Could not build the file.'); return; }
    p.then(function (r) { if (r === 'shared') toast('Done.'); else if (r === 'downloaded') toast('File downloaded. Check Files or Downloads.'); }, function (e) {
      if (e && e.code === 'declined') toast('Save cancelled.');
      else if (e && e.code === 'noshare') toast('This browser cannot send photos to the Photos app. Use Photos as ZIP.');
      else toast('Could not save the file' + (e && e.code ? ' (' + e.code + ')' : '') + '.');
    });
  }

  /* ---------- views ---------- */
  function topBanner() {
    var s = '';
    if (!idb) s += '<div class="banner">This browser is not keeping data between visits. Photos will be lost when you close this page. Export before leaving.</div>';
    else if (!state.saveOk) s += '<div class="banner">The last save to this phone failed. Export your photos now.</div>';
    return s;
  }
  function viewHome() {
    var list = state.utns.slice().sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
    var h = '<div class="bar"><div class="grow"><h1>Pop-Out Repair Photos</h1><p class="sub">Form 0008: checklist and photo pages.</p></div><button class="small" data-act="settings">Settings</button></div>';
    h += topBanner();
    if (needSetup()) h += '<div class="banner">One-time setup needed: initials for the form. <button class="small" data-act="settings">Set up</button></div>';
    h += '<form class="card" id="f-utn" autocomplete="off"><h2>Add a ring (UTN)</h2><div class="row"><input id="in-utn" type="tel" inputmode="numeric" placeholder="e.g. 12134" aria-label="UTN" maxlength="12"><button class="primary" type="submit">Add</button></div></form>';
    if (!list.length) {
      h += '<div class="empty">No UTNs yet. Add one above, then add its segments (K, G, C, F, D …).</div>';
    } else {
      h += '<h2>Your UTNs</h2><div style="display:flex;flex-direction:column;gap:10px">';
      list.forEach(function (u) {
        var c = counts(u);
        var done = c.total > 0 && c.have === c.total;
        h += '<button class="utn-item card" data-act="open" data-id="' + esc(u.id) + '"><span><span class="utn-no">' + esc(u.utn) + '</span><br><span class="note">' + u.segments.length + ' segment' + (u.segments.length === 1 ? '' : 's') + (u.segments.length ? ': ' + esc(u.segments.map(function (s) { return s.label; }).join(', ')) : '') + '</span></span><span class="pill' + (done ? ' done' : '') + '">' + c.have + ' / ' + c.total + '</span></button>';
      });
      h += '</div>';
    }
    h += '<p class="note">Photos and form details are stored only on this phone, inside this page. Save the PDF for each UTN when you finish it.</p>';
    return h;
  }
  function viewSettings() {
    var s = S();
    var h = '<div class="bar"><button data-act="back" aria-label="Back">← Back</button><h1>Settings</h1></div>';
    if (needSetup()) h += '<p class="note">Enter these once. They are printed on every row of the form and stay on this phone.</p>';
    h += '<form class="card" id="f-set" autocomplete="off">';
    h += '<label class="fld"><span>FGJV CONST initials</span><input id="s-fgjv" type="text" value="' + esc(s.fgjv) + '" maxlength="8" autocapitalize="characters" placeholder="e.g. ZAK"></label>';
    h += '<label class="fld"><span>FGJV QUA initials</span><input id="s-qua" type="text" value="' + esc(s.qua) + '" maxlength="8" autocapitalize="characters" placeholder="Quality representative"></label>';
    h += '<p class="note" style="margin:0"></p>';
    h += '<label class="fld"><span>FGJV Production Rep: name (you)</span><input id="s-name" type="text" value="' + esc(s.prodName) + '" maxlength="60" placeholder="Name"></label>';
    h += '<label class="fld"><span>FGJV Production Rep: designation</span><input id="s-desig" type="text" value="' + esc(s.prodDesig) + '" maxlength="60" placeholder="e.g. Engineer - Project"></label>';
    h += '<label class="fld"><span>FGJV Quality Rep: name</span><input id="s-qname" type="text" value="' + esc(s.quaName) + '" maxlength="60" placeholder="Name"></label>';
    h += '<label class="fld"><span>FGJV Quality Rep: designation</span><input id="s-qdesig" type="text" value="' + esc(s.quaDesig) + '" maxlength="60" placeholder="e.g. Coordinator - Quality"></label>';
    h += '<label class="fld"><span>SHL Rep: name</span><input id="s-sname" type="text" value="' + esc(s.shlName) + '" maxlength="60" placeholder="Leave blank if SHL is not present"></label>';
    h += '<label class="fld"><span>SHL Rep: designation</span><input id="s-sdesig" type="text" value="' + esc(s.shlDesig) + '" maxlength="60" placeholder="Leave blank if SHL is not present"></label>';
    h += '<p class="note" style="margin:0">If the SHL name and designation are blank, the form prints "Not Present" for SHL.</p>';
    h += '<button class="primary" type="submit">Save settings</button></form>';
    h += '<div class="card"><h2>Logo (optional)</h2>';
    if (s.logo) {
      var url = URL.createObjectURL(new Blob([s.logo.buf], { type: 'image/jpeg' }));
      urls.push(url);
      h += '<div class="logo-prev"><img alt="Logo preview" src="' + url + '"></div><div class="row"><button class="grow" data-act="logo">Choose another</button><button class="grow danger" data-act="rmlogo">Remove</button></div>';
    } else {
      h += '<p class="note" style="margin:0">Choose an image of the logo from your phone (for example a screenshot of the form header). It is stored on this phone only and printed at the top left of each page.</p><button data-act="logo">Choose logo image</button>';
    }
    h += '</div>';
    h += '<div class="card"><h2>Your signature</h2>';
    if (s.sig) {
      var su = URL.createObjectURL(new Blob([s.sig.buf], { type: 'image/jpeg' }));
      urls.push(su);
      h += '<div class="logo-prev"><img alt="Signature preview" src="' + su + '"></div><div class="row"><button class="grow" data-act="sig">Take another</button><button class="grow danger" data-act="rmsig">Remove</button></div>';
    } else {
      h += '<p class="note" style="margin:0">Sign on white paper and photograph it. It is stored on this phone only and printed in the Production Representative signature boxes. Leave it out to sign by hand later.</p><button data-act="sig">Add signature photo</button>';
    }
    h += '</div>';
    return h;
  }
  function stageHtml(seg, cap, st) {
    var p = cap.photos[st.k];
    var ids = 'data-seg="' + esc(seg.id) + '" data-cap="' + esc(cap.id) + '" data-st="' + st.k + '"';
    var h = '<div class="stage"><div class="stage-label">' + st.short + '</div>';
    if (p) {
      var url = URL.createObjectURL(new Blob([p.buf], { type: 'image/jpeg' }));
      urls.push(url);
      h += '<div class="thumb"><img alt="' + esc(st.label + ' cap ' + cap.loc) + '" src="' + url + '"></div>';
      h += '<div class="stage-actions"><button class="small" data-act="shoot" ' + ids + '>Retake</button><button class="small danger" data-act="rmphoto" ' + ids + ' aria-label="Remove photo">✕</button></div>';
    } else {
      h += '<button class="shoot" data-act="shoot" ' + ids + '><span class="cam" aria-hidden="true">📷</span><span>' + st.short + '</span></button>';
      h += '<div class="stage-actions"><button class="small" data-act="lib" ' + ids + '>From library</button></div>';
    }
    return h + '</div>';
  }
  function viewUtn(u) {
    var c = counts(u);
    var h = '<div class="bar"><button data-act="back" aria-label="Back to list">← Back</button><h1>UTN ' + esc(u.utn) + '</h1><span class="pill' + (c.total && c.have === c.total ? ' done' : '') + '">' + c.have + ' / ' + c.total + '</span></div>';
    h += topBanner();
    h += '<div class="card"><h2>Form details</h2>';
    h += '<label class="fld"><span>Item 3: expiry and storage <b class="req">required</b></span><input type="text" data-f="expiry" value="' + esc(u.expiry) + '" placeholder="e.g. 27-Mar" autocomplete="off"></label>';
    h += '<label class="fld"><span>Form date (printed in all three date boxes)</span><input type="text" data-f="date" value="' + esc(u.date) + '" placeholder="dd/mm/yyyy" autocomplete="off"></label>';
    h += '<p class="note" style="margin:0">Everything else on the form is pre-filled. One form is made per segment.</p></div>';
    h += '<div class="card"><h2>Add segment</h2><div class="chips">';
    LETTERS.forEach(function (L) {
      var used = u.segments.some(function (s) { return s.label === L; });
      h += '<button class="chip" data-act="addseg" data-l="' + L + '"' + (used ? ' disabled' : '') + '>' + L + '</button>';
    });
    h += '</div><form id="f-seg" class="row" autocomplete="off"><input id="in-seg" type="text" placeholder="Other, e.g. A2" aria-label="Other segment" maxlength="12" autocapitalize="characters"><button type="submit">Add</button></form></div>';
    if (!u.segments.length) h += '<div class="empty">Tap a letter to add each segment with cap repairs.</div>';
    u.segments.forEach(function (s) {
      var sc = counts({ segments: [s] });
      h += '<div class="card"><div class="seg-head"><span class="seg-title">' + esc(u.utn + ' ' + s.label) + '</span><span class="pill' + (sc.total && sc.have === sc.total ? ' done' : '') + '" style="margin-left:auto">' + sc.have + ' / ' + sc.total + '</span><button class="small danger" data-act="rmseg" data-seg="' + esc(s.id) + '" aria-label="Remove segment ' + esc(s.label) + '">Remove</button></div>';
      if (s.caps.length && s.caps.every(function (x) { return x.loc; })) h += '<p class="note" style="margin:0">General remarks: ' + esc(remark(s)) + '</p>';
      s.caps.forEach(function (cap, i) {
        h += '<div class="cap"><div class="seg-head"><span class="stage-label">Cap ' + (i + 1) + (cap.loc ? '' : ' <b class="req">choose location</b>') + '</span><button class="small danger" style="margin-left:auto" data-act="rmcap" data-seg="' + esc(s.id) + '" data-cap="' + esc(cap.id) + '" aria-label="Remove cap ' + (i + 1) + '">Remove cap</button></div><div class="chips">';
        LOCS.forEach(function (L) { h += '<button class="chip small' + (cap.loc === L ? ' sel' : '') + '" data-act="setloc" data-seg="' + esc(s.id) + '" data-cap="' + esc(cap.id) + '" data-t="' + L + '" aria-pressed="' + (cap.loc === L) + '">' + L + '</button>'; });
        h += '</div><div class="stages">';
        STAGES.forEach(function (st) { h += stageHtml(s, cap, st); });
        h += '</div></div>';
      });
      h += '<div class="row"><button class="grow" data-act="addcap" data-seg="' + esc(s.id) + '">+ Add cap</button><button class="primary grow" data-act="pdf" data-seg="' + esc(s.id) + '">Save PDF</button></div></div>';
    });
    h += '<div class="card"><h2>Export</h2><div class="row"><button class="primary grow" data-act="pdf">Save all forms (ZIP)</button></div><div class="row"><button class="grow" data-act="jpgs">Save to Photos</button><button class="grow" data-act="zip">Photos as ZIP</button></div><p class="note" style="margin:0">Each PDF is page 1 of Form 0008 followed by the cap photo pages, two caps per page. The form date and your signature (if saved in Settings) are filled in. QUA and SHL signatures are left blank.</p></div>';
    h += '<button class="danger" data-act="rmutn">Delete this UTN</button>';
    return h;
  }
  function revoke() { urls.forEach(function (x) { URL.revokeObjectURL(x); }); urls = []; }
  function render() {
    revoke();
    var u = state.openId ? getUtn(state.openId) : null;
    if (state.openId && !u) { state.openId = null; if (state.view === 'utn') state.view = 'home'; }
    var html = state.view === 'settings' ? viewSettings() : (state.view === 'utn' && u) ? viewUtn(u) : viewHome();
    $('#app').innerHTML = html;
  }
  function renderKeepSettings() {
    // re-render the settings screen without losing typed values
    var keep = {};
    ['s-fgjv', 's-qua', 's-name', 's-desig', 's-qname', 's-qdesig', 's-sname', 's-sdesig'].forEach(function (id) { var e = document.getElementById(id); if (e) keep[id] = e.value; });
    render();
    Object.keys(keep).forEach(function (id) { var e = document.getElementById(id); if (e) e.value = keep[id]; });
  }
  function go(view, id) { state.view = view; if (id !== undefined) state.openId = id; render(); window.scrollTo(0, 0); }

  /* ---------- events ---------- */
  document.addEventListener('submit', function (e) {
    e.preventDefault();
    var id = e.target.id;
    if (id === 'f-utn') {
      var v = cleanId($('#in-utn').value);
      if (!v) { toast('Enter the UTN number.'); return; }
      var ex = state.utns.filter(function (u) { return u.utn === v; })[0];
      if (ex) { go('utn', ex.id); return; }
      var rec = { id: uid(), utn: v, created: Date.now(), updated: Date.now(), expiry: '', date: todayStr(), segments: [] };
      state.utns.push(rec);
      save(rec).then(function () { go('utn', rec.id); });
    } else if (id === 'f-seg') {
      var u = getUtn(state.openId);
      var L = cleanId($('#in-seg').value);
      if (!u || !L) { toast('Enter a segment name.'); return; }
      addSeg(u, L);
    } else if (id === 'f-set') {
      var s = S();
      s.id = SETTINGS_ID;
      s.fgjv = $('#s-fgjv').value.trim(); s.qua = $('#s-qua').value.trim();
      s.prodName = $('#s-name').value.trim(); s.prodDesig = $('#s-desig').value.trim();
      s.quaName = $('#s-qname').value.trim(); s.quaDesig = $('#s-qdesig').value.trim(); s.shlName = $('#s-sname').value.trim(); s.shlDesig = $('#s-sdesig').value.trim();
      if (!s.fgjv || !s.qua) { toast('Enter both the FGJV CONST and FGJV QUA initials.'); return; }
      state.settings = s;
      dbPut(s).then(function (ok) { toast(ok ? 'Settings saved.' : 'Saved for now, but this browser is not keeping data.'); go('home', null); });
    }
  });
  function addSeg(u, L) {
    if (u.segments.some(function (s) { return s.label === L; })) { toast('Segment ' + L + ' is already added.'); return; }
    u.segments.push({ id: uid(), label: L, caps: [{ id: uid(), loc: '', photos: {} }] });
    save(u).then(render);
  }
  document.addEventListener('input', function (e) {
    var f = e.target.getAttribute && e.target.getAttribute('data-f');
    if (!f) return;
    var u = getUtn(state.openId);
    if (!u) return;
    u[f] = e.target.value;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () { save(u); }, 400);
  });
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-act]');
    if (!b) return;
    var act = b.getAttribute('data-act');
    var u = getUtn(state.openId);
    var seg = b.getAttribute('data-seg'), st = b.getAttribute('data-st'), cap = b.getAttribute('data-cap');
    function keep(x) { save(x).then(function () { var y = window.scrollY; render(); window.scrollTo(0, y); }); }
    function segObj() { return u ? u.segments.filter(function (x) { return x.id === seg; })[0] : null; }
    if (act === 'open') go('utn', b.getAttribute('data-id'));
    else if (act === 'back') go('home', null);
    else if (act === 'settings') go('settings');
    else if (act === 'logo') pickLogo();
    else if (act === 'sig') pickSig();
    else if (act === 'rmsig') { var s1 = S(); s1.id = SETTINGS_ID; s1.sig = null; state.settings = s1; dbPut(s1).then(renderKeepSettings); }
    else if (act === 'rmlogo') { var s0 = S(); s0.id = SETTINGS_ID; s0.logo = null; state.settings = s0; dbPut(s0).then(renderKeepSettings); }
    else if (act === 'addseg' && u) addSeg(u, b.getAttribute('data-l'));
    else if (act === 'setloc' && u) { var cp = getCap(segObj(), cap); if (cp) { cp.loc = b.getAttribute('data-t'); keep(u); } }
    else if (act === 'addcap' && u) { var sa = segObj(); if (sa) { sa.caps.push({ id: uid(), loc: '', photos: {} }); keep(u); } }
    else if (act === 'rmcap' && u) {
      var sc2 = segObj();
      ask('Remove this cap and its photos?', 'Remove').then(function (ok) {
        if (!ok || !sc2) return;
        sc2.caps = sc2.caps.filter(function (x) { return x.id !== cap; });
        save(u).then(render);
      });
    }
    else if (act === 'shoot') pick(seg, cap, st, true);
    else if (act === 'lib') pick(seg, cap, st, false);
    else if (act === 'rmphoto' && u) {
      ask('Remove this photo?', 'Remove').then(function (ok) {
        if (!ok) return;
        var cx = getCap(segObj(), cap);
        if (cx) { delete cx.photos[st]; save(u).then(render); }
      });
    } else if (act === 'rmseg' && u) {
      var s2 = segObj();
      ask('Remove segment ' + (s2 ? s2.label : '') + ' and its photos?', 'Remove').then(function (ok) {
        if (!ok) return;
        u.segments = u.segments.filter(function (x) { return x.id !== seg; });
        save(u).then(render);
      });
    } else if (act === 'rmutn' && u) {
      ask('Delete UTN ' + u.utn + ' and all its photos from this phone? Export first if you still need them.', 'Delete').then(function (ok) {
        if (!ok) return;
        state.utns = state.utns.filter(function (x) { return x.id !== u.id; });
        dbDel(u.id).then(function () { go('home', null); });
      });
    } else if (act === 'pdf') doExport('pdf', seg);
    else if (act === 'zip') doExport('zip');
    else if (act === 'jpgs') doExport('jpgs');
  });

  /* ---------- start ---------- */
  render();
  openDb().then(function (d) {
    idb = d;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) {}
    return dbAll();
  }).then(function (all) {
    state.utns = all.filter(function (r) { return r.id !== SETTINGS_ID; }).map(normalise);
    var st = all.filter(function (r) { return r.id === SETTINGS_ID; })[0];
    if (st) state.settings = st;
    if (needSetup()) state.view = 'settings';
    render();
  });
  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }
})();
