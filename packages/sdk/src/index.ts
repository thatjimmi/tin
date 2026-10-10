// window.tin, injected inline into the sandboxed iframe (see
// @tin/runtime buildSandboxHtml). Deliberately plain JS syntax - this file
// is imported with Vite's `?raw` and inlined as-is, never bundled, so it
// can't use import/export or anything that needs transpiling.
(function () {
  "use strict";

  var nextId = 0;
  var pending = new Map();

  window.addEventListener("message", function (event) {
    var msg = event.data;
    if (!msg || msg.type !== "tin-rpc-response") return;
    var entry = pending.get(msg.id);
    if (!entry) return;
    pending.delete(msg.id);
    if (msg.error) entry.reject(new Error(msg.error));
    else entry.resolve(msg.result);
  });

  function rpc(method, args) {
    return new Promise(function (resolve, reject) {
      var id = String(nextId++);
      pending.set(id, { resolve: resolve, reject: reject });
      window.parent.postMessage({ type: "tin-rpc", id: id, method: method, args: args }, "*");
    });
  }

  function collection(name) {
    return {
      insert: function (doc) {
        return rpc("collection.insert", [name, doc]);
      },
      find: function (filter, options) {
        return rpc("collection.find", [name, filter, options]);
      },
      findOne: function (filter) {
        return rpc("collection.findOne", [name, filter]);
      },
      update: function (filter, patch) {
        return rpc("collection.update", [name, filter, patch]);
      },
      delete: function (filter) {
        return rpc("collection.delete", [name, filter]);
      },
      count: function (filter) {
        return rpc("collection.count", [name, filter]);
      },
    };
  }

  // --- localStorage shim ---------------------------------------------
  // Each sandbox reload gets a fresh opaque origin, so native localStorage
  // never persists anyway. Reads come from the init snapshot (synchronous,
  // no bridge round trip); writes update that snapshot in place and fire a
  // background RPC to persist. ponytail: one RPC per write rather than
  // coalescing multiple writes per tick - add batching if that's measurably
  // chatty for a real app.
  var kv = (window.__TIN_INIT__ && window.__TIN_INIT__.kv) || {};

  var localStorageShim = {
    getItem: function (key) {
      return Object.prototype.hasOwnProperty.call(kv, key) ? kv[key] : null;
    },
    setItem: function (key, value) {
      value = String(value);
      kv[key] = value;
      rpc("kv.set", [key, value]);
    },
    removeItem: function (key) {
      delete kv[key];
      rpc("kv.delete", [key]);
    },
    clear: function () {
      kv = {};
      rpc("kv.clear", []);
    },
    key: function (n) {
      var keys = Object.keys(kv);
      return n >= 0 && n < keys.length ? keys[n] : null;
    },
    get length() {
      return Object.keys(kv).length;
    },
  };
  // `localStorage` is a non-writable accessor on Window.prototype in real
  // browsers, so a plain `window.localStorage = ...` throws under "use
  // strict". Object.defineProperty replaces the property descriptor outright.
  Object.defineProperty(window, "localStorage", { value: localStorageShim, configurable: true });

  // --- assets ------------------------------------------------------------
  // getUrl/getMeta/readBytes are synchronous: every asset's bytes arrive as
  // a data: URL in the init snapshot (or in an add() response, cached
  // below), so no bridge round trip is needed to read them back.
  var assetCache = new Map();
  ((window.__TIN_INIT__ && window.__TIN_INIT__.assets) || []).forEach(function (a) {
    assetCache.set(a.id, a);
  });

  function assetMetaOf(a) {
    return { id: a.id, belongsTo: a.belongsTo, name: a.name, mime: a.mime, size: a.size, url: a.url };
  }

  function dataUrlToBytes(url) {
    var base64 = url.slice(url.indexOf(",") + 1);
    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  var assets = {
    add: function (belongsTo, bytes, name, mime) {
      return rpc("assets.add", [belongsTo, bytes, name || null, mime || null]).then(function (meta) {
        assetCache.set(meta.id, meta);
        return assetMetaOf(meta);
      });
    },
    list: function (belongsTo) {
      var out = [];
      assetCache.forEach(function (a) {
        if (a.belongsTo === belongsTo) out.push(assetMetaOf(a));
      });
      return out;
    },
    getUrl: function (id) {
      var a = assetCache.get(id);
      return a ? a.url : null;
    },
    getMeta: function (id) {
      var a = assetCache.get(id);
      return a ? assetMetaOf(a) : null;
    },
    readBytes: function (id) {
      var a = assetCache.get(id);
      return a ? dataUrlToBytes(a.url) : null;
    },
    delete: function (id) {
      assetCache.delete(id);
      return rpc("assets.delete", [id]);
    },
    deleteAll: function (belongsTo) {
      assetCache.forEach(function (a, id) {
        if (a.belongsTo === belongsTo) assetCache.delete(id);
      });
      return rpc("assets.deleteAll", [belongsTo]);
    },
  };

  window.tin = {
    collection: collection,
    assets: assets,
    meta: {
      get: function (key) {
        return rpc("meta.get", [key]);
      },
      set: function (key, value) {
        return rpc("meta.set", [key, value]);
      },
    },
  };
})();
