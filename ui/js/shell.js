'use strict';
// Shell: routing, header, sidebar, phone tab bar, language and the live event stream.

const SECTION_VIEWS = { hours: HoursSec, cards: CardsSec, ach: AchSec, inventory: InventorySec, keys: KeysSec, free: FreeSec, profile: ProfileSec, trade: TradeSec, stats: StatsSec, acct: AcctSec };

// ================================================================ shell

let view = null, viewKey = '';

function route() {
  const p = location.hash.replace(/^#\/?/, '').split('/');
  if (p[0] === 'a' && p[1]) return { page: 'acct', id: decodeURIComponent(p[1]), sec: SECTION_VIEWS[p[2]] ? p[2] : 'hours' };
  if (p[0] === 'settings' || p[0] === 'support') return { page: p[0] };
  return { page: 'hub' };
}
function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}
// the account the sidebar works with: the one open now, or the last one opened
function curAccount() {
  const accs = S.hub?.accounts || [];
  const r = route();
  if (r.page === 'acct') S.cur = r.id;
  if (!accs.some(a => a.id === S.cur)) S.cur = accs[0]?.id || '';
  return S.cur;
}

function render(force) {
  if (!S.hub) return;
  closeLayers();
  const r = route();
  if (r.page === 'acct' && !S.hub.accounts?.some(a => a.id === r.id)) { location.hash = '#/'; return; }
  const key = r.page === 'acct' ? 'acct:' + r.id : r.page;
  if (!force && key === viewKey && view) {
    if (r.page === 'acct' && view.sec !== r.sec) view.setSection(r.sec);
    chrome();
    return;
  }
  view?.destroy?.();
  viewKey = key;
  S.onSearch = null;
  view = r.page === 'acct' ? AcctPage(r.id, r.sec) : r.page === 'settings' ? SettingsPage() : r.page === 'support' ? SupportPage() : HubPage();
  document.getElementById('stage').replaceChildren(view.el);
  view.update();
  chrome();
}

// ---------------------------------------------------------------- persistent chrome
// Built once; later only text and classes change, so hover states never flicker.
const CH = {};
function buildChrome() {
  CH.title = document.getElementById('title');
  CH.center = document.getElementById('center');
  CH.q = field({ placeholder: '', oninput: () => S.onSearch?.(CH.q.value.trim().toLowerCase()) });
  CH.search = h('div.ksearch', null, ic('search'), CH.q, h('kbd', { text: navigator.platform.includes('Mac') ? '⌘K' : 'Ctrl K' }));
  CH.running = h('span.row.hide-sm', { style: 'gap:7px;color:var(--dim);font-size:12px', hidden: true }, h('span.led.idle'), CH.runText = h('span'));
  document.getElementById('topRight').append(CH.running);
  addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const id = curAccount();
      if (id && !(route().page === 'acct' && route().sec === 'hours')) go(`#/a/${encodeURIComponent(id)}/hours`);
      setTimeout(() => CH.q.focus(), 60);
    }
  });
}

function tickClock() {}

