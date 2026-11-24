// ---- Home page data --------------------------------------------------
const DRINKS = [
  { key: 'ice-blended:0:Large', name: 'Choco Chip Cream', desc: 'Blended chocolate, choco chips, whipped cream', price: 200, color: '#6b4a35', img: '/AmenPhoto/best.jpg' },
  { key: 'ice-blended:4:Large', name: 'Caramel Coffee', desc: 'Blended coffee with caramel', price: 200, color: '#a8794f', img: '/AmenPhoto/caramel-coffee.jpg' },
  { key: 'yakult:2:Large', name: 'Passionfruit Yakult', desc: 'Yakult shaken with passionfruit', price: 140, color: '#e8a33a', img: '/AmenPhoto/passionfruit-yakult.jpg' },
  { key: 'yakult:1:Large', name: 'Green Apple Yakult', desc: 'Yakult shaken with green apple', price: 140, color: '#9db35a', img: '/AmenPhoto/green-apple-yakult.jpg' }
];

const HOURS = [
  ['Sunday', '12 NN — 3 AM'], ['Monday', '12 NN — 12 MN'], ['Tuesday', '12 NN — 12 MN'],
  ['Wednesday', '12 NN — 3 AM'], ['Thursday', '12 NN — 3 AM'], ['Friday', '12 NN — 3 AM'],
  ['Saturday', '12 NN — 3 AM']
];

let selected = 0;

// ---- Ticker ----------------------------------------------------------
const bits = ['Open daily from 12 noon', 'Until 3 AM, Wed–Sun', 'Dine-in · Takeout · Pickup', 'Tejeron St., Sta. Ana', 'Tara, kape!'];
const run = bits.map((b) => `<span>${b}</span><i>°C</i>`).join('');
$('ticker').innerHTML = run + run;

// ---- Drink picker ----------------------------------------------------
$('cups').innerHTML = DRINKS.map((d, i) =>
  `<button class="cup" type="button" role="radio" aria-label="${d.name}" data-i="${i}"><span class="cup__num">${i + 1}</span></button>`).join('');

function select(i) {
  selected = i;
  const d = DRINKS[i];
  document.querySelectorAll('.cup').forEach((c, j) => {
    c.classList.toggle('is-on', j === i);
    c.setAttribute('aria-checked', j === i);
    c.firstElementChild.textContent = j === i ? '✓' : j + 1;
  });
  $('pNo').textContent = `No. ${i + 1} of ${DRINKS.length} · Favorite`;
  $('pName').textContent = d.name;
  $('pDesc').textContent = d.desc;
  $('pPrice').textContent = peso(d.price);
  $('pSwatch').style.background = d.color;
  if (d.img && $('pImg')) {
    $('pImg').src = d.img;
    $('pImg').alt = d.name;
  }
}

$('cups').addEventListener('click', (e) => {
  const c = e.target.closest('.cup');
  if (c) select(+c.dataset.i);
});

$('prevCup')?.addEventListener('click', () => {
  select((selected - 1 + DRINKS.length) % DRINKS.length);
});

$('nextCup')?.addEventListener('click', () => {
  select((selected + 1) % DRINKS.length);
});

// Uses page.js's shared cart (cc-cart in localStorage) with add-ons, promos & checkout
$('pAdd').addEventListener('click', () => {
  const d = DRINKS[selected];
  if (unavailable(d.key)) return;
  addToCart(d.key, d.name + ' (L)', d.price);
  toggleCart(true);
});

select(0);

// ---- Hours + open/closed status --------------------------------------
const now = new Date();
const today = now.getDay();
$('hours').innerHTML = HOURS.map(([day, time], i) =>
  `<tr class="${i === today ? 'is-today' : ''}"><th scope="row">${day}${i === today ? ' · today' : ''}</th><td>${time}</td></tr>`).join('');

const closeHour = (d) => (/3 AM/.test(HOURS[d][1]) ? 3 : 0);
const hr = now.getHours() + now.getMinutes() / 60;
const yesterdayClose = closeHour((today + 6) % 7);
const isOpen = hr >= 12 || hr < yesterdayClose;
const closesAt = hr >= 12 ? closeHour(today) : yesterdayClose;
const label = isOpen ? `Open now · until ${closesAt ? closesAt + ' AM' : 'midnight'}` : 'Closed · opens 12 noon';
document.querySelectorAll('[data-open-label]').forEach((el) => (el.textContent = label));
document.querySelectorAll('.status-pill__dot').forEach((el) => { if (!isOpen) el.style.background = '#999'; });

// ---- Nav active state on scroll --------------------------------------
const links = document.querySelectorAll('.nav__link');
window.addEventListener('scroll', () => {
  const y = window.scrollY;
  links[0].classList.toggle('is-active', y < 600);
}, { passive: true });