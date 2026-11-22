/* Functionality only. All menu / add-on / hours text lives in the HTML.
   Used by about.html, menu.html and addons.html */
const $ = (id) => document.getElementById(id);
const peso = (n) => '₱' + Number(n).toLocaleString('en-PH');

/* ---------- Mobile menu ---------------------------------------------------- */
(() => {
  const header = document.querySelector('.header'), btn = $('navToggle');
  if (btn) btn.addEventListener('click', () => btn.setAttribute('aria-expanded', header.classList.toggle('is-menu')));
  document.querySelectorAll('.nav__link').forEach((a) => a.addEventListener('click', () => { header.classList.remove('is-menu'); if (btn) btn.setAttribute('aria-expanded', false); }));
})();

/* ---------- Cart (saved in localStorage, shared with index.html) ------------ */
let cart = {};
try { cart = JSON.parse(localStorage.getItem('cc-cart') || '{}'); } catch (e) { cart = {}; }
const save = () => { try { localStorage.setItem('cc-cart', JSON.stringify(cart)); } catch (e) { } };

/* Add-ons that can be attached to a drink (same list as addons.html) */
const ADDONS = [
  ['Espresso', [['Extra Shot', 40], ['Decaf Swap', 30]]],
  ['Milk', [['Oat Milk', 45], ['Almond Milk', 45]]],
  ['Syrups', [['Vanilla Syrup', 25], ['Caramel Syrup', 25], ['Hazelnut Syrup', 25]]],
  ['Toppings', [['Whipped Cream', 20], ['Popping Boba', 30], ['Choco Drizzle', 15]]]
];
const ADDON_PRICE = Object.fromEntries(ADDONS.flatMap(([, items]) => items));
const DRINK_CATS = ['hot-coffee', 'ice-blended', 'non-coffee', 'yakult', 'tea'];   // food cannot take add-ons
const isDrink = (key) => DRINK_CATS.includes(key.split(':')[0]);
const addonsOf = (line) => (line.addons || []).filter((a) => a in ADDON_PRICE);
const unitPrice = (line) => line.price + addonsOf(line).reduce((s, a) => s + ADDON_PRICE[a], 0);
let openLine = null;   // which drink's add-on list is open in the cart