// Light or dark, remembered on this device. The new look grows out of the button as a circle.
function toggleTheme(from) {
  const root = document.documentElement;
  const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
  const apply = () => { root.dataset.theme = next; localStorage.theme = next; footBox(route()); };
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return apply();
  const r = from.getBoundingClientRect();
  const x = r.left + r.width / 2, y = r.top + r.height / 2;
  const far = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  root.classList.add('theme-vt');
  const vt = document.startViewTransition(apply);
  vt.ready.then(() => root.animate(
    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${far}px at ${x}px ${y}px)`] },
    { duration: 700, easing: 'cubic-bezier(.4, 0, .2, 1)', pseudoElement: '::view-transition-new(root)' })).catch(() => {});
  vt.finished.finally(() => root.classList.remove('theme-vt'));
}

function chrome() {
  const r = route();
  const id = curAccount();
  const accs = S.hub?.accounts || [];
  const b = S.bots[id];

  // title: page name, a count, and the section's live info (session time and the like)
  let name = t('nav.overview'), count = null;
  if (r.page === 'acct') { name = secLabel(r.sec); count = r.sec === 'hours' ? (S.games[r.id] || []).length : null; }
  else if (r.page === 'settings') { name = t('nav.settings'); count = null; }
  else if (r.page === 'support') { name = t('nav.support'); count = null; }
  const tk = name + '|' + count + '|' + (view?.info ? 'i' : '');
  if (CH.title.dataset.k !== tk) {
    CH.title.dataset.k = tk;
    fill(CH.title, h('b', { text: name }), count != null ? h('span.count', { text: count.toLocaleString(locale()) }) : null, view?.info || null);
  }
  const searching = r.page === 'acct' && r.sec === 'hours' && b?.status === 'online';
  if (searching !== !!CH.center.firstChild) fill(CH.center, searching ? CH.search : null);
  CH.q.placeholder = t('hours.search');

  const run = accs.filter(a => a.status === 'online' && a.playing > 0);
  CH.running.hidden = true;
  CH.runText.textContent = run.length ? t('head.running', run.length) : '';

  sideNav(r, id);
  meBox(r, id);
  liveBox(id);
  footBox(r);
  tabbar(r);
  applyAccent();
}

// ---------------------------------------------------------------- sidebar
function sideNav(r, id) {
  const nav = document.getElementById('nav');
  const b = S.bots[id];
  const online = b?.status === 'online';
  const ind = sec => {
    if (!b) return null;
    // one clock for the hours: the sign itself turns while games are idled
    if (sec === 'cards' && online && b.cardsOn) return h('span.led.ok');
    if (sec === 'hours') return h('span.n', { text: (online && b.hoursOn && b.playing) || '' });
    if (sec === 'cards' && b.cardsLeft) return h('span.n', { text: b.cardsLeft });
    if (sec === 'keys' && (b.keyQueue || []).length) return h('span.pill.y', { text: b.keyQueue.length });
    if (sec === 'ach' && b.achJob) return h('span.pill.y', { text: b.achJob.pending.length });
    if (sec === 'free' && anyOn(b.cfg.free, ['promos', 'queue', 'sticker', 'wishlistOn'])) return h('span.led.ok');
    if (sec === 'profile' && anyOn(b.cfg.profile, ['slideOn', 'autoOn', 'nickOn'])) return h('span.led.ok');
    if (sec === 'trade' && anyOn(b.cfg.trade, ['craft', 'gifts'])) return h('span.led.ok');
    return null;
  };
  const item = (href, icon, label, act, right, off, turning) => h('a.it' + (act ? '.act' : '') + (off ? '.off' : ''), { href },
    turning ? ic('spin', 'spin') : ic(icon), h('span.ellipsis', { text: label }), h('span.r', null, right));
  const sec = (name, icon) => item(`#/a/${encodeURIComponent(id)}/${name}`, icon, secLabel(name), r.page === 'acct' && r.sec === name, ind(name), !id, name === 'hours' && online && b?.hoursOn);
  const kids = [
    h('div.lbl', { text: t('nav.g.main') }),
    item('#/', 'home', t('nav.overview'), r.page === 'hub'),
    sec('stats', 'chart'),
    ...SECTIONS.map(([g, items]) => [h('div.lbl', { text: t(g) }), items.map(([name, icon]) => sec(name, icon))]),
    h('div.lbl', { text: t('nav.g.project') }),
    item('#/support', 'heart', t('nav.support'), r.page === 'support'),
  ];
  // Going to another section only moves the mark: the island is not built again, so what is
  // under the pointer stays as it is and nothing jumps.
  const flat = kids.flat(2);
  const k = flat.map(x => x.outerHTML.replace('class="it act', 'class="it')).join('');
  if (nav.dataset.k !== k) { nav.dataset.k = k; fill(nav, kids); }
  else {
    const now = flat.filter(x => x.matches?.('a.it'));
    nav.querySelectorAll('a.it').forEach((a, i) => a.classList.toggle('act', !!now[i]?.classList.contains('act')));
  }
}

// What the account runs now: the session clock, the games and a button to stop or start.
function liveBox(id) {
  const box = document.getElementById('live');
  const b = S.bots[id];
  if (!b || b.status !== 'online') { if (box.dataset.k) { box.dataset.k = ''; fill(box); } return; }
  const on = !!(b.hoursOn || b.cardsOn);
  const games = on ? (b.cfg?.hours?.selected || []).slice(0, 3) : [];
  const k = JSON.stringify([id, on, b.playing, games, S.lang]);
  if (box.dataset.k !== k) {
    box.dataset.k = k;
    const ring = document.createElementNS(SVGNS, 'svg');
    ring.setAttribute('viewBox', '0 0 24 24');
    ring.setAttribute('class', 'ring');
    ring.innerHTML = '<circle cx="12" cy="12" r="8.5" fill="none" stroke="currentColor" stroke-width="2.6" opacity=".25"/><path d="M12 3.5a8.5 8.5 0 0 1 8.5 8.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>';
    box._tm = h('span.tm');
    fill(box,
      on ? h('div.l1', null, ring, box._tm, h('span.covers', null, games.map(a => art(h('i'), headerArt(a), '', a)))) : null,
      h('div.l2', { style: on ? '' : 'margin-top:0' }, h('span.ellipsis', { text: on ? t('live.games', b.playing || games.length) : t('live.idle') }),
        h('button', { type: 'button', onclick: () => quickRun(id) }, ic(on ? 'stop' : 'play'), on ? t('btn.stopShort') : t('btn.start'))));
  }
  if (box._tm) box._tm.textContent = b.hoursOn ? fmtDur(b.sessionMs) : statusOf(b).text;
}

// Settings and the look, at the foot of the island.
function footBox(r) {
  const box = document.getElementById('sidefoot');
  const dark = document.documentElement.dataset.theme === 'dark';
  const k = JSON.stringify([r.page === 'settings', dark, S.lang]);
  if (box.dataset.k === k) return;
  box.dataset.k = k;
  const th = h('button.themebtn', { type: 'button', title: t('theme.title') }, ic(dark ? 'sun' : 'moon'));
  th.onclick = () => toggleTheme(th);
  fill(box, h('a.it' + (r.page === 'settings' ? '.act' : ''), { href: '#/settings' }, ic('sliders'), h('span.ellipsis', { text: t('nav.settings') })), th);
}

function meBox(r, id) {
  const box = document.getElementById('me');
  const b = S.bots[id];
  const st = statusOf(b);
  const k = JSON.stringify([id, b?.name, b?.avatar, st, S.lang]);
  if (box.dataset.k === k) return;
  box.dataset.k = k;
  if (!b) {
    fill(box, btn(t('hub.add'), addAccountDialog, 'primary grow', 'plus'));
    return;
  }
  const who = h('div.who', { onclick: () => accountMenu(who) },
    avatar(h('span.ava.sm'), b),
    h('div', { style: 'min-width:0;flex:1' }, h('div.n.ellipsis', { text: b.name || b.account }), h('div.s', null, h('span.led.' + (st.led || 'off')), h('span.ellipsis', { text: st.text }))),
    ic('next', 'chev'));
  fill(box, who);
}

function accountMenu(anchor) {
  anchor.classList.add('open');
  const id = curAccount();
  const r = route();
  const sec = r.page === 'acct' ? r.sec : 'hours';
  const accs = S.hub.accounts || [];
  closeLayers();
  const m = h('div.menu', null,
    h('div.mh', { text: t('nav.accounts') }),
    accs.map(a => h('button.acc-it' + (a.id === id ? '.cur' : ''), { type: 'button', onclick: () => { m.remove(); go(`#/a/${encodeURIComponent(a.id)}/${sec}`); } },
      avatar(h('span.ava.xs'), a), h('span.ellipsis.grow', { text: a.name || a.account }), h('span.led.' + (statusOf(a).led || 'off')))),
    h('div.sep', { style: 'margin:5px 0' }),
    h('button', { type: 'button', onclick: () => { m.remove(); addAccountDialog(); } }, ic('plus'), h('span', { text: t('hub.add') })),
    h('button', { type: 'button', onclick: () => { m.remove(); profileMenu(anchor, id); } }, ic('globe'), h('span', { text: t('ava.title') })),
    id ? h('button', { type: 'button', onclick: () => { m.remove(); go(`#/a/${encodeURIComponent(id)}/acct`); } }, ic('id'), h('span', { text: secLabel('acct') })) : null);
  document.body.append(m);
  const rc = anchor.getBoundingClientRect();
  m.style.left = rc.left + 'px';
  m.style.width = Math.max(230, rc.width) + 'px';
  m.style.top = (rc.top < innerHeight / 2 ? rc.bottom + 8 : Math.max(8, rc.top - m.offsetHeight - 8)) + 'px';
  setTimeout(() => {
    const off = e => { if (!m.contains(e.target)) { m.remove(); anchor.classList.remove('open'); document.removeEventListener('mousedown', off); } };
    document.addEventListener('mousedown', off);
  });
}

const ACCENTS = ['#a3d11c', '#3bc6e6', '#cd52d0', '#d9e14f', '#ff8a3d', '#ff4d5e', '#8b5cf6', '#e6e6e6'];
function applyAccent() {
  // one look for everyone: black on white, white on black
  document.documentElement.style.removeProperty('--accent');
}

// ---------------------------------------------------------------- phone tab bar
const TABS_ACCT = [['hours', 'clock'], ['cards', 'cards'], ['keys', 'key'], ['profile', 'user']];
function tabbar(r) {
  const bar = document.getElementById('tabbar');
  const id = curAccount();
  const b = S.bots[id];
  const base = `#/a/${encodeURIComponent(id)}/`;
  const tab = (href, icon, label, act, dot) => h('a' + (act ? '.act' : ''), { href }, ic(icon), h('span', { text: label }), dot ? h('span.dotx') : null);
  let tabs;
  if (r.page === 'acct') {
    const inMore = !TABS_ACCT.some(([s]) => s === r.sec);
    tabs = [...TABS_ACCT.map(([sec, icon]) => tab(base + sec, icon, t('tab.' + sec), r.sec === sec,
      (sec === 'hours' && b?.hoursOn) || (sec === 'cards' && b?.cardsOn))),
      h('a' + (inMore ? '.act' : ''), { href: '#', onclick: e => { e.preventDefault(); moreSheet(r); } }, ic('more'), h('span', { text: t('tab.more') }))];
  } else {
    tabs = [tab('#/', 'home', t('nav.overview'), r.page === 'hub'), id ? tab(base + 'hours', 'clock', t('tab.hours'), false) : null,
      tab('#/settings', 'sliders', t('tab.settings'), r.page === 'settings')].filter(Boolean);
  }
  const k = tabs.map(x => x.outerHTML).join('');
  if (bar.dataset.k !== k) { bar.dataset.k = k; fill(bar, tabs); }
}

function moreSheet(r) {
  closeLayers();
  const base = `#/a/${encodeURIComponent(r.id)}/`;
  const close = () => { ov.remove(); sh.remove(); };
  const item = (href, icon, label, act) => h('a' + (act ? '.act' : ''), { href, onclick: close }, ic(icon), h('span', { text: label }));
  const sh = h('div.sheet', null, h('div.grab'), h('div.grid', null,
    [...SECTIONS.flatMap(([, items]) => items), ...EXTRA_SECTIONS].map(([sec, icon]) => item(base + sec, icon, secLabel(sec), r.sec === sec)),
    item('#/', 'home', t('nav.overview')), item('#/settings', 'sliders', t('nav.settings')), item('#/support', 'heart', t('nav.support'))));
  const ov = h('div.sheet-ov', { onclick: close });
  document.body.append(ov, sh);
}

// ---------------------------------------------------------------- language
// The whole window is redrawn in one go and cross-faded, so nothing switches language late.
function setLang(l, save) {
  l = l === 'en' ? 'en' : 'ru';
  if (save) S.langAt = Date.now();
  if (l === S.lang) return;
  const apply = () => {
    S.lang = l;
    S.dict = S.i18n[l] || {};
    document.documentElement.lang = l;
    if (S.hub) render(true);
  };
  if (save) patchSettings({ lang: l });
  if (save && document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(apply);
  else apply();
}

let pending = false;
function onData() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => {
    pending = false;
    if (!view) return render();
    const r = route();
    if (r.page === 'acct' && !S.hub.accounts?.some(a => a.id === r.id)) return go('#/');
    view.update();
    chrome();
  });
}

