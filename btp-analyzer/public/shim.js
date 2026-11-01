/* Drop-in replacement for the Claude-hosted window.claude.use() capabilities,
   backed by this server's /api. Loaded before the app code. */
(function () {
  function fail(code, message) { var e = new Error(message || code); e.code = code; return e; }

  function api(method, url, body, signal) {
    return fetch(url, {
      method: method,
      headers: body === undefined ? {} : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal: signal
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.status === 401) { location.href = '/login.html'; throw fail('session_expired'); }
        if (!r.ok) throw fail((j && j.error) || 'server_error');
        return j;
      });
    }, function (e) {
      if (e && e.name === 'AbortError') throw fail('cancelled');
      throw fail('upstream_error');
    });
  }

  function toBase64(blob) {
    return new Promise(function (res, rej) {
      var fr = new FileReader();
      fr.onload = function () { res(String(fr.result).split(',')[1] || ''); };
      fr.onerror = function () { rej(fail('image_rejected')); };
      fr.readAsDataURL(blob);
    });
  }

  var sample = {
    limits: function () { return Promise.resolve({ images: { maxCount: 8 } }); },
    json: function (prompt, opts) {
      opts = opts || {};
      return Promise.all((opts.images || []).map(toBase64)).then(function (imgs) {
        return api('POST', '/api/ai', { prompt: prompt, images: imgs }, opts.signal);
      }).then(function (j) { return j.data; });
    }
  };

  var userId = null;
  var user = {
    id: function () {
      if (userId) return Promise.resolve(userId);
      return api('GET', '/api/me').then(function (m) { userId = String(m.id); return userId; });
    }
  };

  function snapDoc(x) { return { id: x.id, data: function () { return x.data; } }; }
  var db = {
    collection: function () {
      return {
        get: function () { return api('GET', '/api/reports').then(function (j) { return { docs: j.reports.map(snapDoc) }; }); },
        doc: function (id) {
          return {
            set: function (obj) { return api('PUT', '/api/reports/' + encodeURIComponent(id), obj); },
            delete: function () { return api('DELETE', '/api/reports/' + encodeURIComponent(id)); }
          };
        }
      };
    }
  };

  var mcp = {
    callTool: function (server, tool, input) {
      if (tool === 'dealmachine_enrich_address') {
        return api('POST', '/api/comps/match', { full_address: input.full_address }).then(function (p) { return { payload: p }; });
      }
      if (tool === 'dealmachine_comps') {
        var loc = input.location || {};
        return api('POST', '/api/comps/search', {
          property_id: (input.property_ids || [])[0],
          latitude: loc.latitude, longitude: loc.longitude,
          radius_miles: loc.radius_miles,
          timeframe: (input.criteria || {}).timeframe
        }).then(function (p) { return { payload: p }; });
      }
      return Promise.reject(fail('tool_error', 'unsupported tool'));
    }
  };

  var caps = { sample: sample, user: user, db: db, mcp: mcp };
  window.claude = { use: function (name) { return caps[name] ? Promise.resolve(caps[name]) : Promise.reject(fail('not_declared')); } };
})();
