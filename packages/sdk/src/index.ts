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

  window.tin = {
    collection: collection,
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
