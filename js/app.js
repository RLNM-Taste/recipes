/* Рецептурник: екрани, навигация и действия. Данните са на това устройство (IndexedDB). */
(function () {
  'use strict';
  var Cloud = window.Cloud || { enabled: false };
  var U = window.Units, RB = window.RB, Store = Cloud.enabled ? Cloud.store : window.Store;
  var CATS = RB.CATEGORIES;

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  function norm(s) { return String(s || '').toLowerCase().trim(); }
  // 55 -> "55 мин", 120 -> "2 ч", 90 -> "1 ч 30 мин"
  function fmtTime(m) {
    m = +m || 0;
    if (m < 60) return m + ' мин';
    var h = Math.floor(m / 60), r = m % 60;
    return h + ' ч' + (r ? ' ' + r + ' мин' : '');
  }
  // Корица на рецепта: последната моя снимка на готовото ястие, иначе първата снимка на рецептата
  function cover(r) {
    var m = r.myPhotos || [];
    if (m.length) return m[m.length - 1].src;
    return r.photos && r.photos.length ? r.photos[0] : '';
  }
  // Дати за „Ще сготвя“ (местна дата, формат ГГГГ-ММ-ДД)
  function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function addDays(n) { var d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + n); return ymd(d); }
  function parseYmd(s) { var p = s.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function daysFromToday(s) { var b = new Date(); b.setHours(12, 0, 0, 0); return Math.round((parseYmd(s) - b) / 86400000); }
  function relLabel(s) {
    if (!s) return 'без дата';
    var n = daysFromToday(s);
    if (n === 0) return 'днес';
    if (n === 1) return 'утре';
    if (n > 1) return 'след ' + n + ' дни';
    if (n === -1) return 'вчера';
    return 'преди ' + (-n) + ' дни';
  }
  function dateLabel(s) { return parseYmd(s).toLocaleDateString('bg-BG', { weekday: 'long', day: 'numeric', month: 'long' }); }
  function planText(r) { return r.planDate ? relLabel(r.planDate) + ' · ' + dateLabel(r.planDate) : 'без дата'; }
  var TIME_OPTIONS =[['', 'Време за приготвяне'], ['20', 'до 20 мин'], ['30', 'до 30 мин'], ['45', 'до 45 мин'], ['60', 'до 1 час'], ['90', 'до 1,5 часа'], ['120', 'до 2 часа'], ['over', 'над 2 часа']];

  var app = $('#app');
  var S = { recipes: [], shop: [], q: '', time: '', cat: '', favOnly: false, srv: {}, cook: { id: null, i: 0, ing: false }, draft: null, route: '', d: 0, planOnly: false, planEdit: {}, shopOpen: {} };

  var ICON = {
    heart: '<svg viewBox="0 0 24 24" width="21" height="21"><path d="M12 20.5s-7.5-4.6-9-9.2C2 8 4 5.5 6.8 5.5c1.8 0 3.2 1 5.2 3 2-2 3.4-3 5.2-3C20 5.5 22 8 21 11.3c-1.5 4.6-9 9.2-9 9.2z"/></svg>',
    back: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M15 5l-7 7 7 7"/></svg>',
    bag: '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M5 11h14l-1.2 8.6a1.2 1.2 0 0 1-1.2 1H7.4a1.2 1.2 0 0 1-1.2-1z"/><circle cx="9" cy="7.6" r="2.6"/><path d="M9 5V3.6M15 11V4.5M13.4 6.2L15 4l1.6 2.2"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="20" height="20"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    search: '<svg viewBox="0 0 24 24" width="20" height="20"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/></svg>',
    plus: '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M12 5v14M5 12h14"/></svg>',
    home: '<svg viewBox="0 0 24 24" width="21" height="21"><path d="M4 11l8-7 8 7"/><path d="M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9"/></svg>',
    cal: '<svg viewBox="0 0 24 24" width="21" height="21"><rect x="4" y="5" width="16" height="15" rx="2.5"/><path d="M4 10h16M9 3v4M15 3v4"/></svg>'
  };

  /* ---------- помощни ---------- */
  function find(id) { return S.recipes.filter(function (r) { return r.id === id; })[0]; }
  function persist(r) {
    var i = S.recipes.findIndex(function (x) { return x.id === r.id; });
    if (i < 0) S.recipes.push(r); else S.recipes[i] = r;
    return Store.put(r).catch(syncFail);
  }
  function saveShop() { return Store.set('shop', S.shop).catch(syncFail); }
  // Ако записът в облака не успее (напр. няма интернет), казваме го, за да не мисли потребителят, че е запазено
  function syncFail(e) {
    toast('Не се запази: ' + (Cloud.enabled ? Cloud.message(e) : ((e && e.message) || 'грешка')));
  }
  var toastT;
  function toast(msg) {
    var t = $('#toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(toastT); toastT = setTimeout(function () { t.classList.remove('show'); }, 2200);
  }
  function ytId(url) {
    var m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/))([\w-]{11})/);
    return m ? m[1] : '';
  }
  function readImage(file) { return readImageMax(file, 1400); }
  function readImageMax(file, max) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () {
        var img = new Image();
        img.onload = function () {
          var k = Math.min(1, max / Math.max(img.width, img.height));
          var c = document.createElement('canvas');
          c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
          res(c.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = rej; img.src = fr.result;
      };
      fr.onerror = rej; fr.readAsDataURL(file);
    });
  }

  /* ---------- рамка на етикета ---------- */
  var ro = window.ResizeObserver ? new ResizeObserver(function (es) { es.forEach(function (e) { drawFrame(e.target); }); }) : null;
  function drawFrame(el) {
    var w = Math.round(el.clientWidth), h = Math.round(el.clientHeight);
    if (!w || !h) return;
    var svg = el.querySelector('.frame');
    svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    var cx = w / 2, r = 13, b = 5;
    var o = 'M' + r + ' ' + b + ' H' + (cx - 22) + ' C' + (cx - 15) + ' ' + b + ' ' + (cx - 11) + ' 1 ' + cx + ' 1 C' + (cx + 11) + ' 1 ' + (cx + 15) + ' ' + b + ' ' + (cx + 22) + ' ' + b +
      ' H' + (w - r) + ' A' + r + ' ' + r + ' 0 0 0 ' + w + ' ' + (r + b) + ' V' + (h - r - b) + ' A' + r + ' ' + r + ' 0 0 0 ' + (w - r) + ' ' + (h - b) +
      ' H' + (cx + 22) + ' C' + (cx + 15) + ' ' + (h - b) + ' ' + (cx + 11) + ' ' + (h - 1) + ' ' + cx + ' ' + (h - 1) + ' C' + (cx - 11) + ' ' + (h - 1) + ' ' + (cx - 15) + ' ' + (h - b) + ' ' + (cx - 22) + ' ' + (h - b) +
      ' H' + r + ' A' + r + ' ' + r + ' 0 0 0 0 ' + (h - r - b) + ' V' + (r + b) + ' A' + r + ' ' + r + ' 0 0 0 ' + r + ' ' + b + 'Z';
    var i = 'M14 11 H' + (w - 14) + ' A8 8 0 0 0 ' + (w - 6) + ' 19 V' + (h - 19) + ' A8 8 0 0 0 ' + (w - 14) + ' ' + (h - 11) + ' H14 A8 8 0 0 0 6 ' + (h - 19) + ' V19 A8 8 0 0 0 14 11Z';
    svg.innerHTML = '<path d="' + o + '" fill="currentColor" stroke="#2E2E2B" stroke-width="1.8" stroke-linejoin="round"/><path d="' + i + '" fill="none" stroke="#2E2E2B" stroke-width="0.9"/>';
  }
  function fitFrames() {
    $$('.lbl').forEach(function (el) { drawFrame(el); if (ro) ro.observe(el); });
  }
  function labelTile(c, href, wide) {
    return '<a class="lbl' + (wide ? ' wide' : '') + '" href="' + href + '" style="--f:' + c.color + '"><svg class="frame" aria-hidden="true"></svg>' +
      '<div class="in"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="' + c.icon + '"/></svg><span>' + esc(c.name) + '</span></div></a>';
  }

  /* ---------- общи блокове ---------- */
  function head(title, sub, o) {
    o = o || {};
    return '<div class="bar">' + (o.back ? '<button class="iconbtn" data-act="back" aria-label="Назад">' + ICON.back + '</button>' : '') +
      '<div class="bt"><h1 class="title">' + esc(title) + '</h1>' + (sub ? '<div class="sub">' + esc(sub) + '</div>' : '') + '</div>' + (o.right || '') + '</div>';
  }
  function nav(v) {
    var home = ['', 'c', 'r', 'edit'].indexOf(v) >= 0;
    return '<nav class="nav" aria-label="Основна навигация">' +
      '<a href="#/" class="' + (home ? 'on' : '') + '">Рецепти</a>' +
      '<a href="#/fav" class="' + (v === 'fav' ? 'on' : '') + '">Любими</a>' +
      '<a class="fab" href="#/new" aria-label="Добави рецепта">' + ICON.plus + '</a>' +
      '<a href="#/shop" class="' + (v === 'shop' ? 'on' : '') + '">Пазаруване</a>' +
      '<a href="#/me" class="' + (v === 'me' ? 'on' : '') + '">Профил</a></nav>';
  }
  function recipeCard(r) {
    var c = RB.cat(r.cat);
    var th = cover(r) ? '<img src="' + cover(r) + '" alt="">' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + c.icon + '"/></svg>';
    return '<div class="card"><a class="cl" href="#/r/' + r.id + '"><div class="thumb">' + th + '</div><div><div class="t">' + esc(r.title) + '</div><div class="s">' +
      esc(c.name) + (r.time ? ' · ' + fmtTime(r.time) : '') + '</div>' +
      (r.planned ? '<div class="s pl">Ще сготвя · ' + esc(relLabel(r.planDate)) + '</div>' : '') + '</div></a>' +
      '<button class="heart' + (r.fav ? ' on' : '') + '" data-act="fav" data-id="' + r.id + '" aria-label="Любима">' + ICON.heart + '</button></div>';
  }
  function cards(list, emptyMsg) {
    if (!list.length) return '<div class="empty">' + emptyMsg + '</div>';
    return '<div class="list">' + list.map(recipeCard).join('') + '</div>';
  }

  /* ---------- начало ---------- */
  function timeOk(r) {
    if (S.time === 'over') return !!(r.time && r.time > 120);
    if (S.time) return !!(r.time && r.time <= +S.time);
    return true;
  }
  function filterRecipes() {
    var q = norm(S.q);
    return S.recipes.filter(function (r) {
      if (S.cat && r.cat !== S.cat) return false;
      if (S.planOnly && !r.planned) return false;
      if (!timeOk(r)) return false;
      if (S.favOnly && !r.fav) return false;
      if (q) {
        var hay = norm(r.title + ' ' + (r.tags || []).join(' ') + ' ' + (r.ingredients || []).map(function (i) { return i.name; }).join(' '));
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    }).sort(function (a, b) { return (b.updated || 0) - (a.updated || 0); });
  }
  function chip(k, t, on) { return '<button class="chip' + (on ? ' on' : '') + '" data-act="chip" data-k="' + k + '">' + t + '</button>'; }
  function timeSelect() {
    return '<select id="tf" class="timesel' + (S.time ? ' on' : '') + '" aria-label="Време за приготвяне">' +
      TIME_OPTIONS.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === S.time ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('') + '</select>';
  }
  function catSelect() {
    return '<select id="cf" class="timesel' + (S.cat ? ' on' : '') + '" aria-label="Вид ястие">' +
      '<option value="">Вид ястие</option>' +
      CATS.map(function (c) { return '<option value="' + c.id + '"' + (c.id === S.cat ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select>';
  }
  function chips() {
    return chip('all', 'Всички', !(S.time || S.cat || S.favOnly || S.planOnly)) + catSelect() + timeSelect() +
      chip('fav', 'Любими', S.favOnly) + chip('plan', 'Ще сготвя', S.planOnly);
  }
  function results() {
    if (!(S.q || S.time || S.cat || S.favOnly || S.planOnly)) {
      return '<div class="lgrid">' + CATS.map(function (c, i) { return labelTile(c, '#/c/' + c.id, i === CATS.length - 1); }).join('') + '</div>';
    }
    return cards(filterRecipes(), 'Няма рецепти по тези условия.');
  }
  function refreshResults() {
    if (ro) ro.disconnect();
    $('#results').innerHTML = results();
    $('#chips').innerHTML = chips();
    fitFrames();
  }
  function viewHome() {
    var fav = S.recipes.filter(function (r) { return r.fav; }).length;
    return head('Щипка вкус', S.recipes.length + ' рецепти · ' + fav + ' любими', { right: '<div style="display:flex;gap:8px"><a class="iconbtn" href="#/plan" aria-label="Ще сготвя">' + ICON.cal + '</a><a class="iconbtn" href="#/fav" aria-label="Любими рецепти">' + ICON.heart + '</a></div>' }) +
      '<label class="search">' + ICON.search + '<input id="q" type="text" placeholder="Търси по име или продукт" value="' + esc(S.q) + '" autocomplete="off"></label>' +
      '<div class="chips" id="chips">' + chips() + '</div><div id="results">' + results() + '</div>';
  }
  function catList(id) {
    var all = S.recipes.filter(function (r) { return r.cat === id; });
    var list = all.filter(timeOk).sort(function (a, b) { return a.title.localeCompare(b.title, 'bg'); });
    if (!all.length) return cards([], 'Тук още няма рецепти.<br><br><a class="btn small primary" href="#/new">Добави първата</a>');
    return cards(list, 'Няма рецепти в тази категория с избраното време.');
  }
  function refreshCat() {
    var id = (location.hash || '').split('/')[2];
    $('#catlist').innerHTML = catList(id);
    $('#tf').classList.toggle('on', !!S.time);
  }
  function viewCat(id) {
    var c = RB.cat(id);
    var total = S.recipes.filter(function (r) { return r.cat === c.id; }).length;
    return head(c.name, total + ' рецепти', { back: true }) +
      '<div class="chips">' + timeSelect() + '</div><div id="catlist">' + catList(c.id) + '</div>';
  }
  function viewFav() {
    var list = S.recipes.filter(function (r) { return r.fav; });
    return head('Любими рецепти', list.length + ' рецепти') + cards(list, 'Още нямаш любими рецепти. Натисни сърцето на рецепта, за да я добавиш тук.');
  }

  /* ---------- ще сготвя ---------- */
  function planCard(r) {
    var c = RB.cat(r.cat);
    var th = cover(r) ? '<img src="' + cover(r) + '" alt="">' : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + c.icon + '"/></svg>';
    return '<div class="card"><a class="cl" href="#/r/' + r.id + '"><div class="thumb">' + th + '</div><div><div class="t">' + esc(r.title) + '</div>' +
      '<div class="s pl">' + esc(planText(r)) + '</div><div class="s">' + esc(c.name) + (r.time ? ' · ' + fmtTime(r.time) : '') + '</div></div></a>' +
      '<button class="btn small" data-act="plandone" data-id="' + r.id + '">Сготвено</button></div>';
  }
  function viewPlan() {
    var list = S.recipes.filter(function (r) { return r.planned; }).sort(function (a, b) {
      if (a.planDate && b.planDate) return a.planDate < b.planDate ? -1 : a.planDate > b.planDate ? 1 : 0;
      return a.planDate ? -1 : b.planDate ? 1 : 0;
    });
    return head('Ще сготвя', list.length + ' рецепти') +
      (list.length ? '<div class="list">' + list.map(planCard).join('') + '</div>' :
        '<div class="empty">Още нищо не е планирано. Отвори рецепта и натисни „Ще сготвя“, за да я сложиш за някой ден.</div>');
  }
  function planHtml(r) {
    if (r.planned && !S.planEdit[r.id]) {
      return '<div class="plan on"><div class="pn"><div><div class="pt" style="margin:0">Ще сготвя</div><div class="sm">' + esc(planText(r)) + '</div></div>' +
        '<div style="display:flex;gap:6px"><button data-act="planedit" data-id="' + r.id + '">Промени</button><button data-act="planoff" data-id="' + r.id + '">Махни</button></div></div></div>';
    }
    return '<div class="plan"><div class="pt">Ще сготвя</div><div class="qs">' +
      '<button data-act="plan" data-d="0" data-id="' + r.id + '">Днес</button><button data-act="plan" data-d="1" data-id="' + r.id + '">Утре</button>' +
      '<button data-act="plan" data-d="2" data-id="' + r.id + '">След 2 дни</button><button data-act="plan" data-d="3" data-id="' + r.id + '">След 3 дни</button>' +
      '<button data-act="plan" data-d="" data-id="' + r.id + '">Без дата</button></div>' +
      '<div class="pd"><input type="date" id="pdate" min="' + addDays(0) + '" value="' + esc(r.planDate || '') + '" aria-label="Друга дата"><button data-act="plandate" data-id="' + r.id + '">Задай дата</button></div></div>';
  }

  // „Моето ястие“: снимки на готовото ястие, с дата
  function mineHtml(r) {
    var m = r.myPhotos || [];
    return (m.length ? '' : '<div class="hint">Снимай готовото ястие, за да виждаш как е станало.</div>') +
      '<div class="photos mine">' + m.map(function (p, i) {
        return '<div class="ph"><img src="' + p.src + '" alt="Моето ястие" data-act="zoom" data-k="my" data-i="' + i + '" data-id="' + r.id + '">' +
          '<span class="cap">' + new Date(p.at).toLocaleDateString('bg-BG') + '</span>' +
          '<button type="button" data-act="delmine" data-id="' + r.id + '" data-n="' + p.id + '" aria-label="Махни снимката">×</button></div>';
      }).join('') + '<button type="button" class="addph" data-act="addmine" data-id="' + r.id + '" aria-label="Добави снимка на ястието">+</button></div>' +
      '<input type="file" id="myin" data-id="' + r.id + '" accept="image/*" multiple hidden>';
  }

  // „Какво трябва да купя?“: отбелязваш продуктите, които нямаш, и те отиват в списъка за пазаруване
  function inShop(i) {
    var key = norm(i.name) + '|' + i.unit;
    return S.shop.some(function (x) { return !x.done && norm(x.name) + '|' + x.unit === key; });
  }
  function shopPickHtml(r) {
    if (!S.shopOpen[r.id]) {
      return '<div class="row2" style="margin:0 0 8px"><button class="btn shopbtn" data-act="shopopen" data-id="' + r.id + '">' + ICON.bag + 'Какво трябва да купя?</button></div>';
    }
    var ings = r.ingredients || [], sv = S.srv[r.id] || r.servings || 1, f = sv / (r.servings || 1);
    if (!ings.length) return '<div class="plan"><div class="pt">Какво трябва да купя?</div><div class="sm">Рецептата още няма продукти.</div></div>';
    return '<div class="plan"><div class="pt">' + ICON.bag + ' Какво трябва да купя?</div><div class="sm">Отбележи продуктите, които нямаш. Количествата са за ' + sv + ' порции.</div><ul class="picks">' +
      ings.map(function (i, n) {
        var has = inShop(i);
        return '<li><label' + (has ? ' class="dis"' : '') + '><input type="checkbox" data-i="' + n + '"' + (has ? ' disabled' : '') + '><span>' + esc(i.name) +
          (has ? ' <em class="in-list">вече в списъка</em>' : '') + '</span><b>' + esc(U.display(i, f)) + '</b></label></li>';
      }).join('') + '</ul><div class="pk"><button data-act="pickall">Отбележи всички</button><button data-act="picknone">Махни отметките</button></div>' +
      '<div class="row2"><button class="btn primary" data-act="shopadd" data-id="' + r.id + '">' + ICON.bag + 'Добави в списъка за пазаруване</button></div>' +
      '<div class="row2" style="margin-top:6px"><button class="btn" data-act="shopclose" data-id="' + r.id + '">Затвори</button></div></div>';
  }

  /* ---------- рецепта ---------- */
  function ingList(r, sv) {
    var f = sv / (r.servings || sv || 1);
    return (r.ingredients || []).map(function (i) {
      var a = U.display(i, f);
      var o = f === 1 && i.original ? '<em>' + esc(i.original) + '</em>' : '';
      return '<li class="ing"><span>' + esc(i.name) + '</span><span class="a">' + (a ? '<b>' + esc(a) + '</b>' : '') + o + '</span></li>';
    }).join('');
  }
  // Текст за споделяне: без бележките
  function shareText(r) {
    var sv = S.srv[r.id] || r.servings || 1, f = sv / (r.servings || sv || 1);
    var t = r.title + '\n' + RB.cat(r.cat).name;
    var meta = [];
    if (r.time) meta.push('Приготвяне: ' + fmtTime(r.time));
    meta.push('Порции: ' + sv);
    t += '\n' + meta.join(' · ');
    if ((r.ingredients || []).length) {
      t += '\n\nПродукти:\n' + r.ingredients.map(function (i) {
        var a = U.display(i, f);
        return '• ' + (a ? a + ' ' : '') + i.name + (f === 1 && i.original ? ' (' + i.original + ')' : '');
      }).join('\n');
    }
    if ((r.steps || []).length) t += '\n\nПриготвяне:\n' + r.steps.map(function (s, n) { return (n + 1) + '. ' + s; }).join('\n');
    if (r.video) t += '\n\nВидео: ' + r.video;
    if (r.source) t += '\nИзточник: ' + r.source;
    return t + '\n\nЩипка вкус';
  }
  // Рецептата като картинка: приложения като Messenger и Viber губят текста, когато се праща със снимки
  function cardFile(r) {
    return new Promise(function (resolve) {
      try {
        var sv = S.srv[r.id] || r.servings || 1, f = sv / (r.servings || sv || 1);
        var W = 1080, P = 64, MW = W - 2 * P, FONT = 'system-ui, "Segoe UI", Roboto, Arial, sans-serif';
        var cv = document.createElement('canvas'), ctx = cv.getContext('2d');
        var items = [];
        function add(text, size, weight, color, gap) { items.push({ t: text, s: size, w: weight, c: color, g: gap || 0 }); }
        var meta = [RB.cat(r.cat).name];
        if (r.time) meta.push('Приготвяне: ' + fmtTime(r.time));
        meta.push('Порции: ' + sv);
        add(r.title, 56, '700', '#3F5B4A', 12);
        add(meta.join(' · '), 30, '400', '#7A7468', 36);
        if ((r.ingredients || []).length) {
          add('Продукти', 38, '700', '#3F5B4A', 12);
          r.ingredients.forEach(function (i) {
            var a = U.display(i, f);
            add('• ' + (a ? a + ' ' : '') + i.name + (f === 1 && i.original ? ' (' + i.original + ')' : ''), 32, '400', '#2B2A27', 8);
          });
          items[items.length - 1].g = 36;
        }
        if ((r.steps || []).length) {
          add('Приготвяне', 38, '700', '#3F5B4A', 12);
          r.steps.forEach(function (s, n) { add((n + 1) + '. ' + s, 32, '400', '#2B2A27', 14); });
          items[items.length - 1].g = 36;
        }
        if (r.video) add('Видео: ' + r.video, 26, '400', '#7A7468', 6);
        if (r.source) add('Източник: ' + r.source, 26, '400', '#7A7468', 6);
        add('Щипка вкус', 28, '700', '#3F5B4A', 0);
        cv.width = W;
        var lines = [], y = P;
        items.forEach(function (it) {
          ctx.font = it.w + ' ' + it.s + 'px ' + FONT;
          var words = it.t.split(/\s+/), cur = '';
          words.forEach(function (w) {
            var test = cur ? cur + ' ' + w : w;
            if (cur && ctx.measureText(test).width > MW) { lines.push({ t: cur, it: it, y: y }); y += Math.round(it.s * 1.35); cur = w; } else cur = test;
          });
          lines.push({ t: cur, it: it, y: y }); y += Math.round(it.s * 1.35) + it.g;
        });
        cv.height = y + P;
        ctx.fillStyle = '#F6F3EE'; ctx.fillRect(0, 0, W, cv.height);
        ctx.textBaseline = 'top';
        lines.forEach(function (l) { ctx.font = l.it.w + ' ' + l.it.s + 'px ' + FONT; ctx.fillStyle = l.it.c; ctx.fillText(l.t, P, l.y); });
        cv.toBlob(function (b) { resolve(b ? new File([b], 'recepta.png', { type: 'image/png' }) : null); }, 'image/png');
      } catch (e) { resolve(null); }
    });
  }
  function fetchFile(src, n) {
    return fetch(src).then(function (x) { return x.blob(); }).then(function (b) {
      return new File([b], 'snimka-' + (n + 1) + '.jpg', { type: b.type || 'image/jpeg' });
    });
  }
  function shareRecipe(r, withPhotos) {
    var text = shareText(r);
    var srcs = withPhotos ? (r.photos || []).concat((r.myPhotos || []).map(function (p) { return p.src; })).filter(Boolean) : [];
    var files = Promise.resolve([]);
    if (withPhotos) {
      toast('Подготвям рецептата…');
      files = Promise.all([cardFile(r), Promise.all(srcs.map(fetchFile)).catch(function () { return []; })]).then(function (x) {
        if (!x[0]) toast('Не успях да направя картинката с рецептата');
        return (x[0] ? [x[0]] : []).concat(x[1]);
      });
    }
    files.then(function (list) {
      var data = { title: r.title, text: text };
      if (list.length && navigator.canShare && navigator.canShare({ files: list })) data.files = list;
      if (navigator.share) {
        return navigator.share(data).catch(function (e) { if (e && e.name !== 'AbortError') toast('Споделянето не успя'); });
      }
      // компютър без споделяне: копира се текстът
      if (navigator.clipboard && navigator.clipboard.writeText) {
        return navigator.clipboard.writeText(text).then(function () { toast('Рецептата е копирана. Постави я където искаш.'); }, function () { toast('Не мога да копирам'); });
      }
      toast('Този браузър не поддържа споделяне');
    });
  }
  function notesHtml(r) {
    if (!r.notes || !r.notes.length) return '<div class="hint">Още няма бележки.</div>';
    return r.notes.map(function (n) {
      return '<div class="note"><div>' + esc(n.text).replace(/\n/g, '<br>') + '<small>' + new Date(n.at).toLocaleDateString('bg-BG') + '</small></div>' +
        '<button data-act="delnote" data-id="' + r.id + '" data-n="' + n.id + '" aria-label="Изтрий бележката">×</button></div>';
    }).join('');
  }
  function videoHtml(r) {
    if (!r.video) return '';
    var id = ytId(r.video);
    var h = '<div class="sec-t">Видео</div>';
    if (id) return h + '<div class="video"><iframe src="https://www.youtube-nocookie.com/embed/' + id + '" title="Видео на рецептата" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>';
    return h + '<a class="btn" href="' + esc(r.video) + '" target="_blank" rel="noopener">Отвори видеото</a>';
  }
  function viewRecipe(id) {
    var r = find(id);
    if (!r) return head('Рецептата не е намерена', null, { back: true });
    var c = RB.cat(r.cat), sv = S.srv[id] || r.servings || 1;
    var hero = cover(r) ? '<img src="' + cover(r) + '" alt="">' : '<div class="circ"><svg viewBox="0 0 24 24"><path d="' + c.icon + '"/></svg></div>';
    var h = '<div class="hero">' + hero +
      '<button class="hb" style="left:18px" data-act="back" aria-label="Назад">' + ICON.back + '</button>' +
      '<button class="hb' + (r.fav ? ' on' : '') + '" style="right:18px" data-act="fav" data-id="' + r.id + '" aria-label="Любима">' + ICON.heart + '</button></div>';
    if (r.photos && (r.photos.length > 1 || (r.photos.length && (r.myPhotos || []).length))) {
      h += '<div class="hint" style="margin:0 0 4px">Снимки на рецептата</div><div class="thumbs">' +
        r.photos.map(function (p, i) { return '<img src="' + p + '" alt="" data-act="zoom" data-k="orig" data-i="' + i + '" data-id="' + r.id + '">'; }).join('') + '</div>';
    }
    h += '<div class="cat-k">' + esc(c.name) + '</div><h1 class="r-title">' + esc(r.title) + '</h1>';
    var pills = [];
    if (r.time) pills.push('Приготвяне: ' + fmtTime(r.time));
    (r.tags || []).forEach(function (t) { pills.push('#' + t); });
    if (pills.length) h += '<div class="pills">' + pills.map(function (p) { return '<span class="pill">' + esc(p) + '</span>'; }).join('') + '</div>';
    h += '<div id="plan">' + planHtml(r) + '</div><div id="shoppick">' + shopPickHtml(r) + '</div>';
    h += '<div class="serv"><span>Порции</span><div class="step"><button data-act="srv" data-d="-1" data-id="' + r.id + '" aria-label="По-малко порции">−</button><b id="sv">' + sv + '</b><button data-act="srv" data-d="1" data-id="' + r.id + '" aria-label="Повече порции">+</button></div></div>';
    h += '<ul class="ings" id="ings">' + ingList(r, sv) + '</ul>';
    if (r.steps && r.steps.length) h += '<div class="sec-t">Приготвяне</div><ol class="steps">' + r.steps.map(function (s) { return '<li><span>' + esc(s) + '</span></li>'; }).join('') + '</ol>';
    h += videoHtml(r);
    if (r.source) h += '<p class="hint" style="margin-top:12px">Източник: <a href="' + esc(r.source) + '" target="_blank" rel="noopener" style="text-decoration:underline">' + esc(r.source) + '</a></p>';
    h += '<div class="sec-t">Моето ястие</div><div id="mine">' + mineHtml(r) + '</div>';
    h += '<div class="sec-t">Моите бележки</div><div id="notes">' + notesHtml(r) + '</div>' +
      '<div class="addnote"><textarea id="nt" placeholder="Добави бележка…" rows="2"></textarea><button class="btn small primary" data-act="addnote" data-id="' + r.id + '">Добави</button></div>';
    h += '<div class="row2" style="margin-top:22px"><a class="btn primary" href="#/cook/' + r.id + '">Режим за готвене</a></div>' +
      '<div class="row2"><button class="btn" data-act="share" data-photos="1" data-id="' + r.id + '">Сподели със снимки</button><button class="btn" data-act="share" data-id="' + r.id + '">Сподели текста</button></div>' +
      '<div class="row2"><a class="btn" href="#/edit/' + r.id + '">Редактирай</a><button class="btn danger" data-act="del" data-id="' + r.id + '">Изтрий</button></div>';
    return h;
  }

  /* ---------- режим за готвене ---------- */
  var wake = null;
  function takeWake() { try { if (navigator.wakeLock) navigator.wakeLock.request('screen').then(function (w) { wake = w; }).catch(function () {}); } catch (e) {} }
  function releaseWake() { if (wake) { wake.release().catch(function () {}); wake = null; } }
  function cookHtml(r) {
    var st = r.steps || [], i = S.cook.i, n = st.length, sv = S.srv[r.id] || r.servings || 1;
    var body;
    if (S.cook.ing) body = '<div class="ingp"><ul class="ings">' + ingList(r, sv) + '</ul></div>';
    else if (!n) body = '<div class="big">Тази рецепта още няма стъпки.</div>';
    else body = '<div class="prog"><i style="width:' + ((i + 1) / n * 100) + '%"></i></div><div class="cnt">Стъпка ' + (i + 1) + ' от ' + n + '</div><div class="big">' + esc(st[i]) + '</div>';
    return '<div class="top"><button class="iconbtn" data-act="exitcook" data-id="' + r.id + '" aria-label="Затвори">' + ICON.close + '</button><div class="ct">' + esc(r.title) + '</div>' +
      '<button class="btn small" data-act="cing">' + (S.cook.ing ? 'Стъпки' : 'Продукти') + '</button></div>' + body +
      '<div class="nav2"><button class="btn" data-act="cprev"' + (i === 0 ? ' disabled' : '') + '>Назад</button><button class="btn primary" data-act="cnext" data-id="' + r.id + '">' + (i >= n - 1 ? 'Готово' : 'Напред') + '</button></div>';
  }
  function viewCook(id) {
    var r = find(id);
    if (!r) return head('Рецептата не е намерена', null, { back: true });
    if (S.cook.id !== id) S.cook = { id: id, i: 0, ing: false };
    return '<div class="cook" id="cookbox">' + cookHtml(r) + '</div>';
  }

  /* ---------- форма: добавяне и редакция ---------- */
  function irow(i) {
    i = i || { amount: null, unit: '', name: '', original: '' };
    var units = U.UNIT_OPTIONS.slice();
    if (i.unit && units.indexOf(i.unit) < 0) units.push(i.unit);
    return '<div class="irow"><input class="ia" inputmode="text" placeholder="к-во" value="' + esc(i.amount == null ? '' : U.fmt(i.amount)) + '">' +
      '<select class="iu" aria-label="Мярка">' + units.map(function (u) { return '<option' + (u === i.unit ? ' selected' : '') + '>' + esc(u) + '</option>'; }).join('') + '</select>' +
      '<input class="inm" placeholder="продукт" value="' + esc(i.name) + '">' +
      '<button type="button" class="x" data-act="delrow" aria-label="Махни реда">×</button>' +
      '<input class="io" placeholder="по оригинал (напр. 2 чаени чаши)" value="' + esc(i.original) + '"></div>';
  }
  function photosHtml() {
    return S.draft.photos.map(function (p, i) {
      return '<div class="ph"><img src="' + p + '" alt=""><button type="button" data-act="delph" data-i="' + i + '" aria-label="Махни снимката">×</button></div>';
    }).join('') + '<button type="button" class="addph" data-act="addph" aria-label="Добави снимка">+</button>';
  }
  /* ---------- рецепта от снимка (Gemini през функцията read-recipe) ---------- */
  function scanHtml() {
    return '<div class="scan"><button type="button" class="btn primary" data-act="scan">Рецепта от снимка</button>' +
      '<div class="hint">Снимай или избери до 3 снимки на една рецепта (печатна или на ръка). Попълва се чернова, която ти проверяваш и поправяш, преди да запазиш. Снимките се изпращат към Google Gemini за разчитане.</div>' +
      '<div class="scanurl"><input type="url" id="scanurl" inputmode="url" autocapitalize="off" autocorrect="off" placeholder="Постави адрес на сайт или YouTube видео" aria-label="Адрес на рецепта">' +
      '<button type="button" class="btn primary" data-act="scanurl">Рецепта от адрес</button></div>' +
      '<div class="hint">Сайтът или видеото се четат от Google Gemini и рецептата се превръща в текст. Работи със сайтове с рецепти и публични YouTube видеа. Facebook, Instagram и TikTok не се поддържат — снимай екрана.</div>' +
      '<div id="scanst" class="hint" role="status"></div></div><input type="file" id="scanin" accept="image/*" multiple hidden>';
  }
  function cookingHtml(msg) {
    return '<div class="cooking"><svg viewBox="0 0 72 72" aria-hidden="true">' +
      '<path class="pot" d="M14 38h40v12a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8zM14 42H8M54 42h6"/>' +
      '<path class="lid" d="M17 34Q38 20 59 29M42 24.5v-4"/>' +
      '<g class="steam"><path d="M22 30q-4-5 0-9t0-9"/><path d="M31 28q-4-5 0-9t0-9"/><path d="M40 26q-4-5 0-9t0-9"/></g></svg>' +
      '<span>' + msg + '</span></div>';
  }
  function scanUrl(link) {
    var st = $('#scanst');
    if (!st) return;
    link = (link || '').trim();
    if (!link) { st.textContent = 'Постави адрес на сайт или на YouTube видео.'; return; }
    st.innerHTML = cookingHtml('Чета рецептата от адреса… Видеата може да отнемат до минута.');
    $$('.scan .btn').forEach(function (b) { b.disabled = true; });
    S.pending = Cloud.client.functions.invoke('read-recipe', { body: { url: link } }).then(function (r) {
      if (r.error) return scanMessage(r.error).then(function (m) { throw new Error(m); });
      if (!r.data || !r.data.draft) throw new Error('Не върна рецепта.');
      applyDraft(r.data.draft, []);
      var f = $('#f');
      var fld = f && f.querySelector('[name=' + (r.data.kind === 'video' ? 'video' : 'source') + ']');
      if (fld && !fld.value) fld.value = link;
      var u = r.data.draft.uncertain || [];
      if ($('#scanst')) $('#scanst').textContent = 'Готово. Прочети внимателно всичко и поправи грешките, преди да запазиш.' + (u.length ? ' Не съм сигурен за: ' + u.join('; ') + '.' : '');
    }).catch(function (e) {
      if ($('#scanst')) $('#scanst').textContent = e && e.message && e.message.indexOf('[object') < 0 ? e.message : 'Адресът не може да се прочете.';
    }).then(function () { $$('.scan .btn').forEach(function (b) { b.disabled = false; }); });
  }
  function scanMessage(err) {
    var c = err && err.context;
    if (c && typeof c.json === 'function') return c.json().then(function (j) { return (j && j.error) || 'Разпознаването не успя.'; }, function () { return 'Разпознаването не успя.'; });
    return Promise.resolve(/Failed to fetch|NetworkError/i.test(String(err && err.message)) ? 'Няма връзка с интернет.' : 'Разпознаването не успя.');
  }
  function applyDraft(d, imgs) {
    var f = $('#f'); if (!f) return;
    var set = function (n, v) { var el = f.querySelector('[name=' + n + ']'); if (el && v != null && v !== '') el.value = v; };
    set('title', d.title); set('cat', d.cat); set('time', d.time); set('servings', d.servings);
    set('tags', (d.tags || []).join(', ')); set('steps', (d.steps || []).join('\n'));
    var rows = (d.ingredients || []).map(U.parseLine).filter(Boolean);
    if (rows.length) $('#ingrows').innerHTML = rows.map(irow).join('');
    S.draft.photos = S.draft.photos.concat(imgs); $('#photos').innerHTML = photosHtml();
  }
  function scanRecipe(files) {
    var st = $('#scanst'), btn = document.querySelector('[data-act=scan]');
    if (!files.length || !st) return;
    st.innerHTML = '<div class="cooking"><svg viewBox="0 0 72 72" aria-hidden="true">' +
      '<path class="pot" d="M14 38h40v12a8 8 0 0 1-8 8H22a8 8 0 0 1-8-8zM14 42H8M54 42h6"/>' +
      '<path class="lid" d="M17 34Q38 20 59 29M42 24.5v-4"/>' +
      '<g class="steam"><path d="M22 30q-4-5 0-9t0-9"/><path d="M31 28q-4-5 0-9t0-9"/><path d="M40 26q-4-5 0-9t0-9"/></g></svg>' +
      '<span>Чета рецептата… Може да отнеме до половин минута.</span></div>';
    btn.disabled = true;
    S.pending = Promise.all(files.map(function (f) { return readImageMax(f, 2000); })).then(function (imgs) {
      return Cloud.client.functions.invoke('read-recipe', { body: { images: imgs } }).then(function (r) {
        if (r.error) return scanMessage(r.error).then(function (m) { throw new Error(m); });
        if (!r.data || !r.data.draft) throw new Error('Разпознаването не върна рецепта.');
        applyDraft(r.data.draft, imgs);
        var u = r.data.draft.uncertain || [];
        if ($('#scanst')) $('#scanst').textContent = 'Готово. Прочети внимателно всичко и поправи грешките, преди да запазиш.' + (u.length ? ' Не съм сигурен за: ' + u.join('; ') + '.' : '');
      });
    }).catch(function (e) {
      if ($('#scanst')) $('#scanst').textContent = e && e.message && e.message.indexOf('[object') < 0 ? e.message : 'Снимката не може да се прочете.';
    }).then(function () { var b = document.querySelector('[data-act=scan]'); if (b) b.disabled = false; });
  }
  function viewForm(id) {
    var r = id ? find(id) : null;
    if (id && !r) return head('Рецептата не е намерена', null, { back: true });
    S.draft = { id: r ? r.id : null, photos: r && r.photos ? r.photos.slice() : [] };
    var ings = r && r.ingredients && r.ingredients.length ? r.ingredients : [null, null, null];
    var cur = r ? r.cat : CATS[0].id;
    return head(r ? 'Редакция' : 'Нова рецепта', null, { back: true }) +
      (!r && Cloud.enabled ? scanHtml() : '') +
      '<form id="f" autocomplete="off">' +
      '<label class="fld">Заглавие<input type="text" name="title" required value="' + esc(r ? r.title : '') + '"></label>' +
      '<div class="two"><label class="fld">Категория<select name="cat">' + CATS.map(function (c) { return '<option value="' + c.id + '"' + (c.id === cur ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></label>' +
      '<label class="fld">Време за приготвяне (мин)<input type="text" inputmode="numeric" name="time" value="' + esc(r && r.time ? r.time : '') + '"></label></div>' +
      '<div class="hint" style="margin-top:-6px">Средно ориентировъчно време за цялата рецепта, от подготовката до готовото ястие (напр. 90 за час и половина).</div>' +
      '<div class="two"><label class="fld">Порции<input type="text" inputmode="numeric" name="servings" value="' + esc(r ? r.servings : 4) + '"></label>' +
      '<label class="fld">Етикети (със запетая)<input type="text" name="tags" value="' + esc(r ? (r.tags || []).join(', ') : '') + '"></label></div>' +
      '<div class="sec-t" style="margin-top:6px">Снимки</div><div class="photos" id="photos">' + photosHtml() + '</div>' +
      '<input type="file" id="phin" accept="image/*" multiple hidden>' +
      '<div class="sec-t">Продукти</div><div id="ingrows">' + ings.map(irow).join('') + '</div>' +
      '<button type="button" class="btn small" data-act="addrow">+ Продукт</button>' +
      '<details class="paste"><summary>Постави списък с продукти</summary>' +
      '<div class="hint">Един продукт на ред, напр. „2 чаени чаши вода“. Мерките се превръщат в мл/г, а оригиналът се пази.</div>' +
      '<textarea id="paste" rows="5" placeholder="2 чаени чаши вода&#10;3 с.л. олио&#10;1 чаена чаша брашно"></textarea>' +
      '<button type="button" class="btn small" data-act="parsepaste">Добави към списъка</button></details>' +
      '<div class="sec-t">Приготвяне</div><textarea name="steps" rows="7" placeholder="Всяка стъпка на нов ред">' + esc(r ? (r.steps || []).join('\n') : '') + '</textarea>' +
      '<div class="sec-t">Връзки</div>' +
      '<label class="fld">Линк към видео<input type="url" name="video" placeholder="https://…" value="' + esc(r ? r.video : '') + '"></label>' +
      '<label class="fld">Линк към източник<input type="url" name="source" placeholder="https://…" value="' + esc(r ? r.source : '') + '"></label>' +
      '<button class="btn primary" type="submit" style="margin-top:8px">Запази рецептата</button></form>';
  }
  function saveForm() {
    var f = $('#f');
    var val = function (n) { return f.querySelector('[name=' + n + ']').value.trim(); };
    var title = val('title');
    if (!title) { toast('Напиши заглавие'); return; }
    var ings = [];
    $$('.irow').forEach(function (row) {
      var name = row.querySelector('.inm').value.trim();
      var aRaw = row.querySelector('.ia').value.trim();
      var unit = row.querySelector('.iu').value;
      var amount = unit === 'на вкус' ? null : U.parseAmountStr(aRaw);
      if (aRaw && amount == null && unit !== 'на вкус') { name = (aRaw + ' ' + name).trim(); }
      if (!name) return;
      var original = row.querySelector('.io').value.trim();
      // Мярка като „1 чаена чаша“ + „брашно“ се превръща в грамове по таблицата, както в „Постави списък“
      if (amount != null && unit && !row.querySelector('.inm').value.match(/^\s*$/)) {
        var cv = U.parseLine(U.fmt(amount) + ' ' + unit + ' ' + name);
        if (cv && cv.original && cv.amount != null) { amount = cv.amount; unit = cv.unit; original = original || cv.original; }
      }
      ings.push({ amount: amount, unit: amount == null && unit !== 'на вкус' ? '' : unit, name: name, original: original });
    });
    var steps = val('steps').split('\n').map(function (s) { return s.replace(/^\s*\d+[.)]\s*/, '').trim(); }).filter(Boolean);
    var old = S.draft.id ? find(S.draft.id) : null;
    var rec = Object.assign({ notes: [], fav: false, created: Date.now() }, old || {}, {
      id: S.draft.id || uid(), title: title, cat: val('cat'),
      time: parseInt(val('time'), 10) || null, servings: parseInt(val('servings'), 10) || 4,
      tags: val('tags').split(',').map(function (t) { return t.replace(/^#/, '').trim(); }).filter(Boolean),
      ingredients: ings, steps: steps, photos: S.draft.photos.slice(), video: val('video'), source: val('source'),
      updated: Date.now(), demo: false
    });
    delete S.srv[rec.id];
    persist(rec).then(function () { toast('Запазено'); location.hash = '#/r/' + rec.id; });
  }

  /* ---------- пазаруване ---------- */
  function shopText(i) { return (U.display(i, 1) + ' ' + i.name).trim(); }
  function viewShop() {
    var rows = S.shop.map(function (i) {
      return '<div class="shop' + (i.done ? ' done' : '') + '"><input type="checkbox" data-act="shopcheck" data-id="' + i.id + '"' + (i.done ? ' checked' : '') + ' aria-label="Купено"><span>' + esc(shopText(i)) +
        '</span><button class="x" data-act="shopdel" data-id="' + i.id + '" aria-label="Махни">×</button></div>';
    }).join('');
    return head('За пазаруване', S.shop.length ? S.shop.filter(function (i) { return !i.done; }).length + ' за купуване' : null) +
      '<form id="sf" class="addnote" style="margin-bottom:12px"><input type="text" id="sin" placeholder="Напр. 2 л мляко" autocomplete="off"><button class="btn small primary" type="submit">Добави</button></form>' +
      (rows || '<div class="empty">Списъкът е празен. Добави продукти от рецепта или ги напиши тук.</div>') +
      (S.shop.some(function (i) { return i.done; }) ? '<div class="row2"><button class="btn" data-act="shopclear">Махни отметнатите</button></div>' : '');
  }
  function addToShop(item) {
    var key = norm(item.name) + '|' + item.unit;
    var ex = S.shop.filter(function (x) { return !x.done && norm(x.name) + '|' + x.unit === key; })[0];
    if (ex && ex.amount != null && item.amount != null) ex.amount += item.amount;
    else S.shop.push({ id: uid(), name: item.name, amount: item.amount, unit: item.unit, done: false });
  }

  /* ---------- профил ---------- */
  function measuresTable() {
    return U.TABLE_ORDER.map(function (k) {
      var t = U.TABLES[k];
      return '<div class="sec-t" style="font-size:16px;margin:14px 0 4px">' + esc(U.UNIT_TITLES[k]) + '</div>' +
        Object.keys(t).map(function (p) {
          return '<div class="ing"><span>' + esc(U.PRODUCT_NAMES[p]) + '</span><span class="a"><b>' + t[p] + (p === 'water' ? ' мл' : ' г') + '</b></span></div>';
        }).join('');
    }).join('') + '<div class="hint" style="margin-top:12px">Други: 1 щипка ≈ 0,3–0,5 г; 1 шепа сол ≈ 20–40 г; 1 бучка захар ≈ 4–6 г; 1 яйце ≈ 45–55 г; малка глава лук ≈ 40–60 г; голяма ≈ 150–200 г; 1 морков ≈ 50–80 г; кибритена кутийка сирене или кашкавал ≈ 30 г. Теглата са ориентировъчни (равни лъжици, насипани чаши).</div>';
  }
  function accountNote() {
    if (Cloud.enabled) {
      return '<div class="note" style="display:block"><b>Влязла си като ' + esc(Cloud.user && Cloud.user.email) + '.</b><br>Рецептите и снимките са в облака и се виждат от всичките ти устройства. На чужд или служебен компютър натисни „Изход“, когато приключиш.</div>' +
        '<div class="row2"><button class="btn" data-act="logout">Изход</button></div>';
    }
    return '<div class="note" style="display:block"><b>Данните са само на това устройство.</b><br>Пази копие чрез „Запази копие“ по-долу.</div>';
  }
  var APP_VERSION = '2026-11-04 з';
  function viewMe() {
    var demo = S.recipes.filter(function (r) { return r.demo; }).length;
    return head('Профил') + accountNote() +
      '<div class="sec-t">Копие на рецептите</div><div class="row2"><button class="btn" data-act="export">Запази копие (файл)</button><button class="btn" data-act="importpick">Зареди от файл</button></div>' +
      '<input type="file" id="impin" accept="application/json,.json" hidden>' +
      '<div class="sec-t">Мерки</div><div class="hint">„Чаши“ и „лъжици“ се превръщат в мл и г по таблицата по-долу. Продукт, който го няма в таблицата, остава в оригиналната мярка.</div>' +
      '<details class="paste"><summary>Покажи таблицата</summary>' + measuresTable() + '</details>' +
      (demo ? '<div class="sec-t">Примерни рецепти</div><div class="hint">Има ' + demo + ' примерни рецепти, за да видиш как изглежда приложението.</div><button class="btn danger small" data-act="deldemo">Изтрий примерните</button>' : '') +
      '<div class="hint" style="margin-top:24px">Версия ' + APP_VERSION + '</div>';
  }

  /* ---------- вход (облак) ---------- */
  function loginHtml() {
    var L = S.login || (S.login = { mode: 'in' }), m = L.mode;
    var titles = { 'in': 'Вход', up: 'Нов акаунт', reset: 'Забравена парола', newpw: 'Нова парола' };
    var btnText = { 'in': 'Вход', up: 'Създай акаунт', reset: 'Изпрати връзка', newpw: 'Запази паролата' }[m];
    var needEmail = m !== 'newpw', needPw = m !== 'reset', needPw2 = m === 'up' || m === 'newpw';
    var minl = m === 'in' ? '' : ' minlength="8"';
    var links = {
      'in': '<button type="button" class="lnk" data-act="lmode" data-m="up">Нов акаунт</button><button type="button" class="lnk" data-act="lmode" data-m="reset">Забравена парола</button>',
      up: '<button type="button" class="lnk" data-act="lmode" data-m="in">Вече имам акаунт</button>',
      reset: '<button type="button" class="lnk" data-act="lmode" data-m="in">Назад към входа</button>',
      newpw: ''
    }[m];
    return '<div class="login"><div class="lg-brand">Щипка вкус</div><h1 class="title">' + titles[m] + '</h1>' +
      (m === 'up' ? '<p class="hint">Ще получиш писмо за потвърждение на имейла.</p>' : '') +
      (m === 'reset' ? '<p class="hint">Ще ти изпратим връзка за нова парола.</p>' : '') +
      (L.err ? '<div class="note err">' + esc(L.err) + '</div>' : '') + (L.ok ? '<div class="note okk">' + esc(L.ok) + '</div>' : '') +
      '<form id="lf" autocomplete="on">' +
      (needEmail ? '<label class="fld">Имейл<input type="email" name="email" autocomplete="email" required value="' + esc(L.email || '') + '"></label>' : '') +
      (needPw ? '<label class="fld">' + (m === 'newpw' ? 'Нова парола' : 'Парола') + '<input type="password" name="pw" autocomplete="' + (m === 'in' ? 'current-password' : 'new-password') + '" required' + minl + '></label>' : '') +
      (needPw2 ? '<label class="fld">Повтори паролата<input type="password" name="pw2" autocomplete="new-password" required minlength="8"></label>' : '') +
      '<button class="btn primary" type="submit" style="margin-top:6px">' + btnText + '</button></form>' +
      '<div class="lg-links">' + links + '</div></div>';
  }
  function showLogin() {
    app.innerHTML = loginHtml();
    window.scrollTo(0, 0);
  }
  function doAuth() {
    var L = S.login, f = $('#lf'), m = L.mode;
    var val = function (n) { var el = f.querySelector('[name=' + n + ']'); return el ? el.value : ''; };
    var email = val('email').trim(), pw = val('pw'), pw2 = val('pw2');
    L.email = email; L.err = ''; L.ok = '';
    var fail = function (e) { L.err = Cloud.message(e); showLogin(); };
    if ((m === 'up' || m === 'newpw') && pw.length < 8) { L.err = 'Паролата трябва да е поне 8 знака.'; showLogin(); return; }
    if ((m === 'up' || m === 'newpw') && pw !== pw2) { L.err = 'Двете пароли не съвпадат.'; showLogin(); return; }
    var btn = f.querySelector('button[type=submit]'); btn.disabled = true; btn.textContent = 'Момент…';
    if (m === 'in') Cloud.signIn(email, pw).then(function () { boot(); }).catch(fail);
    else if (m === 'up') {
      Cloud.signUp(email, pw).then(function (d) {
        if (d && d.session) { boot(); return; }
        L.mode = 'in'; L.ok = 'Изпратихме писмо на ' + email + '. Натисни връзката в него, за да потвърдиш акаунта, и после влез.'; showLogin();
      }).catch(fail);
    } else if (m === 'reset') {
      Cloud.resetPassword(email).then(function () { L.mode = 'in'; L.ok = 'Изпратихме връзка за нова парола на ' + email + '.'; showLogin(); }).catch(fail);
    } else if (m === 'newpw') {
      Cloud.setPassword(pw).then(function () { L.mode = 'in'; boot(); }).catch(fail);
    }
  }

  /* ---------- навигация ---------- */
  function go() {
    if (Cloud.enabled) {
      if (!Cloud.user || (S.login && S.login.mode === 'newpw')) { showLogin(); return; }
      if (!S.booted) return;
    }
    releaseWake();
    var p = (location.hash || '#/').slice(1).split('/').filter(Boolean);
    var v = p[0] || '', id = p[1], html;
    if (ro) ro.disconnect();
    switch (v) {
      case 'c': html = viewCat(id); break;
      case 'r': html = viewRecipe(id); break;
      case 'cook': html = viewCook(id); break;
      case 'new': html = viewForm(null); break;
      case 'edit': html = viewForm(id); break;
      case 'fav': html = viewFav(); break;
      case 'plan': html = viewPlan(); break;
      case 'shop': html = viewShop(); break;
      case 'me': html = viewMe(); break;
      default: v = ''; html = viewHome();
    }
    S.route = v;
    app.innerHTML = html + (v === 'cook' ? '' : nav(v));
    // Бутон „Назад“ на всеки екран, до който се е стигнало от друг (ако още го няма)
    if (S.d > 0 && v !== 'cook' && !$('[data-act=back]') && $('.bar')) {
      $('.bar').insertAdjacentHTML('afterbegin', '<button class="iconbtn" data-act="back" aria-label="Назад">' + ICON.back + '</button>');
    }
    // Бутон „Начало“ на всеки екран освен началния
    if (v !== '' && v !== 'cook') {
      var bar = $('.bar'), hero = $('.hero');
      if (bar) bar.insertAdjacentHTML('beforeend', '<a class="iconbtn" href="#/" data-act="home" aria-label="Начало">' + ICON.home + '</a>');
      else if (hero) hero.insertAdjacentHTML('beforeend', '<a class="hb" style="left:72px" href="#/" data-act="home" aria-label="Начало">' + ICON.home + '</a>');
    }
    window.scrollTo(0, 0);
    fitFrames();
    if (v === 'cook') takeWake();
  }

  /* ---------- действия ---------- */
  function setFavUi(id, on) {
    $$('[data-act=fav][data-id="' + id + '"]').forEach(function (b) { b.classList.toggle('on', on); });
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t || t.tagName === 'INPUT') return;
    var a = t.dataset.act, id = t.dataset.id, r = id ? find(id) : null;
    switch (a) {
      case 'lmode':
        var lem = $('#lf [name=email]');
        S.login = { mode: t.dataset.m, email: lem ? lem.value : ((S.login && S.login.email) || '') };
        showLogin();
        break;
      case 'logout':
        Cloud.signOut().then(function () {
          S.recipes = []; S.shop = []; S.booted = false; S.uid = null;
          S.login = { mode: 'in', ok: 'Излезе от акаунта.' };
          showLogin();
        }).catch(syncFail);
        break;
      case 'retry':
        boot();
        break;
      case 'home':
        S.q = ''; S.time = ''; S.cat = ''; S.favOnly = false; S.planOnly = false;
        if (S.route === '') go();
        break;
      case 'back':
        if (S.d > 0) history.back(); else location.hash = '#/';
        break;
      case 'share':
        if (r) shareRecipe(r, t.dataset.photos === '1');
        break;
      case 'fav':
        if (!r) return;
        r.fav = !r.fav; persist(r); setFavUi(id, r.fav);
        if (S.route === 'fav') go();
        break;
      case 'plan':
        if (!r) return;
        r.planned = true; r.planDate = t.dataset.d === '' ? '' : addDays(+t.dataset.d); S.planEdit[id] = false;
        S.shopOpen[id] = true;
        persist(r); $('#plan').innerHTML = planHtml(r); $('#shoppick').innerHTML = shopPickHtml(r); toast('Планирано: ' + planText(r));
        break;
      case 'plandate':
        if (!r) return;
        var pv = $('#pdate').value;
        if (!pv) { toast('Избери дата'); return; }
        r.planned = true; r.planDate = pv; S.planEdit[id] = false;
        S.shopOpen[id] = true;
        persist(r); $('#plan').innerHTML = planHtml(r); $('#shoppick').innerHTML = shopPickHtml(r); toast('Планирано: ' + planText(r));
        break;
      case 'planedit':
        S.planEdit[id] = true; if (r) $('#plan').innerHTML = planHtml(r);
        break;
      case 'planoff':
        if (!r) return;
        r.planned = false; r.planDate = ''; S.planEdit[id] = false;
        persist(r); $('#plan').innerHTML = planHtml(r); toast('Махнато от „Ще сготвя“');
        break;
      case 'plandone':
        if (!r) return;
        r.planned = false; r.planDate = '';
        persist(r); toast('Сготвено! Снимка на ястието можеш да добавиш в рецептата.'); go();
        break;
      case 'chip':
        var k = t.dataset.k;
        if (k === 'plan') S.planOnly = !S.planOnly;
        if (k === 'all') { S.time = ''; S.cat = ''; S.favOnly = false; S.planOnly = false; S.q = ''; var qi = $('#q'); if (qi) qi.value = ''; }
        if (k === 'fav') S.favOnly = !S.favOnly;
        refreshResults();
        break;
      case 'srv':
        if (!r) return;
        var cur = S.srv[id] || r.servings || 1;
        S.srv[id] = Math.max(1, cur + parseInt(t.dataset.d, 10));
        $('#sv').textContent = S.srv[id];
        $('#ings').innerHTML = ingList(r, S.srv[id]);
        break;
      case 'shopopen':
        if (!r) return;
        S.shopOpen[id] = true; $('#shoppick').innerHTML = shopPickHtml(r);
        break;
      case 'shopclose':
        if (!r) return;
        S.shopOpen[id] = false; $('#shoppick').innerHTML = shopPickHtml(r);
        break;
      case 'pickall':
        $$('#shoppick .picks input:not(:disabled)').forEach(function (c) { c.checked = true; });
        break;
      case 'picknone':
        $$('#shoppick .picks input').forEach(function (c) { c.checked = false; });
        break;
      case 'shopadd':
        if (!r) return;
        var picked = $$('#shoppick .picks input:checked').map(function (c) { return +c.dataset.i; });
        if (!picked.length) { toast('Отбележи поне един продукт'); return; }
        var fct = (S.srv[id] || r.servings || 1) / (r.servings || 1);
        picked.forEach(function (n) {
          var i = r.ingredients[n];
          addToShop({ name: i.name, unit: i.unit, amount: i.amount == null ? null : U.scale(i.amount, i.unit, fct) });
        });
        saveShop(); S.shopOpen[id] = false; $('#shoppick').innerHTML = shopPickHtml(r);
        toast('Добавени ' + picked.length + ' в списъка за пазаруване');
        break;
      case 'del':
        if (r && confirm('Да изтрия ли „' + r.title + '“?')) {
          Store.del(r.id).then(function () {
            S.recipes = S.recipes.filter(function (x) { return x.id !== r.id; });
            toast('Изтрито'); location.hash = '#/';
          }).catch(syncFail);
        }
        break;
      case 'addnote':
        if (!r) return;
        var ta = $('#nt'), txt = ta.value.trim();
        if (!txt) return;
        r.notes = r.notes || []; r.notes.push({ id: uid(), text: txt, at: Date.now() });
        persist(r); ta.value = ''; $('#notes').innerHTML = notesHtml(r);
        break;
      case 'delnote':
        if (!r) return;
        r.notes = (r.notes || []).filter(function (n) { return n.id !== t.dataset.n; });
        persist(r); $('#notes').innerHTML = notesHtml(r);
        break;
      case 'zoom':
        if (!r) return;
        var lb = document.createElement('div');
        var zsrc = t.dataset.k === 'my' ? ((r.myPhotos || [])[+t.dataset.i] || {}).src : r.photos[+t.dataset.i];
        if (!zsrc) return;
        lb.className = 'lightbox'; lb.innerHTML = '<img src="' + zsrc + '" alt="">';
        lb.onclick = function () { lb.remove(); };
        document.body.appendChild(lb);
        break;
      case 'addmine':
        $('#myin').click();
        break;
      case 'delmine':
        if (r && confirm('Да махна ли тази снимка?')) {
          r.myPhotos = (r.myPhotos || []).filter(function (p) { return p.id !== t.dataset.n; });
          persist(r); $('#mine').innerHTML = mineHtml(r);
        }
        break;
      case 'cnext':
        r = find(S.cook.id);
        if (!r) return;
        if (S.cook.i >= (r.steps || []).length - 1) { location.hash = '#/r/' + r.id; return; }
        S.cook.i++; $('#cookbox').innerHTML = cookHtml(r);
        break;
      case 'cprev':
        r = find(S.cook.id);
        if (r && S.cook.i > 0) { S.cook.i--; $('#cookbox').innerHTML = cookHtml(r); }
        break;
      case 'cing':
        r = find(S.cook.id);
        if (r) { S.cook.ing = !S.cook.ing; $('#cookbox').innerHTML = cookHtml(r); }
        break;
      case 'exitcook':
        location.hash = '#/r/' + id;
        break;
      case 'addrow':
        $('#ingrows').insertAdjacentHTML('beforeend', irow());
        break;
      case 'delrow':
        t.closest('.irow').remove();
        break;
      case 'parsepaste':
        var lines = $('#paste').value.split('\n').map(U.parseLine).filter(Boolean);
        if (!lines.length) return;
        $$('.irow').forEach(function (row) {
          if (!row.querySelector('.inm').value.trim() && !row.querySelector('.ia').value.trim()) row.remove();
        });
        $('#ingrows').insertAdjacentHTML('beforeend', lines.map(irow).join(''));
        $('#paste').value = '';
        toast('Добавени ' + lines.length + ' продукта');
        break;
      case 'addph':
        $('#phin').click();
        break;
      case 'scanurl':
        scanUrl($('#scanurl') && $('#scanurl').value);
        break;
      case 'scan':
        $('#scanin').click();
        break;
      case 'delph':
        S.draft.photos.splice(+t.dataset.i, 1); $('#photos').innerHTML = photosHtml();
        break;
      case 'shopdel':
        S.shop = S.shop.filter(function (x) { return x.id !== id; }); saveShop(); go();
        break;
      case 'shopclear':
        S.shop = S.shop.filter(function (x) { return !x.done; }); saveShop(); go();
        break;
      case 'export':
        var blob = new Blob([JSON.stringify({ version: 1, recipes: S.recipes, shop: S.shop })], { type: 'application/json' });
        var link = document.createElement('a');
        link.href = URL.createObjectURL(blob); link.download = 'receptturnik-kopie.json';
        document.body.appendChild(link); link.click(); link.remove();
        break;
      case 'importpick':
        $('#impin').click();
        break;
      case 'deldemo':
        if (confirm('Да изтрия ли примерните рецепти?')) {
          var ds = S.recipes.filter(function (x) { return x.demo; });
          Promise.all(ds.map(function (x) { return Store.del(x.id); })).then(function () {
            S.recipes = S.recipes.filter(function (x) { return !x.demo; }); go(); toast('Изтрити');
          });
        }
        break;
    }
  });

  document.addEventListener('input', function (e) {
    if (e.target.id === 'q') { S.q = e.target.value; refreshResults(); }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.id === 'tf') {
      S.time = t.value;
      if (S.route === 'c') refreshCat(); else refreshResults();
    } else if (t.id === 'cf') {
      S.cat = t.value; refreshResults();
    } else if (t.dataset && t.dataset.act === 'shopcheck') {
      var it = S.shop.filter(function (x) { return x.id === t.dataset.id; })[0];
      if (it) { it.done = t.checked; saveShop(); go(); }
    } else if (t.id === 'myin') {
      var mr = find(t.dataset.id), mfiles = Array.prototype.slice.call(t.files);
      if (!mr || !mfiles.length) return;
      S.pending = Promise.all(mfiles.map(readImage)).then(function (imgs) {
        mr.myPhotos = (mr.myPhotos || []).concat(imgs.map(function (s) { return { id: uid(), src: s, at: Date.now() }; }));
        persist(mr); $('#mine').innerHTML = mineHtml(mr);
        toast(imgs.length > 1 ? 'Добавени ' + imgs.length + ' снимки' : 'Снимката е добавена');
      }).catch(function () { toast('Снимката не може да се прочете'); });
      t.value = '';
    } else if (t.id === 'scanin') {
      scanRecipe(Array.prototype.slice.call(t.files).slice(0, 3)); t.value = '';
    } else if (t.id === 'phin') {
      var files = Array.prototype.slice.call(t.files);
      Promise.all(files.map(readImage)).then(function (imgs) {
        S.draft.photos = S.draft.photos.concat(imgs); $('#photos').innerHTML = photosHtml();
      }).catch(function () { toast('Снимката не може да се прочете'); });
      t.value = '';
    } else if (t.id === 'impin') {
      var fl = t.files[0]; if (!fl) return;
      fl.text().then(function (txt) {
        var d = JSON.parse(txt);
        var rs = (d.recipes || []).filter(function (x) { return x && x.id && x.title; });
        return Promise.all(rs.map(function (x) { return Store.put(x); })).then(function () {
          if (d.shop) { S.shop = d.shop; return saveShop(); }
        }).then(function () { return Store.all(); }).then(function (all) {
          S.recipes = all; toast('Заредени ' + rs.length + ' рецепти'); go();
        });
      }).catch(function (e) {
        toast(e instanceof SyntaxError ? 'Файлът не е валидно копие' : 'Не се зареди: ' + (Cloud.enabled ? Cloud.message(e) : ((e && e.message) || 'грешка')));
      });
    }
  });
  document.addEventListener('submit', function (e) {
    e.preventDefault();
    if (e.target.id === 'lf') doAuth();
    if (e.target.id === 'f') saveForm();
    if (e.target.id === 'sf') {
      var inp = $('#sin'), it = U.parseLine(inp.value);
      if (!it || !it.name) return;
      addToShop({ name: it.name, unit: it.unit, amount: it.amount });
      saveShop(); go();
    }
  });
  // Дълбочина на навигацията: 0 = първият екран. Пази се в историята на браузъра,
  // така че „Назад“ да се показва само когато има накъде да се върне в приложението.
  function depth() { return (history.state && history.state.d) || 0; }
  window.addEventListener('hashchange', function () {
    if (!history.state || history.state.d == null) { try { history.replaceState({ d: S.d + 1 }, ''); } catch (e) {} }
    S.d = depth();
    go();
  });

  /* ---------- старт ---------- */
  function seed() {
    return Promise.all(RB.sampleRecipes().map(function (r) { return Store.put(r); })).then(function () { return Store.set('seeded', 1); });
  }
  function boot() {
    if (S.booting) return;
    S.booting = true;
    Store.get('seeded').then(function (s) { return s ? null : seed(); })
      .then(function () { return Store.all(); })
      .then(function (rs) { S.recipes = rs; return Store.get('shop'); })
      .then(function (sh) {
        S.shop = sh || []; S.booted = true; S.booting = false; S.lastLoad = Date.now();
        S.uid = Cloud.user ? Cloud.user.id : null;
        go();
        if (Store.isMemory()) toast('Внимание: браузърът не позволява запазване. Отвори чрез start-app.bat.');
      })
      .catch(function (e) {
        S.booting = false;
        app.innerHTML = '<div class="empty">Не може да се зареди: ' + esc(Cloud.enabled ? Cloud.message(e) : (e && e.message)) +
          '<br><br><button class="btn small" data-act="retry">Опитай пак</button></div>';
      });
  }
  function init() {
    try { if (!history.state) history.replaceState({ d: 0 }, ''); } catch (e) {}
    S.d = depth();
    if (Cloud.enabled) {
      S.login = { mode: 'in' };
      Cloud.onAuth = function (ev) {
        if (ev === 'SIGNED_IN') { if (!(S.booted && Cloud.user && S.uid === Cloud.user.id)) boot(); }
        else if (ev === 'SIGNED_OUT') { S.booted = false; S.uid = null; showLogin(); }
      };
      Cloud.onRecovery = function () { S.login = { mode: 'newpw' }; showLogin(); };
      var gotUser = false;
      // Ако проверката за влязъл потребител „увисне“, не оставяме празна страница
      setTimeout(function () { if (!gotUser && !S.booted && !S.booting) showLogin(); }, 8000);
      Cloud.getUser().then(function (u) {
        gotUser = true;
        if (u && !(S.login && S.login.mode === 'newpw')) boot(); else showLogin();
      }).catch(function () { gotUser = true; showLogin(); });
    } else {
      boot();
    }
    // След 30+ секунди извън прозореца: изтегляме последното от облака (напр. добавено от телефона)
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState !== 'visible' || !Cloud.enabled || !S.booted || !Cloud.user) return;
      if (Date.now() - S.lastLoad < 30000 || ['new', 'edit', 'cook'].indexOf(S.route) >= 0) return;
      Store.all().then(function (rs) { S.recipes = rs; return Store.get('shop'); }).then(function (sh) {
        S.shop = sh || S.shop; S.lastLoad = Date.now();
        var y = window.scrollY; go(); window.scrollTo(0, y);
      }).catch(function () {});
    });
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(function () {});
    }
  }
  window.__rb = { S: S, go: go };
  init();
})();
