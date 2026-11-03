/* Облак (Supabase): вход, рецепти, списък за пазаруване и снимки.
   Включва се само когато страницата е публикувана (https). На localhost/файл остава местният режим,
   освен ако window.RB_FORCE_CLOUD е true (за тестове). Интерфейсът на store е същият като в store.js. */
(function () {
  var cfg = window.RB_CONFIG || {};
  var isLocal = location.protocol === 'file:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  var enabled = !!(cfg.supabaseUrl && cfg.supabaseKey && window.supabase && (!isLocal || window.RB_FORCE_CLOUD));
  var BUCKET = 'photos';
  var SIGNED_SECONDS = 6 * 3600;

  var Cloud = { enabled: enabled, user: null, onAuth: null, onRecovery: null, store: null };
  window.Cloud = Cloud;
  if (!enabled) return;

  var client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseKey, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  Cloud.client = client;

  function uid() { return Math.random().toString(36).slice(2, 10) + Date.now().toString(36); }
  function redirectUrl() { return location.origin + location.pathname; }

  // Български съобщения за грешки при вход
  Cloud.message = function (e) {
    var m = String((e && e.message) || e || '');
    if (/Invalid login credentials/i.test(m)) return 'Грешен имейл или парола.';
    if (/Email not confirmed/i.test(m)) return 'Имейлът още не е потвърден. Отвори писмото и натисни връзката в него.';
    if (/already registered|already been registered/i.test(m)) return 'Вече има акаунт с този имейл. Влез или смени паролата.';
    if (/rate limit|too many/i.test(m)) return 'Изпратени са твърде много писма. Опитай след малко.';
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'Няма връзка с интернет.';
    if (/same password|different from the old/i.test(m)) return 'Новата парола трябва да е различна от старата.';
    if (/Password should be/i.test(m)) return 'Паролата трябва да е поне 8 знака.';
    if (/signups? not allowed|Signups not allowed/i.test(m)) return 'Новите регистрации са спрени.';
    return 'Нещо се обърка: ' + m;
  };

  Cloud.getUser = function () {
    return client.auth.getSession().then(function (r) {
      Cloud.user = r.data && r.data.session ? r.data.session.user : null;
      return Cloud.user;
    });
  };
  Cloud.signIn = function (email, password) {
    return client.auth.signInWithPassword({ email: email, password: password }).then(function (r) {
      if (r.error) throw r.error;
      Cloud.user = r.data.user;
      return Cloud.user;
    });
  };
  Cloud.signUp = function (email, password) {
    return client.auth.signUp({ email: email, password: password, options: { emailRedirectTo: redirectUrl() } }).then(function (r) {
      if (r.error) throw r.error;
      if (r.data && r.data.session) Cloud.user = r.data.session.user; // ако потвърждението е изключено
      return r.data;
    });
  };
  Cloud.resetPassword = function (email) {
    return client.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl() }).then(function (r) { if (r.error) throw r.error; });
  };
  Cloud.setPassword = function (password) {
    return client.auth.updateUser({ password: password }).then(function (r) { if (r.error) throw r.error; });
  };
  Cloud.signOut = function () {
    return client.auth.signOut().then(function () { Cloud.user = null; resetCaches(); });
  };

  client.auth.onAuthStateChange(function (ev, session) {
    Cloud.user = session ? session.user : null;
    // не викаме Supabase синхронно в този обратен вик
    setTimeout(function () {
      if (ev === 'PASSWORD_RECOVERY' && Cloud.onRecovery) Cloud.onRecovery();
      else if ((ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') && Cloud.onAuth) Cloud.onAuth(ev);
    }, 0);
  });

  /* ---------- снимки ---------- */
  var pathOf = {};   // адрес на снимка (data: или подписан) -> път в хранилището
  var known = {};    // id на рецепта -> пътища, записани за последно
  function resetCaches() { pathOf = {}; known = {}; }

  function isPath(s) { return typeof s === 'string' && s.indexOf('sb:') === 0; }
  function dataUrlToBlob(d) {
    var p = d.split(','), mime = (p[0].match(/:(.*?);/) || [0, 'image/jpeg'])[1];
    var bin = atob(p[1]), arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
  function ensureUploaded(src, recipeId) {
    if (typeof src !== 'string' || !src) return Promise.resolve(src);
    if (isPath(src)) return Promise.resolve(src);
    if (pathOf[src]) return Promise.resolve('sb:' + pathOf[src]);
    if (src.indexOf('data:') !== 0) return Promise.resolve(src); // външен адрес — оставя се както е
    var path = Cloud.user.id + '/' + recipeId + '/' + uid() + '.jpg';
    return client.storage.from(BUCKET).upload(path, dataUrlToBlob(src), { contentType: 'image/jpeg', upsert: false }).then(function (r) {
      if (r.error) throw r.error;
      pathOf[src] = path;
      return 'sb:' + path;
    });
  }
  function pathsOf(rec) {
    var out = [];
    (rec.photos || []).forEach(function (s) { if (isPath(s)) out.push(s.slice(3)); });
    (rec.myPhotos || []).forEach(function (p) { if (p && isPath(p.src)) out.push(p.src.slice(3)); });
    return out;
  }
  function toStored(rec) {
    var o = JSON.parse(JSON.stringify(rec));
    return Promise.all((rec.photos || []).map(function (s) { return ensureUploaded(s, rec.id); })).then(function (ph) {
      o.photos = ph;
      return Promise.all((rec.myPhotos || []).map(function (p) {
        return ensureUploaded(p.src, rec.id).then(function (s) { return Object.assign({}, p, { src: s }); });
      }));
    }).then(function (mp) { o.myPhotos = mp; return o; });
  }
  // Заменя пътищата с подписани (временни) адреси за показване
  function signAll(list) {
    var all = [];
    list.forEach(function (r) { all = all.concat(pathsOf(r)); });
    if (!all.length) return Promise.resolve(list);
    return client.storage.from(BUCKET).createSignedUrls(all, SIGNED_SECONDS).then(function (r) {
      if (r.error) throw r.error;
      var map = {};
      (r.data || []).forEach(function (x) { if (x.signedUrl) { map[x.path] = x.signedUrl; pathOf[x.signedUrl] = x.path; } });
      list.forEach(function (rec) {
        if (rec.photos) rec.photos = rec.photos.map(function (s) { return isPath(s) ? (map[s.slice(3)] || '') : s; }).filter(Boolean);
        if (rec.myPhotos) rec.myPhotos = rec.myPhotos.map(function (p) {
          return isPath(p.src) ? Object.assign({}, p, { src: map[p.src.slice(3)] || '' }) : p;
        }).filter(function (p) { return p.src; });
      });
      return list;
    });
  }

  /* ---------- store ---------- */
  Cloud.store = {
    all: function () {
      return client.from('recipes').select('data').order('updated_at', { ascending: false }).then(function (r) {
        if (r.error) throw r.error;
        var list = (r.data || []).map(function (x) { return x.data; });
        list.forEach(function (rec) { known[rec.id] = pathsOf(rec); });
        return signAll(list);
      });
    },
    put: function (rec) {
      var stored;
      return toStored(rec).then(function (o) {
        stored = o;
        return client.from('recipes').upsert({ user_id: Cloud.user.id, id: rec.id, data: o, updated_at: new Date().toISOString() }, { onConflict: 'user_id,id' });
      }).then(function (r) {
        if (r.error) throw r.error;
        var now = pathsOf(stored), old = known[rec.id] || [];
        var gone = old.filter(function (p) { return now.indexOf(p) < 0; });
        known[rec.id] = now;
        if (gone.length) return client.storage.from(BUCKET).remove(gone);
      }).then(function (x) { if (x && x.error) throw x.error; });
    },
    del: function (id) {
      var old = known[id] || [];
      return client.from('recipes').delete().eq('id', id).then(function (r) {
        if (r.error) throw r.error;
        delete known[id];
        if (old.length) return client.storage.from(BUCKET).remove(old);
      }).then(function (x) { if (x && x.error) throw x.error; });
    },
    get: function (k) {
      if (k === 'seeded') return Promise.resolve(1); // в облака няма примерни рецепти
      return client.from('meta').select('value').eq('key', k).maybeSingle().then(function (r) {
        if (r.error) throw r.error;
        return r.data ? r.data.value : undefined;
      });
    },
    set: function (k, v) {
      if (k === 'seeded') return Promise.resolve();
      return client.from('meta').upsert({ user_id: Cloud.user.id, key: k, value: v }, { onConflict: 'user_id,key' }).then(function (r) {
        if (r.error) throw r.error;
      });
    },
    isMemory: function () { return false; }
  };
})();
