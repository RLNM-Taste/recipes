/* Местно хранилище (IndexedDB). По-късно се заменя със Supabase със същия интерфейс. */
(function () {
  var mem = { recipes: {}, meta: {} };
  var useMem = false;
  var dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('no idb'));
      setTimeout(function () { rej(new Error('idb timeout')); }, 8000);
      var r = indexedDB.open('recipebook', 1);
      r.onupgradeneeded = function () {
        var d = r.result;
        d.createObjectStore('recipes', { keyPath: 'id' });
        d.createObjectStore('meta');
      };
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
    return dbp;
  }

  function tx(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        var t = db.transaction(store, mode);
        var rq = fn(t.objectStore(store));
        t.oncomplete = function () { res(rq && rq.result); };
        t.onerror = function () { rej(t.error); };
        t.onabort = function () { rej(t.error); };
      });
    });
  }

  function guard(fn, fallback) {
    return function () {
      var args = arguments;
      if (useMem) return Promise.resolve(fallback.apply(null, args));
      return fn.apply(null, args).catch(function () { useMem = true; return fallback.apply(null, args); });
    };
  }

  window.Store = {
    all: guard(function () { return tx('recipes', 'readonly', function (s) { return s.getAll(); }); },
      function () { return Object.keys(mem.recipes).map(function (k) { return mem.recipes[k]; }); }),
    put: guard(function (r) { return tx('recipes', 'readwrite', function (s) { return s.put(r); }); },
      function (r) { mem.recipes[r.id] = r; }),
    del: guard(function (id) { return tx('recipes', 'readwrite', function (s) { return s.delete(id); }); },
      function (id) { delete mem.recipes[id]; }),
    get: guard(function (k) { return tx('meta', 'readonly', function (s) { return s.get(k); }); },
      function (k) { return mem.meta[k]; }),
    set: guard(function (k, v) { return tx('meta', 'readwrite', function (s) { return s.put(v, k); }); },
      function (k, v) { mem.meta[k] = v; }),
    isMemory: function () { return useMem; }
  };
})();
