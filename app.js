// Sikkim Film Connect e-Sewa prototype. Everything lives in the browser.
// shortcut: state is in localStorage (no server, no real login/payment/SMS); replace with a backend when going live.

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rs = n => '₹' + Number(n).toLocaleString('en-IN');
const fmt = t => new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const fmtDay = t => new Date(t).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
const DAY = 864e5;
const loc = id => LOCATIONS.find(l => l.id === id);
const slotName = s => s.loc ? loc(s.loc).name : 'General NOC';
const staffName = r => ({ APPLICANT: 'Applicant', SYSTEM: 'System' }[r]) || (STAFF.find(s => s.role === r) || {}).title || r;
const KIND = { shoot: { type: 'Film Shooting', code: 'SP', page: 'shooting' }, event: { type: 'Live Event', code: 'LE', page: 'liveevent' } };

// ---------- state ----------
const KEY = 'scn-esewa';
let S = JSON.parse(localStorage.getItem(KEY) || 'null') || seed();
const save = () => localStorage.setItem(KEY, JSON.stringify(S));

// Older saved data kept documents as "Label: file name" text with no file; turn them into records.
// The sample file (id 1) gets its viewable sample attachments back.
const toDoc = d => typeof d === 'string' ? { label: d.split(': ')[0], name: d.split(': ').slice(1).join(': ') } : d;
S.apps.forEach(a => { a.docs = (a.docs || []).map(toDoc); if (a.id === 1 && !a.docs.some(d => d.url)) a.docs = seed().apps[0].docs; });
Object.values(S.drafts || {}).forEach(d => { if (d && d.docs) d.docs = d.docs.map(toDoc); });

function seed() {
  // One older file so the dashboard isn't empty, and already past the AD's 2-day timeline (shows escalation).
  const old = Date.now() - 5 * DAY;
  return {
    user: null, staff: null, drafts: {}, pending: null, lastApp: null, passes: [], reviews: {}, shortlist: [], resources: [],
    apps: [{
      id: 1, fileNo: `SCN/LE/${new Date(old).getFullYear()}/0001`, title: 'Pang Lhabsol Cultural Night', type: 'Live Event', category: 'Cultural Programme',
      applicant: { type: 'Organisation / Company', name: 'Sonju Events', contact: 'Karma Bhutia', mobile: '98XXXXXX10', email: 'sonju@example.com' },
      from: '2026-09-10', to: '2026-09-11', time: '18:00', audience: '8000', desc: 'Cultural evening with folk performances.',
      reqs: ['Stage Setup', 'Sound & Lighting'], docs: [{ label: 'Event Proposal / Concept Note', name: 'concept-poster.jpg', url: 'assets/orchid.jpg' }, { label: 'Venue Layout / Site Plan', name: 'paljor-site-plan.png', url: 'assets/paljor.png' }],
      fee: 25000, feeLines: [['Venue fee: Paljor Stadium', 25000]], txn: 'TXN1709061192', payMode: 'UPI',
      urgent: false, stage: 'AD_REVIEW', created: old, moved: old, stageAt: old, owner: 'Sonju',
      slots: [{ loc: 'paljor', dept: 'GMC', holder: null, status: 'Pending' }],
      history: [{ at: old, by: 'APPLICANT', text: 'Application submitted and fee paid (₹25,000). Forwarded to the Facilitation Cell (Additional Director).' }],
      notes: [{ at: old, text: 'Your application has been received.' }],
    }],
  };
}

// ---------- workflow ----------
const STAGES = {
  AD_REVIEW: 'Preliminary scrutiny by Facilitation Cell (AD)',
  SECY: 'With Secretary, IPR (State Nodal Officer)',
  AD_FORWARD: 'Approved by Secretary. With AD for forwarding',
  DEPTS: 'With competent authorities for NOC',
  AD_FINAL: 'All NOCs received. Consolidation by AD',
  APPROVED: 'Permission granted',
};

// Roles that currently hold the file (several departments at once during NOC stage).
function holders(a) {
  if (a.stage === 'APPROVED') return [];
  if (a.stage === 'SECY') return ['SECY'];
  if (a.stage === 'DEPTS') return [...new Set(a.slots.filter(s => s.status !== 'NOC Granted').map(s => s.holder))];
  return ['AD'];
}

// The only place the file moves. Returns the message sent to the applicant.
function advance(a, action, role, opt = {}) {
  const need = (cond, why) => { if (!cond) throw new Error(why); };
  const before = holders(a), stageBefore = a.stage, now = Date.now();
  const slot = a.slots[opt.i];
  let msg;
  switch (action) {
    case 'forward':
      need(a.stage === 'AD_REVIEW' && role === 'AD', 'Only AD can forward at review stage');
      a.stage = 'SECY'; msg = 'Your application has passed preliminary scrutiny and has been forwarded to the Secretary, IPR.'; break;
    case 'approve':
      need(a.stage === 'SECY' && role === 'SECY', 'Only Secretary can approve now');
      a.stage = 'AD_FORWARD'; msg = 'Secretary, IPR has approved your application. Sent back to the Additional Director.'; break;
    case 'send':
      need(a.stage === 'AD_FORWARD' && role === 'AD', 'Only AD can send to departments now');
      // Location departments always get it; AD may add more (e.g. Police, Fire) in the same go.
      for (const d of opt.depts || []) if (DEPTS[d] && !a.slots.some(s => s.dept === d)) a.slots.push({ loc: null, dept: d });
      a.slots.forEach(s => { s.holder = s.dept; s.status = 'Pending'; s.since = now; });
      a.stage = 'DEPTS';
      msg = 'Your application has been sent for NOC to: ' + [...new Set(a.slots.map(s => DEPTS[s.dept]))].join(', ') + '.'; break;
    case 'noc':
      need(a.stage === 'DEPTS' && slot && slot.holder === role && slot.status !== 'NOC Granted', 'This location is not with you');
      slot.status = 'NOC Granted';
      msg = `${DEPTS[role]} has granted NOC for ${slotName(slot)}.`;
      if (a.slots.every(s => s.status === 'NOC Granted')) { a.stage = 'AD_FINAL'; msg += ' All NOCs received. File returned to the Facilitation Cell for consolidation.'; }
      break;
    case 'share':
      need(a.stage === 'DEPTS' && slot && slot.holder === role && DEPTS[opt.to] && opt.to !== role, 'Cannot share this location');
      slot.holder = opt.to; slot.since = now;
      msg = `${DEPTS[role]} has shared the file for ${slotName(slot)} with ${DEPTS[opt.to]}.`; break;
    case 'issue':
      need(a.stage === 'AD_FINAL' && role === 'AD', 'Only AD can issue the permission now');
      a.stage = 'APPROVED'; a.letterNo = `${String(a.id).padStart(4, '0')}/IPR/SCN/${new Date().getFullYear()}`; a.issued = now;
      msg = 'Consolidated permission issued. Your permission letter is ready under My Application.'; break;
    case 'urgent':
      need(role === 'AD' && a.stage !== 'APPROVED', 'Only AD can flag urgency');
      a.urgent = !a.urgent; msg = null; break;
    default: throw new Error('Unknown action ' + action);
  }
  a.moved = now;
  if (a.stage !== stageBefore) a.stageAt = now;
  a.history.push({ at: now, by: role, text: msg || (a.urgent ? 'Flagged as URGENT.' : 'Urgent flag removed.'), note: opt.note || '' });
  if (msg) a.notes.push({ at: now, text: msg });
  holders(a).filter(r => !before.includes(r)).forEach(r => alertOfficer(a, r, `File ${a.fileNo} (${a.title}) received from ${staffName(role)} for your action.`));
  return msg;
}

// Officer alert (SMS / WhatsApp / Email), kept on the file so each officer's inbox can list it.
function alertOfficer(a, role, text) {
  (a.alerts = a.alerts || []).push({ at: Date.now(), to: role, text });
}

// ---------- timelines (Clause 23) ----------
const addWorkingDays = (t, n) => { const d = new Date(t); while (n > 0) { d.setDate(d.getDate() + 1); if (d.getDay() % 6) n--; } return d.getTime(); };

// What is running against the clock on this file right now: one item per officer action awaited.
function dueItems(a) {
  const mk = (role, since, label, key) => {
    const days = TIMELINES[role] || TIMELINES.DEFAULT, due = addWorkingDays(since, days);
    return { role, days, due, label, key, late: Date.now() > due };
  };
  if (['AD_REVIEW', 'AD_FORWARD', 'AD_FINAL'].includes(a.stage)) return [mk('AD', a.stageAt || a.moved, '', a.stage + ':' + (a.stageAt || a.moved))];
  if (a.stage === 'DEPTS') return a.slots.map((s, i) => s.status === 'NOC Granted' ? null : mk(s.holder, s.since, slotName(s), `slot${i}:${s.since}`)).filter(Boolean);
  return []; // Secretary (State Nodal Officer) is the escalation point; no timer on her own stage.
}
const lateFor = (a, role) => dueItems(a).some(it => it.role === role && it.late);

// Record delays and escalate them to the State Nodal Officer, once per delay.
function escalate() {
  let changed = false;
  for (const a of S.apps) for (const it of dueItems(a)) {
    a.escalated = a.escalated || [];
    if (!it.late || a.escalated.includes(it.key)) continue;
    a.escalated.push(it.key); a.urgent = true; changed = true;
    const text = `Delay recorded: ${staffName(it.role)} has exceeded the ${it.days}-working-day timeline${it.label ? ` for ${it.label}` : ''}. Escalated automatically to the State Nodal Officer.`;
    a.history.push({ at: Date.now(), by: 'SYSTEM', text });
    alertOfficer(a, 'SECY', `Escalation: file ${a.fileNo} (${a.title}). ${text}`);
  }
  if (changed) save();
}

