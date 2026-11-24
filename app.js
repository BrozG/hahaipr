// LEDCS e-Sewa prototype. Everything lives in the browser.
// shortcut: state is in localStorage (no server, no real login/payment/SMS); replace with a backend when going live.

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rs = n => 'Rs. ' + Number(n).toLocaleString('en-IN');
const fmt = t => new Date(t).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const DAY = 864e5;
const loc = id => LOCATIONS.find(l => l.id === id);
const slotName = s => s.loc ? loc(s.loc).name : 'Event (general NOC)';
const staffName = r => r === 'APPLICANT' ? 'Applicant' : (STAFF.find(s => s.role === r) || {}).title || r;

// ---------- state ----------
const KEY = 'ledcs-esewa';
let S = JSON.parse(localStorage.getItem(KEY) || 'null') || seed();
const save = () => localStorage.setItem(KEY, JSON.stringify(S));

function seed() {
  // One older file so the dashboard isn't empty on first open.
  const old = Date.now() - 5 * DAY;
  return {
    user: null, staff: null, cart: [], draft: null,
    apps: [{
      id: 1, fileNo: 'GOS/001/IPR/LEDCS/2025', title: 'Pang Lhabsol Cultural Night', type: 'Live Event', category: 'Cultural Event',
      applicant: { type: 'Organisation / Company', name: 'Sonju Events', contact: 'Karma Bhutia', mobile: '98XXXXXX10', email: 'sonju@example.com' },
      from: '2025-09-10', to: '2025-09-11', time: '18:00', audience: '8000', desc: 'Cultural evening with folk performances.',
      reqs: ['Stage Setup', 'Sound & Lighting'], docs: ['Event Proposal / Concept Note: proposal.pdf'], fee: 25000, txn: 'TXN1709061192',
      urgent: true, stage: 'AD_REVIEW', created: old, moved: old,
      slots: [{ loc: 'paljor', dept: 'GMC', holder: null, status: 'Pending' }],
      history: [{ at: old, by: 'APPLICANT', text: 'Application submitted and fee paid (Rs. 25,000). Forwarded to Additional Director.' }],
      notes: [{ at: old, text: 'Your application GOS/001/IPR/LEDCS/2025 has been received.' }],
    }],
  };
}

// ---------- workflow ----------
const STAGES = {
  AD_REVIEW: 'With Additional Director for review',
  SECY: 'With Secretary for approval',
  AD_FORWARD: 'Approved by Secretary. With AD for forwarding',
  DEPTS: 'With departments for NOC',
  AD_FINAL: 'All NOCs received. With AD',
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
  const before = holders(a);
  const slot = a.slots[opt.i];
  let msg;
  switch (action) {
    case 'forward':
      need(a.stage === 'AD_REVIEW' && role === 'AD', 'Only AD can forward at review stage');
      a.stage = 'SECY'; msg = 'Additional Director has reviewed your application and forwarded it to the Secretary, IPR.'; break;
    case 'approve':
      need(a.stage === 'SECY' && role === 'SECY', 'Only Secretary can approve now');
      a.stage = 'AD_FORWARD'; msg = 'Secretary, IPR has approved your application. Sent back to the Additional Director.'; break;
    case 'send':
      need(a.stage === 'AD_FORWARD' && role === 'AD', 'Only AD can send to departments now');
      // Location departments always get it; AD may add more (e.g. Police, Home) in the same go.
      for (const d of opt.depts || []) if (DEPTS[d] && !a.slots.some(s => s.dept === d)) a.slots.push({ loc: null, dept: d });
      a.slots.forEach(s => { s.holder = s.dept; s.status = 'Pending'; });
      a.stage = 'DEPTS';
      msg = 'Your application has been sent for NOC to: ' + [...new Set(a.slots.map(s => DEPTS[s.dept]))].join(', ') + '.'; break;
    case 'noc':
      need(a.stage === 'DEPTS' && slot && slot.holder === role && slot.status !== 'NOC Granted', 'This location is not with you');
      slot.status = 'NOC Granted';
      msg = `${DEPTS[role]} has granted NOC for ${slotName(slot)}.`;
      if (a.slots.every(s => s.status === 'NOC Granted')) { a.stage = 'AD_FINAL'; msg += ' All NOCs received. File returned to the Additional Director.'; }
      break;
    case 'share':
      need(a.stage === 'DEPTS' && slot && slot.holder === role && DEPTS[opt.to] && opt.to !== role, 'Cannot share this location');
      slot.holder = opt.to;
      msg = `${DEPTS[role]} has shared the file for ${slotName(slot)} with ${DEPTS[opt.to]}.`; break;
    case 'issue':
      need(a.stage === 'AD_FINAL' && role === 'AD', 'Only AD can issue the permission now');
      a.stage = 'APPROVED'; a.letterNo = `${String(a.id).padStart(4, '0')}/IPR/${new Date().getFullYear()}`; a.issued = Date.now();
      msg = 'Permission granted. Your permission letter is ready under My Application.'; break;
    case 'urgent':
      need(role === 'AD' && a.stage !== 'APPROVED', 'Only AD can flag urgency');
      a.urgent = !a.urgent; msg = null; break;
    default: throw new Error('Unknown action ' + action);
  }
  a.moved = Date.now();
  a.history.push({ at: a.moved, by: role, text: msg || (a.urgent ? 'Flagged as URGENT.' : 'Urgent flag removed.'), note: opt.note || '' });
  if (msg) a.notes.push({ at: a.moved, text: msg });
  holders(a).filter(r => !before.includes(r)).forEach(r => alertOfficer(a, r, `File ${a.fileNo} (${a.title}) received from ${staffName(role)} for your action.`));
  return msg;
}