function cartLine(k) {
  const l = cart[k], adds = addonsOf(l);
  let extra = '';
  if (isDrink(k)) {
    const open = openLine === k;
    extra = `<div class="cart__extra"><button class="cart__addon-btn" type="button" data-open="${k}" aria-expanded="${open}">Add-ons${adds.length ? ' (' + adds.length + ')' : ''}</button>`;
    if (open) {
      extra += '<div class="cart__addons">' + ADDONS.map(([group, items]) =>
        `<fieldset><legend>${group}</legend>` + items.map(([name, price]) =>
          `<label><input type="checkbox" data-line="${k}" data-addon="${name}"${adds.includes(name) ? ' checked' : ''}> ${name} <b>+${peso(price)}</b></label>`).join('') + '</fieldset>').join('')
        + (l.qty > 1 ? `<p class="cart__note">Applies to all ${l.qty} in this line.</p>` : '') + '</div>';
    }
    extra += '</div>';
  }
  return `<div class="cart__line"><span class="cart__name">${l.name}<small>${peso(unitPrice(l))}</small>${adds.length ? `<small>+ ${adds.join(', ')}</small>` : ''}</span>
        <span class="qty"><button type="button" data-k="${k}" data-d="-1" aria-label="Remove one">−</button>${l.qty}<button type="button" data-k="${k}" data-d="1" aria-label="Add one">+</button></span>${extra}</div>`;
}
function renderCart() {
  if (!$('cartBody')) return;   // no order drawer on this page
  const keys = Object.keys(cart);
  $('cartCount').textContent = keys.reduce((s, k) => s + cart[k].qty, 0);
  $('cartTotal').hidden = !keys.length;
  $('totalAmt').textContent = peso(keys.reduce((s, k) => s + cart[k].qty * unitPrice(cart[k]), 0));
  $('cartBody').innerHTML = keys.length
    ? keys.map(cartLine).join('')
    : '<p>Nothing here yet — add something from the menu.</p><a class="btn" href="/Group8/AmenCode/menu.html">Browse the menu</a>';
  syncAddonPage();
}
function toggleCart(open) {
  $('cart').classList.toggle('is-open', open);
  $('scrim').classList.toggle('is-open', open);
  $('cart').setAttribute('aria-hidden', !open);
}
function addToCart(key, name, price, btn) {
  cart[key] = cart[key] || { name, price: +price, qty: 0 };
  cart[key].qty++;
  save(); renderCart();
  if (btn) { btn.classList.add('is-added'); setTimeout(() => btn.classList.remove('is-added'), 700); }
}
$('cartBody')?.addEventListener('click', (e) => {
  const b = e.target.closest('[data-k]');
  if (!b) return;
  cart[b.dataset.k].qty += +b.dataset.d;
  if (cart[b.dataset.k].qty < 1) delete cart[b.dataset.k];
  save(); renderCart();
});
/* Add-ons for one drink: open/close the list, tick/untick a add-on */
function toggleAddon(key, name, on) {
  const line = cart[key];
  if (!line) return;
  const set = new Set(addonsOf(line));
  if (on) set.add(name); else set.delete(name);
  line.addons = [...set];
  save(); renderCart();
}
$('cartBody')?.addEventListener('click', (e) => {
  const o = e.target.closest('[data-open]');
  if (!o) return;
  openLine = openLine === o.dataset.open ? null : o.dataset.open;
  renderCart();
  const again = [...$('cartBody').querySelectorAll('[data-open]')].find((x) => x.dataset.open === o.dataset.open);
  if (again) again.focus();                                   // keep keyboard focus after redraw
});
$('cartBody')?.addEventListener('change', (e) => {
  const c = e.target.closest('[data-addon]');
  if (!c) return;
  const { line, addon } = c.dataset;
  toggleAddon(line, addon, c.checked);
  const again = [...$('cartBody').querySelectorAll('[data-addon]')].find((x) => x.dataset.line === line && x.dataset.addon === addon);
  if (again) again.focus();
});

/* Add-ons page: "Adding to" picker decides which drink the + buttons go to */
function markAddonButtons() {
  const key = $('addonTarget').value, on = key && cart[key] ? addonsOf(cart[key]) : [];
  document.querySelectorAll('button.add[data-key^="addon:"]').forEach((b) => {
    const is = on.includes(b.dataset.key.slice(6));
    b.classList.toggle('is-added', is);
    b.setAttribute('aria-pressed', is);
  });
}
function syncAddonPage() {
  const sel = $('addonTarget');
  if (!sel) return;
  const drinks = Object.keys(cart).filter(isDrink);
  const keep = drinks.includes(sel.value) ? sel.value : (drinks[drinks.length - 1] || '');
  sel.innerHTML = drinks.length
    ? drinks.map((k) => `<option value="${k}">${cart[k].name}${cart[k].qty > 1 ? ' ×' + cart[k].qty : ''}</option>`).join('')
    : '<option value="">No drinks in your order yet</option>';
  sel.value = keep;
  sel.disabled = !drinks.length;
  markAddonButtons();
}
function attachFromPage(b) {
  const key = $('addonTarget').value, msg = $('addonMsg');
  if (!key || !cart[key]) { msg.textContent = 'Add a drink to your order first, then choose its add-ons here.'; return; }
  const name = b.dataset.key.slice(6), on = !addonsOf(cart[key]).includes(name);
  toggleAddon(key, name, on);
  msg.textContent = `${on ? 'Added' : 'Removed'} ${name} ${on ? 'to' : 'from'} ${cart[key].name}.`;
}
if ($('addonTarget')) $('addonTarget').addEventListener('change', markAddonButtons);