// Self-check of the approval chain and timelines; result shows in the browser console.
(function selfCheck() {
  const a = { id: 9, stage: 'AD_REVIEW', slots: [{ loc: 'paljor', dept: 'GMC' }, { loc: 'changu', dept: 'FOREST' }], history: [], notes: [], moved: Date.now() };
  const throws = f => { try { f(); return false; } catch { return true; } };
  console.assert(throws(() => advance(a, 'approve', 'SECY')), 'Secretary must not act before AD');
  advance(a, 'forward', 'AD'); advance(a, 'approve', 'SECY'); advance(a, 'send', 'AD', { depts: ['POLICE'] });
  console.assert(holders(a).join() === 'GMC,FOREST,POLICE', 'location depts + extra dept hold the file at once');
  console.assert(['SECY', 'AD', 'GMC', 'FOREST', 'POLICE'].every(r => a.alerts.some(x => x.to === r)), 'each officer alerted on receipt');
  console.assert(dueItems(a).length === 3 && !dueItems(a).some(x => x.late), 'each dept gets its own timer');
  advance(a, 'noc', 'POLICE', { i: 2 });
  advance(a, 'share', 'FOREST', { i: 1, to: 'TOURISM' });
  console.assert(throws(() => advance(a, 'noc', 'FOREST', { i: 1 })), 'shared slot left FOREST');
  advance(a, 'noc', 'GMC', { i: 0 });
  console.assert(a.stage === 'DEPTS', 'still waiting on one NOC');
  advance(a, 'noc', 'TOURISM', { i: 1 });
  console.assert(a.stage === 'AD_FINAL' && holders(a)[0] === 'AD', 'returns to AD after all NOCs');
  advance(a, 'issue', 'AD');
  console.assert(a.stage === 'APPROVED' && holders(a).length === 0 && a.notes.length === 8, 'approved, applicant notified each step');
  const fri = new Date(2026, 10, 27).getTime(); // Friday
  console.assert(new Date(addWorkingDays(fri, 2)).getDay() === 2, '2 working days from Friday is Tuesday');
  console.log('Sikkim Film Connect workflow self-check done');
})();

// ---------- ui helpers ----------
function toast(html) {
  const t = document.createElement('div');
  t.className = 'toast'; t.innerHTML = html;
  $('#toasts').append(t); setTimeout(() => t.remove(), 6000);
  while ($('#toasts').children.length > 3) $('#toasts').firstChild.remove();
}
function notifyApplicant(a, msg) {
  if (msg) toast(`<b>SMS · WhatsApp · Email</b> sent to +91 ${esc(a.applicant.mobile)} / ${esc(a.applicant.email)}<br>${esc(msg)}`);
}
function toastAlerts(a, since) {
  (a.alerts || []).filter(x => x.at >= since).forEach(x => {
    const o = STAFF.find(s => s.role === x.to);
    toast(`<b>SMS · WhatsApp · Email</b> sent to ${esc(o.name)}, ${esc(o.title)} (+91 ${o.phone})<br>${esc(x.text)}`);
  });
}
function modal(html, wide) { $('#modal-body').innerHTML = html; $('#modal').hidden = false; $('.modal-box').classList.toggle('wide', !!wide); }
function closeModal() { $('#modal').hidden = true; $('#modal-body').innerHTML = ''; }
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal' || e.target.classList.contains('x')) closeModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });

function filterBar(el, items, current, onPick) {
  el.innerHTML = ['All', ...items].map(d => `<button class="${d === current ? 'on' : ''}">${esc(d)}</button>`).join('');
  el.querySelectorAll('button').forEach(b => b.onclick = () => onPick(b.textContent));
}

function openVR(item) {
  const name = item.name || item.title;
  const q = encodeURIComponent(`${name} Sikkim 360 VR`);
  modal(`<h2>${esc(name)}: 360° VR</h2>` + (item.vr
    ? `<div class="video"><iframe src="https://www.youtube.com/embed/${esc(item.vr)}" allow="accelerometer; gyroscope; fullscreen" allowfullscreen title="360 video"></iframe></div>
       <p class="muted">Drag inside the video, or move your phone / VR headset, to look around.</p>`
    : `<img src="${item.img}" alt="" style="border-radius:8px">
       <p>The 360° video for this location has not been linked yet.</p>
       <a class="btn" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${q}">Watch 360° videos on YouTube ↗</a>`));
}

// Location Kit: photos, best season, access and map in one printable sheet.
function locationKit(l) {
  modal(`<div class="letter"><header><img src="assets/logo.png" alt=""><h3 style="text-decoration:none;margin:6px 0">SIKKIM FILM CONNECT · LOCATION KIT</h3></header>
    <h2 style="font-family:inherit">${esc(l.name)}</h2>
    <img src="${l.img}" alt="" style="border-radius:6px;max-height:260px;width:100%;object-fit:cover">
    <table class="grid" style="margin-top:12px"><tr><td>District</td><td>${l.district}</td></tr><tr><td>Best season</td><td>${l.season}</td></tr>
      <tr><td>Location &amp; access</td><td>${esc(l.access)}</td></tr><tr><td>NOC from</td><td>${DEPTS[l.dept]}</td></tr>
      ${l.capacity ? `<tr><td>Capacity</td><td>${l.capacity}</td></tr>` : ''}</table></div>
    <div class="btns"><a class="btn alt" target="_blank" rel="noopener" href="https://www.google.com/maps/search/${encodeURIComponent(l.name + ' Sikkim')}">Open map ↗</a>
      <button class="btn sm blue" data-vr>360° VR View</button><button class="btn" onclick="print()">🖨 Print / Save as PDF</button></div>`);
  $('#modal [data-vr]').onclick = () => openVR(l);
}

// Payment method picker used by permission fees and event passes.
const PAY_MODES = ['UPI', 'Credit / Debit Card', 'Net Banking', 'Wallet'];
function payFields(mode) {
  return {
    'UPI': '<label class="req">UPI ID</label><input required placeholder="name@bank">',
    'Credit / Debit Card': '<div class="row"><div><label class="req">Card Number</label><input required pattern="[0-9 ]{12,19}" placeholder="XXXX XXXX XXXX XXXX"></div><div><label class="req">Expiry</label><input required placeholder="MM/YY" pattern="[0-9]{2}/[0-9]{2}"></div><div><label class="req">CVV</label><input required type="password" maxlength="4"></div></div>',
    'Net Banking': '<label class="req">Bank</label><select required><option value="">-- Select --</option><option>State Bank of India</option><option>State Bank of Sikkim</option><option>ICICI Bank</option><option>HDFC Bank</option></select>',
    'Wallet': '<div class="row"><div><label class="req">Wallet</label><select required><option value="">-- Select --</option><option>Paytm</option><option>PhonePe</option><option>Amazon Pay</option></select></div><div><label class="req">Mobile Number</label><input required pattern="[0-9]{10}" placeholder="10 digit mobile"></div></div>',
  }[mode];
}
function payPicker(el, mode, onPick) {
  el.innerHTML = PAY_MODES.map(m => `<label class="pay-opt ${m === mode ? 'on' : ''}"><input type="radio" name="pm" ${m === mode ? 'checked' : ''}> ${m}</label>`).join('');
  el.querySelectorAll('input').forEach((r, i) => r.onchange = () => onPick(PAY_MODES[i]));
}

// ---------- pages ----------
let slDistrict = 'All', locDistrict = 'All', evDistrict = 'All', dbTab = 'Filmic Resources', dbCat = 'All', dbQ = '', dbDist = 'All', dashTab = null, payMode = 'UPI';
const formOn = { shoot: false, event: false };

function locCards(list, kind) {
  return list.map(l => `
    <div class="card"><img src="${l.img}" alt="">
      <div class="pad"><h3>${l.name}</h3>
        <p><span class="tag">${l.district} District</span> <span class="tag vr">360° VR</span></p>
        <p class="muted">Best season: ${l.season}<br>${kind === 'event' ? `Capacity: ${l.capacity} · Venue fee: ${rs(l.fee)}<br>` : `${esc(l.access)}<br>`}NOC: ${DEPTS[l.dept]}</p>
        <div class="btns"><button class="btn sm blue" data-vr="${l.id}">VR Recce 360°</button>
          ${kind === 'shoot' ? `<button class="btn sm alt" data-kit="${l.id}">Location Kit</button>` : ''}
          <button class="btn sm alt" data-use="${l.id}">${kind === 'shoot' ? 'Apply to shoot here' : 'Apply for this venue'}</button></div>
      </div></div>`).join('');
}
function bindLocCards(el, kind) {
  el.querySelectorAll('[data-vr]').forEach(b => b.onclick = () => openVR(loc(b.dataset.vr)));
  el.querySelectorAll('[data-kit]').forEach(b => b.onclick = () => locationKit(loc(b.dataset.kit)));
  el.querySelectorAll('[data-use]').forEach(b => b.onclick = () => {
    const d = S.drafts[kind] = S.drafts[kind] || {};
    if (kind === 'shoot') d.locs = [...new Set([...(d.locs || []), b.dataset.use])]; else d.venue = b.dataset.use;
    formOn[kind] = true; save(); location.hash = KIND[kind].page;
  });
}

