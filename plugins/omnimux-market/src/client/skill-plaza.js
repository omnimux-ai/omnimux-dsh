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

    function resolveItemTitle(item, tr) {
      if (typeof skillTitle === "function") return skillTitle(item, tr);
      if (typeof SkillShelf !== "undefined" && typeof SkillShelf.skillTitle === "function") return SkillShelf.skillTitle(item, tr);
      if (!item) return "";
      const isEn = tr && (tr("locale") === "en" || tr.locale === "en");
      if (isEn && (item.titleEn || item.nameEn)) return item.titleEn || item.nameEn;
      if (!isEn && (item.titleZh || item.nameZh)) return item.titleZh || item.nameZh;
      return item.name || item.title || item.slug || "";
    }

    function resolveItemDesc(item, tr) {
      if (typeof skillDesc === "function") return skillDesc(item, tr);
      if (typeof SkillShelf !== "undefined" && typeof SkillShelf.skillDesc === "function") return SkillShelf.skillDesc(item, tr);
      if (!item) return "";
      const isEn = tr && (tr("locale") === "en" || tr.locale === "en");
      if (isEn && (item.descriptionEn || item.summaryEn)) return item.descriptionEn || item.summaryEn;
      if (!isEn && (item.descriptionZh || item.summaryZh)) return item.descriptionZh || item.summaryZh;
      return item.description || item.summary || "";
    }

    function WorkshopSwitch({ checked, onChange, disabled }) {
      return h("div", {
        className: "toggle-wrap",
        role: "switch",
        "aria-checked": Boolean(checked),
        tabIndex: disabled ? -1 : 0,
        onClick: (e) => {
          e.stopPropagation();
          if (!disabled && onChange) onChange(!checked);
        },
        onKeyDown: (e) => {
          if ((e.key === "Enter" || e.key === " ") && !disabled && onChange) {
            e.preventDefault();
            e.stopPropagation();
            onChange(!checked);
          }
        },
      },
        h("div", { className: "switch-bg" + (checked ? " on" : "") },
          h("div", { className: "switch-knob" }),
        ),
      );
    }

    function InstallModal({ open, onClose, onInstalled }) {
      const [file, setFile] = useState(null);
      const [uploading, setUploading] = useState(false);
      const [error, setError] = useState("");
      const fileInputRef = useRef(null);
      if (!open) return null;

      const handleFileChange = (e) => {
        const selected = e.target.files && e.target.files[0];
        if (selected) {
          setFile(selected);
          setError("");
        }
      };

      const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const dropped = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
        if (dropped) {
          setFile(dropped);
          setError("");
        }
      };

      const handleInstall = async () => {
        if (!file) return;
        setUploading(true);
        setError("");
        try {
          const name = file.name.replace(/\.(zip|md)$/i, "");
          await api("install", { slug: name });
          if (onInstalled) onInstalled({ name, slug: name, installed: true, enabled: true });
          onClose();
        } catch (err) {
          setError(err.message || String(err));
        } finally {
          setUploading(false);
        }
      };

      return h(Overlay, { onClose },
        h("div", { className: "modal-dialog", role: "dialog", "aria-modal": "true" },
          h("div", { className: "modal-header" },
            h("h3", { className: "modal-title" }, lookup("workshop.installModalTitle") || "安装Skill"),
            h("button", {
              type: "button",
              className: "modal-close-btn",
              "aria-label": lookup("action.close"),
              onClick: onClose,
            },
              h("svg", { width: "18", height: "18", viewBox: "0 0 24 24" },
                h("line", { x1: "18", y1: "6", x2: "6", y2: "18", stroke: "currentColor", strokeWidth: "2" }),
                h("line", { x1: "6", y1: "6", x2: "18", y2: "18", stroke: "currentColor", strokeWidth: "2" }),
              ),
            ),
          ),
          h("div", {
            className: "drop-zone",
            onClick: () => fileInputRef.current?.click(),
            onDragOver: (e) => { e.preventDefault(); e.stopPropagation(); },
            onDrop: handleDrop,
          },
            h("input", {
              ref: fileInputRef,
              type: "file",
              accept: ".zip,.md",
              style: { display: "none" },
              onChange: handleFileChange,
            }),
            h("div", { className: "drop-icon-box" },
              h("svg", { width: "24", height: "24", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "1.8" },
                h("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }),
                h("polyline", { points: "14 2 14 8 20 8" }),
                h("line", { x1: "12", y1: "18", x2: "12", y2: "12" }),
                h("line", { x1: "9", y1: "15", x2: "15", y2: "15" }),
              ),
            ),
            h("p", { className: "drop-text" }, file ? "已选择: " + file.name : (lookup("workshop.dropText") || "拖放 .zip 或 SKILL.md 文件，或点击选择")),
          ),
          h("div", { className: "req-section" },
            h("h4", { className: "req-title" }, lookup("workshop.reqTitle") || "文件要求"),
            h("ul", { className: "req-list" },
              h("li", { className: "req-item" }, lookup("workshop.reqZip") || "包含 SKILL.md 文件的 .zip 压缩包"),
              h("li", { className: "req-item" }, lookup("workshop.reqMd") || "或直接拖入 SKILL.md 文件"),
            ),
          ),
          error ? h("p", { className: "sh-err" }, error) : null,
          h("button", {
            type: "button",
            className: "btn-modal-install" + (file ? " ready" : ""),
            disabled: !file || uploading,
            onClick: handleInstall,
          }, uploading ? "正在安装…" : (lookup("workshop.installAction") || "安装")),
        ),
      );
    }

    function ConfirmInstallModal({ item, onConfirm, onClose, error = "", installing = false }) {
      if (!item) return null;
      const tr = typeof useTr === "function" ? useTr() : lookup;
      return h(Overlay, { onClose },
        h("div", { className: "modal-dialog", style: { width: "400px" }, role: "dialog", "aria-modal": "true" },
          h("div", { className: "modal-header" },
            h("h3", { className: "modal-title" }, lookup("workshop.confirmInstall") || "是否安装并启用此 Skill？"),
          ),
          h("p", { style: { fontSize: "13px", color: "var(--dsw-alias-label-secondary, #d1d5db)", margin: "0 0 20px" } },
            "即将安装「" + resolveItemTitle(item, tr) + "」，安装完成后将自动为您启用。"
          ),
          error ? h("p", { className: "sh-err", role: "alert" }, error) : null,
          h("div", { style: { display: "flex", gap: "8px", justifyContent: "flex-end" } },
            h(Button, { size: "sm", variant: "outline", onClick: onClose, disabled: installing }, "取消"),
            h(Button, { size: "sm", variant: "primary", onClick: onConfirm, disabled: installing }, installing ? "正在安装…" : "确认安装"),
          ),
        ),
      );
    }

    // 工坊分类顺序（PRD §6.1 / AC-05）：
    // 1. 全部 2. 精选 3. 短剧漫剧 4. 专业影视 5. 动画 6. 商业广告 7. 电商 8. 教育 9. 创意实验 10. 音频音乐 11. 平台工具
    const WORKSHOP_DOMAIN_ORDER = [
      "短剧漫剧", "专业影视", "动画", "商业广告", "电商", "教育", "创意实验", "音频音乐", "平台工具",
    ];

    const DEFAULT_MARKET_EXPERTS = [
      {
        id: "shopee-ops-expert",
        name: "Shopee运营专家",
        nameEn: "Shopee Ops Expert",
        description: "负责市场、产品、店铺、品牌和关键词分析的Shopee运营专员。",
        descriptionEn: "Shopee operation specialist for market, product, shop, brand and keyword analysis.",
        avatar: "catalog/covers/expert-shopee-ops.png",
        status: "enabled",
      },
      {
        id: "youtube-creator-expert",
        name: "YouTube创作者专家",
        nameEn: "YouTube Creator Expert",
        description: "帮助商家利用Topview自有创作者池数据寻找和评估YouTube创作者。",
        descriptionEn: "Help merchants find and evaluate YouTube creators using Topview self-owned creator... pool data.",
        avatar: "catalog/covers/expert-youtube-creator.png",
        status: "enabled",
      },
      {
        id: "amazon-ops-expert",
        name: "亚马逊运营专家",
        nameEn: "Amazon Ops Expert",
        description: "亚马逊市场、产品、列表、关键词、评论和风险分析运营专家。",
        descriptionEn: "Amazon operation specialist for market, product, listing, keyword, review and risk... analysis.",
        avatar: "catalog/covers/expert-amazon-ops.png",
        status: "enabled",
      },
      {
        id: "tiktok-shop-ops-expert",
        name: "TikTok Shop运营专家",
        nameEn: "TikTok Shop Ops Expert",
        description: "负责TikTok Shop趋势、产品、素材、内容、联盟、广告和直播运营的专家。",
        descriptionEn: "TikTok Shop operation specialist for trends, products, materials, content, affiliates, ads and live... ops.",
        avatar: "catalog/covers/expert-tiktok-shop-ops.png",
        status: "enabled",
      },
      {
        id: "media-creator",
        name: "媒体创作者",
        nameEn: "Media Creator",
        description: "AI内容生成：使用Topview AI创意工具生成视频、图像、数字替身、背景移除、文本转语音和语音克隆。",
        descriptionEn: "AI content generation: videos, images, digital avatars, background removal, TTS, and... voice cloning using Topview AI",
        avatar: "catalog/covers/expert-media-creator.png",
        status: "available",
      },
      {
        id: "html-generator",
        name: "HTML生成器",
        nameEn: "HTML Generator",
        description: "根据数据或描述生成美观的HTML网页，支持数据可视化和报告展示",
        descriptionEn: "根据数据或描述生成美观的HTML网页，支持数据可视化和报告展示",
        avatar: "catalog/covers/expert-html-generator.png",
        status: "available",
      },
      {
        id: "amazon-operations-expert",
        name: "亚马逊运营专家",
        nameEn: "Amazon Operations Expert",
        description: "专注于亚马逊店铺运营、商品详情优化、广告投放和竞争对手分析，以提高转化率和销售额。",
        descriptionEn: "Focused on Amazon store operations, listing optimization, advertising, and competitor... analysis to improve conversion",
        avatar: "catalog/covers/expert-amazon-operations.png",
        status: "coming_soon",
      },
      {
        id: "tiktok-ecommerce-expert",
        name: "TikTok电商专家",
        nameEn: "TikTok Ecommerce Expert",
        description: "擅长TikTok短视频销售、创作者合作和增长策略，帮助品牌在TikTok Shop上推出产品。",
        descriptionEn: "Expert in TikTok short-video selling, creator partnerships, and growth strategies to help... brands launch on TikTok Shop.",
        avatar: "catalog/covers/expert-tiktok-ecommerce.png",
        status: "coming_soon",
      },
    ];

    function SkillPlaza(props) {
      const tr = useTr();
      const pageSize = 80;
      const initialSubmitted = (props && props.submittedQuery) ?? "";

      const [mainTab, setMainTab] = useState("discover"); // "discover" | "mine"
      const [category, setCategory] = useState("");
      const [page, setPage] = useState(1);
      const [searchQuery, setSearchQuery] = useState("");
      const [submitted, setSubmitted] = useState(initialSubmitted);
      const [uninstalledOnly, setUninstalledOnly] = useState(false);
      const [autoUpdate, setAutoUpdate] = useState(false);
      const [mineCategory, setMineCategory] = useState("");
      const [mineSource, setMineSource] = useState("");

      const [items, setItems] = useState([]);
      const [installedItems, setInstalledItems] = useState([]);
      const [total, setTotal] = useState(0);
      const [hasMore, setHasMore] = useState(false);
      const [fallback, setFallback] = useState(false);
      const [status, setStatus] = useState("loading");
      const [err, setErr] = useState("");

      const [open, setOpen] = useState(null);
      const [openInstallModal, setOpenInstallModal] = useState(false);
      const [confirmInstallItem, setConfirmInstallItem] = useState(null);
      const [confirmInstallError, setConfirmInstallError] = useState("");
      const [confirmInstalling, setConfirmInstalling] = useState(false);
      const [customOrder, setCustomOrder] = useState(() => {
        if (typeof SkillShelf !== "undefined" && typeof SkillShelf.getHomeCustomOrder === "function") {
          return SkillShelf.getHomeCustomOrder();
        }
        return null;
      });

      const [expertMarketItems, setExpertMarketItems] = useState(DEFAULT_MARKET_EXPERTS);
      const [expertMarketToggling, setExpertMarketToggling] = useState("");

      const loadExpertMarket = useCallback(() => {
        api("expertMarketList")
          .then((d) => {
            if (d && Array.isArray(d.items)) {
              setExpertMarketItems(d.items);
            }
          })
          .catch(() => {});
      }, []);

      useEffect(() => {
        if (mainTab === "experts-market") {
          loadExpertMarket();
        }
      }, [mainTab, loadExpertMarket]);

      const handleToggleExpert = async (item) => {
        if (expertMarketToggling) return;
        const isEnabled = item.status === "enabled";
        const actionMethod = isEnabled ? "expertMarketDisable" : "expertMarketInstall";
        const nextStatus = isEnabled ? "disabled" : "enabled";

        setExpertMarketItems((cur) =>
          cur.map((it) => (it.id === item.id ? { ...it, status: nextStatus } : it))
        );
        setExpertMarketToggling(item.id);

        try {
          const res = await api(actionMethod, { id: item.id });
          if (res && res.status) {
            setExpertMarketItems((cur) =>
              cur.map((it) => (it.id === item.id ? { ...it, status: res.status } : it))
            );
          }
        } catch {
          setExpertMarketItems((cur) =>
            cur.map((it) => (it.id === item.id ? { ...it, status: item.status } : it))
          );
        } finally {
          setExpertMarketToggling("");
        }
      };

      const loadInstalled = useCallback(() => {
        api("list")
          .then((d) => {
            if (d && Array.isArray(d.items)) {
              setInstalledItems(d.items.map((it) => ({
                ...it,
                installed: true,
                enabled: it.enabled !== false,
              })));
            }
          })
          .catch(() => {});
      }, []);

      useEffect(() => {
        loadInstalled();
      }, [loadInstalled]);

      const applySearchBody = (d, mode) => {
        const filterCat = category === "featured" ? "" : category;
        const next = (d.items || []).filter((item) => !filterCat || SkillShelf.matchesDomainTag(item, filterCat));
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
        const payload = SkillShelf.buildPlazaSearchPayload(submitted, category === "featured" ? "" : category, page, pageSize);
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
        setItems((cur) => cur.map((it) => (it.slug === item.slug || it.id === item.id) ? { ...it, installed } : it));
        setInstalledItems((cur) => {
          if (installed) {
            const exists = cur.some((it) => it.slug === item.slug || it.id === item.id);
            if (exists) return cur.map((it) => (it.slug === item.slug || it.id === item.id) ? { ...it, installed: true } : it);
            return [{ ...item, installed: true, enabled: true }, ...cur];
          }
          return cur.filter((it) => it.slug !== item.slug && it.id !== item.id);
        });
        setOpen((cur) => (cur && (cur.slug === item.slug || cur.id === item.id)) ? { ...cur, installed } : cur);
      };

      const handleSwitchToggle = (item) => {
        if (item.installed) {
          const next = item.enabled === false;
          setItems((cur) => cur.map((it) => (it.slug === item.slug || it.id === item.id) ? { ...it, enabled: next } : it));
          setInstalledItems((cur) => cur.map((it) => (it.slug === item.slug || it.id === item.id) ? { ...it, enabled: next } : it));
        } else {
          setConfirmInstallError("");
          setConfirmInstallItem(item);
        }
      };

      const handleConfirmInstall = async () => {
        if (!confirmInstallItem || confirmInstalling) return;
        const item = confirmInstallItem;
        const slug = item.slug || item.token || item.skillKey || "";
        setConfirmInstalling(true);
        setConfirmInstallError("");
        try {
          await api("install", { slug, catalogId: item.catalogId || item.id });
          mark(item, true);
          setConfirmInstallItem(null);
        } catch (error) {
          setConfirmInstallError(error?.message || String(error));
        } finally {
          setConfirmInstalling(false);
        }
      };

      const sessions = typeof plazaSessions !== "undefined" ? plazaSessions : null;
      const activePreset = SkillShelf.resolveActivePreset({ sessions });
      const presetBinding = SkillShelf.getPresetSkillBinding(activePreset);

      const hasQuery = Boolean(submitted.trim());
      const { featured: featuredItems, regular: regularItems } = SkillShelf.plazaDiscoverySections(items, {
        category, query: submitted, uninstalledOnly, installedItems, presetBinding, customOrder,
      });

      const handleMoveToTop = (targetId) => {
        const currentList = featuredItems.map((it) => it.id);
        const filtered = currentList.filter((id) => id !== targetId);
        const newOrder = [targetId, ...filtered];
        setCustomOrder(newOrder);
        if (typeof SkillShelf !== "undefined" && typeof SkillShelf.saveHomeCustomOrder === "function") {
          SkillShelf.saveHomeCustomOrder(newOrder);
        }
        api("homeCustomOrder", { order: newOrder }).catch(() => {});
      };

      const handleResetOrder = () => {
        setCustomOrder(null);
        if (typeof SkillShelf !== "undefined" && typeof SkillShelf.saveHomeCustomOrder === "function") {
          SkillShelf.saveHomeCustomOrder(null);
        }
        api("homeCustomOrder", { order: [] }).catch(() => {});
      };

      // 我的 Skill 过滤
      const filteredMine = installedItems.filter((item) => {
        if (category === "featured" && !SkillShelf.isRecommendedInstalledSkill(item)) return false;
        if (category && category !== "featured") {
          if (presetBinding) {
            const cat = String(item.category || item.categoryLabel || "").trim();
            const tags = Array.isArray(item.tags) ? item.tags.map(String) : [];
            if (cat !== category && !tags.includes(category)) return false;
          } else if (!SkillShelf.matchesDomainTag(item, category)) {
            return false;
          }
        }
        if (mineCategory && !SkillShelf.matchesDomainTag(item, mineCategory)) return false;
        if (mineSource) {
          const src = String(item.source || item.origin || item.channel || "OmniMux").toLowerCase();
          if (src !== mineSource.toLowerCase()) return false;
        }
        if (searchQuery.trim()) {
          const q = searchQuery.trim().toLowerCase();
          const hay = [item.name, item.title, item.description, item.slug].filter(Boolean).join(" ").toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      });

      const availableSources = Array.from(new Set(installedItems.map((it) => it.source || it.origin || it.channel || "OmniMux").filter(Boolean)));

      const workshopCategories = presetBinding
        ? [
            { id: "", label: tr("workshop.catAll") || "全部" },
            ...presetBinding.categories.map((c) => ({ id: c.id, label: c.name })),
          ]
        : [
            { id: "", label: tr("workshop.catAll") || "全部" },
            { id: "featured", label: tr("workshop.catFeatured") || "精选" },
            ...WORKSHOP_DOMAIN_ORDER.map((id) => {
              const row = SkillShelf.SKILL_SHELF_TAXONOMY.find((r) => r.id === id);
              return { id, label: row ? tr(row.labelKey) : id };
            }),
          ];

      const isEn = tr("locale") === "en";
      const isExpertTab = mainTab === "experts-market";
      const introHeading = isExpertTab
        ? (tr("expertMarket.title") || (isEn ? "Experts Market" : "专家市场"))
        : (tr("workshop.title") || "Skill");
      const introSubtitle = isExpertTab
        ? (tr("expertMarket.subtitle") || (isEn ? "Discover and install AI Agents to extend your workspace" : "发现并安装AI代理以扩展您的工作区"))
        : tr("workshop.subtitle");

      const displayedExperts = (expertMarketItems.length ? expertMarketItems : DEFAULT_MARKET_EXPERTS).filter((item) => {
        if (!isExpertTab || !searchQuery.trim()) return true;
        const q = searchQuery.trim().toLowerCase();
        const hay = [item.name, item.nameEn, item.description, item.descriptionEn].filter(Boolean).join(" ").toLowerCase();
        return hay.includes(q);
      });

      return h("div", { className: "sh-mkt" },
        h("section", { className: "workshop-intro", "aria-label": introHeading },
          h("div", { className: "workshop-heading", role: "heading", "aria-level": 1 }, introHeading),
          h("p", { className: "workshop-description" }, introSubtitle),
          isExpertTab ? h("div", { className: "action-row" },
            h("button", {
              type: "button",
              className: "btn-create",
              onClick: () => createSkillSession({ mode: "expert-creator", preset: "cordis", text: "" }),
            },
              h(PlazaIcon, { size: 14 }),
              tr("expertMarket.createExpert") || (isEn ? "Create Expert" : "创建专家"),
            ),
          ) : h("div", { className: "action-row" },
            h("button", { type: "button", className: "btn-create", onClick: () => createSkillSession({ text: "/skill-creator" }) },
              h(PlazaIcon, { size: 14 }), tr("workshop.create")),
            h("button", { type: "button", className: "btn-install", onClick: () => setOpenInstallModal(true) },
              h("svg", { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" },
                h("path", { d: "M8 3v10M3 8h10", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" })), tr("workshop.install")),
          ),
        ),
        // 双 Tab 与搜索行
        h("div", { className: "nav-bar" },
          h("div", { className: "nav-tabs" },
            h("button", {
              type: "button",
              "aria-pressed": mainTab === "discover",
              className: "nav-tab" + (mainTab === "discover" ? " active" : ""),
              onClick: () => { setMainTab("discover"); setPage(1); },
            },
              h("span", null, tr("workshop.tabSkill") || "Skill"),
              h("svg", {
                className: "tab-info-icon",
                width: "14",
                height: "14",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: "2",
                strokeLinecap: "round",
                strokeLinejoin: "round",
                "aria-hidden": "true",
              },
                h("circle", { cx: "12", cy: "12", r: "10" }),
                h("line", { x1: "12", y1: "16", x2: "12", y2: "12" }),
                h("line", { x1: "12", y1: "8", x2: "12.01", y2: "8" }),
              ),
            ),
            h("button", {
              type: "button",
              "aria-pressed": mainTab === "mine",
              className: "nav-tab" + (mainTab === "mine" ? " active" : ""),
              onClick: () => setMainTab("mine"),
            },
              h("span", null, tr("workshop.tabMine") || "我的 Skill"),
            ),
            h("button", {
              type: "button",
              "aria-pressed": mainTab === "experts-market",
              className: "nav-tab" + (mainTab === "experts-market" ? " active" : ""),
              onClick: () => setMainTab("experts-market"),
            },
              h("span", null, tr("workshop.tabExpertsMarket") || (isEn ? "Experts Market" : "专家市场")),
            ),
          ),
          h("div", { className: "search-box" },
            h("svg", { className: "search-icon", viewBox: "0 0 24 24" },
              h("path", { d: "M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" }),
            ),
            h("input", {
              type: "text",
              value: searchQuery,
              placeholder: isExpertTab
                ? (tr("expertMarket.searchPlaceholder") || (isEn ? "Search all experts..." : "搜索全部专家"))
                : tr(mainTab === "mine" ? "workshop.searchMinePlaceholder" : "workshop.searchPlaceholder"),
              onChange: (e) => setSearchQuery(e.target.value),
              onKeyDown: (e) => {
                if (e.key === "Enter") {
                  setSubmitted(searchQuery);
                  setPage(1);
                }
              },
            }),
          ),
        ),

        isExpertTab ? null : h("div", { className: "category-bar", "aria-label": tr("workshop.category") },
          workshopCategories.map((c) => h("button", {
            key: c.id,
            type: "button",
            className: "cat-btn" + (category === c.id ? " active" : ""),
            "aria-pressed": category === c.id,
            onClick: () => { setCategory(c.id); setMineCategory(""); setPage(1); },
          }, c.id === "短剧漫剧" && tr("locale") === "zh" ? "短剧/漫剧" : c.label)),
        ),
        // 视图内容
        isExpertTab ? h("div", { className: "expert-market-container" },
          displayedExperts.length === 0
            ? h("div", { className: "sh-mkt-empty" }, tr("expert.empty") || (isEn ? "No matching experts" : "没有匹配的专家"))
            : h("div", { className: "expert-market-grid" },
                displayedExperts.map((item) => {
              const isEn = tr("locale") === "en";
              const title = isEn ? (item.nameEn || item.name) : item.name;
              const desc = isEn ? (item.descriptionEn || item.description) : item.description;
              const isEnabled = item.status === "enabled";
              const isAvailable = item.status === "available";
              const isDisabled = item.status === "disabled";
              const isComingSoon = item.status === "coming_soon";

              let statusText = "";
              if (isEnabled) statusText = "[ " + (tr("expertMarket.enabled") || (isEn ? "Employed" : "已入职")) + " ]";
              else if (isAvailable) statusText = "[ " + (tr("expertMarket.available") || (isEn ? "Hireable" : "可聘用")) + " ]";
              else if (isDisabled) statusText = "[ " + (tr("expertMarket.disabled") || (isEn ? "Resigned" : "已离职")) + " ]";
              else if (isComingSoon) statusText = "[ " + (tr("expertMarket.comingSoon") || (isEn ? "Coming soon" : "即将推出")) + " ]";

              const btnText = isEnabled
                ? (tr("expertMarket.disable") || (isEn ? "Disable" : "禁用"))
                : (tr("expertMarket.install") || (isEn ? "Install" : "安装"));

              const showButton = isEnabled || isAvailable || isDisabled;

              return h("div", { key: item.id, className: "expert-card" },
                h("div", { className: "expert-card-avatar-wrap" },
                  h("img", {
                    className: "expert-card-avatar",
                    src: iconSrc(item.avatar),
                    alt: title,
                    loading: "lazy",
                  }),
                ),
                showButton ? h("div", { className: "expert-card-action" },
                  h("button", {
                    type: "button",
                    className: "expert-pill-btn",
                    disabled: expertMarketToggling === item.id,
                    onClick: (e) => {
                      e.stopPropagation();
                      handleToggleExpert(item);
                    },
                  }, expertMarketToggling === item.id ? "..." : btnText),
                ) : null,
                h("div", {
                  className: "expert-card-status " + (item.status || ""),
                }, statusText),
                h("div", { className: "expert-card-title" }, title),
                h("p", { className: "expert-card-desc" }, desc),
              );
            }),
          ),
        ) : mainTab === "mine" ? h("div", null,
          // 「我的 Skill」专属工具行
          h("div", { className: "mine-toolbar" },
            h("button", {
              type: "button",
              className: "pill-dropdown",
              onClick: () => {
                const order = ["", ...WORKSHOP_DOMAIN_ORDER];
                const idx = order.indexOf(mineCategory);
                setMineCategory(order[(idx + 1) % order.length]);
              },
            },
              h("span", null, (tr("workshop.catPrefix") || "分类 ") + (mineCategory || (tr("workshop.catAll") || "全部"))),
              h("span", { style: { fontSize: "10px" } }, "▾"),
            ),
            availableSources.length ? h("button", {
              type: "button",
              className: "pill-dropdown",
              onClick: () => {
                const order = ["", ...availableSources];
                const idx = order.indexOf(mineSource);
                setMineSource(order[(idx + 1) % order.length]);
              },
            },
              h("span", null, (tr("workshop.sourcePrefix") || "来源 ") + (mineSource || (tr("workshop.catAll") || "全部"))),
              h("span", { style: { fontSize: "10px" } }, "▾"),
            ) : null,
            h("div", { className: "auto-update-wrap" },
              h("span", null, tr("workshop.autoUpdate") || "自动更新"),
              h(WorkshopSwitch, {
                checked: autoUpdate,
                onChange: setAutoUpdate,
              }),
            ),
          ),
          filteredMine.length ? h("div", { className: "regular-grid" },
            filteredMine.map((item) => h("div", {
              key: item.slug || item.id,
              className: "regular-card",
              onClick: () => setOpen(item),
            },
              h("div", { className: "regular-card-info" },
                h("div", { className: "regular-card-top" },
                  h("div", { className: "regular-card-title", title: resolveItemTitle(item, tr) }, resolveItemTitle(item, tr)),
                ),
                h("div", { className: "regular-card-desc" }, resolveItemDesc(item, tr) || "暂无描述"),
              ),
              h(WorkshopSwitch, {
                checked: item.enabled !== false,
                onChange: () => handleSwitchToggle(item),
              }),
            )),
          ) : h("p", { className: "sh-mkt-status" }, tr("workshop.emptyMine") || "暂无已安装的 Skill"),
        ) : h("div", null,

          // 官方精选（结果大于等于 1 项才显示，否则完全隐藏）
          featuredItems.length > 0 ? h("section", { className: "featured-section" },
            h("div", { className: "featured-title-bar", style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" } },
              h("h2", { className: "featured-title", style: { margin: 0 } }, tr("workshop.featuredTitle") || "官方精选"),
              customOrder && customOrder.length ? h("button", {
                type: "button",
                className: "btn-reset-order",
                style: {
                  background: "transparent",
                  border: "1px solid var(--dsw-alias-border-subtle, rgba(255,255,255,.12))",
                  borderRadius: "6px",
                  fontSize: "12px",
                  color: "var(--dsw-alias-label-secondary, #cbd5e1)",
                  padding: "3px 8px",
                  cursor: "pointer",
                },
                onClick: handleResetOrder,
              }, tr("workshop.resetOrder") || "恢复默认排序") : null,
            ),
            h("div", { className: "featured-grid" },
              featuredItems.map((item) => {
                const coverSrc = item.cover && item.cover.asset ? iconSrc(item.cover.asset) : (item.coverUrl || "");
                return h("div", {
                  key: item.slug || item.id,
                  className: "featured-card",
                  onClick: () => setOpen(item),
                },
                  h("div", { className: "featured-cover-wrap" },
                    coverSrc ? h("img", {
                      src: coverSrc,
                      alt: (item.cover && item.cover.alt) || resolveItemTitle(item, tr) || "Cover",
                      loading: "lazy",
                      style: { width: "100%", height: "100%", objectFit: "cover", display: "block" },
                      onError: (e) => {
                        e.currentTarget.style.display = "none";
                        const next = e.currentTarget.nextElementSibling;
                        if (next) next.style.display = "block";
                      },
                    }) : null,
                    h("svg", {
                      viewBox: "0 0 320 180",
                      width: "100%",
                      height: "100%",
                      fill: "none",
                      xmlns: "http://www.w3.org/2000/svg",
                      style: coverSrc ? { display: "none" } : undefined,
                    },
                      h("rect", { width: "320", height: "180", fill: "var(--dsw-alias-bg-layer-1, #1a1c24)" }),
                      h("circle", { cx: "160", cy: "90", r: "36", fill: "var(--dsw-alias-bg-layer-2, #272a38)" }),
                      h("text", { x: "160", y: "96", textAnchor: "middle", fill: "var(--dsw-alias-brand-primary, #6f59ff)", fontSize: "16", fontWeight: "600" }, (item.name || item.title || "SK").slice(0, 4)),
                    ),
                    h("div", { className: "featured-hover-actions" },
                      h("button", {
                        type: "button",
                        className: "hover-btn hover-btn-pin",
                        title: tr("workshop.pinToTop") || "置顶",
                        onClick: (e) => { e.stopPropagation(); handleMoveToTop(item.id); },
                      }, tr("workshop.pinToTop") || "置顶"),
                      h("button", {
                        type: "button",
                        className: "hover-btn hover-btn-detail",
                        onClick: (e) => { e.stopPropagation(); setOpen(item); },
                      }, tr("workshop.detail") || "查看详情"),
                      h("button", {
                        type: "button",
                        className: "hover-btn hover-btn-try",
                        onClick: (e) => { e.stopPropagation(); trySkillInSession(item); },
                      }, tr("workshop.try") || "去对话中试试"),
                    ),
                  ),
                  h("div", { className: "featured-content" },
                    h("div", { className: "featured-card-name", title: resolveItemTitle(item, tr) }, resolveItemTitle(item, tr)),
                    h("div", { className: "featured-card-desc" }, resolveItemDesc(item, tr) || "暂无描述"),
                  ),
                );
              }),
            ),
          ) : null,

          // 其他Skill区块（在精选分类下不显示普通区）
          category === "featured" && !hasQuery ? null : h("section", { className: "regular-section" },
            h("div", { className: "regular-header" },
              h("div", { className: "regular-title-row" },
                h("span", null, tr(hasQuery ? "workshop.searchResults" : "workshop.otherTitle")),
                h("span", { className: "regular-title-count" }, " · " + (regularItems.length)),
              ),
              h("div", { className: "regular-controls" },
                h("div", {
                  className: "filter-item" + (uninstalledOnly ? " checked" : ""),
                  onClick: () => setUninstalledOnly(!uninstalledOnly),
                },
                  h("div", { className: "filter-circle" }),
                  h("span", null, tr("workshop.onlyUninstalled") || "仅显示未安装"),
                ),
                h("div", { className: "sort-btn" },
                  h("span", null, tr("workshop.sortRecent") || "排序: 最近"),
                ),
              ),
            ),
            status === "loading" && page === 1 ? h("p", { className: "sh-mkt-status" }, tr("mkt.loading")) : null,
            status === "error" ? h("p", { className: "sh-mkt-status" }, tr("mkt.error", { m: err })) : null,
            status === "ready" && !regularItems.length ? h("p", { className: "sh-mkt-status" }, tr("search.empty")) : null,
            regularItems.length ? h("div", { className: "regular-grid" },
              regularItems.map((item) => h("div", {
                key: item.slug || item.id,
                className: "regular-card",
                onClick: () => setOpen(item),
              },
                h("div", { className: "regular-card-info" },
                  h("div", { className: "regular-card-top" },
                    h("div", { className: "regular-card-title", title: resolveItemTitle(item, tr) }, resolveItemTitle(item, tr)),
                    item.downloads ? h("span", { className: "regular-card-dl" }, fmt(item.downloads, tr)) : null,
                  ),
                  h("div", { className: "regular-card-desc" }, resolveItemDesc(item, tr) || "暂无描述"),
                ),
                h(WorkshopSwitch, {
                  checked: item.installed && item.enabled !== false,
                  onChange: () => handleSwitchToggle(item),
                }),
              )),
            ) : null,
          ),
          hasMore ? h(Button, { size: "sm", variant: "outline", onClick: () => setPage(page + 1) }, tr("mkt.more")) : null,
        ),

        // 详情弹窗
        open ? h(Drawer, {
          item: open,
          onClose: () => setOpen(null),
          onInstalled: (it) => mark(it, true),
          onUninstalled: (it) => mark(it, false),
        }) : null,

        // 安装弹窗
        h(InstallModal, {
          open: openInstallModal,
          onClose: () => setOpenInstallModal(false),
          onInstalled: (it) => {
            mark(it, true);
            loadInstalled();
          },
        }),

        // 未安装 switch 确认弹窗
        h(ConfirmInstallModal, {
          item: confirmInstallItem,
          onConfirm: handleConfirmInstall,
          error: confirmInstallError,
          installing: confirmInstalling,
          onClose: () => {
            if (confirmInstalling) return;
            setConfirmInstallItem(null);
            setConfirmInstallError("");
          },
        }),
      );
    }
