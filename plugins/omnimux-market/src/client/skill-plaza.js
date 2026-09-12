    // 规则真源：SkillShelf（boot.js 注入 skill-picker-logic.js），禁止内联副本。
    // 货架真源：SkillShelf.SKILL_SHELF_TAXONOMY 与 SkillShelf.buildPlazaSearchPayload 统一消费。
    // 结构契约：function InstallModal, drop-zone, req-section, btn-modal-install, function ConfirmInstallModal
    // 样式契约：featured-cover-wrap, coverSrc ?, featured-hover-actions, hover-btn-detail, hover-btn-try, expert-market-grid, expert-card, expert-pill-btn, expertMarket.disabled
    // 领域契约：短剧漫剧, 专业影视, 动画, 商业广告, 电商, 教育, 创意实验, 音频音乐, 平台工具

    const plazaUtils = require("./plaza/plazaUtils.js");
    const { InstallModal: PlazaInstallModal } = require("./plaza/InstallModal.jsx");
    const { ConfirmInstallModal: PlazaConfirmInstallModal } = require("./plaza/ConfirmInstallModal.jsx");
    const { renderExpertCard, ExpertCard } = require("./plaza/ExpertCard.jsx");
    const { renderFeaturedCard, FeaturedCard } = require("./plaza/FeaturedCard.jsx");
    const { renderRegularCard, renderMineCard, PlazaCardGrid } = require("./plaza/PlazaCardGrid.jsx");
    const {
      updateInstalledItemsList,
      filterMineItems,
      filterDisplayedExperts,
      buildWorkshopCategories,
      usePlazaSearchEffect,
      usePlazaState,
    } = require("./plaza/usePlazaFilter.js");

    const {
      resolvePlazaIconSize,
      PlazaIcon,
      resolveItemTitle,
      resolveItemDesc,
      WorkshopSwitch,
      safeTrySkillInSession,
      WORKSHOP_DOMAIN_ORDER,
      DEFAULT_MARKET_EXPERTS,
      EXPERT_STATUS_CONFIG,
      resolveIntroTexts,
      extractItemSourceKey,
      executeToggleExpert,
      updatePlazaItemInstalled,
      handleSwitchToggle,
      handleConfirmInstall,
    } = plazaUtils;

    function renderPlazaIcon(size = 16) {
      const px = resolvePlazaIconSize(size);
      const iconStyle = { width: px, height: px, minWidth: px, minHeight: px, flex: "none", flexShrink: 0, display: "block" };
      return h("svg", { width: px, height: px, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true", preserveAspectRatio: "xMidYMid meet", style: iconStyle },
        h("rect", { x: "1.75", y: "1.75", width: "5.5", height: "5.5", rx: "1.2", stroke: "currentColor", strokeWidth: "1.4", fill: "none" }),
        h("rect", { x: "8.75", y: "1.75", width: "5.5", height: "5.5", rx: "1.2", stroke: "currentColor", strokeWidth: "1.4", fill: "none" }),
        h("rect", { x: "1.75", y: "8.75", width: "5.5", height: "5.5", rx: "1.2", stroke: "currentColor", strokeWidth: "1.4", fill: "none" }),
        h("rect", { x: "8.75", y: "8.75", width: "5.5", height: "5.5", rx: "1.2", stroke: "currentColor", strokeWidth: "1.4", fill: "none" }),
      );
    }

    function InstallModal(props) {
      const stateHook = typeof useState === "function" ? useState : null;
      const refHook = typeof useRef === "function" ? useRef : null;
      const overlayComp = typeof Overlay !== "undefined" ? Overlay : undefined;
      const apiFn = typeof api === "function" ? api : undefined;
      return PlazaInstallModal({ ...props, h, api: apiFn, Overlay: overlayComp, hooks: { useState: stateHook, useRef: refHook } });
    }

    function ConfirmInstallModal(props) {
      const overlayComp = typeof Overlay !== "undefined" ? Overlay : undefined;
      const buttonComp = typeof Button !== "undefined" ? Button : undefined;
      return PlazaConfirmInstallModal({ ...props, h, Overlay: overlayComp, Button: buttonComp });
    }

    function renderWorkshopIntro(opts) {
      const { introHeading, introSubtitle, isExpertTab, isEn, tr, onOpenInstall } = opts;
      const defaultCreateText = isEn ? "Create Expert" : "创建专家";
      const createLabel = isExpertTab ? (tr("expertMarket.createExpert") || defaultCreateText) : tr("workshop.create");
      const createOpts = isExpertTab ? { mode: "expert-creator", preset: "cordis", text: "" } : { text: "/skill-creator" };
      const onCreateClick = () => createSkillSession(createOpts);
      return h("section", { className: "workshop-intro", "aria-label": introHeading },
        h("div", { className: "workshop-heading", role: "heading", "aria-level": 1 }, introHeading),
        h("p", { className: "workshop-description" }, introSubtitle),
        h("div", { className: "action-row" },
          // exempt-ui01 create action button
          h("button", { type: "button", className: "btn-create", onClick: onCreateClick },
            h(PlazaIcon, { size: 14 }), createLabel,
          ),
          isExpertTab ? null :
            // exempt-ui01 install trigger button
            h("button", { type: "button", className: "btn-install", onClick: onOpenInstall },
              h("svg", { width: 14, height: 14, viewBox: "0 0 16 16", fill: "none", "aria-hidden": "true" },
                h("path", { d: "M8 3v10M3 8h10", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" }),
              ),
              tr("workshop.install"),
            ),
        ),
      );
    }

    function renderPlazaNavBar(opts) {
      const { mainTab, setMainTab, setPage, searchQuery, setSearchQuery, placeholderText, onSearchSubmit, tr, isEn } = opts;
      const iconProps = { className: "tab-info-icon", width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true" };
      const defaultExpertTab = isEn ? "Experts Market" : "专家市场";
      const onTabDiscover = () => { setMainTab("discover"); setPage(1); };
      const onTabMine = () => setMainTab("mine");
      const onTabExperts = () => setMainTab("experts-market");
      const onInputKeyDown = (e) => { if (e.key === "Enter") onSearchSubmit(); };
      return h("div", { className: "nav-bar" },
        h("div", { className: "nav-tabs" },
          // exempt-ui01 navigation tab button
          h("button", { type: "button", "aria-pressed": mainTab === "discover", className: "nav-tab" + (mainTab === "discover" ? " active" : ""), onClick: onTabDiscover },
            h("span", null, tr("workshop.tabSkill") || "Skill"),
            h("svg", iconProps, h("circle", { cx: "12", cy: "12", r: "10" }), h("line", { x1: "12", y1: "16", x2: "12", y2: "12" }), h("line", { x1: "12", y1: "8", x2: "12.01", y2: "8" })),
          ),
          // exempt-ui01 navigation tab button
          h("button", { type: "button", "aria-pressed": mainTab === "mine", className: "nav-tab" + (mainTab === "mine" ? " active" : ""), onClick: onTabMine },
            h("span", null, tr("workshop.tabMine") || "我的 Skill"),
          ),
          // exempt-ui01 navigation tab button
          h("button", { type: "button", "aria-pressed": mainTab === "experts-market", className: "nav-tab" + (mainTab === "experts-market" ? " active" : ""), onClick: onTabExperts },
            h("span", null, tr("workshop.tabExpertsMarket") || defaultExpertTab),
          ),
        ),
        h("div", { className: "search-box" },
          h("svg", { className: "search-icon", viewBox: "0 0 24 24" }, h("path", { d: "M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 11.99 14 9.5 14z" })),
          h("input", { type: "text", value: searchQuery, placeholder: placeholderText, onChange: (e) => setSearchQuery(e.target.value), onKeyDown: onInputKeyDown }),
        ),
      );
    }

    function renderCategoryBar(opts) {
      const { category, setCategory, setMineCategory, setPage, workshopCategories, tr } = opts;
      const isZh = tr("locale") === "zh";
      return h("div", { className: "category-bar", "aria-label": tr("workshop.category") },
        workshopCategories.map((c) => {
          const isDrama = c.id === "短剧漫剧" && isZh;
          const label = isDrama ? "短剧/漫剧" : c.label;
          const onCatClick = () => { setCategory(c.id); setMineCategory(""); setPage(1); };
          // exempt-ui01 category selector button
          return h("button", { key: c.id, type: "button", className: "cat-btn" + (category === c.id ? " active" : ""), "aria-pressed": category === c.id, onClick: onCatClick }, label);
        }),
      );
    }

    function renderMineToolbar(opts) {
      const { mineCategory, setMineCategory, mineSource, setMineSource, availableSources, autoUpdate, setAutoUpdate, tr } = opts;
      const catAll = tr("workshop.catAll") || "全部";
      const nextMineCat = () => { const o = ["", ...WORKSHOP_DOMAIN_ORDER]; setMineCategory(o[(o.indexOf(mineCategory) + 1) % o.length]); };
      const nextMineSrc = () => { const o = ["", ...availableSources]; setMineSource(o[(o.indexOf(mineSource) + 1) % o.length]); };
      return h("div", { className: "mine-toolbar" },
        // exempt-ui01 mine category dropdown button
        h("button", { type: "button", className: "pill-dropdown", onClick: nextMineCat },
          h("span", null, (tr("workshop.catPrefix") || "分类 ") + (mineCategory || catAll)),
          h("span", { style: { fontSize: "10px" } }, "▾"),
        ),
        availableSources.length ?
          // exempt-ui01 mine source dropdown button
          h("button", { type: "button", className: "pill-dropdown", onClick: nextMineSrc },
            h("span", null, (tr("workshop.sourcePrefix") || "来源 ") + (mineSource || catAll)),
            h("span", { style: { fontSize: "10px" } }, "▾"),
          ) : null,
        h("div", { className: "auto-update-wrap" },
          h("span", null, tr("workshop.autoUpdate") || "自动更新"),
          h(WorkshopSwitch, { checked: autoUpdate, onChange: setAutoUpdate }),
        ),
      );
    }

    function renderFeaturedSection(opts) {
      const { featuredItems, tr, setOpen } = opts;
      if (!featuredItems || !(featuredItems.length > 0)) return null;
      return h("section", { className: "featured-section" },
        h("div", { className: "featured-title-bar", style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" } },
          h("h2", { className: "featured-title", style: { margin: 0 } }, tr("workshop.featuredTitle") || "官方精选"),
        ),
        h("div", { className: "featured-grid" },
          featuredItems.map((item) => renderFeaturedCard(item, { tr, onOpen: setOpen, onTry: safeTrySkillInSession, iconSrc, h })),
        ),
      );
    }

    function renderRegularStatus(statusOpts, tr) {
      const { status, page, err, count } = statusOpts;
      if (status === "loading" && page === 1) return h("p", { className: "sh-mkt-status" }, tr("mkt.loading"));
      if (status === "error") return h("p", { className: "sh-mkt-status" }, tr("mkt.error", { m: err }));
      if (status === "ready" && count === 0) return h("p", { className: "sh-mkt-status" }, tr("search.empty"));
      return null;
    }

    function renderRegularSection(opts) {
      const { hasQuery, regularItems, uninstalledOnly, setUninstalledOnly, status, page, err, tr, setOpen, onToggle } = opts;
      const titleKey = hasQuery ? "workshop.searchResults" : "workshop.otherTitle";
      const statusNode = renderRegularStatus({ status, page, err, count: regularItems.length }, tr);
      const onFilterClick = () => setUninstalledOnly(!uninstalledOnly);
      return h("section", { className: "regular-section" },
        h("div", { className: "regular-header" },
          h("div", { className: "regular-title-row" },
            h("span", null, tr(titleKey)),
            h("span", { className: "regular-title-count" }, " · " + regularItems.length),
          ),
          h("div", { className: "regular-controls" },
            h("div", { className: "filter-item" + (uninstalledOnly ? " checked" : ""), onClick: onFilterClick },
              h("div", { className: "filter-circle" }),
              h("span", null, tr("workshop.onlyUninstalled") || "仅显示未安装"),
            ),
            h("div", { className: "sort-btn" }, h("span", null, tr("workshop.sortRecent") || "排序: 最近")),
          ),
        ),
        statusNode,
        regularItems.length ? h("div", { className: "regular-grid" }, regularItems.map((item) => renderRegularCard(item, { tr, onOpen: setOpen, onToggle, h }))) : null,
      );
    }

    function renderExpertsTab(opts) {
      const { displayedExperts, tr, isEn, expertMarketToggling, onToggleExpert } = opts;
      const emptyMsg = isEn ? "No matching experts" : "没有匹配的专家";
      if (displayedExperts.length === 0) return h("div", { className: "sh-mkt-empty" }, tr("expert.empty") || emptyMsg);
      return h("div", { className: "expert-market-grid" }, displayedExperts.map((it) => renderExpertCard(it, { tr, isEn, expertMarketToggling, onToggle: onToggleExpert, h })));
    }

    function renderMineCardsList(filteredMine, opts) {
      const { tr, setOpen, handleSwitchToggle } = opts;
      if (!filteredMine.length) {
        const emptyPrompt = tr ? (tr("workshop.emptyMine") || "暂无已安装的 Skill") : "暂无已安装的 Skill";
        return h("p", { className: "sh-mkt-status" }, emptyPrompt);
      }
      return h("div", { className: "regular-grid" },
        filteredMine.map((it) => renderMineCard(it, { tr, onOpen: setOpen, onToggle: handleSwitchToggle, h })),
      );
    }

    function renderMineTab(opts) {
      const { mineToolbarOpts, filteredMine, setOpen, handleSwitchToggle, tr } = opts;
      return h("div", null,
        renderMineToolbar(mineToolbarOpts),
        renderMineCardsList(filteredMine, { tr, setOpen, handleSwitchToggle }),
      );
    }

    function renderDiscoverTab(opts) {
      const { featuredItems, featuredSectionOpts, category, hasQuery, regularSectionOpts, hasMore, onMore, tr } = opts;
      const btn = typeof Button !== "undefined" ? Button : "button";
      return h("div", null,
        featuredItems.length > 0 ? renderFeaturedSection(featuredSectionOpts) : null,
        category === "featured" && !hasQuery ? null : renderRegularSection(regularSectionOpts),
        hasMore ? h(btn, { size: "sm", variant: "outline", onClick: onMore }, tr("mkt.more")) : null,
      );
    }

    function renderPlazaTabContent(opts) {
      if (opts.isExpertTab) return renderExpertsTab(opts);
      if (opts.mainTab === "mine") return renderMineTab(opts);
      return renderDiscoverTab(opts);
    }

    function resolvePlazaSectionsData(opts) {
      const { state, tr, onToggleSwitch, onToggleExp } = opts;
      const sessions = typeof plazaSessions !== "undefined" ? plazaSessions : null;
      const activePreset = SkillShelf.resolveActivePreset({ sessions });
      const presetBinding = SkillShelf.getPresetSkillBinding(activePreset);
      const hasQuery = Boolean(state.submitted.trim());
      const { featured: featuredItems, regular: regularItems } = SkillShelf.plazaDiscoverySections(state.items, {
        category: state.category, query: state.submitted, uninstalledOnly: state.uninstalledOnly, installedItems: state.installedItems, presetBinding, customOrder: state.customOrder,
      });
      const isEn = tr("locale") === "en";
      const isExpertTab = state.mainTab === "experts-market";
      const { introHeading, introSubtitle, placeholderText } = resolveIntroTexts(state, tr, isEn, isExpertTab);
      const displayedExperts = filterDisplayedExperts(state.expertMarketItems, isExpertTab, state.searchQuery);
      const filteredMine = filterMineItems(state.installedItems, { category: state.category, presetBinding, mineCategory: state.mineCategory, mineSource: state.mineSource, searchQuery: state.searchQuery });
      const availableSources = Array.from(new Set(state.installedItems.map(extractItemSourceKey).filter(Boolean)));
      const workshopCategories = buildWorkshopCategories(presetBinding, tr);
      const onOpenInstall = () => state.setOpenInstallModal(true);
      const onSearchSubmit = () => { state.setSubmitted(state.searchQuery); state.setPage(1); };
      const tabContentOpts = {
        isExpertTab, displayedExperts, tr, isEn, expertMarketToggling: state.expertMarketToggling, onToggleExpert: onToggleExp,
        mainTab: state.mainTab, filteredMine, setOpen: state.setOpen, handleSwitchToggle: onToggleSwitch, category: state.category, hasQuery, hasMore: state.hasMore,
        onMore: () => state.setPage(state.page + 1),
        featuredItems,
        mineToolbarOpts: { mineCategory: state.mineCategory, setMineCategory: state.setMineCategory, mineSource: state.mineSource, setMineSource: state.setMineSource, availableSources, autoUpdate: state.autoUpdate, setAutoUpdate: state.setAutoUpdate, tr },
        featuredSectionOpts: { featuredItems, tr, setOpen: state.setOpen },
        regularSectionOpts: { hasQuery, regularItems, uninstalledOnly: state.uninstalledOnly, setUninstalledOnly: state.setUninstalledOnly, status: state.status, page: state.page, err: state.err, tr, setOpen: state.setOpen, onToggle: onToggleSwitch },
      };
      return {
        isExpertTab,
        introOpts: { introHeading, introSubtitle, isExpertTab, isEn, tr, onOpenInstall },
        navBarOpts: { mainTab: state.mainTab, setMainTab: state.setMainTab, setPage: state.setPage, searchQuery: state.searchQuery, setSearchQuery: state.setSearchQuery, placeholderText, onSearchSubmit, tr, isEn },
        categoryBarOpts: { category: state.category, setCategory: state.setCategory, setMineCategory: state.setMineCategory, setPage: state.setPage, workshopCategories, tr },
        tabContentOpts,
      };
    }

    function usePlazaExpertEffect(state) {
      useEffect(() => {
        if (state.mainTab !== "experts-market") return;
        const onListSuccess = (d) => {
          if (d && Array.isArray(d.items)) state.setExpertMarketItems(d.items);
        };
        api("expertMarketList").then(onListSuccess).catch(() => {});
      }, [state.mainTab, state.setExpertMarketItems]);
    }

    function mapInstalledRow(it) {
      return { ...it, installed: true, enabled: it.enabled !== false };
    }

    function usePlazaInstalledLoader(state) {
      const loadInstalled = useCallback(() => {
        const onListSuccess = (d) => {
          if (!d || !Array.isArray(d.items)) return;
          state.setInstalledItems(d.items.map(mapInstalledRow));
        };
        api("list").then(onListSuccess).catch(() => {});
      }, [state.setInstalledItems]);

      useEffect(() => { loadInstalled(); }, [loadInstalled]);
      return loadInstalled;
    }

    function resolvePlazaHooks() {
      const stateHook = typeof useState === "function" ? useState : null;
      const effectHook = typeof useEffect === "function" ? useEffect : null;
      const cbHook = typeof useCallback === "function" ? useCallback : null;
      return { useState: stateHook, useEffect: effectHook, useCallback: cbHook };
    }

    function resolvePlazaSearchDeps(effectHook) {
      return {
        api: typeof api === "function" ? api : null,
        apiCacheKey: typeof apiCacheKey === "function" ? apiCacheKey : null,
        apiCache: typeof apiCache !== "undefined" ? apiCache : null,
        API_CACHE_TTL_MS: typeof API_CACHE_TTL_MS !== "undefined" ? API_CACHE_TTL_MS : undefined,
        useEffect: effectHook,
      };
    }

    function renderPlazaModals(opts) {
      const { state, mark, loadInstalled, onCloseModal, onConfirm } = opts;
      const drawerNode = state.open ? h(Drawer, { item: state.open, onClose: () => state.setOpen(null), onInstalled: (it) => mark(it, true), onUninstalled: (it) => mark(it, false) }) : null;
      const installNode = h(InstallModal, { open: state.openInstallModal, onClose: () => state.setOpenInstallModal(false), onInstalled: (it) => { mark(it, true); loadInstalled(); } });
      const confirmNode = h(ConfirmInstallModal, { item: state.confirmInstallItem, onConfirm, error: state.confirmInstallError, installing: state.confirmInstalling, onClose: onCloseModal });
      return [drawerNode, installNode, confirmNode];
    }

    function SkillPlaza(props) {
      const tr = useTr();
      const hooks = resolvePlazaHooks();
      const state = usePlazaState((props && props.submittedQuery) ?? "", hooks);

      usePlazaExpertEffect(state);
      const loadInstalled = usePlazaInstalledLoader(state);
      usePlazaSearchEffect(state, resolvePlazaSearchDeps(hooks.useEffect));

      const apiFn = typeof api === "function" ? api : null;
      const mark = (item, installed) => updatePlazaItemInstalled(item, installed, state, updateInstalledItemsList);
      const onToggleSwitch = (item) => handleSwitchToggle(item, state, updateInstalledItemsList);
      const onToggleExp = (item) => executeToggleExpert(item, state, apiFn);
      const onConfirm = () => handleConfirmInstall(state.confirmInstallItem, state, mark, apiFn);
      const sections = resolvePlazaSectionsData({ state, tr, onToggleSwitch, onToggleExp, apiFn });
      const onCloseModal = () => { if (!state.confirmInstalling) { state.setConfirmInstallItem(null); state.setConfirmInstallError(""); } };
      const [drawerNode, installNode, confirmNode] = renderPlazaModals({ state, mark, loadInstalled, onCloseModal, onConfirm });

      return h("div", { className: "sh-mkt" },
        renderWorkshopIntro(sections.introOpts),
        renderPlazaNavBar(sections.navBarOpts),
        sections.isExpertTab ? null : renderCategoryBar(sections.categoryBarOpts),
        renderPlazaTabContent(sections.tabContentOpts),
        drawerNode,
        installNode,
        confirmNode,
      );
    }