const pages = {
  shootlocs() {
    const all = LOCATIONS.filter(l => l.for.includes('shoot'));
    filterBar($('#sl-filter'), DISTRICTS.filter(d => all.some(l => l.district === d)), slDistrict, d => { slDistrict = d; pages.shootlocs(); });
    $('#sl-list').innerHTML = locCards(all.filter(l => slDistrict === 'All' || l.district === slDistrict), 'shoot');
    bindLocCards($('#sl-list'), 'shoot');
  },

  locations() {
    const all = LOCATIONS.filter(l => l.for.includes('event'));
    filterBar($('#loc-filter'), DISTRICTS.filter(d => all.some(l => l.district === d)), locDistrict, d => { locDistrict = d; pages.locations(); });
    $('#loc-list').innerHTML = locCards(all.filter(l => locDistrict === 'All' || l.district === locDistrict), 'event');
    bindLocCards($('#loc-list'), 'event');
  },

  achievements() {
    $('#ach-list').innerHTML = ACHIEVEMENTS.map(a => `<div class="split"><img src="${a.img}" alt=""><div><h3>${a.title}</h3><p>${a.desc}</p></div></div>`).join('');
  },

  about() {
    const rows = [['Facilitation Cell: Preliminary Scrutiny', TIMELINES.AD], ['Police Department', TIMELINES.POLICE], ['Fire & Emergency Services', TIMELINES.FIRE],
      ['Forest & Environment Department', TIMELINES.FOREST], ['Tourism & Civil Aviation Department', TIMELINES.TOURISM], ['Any Other Competent Authority', TIMELINES.DEFAULT]];
    $('#sla-table').innerHTML = '<tr><th>Competent Authority</th><th>Timeline</th></tr>' + rows.map(([n, d]) => `<tr><td>${n}</td><td>${d} days</td></tr>`).join('') +
      '<tr><th>Total consolidation and final processing</th><th>Within overall 10–15 working days</th></tr>';
  },

  events() {
    filterBar($('#ev-filter'), DISTRICTS, evDistrict, d => { evDistrict = d; pages.events(); });
    const list = EVENTS.filter(e => evDistrict === 'All' || e.district === evDistrict);
    const from = Math.min(...PASSES.map(p => p.price));
    $('#ev-list').innerHTML = list.length ? list.map(e => { const p = myPass(e); return `
      <div class="card"><img src="${e.img}" alt="">
        <div class="pad"><h3>${e.title}</h3>
          <p><span class="tag">${e.district}</span> <span class="tag vr">HD · 360° · VR</span></p>
          <p class="muted">📍 ${e.venue} · 📅 ${e.date}</p><p>${e.desc}</p>
          <div class="btns"><button class="btn sm ${p ? 'blue' : ''}" data-ev="${EVENTS.indexOf(e)}">${p ? `▶ Watch Live (${PASSES.find(x => x.id === p.pass).name})` : `Buy Ticket · from ${rs(from)}`}</button></div>
        </div></div>`; }).join('') : '<p class="muted">No events listed in this district yet.</p>';
    $('#ev-list').querySelectorAll('[data-ev]').forEach(b => b.onclick = () => watchEvent(EVENTS[b.dataset.ev]));
  },

  rate() {
    $('#rate-shoot').innerHTML = '<tr><th>Project Type</th><th>Permission Fee (includes one location)</th></tr>' +
      Object.entries(SHOOT_RATES).map(([t, f]) => `<tr><td>${t}</td><td>${rs(f)}</td></tr>`).join('') +
      `<tr><th>Each additional location</th><th>${rs(EXTRA_LOCATION_FEE)}</th></tr>`;
    $('#rate-event').innerHTML = '<tr><th>Venue</th><th>District</th><th>Capacity</th><th>NOC from</th><th>Venue Fee</th></tr>' +
      LOCATIONS.filter(l => l.for.includes('event')).map(l => `<tr><td>${l.name}</td><td>${l.district}</td><td>${l.capacity}</td><td>${DEPTS[l.dept]}</td><td>${rs(l.fee)}</td></tr>`).join('');
  },

  shooting() { permitPage('shoot'); },
  liveevent() { permitPage('event'); },

  pay() {
    const el = $('#pay-body');
    if (!S.user) return loginForm(el, 'pay');
    const kind = S.pending, d = kind && S.drafts[kind];
    if (!d) { el.innerHTML = '<p>Nothing to pay yet. Start with <a href="#shooting">Shooting Permission</a> or <a href="#liveevent">Live Event Permission</a>.</p>'; return; }
    const lines = feeLines(kind, d), total = lines.reduce((t, [, f]) => t + f, 0);
    const txn = S.txn || (S.txn = 'TXN' + Date.now().toString().slice(-10));
    el.innerHTML = `
      <ol class="flow"><li class="ok">Select permission</li><li class="ok">Fill in details</li><li class="ok">Choose locations</li><li class="on">Fee summary &amp; payment</li><li>Application number</li></ol>
      <div class="pay-grid">
        <div class="card pad"><h3>Fee Summary <small class="muted">(auto calculated)</small></h3>
          <p class="muted">${KIND[kind].type} · <b>${esc(d.title)}</b></p>
          <table class="grid"><tr><th>Description</th><th>Amount</th></tr>${lines.map(([t, f]) => `<tr><td>${esc(t)}</td><td>${rs(f)}</td></tr>`).join('')}
            <tr class="total"><th>Total Payable</th><th>${rs(total)}</th></tr></table>
          <p><a href="#${KIND[kind].page}">← Back to the application</a></p></div>
        <form class="card pad" id="pay-form"><h3>🔒 Secure Payment</h3>
          <div class="pay-opts" id="pay-opts"></div>
          <table class="grid"><tr><td>Transaction ID</td><td>${txn}</td></tr><tr><td>Merchant Name</td><td><b>IPR REVENUE HEAD</b></td></tr><tr><th>Amount</th><th>${rs(total)}</th></tr></table><br>
          ${payFields(payMode)}<br>
          <button class="btn pay-now">Pay Now ${rs(total)}</button>
          <p class="muted">Demo payment. No money is charged.</p></form>
      </div>`;
    payPicker($('#pay-opts'), payMode, m => { payMode = m; pages.pay(); });
    $('#pay-form').onsubmit = e => { e.preventDefault(); submitApplication(kind, lines, total, txn); };
  },

  done() {
    const a = S.apps.find(x => x.id === S.lastApp);
    if (!a) { $('#done-body').innerHTML = '<p>No recent application. See <a href="#myapp">My Application</a>.</p>'; return; }
    $('#done-body').innerHTML = `<div class="done card pad"><div class="tick">✓</div>
      <h2>Application Submitted Successfully</h2>
      <p class="muted">Application No.</p><p class="app-no">${a.fileNo}</p>
      <p>${esc(a.title)} · ${a.type} · Fee paid ${rs(a.fee)} (${a.txn})</p>
      <div class="btns" style="justify-content:center"><button class="btn" id="ack">⬇ Download Acknowledgement</button><a class="btn alt" href="#myapp">Track in My Application</a></div></div>`;
    $('#ack').onclick = () => acknowledgement(a);
  },

  myapp() {
    if (!S.user) return loginForm($('#myapp-body'), 'myapp');
    const mine = S.apps.filter(a => a.owner === S.user.name);
    $('#myapp-body').innerHTML = `
      <div class="who"><span>Logged in as <b>${esc(S.user.name)}</b></span><button class="btn sm alt" id="logout">Logout</button></div>
      <h2 class="page-title">My Application</h2><h3>Track Application Status</h3>
      ${mine.length ? `<table class="grid"><tr><th>Application</th><th>Application No.</th><th>Submission Date</th><th>Status</th><th>Currently with</th><th>Download</th></tr>
        ${mine.map(a => `<tr class="click" data-id="${a.id}"><td><b>${esc(a.title)}</b><br><span class="muted">${a.type} Permission (${esc(a.category)})</span></td><td>${a.fileNo}</td><td>${fmtDay(a.created)}</td>
          <td>${a.stage === 'APPROVED' ? '<span class="tag">✓ Approved</span>' : STAGES[a.stage]}</td><td>${holders(a).map(staffName).join(', ') || '-'}</td>
          <td><a href="#" data-ack="${a.id}">Acknowledgement</a>${a.stage === 'APPROVED' ? `<br><a href="#" data-letter="${a.id}" class="red-link">${a.type === 'Film Shooting' ? 'Shooting' : 'Live Event'} Permission</a>` : ''}</td></tr>`).join('')}</table>
        <p class="muted">Click an application to see its file movement and notifications.</p>`
      : '<p>No applications yet. Apply for <a href="#shooting">Shooting Permission</a> or <a href="#liveevent">Live Event Permission</a>.</p>'}
      ${Object.entries(S.drafts).filter(([, d]) => d && d.saved).map(([k, d]) => `<p class="muted">📝 Saved draft: ${KIND[k].type} “${esc(d.title || 'Untitled')}”. <a href="#${KIND[k].page}" data-draft="${k}">Continue</a></p>`).join('')}`;
    $('#logout').onclick = () => { S.user = null; save(); route(); };
    const find = id => S.apps.find(a => a.id == id);
    $('#myapp-body').querySelectorAll('[data-id]').forEach(r => r.onclick = () => fileView(find(r.dataset.id), 'APPLICANT'));
    $('#myapp-body').querySelectorAll('[data-ack]').forEach(l => l.onclick = e => { e.preventDefault(); e.stopPropagation(); acknowledgement(find(l.dataset.ack)); });
    $('#myapp-body').querySelectorAll('[data-letter]').forEach(l => l.onclick = e => { e.preventDefault(); e.stopPropagation(); letter(find(l.dataset.letter)); });
    $('#myapp-body').querySelectorAll('[data-draft]').forEach(l => l.onclick = () => { formOn[l.dataset.draft] = true; });
  },

  database() {
    const cats = DATABASE[dbTab];
    const count = c => allResources().filter(p => p.tab === dbTab && p.cat === c).length;
    $('#db-body').innerHTML = `
      <div class="tabs">${Object.keys(DATABASE).map(t => `<button class="${t === dbTab ? 'on' : ''}" data-tab="${t}">${t === 'Filmic Resources' ? '🎬' : '⚙'} ${t}</button>`).join('')}</div>
      <div class="cat-grid">${['All', ...Object.keys(cats)].map(c => `<button class="${c === dbCat ? 'on' : ''}" data-cat="${esc(c)}">${esc(c)}${c !== 'All' ? ` <small>${count(c)}</small>` : ''}</button>`).join('')}</div>
      <div class="db-tools"><input id="db-q" placeholder="🔍 Search by name, role or skill" value="${esc(dbQ)}">
        <select id="db-dist">${['All', ...DISTRICTS].map(d => `<option ${d === dbDist ? 'selected' : ''} value="${d}">${d === 'All' ? 'All districts' : d + ' District'}</option>`).join('')}</select>
        <button class="btn" id="db-add">+ Add / Register a Resource</button></div>
      <div id="db-rows"></div>`;
    $('#db-body').querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { dbTab = b.dataset.tab; dbCat = 'All'; pages.database(); });
    $('#db-body').querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { dbCat = b.dataset.cat; pages.database(); });
    $('#db-q').oninput = e => { dbQ = e.target.value; dbRows(); };
    $('#db-dist').onchange = e => { dbDist = e.target.value; dbRows(); };
    $('#db-add').onclick = registerResource;
    dbRows();
  },

  dashboard() {
    const el = $('#dash');
    if (!S.staff) {
      el.innerHTML = `<form class="login" id="staff-login"><h2>Department Login</h2>
        <label>Officer</label><select name="role">${STAFF.map(s => `<option value="${s.role}">${s.name}, ${s.title}</option>`).join('')}</select><br><br>
        <label>Password</label><input type="password" required placeholder="Any password (demo)"><br><br>
        <button class="btn" style="width:100%">Login</button></form>`;
      $('#staff-login').onsubmit = e => { e.preventDefault(); S.staff = e.target.role.value; dashTab = null; save(); pages.dashboard(); };
      return;
    }
    const r = S.staff, me = STAFF.find(s => s.role === r);
    const mine = S.apps.filter(a => holders(a).includes(r));
    const sets = {
      out: mine.filter(a => lateFor(a, r)),
      pen: mine.filter(a => !lateFor(a, r)),
      com: S.apps.filter(a => !holders(a).includes(r) && a.history.some(h => h.by === r)),
      // The State Nodal Officer monitors every urgent / escalated file, not only her own.
      urg: r === 'SECY' ? S.apps.filter(a => a.urgent && a.stage !== 'APPROVED') : mine.filter(a => a.urgent),
    };
    if (!dashTab) dashTab = sets.out.length ? 'out' : 'pen';
    const card = (k, cls, label) => `<button class="stat ${cls} ${dashTab === k ? 'on' : ''}" data-tab="${k}"><b>${sets[k].length}</b>${label}</button>`;
    const due = a => {
      const it = dueItems(a).filter(x => x.role === r).sort((x, y) => x.due - y.due)[0];
      return it ? `<span class="${it.late ? 'late' : ''}">${it.late ? 'Overdue since ' : 'By '}${fmtDay(it.due)}</span>` : '-';
    };
    const list = sets[dashTab];
    el.innerHTML = `
      <div class="who"><span><b>${me.name}</b>, ${me.title}</span><button class="btn sm alt" id="slogout">Logout</button></div>
      <h2 class="page-title">Workflow Dashboard <small class="muted">Summary &amp; Statistics</small></h2>
      <div class="stats">${card('out', 's-out', 'Outstanding (past timeline)')}${card('pen', 's-pen', 'Pending Tasks')}${card('com', 's-com', 'Completed')}${card('urg', 's-urg', r === 'SECY' ? 'Urgent / Escalated' : 'Urgent')}</div>
      ${inbox(r)}
      ${list.length ? `<table class="grid"><tr><th>Sl.</th><th>Application No.</th><th>Subject</th><th>Applicant</th><th>Status</th><th>Last forwarded by</th><th>Priority</th><th>Due</th></tr>
        ${list.map((a, i) => { const last = a.history[a.history.length - 1]; return `<tr class="click" data-id="${a.id}"><td>${i + 1}.</td><td style="color:var(--red)">${a.fileNo}</td>
          <td>${a.type.toUpperCase()} PERMISSION<br><span class="muted">${esc(a.title)}</span></td><td>${esc(a.applicant.name)}</td><td>${STAGES[a.stage]}</td>
          <td>${staffName(last.by)}</td><td>${a.urgent ? '<span class="tag urgent">URGENT</span>' : 'Normal'}</td><td>${due(a)}</td></tr>`; }).join('')}</table>`
      : '<p class="muted">No files in this list.</p>'}`;
    $('#slogout').onclick = () => { S.staff = null; save(); pages.dashboard(); };
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { dashTab = b.dataset.tab; pages.dashboard(); });
    el.querySelectorAll('[data-id]').forEach(row => row.onclick = () => fileView(S.apps.find(a => a.id == row.dataset.id), r));
  },
};

