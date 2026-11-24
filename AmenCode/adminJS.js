/* Café Centígrado — admin login + admin panel (accounts, menu, order queue).
   Used by adminLogin.html (the sign in form) and the three panel pages: adminAccounts.html, adminMenu.html, adminOrders.html.
   DEMO ONLY: everything is saved in localStorage (no server), so this is not real security.
   Wrapped in a function so it can load next to page.js without clashing names. */
(() => {
  const $ = (id) => document.getElementById(id);
  const peso = (n) => '₱' + Number(n).toLocaleString('en-PH');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const K = { admins: 'cc-admins', session: 'cc-admin', lock: 'cc-admin-lock', users: 'cc-users', orders: 'cc-orders', menu: 'cc-menu', items: 'cc-menu-items', specials: 'cc-specials', promos: 'cc-promos' };
  const SESSION_MS = 8 * 60 * 60 * 1000, MAX_TRIES = 5, LOCK_MS = 60 * 1000;
  const LOGIN_URL = 'adminLogin.html', PANEL_URL = 'adminOrders.html', MENU_URL = 'menu.html';
  const DEFAULT_EMAIL = 'admin@cafecentigrado.ph';                       // old demo account, removed automatically
  const OLD_OWNERS = ['jmamen2007@gmail.com', 'adminside@gmaill.com'];   // previous owner emails, removed automatically
  /* The admin account that already exists. Only the salted hash is stored here, never the password. */
  const OWNER = { email: 'adminside@gmail.com', name: 'Owner', role: 'owner', mustChange: false, salt: '11dcfa67792eebb490facc7206e076ea', hash: '7b846306d5beeb53e4e859df4c7aa1ecc1339cf17f2199af838680812372f9dc' };

  /* What each role may do. Staff run orders and stock; the owner also manages promos, specials and accounts. */
  const PERMS = {
    owner: ['queue', 'orders', 'menu', 'promos', 'specials', 'customers', 'admins', 'account'],
    staff: ['queue', 'orders', 'menu', 'account']
  };
  /* Three pages (adminAccounts / adminMenu / adminOrders). Each has sections: [id, label, permission needed] */
  const TABS = {
    accounts: { label: 'Accounts', subs: [['customers', 'Customers', 'customers'], ['admins', 'Admins', 'admins'], ['account', 'My password', 'account']] },
    menu: { label: 'Menu', subs: [['items', 'Items & stock', 'menu'], ['promos', 'Promos', 'promos'], ['specials', 'Specials', 'specials']] },
    orders: { label: 'Order queue', subs: [['queue', 'Queue', 'queue'], ['today', 'Today', 'orders'], ['history', 'All orders', 'orders']] }
  };
  const DRINK_CATS = ['hot-coffee', 'ice-blended', 'non-coffee', 'yakult', 'tea'];   // food has one size
  const STATUS = ['New', 'Preparing', 'On hold', 'Ready', 'Done', 'Cancelled'];
  const ACTIVE = ['New', 'Preparing', 'On hold', 'Ready'];                           // orders still in the queue
  const NEXT = { New: [['Start', 'Preparing']], Preparing: [['Ready', 'Ready'], ['Pause', 'On hold']], 'On hold': [['Resume', 'Preparing']], Ready: [['Done', 'Done']] };

  const read = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v === null || v === undefined ? d : v; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };
  const ymd = () => new Date().toLocaleDateString('en-CA');                          // today as YYYY-MM-DD

  /* ---------- password hashing (salted PBKDF2) ---------- */
  const toHex = (b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, '0')).join('');
  const fromHex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
  async function hashPw(pw, salt) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pw), 'PBKDF2', false, ['deriveBits']);
    return toHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromHex(salt), iterations: 100000, hash: 'SHA-256' }, key, 256));
  }
  async function mkHash(pw) { const salt = toHex(crypto.getRandomValues(new Uint8Array(16))); return { salt, hash: await hashPw(pw, salt) }; }

  /* Make sure the existing admin account is there, and drop the old default accounts */
  async function seedAdmin() {
    const a = read(K.admins, {});
    const { email, ...rec } = OWNER;
    if (!a[email]) a[email] = rec;
    if (a[DEFAULT_EMAIL] && a[DEFAULT_EMAIL].mustChange) delete a[DEFAULT_EMAIL];
    OLD_OWNERS.forEach((e) => { delete a[e]; });
    write(K.admins, a);
  }

  /* ---------- who is signed in ----------
     The session only stores the email + expiry. The role is ALWAYS looked up from the admin record,
     so a staff account cannot give itself owner rights by editing the session. */
  function me() {
    const s = read(K.session, null);
    if (!s || !s.exp || s.exp < Date.now()) return null;
    const a = read(K.admins, {})[s.email];
    return a && !a.disabled ? { email: s.email, ...a } : null;
  }
  const can = (m, perm) => (m.mustChange ? perm === 'account' : (PERMS[m.role] || []).includes(perm));
  function guard(perm) {                                  // every action calls this first
    const m = me();
    if (!m) { location.replace(LOGIN_URL); return null; }
    return can(m, perm) ? m : null;
  }

  /* =====================================================================
     LOGIN PAGE (adminLogin.html)
     ===================================================================== */
  if ($('form')) {
    const msg = $('error');
    $('shw').onclick = () => { const i = $('password'), s = i.type === 'password'; i.type = s ? 'text' : 'password'; $('shw').textContent = s ? 'Hide' : 'Show'; };
    seedAdmin().then(() => { if (me()) location.replace(PANEL_URL); })      // already signed in: go straight to the panel
      .catch(() => { msg.textContent = 'Admin login needs https or localhost.'; });
    $('form').addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent = '';
      const email = $('email').value.trim().toLowerCase(), pw = $('password').value, lock = read(K.lock, { n: 0, until: 0 });
      if (lock.until > Date.now()) return void (msg.textContent = `Too many tries. Wait ${Math.ceil((lock.until - Date.now()) / 1000)}s.`);
      if (!/^\S+@\S+\.\S+$/.test(email)) return void (msg.textContent = 'Please enter a valid email address.');
      if (!pw) return void (msg.textContent = 'Please enter your password.');
      try {
        await seedAdmin();
        const admins = read(K.admins, {}), a = admins[email];
        if (a && a.disabled) return void (msg.textContent = 'This admin account is disabled.');
        if (a && (await hashPw(pw, a.salt)) === a.hash) {
          write(K.lock, { n: 0, until: 0 });
          a.lastLogin = new Date().toISOString(); write(K.admins, admins);
          write(K.session, { email, exp: Date.now() + SESSION_MS });
          location.href = PANEL_URL;
        } else {
          const n = lock.n + 1;
          write(K.lock, { n: n >= MAX_TRIES ? 0 : n, until: n >= MAX_TRIES ? Date.now() + LOCK_MS : 0 });
          msg.textContent = n >= MAX_TRIES ? 'Too many tries. Locked for 1 minute.' : 'Wrong email or password.';
        }
      } catch (err) { msg.textContent = 'Login needs https or localhost.'; }
    });
    return;
  }

  /* =====================================================================
     ADMIN PANEL (adminAccounts / adminMenu / adminOrders)
     ===================================================================== */
  if (!$('dash')) return;
  const PAGE_TAB = { 'admin-accounts': 'accounts', 'admin-menu': 'menu', 'admin-orders': 'orders' };   // each admin page is its own HTML file
  let tab = PAGE_TAB[document.body.dataset.page] || 'orders', sub = { accounts: 'customers', menu: 'items', orders: 'queue' }, filter = 'All', flash = '';
  let baseCache = null, lastCat = '';

  $('logout').onclick = () => { try { localStorage.removeItem(K.session); } catch (e) { } location.replace(LOGIN_URL); };

  /* ---------- shell ---------- */
  function visibleSubs(m, t) { return TABS[t].subs.filter(([, , perm]) => can(m, perm)); }
  function showView() {
    const m = me();
    if (!m) { try { localStorage.removeItem(K.session); } catch (e) { } return void location.replace(LOGIN_URL); }
    if (m.mustChange && tab !== 'accounts') return void location.replace('adminAccounts.html');   // new admins must set a password first
    if ($('dashWait')) $('dashWait').remove();
    $('dash').hidden = false;
    const subs = visibleSubs(m, tab);
    if (!subs.some(([id]) => id === sub[tab])) sub[tab] = subs[0][0];
    $('who').textContent = `${m.name} · ${m.role}`;
    $('subtabs').hidden = subs.length < 2;
    $('subtabs').innerHTML = subs.map(([id, label]) => { const n = badgeFor(id); return `<button class="btn btn--line${id === sub[tab] ? ' is-on' : ''}" type="button" data-sub="${id}" aria-pressed="${id === sub[tab]}">${label}${n === null ? '' : ` <span class="adm__badge">${n}</span>`}</button>`; }).join('');
    if (!$('secHead')) $('panel').insertAdjacentHTML('beforebegin', '<div class="adm__sechead" id="secHead"></div>');
    const info = SECTION_INFO[sub[tab]] || ['', ''];
    $('secHead').innerHTML = `<h2>${esc(info[0])}</h2><p>${esc(info[1])}</p>`;
    $('stats').innerHTML = m.mustChange ? '' : statsFor(tab);
    ({ customers: renderCustomers, admins: renderAdmins, account: renderAccount, items: renderItems, promos: renderPromos, specials: renderSpecials, queue: renderQueue, today: () => renderOrders('today'), history: () => renderOrders('all') })[sub[tab]](m);
  }
  /* Section header text + the little count on each section button */
  const SECTION_INFO = {
    customers: ['Customers', 'Everyone who signed up on the site. Suspend, reset a password or remove an account.'],
    admins: ['Admins', 'Who can sign in to this panel, and what each person is allowed to do.'],
    account: ['My password', 'Change the password you use to sign in here.'],
    items: ['Items & stock', 'Add drinks and food, change prices and mark things sold out.'],
    promos: ['Promos', 'Discount codes customers type in the cart.'],
    specials: ['Specials', 'Limited-time drinks that show on the menu page only during their dates.'],
    queue: ['Queue', 'Pickup orders waiting to be made, oldest first.'],
    today: ['Today', 'Everything ordered today.'],
    history: ['All orders', 'Every order, with filters and CSV export.']
  };
  function badgeFor(id) {
    const orders = read(K.orders, []);
    switch (id) {
      case 'queue': return orders.filter((o) => ACTIVE.includes(o.status)).length;
      case 'today': return orders.filter(isToday).length;
      case 'history': return orders.length;
      case 'customers': return Object.keys(read(K.users, {})).length;
      case 'admins': return Object.keys(read(K.admins, {})).length;
      case 'promos': return read(K.promos, []).filter((p) => prStatus(p) === 'Active').length;
      case 'specials': return read(K.specials, []).filter((s) => spStatus(s) === 'Live').length;
      default: return null;
    }
  }
  const stat = (n, l) => `<div><b>${n}</b><span class="mono-sm">${l}</span></div>`;
  const money = (list) => list.filter((o) => o.status !== 'Cancelled').reduce((s, o) => s + o.total, 0);
  const isToday = (o) => new Date(o.at).toDateString() === new Date().toDateString();
  function statsFor(t) {
    if (t === 'orders') {
      const orders = read(K.orders, []), todays = orders.filter(isToday);
      return stat(orders.filter((o) => ACTIVE.includes(o.status)).length, 'In queue') + stat(orders.filter((o) => o.status === 'On hold').length, 'On hold') +
        stat(todays.length, 'Orders today') + stat(peso(money(todays)), 'Money made today') + stat(peso(money(orders)), 'Money made, all time');
    }
    if (t === 'accounts') {
      const u = Object.values(read(K.users, {})), a = Object.values(read(K.admins, {}));
      return stat(u.length, 'Customers') + stat(u.filter((x) => x.disabled).length, 'Suspended') + stat(a.length, 'Admins');
    }
    return '';   // the menu tab fills its own numbers once the menu has loaded
  }
  $('subtabs').addEventListener('click', (e) => { const b = e.target.closest('[data-sub]'); if (b) { sub[tab] = b.dataset.sub; flash = ''; showView(); } });
  setInterval(() => { if (!me()) showView(); }, 30000);                                          // sign out when the session expires
  window.addEventListener('storage', (e) => {                                                    // new orders appear live
    if ([K.session, K.admins].includes(e.key) || (e.key === K.orders && tab === 'orders')) showView();
  });
  const flashHtml = () => { const f = flash; flash = ''; return f ? `<p class="adm__ok" role="status">${f}</p>` : ''; };
  const msg = (t) => { const el = $('formMsg'); if (el) el.textContent = t; };

  /* =====================================================================
     ORDER QUEUE: queue, today, all orders. Each order shows its pickup details.
     ===================================================================== */
  const itemsText = (o) => o.items.map((i) => `${i.qty}× ${i.name}${i.addons && i.addons.length ? ' (+ ' + i.addons.join(', ') + ')' : ''}`);
  const where = (o) => `<b>Pickup</b> at the counter${o.phone ? ` · ☎ ${esc(o.phone)}` : ''}`;
  const orderNo = (o) => '#' + String(o.id).slice(-5);

  function renderQueue() {
    const q = read(K.orders, []).filter((o) => ACTIVE.includes(o.status)).sort((a, b) => a.id - b.id);   // oldest first
    $('panel').innerHTML = q.length ? `<div class="queue">${q.map((o, i) => {
      const mins = Math.max(0, Math.round((Date.now() - new Date(o.at).getTime()) / 60000));
      const acts = [...NEXT[o.status], ['Cancel', 'Cancelled']].map(([label, to], n) => `<button class="btn ${n === 0 ? 'btn--fill' : 'btn--line'}" type="button" data-q="${o.id}" data-to="${to}">${label}</button>`).join('');
      return `<article class="qcard qcard--${o.status.replace(' ', '-').toLowerCase()}">
      <div class="qcard__top"><h3>${orderNo(o)}</h3><span class="pill s-${o.status.replace(' ', '-').toLowerCase()}">${o.status}</span></div>
      <p class="mono-sm">No. ${i + 1} in line · <span class="${mins >= 15 ? 'late' : ''}">${mins} min ago</span> · ${esc(o.customer)}</p>
      <p class="qcard__where">${where(o)}</p>
      <ul class="qcard__items">${itemsText(o).map((t) => `<li>${esc(t)}</li>`).join('')}</ul>
      <p class="qcard__total">${peso(o.total)}${o.discount ? ` <small>(${esc(o.promo)} −${peso(o.discount)})</small>` : ''}</p>
      <div class="qcard__acts">${acts}</div></article>`;
    }).join('')}</div>` : '<p>The queue is empty. New orders show up here automatically.</p>';
  }

  function renderOrders(period) {
    const base = read(K.orders, []).slice().reverse().filter((o) => period === 'all' || isToday(o));
    const list = filter === 'All' ? base : base.filter((o) => o.status === filter);
    const sum = `<p class="adm__sum"><b>${list.length}</b> order${list.length === 1 ? '' : 's'} · money made <b>${peso(money(list))}</b>
      <small>Cancelled orders are not counted.</small></p>`;
    $('panel').innerHTML = `<div class="adm__tools"><label class="mono-sm" for="flt">Show</label><select id="flt">${['All', ...STATUS].map((s) => `<option${s === filter ? ' selected' : ''}>${s}</option>`).join('')}</select><button class="btn btn--line" type="button" id="csv">Export CSV</button></div>` + sum +
      (list.length ? `<div class="adm__scroll"><table><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>Where</th><th>Total</th><th>Status</th><th></th></tr></thead><tbody>${list.map((o) => `<tr>
      <td>${orderNo(o)}<br><small>${new Date(o.at).toLocaleString('en-PH', { dateStyle: period === 'today' ? undefined : 'short', timeStyle: 'short' })}</small></td>
      <td>${esc(o.customer)}${o.email ? `<br><small>${esc(o.email)}</small>` : ''}</td><td>${itemsText(o).map(esc).join('<br>')}</td><td>${where(o)}</td>
      <td>${peso(o.total)}${o.discount ? `<br><small>${esc(o.promo)} −${peso(o.discount)}</small>` : ''}</td>
      <td><select data-st="${o.id}">${STATUS.map((s) => `<option${s === o.status ? ' selected' : ''}>${s}</option>`).join('')}</select></td>
      <td><button class="btn btn--line" type="button" data-del-order="${o.id}">Delete</button></td></tr>`).join('')}</tbody></table></div>`
        : `<p>${period === 'today' ? 'No orders yet today.' : 'No orders to show.'} Orders placed from the cart on the site appear here.</p>`);
  }
  function exportCsv() {
    if (!guard('orders')) return;
    const rows = [['Order', 'Date', 'Customer', 'Email', 'Phone', 'Items', 'Promo', 'Discount', 'Total', 'Status'],
    ...read(K.orders, []).map((o) => [o.id, o.at, o.customer, o.email || '', o.phone || '', itemsText(o).join('; '), o.promo || '', o.discount || 0, o.total, o.status])];
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([rows.map((r) => r.map((c) => { c = String(c); if (/^[=+\-@\t\r]/.test(c)) c = "'" + c; return '"' + c.replace(/"/g, '""') + '"'; }).join(',')).join('\n')], { type: 'text/csv' }));
    a.download = 'orders.csv'; a.click();
  }

  /* =====================================================================
     MENU: items (add, delete, price, sold out), promos, specials
     ===================================================================== */
  /* The built-in items are read from menu.html so this page never goes out of date */
  async function baseMenu() {
    if (baseCache) return baseCache;
    const r = await fetch(MENU_URL); if (!r.ok) throw 0;
    const doc = new DOMParser().parseFromString(await r.text(), 'text/html'), cats = [], items = [];
    doc.querySelectorAll('.menu__list').forEach((ul) => {
      cats.push([ul.id, ul.getAttribute('aria-label')]);
      ul.querySelectorAll('.mrow').forEach((row) => {
        const adds = [...row.querySelectorAll('.add[data-key]')]; if (!adds.length) return;
        const h = row.querySelector('h3').cloneNode(true); h.querySelectorAll('.tag').forEach((t) => t.remove());
        items.push({
          id: adds[0].dataset.key.split(':').slice(0, 2).join(':'), cat: ul.id, name: h.textContent.trim(), desc: row.querySelector('p').textContent.trim(), built: true,
          sizes: adds.map((b) => ({ label: b.dataset.key.split(':')[2] || '', key: b.dataset.key, price: +b.dataset.price }))
        });
      });
    });
    return (baseCache = { cats, items });
  }
  const sizeKey = (it, z) => `${it.id}:${z.label}`;

  async function renderItems() {
    $('panel').innerHTML = '<p>Loading menu…</p>';
    let base;
    try { base = await baseMenu(); }
    catch (e) { return void ($('panel').innerHTML = '<p>Could not load menu.html. Open the site through a server (Live Server / localhost), not by double-clicking the file.</p>'); }
    if (tab !== 'menu' || sub.menu !== 'items') return;   // the admin moved on while the menu was loading
    const ov = read(K.menu, {}), st = read(K.items, {}), added = st.added || [], removed = st.removed || [];
    const all = [...base.items, ...added.map((i) => ({ ...i, built: false, sizes: i.sizes.map((z) => ({ ...z, key: `${i.id}:${z.label}` })) }))];
    const live = all.filter((i) => !removed.includes(i.id)), gone = all.filter((i) => removed.includes(i.id));
    const outs = live.reduce((n, i) => n + (i.sizes.every((z) => (ov[z.key] || {}).out) ? 1 : 0), 0);
    $('stats').innerHTML = stat(live.length, 'Items on the menu') + stat(outs, 'Sold out') + stat(added.length, 'Added by you') + stat(removed.length, 'Removed');
    const catName = (id) => (base.cats.find((c) => c[0] === id) || [0, id])[1];

    const form = `<form class="adm__form adm__form--wide" id="addItem" novalidate><p class="mono-sm">Add a new item</p>
      <div class="adm__grid">
        <label class="mono-sm">Category<select id="i-cat">${base.cats.map(([id, n]) => `<option value="${esc(id)}">${esc(n)}</option>`).join('')}</select></label>
        <label class="mono-sm">Name<input type="text" id="i-name" maxlength="60" required></label>
        <label class="mono-sm adm__wide">Description<input type="text" id="i-desc" maxlength="120"></label>
        <label class="mono-sm">Sizes<select id="i-mode"></select></label>
        <label class="mono-sm"><span id="i-p1l">Price (₱)</span><input type="number" id="i-p1" min="1" step="1" required></label>
        <label class="mono-sm" id="i-p2w">Large price (₱)<input type="number" id="i-p2" min="1" step="1"></label>
        <label class="mono-sm adm__wide">Photo file (optional)<input type="text" id="i-img" placeholder="chicken-poppers.jpg"></label>
      </div>
      <button class="btn btn--fill" type="submit">Add to menu</button><p class="subscribe__msg" id="formMsg" role="status"></p></form>`;

    const groups = base.cats.map(([cid, cname]) => {
      const rows = live.filter((i) => i.cat === cid), soldN = rows.filter((i) => i.sizes.every((z) => (ov[z.key] || {}).out)).length;
      return `<div class="grp-wrap"><div class="adm__tools grp-bar"><h3 class="grp" data-fold tabindex="0" role="button" aria-expanded="true">${esc(cname)} <span class="adm__count">${rows.length}</span>${soldN ? ` <span class="adm__count adm__count--out">${soldN} sold out</span>` : ''}</h3><button class="btn btn--line" type="button" data-bulk="out">Mark all sold out</button><button class="btn btn--line" type="button" data-bulk="in">Restock all</button></div>
      <div class="adm__scroll"><table><thead><tr><th>Item</th><th>Price (₱) and stock</th><th></th></tr></thead><tbody>${rows.length ? rows.map((i) => `<tr>
        <td>${esc(i.name)}${i.built ? '' : ' <span class="pill">New</span>'}<br><small>${esc(i.desc)}</small></td>
        <td>${i.sizes.map((z) => { const o = ov[z.key] || {}; return `<div class="adm__size"><span class="mono-sm">${esc(z.label || 'One size')}</span><input type="number" min="1" aria-label="Price ${esc(i.name)} ${esc(z.label)}" data-price="${esc(z.key)}" data-base="${z.price}" value="${o.price || z.price}"><label><input type="checkbox" data-out="${esc(z.key)}"${o.out ? ' checked' : ''}> Sold out</label></div>`; }).join('')}</td>
        <td><button class="btn btn--line btn--danger" type="button" data-rm="${esc(i.id)}">Delete</button></td></tr>`).join('') : '<tr><td colspan="3"><small>Nothing here. Add an item above.</small></td></tr>'}</tbody></table></div></div>`;
    }).join('');

    const goneHtml = gone.length ? `<div class="adm__gone"><h3 class="grp">Deleted items</h3><ul>${gone.map((i) => `<li><span>${esc(i.name)} <small>${esc(catName(i.cat))}</small></span><button class="btn btn--line" type="button" data-restore="${esc(i.id)}">Restore</button></li>`).join('')}</ul></div>` : '';
    $('panel').innerHTML = flashHtml() + form +
      '<div class="adm__tools"><input type="search" id="msearch" placeholder="Search the menu…" aria-label="Search the menu"><button class="btn btn--line" type="button" data-foldall>Collapse all</button><span class="mono-sm" id="menuMsg" role="status">Change prices or tick “Sold out”, then save.</span></div>' + groups +
      '<p class="adm__save"><button class="btn btn--fill" type="button" id="saveMenu">Save menu changes</button> <button class="btn btn--line" type="button" id="resetMenu">Reset everything to original</button></p>' + goneHtml;
    if (lastCat && [...$('i-cat').options].some((o) => o.value === lastCat)) $('i-cat').value = lastCat;   // keep the category you were adding to
    syncItemForm();
  }
  function syncItemForm() {
    const food = !DRINK_CATS.includes($('i-cat').value), mode = $('i-mode');
    const keep = mode.value;
    mode.innerHTML = food ? '<option value="one">One size</option>' : '<option value="ml">Medium and Large</option><option value="l">Large only</option>';
    if ([...mode.options].some((o) => o.value === keep)) mode.value = keep;
    $('i-p1l').textContent = mode.value === 'ml' ? 'Medium price (₱)' : mode.value === 'l' ? 'Large price (₱)' : 'Price (₱)';
    $('i-p2w').hidden = mode.value !== 'ml';
  }
  function saveMenu() {
    if (!guard('menu')) return;
    const next = {}, outs = [...$('panel').querySelectorAll('[data-out]')];
    $('panel').querySelectorAll('[data-price]').forEach((i) => {
      const k = i.dataset.price, out = outs.find((c) => c.dataset.out === k).checked, price = Math.round(+i.value);
      if (out || (price > 0 && price !== +i.dataset.base)) next[k] = { price: price > 0 ? price : +i.dataset.base, out };
    });
    if (!write(K.menu, next)) { $('menuMsg').textContent = 'Could not save in this browser.'; return; }
    $('menuMsg').textContent = 'Saved. The menu page now uses these.';
    const btn = $('saveMenu');
    btn.textContent = 'Saved ✓';
    btn.classList.remove('is-zoom'); void btn.offsetWidth;   // lets the zoom replay if clicked again
    btn.classList.add('is-zoom');
    setTimeout(() => location.reload(), 500);                // refresh after the zoom finishes
  }
  
  function removeItem(id) {
    if (!guard('menu')) return;
    const st = read(K.items, {}), added = st.added || [], it = added.find((i) => i.id === id);
    if (!confirm('Delete this item from the menu?')) return;
    if (it) {                                                   // items you added are deleted for good
      st.added = added.filter((i) => i.id !== id);
      const ov = read(K.menu, {}); it.sizes.forEach((z) => delete ov[`${id}:${z.label}`]); write(K.menu, ov);
    } else st.removed = [...new Set([...(st.removed || []), id])];   // built-in items can be restored
    write(K.items, { added: st.added || [], removed: st.removed || [] }); flash = 'Item deleted.'; showView();
  }

  /* ---------- Promos: codes customers type in the cart ---------- */
  const prStatus = (p) => (p.off ? 'Off' : p.exp && p.exp < ymd() ? 'Expired' : 'Active');
  function renderPromos() {
    const a = read(K.promos, []);
    $('stats').innerHTML = stat(a.filter((p) => prStatus(p) === 'Active').length, 'Active promos') + stat(a.length, 'All promos') + stat(a.reduce((n, p) => n + (p.used || 0), 0), 'Times used');
    $('panel').innerHTML = `<form class="adm__form" id="addPromo" novalidate><p class="mono-sm">New promo code</p>
      <label class="mono-sm">Code (letters and numbers)<input type="text" id="p-code" maxlength="16" required></label>
      <label class="mono-sm">Discount type<select id="p-type"><option value="percent">Percent off (%)</option><option value="peso">Peso off (₱)</option></select></label>
      <label class="mono-sm">Amount<input type="number" id="p-val" min="1" required></label>
      <label class="mono-sm">Minimum order (₱, optional)<input type="number" id="p-min" min="0"></label>
      <label class="mono-sm">Expires (optional)<input type="date" id="p-exp"></label>
      <button class="btn btn--fill" type="submit">Add promo</button><p class="subscribe__msg" id="formMsg" role="status"></p></form>` +
      (a.length ? `<div class="adm__scroll"><table><thead><tr><th>Code</th><th>Discount</th><th>Min order</th><th>Expires</th><th>Used</th><th>Status</th><th></th></tr></thead><tbody>${a.map((p) => `<tr>
      <td>${esc(p.code)}</td><td>${p.type === 'percent' ? esc(p.value) + '%' : peso(p.value)}</td><td>${p.min ? peso(p.min) : '—'}</td><td>${esc(p.exp || '—')}</td><td>${p.used || 0}</td>
      <td><span class="pill${prStatus(p) === 'Active' ? '' : ' pill--off'}">${prStatus(p)}</span></td>
      <td><button class="btn btn--line" type="button" data-pr="toggle" data-code="${esc(p.code)}">${p.off ? 'Turn on' : 'Turn off'}</button> <button class="btn btn--line" type="button" data-pr="del" data-code="${esc(p.code)}">Delete</button></td></tr>`).join('')}</tbody></table></div>` : '<p>No promo codes yet.</p>');
  }

  /* ---------- Specials: drinks for special days, shown on the menu page only while live ---------- */
  const spStatus = (s) => { const t = ymd(); return s.off ? 'Off' : t < s.from ? 'Scheduled' : t > s.to ? 'Ended' : 'Live'; };
  function renderSpecials() {
    const a = read(K.specials, []);
    $('stats').innerHTML = stat(a.filter((s) => spStatus(s) === 'Live').length, 'Live now') + stat(a.filter((s) => spStatus(s) === 'Scheduled').length, 'Scheduled') + stat(a.length, 'All specials');
    $('panel').innerHTML = `<form class="adm__form" id="addSpecial" novalidate><p class="mono-sm">New special drink</p>
      <label class="mono-sm">Occasion (optional)<input type="text" id="s-occ" placeholder="Valentine's Day"></label>
      <label class="mono-sm">Drink name<input type="text" id="s-name" required></label>
      <label class="mono-sm">Description<input type="text" id="s-desc"></label>
      <label class="mono-sm">Price (₱)<input type="number" id="s-price" min="1" required></label>
      <label class="mono-sm">Starts<input type="date" id="s-from" required></label>
      <label class="mono-sm">Ends<input type="date" id="s-to" required></label>
      <button class="btn btn--fill" type="submit">Add special</button><p class="subscribe__msg" id="formMsg" role="status"></p></form>` +
      (a.length ? `<div class="adm__scroll"><table><thead><tr><th>Drink</th><th>Price</th><th>Dates</th><th>Status</th><th></th></tr></thead><tbody>${a.map((s) => `<tr>
      <td>${esc(s.name)}${s.occ ? ` <span class="pill">${esc(s.occ)}</span>` : ''}<br><small>${esc(s.desc || '')}</small></td><td>${peso(s.price)}</td><td>${esc(s.from)} → ${esc(s.to)}</td>
      <td><span class="pill${['Off', 'Ended'].includes(spStatus(s)) ? ' pill--off' : ''}">${spStatus(s)}</span></td>
      <td><button class="btn btn--line" type="button" data-sp="toggle" data-id="${s.id}">${s.off ? 'Turn on' : 'Turn off'}</button> <button class="btn btn--line" type="button" data-sp="del" data-id="${s.id}">Delete</button></td></tr>`).join('')}</tbody></table></div>` : '<p>No specials yet.</p>');
  }

  /* =====================================================================
     ACCOUNTS: customers, admins, my password.
     Passwords are never stored, only a salted hash, so nobody (including the owner) can read one.
     Instead the owner can set a new temporary password, which is shown once on screen.
     ===================================================================== */
  const fmtDate = (iso) => (iso ? new Date(iso).toLocaleString('en-PH', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const searchBox = '<div class="adm__tools"><input type="search" id="asearch" placeholder="Search accounts…" aria-label="Search accounts"></div>';

  function renderCustomers() {
    const u = read(K.users, {}), keys = Object.keys(u), orders = read(K.orders, []);
    $('panel').innerHTML = flashHtml() + (keys.length ? searchBox + `<div class="adm__scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Orders</th><th>Status</th><th></th></tr></thead><tbody>${keys.map((e) => {
      const mine = orders.filter((o) => (o.email || '').toLowerCase() === e);
      return `<tr><td>${esc(u[e].name)}</td><td>${esc(e)}</td><td>${fmtDate(u[e].created)}</td><td>${mine.length}<br><small>${peso(money(mine))}</small></td>
      <td><span class="pill${u[e].disabled ? ' pill--off' : ''}">${u[e].disabled ? 'Suspended' : 'Active'}</span></td>
      <td><button class="btn btn--line" type="button" data-toggle-user="${esc(e)}">${u[e].disabled ? 'Activate' : 'Suspend'}</button> <button class="btn btn--line" type="button" data-reset-user="${esc(e)}">Reset password</button> <button class="btn btn--line btn--danger" type="button" data-del-user="${esc(e)}">Delete</button></td></tr>`;
    }).join('')}</tbody></table></div><p class="adm__note">Passwords are stored as one-way hashes, so they cannot be viewed. Use “Reset password” to give a customer a new one.</p>`
      : '<p>No customer accounts yet. Accounts created on the Sign in page appear here.</p>');
  }

  function renderAdmins(m) {
    const a = read(K.admins, {});
    $('panel').innerHTML = flashHtml() + `<form class="adm__form" id="addAdmin" novalidate><p class="mono-sm">Make a new admin</p>
      <label class="mono-sm">Name<input type="text" id="n-name" required></label>
      <label class="mono-sm">Email<input type="email" id="n-email" required></label>
      <label class="mono-sm">Temporary password (8+ chars)<input type="text" id="n-pw" autocomplete="off" required></label>
      <label class="mono-sm">Role<select id="n-role"><option value="staff">Staff (orders + menu stock)</option><option value="owner">Owner (everything)</option></select></label>
      <button class="btn btn--fill" type="submit">Add admin</button><p class="subscribe__msg" id="formMsg" role="status"></p></form>` + searchBox +
      `<div class="adm__scroll"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Last login</th><th></th></tr></thead><tbody>${Object.keys(a).map((e) => `<tr><td>${esc(a[e].name)}</td><td>${esc(e)}</td>
      <td><span class="pill${a[e].disabled ? ' pill--off' : ''}">${a[e].disabled ? 'Disabled' : a[e].role}</span>${a[e].mustChange ? '<br><small>must change password</small>' : ''}</td><td>${fmtDate(a[e].lastLogin)}</td>
      <td>${e === m.email ? '(you)' : `<button class="btn btn--line" type="button" data-adm="reset" data-e="${esc(e)}">Reset password</button> <button class="btn btn--line" type="button" data-adm="role" data-e="${esc(e)}">Make ${a[e].role === 'owner' ? 'staff' : 'owner'}</button> <button class="btn btn--line" type="button" data-adm="toggle" data-e="${esc(e)}">${a[e].disabled ? 'Enable' : 'Disable'}</button> <button class="btn btn--line btn--danger" type="button" data-adm="del" data-e="${esc(e)}">Delete</button>`}</td></tr>`).join('')}</tbody></table></div>
      <p class="adm__note">Passwords cannot be viewed. A new admin signs in with the temporary password and must change it.</p>`;
  }

  function renderAccount(m) {
    $('panel').innerHTML = (m.mustChange ? '<p class="adm__warn">You are using a temporary password. Set a new one to unlock the admin panel.</p>' : '') + flashHtml() +
      `<form class="adm__form" id="pwForm" novalidate><p class="mono-sm">Signed in as ${esc(m.email)} (${m.role})</p>
      <label class="mono-sm">Current password<input type="password" id="p-cur" autocomplete="current-password" required></label>
      <label class="mono-sm">New password (8+ chars)<input type="password" id="p-new" autocomplete="new-password" required></label>
      <label class="mono-sm">Confirm new password<input type="password" id="p-con" autocomplete="new-password" required></label>
      <button class="btn btn--fill" type="submit">Change password</button><p class="subscribe__msg" id="formMsg" role="status"></p></form>`;
  }

  /* =====================================================================
     EVENTS
     ===================================================================== */
  $('panel').addEventListener('input', (e) => {                 // search boxes
    if (e.target.id !== 'msearch' && e.target.id !== 'asearch') return;
    const q = e.target.value.trim().toLowerCase();
    if (e.target.id === 'asearch') {
      $('panel').querySelectorAll('tbody tr').forEach((r) => { r.hidden = !r.textContent.toLowerCase().includes(q); });
      return;
    }
    $('panel').querySelectorAll('.grp-wrap').forEach((g) => {
      let any = false;
      g.querySelectorAll('tbody tr').forEach((r) => { const show = r.cells[0].textContent.toLowerCase().includes(q); r.hidden = !show; any = any || show; });
      g.hidden = !any;
    });
  });
  $('panel').addEventListener('click', (e) => {                // click a category title to fold it
    const h = e.target.closest('h3.grp[data-fold]'); if (!h) return;
    const g = h.closest('.grp-wrap'), off = g.classList.toggle('is-collapsed'); h.setAttribute('aria-expanded', !off);
  });
  $('panel').addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('h3.grp[data-fold]')) { e.preventDefault(); e.target.click(); } });
  $('panel').addEventListener('change', (e) => {
    if (e.target.id === 'flt') { filter = e.target.value; return showView(); }
    if (e.target.id === 'i-cat' || e.target.id === 'i-mode') { if (e.target.id === 'i-cat') lastCat = e.target.value; return syncItemForm(); }
    const s = e.target.closest('[data-st]');
    if (!s || !guard('orders')) return;
    const orders = read(K.orders, []), o = orders.find((x) => String(x.id) === s.dataset.st);
    if (o) { o.status = s.value; write(K.orders, orders); showView(); }
  });
  $('panel').addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'csv') return exportCsv();
    if (t.dataset.foldall !== undefined) {                      // collapse / expand every category
      const groups = [...$('panel').querySelectorAll('.grp-wrap')], collapse = groups.some((g) => !g.classList.contains('is-collapsed'));
      groups.forEach((g) => { g.classList.toggle('is-collapsed', collapse); const h = g.querySelector('h3.grp'); if (h) h.setAttribute('aria-expanded', !collapse); });
      t.textContent = collapse ? 'Expand all' : 'Collapse all'; return;
    }
    if (t.id === 'saveMenu') return saveMenu();
    if (t.id === 'resetMenu') {
      if (guard('menu') && confirm('Undo every change? Added items are deleted, deleted items come back, and prices and sold-out marks go back to the original.')) { localStorage.removeItem(K.menu); localStorage.removeItem(K.items); flash = 'Menu reset to the original.'; showView(); }
      return;
    }
    if (t.dataset.rm) return removeItem(t.dataset.rm);
    if (t.dataset.restore) {
      if (!guard('menu')) return;
      const st = read(K.items, {}); write(K.items, { added: st.added || [], removed: (st.removed || []).filter((x) => x !== t.dataset.restore) }); flash = 'Item restored.'; return showView();
    }
    if (t.dataset.bulk) {                                       // mark a whole category sold out / restocked (save to apply)
      if (!guard('menu')) return;
      t.closest('.grp-wrap').querySelectorAll('[data-out]').forEach((c) => { c.checked = t.dataset.bulk === 'out'; });
      $('menuMsg').textContent = 'Changed. Press “Save menu changes” to apply.'; return;
    }
    if (t.dataset.q) {                                          // queue actions
      if (!guard('queue')) return;
      if (t.dataset.to === 'Cancelled' && !confirm('Cancel this order?')) return;
      const orders = read(K.orders, []), o = orders.find((x) => String(x.id) === t.dataset.q);
      if (o) { o.status = t.dataset.to; write(K.orders, orders); showView(); }
      return;
    }
    if (t.dataset.sp) {
      if (!guard('specials')) return;
      let a = read(K.specials, []);
      if (t.dataset.sp === 'del') { if (!confirm('Delete this special?')) return; a = a.filter((s) => String(s.id) !== t.dataset.id); }
      else a.forEach((s) => { if (String(s.id) === t.dataset.id) s.off = !s.off; });
      write(K.specials, a); showView(); return;
    }
    if (t.dataset.pr) {
      if (!guard('promos')) return;
      let a = read(K.promos, []);
      if (t.dataset.pr === 'del') { if (!confirm('Delete promo ' + t.dataset.code + '?')) return; a = a.filter((p) => p.code !== t.dataset.code); }
      else a.forEach((p) => { if (p.code === t.dataset.code) p.off = !p.off; });
      write(K.promos, a); showView(); return;
    }
    if (t.dataset.delOrder && guard('orders') && confirm('Delete this order?')) { write(K.orders, read(K.orders, []).filter((x) => String(x.id) !== t.dataset.delOrder)); showView(); }
    if (t.dataset.toggleUser && guard('customers')) { const u = read(K.users, {}), x = u[t.dataset.toggleUser]; if (x) { x.disabled = !x.disabled; write(K.users, u); showView(); } }
    if (t.dataset.delUser && guard('customers') && confirm('Delete the account ' + t.dataset.delUser + '? They will be signed out.')) { const u = read(K.users, {}); delete u[t.dataset.delUser]; write(K.users, u); showView(); }
    if (t.dataset.resetUser) resetCustomer(t.dataset.resetUser);
    if (t.dataset.adm) adminAction(t.dataset.adm, t.dataset.e);
  });

  const tempPw = () => { const c = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'; return [...crypto.getRandomValues(new Uint8Array(10))].map((n) => c[n % c.length]).join(''); };

  async function resetCustomer(email) {
    if (!guard('customers')) return;
    const u = read(K.users, {}), x = u[email]; if (!x) return;
    const pw = prompt('New password for ' + email + ' (8+ characters). Leave empty to make one up.', '');
    if (pw === null) return;
    const np = pw || tempPw();
    if (np.length < 8) return void alert('Use at least 8 characters.');
    Object.assign(x, await mkHash(np)); write(K.users, u);
    flash = `New password for <b>${esc(email)}</b>: <code>${esc(np)}</code> — write it down, it is only shown now.`; showView();
  }

  async function adminAction(act, email) {
    const m = guard('admins'); if (!m || email === m.email) return;
    const a = read(K.admins, {}), x = a[email]; if (!x) return;
    if (act === 'del') { if (!confirm('Delete admin ' + email + '?')) return; delete a[email]; }
    else if (act === 'toggle') x.disabled = !x.disabled;
    else if (act === 'role') x.role = x.role === 'owner' ? 'staff' : 'owner';
    else if (act === 'reset') {
      const pw = prompt('New temporary password for ' + email + ' (8+ chars). Leave empty to make one up. They must change it at next login.', '');
      if (pw === null) return;
      const np = pw || tempPw();
      if (np.length < 8) return void alert('Use at least 8 characters.');
      Object.assign(x, await mkHash(np), { mustChange: true });
      flash = `Temporary password for <b>${esc(email)}</b>: <code>${esc(np)}</code> — write it down, it is only shown now.`;
    } else return;
    if (!Object.values(a).some((v) => v.role === 'owner' && !v.disabled)) return void alert('There must be at least one active owner.');
    write(K.admins, a); showView();
  }

  $('panel').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    if (f.id === 'addItem') {
      if (!guard('menu')) return;
      const cat = $('i-cat').value, name = $('i-name').value.trim().replace(/\s+/g, ' '), desc = $('i-desc').value.trim(), mode = $('i-mode').value;
      const p1 = Math.round(+$('i-p1').value), p2 = Math.round(+$('i-p2').value), img = $('i-img').value.trim();
      const st = read(K.items, {}), added = st.added || [], removed = st.removed || [];
      const base = await baseMenu();
      const taken = [...base.items, ...added].filter((i) => i.cat === cat && !removed.includes(i.id)).some((i) => i.name.toLowerCase() === name.toLowerCase());
      if (!name) return msg('Enter the item name.');
      if (taken) return msg(`"${name}" is already on the menu in that category.`);
      if (!(p1 > 0) || (mode === 'ml' && !(p2 > 0))) return msg('Enter prices above 0.');
      const sizes = mode === 'ml' ? [{ label: 'Medium', price: p1 }, { label: 'Large', price: p2 }] : mode === 'l' ? [{ label: 'Large', price: p1 }] : [{ label: '', price: p1 }];
      added.push({ id: cat + ':c' + Date.now().toString(36), cat, name, desc: desc || 'Made to order', img, sizes });
      lastCat = cat;
      write(K.items, { added, removed }); flash = `Added <b>${esc(name)}</b>. It is on the menu page now.`; return showView();
    }
    if (f.id === 'addSpecial') {
      if (!guard('specials')) return;
      const name = $('s-name').value.trim(), desc = $('s-desc').value.trim(), occ = $('s-occ').value.trim(), price = Math.round(+$('s-price').value), from = $('s-from').value, to = $('s-to').value;
      if (!name) return msg('Enter the drink name.');
      if (!(price > 0)) return msg('Enter a price above 0.');
      if (!from || !to) return msg('Pick the start and end dates.');
      if (to < from) return msg('The end date must be on or after the start date.');
      const a = read(K.specials, []); a.push({ id: Date.now(), name, desc, occ, price, from, to, off: false });
      write(K.specials, a); showView(); msg(`Added ${name}. It shows on the menu page during those dates.`);
    }
    if (f.id === 'addPromo') {
      if (!guard('promos')) return;
      const code = $('p-code').value.trim().toUpperCase(), type = $('p-type').value, value = +$('p-val').value, min = Math.round(+$('p-min').value) || 0, exp = $('p-exp').value, a = read(K.promos, []);
      if (!/^[A-Z0-9]{3,16}$/.test(code)) return msg('Code: 3–16 letters or numbers, no spaces.');
      if (!(value > 0) || (type === 'percent' && value > 100)) return msg(type === 'percent' ? 'Percent must be between 1 and 100.' : 'Enter an amount above 0.');
      if (a.some((p) => p.code === code)) return msg('That code already exists.');
      a.push({ code, type, value: Math.round(value), min, exp, off: false, used: 0 });
      write(K.promos, a); showView(); msg(`Added ${code}.`);
    }
    if (f.id === 'addAdmin') {
      if (!guard('admins')) return;
      const name = $('n-name').value.trim(), email = $('n-email').value.trim().toLowerCase(), pw = $('n-pw').value, role = $('n-role').value, a = read(K.admins, {});
      if (!name) return msg('Enter a name.');
      if (!/^\S+@\S+\.\S+$/.test(email)) return msg('Enter a valid email.');
      if (pw.length < 8) return msg('Password needs 8+ characters.');
      if (a[email]) return msg('That admin already exists.');
      a[email] = { name, role, mustChange: true, ...(await mkHash(pw)) };
      write(K.admins, a); flash = `Added <b>${esc(email)}</b> (${role}). Temporary password: <code>${esc(pw)}</code> — they must change it at first login.`; showView();
    }
    if (f.id === 'pwForm') {
      const m = guard('account'); if (!m) return;
      const cur = $('p-cur').value, np = $('p-new').value, con = $('p-con').value;
      if ((await hashPw(cur, m.salt)) !== m.hash) return msg('Current password is incorrect.');
      if (np.length < 8) return msg('New password needs 8+ characters.');
      if (np === cur) return msg('Choose a different password.');
      if (np !== con) return msg('Passwords do not match.');
      const a = read(K.admins, {});
      a[m.email] = { ...a[m.email], ...(await mkHash(np)), mustChange: false };
      write(K.admins, a); flash = 'Password updated.'; showView();
    }
  });

  seedAdmin().then(showView).catch(() => { document.body.insertAdjacentHTML('afterbegin', '<p class="adm__warn">The admin panel needs https or localhost (Live Server works).</p>'); });
})();