// Officer alert (SMS / WhatsApp / Email), kept on the file so each officer's inbox can list it.
function alertOfficer(a, role, text) {
  (a.alerts = a.alerts || []).push({ at: Date.now(), to: role, text });
}

// Self-check of the approval chain; result shows in the browser console.
(function selfCheck() {
  const a = { id: 9, stage: 'AD_REVIEW', slots: [{ loc: 'paljor', dept: 'GMC' }, { loc: 'changu', dept: 'FOREST' }], history: [], notes: [] };
  const throws = f => { try { f(); return false; } catch { return true; } };
  console.assert(throws(() => advance(a, 'approve', 'SECY')), 'Secretary must not act before AD');
  advance(a, 'forward', 'AD'); advance(a, 'approve', 'SECY'); advance(a, 'send', 'AD', { depts: ['POLICE'] });
  console.assert(holders(a).join() === 'GMC,FOREST,POLICE', 'location depts + extra dept hold the file at once');
  console.assert(['SECY', 'AD', 'GMC', 'FOREST', 'POLICE'].every(r => a.alerts.some(x => x.to === r)), 'each officer alerted on receipt');
  advance(a, 'noc', 'POLICE', { i: 2 });
  advance(a, 'share', 'FOREST', { i: 1, to: 'TOURISM' });
  console.assert(throws(() => advance(a, 'noc', 'FOREST', { i: 1 })), 'shared slot left FOREST');
  advance(a, 'noc', 'GMC', { i: 0 });
  console.assert(a.stage === 'DEPTS', 'still waiting on one NOC');
  advance(a, 'noc', 'TOURISM', { i: 1 });
  console.assert(a.stage === 'AD_FINAL' && holders(a)[0] === 'AD', 'returns to AD after all NOCs');
  advance(a, 'issue', 'AD');
  console.assert(a.stage === 'APPROVED' && holders(a).length === 0 && a.notes.length === 8, 'approved, applicant notified each step');
  console.log('LEDCS workflow self-check done');
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
function modal(html) { $('#modal-body').innerHTML = html; $('#modal').hidden = false; }
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
       <p>The 360° video for this venue has not been linked yet.</p>
       <a class="btn" target="_blank" rel="noopener" href="https://www.youtube.com/results?search_query=${q}">Watch 360° videos on YouTube ↗</a>`));
}

// ---------- pages ----------
let locDistrict = 'All', evDistrict = 'All', dbTab = 'Filmable', dbCat = 'All', dashTab = 'pen', payMode = 'Debit Card';

const pages = {
  locations() {
    filterBar($('#loc-filter'), DISTRICTS.filter(d => LOCATIONS.some(l => l.district === d)), locDistrict, d => { locDistrict = d; pages.locations(); });
    $('#loc-list').innerHTML = LOCATIONS.filter(l => locDistrict === 'All' || l.district === locDistrict).map(l => `
      <div class="card"><img src="${l.img}" alt="">
        <div class="pad"><h3>${l.name}</h3>
          <p><span class="tag">${l.district} District</span> <span class="tag vr">360° VR</span></p>
          <p class="muted">Best season: ${l.season}<br>Capacity: ${l.capacity} · NOC: ${DEPTS[l.dept]}</p>
          <div class="btns"><button class="btn sm blue" data-vr="${l.id}">VR Recce 360°</button>
          <button class="btn sm alt" data-add="${l.id}">${S.cart.includes(l.id) ? '✓ In cart' : 'Add to application'}</button></div>
        </div></div>`).join('');
    $('#loc-list').querySelectorAll('[data-vr]').forEach(b => b.onclick = () => openVR(loc(b.dataset.vr)));
    $('#loc-list').querySelectorAll('[data-add]').forEach(b => b.onclick = () => { toggleCart(b.dataset.add); pages.locations(); });
  },

  achievements() {
    $('#ach-list').innerHTML = ACHIEVEMENTS.map(a => `<div class="split"><img src="${a.img}" alt=""><div><h3>${a.title}</h3><p>${a.desc}</p></div></div>`).join('');
  },

  events() {
    filterBar($('#ev-filter'), DISTRICTS, evDistrict, d => { evDistrict = d; pages.events(); });
    const list = EVENTS.filter(e => evDistrict === 'All' || e.district === evDistrict);
    $('#ev-list').innerHTML = list.length ? list.map((e, i) => `
      <div class="card"><img src="${e.img}" alt="">
        <div class="pad"><h3>${e.title}</h3>
          <p><span class="tag">${e.district}</span> <span class="tag vr">VR mode</span></p>
          <p class="muted">📍 ${e.venue} · 📅 ${e.date}</p><p>${e.desc}</p>
          <div class="btns"><button class="btn sm blue" data-ev="${EVENTS.indexOf(e)}">${hasPass(e) ? '▶ Watch in VR' : `Watch in VR · ${rs(e.vrPrice)}`}</button></div>
        </div></div>`).join('') : '<p class="muted">No events listed in this district yet.</p>';
    $('#ev-list').querySelectorAll('[data-ev]').forEach(b => b.onclick = () => watchEvent(EVENTS[b.dataset.ev]));
  },

  rate() {
    $('#rate-table').innerHTML = '<tr><th>Location</th><th>District</th><th>NOC from</th><th>Fee</th></tr>' +
      LOCATIONS.map(l => `<tr><td>${l.name}</td><td>${l.district}</td><td>${DEPTS[l.dept]}</td><td>${rs(l.fee)}</td></tr>`).join('');
  },

  apply() {
    if (!S.user) return loginForm($('#apply-body'), 'apply');
    const d = S.draft || {};
    const v = k => esc(d[k] || '');
    const docs = ['Event Proposal / Concept Note', 'Venue Layout / Site Plan', 'Organiser / Company Registration', 'ID Proof of Applicant', 'NOC / Consent from Co-organiser (if any)', 'Other Supporting Documents'];
    const reqs = ['Stage Setup', 'Sound & Lighting', 'Power Supply', 'Temporary Structure (Tent / Stall)', 'Road Closure / Traffic Management', 'Security / Crowd Management', 'Drone Filming'];
    const opt = (list, cur) => list.map(o => `<option ${o === cur ? 'selected' : ''}>${o}</option>`).join('');
    $('#apply-body').innerHTML = `
      <div class="who"><span>Logged in as <b>${esc(S.user.name)}</b></span><button class="btn sm alt" id="logout">Logout</button></div><br>
      <div class="form-wrap">
        <aside class="form-side"><h3>LIVE EVENT PERMISSION</h3>
          <ol><li>Event Details</li><li>Organiser Details</li><li>Venue &amp; Schedule</li><li>Event Requirements</li><li>Documents Upload</li><li>Declaration &amp; Submit</li></ol></aside>
        <form class="form-main" id="app-form">
          <h2 style="margin-top:0">Live Event Permission: Online Application</h2>
          <p class="muted">Apply for permission to organise a live event or shoot in Sikkim (concert, festival, sports, cultural event, exhibition, film).</p>
          <fieldset class="fs"><legend>1. Event Details</legend>
            <div class="row"><div style="grid-column:span 2"><label class="req">Event Title / Name</label><input name="title" required value="${v('title')}" placeholder="e.g. Sikkim Music Fest 2026"></div>
              <div><label class="req">Permission Type</label><select name="type" required>${opt(['Live Event', 'Film Shooting'], d.type)}</select></div>
              <div><label class="req">Event Category</label><select name="category" required><option value="">-- Select --</option>${opt(['Concert', 'Festival', 'Sports', 'Cultural Event', 'Exhibition', 'Feature Film', 'Documentary', 'Music Video', 'Web Series'], d.category)}</select></div></div>
            <div class="row"><div style="grid-column:span 2"><label class="req">Brief Description</label><textarea name="desc" required rows="2">${v('desc')}</textarea></div>
              <div><label class="req">Expected Audience / Crew Size</label><input name="audience" type="number" min="1" required value="${v('audience')}"></div></div>
          </fieldset>
          <fieldset class="fs"><legend>2. Organiser Details</legend>
            <div class="checks" style="margin-bottom:12px">${['Individual', 'Organisation / Company', 'Production House', 'NGO / Society'].map(t => `<label><input type="radio" name="atype" value="${t}" required ${d.atype === t ? 'checked' : ''}>${t}</label>`).join('')}</div>
            <div class="row"><div><label class="req">Name of Applicant / Organisation</label><input name="aname" required value="${esc(d.aname || S.user.name)}"></div>
              <div><label class="req">Contact Person</label><input name="contact" required value="${v('contact')}"></div>
              <div><label class="req">Mobile Number (+91)</label><input name="mobile" required pattern="[0-9]{10}" title="10 digit mobile number" value="${v('mobile')}"></div>
              <div><label class="req">Email ID</label><input name="email" type="email" required value="${esc(d.email || S.user.email)}"></div></div>
            <div class="row"><div><label class="req">Government ID Type</label><select name="idtype" required><option value="">-- Select --</option>${opt(['Aadhaar', 'Passport', 'Voter ID', 'PAN'], d.idtype)}</select></div>
              <div><label class="req">Government ID Number</label><input name="idno" required value="${v('idno')}"></div>
              <div><label class="req">Address</label><input name="address" required value="${v('address')}"></div></div>
          </fieldset>
          <fieldset class="fs"><legend>3. Venue &amp; Schedule: add one or more locations to the cart</legend>
            <p class="muted" style="margin-top:0">Each location is cleared by its own department. Add every place you will use.</p>
            <div class="loc-pick">${LOCATIONS.map(l => `
              <div class="card ${S.cart.includes(l.id) ? 'in-cart' : ''}"><img src="${l.img}" alt="">
                <div class="pad"><b>${l.name}</b><br><span class="muted">${l.district} · ${rs(l.fee)}<br>NOC: ${DEPTS[l.dept]}</span>
                <div class="btns"><button type="button" class="btn sm ${S.cart.includes(l.id) ? 'red' : ''}" data-add="${l.id}">${S.cart.includes(l.id) ? 'Remove' : 'Add to cart'}</button>
                <button type="button" class="btn sm alt" data-vr="${l.id}">360°</button></div></div></div>`).join('')}</div>
            <div class="row" style="margin-top:14px"><div><label class="req">Start Date</label><input type="date" name="from" required value="${v('from')}"></div>
              <div><label class="req">End Date</label><input type="date" name="to" required value="${v('to')}"></div>
              <div><label class="req">Event Time</label><input type="time" name="time" required value="${v('time')}"></div></div>
          </fieldset>
          <fieldset class="fs"><legend>4. Event Requirements</legend>
            <div class="checks">${reqs.map(r => `<label><input type="checkbox" name="reqs" value="${r}" ${(d.reqs || []).includes(r) ? 'checked' : ''}>${r}</label>`).join('')}</div>
          </fieldset>
          <fieldset class="fs"><legend>5. Upload Documents (PDF, JPG, PNG, max 10 MB each)</legend>
            <div class="row">${docs.map((t, i) => { const had = (d.docs || []).find(x => x.startsWith(t + ':')); return `<div><label class="${i < 4 ? 'req' : ''}">${t}</label><input type="file" name="doc${i}" data-label="${t}" accept=".pdf,.jpg,.jpeg,.png" ${i < 4 && !had ? 'required' : ''}>${had ? `<span class="muted">✓ ${esc(had.slice(t.length + 2))}</span>` : ''}</div>`; }).join('')}</div>
          </fieldset>
          <fieldset class="fs"><legend>6. Declaration</legend>
            <label style="font-weight:400"><input type="checkbox" required> I hereby declare that the information provided above is true and correct to the best of my knowledge. I agree to comply with all applicable laws, rules and guidelines of the Government of Sikkim for the successful conduct of the event.</label>
          </fieldset>
          <div class="cart-bar"><span>🛒 ${S.cart.length} location(s) in cart · Total ${rs(cartTotal())}</span>
            <button class="btn" style="background:var(--saffron)">Proceed to Cart &amp; Payment →</button></div>
        </form>
      </div>`;
    $('#logout').onclick = () => { S.user = null; save(); route(); };
    const form = $('#app-form');
    const keep = () => { S.draft = readForm(form); save(); };
    form.querySelectorAll('[data-add]').forEach(b => b.onclick = () => { keep(); toggleCart(b.dataset.add); pages.apply(); });
    form.querySelectorAll('[data-vr]').forEach(b => b.onclick = () => openVR(loc(b.dataset.vr)));
    form.onsubmit = e => {
      e.preventDefault();
      if (!S.cart.length) return toast('Please add at least one location to the cart.');
      if (form.to.value < form.from.value) return toast('End date cannot be before start date.');
      keep(); location.hash = 'cart';
    };
  },

  cart() {
    if (!S.user) return loginForm($('#cart-body'), 'cart');
    if (!S.draft) { $('#cart-body').innerHTML = '<p>Please <a href="#apply">fill the application form</a> first.</p>'; return; }
    const total = cartTotal();
    const modes = ['Cash', 'Cheque / DD', 'RTGS / NEFT', 'Net Banking', 'Debit Card', 'Credit Card', 'UPI'];
    const txn = S.txn || (S.txn = 'TXN' + Date.now().toString().slice(-10));
    const fields = { 'Debit Card': 'card', 'Credit Card': 'card', 'UPI': 'upi', 'Net Banking': 'bank' }[payMode];
    $('#cart-body').innerHTML = `
      <h2 class="page-title">Cart &amp; Payment</h2>
      <p class="lead">Application: <b>${esc(S.draft.title)}</b>. Review your locations and pay the permission fee.</p>
      <table class="grid"><tr><th>Location</th><th>District</th><th>NOC from</th><th>Fee</th><th></th></tr>
        ${S.cart.map(id => { const l = loc(id); return `<tr><td>${l.name}</td><td>${l.district}</td><td>${DEPTS[l.dept]}</td><td>${rs(l.fee)}</td><td><button class="btn sm red" data-rm="${id}">Remove</button></td></tr>`; }).join('')}
        <tr><th colspan="3">Total</th><th colspan="2">${rs(total)}</th></tr></table>
      <p><a href="#apply">← Back to application / add more locations</a></p>
      <h3>Select Payment Mode</h3>
      <div class="pay"><div class="pay-modes">${modes.map(m => `<button class="${m === payMode ? 'on' : ''}">${m}</button>`).join('')}</div>
        <form class="pay-body" id="pay-form">
          <table class="grid"><tr><td>Transaction ID</td><td>${txn}</td></tr><tr><td>Merchant Name</td><td><b>IPR REVENUE HEAD</b></td></tr>
            <tr><td>Amount</td><td>${rs(total)}</td></tr><tr><td>Convenience Fee</td><td>0.00</td></tr><tr><td>GST</td><td>0.00</td></tr><tr><th>Total Bill Amount</th><th>${rs(total)}</th></tr></table><br>
          ${fields === 'card' ? '<div class="row"><div><label class="req">Card Number</label><input required pattern="[0-9 ]{12,19}" placeholder="XXXX XXXX XXXX XXXX"></div><div><label class="req">PIN</label><input required type="password" maxlength="6"></div></div>' : ''}
          ${fields === 'upi' ? '<div class="row"><div><label class="req">UPI ID</label><input required placeholder="name@bank"></div></div>' : ''}
          ${fields === 'bank' ? '<div class="row"><div><label class="req">Bank</label><select required><option value="">-- Select --</option><option>State Bank of India</option><option>State Bank of Sikkim</option><option>ICICI Bank</option></select></div></div>' : ''}
          ${!fields ? '<p class="muted">Pay at the Film Section, IPR Department, Soochna Bhawan and enter the receipt / challan number.</p><div class="row"><div><label class="req">Receipt / Challan No.</label><input required></div></div>' : ''}
          <button class="btn" style="background:var(--saffron)" ${S.cart.length ? '' : 'disabled'}>Pay ${rs(total)} &amp; Submit Application</button>
          <p class="muted">🔒 Demo payment. No money is charged.</p>
        </form></div>`;
    $('#cart-body').querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { toggleCart(b.dataset.rm); pages.cart(); });
    $('#cart-body').querySelectorAll('.pay-modes button').forEach(b => b.onclick = () => { payMode = b.textContent; pages.cart(); });
    $('#pay-form').onsubmit = e => { e.preventDefault(); submitApplication(txn, total); };
  },

  myapp() {
    if (!S.user) return loginForm($('#myapp-body'), 'myapp');
    const mine = S.apps.filter(a => a.owner === S.user.name);
    $('#myapp-body').innerHTML = `
      <div class="who"><span>Logged in as <b>${esc(S.user.name)}</b></span><button class="btn sm alt" id="logout">Logout</button></div>
      <h2 class="page-title">My Application</h2><h3>Track Application Status</h3>
      ${mine.length ? `<table class="grid"><tr><th>Application</th><th>File No.</th><th>Submission Date</th><th>Status</th><th>Currently with</th></tr>
        ${mine.map(a => `<tr class="click" data-id="${a.id}"><td><b>${esc(a.title)}</b><br><span class="muted">${a.type} (${esc(a.category)})</span></td><td>${a.fileNo}</td><td>${fmt(a.created)}</td>
          <td>${a.stage === 'APPROVED' ? '<span class="tag">✓ Permission granted</span>' : STAGES[a.stage]}</td><td>${holders(a).map(staffName).join(', ') || '-'}</td></tr>`).join('')}</table>
        <p class="muted">Click an application to see its file movement, notifications and permission letter.</p>`
      : '<p>No applications yet. <a href="#apply">Apply Online</a></p>'}`;
    $('#logout').onclick = () => { S.user = null; save(); route(); };
    $('#myapp-body').querySelectorAll('[data-id]').forEach(r => r.onclick = () => fileView(S.apps.find(a => a.id == r.dataset.id), 'APPLICANT'));
  },

  database() {
    const tabs = $('#db-tabs');
    tabs.innerHTML = Object.keys(DATABASE).map(t => `<button class="${t === dbTab ? 'on' : ''}">${t}</button>`).join('');
    tabs.querySelectorAll('button').forEach(b => b.onclick = () => { dbTab = b.textContent; dbCat = 'All'; pages.database(); });
    const cats = DATABASE[dbTab];
    const rows = Object.entries(cats).flatMap(([c, list]) => list.map(p => ({ ...p, cat: c }))).filter(p => dbCat === 'All' || p.cat === dbCat);
    $('#db-body').innerHTML = `<div class="filter" id="db-cats"></div>
      <table class="grid"><tr><th>Name</th><th>Category</th><th>District</th><th>Skills / Service</th></tr>
      ${rows.map((p, i) => `<tr class="click" data-i="${i}"><td><b>${p.name}</b></td><td>${p.cat}</td><td>${p.district}</td><td>${p.skills}</td></tr>`).join('')}</table>`;
    filterBar($('#db-cats'), Object.keys(cats), dbCat, c => { dbCat = c; pages.database(); });
    $('#db-body').querySelectorAll('[data-i]').forEach(r => r.onclick = () => profile(rows[r.dataset.i]));
  },

  dashboard() {
    const el = $('#dash');
    if (!S.staff) {
      el.innerHTML = `<form class="login" id="staff-login"><h2>Department Login</h2>
        <label>Officer</label><select name="role">${STAFF.map(s => `<option value="${s.role}">${s.name}, ${s.title}</option>`).join('')}</select><br><br>
        <label>Password</label><input type="password" required placeholder="Any password (demo)"><br><br>
        <button class="btn" style="width:100%">Login</button></form>`;
      $('#staff-login').onsubmit = e => { e.preventDefault(); S.staff = e.target.role.value; save(); pages.dashboard(); };
      return;
    }
    const r = S.staff, me = STAFF.find(s => s.role === r);
    const mine = S.apps.filter(a => holders(a).includes(r));
    const sets = {
      out: mine.filter(a => Date.now() - a.moved > 3 * DAY),
      pen: mine.filter(a => Date.now() - a.moved <= 3 * DAY),
      com: S.apps.filter(a => !holders(a).includes(r) && a.history.some(h => h.by === r)),
      urg: mine.filter(a => a.urgent),
    };
    const card = (k, cls, label) => `<button class="stat ${cls} ${dashTab === k ? 'on' : ''}" data-tab="${k}"><b>${sets[k].length}</b>${label}</button>`;
    const list = sets[dashTab];
    el.innerHTML = `
      <div class="who"><span><b>${me.name}</b>, ${me.title}</span><button class="btn sm alt" id="slogout">Logout</button></div>
      <h2 class="page-title">Workflow Dashboard <small class="muted">Summary &amp; Statistics</small></h2>
      <div class="stats">${card('out', 's-out', 'Outstanding Requests')}${card('pen', 's-pen', 'Pending Tasks')}${card('com', 's-com', 'Completed')}${card('urg', 's-urg', 'Urgent')}</div>
      ${inbox(r)}
      ${list.length ? `<table class="grid"><tr><th>Sl.</th><th>File No.</th><th>Subject</th><th>Applicant</th><th>Status</th><th>Last forwarded by</th><th>Priority</th><th>Date</th></tr>
        ${list.map((a, i) => { const last = a.history[a.history.length - 1]; return `<tr class="click" data-id="${a.id}"><td>${i + 1}.</td><td style="color:var(--red)">${a.fileNo}</td>
          <td>${a.type.toUpperCase()} PERMISSION<br><span class="muted">${esc(a.title)}</span></td><td>${esc(a.applicant.name)}</td><td>${STAGES[a.stage]}</td>
          <td>${staffName(last.by)}</td><td>${a.urgent ? '<span class="tag urgent">URGENT</span>' : 'Normal'}</td><td>${fmt(a.moved).split(',')[0]}</td></tr>`; }).join('')}</table>`
      : '<p class="muted">No files in this list.</p>'}`;
    $('#slogout').onclick = () => { S.staff = null; save(); pages.dashboard(); };
    el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { dashTab = b.dataset.tab; pages.dashboard(); });
    el.querySelectorAll('[data-id]').forEach(row => row.onclick = () => fileView(S.apps.find(a => a.id == row.dataset.id), r));
  },
};

// ---------- shared pieces ----------
function inbox(role) {
  const msgs = S.apps.flatMap(a => (a.alerts || []).filter(x => x.to === role)).sort((x, y) => y.at - x.at).slice(0, 5);
  return `<details class="inbox"><summary>📩 Messages (SMS · WhatsApp · Email): ${msgs.length}</summary>
    ${msgs.length ? `<ul class="timeline">${msgs.map(m => `<li>${esc(m.text)}<small>${fmt(m.at)}</small></li>`).join('')}</ul>` : '<p class="muted">No messages.</p>'}</details>`;
}

function cartTotal() { return S.cart.reduce((t, id) => t + loc(id).fee, 0); }

function toggleCart(id) {
  const l = loc(id);
  if (S.cart.includes(id)) { S.cart = S.cart.filter(x => x !== id); toast(`${l.name} removed from cart.`); }
  else { S.cart.push(id); toast(`🛒 ${l.name} added to cart. NOC from ${DEPTS[l.dept]}.`); }
  save();
}

function readForm(form) {
  const d = {};
  new FormData(form).forEach((v, k) => {
    if (v instanceof File) return; // files are listed separately below
    if (k === 'reqs') (d.reqs = d.reqs || []).push(v); else d[k] = v;
  });
  // shortcut: only file names are kept (no storage in a prototype); upload to the server when going live.
  const prev = (S.draft && S.draft.docs) || [];
  d.docs = [...form.querySelectorAll('input[type=file]')].map(i => i.files[0] ? `${i.dataset.label}: ${i.files[0].name}` : prev.find(x => x.startsWith(i.dataset.label + ':'))).filter(Boolean);
  return d;
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

// ---------- VR pass for public events ----------
const hasPass = e => S.user && (S.passes || []).some(p => p.user === S.user.email && p.event === e.title);

function watchEvent(e) {
  if (hasPass(e)) return openVR(e);
  if (!S.user) { modal('<p class="muted" style="text-align:center">Login to watch this event in VR.</p><div id="m-login"></div>'); return loginForm($('#m-login'), () => { pages.events(); watchEvent(e); }); }
  let mode = 'UPI';
  const draw = () => {
    const field = { UPI: '<label class="req">UPI ID</label><input required placeholder="name@bank">', 'Debit Card': '<label class="req">Card Number</label><input required pattern="[0-9 ]{12,19}" placeholder="XXXX XXXX XXXX XXXX">', 'Credit Card': '<label class="req">Card Number</label><input required pattern="[0-9 ]{12,19}" placeholder="XXXX XXXX XXXX XXXX">', 'Net Banking': '<label class="req">Bank</label><select required><option value="">-- Select --</option><option>State Bank of India</option><option>State Bank of Sikkim</option><option>ICICI Bank</option></select>' }[mode];
    modal(`<h2 style="margin-top:0">VR Viewing Pass</h2>
      <div class="split" style="padding:0"><img src="${e.img}" alt=""><div>
        <h3>${esc(e.title)}</h3><p class="muted">📍 ${esc(e.venue)} · 📅 ${esc(e.date)}</p>
        <table class="grid"><tr><td>Pass holder</td><td>${esc(S.user.name)}</td></tr><tr><td>Amount</td><td>${rs(e.vrPrice)}</td></tr><tr><th>Total</th><th>${rs(e.vrPrice)}</th></tr></table>
      </div></div>
      <div class="tabs">${['UPI', 'Debit Card', 'Credit Card', 'Net Banking'].map(m => `<button type="button" class="${m === mode ? 'on' : ''}">${m}</button>`).join('')}</div>
      <form id="vr-pay">${field}<br><br><button class="btn" style="background:var(--saffron)">Pay ${rs(e.vrPrice)} &amp; Watch</button>
      <p class="muted">🔒 Demo payment. No money is charged.</p></form>`);
    document.querySelectorAll('#modal .tabs button').forEach(b => b.onclick = () => { mode = b.textContent; draw(); });
    $('#vr-pay').onsubmit = ev => {
      ev.preventDefault();
      (S.passes = S.passes || []).push({ user: S.user.email, event: e.title, paid: e.vrPrice, at: Date.now() });
      save(); pages.events();
      toast(`<b>SMS · WhatsApp · Email</b> sent to ${esc(S.user.email)}<br>Payment of ${rs(e.vrPrice)} received. Your VR pass for ${esc(e.title)} is active.`);
      openVR(e);
    };
  };
  draw();
}

function submitApplication(txn, total) {
  const d = S.draft, id = Math.max(0, ...S.apps.map(a => a.id)) + 1, now = Date.now();
  const a = {
    id, fileNo: `GOS/${String(id).padStart(3, '0')}/IPR/LEDCS/${new Date().getFullYear()}`, owner: S.user.name,
    title: d.title, type: d.type, category: d.category, desc: d.desc, audience: d.audience,
    applicant: { type: d.atype, name: d.aname, contact: d.contact, mobile: d.mobile, email: d.email, idtype: d.idtype, idno: d.idno, address: d.address },
    from: d.from, to: d.to, time: d.time, reqs: d.reqs || [], docs: d.docs || [], fee: total, txn,
    urgent: false, stage: 'AD_REVIEW', created: now, moved: now,
    slots: S.cart.map(l => ({ loc: l, dept: loc(l).dept, holder: null, status: 'Pending' })),
    history: [{ at: now, by: 'APPLICANT', text: `Application submitted and fee paid (${rs(total)}, ${txn}). Forwarded to Additional Director.` }],
    notes: [],
  };
  const msg = `Your application ${a.fileNo} has been received. Fee of ${rs(total)} paid (${txn}).`;
  a.notes.push({ at: now, text: msg });
  alertOfficer(a, 'AD', `New application ${a.fileNo} (${a.title}) submitted by ${a.applicant.name}. Fee paid.`);
  S.apps.push(a); S.cart = []; S.draft = null; S.txn = null; save();
  notifyApplicant(a, msg); toastAlerts(a, now);
  location.hash = 'myapp';
}

// File detail. The same view serves the applicant (read-only) and officers (with actions).
function fileView(a, role) {
  const isStaff = role !== 'APPLICANT';
  const deptOpts = Object.keys(DEPTS).filter(k => k !== role).map(k => `<option value="${k}">${DEPTS[k]}</option>`).join('');
  const act = [];
  if (isStaff) {
    if (role === 'AD' && a.stage === 'AD_REVIEW') act.push(['forward', 'Forward to Secretary']);
    if (role === 'SECY' && a.stage === 'SECY') act.push(['approve', 'Approve & return to AD']);
    if (role === 'AD' && a.stage === 'AD_FORWARD') act.push(['send', 'Send to selected departments']);
    if (role === 'AD' && a.stage === 'AD_FINAL') act.push(['issue', 'Issue Permission Letter']);
    if (role === 'AD' && a.stage !== 'APPROVED') act.push(['urgent', a.urgent ? 'Remove urgent flag' : 'Flag as URGENT']);
  }
  const mySlot = s => isStaff && a.stage === 'DEPTS' && s.holder === role && s.status !== 'NOC Granted';
  modal(`
    <h2 style="margin-top:0">${esc(a.title)} ${a.urgent ? '<span class="tag urgent">URGENT</span>' : ''}</h2>
    <p class="muted">${a.fileNo} · ${a.type} · ${esc(a.category)} · Submitted ${fmt(a.created)}</p>
    <p><b>Status:</b> ${STAGES[a.stage]}${holders(a).length ? ` · <b>Currently with:</b> ${holders(a).map(staffName).join(', ')}` : ''}</p>
    ${a.stage === 'APPROVED' ? '<button class="btn" id="letter">📄 View Permission Letter</button>' : ''}
    <h3>Locations (one NOC per location)</h3>
    <table class="grid slots"><tr><th>Location</th><th>NOC from</th><th>With</th><th>Status</th>${isStaff ? '<th></th>' : ''}</tr>
      ${a.slots.map((s, i) => `<tr><td>${slotName(s)}</td><td>${DEPTS[s.dept]}</td><td>${s.holder ? DEPTS[s.holder] : '-'}</td><td>${s.status}</td>
        ${isStaff ? `<td>${mySlot(s) ? `<button class="btn sm" data-noc="${i}">Grant NOC</button> <select data-to="${i}" style="width:auto">${deptOpts}</select> <button class="btn sm alt" data-share="${i}">Share</button>` : ''}</td>` : ''}</tr>`).join('')}</table>
    <h3>Applicant</h3>
    <p>${esc(a.applicant.name)} (${esc(a.applicant.type)}) · Contact: ${esc(a.applicant.contact)} · +91 ${esc(a.applicant.mobile)} · ${esc(a.applicant.email)}</p>
    <p><b>Period:</b> ${esc(a.from)} to ${esc(a.to)}, ${esc(a.time)} · <b>Audience / crew:</b> ${esc(a.audience)} · <b>Fee:</b> ${rs(a.fee)} (${esc(a.txn)})</p>
    <p><b>Requirements:</b> ${esc(a.reqs.join(', ') || 'None')}</p>
    <p><b>Documents:</b> ${a.docs.length ? a.docs.map(esc).join('<br>') : 'None'}</p>
    ${isStaff && (act.length || a.slots.some(mySlot)) ? `<h3>Action</h3><label>Comment (optional)</label><textarea id="note" rows="2"></textarea>
      ${role === 'AD' && a.stage === 'AD_FORWARD' ? deptPicker(a) : ''}
      <div class="btns">${act.map(([k, t]) => `<button class="btn ${k === 'urgent' ? 'red' : ''}" data-act="${k}">${t}</button>`).join('')}</div>` : ''}
    <h3>File Movement</h3>
    <ul class="timeline">${[...a.history].reverse().map(h => `<li><b>${staffName(h.by)}</b>: ${esc(h.text)}${h.note ? `<br><i>“${esc(h.note)}”</i>` : ''}<small>${fmt(h.at)}</small></li>`).join('')}</ul>
    ${!isStaff ? `<h3>Notifications (SMS · WhatsApp · Email)</h3><ul class="timeline">${[...a.notes].reverse().map(n => `<li>${esc(n.text)}<small>${fmt(n.at)}</small></li>`).join('')}</ul>` : ''}`);

  const run = (action, opt) => {
    try {
      const since = Date.now();
      if (action === 'send') opt = { depts: [...document.querySelectorAll('#modal [name=dept]:checked')].map(c => c.value) };
      const msg = advance(a, action, role, { ...opt, note: ($('#note') || {}).value });
      save(); notifyApplicant(a, msg); toastAlerts(a, since); fileView(a, role); pages.dashboard();
    } catch (e) { toast(esc(e.message)); }
  };
  document.querySelectorAll('#modal [data-act]').forEach(b => b.onclick = () => run(b.dataset.act));
  document.querySelectorAll('#modal [data-noc]').forEach(b => b.onclick = () => run('noc', { i: +b.dataset.noc }));
  document.querySelectorAll('#modal [data-share]').forEach(b => b.onclick = () => run('share', { i: +b.dataset.share, to: $(`#modal [data-to="${b.dataset.share}"]`).value }));
  const lt = $('#letter'); if (lt) lt.onclick = () => letter(a);
}

// Dropdown with checkboxes (slide 21). Location departments are fixed; AD can add more.
function deptPicker(a) {
  const fixed = new Set(a.slots.map(s => s.dept));
  return `<details class="dept-pick" open><summary>DEPARTMENTS: send to (select one or more)</summary>
    ${Object.keys(DEPTS).map(k => `<label><input type="checkbox" name="dept" value="${k}" ${fixed.has(k) ? 'checked disabled' : ''}> ${DEPTS[k]}${fixed.has(k) ? ' <span class="muted">(location)</span>' : ''}</label>`).join('')}
  </details>`;
}

function letter(a) {
  const depts = [...new Set(a.slots.map(s => DEPTS[s.dept]))].join(', ');
  modal(`<div class="letter">
    <header><img src="assets/logo.png" alt=""><h3 style="text-decoration:none;margin:6px 0">DEPARTMENT OF INFORMATION &amp; PUBLIC RELATIONS<br>GOVERNMENT OF SIKKIM<br>SOOCHNA BHAWAN, GANGTOK 737101</h3></header>
    <p style="display:flex;justify-content:space-between"><span>No. ${a.letterNo}</span><span>Date: ${new Date(a.issued).toLocaleDateString('en-IN')}</span></p>
    <h3>PERMISSION FOR ${a.type.toUpperCase()}</h3>
    <p>The Department of Information &amp; Public Relations, Government of Sikkim hereby issues permission to <b>${esc(a.applicant.name)}</b> for <b>${esc(a.title)}</b>, subject to the following conditions:</p>
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
  </div><button class="btn" onclick="print()">🖨 Print / Save as PDF</button>`);
}

function profile(p) {
  const initials = p.name.split(' ').map(w => w[0]).slice(0, 2).join('');
  modal(`<div class="profile"><aside><div class="avatar">${initials}</div><h3>${p.name}</h3><p>${p.cat}</p><p>${p.district}, Sikkim</p>
    <p>📞 ${p.phone}</p></aside>
    <div class="body"><h4>ABOUT</h4><p>${p.about}</p><h4>SKILLS / SERVICES</h4><p>${p.skills}</p>
    <h4>CATEGORY</h4><p>${dbTab} · ${p.cat}</p></div></div>`);
}

// ---------- router ----------
function route() {
  const id = location.hash.slice(1) || 'home';
  const page = document.getElementById(id) ? id : 'home';
  document.querySelectorAll('main > section').forEach(s => s.classList.toggle('on', s.id === page));
  const navOf = { films: 'home', locations: 'home', achievements: 'home', rate: 'how', apply: 'how', cart: 'how' }[page] || page;
  document.querySelectorAll('.menu > a, .menu > .drop > a').forEach(a => a.classList.toggle('on', a.getAttribute('href') === '#' + navOf));
  if (pages[page]) pages[page]();
  closeModal(); setTimeout(() => scrollTo(0, 0)); // after the browser's own jump to the #anchor
}
addEventListener('hashchange', route);
$('#reset').onclick = e => { e.preventDefault(); localStorage.removeItem(KEY); location.hash = 'home'; location.reload(); };
route();