// ---------- permission application ----------
function permitPage(kind) {
  const el = $(`#${KIND[kind].page}-body`);
  const shoot = kind === 'shoot';
  el.innerHTML = `
    <p class="eyebrow">Apply Online</p>
    <h2 class="page-title">${shoot ? 'Shooting Permission' : 'Live Event Permission'}</h2>
    <p class="lead">${shoot ? 'Permission to shoot feature films, TV programmes, web series, documentaries, advertisements, music videos and digital content in Sikkim.'
      : 'Permission to organise a live event in Sikkim: concerts, festivals, cultural programmes, sports, adventure events, exhibitions and more.'}</p>
    <div class="choice">
      <button class="choice-card ${formOn[kind] ? 'on' : ''}" id="go-online"><b>💻 Online Application</b>Fill the form, choose ${shoot ? 'locations' : 'your venue'}, pay online and track it here.</button>
      <button class="choice-card" id="go-offline"><b>⬇ Download Offline Application</b>Print the form, fill it by hand and submit it at the Facilitation Cell.</button>
    </div>
    <div id="${kind}-form"></div>`;
  $('#go-online').onclick = () => { formOn[kind] = true; permitPage(kind); $(`#${kind}-form`).scrollIntoView({ behavior: 'smooth' }); };
  $('#go-offline').onclick = () => offlineForm(kind);
  if (formOn[kind]) S.user ? applyForm(kind) : loginForm($(`#${kind}-form`), () => permitPage(kind));
}

const SHOOT_DOCS = ['Script / Synopsis', 'Government ID of Applicant', 'Crew List with ID details', 'Other Supporting Documents'];
const EVENT_DOCS = ['Event Proposal / Concept Note', 'Venue Layout / Site Plan', 'Organiser / Company Registration (if applicable)', 'ID Proof of Applicant', 'NOC / Consent from Co-organiser (if any)', 'Other Supporting Documents'];
const EVENT_TYPES = ['Concert / Music Festival', 'Cultural Programme', 'Sporting Event', 'Adventure Event', 'Exhibition / Conference', 'Wellness Festival', 'Fair / Community Celebration'];
const EVENT_REQS = ['Stage Setup', 'Sound & Lighting', 'Power Supply', 'Temporary Structure (Tent / Stall)', 'Road Closure / Traffic Management', 'Security / Crowd Management'];

function applyForm(kind) {
  const shoot = kind === 'shoot', d = S.drafts[kind] || {};
  const v = k => esc(d[k] || '');
  const opt = (list, cur) => list.map(o => `<option ${o === cur ? 'selected' : ''}>${o}</option>`).join('');
  const radios = (name, list) => list.map(t => `<label><input type="radio" name="${name}" value="${t}" required ${d[name] === t ? 'checked' : ''}>${t}</label>`).join('');
  const docs = shoot ? SHOOT_DOCS : EVENT_DOCS, nReq = shoot ? 3 : 4;
  const shootLocs = LOCATIONS.filter(l => l.for.includes('shoot')), venues = LOCATIONS.filter(l => l.for.includes('event'));
  const side = shoot ? ['Project Details', 'Applicant Details', 'Shooting Locations & Schedule', 'Documents Upload', 'Declaration']
    : ['Event Details', 'Organiser Details', 'Venue & Schedule', 'Event Requirements', 'Documents Upload', 'Declaration & Submit'];
  const n = (i => () => ++i)(0);

  $(`#${kind}-form`).innerHTML = `
    <div class="who"><span>Logged in as <b>${esc(S.user.name)}</b></span><button class="btn sm alt" id="logout">Logout</button></div><br>
    <div class="form-wrap">
      <aside class="form-side"><h3>${shoot ? 'SHOOTING' : 'LIVE EVENT'} PERMISSION</h3><ol>${side.map(s => `<li>${s}</li>`).join('')}</ol></aside>
      <form class="form-main" id="app-form-${kind}">
        <h2 style="margin-top:0">${shoot ? 'Shooting' : 'Live Event'} Permission: Online Application</h2>
        ${shoot ? `
        <fieldset class="fs"><legend>${n()}. Project Details</legend>
          <div class="row"><div><label class="req">Applicant Type</label><select name="atype" required>${opt(['Individual', 'Production House'], d.atype)}</select></div>
            <div><label class="req">Project Type</label><select name="category" required><option value="">-- Select --</option>${opt(Object.keys(SHOOT_RATES), d.category)}</select></div>
            <div style="grid-column:span 2"><label class="req">Project Title</label><input name="title" required value="${v('title')}" placeholder="Enter project title"></div></div>
          <div class="row"><div style="grid-column:span 3"><label class="req">Synopsis</label><textarea name="desc" required rows="2" placeholder="A short synopsis of the project">${v('desc')}</textarea></div>
            <div><label class="req">Crew Size</label><input name="audience" type="number" min="1" required value="${v('audience')}"></div></div>
        </fieldset>
        <fieldset class="fs"><legend>${n()}. Applicant Details</legend>
          <div class="row"><div><label class="req">Name of Applicant / Production House</label><input name="aname" required value="${esc(d.aname || S.user.name)}"></div>
            <div><label class="req">Contact Person / Line Producer</label><input name="contact" required value="${v('contact')}"></div>
            <div><label class="req">Mobile Number (+91)</label><input name="mobile" required pattern="[0-9]{10}" title="10 digit mobile number" value="${v('mobile')}"></div>
            <div><label class="req">Email ID</label><input name="email" type="email" required value="${esc(d.email || S.user.email)}"></div></div>
          <div class="row"><div><label class="req">Nationality</label><select name="nationality" required>${opt(['Indian', 'Foreign National'], d.nationality)}</select></div>
            <div><label class="req">Government ID Type</label><select name="idtype" required><option value="">-- Select --</option>${opt(['Aadhaar', 'Passport', 'Voter ID', 'PAN'], d.idtype)}</select></div>
            <div><label class="req">Government ID Number</label><input name="idno" required value="${v('idno')}"></div>
            <div><label class="req">Address</label><input name="address" required value="${v('address')}"></div></div>
        </fieldset>
        <fieldset class="fs"><legend>${n()}. Shooting Locations &amp; Schedule</legend>
          <p class="muted" style="margin-top:0">Select every location you will shoot at. The permission fee covers the first location; each additional location is ${rs(EXTRA_LOCATION_FEE)}.</p>
          <div class="loc-pick">${shootLocs.map(l => `<label class="card ${(d.locs || []).includes(l.id) ? 'in-cart' : ''}"><img src="${l.img}" alt="">
            <span class="pad"><input type="checkbox" name="locs" value="${l.id}" ${(d.locs || []).includes(l.id) ? 'checked' : ''}> <b>${l.name}</b><br>
            <span class="muted">${l.district} · NOC: ${DEPTS[l.dept]}</span><br><span class="price" data-price="${l.id}"></span><button type="button" class="btn sm alt" data-vr="${l.id}">360°</button></span></label>`).join('')}</div>
          <div class="row" style="margin-top:14px"><div><label class="req">Shooting From</label><input type="date" name="from" required value="${v('from')}"></div>
            <div><label class="req">Shooting To</label><input type="date" name="to" required value="${v('to')}"></div>
            <div><label>Drone Filming</label><select name="drone">${opt(['No', 'Yes (separate Tourism & Civil Aviation clearance)'], d.drone)}</select></div></div>
        </fieldset>` : `
        <fieldset class="fs"><legend>${n()}. Event Details</legend>
          <div class="row"><div style="grid-column:span 2"><label class="req">Event Title / Name</label><input name="title" required value="${v('title')}" placeholder="e.g. Sikkim Music Fest 2026"></div>
            <div><label class="req">Event Type</label><select name="category" required><option value="">-- Select Event Type --</option>${opt(EVENT_TYPES, d.category)}</select></div>
            <div><label class="req">Event Category</label><select name="ecat" required><option value="">-- Select Category --</option>${opt(['Public (ticketed)', 'Public (free entry)', 'Private / Invite only'], d.ecat)}</select></div></div>
          <div class="row"><div style="grid-column:span 2"><label class="req">Brief Description of Event</label><textarea name="desc" required rows="2" placeholder="Provide a short description of the event">${v('desc')}</textarea></div>
            <div><label class="req">Expected Audience / Footfall</label><input name="audience" type="number" min="1" required value="${v('audience')}" placeholder="Enter estimated number"></div>
            <div><label class="req">Event Duration (Days)</label><select name="days" required><option value="">-- Select --</option>${opt(['1', '2', '3', '4', '5', '6', '7'], d.days)}</select></div></div>
        </fieldset>
        <fieldset class="fs"><legend>${n()}. Organiser Details</legend>
          <div class="checks" style="margin-bottom:12px"><b style="font-size:13px">Applicant Type *</b> ${radios('atype', ['Individual', 'Organisation / Company', 'Production House', 'NGO / Society'])}</div>
          <div class="row"><div><label class="req">Name of Applicant / Organisation</label><input name="aname" required value="${esc(d.aname || S.user.name)}"></div>
            <div><label class="req">Contact Person</label><input name="contact" required value="${v('contact')}"></div>
            <div><label class="req">Mobile Number (+91)</label><input name="mobile" required pattern="[0-9]{10}" title="10 digit mobile number" value="${v('mobile')}"></div>
            <div><label class="req">Email ID</label><input name="email" type="email" required value="${esc(d.email || S.user.email)}"></div></div>
        </fieldset>
        <fieldset class="fs"><legend>${n()}. Venue &amp; Schedule</legend>
          <div class="row"><div style="grid-column:span 2"><label class="req">Proposed Venue</label><select name="venue" required><option value="">-- Select Venue --</option>${venues.map(l => `<option value="${l.id}" ${d.venue === l.id ? 'selected' : ''}>${l.name}, ${l.district} (capacity ${l.capacity}, ${rs(l.fee)})</option>`).join('')}</select></div>
            <div style="align-self:end"><button type="button" class="btn blue" id="check-venue" style="width:100%">📅 Check Venue Availability</button></div></div>
          <div id="venue-result"></div>
          <div class="row"><div><label class="req">Event Start Date</label><input type="date" name="from" required value="${v('from')}"></div>
            <div><label class="req">Event End Date</label><input type="date" name="to" required value="${v('to')}"></div>
            <div><label class="req">Event Time</label><input type="time" name="time" required value="${v('time')}"></div></div>
        </fieldset>
        <fieldset class="fs"><legend>${n()}. Event Requirements</legend>
          <div class="checks">${EVENT_REQS.map(r => `<label><input type="checkbox" name="reqs" value="${r}" ${(d.reqs || []).includes(r) ? 'checked' : ''}>${r}</label>`).join('')}
            <label>Others <input name="other" value="${v('other')}" placeholder="Specify" style="width:180px"></label></div>
        </fieldset>`}
        <fieldset class="fs"><legend>${n()}. Upload Documents <small>(PDF, JPG, PNG, max 10 MB each)</small></legend>
          <div class="row">${docs.map((t, i) => { const had = (d.docs || []).find(x => x.label === t); return `<div><label class="${i < nReq ? 'req' : ''}">${t}</label><input type="file" data-label="${t}" accept=".pdf,.jpg,.jpeg,.png" ${i < nReq && !had ? 'required' : ''}>${had ? `<span class="muted">✓ ${esc(had.name)}</span>` : ''}</div>`; }).join('')}</div>
        </fieldset>
        <fieldset class="fs"><legend>${n()}. Declaration</legend>
          <label style="font-weight:400"><input type="checkbox" required> I hereby declare that the information provided above is true and correct to the best of my knowledge. I agree to comply with all applicable laws, rules and guidelines of the Government of Sikkim for the successful conduct of the ${shoot ? 'shoot' : 'event'}.</label>
        </fieldset>
        <div class="cart-bar"><span id="fee-live"></span>
          <span class="btns" style="margin:0"><button type="button" class="btn alt" id="draft">💾 Save as Draft</button>
          <button class="btn submit">${shoot ? 'Proceed to Fee Summary →' : 'Submit Application →'}</button></span></div>
      </form>
    </div>`;

  const form = $(`#app-form-${kind}`);
  const read = () => readForm(form, kind);
  const showFee = () => {
    const lines = feeLines(kind, read());
    $('#fee-live').textContent = lines.length ? `Fee (auto calculated): ${rs(lines.reduce((t, [, f]) => t + f, 0))}` : 'Fee is calculated once you fill the details.';
    // Price on each location card: the first selected one is covered by the permission fee, the rest cost extra.
    if (shoot) {
      const x = read(), picked = x.locs || [], base = SHOOT_RATES[x.category];
      form.querySelectorAll('[data-price]').forEach(p => {
        const i = picked.indexOf(p.dataset.price);
        const first = i === 0 || (i < 0 && !picked.length);
        p.className = 'price' + (i >= 0 ? ' on' : '');
        p.textContent = first ? (base ? `${rs(base)} (${x.category} permission fee)` : 'Covered by permission fee') : `${i >= 0 ? 'Additional' : '+'} ${rs(EXTRA_LOCATION_FEE)}`;
      });
    }
  };
  form.oninput = form.onchange = e => {
    const f = e.target.type === 'file' && e.target.files[0];
    if (f) {
      if (f.size > 10 * 1024 * 1024) { e.target.value = ''; return toast('File is larger than 10 MB. Please choose a smaller file.'); }
      putFile(draftKey(kind, e.target.dataset.label), f).catch(() => toast('Could not store this file in the browser.'));
    }
    if (e.target.name === 'locs') e.target.closest('.card').classList.toggle('in-cart', e.target.checked);
    showFee();
  };
  showFee();
  $('#logout').onclick = () => { S.user = null; save(); route(); };
  form.querySelectorAll('[data-vr]').forEach(b => b.onclick = e => { e.preventDefault(); openVR(loc(b.dataset.vr)); });
  $('#draft').onclick = () => { S.drafts[kind] = { ...read(), saved: Date.now() }; save(); toast('Draft saved. You can continue later from here or from My Application.'); };
  if (!shoot) $('#check-venue').onclick = () => {
    const x = read();
    $('#venue-result').innerHTML = x.venue && x.from ? venueCheck(x) : '<p class="note">Select the venue and the start date first.</p>';
  };
  form.onsubmit = e => {
    e.preventDefault();
    const x = read();
    if (shoot && !(x.locs || []).length) return toast('Please select at least one shooting location.');
    if (x.to < x.from) return toast('End date cannot be before start date.');
    S.drafts[kind] = x; S.pending = kind; save(); location.hash = 'pay';
  };
}