if ($('cart')) {   // pages without the order drawer (admin login) skip this
  $('openCart').onclick = () => toggleCart(true);
  $('closeCart').onclick = $('scrim').onclick = () => toggleCart(false);
}
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') toggleCart(false); });
renderCart();

/* Any "+" button with data-key / data-name / data-price adds to the cart.
   Add-on buttons (data-key starts with "addon:") attach to a drink instead. */
document.addEventListener('click', (e) => {
  const b = e.target.closest('button.add');
  if (!b) return;
  if (b.dataset.key.startsWith('addon:')) attachFromPage(b);
  else addToCart(b.dataset.key, b.dataset.name, b.dataset.price, b);
});

/* ---------- Newsletter ------------------------------------------------------ */
$('subscribe')?.addEventListener('submit', (e) => {
  e.preventDefault();
  const ok = /^\S+@\S+\.\S+$/.test($('email').value.trim());
  $('subMsg').textContent = ok ? "Thanks! You're on the list." : 'Please enter a valid email address.';
  if (ok) $('email').value = '';
});

/* ---------- Hours: highlight today + open/closed label (About) -------------- */
if ($('hours')) {
  const now = new Date(), today = now.getDay(), hr = now.getHours() + now.getMinutes() / 60;
  const rows = $('hours').rows;
  const close = (d) => (/3 AM/.test(rows[d].cells[1].textContent) ? 3 : 0);
  rows[today].classList.add('is-today');
  rows[today].cells[0].textContent += ' · today';
  const yClose = close((today + 6) % 7);
  const open = hr >= 12 || hr < yClose, until = hr >= 12 ? close(today) : yClose;
  const label = open ? `Open now · until ${until ? until + ' AM' : 'midnight'}` : 'Closed · opens 12 noon';
  document.querySelectorAll('[data-open-label]').forEach((el) => (el.textContent = label));
  if (!open) document.querySelectorAll('.status-pill__dot').forEach((el) => (el.style.background = '#999'));
}

/* ---------- Menu: category tabs --------------------------------------------- */
if ($('tabs')) {
  const tabs = [...document.querySelectorAll('.tab')], panels = [...document.querySelectorAll('.menu__list')];
  const show = (id, push) => {
    if (!panels.some((p) => p.id === id)) id = panels[0].id;
    tabs.forEach((t) => { const on = t.dataset.tab === id; t.classList.toggle('is-on', on); t.setAttribute('aria-selected', on); });
    panels.forEach((p) => (p.hidden = p.id !== id));
    if (push) history.replaceState(null, '', '#' + id);
  };
  $('tabs').addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (t) show(t.dataset.tab, true); });
  show(location.hash.slice(1));
}

/* ---------- Menu: pick your drink -------------------------------------------- */
if ($('cups')) {
  const cups = [...document.querySelectorAll('.cup')];
  let sel = cups.findIndex((c) => c.classList.contains('is-on')) || 0;
  const pick = (i) => {
    sel = i; const d = cups[i].dataset;
    cups.forEach((c, j) => { c.classList.toggle('is-on', j === i); c.setAttribute('aria-checked', j === i); c.firstElementChild.textContent = j === i ? '✓' : j + 1; });
    $('pNo').textContent = `No. ${i + 1} of ${cups.length} · Favorite`;
    $('pName').textContent = d.name; $('pDesc').textContent = d.desc;
    $('pPrice').textContent = peso(d.price); $('pSwatch').style.background = d.color;
    if (d.img && $('pImg')) {
      $('pImg').src = d.img;
      $('pImg').alt = d.name;
    }
  };
  $('cups').addEventListener('click', (e) => { const c = e.target.closest('.cup'); if (c) pick(cups.indexOf(c)); });
  $('pAdd').addEventListener('click', () => { const d = cups[sel].dataset; addToCart(d.key, d.name + ' (L)', d.price); toggleCart(true); });
}

