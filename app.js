/* CamRide demo app. Vanilla JS + Leaflet. No API keys, no backend: everything is simulated in the browser. */
(function () {
  'use strict';
  const { PLACES, RIDES, DELIVERY, RESTAURANTS, FIRST, LAST, CARS, MOTOS, PLATE_PREFIX, I18N } = window.CR_DATA;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const CM_BOUNDS = { s: 1.6, n: 13.1, w: 8.4, e: 16.25 };
  const inCameroon = (lat, lng) => lat >= CM_BOUNDS.s && lat <= CM_BOUNDS.n && lng >= CM_BOUNDS.w && lng <= CM_BOUNDS.e;

  // ---------- storage ----------
  const store = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem('camride.' + k)); return v == null ? d : v; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem('camride.' + k, JSON.stringify(v)); } catch (e) { /* storage full or blocked */ } },
    push(k, v) { const a = store.get(k, []); a.unshift(v); store.set(k, a.slice(0, 200)); }
  };

  // ---------- i18n ----------
  let lang = store.get('lang', (navigator.language || 'en').toLowerCase().startsWith('fr') ? 'fr' : 'en');
  const t = (k, vars) => { let s = (I18N[lang] && I18N[lang][k]) || I18N.en[k] || k; if (vars) for (const v in vars) s = s.split('{' + v + '}').join(vars[v]); return s; };
  const fcfa = n => new Intl.NumberFormat(lang === 'fr' ? 'fr-CM' : 'en-CM', { maximumFractionDigits: 0 }).format(Math.round(n)).replace(/\u202f|\u00a0/g, ' ') + ' FCFA';
  const fmtDate = ts => new Date(ts).toLocaleString(lang === 'fr' ? 'fr-FR' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  function applyI18n() {
    document.documentElement.lang = lang === 'fr' ? 'fr' : 'en';
    $$('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n); });
    $('#langBtn').textContent = lang === 'fr' ? 'EN' : 'FR';
    fillCitySelects();
  }

  // ---------- geo helpers ----------
  const toRad = d => d * Math.PI / 180;
  function haversine(a, b) {
    const R = 6371, dLat = toRad(b.lat - a.lat), dLng = toRad(b.lng - a.lng);
    const x = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  const placeById = id => PLACES.find(p => p.id === id) || PLACES[0];
  function nearestPlace(pt) { let best = PLACES[0], bd = Infinity; PLACES.forEach(p => { const d = haversine(pt, p); if (d < bd) { bd = d; best = p; } }); return best; }
  const placeLabel = p => p.name + ' · ' + (lang === 'fr' ? p.regionFr : p.region) + (p.capital ? ' ★' : '');
  const round50 = n => Math.round(n / 50) * 50;

  // Routing: OSRM public demo server (free, best effort), fallback to straight line x1.3.
  async function route(a, b) {
    const straight = () => { const km = haversine(a, b) * 1.3; return { km, min: Math.max(2, km / 22 * 60), coords: [[a.lat, a.lng], [b.lat, b.lng]], road: false }; };
    try {
      const ctl = new AbortController(); const to = setTimeout(() => ctl.abort(), 6000);
      const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
      const r = await fetch(url, { signal: ctl.signal }); clearTimeout(to);
      if (!r.ok) return straight();
      const j = await r.json();
      if (!j.routes || !j.routes.length) return straight();
      const rt = j.routes[0];
      return { km: rt.distance / 1000, min: Math.max(2, rt.duration / 60), coords: rt.geometry.coordinates.map(c => [c[1], c[0]]), road: true };
    } catch (e) { return straight(); }
  }

  // Nominatim: explicit search only (no autocomplete, per usage policy), max 1 request per second.
  let lastNomi = 0;
  async function nominatim(path) {
    const wait = Math.max(0, 1100 - (Date.now() - lastNomi)); if (wait) await new Promise(r => setTimeout(r, wait));
    lastNomi = Date.now();
    const r = await fetch('https://nominatim.openstreetmap.org/' + path + (path.includes('?') ? '&' : '?') + 'format=jsonv2&accept-language=' + lang);
    if (!r.ok) throw new Error('nominatim ' + r.status);
    return r.json();
  }

  // ---------- state ----------
  const S = {
    city: store.get('city', 'douala'), pickup: null, pickupName: '', dest: null, destName: '',
    rideType: 'moto', pay: 'mtn', phase: 'idle', routeInfo: null, driver: null, timers: [], anim: null,
    cart: { resto: null, items: {} }, foodView: 'list', activeOrder: null
  };
  const busy = () => !['idle', 'choose'].includes(S.phase);

  // ---------- map ----------
  let map, pickupMarker, destMarker, routeLine, vehMarker, extraMarker;
  const icon = (html, size = 32) => L.divIcon({ className: 'cr-icon', html, iconSize: [size, size], iconAnchor: [size / 2, size] });
  const vIcon = e => L.divIcon({ className: 'cr-icon', html: `<div class="veh">${e}</div>`, iconSize: [32, 32], iconAnchor: [16, 16] });
  function initMap() {
    const c = placeById(S.city);
    map = L.map('map', { zoomControl: false, attributionControl: true }).setView([c.lat, c.lng], 14);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · Search: Nominatim · Routing: OSRM demo' }).addTo(map);
    L.control.zoom({ position: 'topleft' }).addTo(map);
    pickupMarker = L.marker([c.lat, c.lng], { draggable: true, icon: icon('<div class="pin">🟢</div>', 30), zIndexOffset: 500 }).addTo(map);
    pickupMarker.on('dragend', () => { if (busy()) { pickupMarker.setLatLng([S.pickup.lat, S.pickup.lng]); return toast(t('busy')); } const ll = pickupMarker.getLatLng(); setPickup({ lat: ll.lat, lng: ll.lng }, null); });
    map.on('click', e => { if (busy()) return; setDest({ lat: e.latlng.lat, lng: e.latlng.lng }, null); });
    setPickup({ lat: c.lat, lng: c.lng }, c.name, true);
  }
  async function reverseName(pt) {
    try { const j = await nominatim(`reverse?lat=${pt.lat}&lon=${pt.lng}&zoom=17`); if (j && j.display_name) return j.display_name.split(',').slice(0, 3).join(','); } catch (e) { /* fall through */ }
    return pt.lat.toFixed(5) + ', ' + pt.lng.toFixed(5);
  }
  async function setPickup(pt, name, fly) {
    S.pickup = pt; S.pickupName = name || '…';
    pickupMarker.setLatLng([pt.lat, pt.lng]);
    if (fly) map.setView([pt.lat, pt.lng], 15);
    renderSheet();
    if (!name) { S.pickupName = await reverseName(pt); renderSheet(); }
    if (S.dest) planRoute();
    if ($('#view-food').classList.contains('active')) renderFood();
  }
  async function setDest(pt, name) {
    S.dest = pt; S.destName = name || '…';
    if (!destMarker) destMarker = L.marker([pt.lat, pt.lng], { icon: icon('<div class="pin">📍</div>', 30) }).addTo(map); else destMarker.setLatLng([pt.lat, pt.lng]);
    S.phase = 'choose'; renderSheet();
    planRoute();
    if (!name) { S.destName = await reverseName(pt); renderSheet(); }
  }
  async function planRoute() {
    if (!S.pickup || !S.dest) return;
    const a = S.pickup, b = S.dest;
    S.routeInfo = null; renderSheet();
    const r = await route(a, b);
    if (a !== S.pickup || b !== S.dest) return;
    S.routeInfo = r; drawRoute(r.coords, '#007a3d');
    map.fitBounds(L.latLngBounds(r.coords).pad(0.25), { paddingBottomRight: [0, 200] });
    renderSheet();
  }
  function drawRoute(coords, color) { if (routeLine) routeLine.remove(); routeLine = L.polyline(coords, { color, weight: 5, opacity: .85 }).addTo(map); }
  function clearRide() {
    S.timers.forEach(clearTimeout); S.timers = []; if (S.anim) cancelAnimationFrame(S.anim); S.anim = null;
    [routeLine, vehMarker, destMarker, extraMarker].forEach(m => m && m.remove()); routeLine = vehMarker = destMarker = extraMarker = null;
    S.dest = null; S.destName = ''; S.routeInfo = null; S.driver = null; S.phase = 'idle'; S.activeOrder = null;
    pickupMarker.dragging.enable(); renderSheet();
  }
  function fare(rt, info) { if (!info) return 0; return round50(Math.max(rt.min, rt.base + rt.perKm * info.km + rt.perMin * info.min)); }

  // Animate a marker along a polyline over `ms` milliseconds.
  function animateAlong(marker, coords, ms, onTick, onDone) {
    const pts = coords.map(c => L.latLng(c[0], c[1]));
    const seg = []; let total = 0;
    for (let i = 1; i < pts.length; i++) { const d = pts[i - 1].distanceTo(pts[i]); seg.push(d); total += d; }
    if (!total) { onDone && onDone(); return; }
    const start = performance.now();
    const step = now => {
      const p = Math.min(1, (now - start) / ms); let target = p * total, i = 0;
      while (i < seg.length && target > seg[i]) { target -= seg[i]; i++; }
      const a = pts[Math.min(i, pts.length - 1)], b = pts[Math.min(i + 1, pts.length - 1)], f = seg[i] ? target / seg[i] : 0;
      marker.setLatLng([a.lat + (b.lat - a.lat) * f, a.lng + (b.lng - a.lng) * f]);
      onTick && onTick(p);
      if (p < 1) S.anim = requestAnimationFrame(step); else { S.anim = null; onDone && onDone(); }
    };
    S.anim = requestAnimationFrame(step);
  }
  const later = (fn, ms) => S.timers.push(setTimeout(fn, ms));

  function makeDriver(type) {
    const name = FIRST[Math.floor(Math.random() * FIRST.length)] + ' ' + LAST[Math.floor(Math.random() * LAST.length)];
    const pre = PLATE_PREFIX[nearestPlace(S.pickup).id] || 'CE';
    const plate = pre + ' ' + (100 + Math.floor(Math.random() * 899)) + ' ' + String.fromCharCode(65 + Math.random() * 26 | 0) + String.fromCharCode(65 + Math.random() * 26 | 0);
    const vehicle = type === 'moto' ? MOTOS[Math.random() * MOTOS.length | 0] : CARS[Math.random() * CARS.length | 0];
    return { name, plate, vehicle, rating: (4.5 + Math.random() * 0.5).toFixed(1) };
  }
  const offsetPoint = (pt, km) => { const ang = Math.random() * 2 * Math.PI; return { lat: pt.lat + (km / 111) * Math.cos(ang), lng: pt.lng + (km / (111 * Math.cos(toRad(pt.lat)))) * Math.sin(ang) }; };

  async function requestRide() {
    if (!S.dest || !S.routeInfo) return toast(t('noDest'));
    S.phase = 'searching'; pickupMarker.dragging.disable(); renderSheet();
    const rt = RIDES.find(r => r.id === S.rideType);
    S.trip = { id: 'T' + Date.now().toString(36).toUpperCase(), type: rt.id, rideName: rt.name, from: S.pickupName, to: S.destName, km: +S.routeInfo.km.toFixed(1), fare: fare(rt, S.routeInfo), pay: S.pay, city: nearestPlace(S.pickup).id, ts: Date.now() };
    const start = offsetPoint(S.pickup, 0.8 + Math.random() * 1.2);
    const approach = await route(start, S.pickup);
    later(() => {
      if (S.phase !== 'searching') return;
      S.driver = makeDriver(rt.id); S.phase = 'matched';
      vehMarker = L.marker([start.lat, start.lng], { icon: vIcon(rt.icon), zIndexOffset: 1000 }).addTo(map);
      drawRoute(approach.coords, '#ce1126');
      map.fitBounds(L.latLngBounds(approach.coords.concat([[S.dest.lat, S.dest.lng]])).pad(0.2));
      const ms = 14000; S.etaTotal = Math.max(2, Math.round(approach.min)); S.etaLeft = S.etaTotal;
      renderSheet();
      animateAlong(vehMarker, approach.coords, ms, p => { const left = Math.max(1, Math.ceil(S.etaTotal * (1 - p))); if (left !== S.etaLeft) { S.etaLeft = left; const el = $('#etaNum'); if (el) el.textContent = t('arriving', { n: left }); } },
        () => { S.phase = 'arrived'; renderSheet(); });
    }, 2500);
  }
  function startTrip() {
    S.phase = 'ontrip'; const coords = S.routeInfo.coords; drawRoute(coords, '#007a3d');
    map.fitBounds(L.latLngBounds(coords).pad(0.2)); pickupMarker.setOpacity(0.4);
    const total = Math.round(S.routeInfo.min); S.tripLeft = total; renderSheet();
    animateAlong(vehMarker, coords, 18000, p => {
      const bar = $('#tripBar'); if (bar) bar.style.width = (p * 100).toFixed(0) + '%';
      const left = Math.max(0, Math.ceil(total * (1 - p))); const el = $('#tripLeft'); if (el) el.textContent = t('remaining', { n: left });
    }, () => { S.phase = 'tripdone'; pickupMarker.setOpacity(1); renderSheet(); });
  }
  function finishTripPayment() {
    checkout(S.trip.fare, S.trip.pay, S.trip.id, res => { S.trip.payment = res; S.trip.pay = res.method; S.phase = 'rate'; renderSheet(); });
  }
  function saveTrip(stars) {
    S.trip.rating = stars || null; S.trip.driver = S.driver; S.trip.status = 'completed';
    store.push('trips', S.trip); toast(t('thanks'));
    pickupMarker.setLatLng([S.dest.lat, S.dest.lng]); S.pickup = S.dest; S.pickupName = S.destName;
    clearRide();
  }

  // ---------- ride sheet ----------
  function payButtons(sel) {
    return `<div class="pay" role="radiogroup" aria-label="${esc(t('payWith'))}">
      <button type="button" class="mtn ${sel === 'mtn' ? 'sel' : ''}" data-pay="mtn">MTN MoMo</button>
      <button type="button" class="om ${sel === 'orange' ? 'sel' : ''}" data-pay="orange">Orange Money</button>
      <button type="button" class="${sel === 'cash' ? 'sel' : ''}" data-pay="cash">💵 ${esc(t('cash'))}</button></div>`;
  }
  function points() {
    return `<div class="pts"><div><span class="dot g"></span><div><b>${esc(t('pickup'))}:</b> ${esc(S.pickupName)}</div></div>${S.dest ? `<div><span class="dot r"></span><div><b>${esc(t('destination'))}:</b> ${esc(S.destName)}</div></div>` : ''}</div>`;
  }
  function renderSheet() {
    const el = $('#sheet'); if (!el) return;
    const rt = RIDES.find(r => r.id === S.rideType);
    const d = S.driver;
    const driverCard = d ? `<div class="driver"><div class="avatar">${esc(d.name[0])}</div><div class="grow"><b>${esc(d.name)}</b> · ⭐ ${d.rating}<div class="tag">${esc(d.vehicle)} · <span class="plate">${esc(d.plate)}</span></div></div><div style="font-size:30px">${rt.icon}</div></div>` : '';
    let h = '';
    if (S.activeOrder) { h = foodTrackingHtml(); }
    else if (S.phase === 'idle') {
      h = `<h3>${esc(t('whereTo'))}</h3>
        <form class="search" id="searchForm"><input id="q" type="search" enterkeyhint="search" autocomplete="off" placeholder="${esc(t('searchPh'))}" aria-label="${esc(t('searchPh'))}"><button class="btn primary" type="submit">${esc(t('search'))}</button></form>
        <ul class="results hidden" id="results"></ul>${points()}<p class="hint">${esc(t('tapHint'))}</p>`;
    } else if (S.phase === 'choose') {
      const info = S.routeInfo;
      h = `<div class="row"><h3 class="grow">${esc(t('chooseRide'))}</h3><button class="btn ghost" data-act="back">${esc(t('back'))}</button></div>${points()}
        <div class="hint">${info ? `${esc(t('route'))}: ${info.km.toFixed(1)} ${t('km')} · ~${Math.round(info.min)} ${t('min')} (${esc(info.road ? t('roadRoute') : t('approx'))})` : '<span class="spinner" style="display:inline-block;width:16px;height:16px;border-width:3px;margin:0;vertical-align:middle"></span>'}</div>
        <div class="opts">${RIDES.map(r => `<button type="button" class="opt ${r.id === S.rideType ? 'sel' : ''}" data-ride="${r.id}"><span class="ic">${r.icon}</span><span><span class="nm">${esc(r.name)}</span><br><span class="sub">👤 ${r.seats} · ${fcfa(r.base)} + ${fcfa(r.perKm)}/${t('km')} · min ${fcfa(r.min)}</span></span><span class="pr">${info ? fcfa(fare(r, info)) : '…'}</span></button>`).join('')}</div>
        ${S.rideType === 'moto' ? `<div class="note">${esc(t('motoNote'))}</div>` : ''}
        <div class="tag">${esc(t('payWith'))}</div>${payButtons(S.pay)}
        <button class="btn primary block" data-act="request" ${info ? '' : 'disabled'}>${esc(t('request', { ride: rt.name }))}${info ? ' · ' + fcfa(fare(rt, info)) : ''}</button>`;
    } else if (S.phase === 'searching') {
      h = `<div class="spinner"></div><p style="text-align:center"><b>${esc(t('searching'))}</b></p><button class="btn danger block" data-act="cancel">${esc(t('cancel'))}</button>`;
    } else if (S.phase === 'matched') {
      h = `<h3>${esc(t('matched'))}</h3><div class="eta" id="etaNum">${esc(t('arriving', { n: S.etaLeft }))}</div>${driverCard}${points()}<button class="btn danger block" data-act="cancel">${esc(t('cancel'))}</button>`;
    } else if (S.phase === 'arrived') {
      h = `<h3>✅ ${esc(t('arrived'))}</h3>${driverCard}<button class="btn primary block" data-act="start">${esc(t('startTrip'))}</button>`;
    } else if (S.phase === 'ontrip') {
      h = `<h3>${esc(t('onTrip'))}</h3><div class="eta" id="tripLeft">${esc(t('remaining', { n: S.tripLeft }))}</div><div class="progress"><i id="tripBar"></i></div>${driverCard}${points()}`;
    } else if (S.phase === 'tripdone') {
      h = `<div class="big-ok">🏁</div><h3 style="text-align:center">${esc(t('tripDone'))}</h3>${driverCard}<div class="sum"><div class="tot"><span>${esc(t('total'))}</span><span>${fcfa(S.trip.fare)}</span></div></div>
        <button class="btn primary block" data-act="paytrip">${esc(S.trip.pay === 'cash' ? t('continue') : t('payNow', { amt: fcfa(S.trip.fare) }))}</button>`;
    } else if (S.phase === 'rate') {
      h = `<h3 style="text-align:center">${esc(t('rate'))}</h3>${driverCard}<div class="stars" id="stars">${[1, 2, 3, 4, 5].map(i => `<button type="button" data-star="${i}" aria-label="${i}">★</button>`).join('')}</div>
        <button class="btn primary block" data-act="rated">${esc(t('submitRating'))}</button><button class="btn ghost block" data-act="skiprate">${esc(t('skip'))}</button>`;
    }
    el.innerHTML = h;
    bindSheet(el);
  }
  function bindSheet(el) {
    const f = $('#searchForm', el);
    if (f) f.addEventListener('submit', async e => {
      e.preventDefault(); const q = $('#q', el).value.trim(); const ul = $('#results', el);
      if (q.length < 3) return toast(t('tooShort'));
      ul.classList.remove('hidden'); ul.innerHTML = '<li>…</li>';
      try {
        const c = map.getCenter(); const vb = [c.lng - 0.6, c.lat + 0.6, c.lng + 0.6, c.lat - 0.6].map(n => n.toFixed(4)).join(',');
        const res = await nominatim(`search?q=${encodeURIComponent(q)}&countrycodes=cm&limit=6&viewbox=${vb}`);
        if (!res.length) { ul.innerHTML = `<li>${esc(t('searchNone'))}</li>`; return; }
        ul.innerHTML = res.map((r, i) => `<li data-i="${i}">${esc(r.display_name)}</li>`).join('');
        $$('li[data-i]', ul).forEach(li => li.addEventListener('click', () => { const r = res[+li.dataset.i]; setDest({ lat: +r.lat, lng: +r.lon }, r.display_name.split(',').slice(0, 3).join(',')); }));
      } catch (err) { ul.innerHTML = `<li>${esc(t('searchErr'))}</li>`; }
    });
    $$('[data-ride]', el).forEach(b => b.addEventListener('click', () => { S.rideType = b.dataset.ride; renderSheet(); }));
    $$('[data-pay]', el).forEach(b => b.addEventListener('click', () => { S.pay = b.dataset.pay; renderSheet(); }));
    let stars = 0;
    $$('[data-star]', el).forEach(b => b.addEventListener('click', () => { stars = +b.dataset.star; $$('[data-star]', el).forEach(x => x.classList.toggle('on', +x.dataset.star <= stars)); }));
    $$('[data-act]', el).forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.act;
      if (a === 'back' || a === 'cancel') { const p = S.pickup; clearRide(); S.pickup = p; }
      else if (a === 'request') requestRide();
      else if (a === 'start') startTrip();
      else if (a === 'paytrip') finishTripPayment();
      else if (a === 'rated') saveTrip(stars);
      else if (a === 'skiprate') saveTrip(0);
      else if (a === 'fooddone') { S.activeOrder = null; clearRide(); }
    }));
  }

  // ---------- payments (simulated) ----------
  function operatorOf(nine) {
    const p2 = +nine.slice(0, 2), p3 = +nine.slice(0, 3);
    if (p2 === 67 || (p3 >= 650 && p3 <= 654) || (p3 >= 680 && p3 <= 689)) return 'mtn';
    if (p2 === 69 || (p3 >= 655 && p3 <= 659)) return 'orange';
    return null;
  }
  const opName = m => m === 'mtn' ? 'MTN Mobile Money' : m === 'orange' ? 'Orange Money' : t('cash');
  const fmtPhone = n => '+237 ' + n.slice(0, 3) + ' ' + n.slice(3, 6) + ' ' + n.slice(6);
  function openModal(html) { $('#modalCard').innerHTML = html; $('#modal').classList.remove('hidden'); }
  function closeModal() { $('#modal').classList.add('hidden'); $('#modalCard').innerHTML = ''; }
  function checkout(amount, method, ref, done) {
    const receipt = (m, phone) => {
      const res = { method: m, phone: phone || null, ref: 'DEMO-' + Math.random().toString(36).slice(2, 8).toUpperCase(), order: ref, amount, ts: Date.now() };
      openModal(`<div class="demo-banner">${esc(t('demoMode'))}</div><div class="big-ok">✅</div><h3 style="text-align:center;margin:0">${esc(m === 'cash' ? t('cash') : t('paidTitle'))}</h3>
        ${m === 'cash' ? `<p class="muted" style="text-align:center">${esc(t('cashNote'))}</p>` : ''}
        <div class="receipt"><div><b>${esc(t('receipt'))}</b><span>CamRide</span></div><div><span>${esc(t('amount'))}</span><b>${fcfa(amount)}</b></div><div><span>${esc(t('method'))}</span><span>${esc(opName(m))}${phone ? ' · ' + fmtPhone(phone) : ''}</span></div>
        <div><span>${esc(t('ref'))}</span><span>${res.ref}</span></div><div><span>${esc(t('date'))}</span><span>${fmtDate(res.ts)}</span></div></div>
        <button class="btn primary block" id="rcOk">${esc(t('continue'))}</button>`);
      $('#rcOk').onclick = () => { closeModal(); done(res); };
    };
    if (method === 'cash') return receipt('cash');
    const form = (m, err, val) => {
      openModal(`<div class="demo-banner">${esc(t('demoMode'))}</div><h3 style="margin:0 0 6px">${esc(t('payTitle'))}</h3>
        <div class="sum"><div class="tot" style="border:0;margin:0"><span>${esc(t('amount'))}</span><span>${fcfa(amount)}</span></div></div>
        ${payButtons(m).replace(/data-pay="cash"[^>]*>[^<]*<\/button>/, 'data-pay="cash" hidden></button>')}
        <form class="form" id="payForm" novalidate><label>${esc(t('phoneLabel'))}<div class="phone"><b>+237</b><input id="payPhone" inputmode="tel" autocomplete="tel-national" placeholder="${m === 'orange' ? '69X XXX XXX' : '67X XXX XXX'}" value="${esc(val || '')}"></div></label>
        <p class="err" role="alert">${esc(err || '')}</p><button class="btn primary block" type="submit">${esc(t('payBtn'))}</button>
        <button class="btn ghost block" type="button" id="payCancel">${esc(t('cancel'))}</button></form>`);
      $$('#modalCard [data-pay]').forEach(b => b.addEventListener('click', () => form(b.dataset.pay, '', $('#payPhone').value)));
      $('#payCancel').onclick = () => { closeModal(); toast(t('declined')); };
      $('#payForm').onsubmit = e => {
        e.preventDefault();
        let n = $('#payPhone').value.replace(/\D/g, ''); if (n.startsWith('237') && n.length === 12) n = n.slice(3);
        if (!/^6\d{8}$/.test(n)) return form(m, t('badPhone'), $('#payPhone').value);
        const op = operatorOf(n);
        if (!op) return form(m, t('unknownOp'), $('#payPhone').value);
        if (op !== m) return form(m, t('wrongOp', { op: opName(op) }), $('#payPhone').value);
        approve(m, n);
      };
    };
    const approve = (m, n) => {
      const ussd = m === 'mtn' ? '*126#' : '#150*50#'; const pref = Math.random().toString(36).slice(2, 7).toUpperCase();
      openModal(`<div class="demo-banner">${esc(t('demoMode'))}</div><h3 style="margin:0 0 6px">📲 ${esc(t('approveTitle'))}</h3>
        <p class="muted">${esc(t('approveText', { phone: fmtPhone(n), ussd }))}</p>
        <div class="handset"><div class="scr"><div class="op">${m === 'mtn' ? 'MTN MoMo' : 'Orange Money'}</div><div id="hsMsg">${esc(t('phoneScreen', { amt: fcfa(amount), ref: pref }))}</div>
        <div class="btns"><button class="no" id="hsNo">${esc(t('decline'))}</button><button class="ok" id="hsOk">${esc(t('approve'))}</button></div></div></div>
        <p class="muted" style="text-align:center" id="hsWait">${esc(t('waiting'))}</p>`);
      $('#hsNo').onclick = () => form(m, t('declined'), n);
      $('#hsOk').onclick = () => { $('#hsMsg').textContent = '…'; $('#hsOk').disabled = $('#hsNo').disabled = true; setTimeout(() => receipt(m, n), 1400); };
    };
    form(method === 'orange' ? 'orange' : 'mtn');
  }

  // ---------- food ----------
  const restoPoint = r => { const c = placeById(r.city); return { lat: c.lat + r.dlat, lng: c.lng + r.dlng }; };
  const dishName = d => lang === 'fr' ? d.nameFr : d.name;
  const dishDesc = d => lang === 'fr' ? d.descFr : d.desc;
  const cartCount = () => Object.values(S.cart.items).reduce((a, b) => a + b, 0);
  const cartSubtotal = () => { const r = RESTAURANTS.find(x => x.id === S.cart.resto); if (!r) return 0; return Object.entries(S.cart.items).reduce((s, [id, q]) => s + r.menu.find(d => d.id === id).price * q, 0); };
  const deliveryFee = km => round50(Math.max(DELIVERY.min, DELIVERY.base + DELIVERY.perKm * km * 1.3));
  function renderFood() {
    const body = $('#foodBody'), bar = $('#cartBar'); const here = S.pickup || placeById(S.city);
    if (S.foodView === 'list') {
      const list = RESTAURANTS.map(r => ({ r, km: haversine(here, restoPoint(r)) })).sort((a, b) => a.km - b.km);
      const near = list.filter(x => x.km <= DELIVERY.maxKm), far = list.filter(x => x.km > DELIVERY.maxKm);
      const card = (x, ok) => { const c = placeById(x.r.city); return `<div class="card resto ${ok ? '' : 'far'}" ${ok ? `data-resto="${x.r.id}" role="button" tabindex="0"` : ''}><div class="em">${x.r.emoji}</div><div class="grow"><h4>${esc(x.r.name)} <span class="badge">demo</span></h4><div class="tag">${esc(x.r.tags)} · ${esc(c.name)}</div><div class="tag">${esc(ok ? t('away', { d: x.km.toFixed(1) }) + ' · ' + t('deliveryFee') + ' ' + fcfa(deliveryFee(x.km)) : t('tooFar') + ' · ' + t('away', { d: Math.round(x.km) }))}</div></div></div>`; };
      body.innerHTML = `<h2>${esc(t('foodTitle'))}</h2><p class="muted">${esc(t('foodNote'))}</p><p class="tag">📍 ${esc(S.pickupName)}</p>
        ${near.length ? `<h3>${esc(t('nearYou'))}</h3>${near.map(x => card(x, true)).join('')}` : ''}<h3>${esc(t('farAway'))}</h3>${far.map(x => card(x, false)).join('')}`;
      $$('[data-resto]', body).forEach(c => { const go = () => { S.foodView = c.dataset.resto; renderFood(); body.parentElement.scrollTop = 0; }; c.addEventListener('click', go); c.addEventListener('keydown', e => { if (e.key === 'Enter') go(); }); });
    } else if (S.foodView === 'checkout') {
      const r = RESTAURANTS.find(x => x.id === S.cart.resto);
      if (!r || !cartCount()) { S.foodView = 'list'; return renderFood(); }
      const km = haversine(here, restoPoint(r)), fee = deliveryFee(km), sub = cartSubtotal();
      body.innerHTML = `<button class="btn ghost" data-back="${r.id}">← ${esc(t('back'))}</button><h2>${esc(t('checkout'))}</h2><div class="card"><b>${esc(r.name)}</b>
        ${Object.entries(S.cart.items).map(([id, q]) => { const d = r.menu.find(x => x.id === id); return `<div class="item"><div class="grow"><h4>${q} × ${esc(dishName(d))}</h4></div><b>${fcfa(d.price * q)}</b></div>`; }).join('')}</div>
        <div class="card"><div class="tag">${esc(t('deliverTo'))}</div><b>📍 ${esc(S.pickupName)}</b><div class="tag">${esc(t('away', { d: km.toFixed(1) }))}</div></div>
        <div class="card sum"><div><span>${esc(t('subtotal'))}</span><span>${fcfa(sub)}</span></div><div><span>${esc(t('deliveryFee'))}</span><span>${fcfa(fee)}</span></div><div class="tot"><span>${esc(t('total'))}</span><span>${fcfa(sub + fee)}</span></div></div>
        <div class="tag">${esc(t('payWith'))}</div>${payButtons(S.pay)}<button class="btn primary block" id="placeOrder">${esc(t('placeOrder'))} · ${fcfa(sub + fee)}</button>`;
      $$('[data-pay]', body).forEach(b => b.addEventListener('click', () => { S.pay = b.dataset.pay; renderFood(); }));
      $('[data-back]', body).onclick = () => { S.foodView = r.id; renderFood(); };
      $('#placeOrder').onclick = () => {
        if (busy() || S.activeOrder) return toast(t('busy'));
        const order = { id: 'O' + Date.now().toString(36).toUpperCase(), resto: r.name, restoId: r.id, items: Object.entries(S.cart.items).map(([id, q]) => ({ name: r.menu.find(x => x.id === id).name, q, price: r.menu.find(x => x.id === id).price })), subtotal: sub, fee, total: sub + fee, pay: S.pay, to: S.pickupName, city: nearestPlace(here).id, ts: Date.now() };
        checkout(order.total, S.pay, order.id, res => { order.payment = res; order.pay = res.method; S.cart = { resto: null, items: {} }; S.foodView = 'list'; renderFood(); startOrderTracking(order); });
      };
    } else {
      const r = RESTAURANTS.find(x => x.id === S.foodView);
      body.innerHTML = `<button class="btn ghost" id="restoBack">← ${esc(t('back'))}</button><div class="card resto"><div class="em">${r.emoji}</div><div><h4>${esc(r.name)} <span class="badge">demo</span></h4><div class="tag">${esc(r.tags)} · ${esc(placeById(r.city).name)}</div></div></div>
        <div class="card">${r.menu.map(d => { const q = S.cart.resto === r.id ? (S.cart.items[d.id] || 0) : 0; return `<div class="item"><div class="grow"><h4>${esc(dishName(d))}</h4><p>${esc(dishDesc(d))}</p><b>${fcfa(d.price)}</b></div><div class="qty">${q ? `<button class="minus" data-minus="${d.id}" aria-label="-">−</button><b>${q}</b>` : ''}<button data-plus="${d.id}" aria-label="${esc(t('add'))}">+</button></div></div>`; }).join('')}</div>`;
      $('#restoBack').onclick = () => { S.foodView = 'list'; renderFood(); };
      $$('[data-plus]', body).forEach(b => b.addEventListener('click', () => {
        if (S.cart.resto && S.cart.resto !== r.id && cartCount()) { if (!confirm(t('otherResto'))) return; S.cart = { resto: null, items: {} }; }
        S.cart.resto = r.id; S.cart.items[b.dataset.plus] = (S.cart.items[b.dataset.plus] || 0) + 1; renderFood();
      }));
      $$('[data-minus]', body).forEach(b => b.addEventListener('click', () => { const k = b.dataset.minus; S.cart.items[k]--; if (!S.cart.items[k]) delete S.cart.items[k]; renderFood(); }));
    }
    const n = cartCount();
    if (n && S.foodView !== 'checkout') { bar.classList.remove('hidden'); bar.innerHTML = `<button class="btn primary block" id="goCart">${esc(t('viewCart', { n }))} · ${fcfa(cartSubtotal())}</button>`; $('#goCart').onclick = () => { S.foodView = 'checkout'; renderFood(); }; }
    else bar.classList.add('hidden');
  }
  function foodTrackingHtml() {
    const o = S.activeOrder; const steps = [0, 1, 2, 3, 4];
    return `<div class="row"><h3 class="grow">${esc(t('trackTitle'))}</h3><span class="badge">${esc(o.id)}</span></div><div class="tag">${esc(o.resto)} → ${esc(o.to)}</div>
      <ul class="steps">${steps.map(i => `<li class="${i < o.step ? 'done' : i === o.step ? (i === 4 ? 'done' : 'now') : ''}">${esc(t('st' + i))}</li>`).join('')}</ul>
      ${o.step >= 2 ? `<div class="driver"><div class="avatar">${esc(o.courier.name[0])}</div><div class="grow"><b>${esc(t('courier'))}: ${esc(o.courier.name)}</b> · ⭐ ${o.courier.rating}<div class="tag">${esc(o.courier.vehicle)} · <span class="plate">${esc(o.courier.plate)}</span></div></div><div style="font-size:28px">🛵</div></div>` : ''}
      ${o.step === 4 ? `<div class="big-ok">🍽️</div><p style="text-align:center"><b>${esc(t('delivered'))}</b></p><button class="btn primary block" data-act="fooddone">${esc(t('done'))}</button>` : ''}`;
  }
  async function startOrderTracking(order) {
    switchTab('ride');
    const r = RESTAURANTS.find(x => x.id === order.restoId), from = restoPoint(r), to = S.pickup;
    S.phase = 'food'; S.activeOrder = Object.assign(order, { step: 0, courier: makeDriver('moto') }); pickupMarker.dragging.disable();
    extraMarker = L.marker([from.lat, from.lng], { icon: icon(`<div class="pin">${r.emoji}</div>`, 30) }).addTo(map);
    const rt = await route(from, to); drawRoute(rt.coords, '#ce1126'); map.fitBounds(L.latLngBounds(rt.coords).pad(0.3));
    renderSheet();
    const setStep = s => { if (!S.activeOrder || S.activeOrder.id !== order.id) return; S.activeOrder.step = s; renderSheet(); };
    later(() => setStep(1), 3000);
    later(() => { setStep(2); vehMarker = L.marker([from.lat, from.lng], { icon: vIcon('🛵'), zIndexOffset: 1000 }).addTo(map); }, 8000);
    later(() => { setStep(3); animateAlong(vehMarker, rt.coords, 16000, null, () => { setStep(4); order.status = 'delivered'; const saved = Object.assign({}, order); delete saved.step; store.push('orders', saved); }); }, 11000);
  }

  // ---------- activity / join / admin ----------
  function renderActivity() {
    const trips = store.get('trips', []).map(x => Object.assign({ kind: 'trip' }, x)), orders = store.get('orders', []).map(x => Object.assign({ kind: 'order' }, x));
    const all = trips.concat(orders).sort((a, b) => b.ts - a.ts);
    $('#activityList').innerHTML = all.length ? all.map(x => `<div class="card"><div class="list-item"><b>${x.kind === 'trip' ? '🚗 ' + esc(x.rideName) : '🍲 ' + esc(x.resto)}</b><span class="badge ${x.pay === 'cash' ? 'cash' : ''}">${esc(x.pay === 'cash' ? t('cashDue') : t('paid') + ' · ' + (x.pay === 'mtn' ? 'MTN' : 'Orange'))}</span></div>
      <div class="tag">${fmtDate(x.ts)} · ${esc(placeById(x.city).name)}</div><div class="tag">${x.kind === 'trip' ? esc(x.from) + ' → ' + esc(x.to) + ' · ' + x.km + ' km' : esc(x.items.map(i => i.q + '× ' + i.name).join(', '))}</div>
      <div class="list-item"><span class="tag">${x.payment ? esc(x.payment.ref) : ''}${x.rating ? ' · ' + '★'.repeat(x.rating) : ''}</span><b>${fcfa(x.kind === 'trip' ? x.fare : x.total)}</b></div></div>`).join('') : `<p class="muted">${esc(t('none'))}</p>`;
  }
  function renderSignups() {
    const list = store.get('signups', []);
    $('#signupList').innerHTML = list.length ? list.map((s, i) => `<div class="card list-item"><div><b>${esc(s.name)}</b><div class="tag">${esc(t({ rider: 'roleRider', car: 'roleCar', moto: 'roleMoto', courier: 'roleCourier', restaurant: 'roleResto' }[s.role]))} · ${esc(placeById(s.city).name)} · ${esc(fmtPhone(s.phone))}${s.plate ? ' · ' + esc(s.plate) : ''}</div></div><button class="btn danger" data-del="${i}">${esc(t('del'))}</button></div>`).join('') : `<p class="muted">${esc(t('none'))}</p>`;
    $$('[data-del]').forEach(b => b.onclick = () => { const l = store.get('signups', []); l.splice(+b.dataset.del, 1); store.set('signups', l); renderSignups(); });
  }
  function bindJoin() {
    const f = $('#joinForm');
    const toggle = () => { const v = f.role.value; $('.vehicle-only', f).classList.toggle('hidden', !['car', 'moto', 'courier'].includes(v)); };
    f.role.addEventListener('change', toggle); toggle();
    f.addEventListener('submit', e => {
      e.preventDefault(); const err = $('#joinErr');
      const name = f.name.value.trim(); let phone = f.phone.value.replace(/\D/g, ''); if (phone.startsWith('237') && phone.length === 12) phone = phone.slice(3);
      if (!name) { err.textContent = t('needName'); return; }
      if (!/^6\d{8}$/.test(phone)) { err.textContent = t('badPhone'); return; }
      err.textContent = '';
      store.push('signups', { role: f.role.value, name, phone, city: f.city.value, plate: f.plate.value.trim().toUpperCase(), docs: f.docs.checked, ts: Date.now() });
      f.reset(); f.city.value = S.city; toggle(); renderSignups(); toast(t('saved'));
    });
  }
  function renderAdmin() {
    const trips = store.get('trips', []), orders = store.get('orders', []), signups = store.get('signups', []);
    const gmv = trips.reduce((s, x) => s + x.fare, 0) + orders.reduce((s, x) => s + x.total, 0);
    const byCity = {}; trips.concat(orders).forEach(x => { const p = placeById(x.city); const k = lang === 'fr' ? p.regionFr : p.region; byCity[k] = (byCity[k] || 0) + 1; });
    const max = Math.max(1, ...Object.values(byCity));
    const recent = trips.map(x => ({ type: '🚗 ' + x.rideName, city: x.city, amt: x.fare, pay: x.pay, ts: x.ts, st: x.status })).concat(orders.map(x => ({ type: '🍲 ' + x.resto, city: x.city, amt: x.total, pay: x.pay, ts: x.ts, st: x.status }))).sort((a, b) => b.ts - a.ts).slice(0, 15);
    $('#adminBody').innerHTML = `<div class="kpis"><div class="kpi"><b>${trips.length}</b><span>${esc(t('kTrips'))}</span></div><div class="kpi"><b>${orders.length}</b><span>${esc(t('kOrders'))}</span></div><div class="kpi"><b>${signups.length}</b><span>${esc(t('kSignups'))}</span></div><div class="kpi"><b style="font-size:18px">${fcfa(gmv)}</b><span>${esc(t('kGmv'))}</span></div></div>
      <h3>${esc(t('byRegion'))}</h3>${Object.keys(byCity).length ? Object.entries(byCity).sort((a, b) => b[1] - a[1]).map(([k, v]) => `<div class="row" style="margin:6px 0"><span style="width:110px;font-size:13px">${esc(k)}</span><div class="grow"><div class="bar" style="width:${v / max * 100}%"></div></div><b style="width:28px;text-align:right">${v}</b></div>`).join('') : `<p class="muted">${esc(t('none'))}</p>`}
      <h3>${esc(t('recent'))}</h3>${recent.length ? `<div style="overflow-x:auto"><table><thead><tr><th>${esc(t('type'))}</th><th>${esc(t('city'))}</th><th>${esc(t('amount'))}</th><th>${esc(t('method'))}</th><th>${esc(t('when'))}</th></tr></thead><tbody>${recent.map(x => `<tr><td>${esc(x.type)}</td><td>${esc(placeById(x.city).name)}</td><td>${fcfa(x.amt)}</td><td>${esc(x.pay === 'cash' ? t('cash') : x.pay === 'mtn' ? 'MTN' : 'Orange')}</td><td>${fmtDate(x.ts)}</td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">${esc(t('none'))}</p>`}
      <h3>${esc(t('kSignups'))}</h3>${signups.length ? `<div style="overflow-x:auto"><table><thead><tr><th>${esc(t('who'))}</th><th>${esc(t('type'))}</th><th>${esc(t('city'))}</th><th>${esc(t('when'))}</th></tr></thead><tbody>${signups.map(s => `<tr><td>${esc(s.name)}</td><td>${esc(s.role)}</td><td>${esc(placeById(s.city).name)}</td><td>${fmtDate(s.ts)}</td></tr>`).join('')}</tbody></table></div>` : `<p class="muted">${esc(t('none'))}</p>`}
      <button class="btn danger block" id="clearAll" style="margin-top:20px">${esc(t('clearAll'))}</button>`;
    $('#clearAll').onclick = () => { if (!confirm(t('confirmClear'))) return; ['trips', 'orders', 'signups'].forEach(k => store.set(k, [])); renderAdmin(); toast(t('cleared')); };
  }

  // ---------- shell: tabs, city, language, toast ----------
  function switchTab(name) {
    $$('.tabs button').forEach(b => b.classList.toggle('active', b.dataset.tab === name));
    $$('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
    if (name === 'ride') setTimeout(() => map.invalidateSize(), 50);
    if (name === 'food') renderFood(); if (name === 'activity') renderActivity(); if (name === 'join') renderSignups(); if (name === 'admin') renderAdmin();
  }
  function fillCitySelects() {
    const caps = PLACES.filter(p => p.capital), extra = PLACES.filter(p => !p.capital);
    const opts = sel => `<optgroup label="${lang === 'fr' ? 'Chefs-lieux de région (10)' : 'Regional capitals (10)'}">${caps.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(placeLabel(p))}</option>`).join('')}</optgroup><optgroup label="${lang === 'fr' ? 'Autres villes' : 'Other cities'}">${extra.map(p => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(placeLabel(p))}</option>`).join('')}</optgroup>`;
    $('#citySel').innerHTML = opts(S.city); const jc = $('#joinCity'); const v = jc.value || S.city; jc.innerHTML = opts(v);
  }
  let toastTimer;
  function toast(msg, action) {
    const el = $('#toast'); el.innerHTML = esc(msg) + (action ? `<button type="button">${esc(action.label)}</button>` : '');
    if (action) $('button', el).onclick = () => { el.classList.remove('show'); action.fn(); };
    el.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), action ? 9000 : 3500);
  }
  function locate(initial) {
    if (!navigator.geolocation) { if (!initial) toast(t('geoDenied', { city: placeById(S.city).name })); return; }
    if (!initial) toast(t('locating'));
    navigator.geolocation.getCurrentPosition(pos => {
      const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (busy()) return toast(t('busy'));
      if (inCameroon(pt.lat, pt.lng)) {
        S.city = nearestPlace(pt).id; store.set('city', S.city); fillCitySelects(); setPickup(pt, t('yourLocation'), true);
      } else {
        const c = placeById(S.city);
        toast(t('outsideCm', { city: c.name }), { label: t('useMine'), fn: () => setPickup(pt, t('yourLocation'), true) });
      }
    }, () => toast(t('geoDenied', { city: placeById(S.city).name })), { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  }

  function init() {
    applyI18n();
    initMap(); renderSheet(); bindJoin();
    $$('.tabs button').forEach(b => b.addEventListener('click', () => switchTab(b.dataset.tab)));
    $('#langBtn').addEventListener('click', () => { lang = lang === 'fr' ? 'en' : 'fr'; store.set('lang', lang); applyI18n(); renderSheet(); const act = $('.tabs button.active').dataset.tab; switchTab(act); });
    $('#citySel').addEventListener('change', e => {
      if (busy()) { e.target.value = S.city; return toast(t('busy')); }
      S.city = e.target.value; store.set('city', S.city); const c = placeById(S.city);
      clearRide(); setPickup({ lat: c.lat, lng: c.lng }, c.name, true); S.foodView = 'list';
      if ($('#view-food').classList.contains('active')) renderFood();
    });
    $('#locateBtn').addEventListener('click', () => locate(false));
    $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') { /* keep payment modals explicit */ } });
    locate(true);
    if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  if (window.L) init(); else document.addEventListener('DOMContentLoaded', () => window.L ? init() : (document.body.innerHTML = '<p style="padding:20px">Map library failed to load. Check your connection and reload.</p>'));
})();