// Another live event at the same venue with overlapping dates (not counting approved-and-ended or this user's own draft).
function venueCheck(x) {
  const to = x.to || x.from;
  const clash = S.apps.filter(a => a.slots.some(s => s.loc === x.venue) && a.from <= to && x.from <= a.to);
  return clash.length
    ? `<p class="note bad">⚠ ${loc(x.venue).name} is already requested for ${clash.map(a => `${esc(a.from)} to ${esc(a.to)} (${a.stage === 'APPROVED' ? 'booked' : 'under process'})`).join('; ')}. Please choose other dates or another venue.</p>`
    : `<p class="note good">✓ ${loc(x.venue).name} is available from ${esc(x.from)} to ${esc(to)}.</p>`;
}

function feeLines(kind, d) {
  if (kind === 'shoot') {
    const locs = d.locs || [], rate = SHOOT_RATES[d.category];
    if (!rate || !locs.length) return [];
    return [[`${d.category} (Permission Fee), incl. ${loc(locs[0]).name}`, rate], ...locs.slice(1).map(id => [`Additional Location: ${loc(id).name}`, EXTRA_LOCATION_FEE])];
  }
  return d.venue ? [[`Venue fee: ${loc(d.venue).name}`, loc(d.venue).fee]] : [];
}

function readForm(form, kind) {
  const d = {};
  new FormData(form).forEach((v, k) => {
    if (v instanceof File) return; // files are listed separately below
    if (k === 'reqs' || k === 'locs') (d[k] = d[k] || []).push(v); else d[k] = v;
  });
  // The file itself goes to IndexedDB when chosen (see applyForm); the application keeps label, name and key.
  const prev = (S.drafts[kind] && S.drafts[kind].docs) || [];
  d.docs = [...form.querySelectorAll('input[type=file]')].map(i => i.files[0]
    ? { label: i.dataset.label, name: i.files[0].name, key: draftKey(kind, i.dataset.label) }
    : prev.find(x => x.label === i.dataset.label)).filter(Boolean);
  return d;
}

// ---------- uploaded files ----------
// shortcut: files live in this browser's IndexedDB (no server); upload them to the server when going live.
const draftKey = (kind, label) => `draft:${kind}:${label}`;
let filesDB;
function fileStore(mode, fn) {
  filesDB = filesDB || new Promise((ok, fail) => {
    const r = indexedDB.open('scn-files', 1);
    r.onupgradeneeded = () => r.result.createObjectStore('f');
    r.onsuccess = () => ok(r.result); r.onerror = () => fail(r.error);
  });
  return filesDB.then(db => new Promise((ok, fail) => {
    const t = db.transaction('f', mode), req = fn(t.objectStore('f'));
    t.oncomplete = () => ok(req && req.result); t.onerror = () => fail(t.error);
  }));
}
const putFile = (key, file) => fileStore('readwrite', s => s.put(file, key));
const getFile = key => fileStore('readonly', s => s.get(key));

async function submitApplication(kind, lines, total, txn) {
  const d = S.drafts[kind], id = Math.max(0, ...S.apps.map(a => a.id)) + 1, now = Date.now();
  const locs = kind === 'shoot' ? d.locs : [d.venue];
  const reqs = [...(d.reqs || []), ...(d.other ? [d.other] : []), ...(d.drone && d.drone !== 'No' ? ['Drone Filming'] : [])];
  const a = {
    id, fileNo: `SCN/${KIND[kind].code}/${new Date().getFullYear()}/${String(id).padStart(4, '0')}`, owner: S.user.name,
    title: d.title, type: KIND[kind].type, category: d.category, desc: d.desc, audience: d.audience,
    applicant: { type: d.atype, name: d.aname, contact: d.contact, mobile: d.mobile, email: d.email, idtype: d.idtype, idno: d.idno, address: d.address, nationality: d.nationality },
    from: d.from, to: d.to, time: d.time || '', reqs, docs: d.docs || [], fee: total, feeLines: lines, txn, payMode,
    urgent: false, stage: 'AD_REVIEW', created: now, moved: now, stageAt: now,
    slots: locs.map(l => ({ loc: l, dept: loc(l).dept, holder: null, status: 'Pending' })),
    history: [{ at: now, by: 'APPLICANT', text: `Application submitted and fee paid (${rs(total)}, ${txn}). Forwarded to the Facilitation Cell for preliminary scrutiny.` }],
    notes: [],
  };
  // Move each uploaded file from the draft slot to this application, so the next draft can't overwrite it.
  try {
    a.docs = await Promise.all(a.docs.map(async (doc, i) => {
      const file = doc.key && await getFile(doc.key);
      if (!file) return { label: doc.label, name: doc.name };
      const key = `app:${id}:${i}`; await putFile(key, file);
      return { ...doc, key };
    }));
  } catch { toast('Your documents could not be stored in this browser. The application is submitted without them.'); }
  const msg = `Your application ${a.fileNo} has been received. Fee of ${rs(total)} paid (${txn}).`;
  a.notes.push({ at: now, text: msg });
  alertOfficer(a, 'AD', `New application ${a.fileNo} (${a.title}) submitted by ${a.applicant.name}. Fee paid.`);
  S.apps.push(a); S.drafts[kind] = null; S.pending = null; S.txn = null; S.lastApp = id; formOn[kind] = false; save();
  notifyApplicant(a, msg); toastAlerts(a, now);
  location.hash = 'done';
}