/* ---------- Account button in the header (every page) ------------------------ */
const SESSION_KEY = 'cc-session';   // who is signed in (login.html saves it here)

function getSession() {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY));
    return s && s.email ? s : null;
  } catch (err) { return null; }
}

function signOut() {
  try { localStorage.removeItem(SESSION_KEY); } catch (err) { /* nothing to do */ }
  document.dispatchEvent(new Event('session-change'));
}

function renderAccountMenu() {
  const s = getSession();
  $('accountBtn').classList.toggle('is-in', !!s);
  $('accountBtn').setAttribute('aria-label', s ? 'Account: ' + (s.name || s.email) : 'Account, not signed in');
  $('accountOut').hidden = !!s;
  $('accountIn').hidden = !s;
  if (s) {
    $('accountName').textContent = s.name || s.email;
    $('accountEmail').textContent = s.email;
  }
}

function initAccountMenu() {
  const btn = $('accountBtn');
  const panel = $('accountPanel');

  function setOpen(open) {
    panel.hidden = !open;
    btn.setAttribute('aria-expanded', open);
    if (open) {                                   // close the phone menu so they don't overlap
      document.querySelector('.header').classList.remove('is-menu');
      const toggle = $('navToggle');
      if (toggle) toggle.setAttribute('aria-expanded', 'false');
    }
  }

  btn.addEventListener('click', () => setOpen(panel.hidden));
  $('accountOutBtn').addEventListener('click', () => { signOut(); setOpen(false); btn.focus(); });
  document.addEventListener('click', (e) => {
    if (!panel.hidden && !e.target.closest('#account')) setOpen(false);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !panel.hidden) { setOpen(false); btn.focus(); }
  });
  document.addEventListener('session-change', renderAccountMenu);
  window.addEventListener('storage', () => document.dispatchEvent(new Event('session-change')));   // other tabs
  renderAccountMenu();
}
if ($('accountBtn')) initAccountMenu();

