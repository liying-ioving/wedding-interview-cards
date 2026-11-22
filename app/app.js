// «Вопросы» — карточки для интервью в свадебный день.
// Работает без интернета, всё хранится в памяти телефона (localStorage).
(function () {
  const KEY = 'interview.v1';
  const $app = document.getElementById('app');

  // ---------- состояние ----------
  const defaults = {
    side: 'f',          // m — сторона жениха, f — сторона невесты
    wedding: '',        // название текущей свадьбы
    started: null,      // когда начата текущая свадьба
    marks: {},          // id -> {asked, star} — только текущая свадьба
    log: [],            // события текущей свадьбы для журнала
    favs: {},           // id -> true — «мои вопросы», живут между свадьбами
    custom: [],         // свои вопросы {id, part, role, text}
    dim: false,
    hideAsked: false,
  };
  let S;
  try { S = Object.assign({}, defaults, JSON.parse(localStorage.getItem(KEY) || '{}')); }
  catch (e) { S = Object.assign({}, defaults); }
  const save = () => localStorage.setItem(KEY, JSON.stringify(S));

  // ---------- вопросы ----------
  function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return 'q' + (h >>> 0).toString(36); }
  const ALL = [];
  const byId = {};
  PARTS.forEach(p => p.q.forEach(([role, who, text, hint]) => {
    const q = { id: hash(p.id + '|' + text), part: p.id, role, who, raw: text, hint: hint || '' };
    ALL.push(q); byId[q.id] = q;
  }));
  function customQs() {
    return S.custom.map(c => ({ id: c.id, part: c.part, role: c.role || 'feel', who: 'x', raw: c.text, hint: 'Свой вопрос', custom: true }));
  }
  function allQs() { const c = customQs(); c.forEach(q => byId[q.id] = q); return ALL.concat(c); }
  const partById = Object.fromEntries(PARTS.map(p => [p.id, p]));

  // {вариант стороны жениха|вариант стороны невесты}
  function fmt(raw) { return raw.replace(/\{([^{}|]*)\|([^{}]*)\}/g, (_, m, f) => S.side === 'm' ? m : f); }
  function whoLabel(w) {
    const m = S.side === 'm';
    return { i: m ? 'Жениху' : 'Невесте', p: 'Вдвоём', g: m ? 'Друзьям жениха' : 'Подругам невесты',
             r: m ? 'Родителям жениха' : 'Родителям невесты', x: 'Свой' }[w] || '';
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // ---------- мелочи ----------
  let toastT;
  function toast(msg) { const t = document.getElementById('toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 1600); }
  const buzz = ms => { try { navigator.vibrate && navigator.vibrate(ms); } catch (e) {} };
  const pad = n => String(n).padStart(2, '0');
  const hms = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  function applyDim() { document.body.classList.toggle('dim', !!S.dim); }

  // Экран не гаснет, пока открыта колода
  let wake = null;
  async function keepAwake(on) {
    try {
      if (on && 'wakeLock' in navigator && !wake) { wake = await navigator.wakeLock.request('screen'); wake.addEventListener('release', () => wake = null); }
      if (!on && wake) { await wake.release(); wake = null; }
    } catch (e) {}
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && view.name === 'deck') keepAwake(true); });

  // ---------- навигация ----------
  let view = { name: 'home' };
  function go(v) { view = v; if (v.name !== 'deck') keepAwake(false); render(); window.scrollTo(0, 0); }
  window.addEventListener('popstate', () => { if (view.name !== 'home') { view = { name: 'home' }; render(); } });
  function push(v) { history.pushState({}, ''); go(v); }

  function render() {
    applyDim();
    ({ home: renderHome, deck: renderDeck, journal: renderJournal, tips: renderTips }[view.name])();
  }

  // ---------- главная ----------
  function sideSeg() {
    return `<div class="seg" role="tablist">
      <button data-side="f" class="${S.side === 'f' ? 'on' : ''}">Невеста</button>
      <button data-side="m" class="${S.side === 'm' ? 'on' : ''}">Жених</button></div>`;
  }
  function bindSide() {
    $app.querySelectorAll('[data-side]').forEach(b => b.onclick = () => { S.side = b.dataset.side; save(); render(); });
  }

  function renderHome() {
    const qs = allQs();
    const stars = Object.values(S.marks).filter(m => m.star).length;
    const favN = Object.keys(S.favs).filter(id => byId[id]).length;
    let html = `
      <div class="top"><h1>Вопросы<div class="sub">${qs.length} вопросов для интервью</div></h1>
        <button class="icon-btn ${S.dim ? 'on' : ''}" id="dim" title="Тёмный режим">☾</button>
        <button class="icon-btn" id="tips" title="Как задавать">?</button></div>
      <button class="wedding" id="journal">${S.wedding ? `Свадьба: <b>${esc(S.wedding)}</b>` : 'Свадьба не названа'}
        · ★ ${stars} · журнал →</button>
      ${sideSeg()}
      <div class="list">
        <div class="section-label">По ходу дня</div>`;
    PARTS.forEach(p => {
      const list = qs.filter(q => q.part === p.id);
      const done = list.filter(q => S.marks[q.id] && S.marks[q.id].asked).length;
      const st = list.filter(q => S.marks[q.id] && S.marks[q.id].star).length;
      html += `<button class="part" data-part="${p.id}"><div style="flex:1">
          <div class="t">${esc(p.title)}</div><div class="w">${esc(p.when)}</div>
          <div class="bar"><i style="width:${list.length ? Math.round(done / list.length * 100) : 0}%"></i></div></div>
        <div class="n">${done}/${list.length}${st ? `<br><b>★ ${st}</b>` : ''}</div></button>`;
    });
    html += `<div class="section-label">Подборки</div>
        <button class="part" data-part="favs"><div style="flex:1"><div class="t">♥ Мои вопросы</div>
          <div class="w">Отмеченные сердцем и свои — сохраняются между свадьбами</div></div><div class="n">${favN + S.custom.length}</div></button>
        <button class="part" data-part="all"><div style="flex:1"><div class="t">Все вопросы подряд</div>
          <div class="w">Весь банк с фильтром по темам</div></div><div class="n">${qs.length}</div></button>
      </div>`;
    $app.innerHTML = html;
    bindSide();
    $app.querySelectorAll('[data-part]').forEach(b => b.onclick = () => push({ name: 'deck', part: b.dataset.part, i: 0, role: 'all', order: null }));
    document.getElementById('dim').onclick = () => { S.dim = !S.dim; save(); render(); };
    document.getElementById('tips').onclick = () => push({ name: 'tips' });
    document.getElementById('journal').onclick = () => push({ name: 'journal' });
  }

  // ---------- колода ----------
  function deckList() {
    let qs = allQs();
    if (view.part === 'favs') qs = qs.filter(q => S.favs[q.id] || q.custom);
    else if (view.part !== 'all') qs = qs.filter(q => q.part === view.part);
    if (view.role !== 'all') qs = qs.filter(q => q.role === view.role);
    if (S.hideAsked) qs = qs.filter(q => !(S.marks[q.id] && S.marks[q.id].asked) || q.id === view.keep);
    if (view.order) {
      const pos = Object.fromEntries(view.order.map((id, i) => [id, i]));
      qs.sort((a, b) => (pos[a.id] ?? 1e9) - (pos[b.id] ?? 1e9));
    }
    return qs;
  }
  function deckTitle() {
    if (view.part === 'favs') return '♥ Мои вопросы';
    if (view.part === 'all') return 'Все вопросы';
    return partById[view.part].title;
  }
  function logEvent(kind, q) {
    S.log.push({ t: Date.now(), kind, id: q.id, text: fmt(q.raw), part: q.part, role: q.role, who: whoLabel(q.who) });
    if (!S.started) S.started = Date.now();
  }

  function renderDeck() {
    keepAwake(true);
    const all = (view.part === 'favs' ? allQs().filter(q => S.favs[q.id] || q.custom)
               : view.part === 'all' ? allQs() : allQs().filter(q => q.part === view.part));
    const rolesHere = Object.keys(ROLES).filter(r => all.some(q => q.role === r));
    const list = deckList();
    if (view.i >= list.length) view.i = Math.max(0, list.length - 1);
    const q = list[view.i];
    const m = q ? (S.marks[q.id] || {}) : {};
    const part = partById[view.part];

    let html = `<div class="top">
        <button class="icon-btn" id="back" title="Назад">←</button>
        <h1 style="font-size:21px">${esc(deckTitle())}</h1>
        <button class="icon-btn ${view.order ? 'on' : ''}" id="shuffle" title="Перемешать">⤮</button>
        <button class="icon-btn ${S.dim ? 'on' : ''}" id="dim" title="Тёмный режим">☾</button></div>
      ${sideSeg()}
      <div class="chips"><button class="chip ${view.role === 'all' ? 'on' : ''}" data-role="all">Все темы</button>
        ${rolesHere.map(r => `<button class="chip ${view.role === r ? 'on' : ''}" data-role="${r}">${ROLES[r].name}</button>`).join('')}</div>`;

    if (!q) {
      html += `<div class="empty">${view.part === 'favs'
        ? 'Здесь пока пусто.<br>Отмечай вопросы сердцем ♥ в любой части дня или добавь свой.'
        : 'В этой подборке вопросов нет.<br>Смени тему или выключи «скрыть заданные».'}</div>`;
    } else {
      const hint = q.hint || (part && view.i === 0 && view.role === 'all' ? part.tip : '');
      html += `<div class="deck"><div class="card ${m.asked ? 'asked' : ''} ${m.star ? 'star' : ''}" id="card">
          <div class="meta"><span class="role">${ROLES[q.role] ? ROLES[q.role].name : ''}</span><span class="who">${whoLabel(q.who)}</span></div>
          <div class="marks">${m.star ? '★ ' : ''}${m.asked ? '✓' : ''}</div>
          <div class="q">${esc(fmt(q.raw))}</div>
          ${hint ? `<div class="hint">${esc(hint)}</div>` : ''}
        </div>
        <div class="counter">${view.i + 1} из ${list.length}${(view.part === 'all' || view.part === 'favs') && partById[q.part] ? ' · ' + esc(partById[q.part].title) : ''}</div></div>
      <div class="actions">
        <button class="nav" id="prev">‹</button>
        <button class="askbtn ${m.asked ? 'on' : ''}" id="ask">${m.asked ? '✓ Задан' : 'Задан'}</button>
        <button class="starbtn ${m.star ? 'on' : ''}" id="star">★ Сильный ответ</button>
        <button class="nav" id="next">›</button></div>
      <div class="sub-actions">
        <button id="fav" class="${S.favs[q.id] ? 'on' : ''}">${S.favs[q.id] ? '♥ в моих' : '♡ в мои'}</button>
        <button id="hide" class="${S.hideAsked ? 'on' : ''}">${S.hideAsked ? '◉' : '○'} скрыть заданные</button>
        <button id="add">+ свой</button>
        ${q.custom ? '<button id="del">удалить</button>' : ''}</div>`;
    }
    $app.innerHTML = html;
    bindSide();
    document.getElementById('back').onclick = () => history.back();
    document.getElementById('dim').onclick = () => { S.dim = !S.dim; save(); render(); };
    document.getElementById('shuffle').onclick = () => {
      if (view.order) { view.order = null; toast('По порядку'); }
      else { const ids = deckList().map(x => x.id); for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; } view.order = ids; toast('Перемешано'); }
      view.i = 0; render();
    };
    $app.querySelectorAll('[data-role]').forEach(b => b.onclick = () => { view.role = b.dataset.role; view.i = 0; render(); });
    if (!q) { const a = document.createElement('div'); a.className = 'sub-actions'; a.innerHTML = '<button id="add">+ свой вопрос</button>'; $app.appendChild(a); document.getElementById('add').onclick = addCustom; return; }

    const step = d => { const n = deckList().length; if (!n) return; view.keep = null; view.i = (view.i + d + n) % n; render(); };
    document.getElementById('prev').onclick = () => step(-1);
    document.getElementById('next').onclick = () => step(1);
    document.getElementById('ask').onclick = () => {
      const mk = S.marks[q.id] = S.marks[q.id] || {};
      mk.asked = !mk.asked; if (!mk.asked) mk.star = false;
      if (mk.asked) { logEvent('asked', q); buzz(15); }
      view.keep = q.id; save(); render();
    };
    document.getElementById('star').onclick = () => {
      const mk = S.marks[q.id] = S.marks[q.id] || {};
      mk.star = !mk.star; if (mk.star) mk.asked = true;
      if (mk.star) { logEvent('star', q); buzz([20, 40, 20]); toast('★ ' + hms(Date.now()) + ' — отмечено'); }
      view.keep = q.id; save(); render();
    };
    document.getElementById('fav').onclick = () => { if (S.favs[q.id]) delete S.favs[q.id]; else S.favs[q.id] = true; save(); render(); };
    document.getElementById('hide').onclick = () => { S.hideAsked = !S.hideAsked; view.keep = q.id; save(); render(); };
    document.getElementById('add').onclick = addCustom;
    const del = document.getElementById('del');
    if (del) del.onclick = () => { if (confirm('Удалить свой вопрос?')) { S.custom = S.custom.filter(c => c.id !== q.id); delete S.favs[q.id]; save(); render(); } };

    // свайп по карточке
    const card = document.getElementById('card');
    let x0 = null, y0 = null;
    card.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
    card.addEventListener('touchmove', e => {
      if (x0 === null) return; const dx = e.touches[0].clientX - x0;
      if (Math.abs(dx) > Math.abs(e.touches[0].clientY - y0)) card.style.transform = `translateX(${dx * 0.6}px) rotate(${dx / 60}deg)`;
    }, { passive: true });
    card.addEventListener('touchend', e => {
      if (x0 === null) return; const dx = e.changedTouches[0].clientX - x0; x0 = null;
      if (Math.abs(dx) > 60) step(dx < 0 ? 1 : -1); else card.style.transform = '';
    });
  }

  function addCustom() {
    const text = prompt('Свой вопрос. Для текста под жениха и невесту: {для жениха|для невесты}');
    if (!text || !text.trim()) return;
    const partId = view.part && partById[view.part] ? view.part : 'any';
    S.custom.push({ id: 'c' + Date.now().toString(36), part: partId, role: view.role !== 'all' ? view.role : 'feel', text: text.trim() });
    save(); toast('Добавлено в «' + partById[partId].title + '» и в «Мои»'); render();
  }

  // ---------- журнал ----------
  function renderJournal() {
    const ev = S.log.slice().reverse();
    const stars = ev.filter(e => e.kind === 'star');
    let html = `<div class="top"><button class="icon-btn" id="back">←</button><h1 style="font-size:21px">Журнал свадьбы</h1></div>
      <div class="page">
        <button class="wedding" id="name" style="width:100%;margin:0">${S.wedding ? `Свадьба: <b>${esc(S.wedding)}</b> · изменить` : 'Назвать свадьбу →'}</button>
        <div class="btns">
          <button class="btn gold" id="export">Выгрузить CSV</button>
          <button class="btn" id="filter">${view.onlyStars ? 'Показать все' : 'Только ★'}</button>
          <button class="btn" id="reset">Новая свадьба</button></div>
        <p style="color:var(--muted);font-size:13px;line-height:1.45;margin:0 0 6px">Время — по часам телефона, с точностью до секунды.
          Позже по нему можно будет найти ответы на синхронизированном материале. ★ ${stars.length}, всего отметок ${ev.length}.</p>`;
    const shown = view.onlyStars ? stars : ev;
    if (!shown.length) html += `<div class="empty">Пока нет отметок.<br>Нажимай «Задан» и «★ Сильный ответ» на карточках.</div>`;
    shown.forEach(e => {
      html += `<div class="row"><div class="tm">${hms(e.t)}</div><div class="k">${e.kind === 'star' ? '<span style="color:var(--gold)">★</span>' : '<span style="color:var(--ok)">✓</span>'}</div>
        <div><div class="tx">${esc(e.text)}</div><div class="pt">${esc((partById[e.part] || {}).title || '')} · ${esc(e.who || '')}</div></div></div>`;
    });
    html += `</div>`;
    $app.innerHTML = html;
    document.getElementById('back').onclick = () => history.back();
    document.getElementById('filter').onclick = () => { view.onlyStars = !view.onlyStars; render(); };
    document.getElementById('name').onclick = () => { const n = prompt('Название свадьбы (например: Анна и Максим, 31.08)', S.wedding); if (n !== null) { S.wedding = n.trim(); save(); render(); } };
    document.getElementById('export').onclick = exportCsv;
    document.getElementById('reset').onclick = () => {
      if (!confirm('Начать новую свадьбу? Журнал и отметки «Задан/★» текущей свадьбы будут очищены. «Мои вопросы» останутся.\n\nСовет: сначала выгрузи CSV.')) return;
      S.marks = {}; S.log = []; S.wedding = ''; S.started = null; save(); toast('Новая свадьба'); render();
    };
  }

  async function exportCsv() {
    if (!S.log.length) { toast('Журнал пуст'); return; }
    const q = s => '"' + String(s).replace(/"/g, '""') + '"';
    const lines = [['Дата', 'Время', 'Отметка', 'Часть дня', 'Кому', 'Тема', 'Вопрос'].join(',')];
    S.log.forEach(e => {
      const d = new Date(e.t);
      lines.push([`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, hms(e.t), e.kind === 'star' ? 'сильный' : 'задан',
        q((partById[e.part] || {}).title || ''), q(e.who || ''), q(ROLES[e.role] ? ROLES[e.role].name : ''), q(e.text)].join(','));
    });
    const name = (S.wedding || 'свадьба').replace(/[\\/:*?"<>|]/g, '_') + ' — вопросы.csv';
    const blob = new Blob(['﻿' + lines.join('\n')], { type: 'text/csv' });
    const file = new File([blob], name, { type: 'text/csv' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: name }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // ---------- советы ----------
  function renderTips() {
    $app.innerHTML = `<div class="top"><button class="icon-btn" id="back">←</button><h1 style="font-size:21px">Как задавать</h1></div>
      <div class="page tips">
        <h2>Чтобы ответ лёг в монтаж</h2>
        <ul>
          <li><b>Попроси отвечать полным предложением.</b> Не «да, волнуюсь», а «Сегодня я волнуюсь, потому что…». Твоего голоса в фильме не будет.</li>
          <li><b>Спрашивай про конкретный момент, а не «вообще».</b> «Расскажи про вечер, когда…» вместо «Как вы познакомились?». Конкретика даёт образы для кадров.</li>
          <li><b>Одни и те же вопросы задавай каждому отдельно.</b> На монтаже их можно перемонтировать: она начинает фразу, он заканчивает.</li>
          <li><b>Короткие подходы весь день вместо одного длинного интервью.</b> По 1–3 минуты в каждой части дня: эмоции живые, а не пересказанные.</li>
          <li><b>Выдержи паузу после ответа.</b> Самое честное часто звучит через 3–4 секунды тишины, когда человек добавляет то, что не собирался.</li>
          <li><b>Глубокие вопросы — после лёгких.</b> Сначала разогрев и смех, потом история и чувства, в конце обращение друг к другу.</li>
          <li><b>Не бойся переспросить.</b> «Скажи это ещё раз, но ей» или «А одним словом?» — второй дубль часто лучше.</li>
        </ul>
        <h2>Темы — роль ответа в фильме</h2>
        <ul>${Object.values(ROLES).map(r => `<li><b>${r.name}</b> — ${r.note.toLowerCase()}</li>`).join('')}</ul>
        <h2>Как пользоваться</h2>
        <ul>
          <li><b>Невеста / Жених</b> сверху меняет текст вопросов: «о нём» или «о ней», «мама жениха» или «мама невесты».</li>
          <li><b>★ Сильный ответ</b> записывает время до секунды. После свадьбы журнал можно выгрузить в CSV, и по этому времени найти ответы на материале.</li>
          <li><b>♡ в мои</b> — личная подборка лучших вопросов, сохраняется между свадьбами. Там же свои вопросы.</li>
          <li><b>☾</b> — тёмный режим для церкви и вечернего зала, чтобы экран не светил.</li>
          <li>Свайп по карточке влево и вправо — следующий и предыдущий вопрос. Пока открыта карточка, экран не гаснет.</li>
          <li>Всё работает без интернета: данные хранятся в телефоне.</li>
        </ul>
      </div>`;
    document.getElementById('back').onclick = () => history.back();
  }

  render();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
})();
