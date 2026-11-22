'use strict';
// App-wide pages: settings and support.

// ================================================================ settings

function SettingsPage() {
  const st = () => S.hub.settings;
  const items = [];
  const sw = (key, label, invert) => {
    const el = toggle(label, invert ? !st()[key] : st()[key], v => patchSettings({ [key]: invert ? !v : v }));
    items.push(() => el.set(invert ? !st()[key] : st()[key]));
    return el;
  };
  const mac = S.hub.platform === 'mac';
  const tg = h('div.col');
  const lan = h('div.col');
  const langBox = h('div.row');
  const accentBox = h('div.swatches');
  const drawAccents = () => fill(accentBox, ACCENTS.map(c => h('span.swatch' + ((st().accent || ACCENTS[0]) === c ? '.on' : ''),
    { style: 'background:' + c, title: c, onclick: () => { patchSettings({ accent: c === ACCENTS[0] ? '' : c }); applyAccent(); drawAccents(); } })));
  drawAccents();
  const el = h('div.page', null, h('div.scroll', null,
    h('div.ptitle', null, h('h1', { text: t('nav.settings') }), h('span.sub', { text: t('set.subtitle') })),
    h('div.grid2', null,
      group(t('set.background'),
        sw('loginAtStartup', t('set.loginAtStartup')),
        sw('keepAwake', t('set.keepAwake')),
        sw('menuTime', mac ? t('set.menuTime') : t('set.trayTime')),
        mac ? sw('hideDock', t('set.dock'), true) : null,
        hint(mac ? t('set.bgHintMac') : t('set.bgHintWin'))),
      group('Telegram', tg),
      group(t('set.phone'), lan),
      group(t('set.language'), langBox))));
  langBox.append(...[['ru', 'Русский'], ['en', 'English']].map(([l, n]) => {
    const r = makeToggle('radio', n, S.lang === l, on => on && setLang(l, true));
    r.input.name = 'lang';
    return r;
  }));
  let tgCode = '';
  const m1 = memo(), m2 = memo();
  function drawTG() {
    const T = st().telegram || {};
    if (!T.token) {
      const tok = field({ class: 'wide mono', placeholder: t('set.tgToken'), spellcheck: 'false' });
      const err = h('div.error');
      fill(tg, hint(t('set.tgHow')), h('div.row', null, tok, btn(t('set.tgConnect'), async () => {
        err.textContent = '';
        try { tgCode = await call('tgConnect', { token: tok.value }); drawTG(); }
        catch (e) { err.textContent = tr(e.message); }
      }, 'primary', 'send')), err);
    } else if (!T.chatID) {
      const cmd = '/start ' + (tgCode || '…');
      if (!tgCode) call('tgCode').then(c => { if (c) { tgCode = c; drawTG(); } }).catch(() => {});
      fill(tg, hint(t('set.tgSend', '@' + (T.bot || 'bot'))),
        h('div.row', null, h('code.addr.sunken.grow', { text: cmd }), btn('', () => copy(cmd), 'icon', 'copy')),
        h('div.row.wrap', null, btn(t('set.tgOpen'), () => openURL(`https://t.me/${T.bot}?start=${tgCode}`), 'sm primary', 'send'),
          btn(t('set.tgOff'), () => act('tgDisconnect').catch(() => {}), 'sm ghost')),
        hint(t('set.tgWait')));
    } else {
      const N = T.notify || {};
      fill(tg, h('div.row', null, h('span.led.ok'), h('span', { text: t('set.tgBound', '@' + T.bot, T.user || '') })),
        h('div.label', { text: t('set.notify') }),
        h('div.tgn', null, ['cards', 'goals', 'pause', 'keys', 'free', 'chat'].map(k =>
          check(t('tg.n.' + k), N[k], v => patchSettings({ telegram: { notify: { [k]: v } } })))),
        hint(t('set.tgSafe')),
        h('div.row', null, btn(t('set.tgOff'), () => act('tgDisconnect').catch(() => {}), 'sm ghost')));
    }
  }
  function drawLAN() {
    const url = S.hub.lanURL;
    fill(lan, sw('lan', t('set.lan')),
      url ? h('div.row', { style: 'align-items:flex-start;gap:14px' },
        h('div.qr.small', null, qrSVG(url, { badge: false })),
        h('div.col', { style: 'min-width:0' }, hint(t('set.lanHint')),
          h('div.row', null, btn(t('btn.copy'), () => copy(url), 'sm', 'copy'))))
        : hint(st().lan ? t('stats.loading') : t('set.lanOff')));
  }
  return {
    el,
    update() {
      for (const f of items) f();
      const T = st().telegram || {};
      if (!tg.contains(document.activeElement)) m1([!!T.token, T.chatID, T.bot, T.user, T.notify, tgCode, S.lang], drawTG);
      m2([S.hub.lanURL, st().lan, S.lang], drawLAN);
    },
  };
}

// ================================================================ support

// Support: a word from the author and what the app is, and beside it the two ways to send
// something: USDT with its code and address, and Binance Pay.
function SupportPage() {
  const coin = c => h('span.coin', { text: c });
  const soon = (icon, label) => h('span.btn.sm', null, ic(icon), h('span', null, label, h('small', { text: ' · ' + t('set.soon') })));
  const left = h('div.raised.sup-note', null,
    h('span.sup-heart', null, ic('heart')),
    h('h1', { text: t('sup.title') }),
    h('p', { text: t('sup.text') }),
    h('div.sup-about', null,
      h('div.row', null, h('span.ava.sm', { text: 'E' }), h('div', null, h('b', { text: 'excruciation' }), h('div.dim', { text: t('sup.author') }))),
      h('div.grow'),
      h('div.sup-ver', null, h('div.v', { text: 'SteamIdleMachine ' + S.hub.version }), h('div.about-links', null, soon('send', 'Telegram'), soon('globe', t('set.site'))))));
  const right = h('div.raised.sup-pay', null,
    h('div.row', null, coin('\u20AE'), h('div', null, h('b', { text: 'USDT \u00B7 TRC20' }), h('div.dim', { text: t('sup.tron') }))),
    h('div.sup-qr', null,
      h('div.qr.small', null, qrSVG(TRC20, { badge: false })),
      h('div.col', { style: 'min-width:0;flex:1;gap:10px' },
        h('div.dim', { text: t('sup.wallet') }),
        h('div.sup-addr', null, TRC20.match(/.{1,4}/g).map(g => h('span', { text: g }))),
        h('div', null, btn(t('btn.copy'), () => copy(TRC20), 'sm primary', 'copy')))),
    h('div.sup-warn', null, ic('lock'), h('span', { text: t('sup.network') })),
    h('div.sep'),
    h('div.row', null, coin('B'), h('div', null, h('b', { text: 'Binance Pay' }), h('div.dim', { text: 'Pay ID' })), h('span.grow'),
      h('span.sup-id', { text: BINANCE_ID.replace(/(\d{3})(?=\d)/g, '$1 ') }),
      h('button.btn.icon', { type: 'button', title: t('btn.copy'), onclick: () => copy(BINANCE_ID) }, ic('copy'))));
  const el = h('div.page', null, h('div.scroll', null, h('div.sup', null, left, right)));
  return { el, update() {} };
}