// ---------- printable documents ----------
const docHead = () => `<header><img src="assets/logo.png" alt=""><h3 style="text-decoration:none;margin:6px 0">DEPARTMENT OF INFORMATION &amp; PUBLIC RELATIONS<br>GOVERNMENT OF SIKKIM<br>SOOCHNA BHAWAN, GANGTOK 737101</h3></header>`;
const printBtn = '<button class="btn" onclick="print()">🖨 Print / Save as PDF</button>';

function acknowledgement(a) {
  modal(`<div class="letter">${docHead()}
    <h3>ACKNOWLEDGEMENT: ${a.type.toUpperCase()} PERMISSION</h3>
    <table class="grid"><tr><td>Application No.</td><td><b>${a.fileNo}</b></td></tr><tr><td>Submitted on</td><td>${fmt(a.created)}</td></tr>
      <tr><td>Applicant</td><td>${esc(a.applicant.name)} (${esc(a.applicant.type)})</td></tr><tr><td>Title</td><td>${esc(a.title)} · ${esc(a.category)}</td></tr>
      <tr><td>${a.type === 'Film Shooting' ? 'Locations' : 'Venue'}</td><td>${a.slots.filter(s => s.loc).map(slotName).join(', ')}</td></tr>
      <tr><td>Period</td><td>${esc(a.from)} to ${esc(a.to)}</td></tr>
      ${(a.feeLines || []).map(([t, f]) => `<tr><td>${esc(t)}</td><td>${rs(f)}</td></tr>`).join('')}
      <tr><th>Total fee paid</th><th>${rs(a.fee)} · ${esc(a.payMode || '')} · ${esc(a.txn)}</th></tr></table>
    <p>Your application has been received by the Sikkim Live Events and Film Shooting Facilitation Cell. Track its status under <b>My Application</b> on Sikkim Film Connect. You will be alerted by SMS, WhatsApp and Email at every stage.</p>
    <p class="muted">This is a computer-generated acknowledgement and needs no signature.</p></div>${printBtn}`);
}

function offlineForm(kind) {
  const shoot = kind === 'shoot', line = t => `<p>${t}: ______________________________________________</p>`;
  modal(`<div class="letter">${docHead()}
    <h3>APPLICATION FOR ${shoot ? 'FILM SHOOTING' : 'LIVE EVENT'} PERMISSION (OFFLINE)</h3>
    ${(shoot ? ['Applicant Type (Individual / Production House)', 'Project Type', 'Project Title', 'Synopsis', 'Crew Size', 'Name of Applicant / Production House', 'Contact Person / Line Producer', 'Mobile Number', 'Email ID', 'Nationality', 'Government ID Type and Number', 'Address', 'Shooting Locations', 'Shooting Period (From / To)', 'Drone Filming (Yes / No)']
      : ['Event Title / Name', 'Event Type', 'Event Category', 'Brief Description', 'Expected Audience / Footfall', 'Event Duration (Days)', 'Applicant Type', 'Name of Applicant / Organisation', 'Contact Person', 'Mobile Number', 'Email ID', 'Proposed Venue', 'Event Dates (Start / End) and Time', 'Event Requirements']).map(line).join('')}
    <p><b>Documents to attach:</b> ${(shoot ? SHOOT_DOCS : EVENT_DOCS).join('; ')}.</p>
    <p><b>Fee:</b> as per the Rate Chart, by Bank Receipt / Challan to the IPR Revenue Head.</p>
    <p><b>Declaration:</b> I hereby declare that the information provided above is true and correct to the best of my knowledge.</p>
    <p style="display:flex;justify-content:space-between;margin-top:40px"><span>Date: ____________</span><span>Signature of Applicant</span></p>
    <p class="muted">Submit at the Facilitation Cell, Soochna Bhawan, IPR Department, Metro Point, 5th Mile, Gangtok 737101.</p></div>${printBtn}`);
}

function letter(a) {
  const depts = [...new Set(a.slots.map(s => DEPTS[s.dept]))].join(', ');
  modal(`<div class="letter">${docHead()}
    <p style="display:flex;justify-content:space-between"><span>No. ${a.letterNo}</span><span>Date: ${new Date(a.issued).toLocaleDateString('en-IN')}</span></p>
    <h3>PERMISSION FOR ${a.type.toUpperCase()}</h3>
    <p>The Department of Information &amp; Public Relations, Government of Sikkim hereby issues consolidated permission to <b>${esc(a.applicant.name)}</b> for <b>${esc(a.title)}</b> (Application No. ${a.fileNo}), subject to the following conditions:</p>
    <ol>
      <li>The permission fee of ${rs(a.fee)} has been paid vide transaction no. ${esc(a.txn)}.</li>
      <li>The ${a.type === 'Film Shooting' ? 'shooting' : 'event'} shall be restricted to the following locations: <b><u>${a.slots.filter(s => s.loc).map(slotName).join(', ')}</u></b>.</li>
      <li>The period for which permission has been granted is from <b>${esc(a.from)}</b> to <b>${esc(a.to)}</b>.</li>
      <li>No Objection Certificates have been granted by: ${depts}.</li>
      <li>Shooting inside religious institutions, defence establishments and other restricted areas is prohibited unless separately permitted.</li>
      <li>Crew members from outside India shall obtain Work Permit, Visa and Inner Line Permit from the competent authority.</li>
      <li>This permit does not cover filming by drones unless permitted by the Tourism &amp; Civil Aviation Department.</li>
    </ol>
    <p style="text-align:right;margin-top:40px">Mr. Bishal Khawas<br>Additional Director (Film Section)<br>IPR Department<br>Government of Sikkim</p>
  </div>${printBtn}`);
}

// ---------- shared pieces ----------
function inbox(role) {
  const msgs = S.apps.flatMap(a => (a.alerts || []).filter(x => x.to === role)).sort((x, y) => y.at - x.at).slice(0, 5);
  return `<details class="inbox"><summary>📩 Messages (SMS · WhatsApp · Email): ${msgs.length}</summary>
    ${msgs.length ? `<ul class="timeline">${msgs.map(m => `<li>${esc(m.text)}<small>${fmt(m.at)}</small></li>`).join('')}</ul>` : '<p class="muted">No messages.</p>'}</details>`;
}

// after: a page name or a callback to run once logged in.
function loginForm(el, after) {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  el.innerHTML = `<form class="login" method="post"><h2>USER LOGIN</h2>
    <label class="req">UserName</label><input name="u" type="email" required placeholder="e.g. john.smith@example.com"><br><br>
    <label class="req">Password</label><input name="p" type="password" required placeholder="Enter Password"><br><br>
    <div class="captcha">${code}</div><br>
    <label class="req">Enter Captcha Here</label><input name="c" required placeholder="Enter Captcha"><br><br>
    <div class="btns"><button class="btn blue" style="flex:1">LOGIN</button><button type="reset" class="btn alt" style="flex:1">Clear</button></div>
    <p class="muted">New user? Enter any email and password. Your account is created on first login (demo).</p></form>`;
  el.querySelector('form').onsubmit = e => {
    e.preventDefault();
    const f = e.target;
    if (f.c.value.trim() !== code) { toast('Captcha does not match. Please try again.'); return loginForm(el, after); }
    S.user = { name: f.u.value.split('@')[0].replace(/[._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), email: f.u.value };
    save(); typeof after === 'function' ? after() : pages[after]();
  };
}

// ---------- live event tickets ----------
const myPass = e => S.user && S.passes.find(p => p.user === S.user.email && p.event === e.title);

function watchEvent(e) {
  if (myPass(e)) return openVR(e);
  if (!S.user) { modal('<p class="muted" style="text-align:center">Login to buy a ticket for this event.</p><div id="m-login"></div>'); return loginForm($('#m-login'), () => { pages.events(); watchEvent(e); }); }
  let pass = 'vr', mode = 'UPI', cb = true, qty = 1;
  const draw = () => {
    const p = PASSES.find(x => x.id === pass), total = p.price + (cb ? CARDBOARD_PRICE * qty : 0);
    modal(`
      <div class="ev-head" style="background-image:linear-gradient(90deg,#000c 40%,#0003),url(${e.img})"><span class="live">● LIVE</span><h2>${esc(e.title)}</h2><p>📅 ${esc(e.date)} · 📍 ${esc(e.venue)}</p></div>
      <h3><span class="step-no">Step 1</span> Choose Your Pass</h3>
      <div class="passes">${PASSES.map(x => `<label class="pass ${x.id === pass ? 'on' : ''}">${x.best ? '<span class="best">Recommended</span>' : ''}<input type="radio" name="pass" value="${x.id}" ${x.id === pass ? 'checked' : ''}><b>${x.name}</b><span>${x.desc}</span><strong>${rs(x.price)}</strong></label>`).join('')}</div>
      <h3><span class="step-no">Step 2</span> Add-on (Optional)</h3>
      <div class="addon"><label><input type="checkbox" id="cb" ${cb ? 'checked' : ''}> <b>Add VR Cardboard Viewer</b><br><span class="muted">A lightweight and affordable VR viewer for an immersive experience.</span></label>
        <strong>${rs(CARDBOARD_PRICE)}</strong><span class="qty"><button type="button" data-q="-1">−</button><b>${qty}</b><button type="button" data-q="1">+</button></span></div>
      <h3><span class="step-no">Step 3</span> Select Payment Method</h3>
      <div class="pay-opts" id="ev-opts"></div>
      <form id="vr-pay">${payFields(mode)}
        <div class="total-bar"><span>Total Payable <b>${rs(total)}</b><br><small>${p.name} ${rs(p.price)}${cb ? ` + VR Cardboard ${rs(CARDBOARD_PRICE)} × ${qty}` : ''}</small></span>
          <button class="btn pay-now">🔒 Book &amp; Watch Live ›</button></div>
        <p class="muted">Demo payment. No money is charged.</p></form>`, true);
    document.querySelectorAll('#modal [name=pass]').forEach(r => r.onchange = () => { pass = r.value; draw(); });
    $('#cb').onchange = ev => { cb = ev.target.checked; draw(); };
    document.querySelectorAll('#modal [data-q]').forEach(b => b.onclick = () => { qty = Math.max(1, Math.min(10, qty + +b.dataset.q)); cb = true; draw(); });
    payPicker($('#ev-opts'), mode, m => { mode = m; draw(); });
    $('#vr-pay').onsubmit = ev => {
      ev.preventDefault();
      S.passes.push({ user: S.user.email, event: e.title, pass, cardboard: cb ? qty : 0, paid: total, at: Date.now() });
      save(); pages.events();
      toast(`<b>SMS · WhatsApp · Email</b> sent to ${esc(S.user.email)}<br>Payment of ${rs(total)} received. Your ${p.name} for ${esc(e.title)} is active.${cb ? ` ${qty} VR Cardboard viewer(s) will be delivered to you.` : ''}`);
      openVR(e);
    };
  };
  draw();
}

// ---------- database ----------
function allResources() {
  const base = Object.entries(DATABASE).flatMap(([tab, cats]) => Object.entries(cats).flatMap(([cat, list]) => list.map(p => ({ ...p, tab, cat }))));
  return [...base, ...S.resources];
}
const reviewsOf = p => [...(p.reviews || []), ...(S.reviews[p.name] || [])];
const ratingOf = p => { const r = reviewsOf(p); return r.length ? r.reduce((t, x) => t + x.stars, 0) / r.length : 0; };
const stars = n => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));

