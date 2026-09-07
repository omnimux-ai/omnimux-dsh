    // 规则真源：SkillShelf（boot.js 注入 skill-picker-logic.js），禁止内联副本。

    function resolvePlazaIconSize(size) {
      if (typeof size === "number" && Number.isFinite(size) && size > 0) return size;
      if (size && typeof size === "object") {
        const n = size.size ?? size.width;
        if (typeof n === "number" && Number.isFinite(n) && n > 0) return n;
      }
      return 16;
    }

    function renderPlazaIcon(size = 16) {
      const px = resolvePlazaIconSize(size);
      return h("svg", {
        width: px,
        height: px,
        viewBox: "0 0 16 16",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
        "aria-hidden": "true",
        preserveAspectRatio: "xMidYMid meet",
        style: {
          width: px,
          height: px,
          minWidth: px,
          minHeight: px,
          flex: "none",
          flexShrink: 0,
          display: "block",
        },
      },
        h("rect", { x: "1.75", y: "1.75", width: "5.5", height: "5.5", rx: "1.2", stroke: "currentColor", strokeWidth: "1.4" }),
        h("rect", { x: "8.75", y: "1.75", width: "5.5", height: "5.5", rx: "1.2", stroke: "currentColor", strokeWidth: "1.4" }),
        h("rect", { x: "1.75", y: "8.75", width: "5.5", height: "5.5", rx: "1.2", stroke: "currentColor", strokeWidth: "1.4" }),
        h("rect", { x: "8.75", y: "8.75", width: "5.5", height: "5.5", rx: "1.2", stroke: "currentColor", strokeWidth: "1.4" }),
      );
    }

    function PlazaIcon(props) {
      return renderPlazaIcon(props);
    }

    function SkillPlaza(props) {
      const tr = useTr();
      const pageSize = 48;
      const submitted = (props && props.submittedQuery) ?? "";
      const [category, setCategory] = useState("");
      const [page, setPage] = useState(1);
      const [prevSubmitted, setPrevSubmitted] = useState(submitted);
      if (prevSubmitted !== submitted) {
        setPrevSubmitted(submitted);
        setPage(1);
      }
      const [items, setItems] = useState([]);
      const [total, setTotal] = useState(0);
      const [hasMore, setHasMore] = useState(false);
      const [fallback, setFallback] = useState(false);
      const [status, setStatus] = useState("loading");
      const [err, setErr] = useState("");
      const [open, setOpen] = useState(null);
      const applySearchBody = (d, mode) => {
        const next = SkillShelf.filterPlazaShelf(d.items || [], category);
        const isFallback = !!d.fallback;
        setFallback(isFallback);
        const nextTotal = isFallback ? next.length : Math.min(Number(d.total) || 0, next.length);
        if (mode === "replace") setItems(next);
        else setItems((cur) => cur.concat(next));
        setTotal(nextTotal);
        setHasMore(isFallback ? false : !!d.hasMore);
        setStatus("ready");
        setErr("");
        return next;
      };
      useEffect(() => {
        let live = true;
        // 渠道真源：仅用户提交 query 时打 skillhub；分类浏览保持双渠道（#504）。
        const payload = SkillShelf.buildPlazaSearchPayload(submitted, category, page, pageSize);
        const key = apiCacheKey("search", payload);
        const cached = apiCache.get(key);
        const hasFresh = cached && Date.now() - cached.at < API_CACHE_TTL_MS;
        if (page === 1 && hasFresh) {
          applySearchBody(cached.body, "replace");
        } else if (page === 1) {
          setStatus("loading");
        }
        api("search", payload)
          .then((d) => {
            if (!live) return;
            const next = applySearchBody(d, page === 1 ? "replace" : "append");
            // Lazy ratings: patch cards after search returns (Host no longer awaits).
            const slugs = next.map((it) => it.slug).filter(Boolean);
            if (slugs.length) {
              api("ratings", { slugs }, { skipCache: true }).then((r) => {
                if (!live || !r || !r.ratings) return;
                setItems((cur) => cur.map((it) => {
                  const score = r.ratings[it.slug];
                  return score != null ? { ...it, rating: score } : it;
                }));
              }).catch(() => {});
            }
          })
          .catch((e) => {
            if (!live) return;
            if (page === 1 && !hasFresh) {
              setItems([]);
              setTotal(0);
              setHasMore(false);
              setFallback(false);
              setStatus("error");
              setErr(e.message || String(e));
            }
          });
        return () => { live = false; };
      }, [submitted, category, page]);
      const mark = (item, installed) => {
        setItems((cur) => cur.map((it) => it.slug === item.slug ? { ...it, installed } : it));
        setOpen((cur) => cur && cur.slug === item.slug ? { ...cur, installed } : cur);
      };
      const remaining = fallback ? 0 : Math.max(0, total - items.length);
      const summaryText = fallback
        ? tr("search.fallback")
        : tr("search.hint", { n: total || items.length });
      return h("div", { className: "sh-mkt" },
        h("div", { className: "sh-mkt-filters" },
          h(Button, {
            type: "button",
            size: "xs",
            variant: !category ? "secondary" : "ghost",
            onClick: () => { setCategory(""); setPage(1); },
          }, tr("mkt.catAll")),
          SkillShelf.SKILL_SHELF_TAXONOMY.map((row) => h(Button, {
            key: row.id,
            type: "button",
            size: "xs",
            variant: category === row.id ? "secondary" : "ghost",
            onClick: () => { setCategory(row.id); setPage(1); },
          }, tr(row.labelKey))),
        ),
        status === "ready" ? h("div", { className: "sh-mkt-results" },
          h("p", { className: "sh-mkt-summary" }, summaryText),
        ) : null,
        status === "loading" && page === 1 ? h("p", { className: "sh-mkt-status" }, tr("mkt.loading")) : null,
        status === "error" ? h("p", { className: "sh-mkt-status" }, tr("mkt.error", { m: err })) : null,
        status === "ready" && !items.length ? h("p", { className: "sh-mkt-status" }, tr("search.empty")) : null,
        items.length ? h(Cards, { items, onOpen: setOpen }) : null,
        status === "ready" && !fallback && (hasMore || remaining > 0) ? h(Button, {
          type: "button",
          variant: "outline",
          className: "sh-mkt-more",
          onClick: () => setPage((n) => n + 1),
        },
          h("span", null, tr("mkt.more")),
          remaining ? h("span", { className: "sh-mkt-more-left" }, tr("mkt.moreLeft", { n: remaining })) : null,
          h(ChevronDown),
        ) : null,
        open ? h(Drawer, {
          item: open,
          onClose: () => setOpen(null),
          onInstalled: (it) => mark(it, true),
          onUninstalled: (it) => mark(it, false),
        }) : null,
      );
    }