function connect() {
  const es = new EventSource('/api/events?k=' + encodeURIComponent(KEY));
  es.onopen = () => { S.live = true; if (S.hub) chrome(); };
  es.onerror = () => { S.live = false; };
  es.addEventListener('hub', e => {
    S.live = true;
    S.hub = JSON.parse(e.data);
    S.hub.accounts ||= [];
    const ids = new Set(S.hub.accounts.map(a => a.id));
    for (const id of Object.keys(S.bots)) if (!ids.has(id)) delete S.bots[id];
    if (Date.now() - S.langAt > 3000) setLang(S.hub.settings.lang);
    applyAccent();
    if (!view) render(); else onData();
  });
  es.addEventListener('bot', e => { const d = JSON.parse(e.data); S.bots[d.id] = d; onData(); });
  es.addEventListener('games', e => { const d = JSON.parse(e.data); S.games[d.id] = d.games || []; onData(); });
  es.addEventListener('log', e => {
    const d = JSON.parse(e.data);
    if (S.logs.length && S.logs[S.logs.length - 1].id >= d.id) return;
    S.logs.push(d);
    if (S.logs.length > 400) S.logs.splice(0, S.logs.length - 400);
    onData();
  });
}

// Cards of games and items come up softly as they scroll into view. Only transform and opacity
// change, so the motion is drawn at the screen's own rate, 120 frames a second where it has them.
function revealOnScroll() {
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const sel = '.gcard, .itile';
  document.documentElement.classList.add('rv');
  const io = new IntersectionObserver(entries => {
    let i = 0;
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      const el = e.target;
      io.unobserve(el);
      el.style.transitionDelay = Math.min(i++ * 26, 260) + 'ms';
      el.classList.add('in');
      setTimeout(() => { el.style.transitionDelay = ''; el.classList.add('done'); }, 950);
    }
  }, { rootMargin: '40px 0px -3% 0px' });
  const take = n => { if (!n.classList.contains('in')) io.observe(n); };
  new MutationObserver(list => {
    for (const m of list) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches(sel)) take(n);
      n.querySelectorAll(sel).forEach(take);
    }
  }).observe(document.getElementById('stage'), { childList: true, subtree: true });
}

async function boot() {
  S.i18n = await fetch('i18n.json').then(r => r.json());
  S.lang = '';
  setLang(systemLang());
  buildChrome();
  revealOnScroll();
  document.getElementById('brand').onclick = () => go('#/');
  addEventListener('hashchange', () => render());
  addEventListener('keydown', e => { if (e.key === 'Escape') closeLayers(); });
  connect();
}
function systemLang() {
  return (navigator.language || '').startsWith('ru') ? 'ru' : 'en';
}
boot();