function dbRows() {
  const q = dbQ.trim().toLowerCase();
  const rows = allResources().filter(p => p.tab === dbTab && (dbCat === 'All' || p.cat === dbCat) && (dbDist === 'All' || p.district === dbDist)
    && (!q || [p.name, p.role, p.skills, p.cat].join(' ').toLowerCase().includes(q)));
  $('#db-rows').innerHTML = rows.length ? `<table class="grid"><tr><th>Name</th><th>Category</th><th>District</th><th>Skills / Service</th><th>Rating</th></tr>
    ${rows.map((p, i) => `<tr class="click" data-i="${i}"><td><b>${esc(p.name)}</b>${p.verified ? ' <span class="ok">✔</span>' : ''}${p.pending ? ' <span class="tag">Pending verification</span>' : ''}${p.role ? `<br><span class="muted">${esc(p.role)}</span>` : ''}</td>
      <td>${esc(p.cat)}</td><td>${esc(p.district)}</td><td>${esc(p.skills)}</td><td>${reviewsOf(p).length ? `<span class="stars">★</span> ${ratingOf(p).toFixed(1)}` : '-'}</td></tr>`).join('')}</table>`
    : '<p class="muted">No resources match your search.</p>';
  $('#db-rows').querySelectorAll('[data-i]').forEach(r => r.onclick = () => profile(rows[r.dataset.i]));
}

function profile(p) {
  const rv = reviewsOf(p), avg = ratingOf(p), listed = S.shortlist.includes(p.name);
  const initials = p.name.split(' ').map(w => w[0]).slice(0, 2).join('');
  const dist = [5, 4, 3, 2, 1].map(s => [s, rv.filter(x => Math.round(x.stars) === s).length]);
  const similar = allResources().filter(x => x.cat === p.cat && x.name !== p.name).sort((a, b) => ratingOf(b) - ratingOf(a)).slice(0, 3);
  modal(`
    <p class="muted">Database › ${esc(p.cat)} › Profile</p>
    <div class="pf">
      <div class="pf-main">
        <div class="pf-head"><div class="avatar">${initials}</div>
          <div><h2>${esc(p.name)} ${p.verified ? '<span class="ok">✔</span>' : ''}</h2><p>${esc(p.role || p.cat)}</p><p class="muted">📍 ${esc(p.district)}, Sikkim</p></div>
          <div class="btns" style="flex-direction:column;margin-left:auto"><button class="btn sm alt" id="pf-short">${listed ? '♥ Shortlisted' : '♡ Shortlist'}</button><button class="btn sm" id="pf-hire">✉ Contact / Hire</button></div></div>
        <div class="pf-stats"><div><b>★ ${rv.length ? avg.toFixed(1) : '-'}</b> / 5<br><small>Producer rating (${rv.length} reviews)</small></div>
          ${p.projects ? `<div><b>${p.projects}</b><br><small>Projects</small></div>` : ''}${p.exp ? `<div><b>${p.exp}</b><br><small>Years experience</small></div>` : ''}
          <div><b>${p.verified ? '✔' : p.pending ? '…' : '-'}</b><br><small>${p.verified ? 'Verified profile' : p.pending ? 'Pending verification' : 'Not verified'}</small></div></div>
        <div id="pf-contact"></div>
        <h4>ABOUT</h4><p>${esc(p.about)}</p>
        <h4>SKILLS / SERVICES</h4>${p.skillBars ? p.skillBars.map(([s, n]) => `<div class="bar"><span>${s}</span><i><em style="width:${n}%"></em></i><small>${n}%</small></div>`).join('') : `<p>${esc(p.skills)}</p>`}
        ${p.education ? `<h4>EDUCATION</h4><p>${esc(p.education)}</p>` : ''}
        ${p.work ? `<h4>WORK EXPERIENCE</h4><p>${esc(p.work)}</p>` : ''}
        ${p.awards ? `<h4>AWARDS / RECOGNITION</h4><ul>${p.awards.map(a => `<li>${esc(a)}</li>`).join('')}</ul>` : ''}
        ${similar.length ? `<h4>SIMILAR ${p.tab === 'Filmic Resources' ? 'TALENT' : 'SERVICES'}</h4><div class="similar">${similar.map((s, i) => `<button data-sim="${i}"><b>${esc(s.name)}</b><br><small>${esc(s.role || s.cat)}${reviewsOf(s).length ? ` · ★ ${ratingOf(s).toFixed(1)}` : ''}</small></button>`).join('')}</div>` : ''}
      </div>
      <aside class="pf-side">
        <h4>RATING &amp; REVIEWS</h4>
        <div class="pf-rating"><b>${rv.length ? avg.toFixed(1) : '-'}</b>/5<br><span class="stars">${stars(avg)}</span><br><small>(${rv.length} reviews)</small></div>
        ${dist.map(([s, c]) => `<div class="bar"><span>${s}★</span><i><em style="width:${rv.length ? c / rv.length * 100 : 0}%"></em></i><small>${rv.length ? Math.round(c / rv.length * 100) : 0}%</small></div>`).join('')}
        <h4>RECENT REVIEWS</h4>
        ${rv.length ? rv.slice(-3).reverse().map(r => `<div class="review"><b>${esc(r.by)}</b> <small>(${esc(r.as)}) · ${esc(r.at)}</small><br><span class="stars">${stars(r.stars)}</span><p>${esc(r.text)}</p></div>`).join('') : '<p class="muted">No reviews yet.</p>'}
        <h4>RATE &amp; REVIEW <small>(Producers / Directors only)</small></h4>
        <form id="rv-form">
          <label class="req">You are</label><select name="as" required><option value="">-- Select --</option><option>Producer</option><option>Director</option></select>
          <label class="req" style="margin-top:8px">Your Rating</label><div class="rate-in">${[5, 4, 3, 2, 1].map(n => `<input type="radio" name="stars" value="${n}" id="st${n}" required><label for="st${n}">★</label>`).join('')}</div>
          <label>Your Review (optional)</label><textarea name="text" rows="2" placeholder="Share your experience working with this professional"></textarea>
          <button class="btn" style="margin-top:8px;width:100%">Submit Review</button></form>
      </aside>
    </div>`, true);
  $('#pf-short').onclick = () => {
    S.shortlist = listed ? S.shortlist.filter(n => n !== p.name) : [...S.shortlist, p.name]; save();
    toast(listed ? `${esc(p.name)} removed from your shortlist.` : `♥ ${esc(p.name)} added to your shortlist.`); profile(p);
  };
  $('#pf-hire').onclick = () => {
    $('#pf-contact').innerHTML = `<p class="note good">📞 +91 ${esc(p.phone)} · Mention <b>Sikkim Film Connect</b> when you call.</p>`;
    if (S.user) toast(`<b>SMS · WhatsApp</b> sent to ${esc(p.name)}<br>${esc(S.user.name)} would like to discuss a project with you.`);
  };
  document.querySelectorAll('#modal [data-sim]').forEach(b => b.onclick = () => profile(similar[b.dataset.sim]));
  $('#rv-form').onsubmit = e => {
    e.preventDefault();
    const f = e.target;
    const post = () => {
      (S.reviews[p.name] = S.reviews[p.name] || []).push({ by: S.user.name, as: f.as.value, stars: +f.stars.value, at: new Date().toISOString().slice(0, 10), text: f.text.value || 'Rated without comment.' });
      save(); dbRows(); profile(p); toast('Thank you. Your review has been posted.');
    };
    if (S.user) return post();
    const keep = { as: f.as.value, stars: f.stars.value, text: f.text.value };
    modal('<p class="muted" style="text-align:center">Login to post your review.</p><div id="m-login"></div>');
    loginForm($('#m-login'), () => { profile(p); const g = $('#rv-form'); g.as.value = keep.as; g.querySelector(`#st${keep.stars}`).checked = true; g.text.value = keep.text; g.requestSubmit(); });
  };
}

function registerResource() {
  if (!S.user) { modal('<p class="muted" style="text-align:center">Login to register a resource.</p><div id="m-login"></div>'); return loginForm($('#m-login'), registerResource); }
  modal(`<h2 style="margin-top:0">Add / Register a Resource</h2>
    <p class="muted">Your listing appears in the Database straight away, marked "Pending verification" until the Facilitation Cell verifies it.</p>
    <form id="res-form">
      <div class="row"><div><label class="req">Category</label><select name="cat" required><option value="">-- Select --</option>
        ${Object.entries(DATABASE).map(([t, cats]) => `<optgroup label="${t}">${Object.keys(cats).map(c => `<option value="${esc(t + '|' + c)}">${esc(c)}</option>`).join('')}</optgroup>`).join('')}</select></div>
        <div><label class="req">Name / Business Name</label><input name="name" required value="${esc(S.user.name)}"></div>
        <div><label>Role / Designation</label><input name="role" placeholder="e.g. Actor, Drone Pilot"></div></div>
      <div class="row"><div><label class="req">District</label><select name="district" required>${DISTRICTS.map(d => `<option>${d}</option>`).join('')}</select></div>
        <div><label class="req">Mobile Number</label><input name="phone" required pattern="[0-9]{10}"></div>
        <div><label class="req">Skills / Services</label><input name="skills" required></div></div>
      <label class="req">About</label><textarea name="about" required rows="3"></textarea><br><br>
      <button class="btn">Register</button></form>`);
  $('#res-form').onsubmit = e => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target)), [tab, cat] = f.cat.split('|');
    S.resources.push({ tab, cat, name: f.name, role: f.role, district: f.district, phone: f.phone, skills: f.skills, about: f.about, pending: true });
    save(); closeModal(); dbTab = tab; dbCat = cat; dbQ = ''; dbDist = 'All'; pages.database();
    toast(`${esc(f.name)} registered under ${esc(cat)}. Pending verification by the Facilitation Cell.`);
  };
}

