    /** Client L1 soft cache: method+payload → last ok body. Soft TTL ~90s. */
    const apiCache = new Map();
    const API_CACHE_TTL_MS = 90_000;
    const API_CACHE_READ = new Set(["search", "plugins", "pluginCategories", "experts", "connectors", "expertMarketList"]);

    function apiCacheKey(method, payload) {
      const { refresh, ...rest } = payload || {};
      return method + ":" + JSON.stringify(rest || {});
    }

    function invalidateApiCache(prefix) {
      for (const key of [...apiCache.keys()]) {
        if (!prefix || key.startsWith(prefix)) apiCache.delete(key);
      }
    }

    async function api(method, payload, opts) {
      const bodyIn = payload || {};
      const skipCache = !!(opts && opts.skipCache) || !!bodyIn.refresh || !API_CACHE_READ.has(method);
      const key = apiCacheKey(method, bodyIn);
      if (!skipCache) {
        const hit = apiCache.get(key);
        if (hit && Date.now() - hit.at < API_CACHE_TTL_MS) return hit.body;
      }
      const res = await fetch(pluginUrl(""), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ method, ...bodyIn }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body.ok === false) throw new Error(body.error || "HTTP " + res.status);
      if (API_CACHE_READ.has(method)) apiCache.set(key, { at: Date.now(), body });
      if (method === "install" || method === "uninstall" || method === "pluginInstall" || method === "catalogInstall" || method === "catalogUninstall" || method === "catalogSummon" || method === "expertMarketInstall" || method === "expertMarketDisable") {
        invalidateApiCache("search:");
        invalidateApiCache("plugins:");
        invalidateApiCache("experts:");
        invalidateApiCache("connectors:");
        invalidateApiCache("pluginCategories:");
        invalidateApiCache("expertMarketList:");
      }
      return body;
    }