/* ---------- Sign in / Create account (login.html only) ----------------------- */
function initAccountPage() {
  const EMAIL_OK = /^\S+@\S+\.\S+$/;     // same email check as the newsletter form
  const USERS_KEY = 'cc-users';          // all accounts made in this browser

  // localStorage can be blocked (private mode), so every read/write is wrapped
  function read(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (err) { return null; }
  }
  function write(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch (err) { return false; }
  }
  function remove(key) {
    try { localStorage.removeItem(key); } catch (err) { /* nothing to do */ }
  }

  // ---- Password hashing -----------------------------------------------
  // The password itself is never saved, only a salted hash of it.
  const toHex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
  const fromHex = (hex) => new Uint8Array(hex.match(/../g).map((h) => parseInt(h, 16)));

  async function hashPassword(password, saltHex) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt: fromHex(saltHex), iterations: 100000, hash: 'SHA-256' }, key, 256);
    return toHex(bits);
  }
  const newSalt = () => toHex(crypto.getRandomValues(new Uint8Array(16)));

  // ---- Messages under each field ---------------------------------------
  function setError(inputId, message) {
    $(inputId + '-msg').textContent = message;
    $(inputId).setAttribute('aria-invalid', message ? 'true' : 'false');
  }
  function clearErrors(form) {
    form.querySelectorAll('input').forEach((input) => setError(input.id, ''));
    $(form.id.replace('-form', '-status')).textContent = '';
  }
  function busy(form, on) {
    const button = form.querySelector('[type="submit"]');
    button.disabled = on;
    button.dataset.label = button.dataset.label || button.textContent;
    button.textContent = on ? 'Please wait' : button.dataset.label;
  }

  // ---- Switching between Sign in / Create account / Signed in ----------
  let active = 'signin';

  function render() {
    const session = getSession();
    const signedIn = !!session;

    $('authSwitch').hidden = signedIn;
    $('signin').hidden = signedIn || active !== 'signin';
    $('signup').hidden = signedIn || active !== 'signup';
    $('welcome').hidden = !signedIn;

    document.querySelectorAll('.auth__switch .btn').forEach((b) => {
      const on = b.dataset.tab === active;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on);
    });

    if (signedIn) $('welcome-name').textContent = String(session.name || session.email).split(' ')[0];
  }

  document.querySelectorAll('.auth__switch .btn').forEach((b) => {
    b.addEventListener('click', () => { active = b.dataset.tab; render(); });
  });

  // ---- Show / hide password -------------------------------------------
  document.querySelectorAll('[data-show]').forEach((b) => {
    b.addEventListener('click', () => {
      const input = $(b.dataset.show);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      b.textContent = show ? 'Hide' : 'Show';
      b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });

  // ---- Start / end a session ------------------------------------------
  function startSession(email, name) {
    write(SESSION_KEY, { email, name });
    document.dispatchEvent(new Event('session-change'));   // updates this page and the header button
    $('welcome-title').focus();
  }

  $('signOut').addEventListener('click', () => {
    signOut();
    $('signin-email').focus();
  });

  // ---- Sign in ---------------------------------------------------------
  $('signin-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    clearErrors(form);

    const email = $('signin-email').value.trim().toLowerCase();
    const password = $('signin-password').value;

    if (!EMAIL_OK.test(email)) setError('signin-email', 'Please enter a valid email address.');
    if (!password) setError('signin-password', 'Please enter your password.');
    const bad = form.querySelector('[aria-invalid="true"]');
    if (bad) return bad.focus();

    busy(form, true);
    try {
      const user = (read(USERS_KEY) || {})[email];
      const hash = user ? await hashPassword(password, user.salt) : '';
      if (user && hash === user.hash) {
        form.reset();
        startSession(email, user.name);
      } else {
        $('signin-status').textContent = 'Email or password is incorrect.';
      }
    } catch (err) {
      $('signin-status').textContent = 'Sign in is not available in this browser. Open the site over https.';
    }
    busy(form, false);
  });

  // ---- Create account --------------------------------------------------
  $('signup-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.currentTarget;
    clearErrors(form);

    const name = $('signup-name').value.trim();
    const email = $('signup-email').value.trim().toLowerCase();
    const password = $('signup-password').value;
    const confirm = $('signup-confirm').value;

    if (!name) setError('signup-name', 'Please enter your name.');
    if (!EMAIL_OK.test(email)) setError('signup-email', 'Please enter a valid email address.');
    if (password.length < 8) setError('signup-password', 'Use at least 8 characters.');
    if (confirm !== password) setError('signup-confirm', 'The passwords do not match.');
    const bad = form.querySelector('[aria-invalid="true"]');
    if (bad) return bad.focus();

    const users = read(USERS_KEY) || {};
    if (users[email]) {
      setError('signup-email', 'An account with this email already exists. Try signing in.');
      return $('signup-email').focus();
    }

    busy(form, true);
    try {
      const salt = newSalt();
      users[email] = { name, salt, hash: await hashPassword(password, salt) };
      if (write(USERS_KEY, users)) {
        form.reset();
        startSession(email, name);
      } else {
        $('signup-status').textContent = 'Could not save your account in this browser.';
      }
    } catch (err) {
      $('signup-status').textContent = 'Sign up is not available in this browser. Open the site over https.';
    }
    busy(form, false);
  });

  // Any sign in / sign out (here, in the header, or in another tab) refreshes the page
  document.addEventListener('session-change', () => {
    if (!getSession()) active = 'signin';
    render();
  });

  // login.html#signup opens the Create account form
  if (location.hash === '#signup') active = 'signup';
  render();
}
if ($('signin-form')) initAccountPage();