// ---------- file view (dashboard + my application) ----------
// The same view serves the applicant (read-only) and officers (with actions).
function fileView(a, role) {
  const isStaff = role !== 'APPLICANT';
  const deptOpts = Object.keys(DEPTS).filter(k => k !== role).map(k => `<option value="${k}">${DEPTS[k]}</option>`).join('');
  const act = [];
  if (isStaff) {
    if (role === 'AD' && a.stage === 'AD_REVIEW') act.push(['forward', 'Scrutiny complete: forward to Secretary']);
    if (role === 'SECY' && a.stage === 'SECY') act.push(['approve', 'Approve & return to AD']);
    if (role === 'AD' && a.stage === 'AD_FORWARD') act.push(['send', 'Send to selected departments']);
    if (role === 'AD' && a.stage === 'AD_FINAL') act.push(['issue', 'Issue Consolidated Permission']);
    if (role === 'AD' && a.stage !== 'APPROVED') act.push(['urgent', a.urgent ? 'Remove urgent flag' : 'Flag as URGENT']);
  }
  const mySlot = s => isStaff && a.stage === 'DEPTS' && s.holder === role && s.status !== 'NOC Granted';
  const late = isStaff && lateFor(a, role);
  const slotDue = (s, i) => { const it = dueItems(a).find(x => x.key === `slot${i}:${s.since}`); return it ? `<span class="${it.late ? 'late' : ''}">${fmtDay(it.due)}</span>` : '-'; };
  const stageDue = dueItems(a).find(x => x.role === 'AD');
  modal(`
    <h2 style="margin-top:0">${esc(a.title)} ${a.urgent ? '<span class="tag urgent">URGENT</span>' : ''}</h2>
    <p class="muted">${a.fileNo} · ${a.type} · ${esc(a.category)} · Submitted ${fmt(a.created)}</p>
    <p><b>Status:</b> ${STAGES[a.stage]}${holders(a).length ? ` · <b>Currently with:</b> ${holders(a).map(staffName).join(', ')}` : ''}
      ${stageDue ? ` · <b>Due:</b> <span class="${stageDue.late ? 'late' : ''}">${fmtDay(stageDue.due)}</span>` : ''}</p>
    ${a.stage === 'APPROVED' ? '<button class="btn" id="letter">📄 View Permission Letter</button>' : ''}
    <h3>Locations (one NOC per location)</h3>
    <table class="grid slots"><tr><th>Location</th><th>NOC from</th><th>With</th><th>Status</th><th>Due</th>${isStaff ? '<th></th>' : ''}</tr>
      ${a.slots.map((s, i) => `<tr><td>${slotName(s)}</td><td>${DEPTS[s.dept]}</td><td>${s.holder ? DEPTS[s.holder] : '-'}</td><td>${s.status}</td><td>${a.stage === 'DEPTS' ? slotDue(s, i) : '-'}</td>
        ${isStaff ? `<td>${mySlot(s) ? `<button class="btn sm" data-noc="${i}">Grant NOC</button> <select data-to="${i}" style="width:auto">${deptOpts}</select> <button class="btn sm alt" data-share="${i}">Share</button>` : ''}</td>` : ''}</tr>`).join('')}</table>
    <h3>Applicant</h3>
    <p>${esc(a.applicant.name)} (${esc(a.applicant.type)}) · Contact: ${esc(a.applicant.contact)} · +91 ${esc(a.applicant.mobile)} · ${esc(a.applicant.email)}</p>
    <p><b>Period:</b> ${esc(a.from)} to ${esc(a.to)}${a.time ? ', ' + esc(a.time) : ''} · <b>${a.type === 'Film Shooting' ? 'Crew' : 'Audience'}:</b> ${esc(a.audience)} · <b>Fee:</b> ${rs(a.fee)} (${esc(a.txn)})</p>
    <p><b>Requirements:</b> ${esc(a.reqs.join(', ') || 'None')}</p>
    <h3>Documents</h3>
    ${a.docs.length ? `<table class="grid docs"><tr><th>Document</th><th>File</th><th></th></tr>${a.docs.map((doc, i) => `<tr><td>${esc(doc.label)}</td><td>${esc(doc.name)}</td>
      <td>${doc.key || doc.url ? `<button class="btn sm blue" data-doc="${i}">👁 View</button>` : '<span class="muted">No file stored</span>'}</td></tr>`).join('')}</table>
      <div id="doc-view"></div>` : '<p>None</p>'}
    ${isStaff && (act.length || a.slots.some(mySlot)) ? `<h3>Action</h3>
      <label class="${late ? 'req' : ''}">${late ? 'Reason for delay (this file is past its timeline)' : 'Comment (optional)'}</label><textarea id="note" rows="2"></textarea>
      ${role === 'AD' && a.stage === 'AD_FORWARD' ? deptPicker(a) : ''}
      <div class="btns">${act.map(([k, t]) => `<button class="btn ${k === 'urgent' ? 'red' : ''}" data-act="${k}">${t}</button>`).join('')}</div>` : ''}
    <h3>File Movement</h3>
    <ul class="timeline">${[...a.history].reverse().map(h => `<li><b>${staffName(h.by)}</b>: ${esc(h.text)}${h.note ? `<br><i>“${esc(h.note)}”</i>` : ''}<small>${fmt(h.at)}</small></li>`).join('')}</ul>
    ${!isStaff ? `<h3>Notifications (SMS · WhatsApp · Email)</h3><ul class="timeline">${[...a.notes].reverse().map(n => `<li>${esc(n.text)}<small>${fmt(n.at)}</small></li>`).join('')}</ul>` : ''}`);

  const run = (action, opt) => {
    const note = ($('#note') || {}).value || '';
    if (late && action !== 'urgent' && !note.trim()) return toast('This file is past its timeline. Please record the reason for delay first.');
    try {
      const since = Date.now();
      if (action === 'send') opt = { depts: [...document.querySelectorAll('#modal [name=dept]:checked')].map(c => c.value) };
      const msg = advance(a, action, role, { ...opt, note });
      save(); notifyApplicant(a, msg); toastAlerts(a, since); fileView(a, role); pages.dashboard();
    } catch (e) { toast(esc(e.message)); }
  };
  document.querySelectorAll('#modal [data-act]').forEach(b => b.onclick = () => run(b.dataset.act));
  document.querySelectorAll('#modal [data-noc]').forEach(b => b.onclick = () => run('noc', { i: +b.dataset.noc }));
  document.querySelectorAll('#modal [data-share]').forEach(b => b.onclick = () => run('share', { i: +b.dataset.share, to: $(`#modal [data-to="${b.dataset.share}"]`).value }));
  document.querySelectorAll('#modal [data-doc]').forEach(b => b.onclick = () => showDoc(a.docs[b.dataset.doc]));
  const lt = $('#letter'); if (lt) lt.onclick = () => letter(a);
}

// Preview an attachment inside the file view: images and PDFs inline, anything else as a download.
let docURL;
async function showDoc(doc) {
  const box = $('#doc-view');
  let src = doc.url, type = /\.pdf$/i.test(doc.name) ? 'application/pdf' : /\.(png|jpe?g)$/i.test(doc.name) ? 'image/' : '';
  if (doc.key) {
    const file = await getFile(doc.key).catch(() => null);
    if (!file) { box.innerHTML = '<p class="note bad">This file is not stored in this browser.</p>'; return; }
    if (docURL) URL.revokeObjectURL(docURL);
    src = docURL = URL.createObjectURL(file); type = file.type || type;
  }
  box.innerHTML = `<div class="doc-view"><div class="doc-bar"><span><b>${esc(doc.label)}</b> · ${esc(doc.name)}</span>
      <span><a class="btn sm alt" href="${src}" target="_blank" rel="noopener">Open in new tab ↗</a> <a class="btn sm" href="${src}" download="${esc(doc.name)}">⬇ Download</a> <button class="btn sm alt" id="doc-close">✕</button></span></div>
    ${type.startsWith('image/') ? `<img src="${src}" alt="${esc(doc.label)}">` : type === 'application/pdf' ? `<iframe src="${src}" title="${esc(doc.label)}"></iframe>` : '<p class="muted">Preview is not available for this file type. Use Download.</p>'}</div>`;
  $('#doc-close').onclick = () => { box.innerHTML = ''; };
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Dropdown with checkboxes. Location departments are fixed; AD can add more (Police, Fire...).
function deptPicker(a) {
  const fixed = new Set(a.slots.map(s => s.dept));
  return `<details class="dept-pick" open><summary>DEPARTMENTS: send to (select one or more)</summary>
    ${Object.keys(DEPTS).map(k => `<label><input type="checkbox" name="dept" value="${k}" ${fixed.has(k) ? 'checked disabled' : ''}> ${DEPTS[k]}${fixed.has(k) ? ' <span class="muted">(location)</span>' : ''}</label>`).join('')}
  </details>`;
}

// ---------- router ----------
function route() {
  const id = location.hash.slice(1) || 'home';
  const page = document.getElementById(id) && document.getElementById(id).parentElement.tagName === 'MAIN' ? id : 'home';
  escalate();
  document.querySelectorAll('main > section').forEach(s => s.classList.toggle('on', s.id === page));
  const navOf = { shootlocs: 'home', events: 'home', locations: 'home', achievements: 'home', rate: 'how', shooting: 'how', liveevent: 'how', pay: 'how', done: 'how' }[page] || page;
  document.querySelectorAll('.menu > a, .menu > .drop > a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + navOf));
  if (pages[page]) pages[page]();
  closeModal(); setTimeout(() => scrollTo(0, 0)); // after the browser's own jump to the #anchor
}
addEventListener('hashchange', route);
addEventListener('load', () => setTimeout(() => scrollTo(0, 0), 50)); // browser jumps to the #anchor after load
$('#reset').onclick = e => { e.preventDefault(); localStorage.removeItem(KEY); location.hash = 'home'; location.reload(); };
route();
