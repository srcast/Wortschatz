(() => {
  'use strict';

  const STORE_KEY = 'wortschatz.v1';
  const LEVELS = ['A1', 'A2', 'B1', 'B2'];
  const TYPES = ['all', 'substantivo', 'verbo', 'adjetivo', 'advérbio', 'preposição', 'conector'];
  const TYPE_LABEL = {
    substantivo: 'Substantivo', verbo: 'Verbo', adjetivo: 'Adjetivo',
    'advérbio': 'Advérbio', 'preposição': 'Preposição', conector: 'Conector',
  };
  const TYPE_PLURAL = {
    all: 'palavras', substantivo: 'substantivos', verbo: 'verbos', adjetivo: 'adjetivos',
    'advérbio': 'advérbios', 'preposição': 'preposições', conector: 'conectores',
  };

  const $ = (id) => document.getElementById(id);
  const el = {
    levels: $('levels'), filters: $('filters'),
    dirBtn: $('dirBtn'), dirFrom: $('dirFrom'), dirTo: $('dirTo'),
    card: $('card'), cardBody: $('cardBody'),
    type: $('type'), remaining: $('remaining'),
    word: $('word'), translation: $('translation'),
    done: $('done'), doneTitle: $('doneTitle'), doneText: $('doneText'), restartBtn: $('restartBtn'),
    actions: $('actions'), revealBtn: $('revealBtn'), nextBtn: $('nextBtn'), knownBtn: $('knownBtn'),
    knownCount: $('knownCount'), clearBtn: $('clearBtn'), progressBar: $('progressBar'),
    confirm: $('confirm'), confirmText: $('confirmText'),
  };

  // ---------- Estado guardado no iPhone ----------
  function defaultState() {
    return {
      level: 'A1',
      dir: 'de',          // 'de' = palavra em alemão, tradução em português
      filter: 'all',      // tipo de palavra a praticar
      known: { A1: [], A2: [], B1: [], B2: [] },
      queue: [],          // palavras ainda por ver no ciclo atual
      current: null,
      cycleLevel: null,
      cycleFilter: null,
      revealed: false,
    };
  }

  function normalize(s) {
    if (!s || !LEVELS.includes(s.level)) return null;
    const d = defaultState();
    const merged = { ...d, ...s, known: { ...d.known, ...(s.known || {}) } };
    if (!TYPES.includes(merged.filter)) merged.filter = 'all';
    return merged;
  }

  function load() {
    try {
      return normalize(JSON.parse(localStorage.getItem(STORE_KEY))) || defaultState();
    } catch (e) { /* armazenamento indisponível */ }
    return defaultState();
  }

  // ---------- Base de dados no iPhone (IndexedDB) ----------
  // O localStorage do iOS pode perder a última gravação se a app for fechada logo a seguir.
  // Por isso o estado é guardado também no IndexedDB, que grava de forma garantida.
  let dbPromise = null;
  function db() {
    if (!dbPromise) {
      dbPromise = new Promise((resolve) => {
        try {
          const req = indexedDB.open('wortschatz', 1);
          req.onupgradeneeded = () => req.result.createObjectStore('kv');
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
          req.onblocked = () => resolve(null);
        } catch (e) { resolve(null); }
      });
    }
    return dbPromise;
  }

  async function idbGet() {
    const d = await db();
    if (!d) return null;
    return new Promise((resolve) => {
      try {
        const r = d.transaction('kv', 'readonly').objectStore('kv').get(STORE_KEY);
        r.onsuccess = () => resolve(r.result || null);
        r.onerror = () => resolve(null);
      } catch (e) { resolve(null); }
    });
  }

  async function idbPut(value) {
    const d = await db();
    if (!d) return;
    try {
      const tx = d.transaction('kv', 'readwrite', { durability: 'strict' });
      tx.objectStore('kv').put(value, STORE_KEY);
    } catch (e) { /* ignorar */ }
  }

  function save() {
    state.savedAt = Date.now();
    const copy = JSON.parse(JSON.stringify(state));
    try { localStorage.setItem(STORE_KEY, JSON.stringify(copy)); } catch (e) { /* ignorar */ }
    idbPut(copy);
  }

  let state = load();
  const byLevel = {};
  const byId = {};

  // ---------- Lógica do baralho ----------
  const shuffle = (a) => {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  const knownSet = () => new Set(state.known[state.level] || []);
  const inFilter = (w) => state.filter === 'all' || w.tipo === state.filter;
  const pool = () => byLevel[state.level].filter(inFilter);

  function newCycle() {
    const k = knownSet();
    state.queue = shuffle(pool().map((w) => w.id).filter((id) => !k.has(id)));
    state.cycleLevel = state.level;
    state.cycleFilter = state.filter;
  }

  function next() {
    const k = knownSet();
    while (state.queue.length && (k.has(state.queue[0]) || !byId[state.queue[0]])) state.queue.shift();
    state.current = state.queue.shift() || null;
    state.revealed = false;
    save();
    render(true);
  }

  function setLevel(level) {
    if (level === state.level) return;
    state.level = level;
    newCycle();
    next();
  }

  // grava sempre que a app vai para segundo plano ou é fechada
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') save();
  });
  window.addEventListener('pagehide', save);

  function setFilter(type) {
    if (type === state.filter) return;
    state.filter = type;
    newCycle();
    next();
  }

  function toggleDir() {
    state.dir = state.dir === 'de' ? 'pt' : 'de';
    state.revealed = false;
    save();
    render(false);
  }

  function reveal() {
    if (!state.current || state.revealed) return;
    state.revealed = true;
    save();
    render(false);
  }

  function markKnown() {
    if (!state.current) return;
    const list = state.known[state.level];
    if (!list.includes(state.current)) list.push(state.current);
    el.knownBtn.classList.remove('pulse');
    void el.knownBtn.offsetWidth;
    el.knownBtn.classList.add('pulse');
    next();
  }

  function clearKnown() {
    const cleared = state.known[state.level].filter((id) => byId[id] && inFilter(byId[id]));
    state.known[state.level] = [];
    // as palavras limpas do tipo atual voltam ao ciclo em posições aleatórias
    for (const id of cleared) {
      const pos = Math.floor(Math.random() * (state.queue.length + 1));
      state.queue.splice(pos, 0, id);
    }
    if (!state.current) next();
    else { save(); render(false); }
  }

  // ---------- Formatação ----------
  const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function formatGerman(w) {
    let text = w.de;
    if (w.tipo === 'substantivo') {
      const plural = /\(Pl\.\)\s*$/.test(text);
      text = text.replace(/\s*\(Pl\.\)\s*$/, '');
      const m = text.match(/^(der|die|das)\s+(.*)$/);
      if (m) {
        const cls = plural ? 'pl' : m[1];
        const tag = plural ? ' <span class="tag">plural</span>' : '';
        return { html: `<span class="art ${cls}">${m[1]}</span> ${esc(m[2])}${tag}`, len: m[2].length };
      }
    }
    if (w.tipo === 'preposição' && w.caso) {
      return { html: `${esc(text)}<span class="case">+ ${esc(w.caso)}</span>`, len: text.length + 4 };
    }
    const r = text.match(/^sich\s+(.*)$/);
    if (r) return { html: `<span class="art pl">sich</span> ${esc(r[1])}`, len: r[1].length };
    return { html: esc(text), len: text.length };
  }

  function formatPortuguese(w) {
    const parts = w.pt.split(';').map((p) => p.trim()).filter(Boolean);
    const main = esc(parts[0]);
    const rest = parts.slice(1).map(esc).join(', ');
    return {
      html: rest ? `${main}<span class="alt">, ${rest}</span>` : main,
      len: parts[0].length,
    };
  }

  const sizeClass = (len) => (len > 18 ? 'xlong' : len > 12 ? 'long' : '');

  // ---------- Desenho ----------
  function render(animate) {
    const level = state.level;
    el.levels.style.setProperty('--i', LEVELS.indexOf(level));
    el.levels.querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset.level === level));
    });
    el.filters.querySelectorAll('button').forEach((b) => {
      b.setAttribute('aria-checked', String(b.dataset.type === state.filter));
    });

    el.dirFrom.textContent = state.dir === 'de' ? 'DE' : 'PT';
    el.dirTo.textContent = state.dir === 'de' ? 'PT' : 'DE';
    el.dirBtn.classList.toggle('flip', state.dir === 'pt');

    // total do nível e sabidas no nível
    const k = knownSet();
    const total = byLevel[level].length;
    const knownN = byLevel[level].filter((w) => k.has(w.id)).length;
    el.knownCount.innerHTML =
      `<strong>${knownN}</strong> de <span class="total">${total}</span> ${knownN === 1 ? 'sabida' : 'sabidas'} no ${level}`;
    el.progressBar.style.width = total ? `${(knownN / total) * 100}%` : '0';
    el.clearBtn.disabled = knownN === 0;

    const w = state.current ? byId[state.current] : null;

    if (!w) {
      el.cardBody.hidden = true;
      el.done.hidden = false;
      el.actions.hidden = true;
      el.type.textContent = level;
      el.remaining.textContent = '';
      const p = pool();
      const poolKnown = p.filter((x) => k.has(x.id)).length;
      const what = TYPE_PLURAL[state.filter];
      const fem = state.filter === 'all' || state.filter === 'preposição';
      const os = fem ? 'as' : 'os';
      if (poolKnown >= p.length) {
        el.doneTitle.textContent = 'Já sabes tudo aqui';
        el.doneText.textContent = state.filter === 'all'
          ? `Marcaste as ${p.length} palavras do ${level} como sabidas. Usa «Limpar» para as voltar a praticar.`
          : `Marcaste ${os} ${p.length} ${what} do ${level} como ${fem ? 'sabidas' : 'sabidos'}. Escolhe outro tipo ou usa «Limpar».`;
        el.restartBtn.hidden = true;
      } else {
        el.doneTitle.textContent = 'Ronda concluída';
        el.doneText.textContent = `Já viste ${fem ? 'todas' : 'todos'} ${os} ${what} do ${level} que ainda não sabes.`;
        el.restartBtn.hidden = false;
      }
      return;
    }

    el.cardBody.hidden = false;
    el.done.hidden = true;
    el.actions.hidden = false;

    el.type.textContent = TYPE_LABEL[w.tipo] || w.tipo;
    const left = state.queue.length + 1;
    el.remaining.textContent = left === 1 ? 'última por ver' : `faltam ${left}`;

    const de = formatGerman(w);
    const pt = formatPortuguese(w);
    const front = state.dir === 'de' ? de : pt;
    const back = state.dir === 'de' ? pt : de;

    el.word.innerHTML = front.html;
    el.word.lang = state.dir === 'de' ? 'de' : 'pt-PT';
    el.word.className = 'word ' + sizeClass(front.len);
    el.translation.innerHTML = back.html;
    el.translation.lang = state.dir === 'de' ? 'pt-PT' : 'de';

    el.card.classList.toggle('revealed', state.revealed);
    el.revealBtn.disabled = state.revealed;
    el.revealBtn.textContent = state.revealed ? 'Tradução visível' : 'Mostrar tradução';

    if (animate) {
      el.cardBody.classList.remove('enter');
      void el.cardBody.offsetWidth;
      el.cardBody.classList.add('enter');
    }
  }

  function scrollActiveFilter() {
    const b = el.filters.querySelector('[aria-checked="true"]');
    if (b) b.scrollIntoView({ inline: 'nearest', block: 'nearest' });
  }

  // ---------- Confirmação para limpar ----------
  function askClear() {
    const k = knownSet();
    const n = byLevel[state.level].filter((w) => k.has(w.id)).length;
    if (!n) return;
    el.confirmText.textContent =
      `${n === 1 ? 'A palavra marcada' : `As ${n} palavras marcadas`} como «Já sei» no ${state.level} ${n === 1 ? 'volta' : 'voltam'} a aparecer.`;
    if (typeof el.confirm.showModal === 'function') {
      el.confirm.returnValue = '';
      el.confirm.showModal();
    } else if (window.confirm(el.confirmText.textContent)) {
      clearKnown();
    }
  }

  el.confirm.addEventListener('close', () => {
    if (el.confirm.returnValue === 'ok') clearKnown();
  });
  el.confirm.addEventListener('click', (e) => {
    if (e.target === el.confirm) el.confirm.close('cancel');
  });

  // ---------- Eventos ----------
  el.levels.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-level]');
    if (b) setLevel(b.dataset.level);
  });
  el.filters.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-type]');
    if (b) { setFilter(b.dataset.type); scrollActiveFilter(); }
  });
  el.dirBtn.addEventListener('click', toggleDir);
  el.revealBtn.addEventListener('click', reveal);
  el.cardBody.addEventListener('click', reveal);
  el.nextBtn.addEventListener('click', next);
  el.knownBtn.addEventListener('click', markKnown);
  el.clearBtn.addEventListener('click', askClear);
  el.restartBtn.addEventListener('click', () => { newCycle(); next(); });

  // ---------- Arranque ----------
  async function init() {
    let words;
    try {
      const res = await fetch('words.json');
      words = await res.json();
    } catch (e) {
      el.word.textContent = 'Não foi possível carregar as palavras.';
      return;
    }

    LEVELS.forEach((l) => { byLevel[l] = []; });
    for (const w of words) {
      if (!byLevel[w.nivel]) continue;
      // substantivos e verbos mantêm o identificador da versão anterior
      w.id = (w.tipo === 'substantivo' || w.tipo === 'verbo')
        ? `${w.nivel}:${w.de}`
        : `${w.nivel}:${w.tipo}:${w.de}`;
      byLevel[w.nivel].push(w);
      byId[w.id] = w;
    }

    // usa a cópia mais recente entre localStorage e IndexedDB
    const fromDb = normalize(await idbGet());
    if (fromDb && (fromDb.savedAt || 0) > (state.savedAt || 0)) state = fromDb;

    // pede ao iPhone para não apagar os dados da app
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* ignorar */ }

    // remove marcações de palavras que já não existem na lista
    for (const l of LEVELS) state.known[l] = (state.known[l] || []).filter((id) => byId[id]);

    if (state.cycleLevel !== state.level || state.cycleFilter !== state.filter ||
        (state.current && !byId[state.current])) {
      newCycle();
      next();
    } else {
      // limpa a ronda guardada de palavras inexistentes, de outro tipo ou já sabidas
      const k = knownSet();
      state.queue = state.queue.filter((id) => byId[id] && inFilter(byId[id]) && !k.has(id));
      if (!state.current || k.has(state.current)) next();
      else render(false);
    }
    save();
    scrollActiveFilter();
  }

  // ---------- Página «Palavras que já sei» ----------
  const listEl = {
    practice: $('practiceView'), list: $('listView'),
    listBtn: $('listBtn'), backBtn: $('backBtn'),
    search: $('searchInput'), count: $('listCount'),
    items: $('knownList'), empty: $('listEmpty'),
  };

  // minúsculas, sem acentos e com ß = ss, para pesquisar em qualquer língua
  const fold = (s) => s.toLowerCase().replace(/ß/g, 'ss').normalize('NFD').replace(/[̀-ͯ]/g, '');
  const sortKey = (w) => fold(w.de.replace(/^(der|die|das|sich)\s+/, '').replace(/\s*\(Pl\.\)\s*$/, ''));

  function knownWords() {
    const out = [];
    for (const l of LEVELS) for (const id of state.known[l] || []) if (byId[id]) out.push(byId[id]);
    return out.sort((a, b) => sortKey(a).localeCompare(sortKey(b), 'de'));
  }

  function renderList() {
    const all = knownWords();
    const q = fold(listEl.search.value.trim());
    const words = q
      ? all.filter((w) => {
          if (!w.search) w.search = fold(`${w.de} ${w.pt}`);
          return w.search.includes(q);
        })
      : all;

    listEl.items.innerHTML = words.map((w) => {
      const de = formatGerman(w).html;
      const pt = esc(w.pt.split(';').map((p) => p.trim()).join(', '));
      return `<li class="item"><div class="item-text"><p class="item-de" lang="de">${de}</p>` +
        `<p class="item-pt" lang="pt-PT">${pt}</p></div><span class="lvl lvl-${w.nivel}">${w.nivel}</span></li>`;
    }).join('');

    if (!all.length) {
      listEl.count.textContent = '';
      listEl.empty.textContent = 'Ainda não marcaste nenhuma palavra como «Já sei». As que marcares aparecem aqui.';
      listEl.empty.hidden = false;
    } else if (!words.length) {
      listEl.count.textContent = '';
      listEl.empty.textContent = `Nenhuma palavra sabida corresponde a «${listEl.search.value.trim()}».`;
      listEl.empty.hidden = false;
    } else {
      listEl.count.textContent = q
        ? `${words.length} de ${all.length} ${all.length === 1 ? 'palavra' : 'palavras'}`
        : `${all.length} ${all.length === 1 ? 'palavra sabida' : 'palavras sabidas'} em todos os níveis`;
      listEl.empty.hidden = true;
    }
  }

  function openList() {
    listEl.search.value = '';
    renderList();
    listEl.practice.hidden = true;
    listEl.list.hidden = false;
    window.scrollTo(0, 0);
  }

  function closeList() {
    listEl.search.blur();
    listEl.list.hidden = true;
    listEl.practice.hidden = false;
    window.scrollTo(0, 0);
  }

  listEl.listBtn.addEventListener('click', openList);
  listEl.backBtn.addEventListener('click', closeList);
  listEl.search.addEventListener('input', renderList);
  listEl.search.addEventListener('keydown', (e) => { if (e.key === 'Enter') listEl.search.blur(); });

  init();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
})();
