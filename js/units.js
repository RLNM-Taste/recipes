/* Мерки: разпознаване на ред като "2 чаени чаши вода" и превръщане в мл/г.
   Стойностите са стандартните мерки (чаена лъжичка 5 мл, супена лъжица 15 мл, чаена чаша 200 мл,
   кафена чаша 75 мл) с теглата на продуктите по коригираната таблица на потребителката (2026-11-03).
   Теглата са ориентировъчни (равни лъжици, насипани чаши). Където таблицата дава диапазон, е взета средата.
   Оригиналът се пази в original
   и се показва дребно до новата мярка. Непознат продукт остава в оригиналната мярка. */
(function () {
  var END = '(?=\\s|$|[.,;:])';
  function re(src) { return new RegExp('^(?:' + src + ')' + END, 'i'); }

  // Редът е важен: по-специфичните първо.
  var UNIT_PATTERNS = [
    [re('чаени\\s+лъжици|чаена\\s+лъжица|чаени\\s+лъжички|чаена\\s+лъжичка|ч\\.\\s?л\\.?'), 'tsp'],
    [re('десертни\\s+лъжици|десертна\\s+лъжица|дес\\.\\s?л\\.?'), 'dessert'],
    [re('супени\\s+лъжици|супена\\s+лъжица|с\\.\\s?л\\.?'), 'tbsp'],
    [re('кафени\\s+чаши|кафена\\s+чаша|к\\.\\s?ч\\.?'), 'coffeeCup'],
    [re('водни\\s+чаши|водна\\s+чаша|в\\.\\s?ч\\.?'), 'waterCup'],
    [re('чаени\\s+чаши|чаена\\s+чаша|ч\\.\\s?ч\\.?|чаши|чаша'), 'teaCup'],
    [re('килограма?|кг|kg'), 'kg'],
    [re('грама?|гр|г|g'), 'g'],
    [re('милилитра?|мл|ml'), 'ml'],
    [re('литра?|л|l'), 'l'],
    [re('броя|бр\\.?'), 'pcs'],
    [re('щипки|щипка'), 'pinch'],
    [re('шепи|шепа'), 'handful'],
    [re('бучки|бучка'), 'cube'],
    [re('кибритени\\s+кутийки|кибритена\\s+кутийка'), 'matchbox'],
    [re('скилидки|скилидка'), 'clove'],
    [re('връзки|връзка'), 'bunch'],
    [re('пакетчета|пакетче|пакети|пакет'), 'pack'],
    [re('консерви|консерва'), 'can'],
    [re('глави|глава'), 'head']
  ];

  var UNIT_LABEL = {
    kg: 'кг', g: 'г', ml: 'мл', l: 'л', pcs: 'бр.', pinch: 'щипка', clove: 'скилидки',
    bunch: 'връзка', pack: 'пакет', can: 'консерва', head: 'глава',
    tbsp: 'с.л.', tsp: 'ч.л.', dessert: 'дес. л.', teaCup: 'чаена чаша', coffeeCup: 'кафена чаша',
    waterCup: 'водна чаша', handful: 'шепа', cube: 'бучки', matchbox: 'кутийка'
  };

  // Продукти от таблицата. Редът е важен (пудра захар преди захар, кисело мляко преди мляко).
  var PRODUCTS = [
    ['icing', 'пудра захар', /пудра\s*захар/i],
    ['sugar', 'захар', /захар/i],
    ['paprika', 'червен пипер', /червен\s+пипер/i],
    ['flour', 'брашно', /брашно/i],
    ['crumbs', 'галета', /галета/i],
    ['vinegar', 'оцет', /оцет/i],
    ['yogurt', 'кисело мляко', /кисело\s+мляко|йогурт/i],
    ['milk', 'прясно мляко', /мляко/i],
    ['oil', 'растително масло (олио)', /олио|растително\s+масло|слънчогледов\w*\s+масло/i],
    ['butter', 'краве масло', /краве\s+масло|(^|\s)масло(\s|$)/i],
    ['margarine', 'маргарин', /маргарин/i],
    ['lard', 'мас', /(^|\s)мас(\s|$)/i],
    ['rice', 'ориз', /ориз/i],
    ['starch', 'нишесте', /нишесте/i],
    ['lentils', 'леща', /леща/i],
    ['beans', 'зрял фасул', /фасул/i],
    ['semolina', 'грис', /грис/i],
    ['honey', 'мед', /(^|\s)мед(\s|$)/i],
    ['salt', 'сол', /(^|\s)сол(\s|$)/i],
    ['water', 'вода', /(^|\s)вода(\s|$)/i],
    ['cheese', 'сирене', /сирене/i],
    ['kashkaval', 'кашкавал', /кашкавал/i]
  ];
  var PRODUCT_NAMES = {};
  PRODUCTS.forEach(function (p) { PRODUCT_NAMES[p[0]] = p[1]; });

  // Грамове на мярка (за water — милилитри). Източник: supichka.com
  var TABLES = {
    tsp: { water: 5, salt: 5.5, sugar: 4.5, icing: 3.5, paprika: 2.5, flour: 2.75, crumbs: 3.5, vinegar: 5, milk: 5, yogurt: 5.5, oil: 4.75, butter: 5, margarine: 5, lard: 5, rice: 4.5, starch: 3.5 },
    tbsp: { water: 15, salt: 16.5, sugar: 13.5, icing: 11, paprika: 7, flour: 9, crumbs: 9, vinegar: 15, milk: 15, yogurt: 16.5, oil: 13.5, butter: 14.5, margarine: 14.5, lard: 14.5, rice: 13.5, starch: 9, honey: 21 },
    teaCup: { water: 200, salt: 230, sugar: 165, icing: 110, flour: 125, crumbs: 110, milk: 202.5, yogurt: 200, lentils: 175, beans: 170, oil: 182.5, butter: 185, margarine: 190, lard: 190, rice: 175, semolina: 155, honey: 290 },
    coffeeCup: { water: 75, sugar: 62.5, icing: 37.5, flour: 42.5, crumbs: 42.5, milk: 76, yogurt: 75, lentils: 62.5, beans: 62.5, oil: 69, butter: 67.5, margarine: 70, lard: 70, rice: 67.5, semolina: 62.5, honey: 110 },
    handful: { salt: 30 },
    cube: { sugar: 5 },
    matchbox: { cheese: 30, kashkaval: 30 }
  };
  var TABLE_ORDER = ['tsp', 'tbsp', 'teaCup', 'coffeeCup'];
  var UNIT_TITLES = { tsp: 'Чаена лъжичка', tbsp: 'Супена лъжица', teaCup: 'Чаена чаша (200 мл)', coffeeCup: 'Кафена чаша (75 мл)' };

  var FR = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

  function parseAmount(s) {
    s = s.trim();
    var m = s.match(/^(?:една|един|едно)\s+и\s+половина\s*(.*)$/i);
    if (m) return { v: 1.5, rest: m[1] };
    m = s.match(/^(половинка|половин|половина)(?![а-я])\s*(.*)$/i);
    if (m) return { v: 0.5, rest: m[2] };
    m = s.match(/^(една|един|едно)(?![а-я])\s*(.*)$/i);
    if (m) return { v: 1, rest: m[2] };
    m = s.match(/^(\d+)\s+(\d+)\/(\d+)\s*(.*)$/);
    if (m) return { v: +m[1] + m[2] / m[3], rest: m[4] };
    m = s.match(/^(\d+)\/(\d+)\s*(.*)$/);
    if (m) return { v: m[1] / m[2], rest: m[3] };
    m = s.match(/^(\d+)?\s*([½¼¾⅓⅔])\s*(.*)$/);
    if (m) return { v: (+m[1] || 0) + FR[m[2]], rest: m[3] };
    m = s.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
    if (m) return { v: parseFloat(m[1].replace(',', '.')), rest: m[2] };
    return null;
  }

  // "1/2", "1 1/2", "1,5", "½" -> число; празно или неразбрано -> null
  function parseAmountStr(s) {
    s = String(s == null ? '' : s).trim();
    if (!s) return null;
    var a = parseAmount(s);
    return a && !a.rest ? a.v : null;
  }

  function fmt(n) {
    if (n == null || isNaN(n)) return '';
    var w = Math.floor(n + 1e-9), f = n - w;
    if (f < 0.02) return String(w);
    if (1 - f < 0.02) return String(w + 1);
    var syms = [[0.25, '¼'], [0.5, '½'], [0.75, '¾'], [1 / 3, '⅓'], [2 / 3, '⅔']];
    for (var i = 0; i < syms.length; i++) {
      if (Math.abs(f - syms[i][0]) < 0.02) return (w ? String(w) : '') + syms[i][1];
    }
    var r = n >= 10 ? Math.round(n) : Math.round(n * 10) / 10;
    return String(r).replace('.', ',');
  }

  function niceRound(v) {
    if (v >= 50) return Math.round(v / 5) * 5;
    if (v >= 10) return Math.round(v);
    return Math.round(v * 10) / 10;
  }

  function productKey(name) {
    for (var i = 0; i < PRODUCTS.length; i++) if (PRODUCTS[i][2].test(name)) return PRODUCTS[i][0];
    return '';
  }

  // Връща {amount, unit, name, original}. Превръща само това, което е в таблицата.
  function convert(amount, unitKey, unitText, name) {
    var tab = TABLES[unitKey];
    if (tab) {
      var p = productKey(name);
      if (p && tab[p] != null) {
        var original = (fmt(amount) + ' ' + (unitText || '')).trim();
        return { amount: niceRound(amount * tab[p]), unit: p === 'water' ? 'мл' : 'г', name: name, original: original };
      }
    }
    return { amount: amount, unit: UNIT_LABEL[unitKey] || '', name: name, original: '' };
  }

  function parseLine(line) {
    line = String(line || '').replace(/^[\-\*•\s]+/, '').trim();
    if (!line) return null;
    // диапазон „450-480 г брашно“: взема се средната стойност, а диапазонът остава като оригинал
    var rg = line.match(/^(\d+(?:[.,]\d+)?)\s*[-–]\s*(\d+(?:[.,]\d+)?)\s*(.*)$/);
    if (rg) {
      var lo = parseFloat(rg[1].replace(',', '.')), hi = parseFloat(rg[2].replace(',', '.'));
      if (hi > lo && rg[3]) {
        var rp = parseLine(fmt((lo + hi) / 2) + ' ' + rg[3]);
        if (rp && rp.amount != null) {
          if (!rp.original) {
            var o = line.endsWith(rp.name) ? line.slice(0, line.length - rp.name.length).trim() : '';
            if (o) rp.original = o;
          }
          return rp;
        }
      }
      return { amount: null, unit: '', name: line, original: '' };
    }
    var a = parseAmount(line);
    if (!a) {
      // количество накрая: „Брашно – 500 г“, „Масло, 100 г“, „Брашно 500 г“, „Сол - на вкус“
      var tm = line.match(/^(.*?[^\s\-–—:,])\s*(?:[\-–—:,]\s*|\s)(\d.*|на вкус)$/i);
      if (tm && tm[1].length > 1) {
        if (/^на вкус$/i.test(tm[2])) return { amount: null, unit: 'на вкус', name: tm[1].trim(), original: '' };
        var tail = parseLine(tm[2]);
        if (tail && tail.name === '' && (tail.amount != null || tail.unit === 'на вкус')) {
          tail.name = tm[1].trim();
          return tail;
        }
      }
      return { amount: null, unit: '', name: line, original: '' };
    }
    var rest = a.rest, key = '', text = '';
    for (var i = 0; i < UNIT_PATTERNS.length; i++) {
      var m = rest.match(UNIT_PATTERNS[i][0]);
      if (m) { key = UNIT_PATTERNS[i][1]; text = m[0]; rest = rest.slice(m[0].length).trim(); break; }
    }
    rest = rest.replace(/^[.,;:]\s*/, '').replace(/^от\s+/i, '').trim(); // „220 гр. ориз“ -> „ориз“
    return convert(a.v, key, text, rest);
  }

  // Мащабиране: amount * factor, закръглено разумно
  function scale(amount, unit, factor) {
    if (amount == null) return null;
    var v = amount * factor;
    if ((unit === 'г' || unit === 'мл') && v >= 50) return Math.round(v / 5) * 5;
    if (v >= 10) return Math.round(v);
    return Math.round(v * 100) / 100;
  }

  // Текст за показване: "400 мл", "1,5 л", "3 бр."
  function display(ing, factor) {
    if (ing.unit === 'на вкус') return 'на вкус';
    var v = scale(ing.amount, ing.unit, factor == null ? 1 : factor);
    if (v == null) return '';
    var unit = ing.unit || '';
    if (unit === 'мл' && v >= 1000) { v = v / 1000; unit = 'л'; }
    else if (unit === 'г' && v >= 1000) { v = v / 1000; unit = 'кг'; }
    return (fmt(v) + ' ' + unit).trim();
  }

  window.Units = {
    parseLine: parseLine, parseAmountStr: parseAmountStr, fmt: fmt, scale: scale, display: display,
    TABLES: TABLES, TABLE_ORDER: TABLE_ORDER, UNIT_TITLES: UNIT_TITLES, PRODUCT_NAMES: PRODUCT_NAMES,
    UNIT_OPTIONS: ['', 'на вкус', 'г', 'кг', 'мл', 'л', 'бр.', 'с.л.', 'ч.л.','чаена чаша', 'кафена чаша', 'водна чаша', 'щипка', 'шепа', 'бучки', 'кутийка', 'скилидки', 'връзка', 'пакет', 'консерва', 'глава']
  };
})();
