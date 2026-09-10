    function Toast({ text, onDone }) {
      useEffect(() => {
        const t = setTimeout(onDone, 1600);
        return () => clearTimeout(t);
      }, [text, onDone]);
      return h("div", { className: "sh-toast" }, text);
    }

    function Icon({ item, className }) {
      const src = iconSrc(item.iconUrl);
      if (src) return h("img", { className, src, alt: "" });
      return h("div", { className }, initials(item.name || item.slug));
    }

    function Cards({ items, onOpen }) {
      const tr = useTr();
      if (!items?.length) return h("div", { className: "sh-hint" }, tr("search.empty"));
      return h(
        "div",
        { className: "sh-cards" },
        items.map((item) => {
          const meta = [
            catLabel(item, tr),
            item.downloads ? tr("meta.downloads", { n: fmt(item.downloads, tr) }) : null,
            item.version ? "v" + item.version : null,
          ].filter(Boolean).join(" · ");
          return h(
            Button,
            {
              key: item.slug || item.id,
              type: "button",
              variant: "ghost",
              className: "sh-card" + (item.installed ? " on" : ""),
              onClick: () => onOpen(item),
            },
            h(Icon, { item, className: "sh-icon" }),
            h("div", { className: "sh-meta" },
              h("div", { className: "sh-top" },
                h("div", { className: "sh-title", title: item.name }, item.name),
                item.installed ? h("span", { className: "sh-badge" }, tr("badge.installed")) : null,
              ),
              item.description ? h("div", { className: "sh-desc" }, item.description) : null,
              h("div", { className: "sh-footline" }, meta || item.slug),
            ),
          );
        }),
      );
    }

    function TabBar({ tab, onChange }) {
      const tr = useTr();
      return h("div", { className: "sh-tabs", role: "tablist" },
        DETAIL_TABS.map((it) => h(Button, {
          key: it.id,
          type: "button",
          role: "tab",
          variant: "ghost",
          size: "sm",
          className: "sh-tab" + (tab === it.id ? " on" : ""),
          "aria-selected": tab === it.id,
          onClick: () => onChange(it.id),
        }, tr(it.labelKey))),
      );
    }

    function normVer(v) {
      return String(v || "").trim().replace(/^v/i, "");
    }

    function VersionsPane({ data, currentVersion, installed, busy, onInstall }) {
      const tr = useTr();
      const items = data?.versions || [];
      if (!items.length) return h("p", { className: "sh-hint" }, tr("ver.none"));
      return h("div", null, items.map((v, idx) => {
        const ver = normVer(v.version);
        const current = !!installed && !!ver && normVer(currentVersion) === ver;
        return h("div", { key: ver || idx, className: "sh-ver-card" },
          h("div", { className: "sh-ver-main" },
            h("div", { className: "sh-ver-head" },
              h("b", null, "v" + ver),
              idx === 0 ? h("span", { className: "sh-tag blue" }, tr("ver.latest")) : null,
              current ? h("span", { className: "sh-tag green" }, tr("ver.current")) : null,
            ),
            h("div", { className: "sh-hint" }, fmtTime(v.createdAt, tr) || tr("ver.unknownDate")),
            h("p", { className: "sh-ver-log" }, v.changelog || tr("ver.noLog")),
          ),
          h(Button, {
            type: "button",
            size: "sm",
            variant: current ? "outline" : "primary",
            disabled: !!busy || current || !ver,
            loading: busy === ver,
            onClick: () => onInstall(ver),
          }, current ? tr("ver.this") : tr("ver.install")),
        );
      }));
    }

    function radarPoints(values, cx, cy, r) {
      return values.map((v, i) => {
        const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
        const rr = r * Math.max(0, Math.min(1, Number(v) / 5));
        return (cx + Math.cos(a) * rr).toFixed(1) + "," + (cy + Math.sin(a) * rr).toFixed(1);
      }).join(" ");
    }

    function DimIcon({ letter }) {
      const svg = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
      if (letter === "T") return h("svg", svg, h("path", { d: "M12 3l8 4v5c0 5-3.4 8.4-8 9.5C7.4 20.4 4 17 4 12V7l8-4z" }));
      if (letter === "R") return h("svg", svg, h("path", { d: "M12 21V3M5 10l7-7 7 7" }));
      if (letter === "A") return h("svg", svg, h("circle", { cx: 12, cy: 12, r: 8 }), h("path", { d: "M12 8v8M8 12h8" }));
      if (letter === "C") return h("svg", svg, h("path", { d: "M5 4h11a3 3 0 010 6H5z" }), h("path", { d: "M5 10h12a3 3 0 010 6H8" }));
      return h("svg", svg, h("path", { d: "M13 3L5 14h7l-1 7 8-11h-7l1-7z" }));
    }

    function RadarChart({ scores }) {
      const cx = 90;
      const cy = 90;
      const r = 58;
      const full = TRACE.map(() => 5);
      return h("svg", { className: "sh-radar", viewBox: "0 0 180 180", width: 180, height: 180, "aria-hidden": "true" },
        [1, 2, 3, 4, 5].map((level) => h("polygon", {
          key: level,
          points: radarPoints(full.map(() => level), cx, cy, r),
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1,
        })),
        TRACE.map((d, i) => {
          const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
          return h("line", {
            key: d[0],
            x1: cx,
            y1: cy,
            x2: +(cx + Math.cos(a) * r).toFixed(1),
            y2: +(cy + Math.sin(a) * r).toFixed(1),
            stroke: "currentColor",
            strokeWidth: 1,
          });
        }),
        h("polygon", {
          points: radarPoints(scores, cx, cy, r),
          fill: "color-mix(in srgb, var(--dsw-alias-state-business-primary, #2563eb) 16%, transparent)",
          stroke: "var(--dsw-alias-state-business-primary, #2563eb)",
          strokeWidth: 1.6,
        }),
        TRACE.map((d, i) => {
          const a = -Math.PI / 2 + i * (Math.PI * 2 / 5);
          return h("text", {
            key: "l" + d[0],
            x: +(cx + Math.cos(a) * (r + 16)).toFixed(1),
            y: +(cy + Math.sin(a) * (r + 16)).toFixed(1),
            textAnchor: "middle",
            dominantBaseline: "middle",
            fontSize: 12,
            fontWeight: 700,
            fill: d[4],
          }, d[1]);
        }),
      );
    }

    function evalGrade(score, tr) {
      const n = Number(score);
      if (!Number.isFinite(n)) return "";
      const tx = tr || lookup;
      if (n >= 4.5) return tx("grade.excellent");
      if (n >= 4) return tx("grade.good");
      if (n >= 3) return tx("grade.fair");
      return tx("grade.poor");
    }

    function StarIcon({ filled, size = 12 }) {
      return h("svg", {
        className: "sh-star-ico" + (filled ? " on" : ""),
        width: size,
        height: size,
        viewBox: "0 0 24 24",
        fill: filled ? "currentColor" : "none",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        "aria-hidden": "true",
      }, h("polygon", { points: "12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" }));
    }

    function StarGroup({ score }) {
      const n = Math.max(0, Math.min(5, Math.round(Number(score) || 0)));
      return h("span", { className: "sh-stars", "aria-hidden": "true" },
        [0, 1, 2, 3, 4].map((i) => h(StarIcon, { key: i, filled: i < n }))
      );
    }

    function isSafeItem(item) {
      const reports = [item?.security?.keen, item?.security?.sanbu].filter(Boolean);
      if (reports.some((r) => r.status === "malicious" || r.status === "suspicious")) return false;
      if (reports.some((r) => r.status === "benign")) return true;
      return !!(item?.integrity?.signed || item?.integrity?.contentHash);
    }

    function Marks({ item, detail }) {
      const tr = useTr();
      const grade = evalGrade(item.rating, tr);
      const rate = item.rating != null && Number.isFinite(Number(item.rating));
      const bluev = detail && item.verified;
      const safe = detail && isSafeItem(item);
      if (!rate && !bluev && !safe) return null;
      return h("div", { className: "sh-marks" },
        rate ? h("span", { className: "sh-rate", title: tr("rate.ai") },
          h(StarGroup, { score: item.rating }),
          " " + Number(item.rating).toFixed(1),
          grade ? " " + grade : "",
          detail ? " (" + tr("rate.ai") + ")" : "",
        ) : null,
        bluev ? h("span", { className: "sh-bluev", title: item.publisherName || tr("verified.account") },
          h("i", { "aria-hidden": "true" }, "v"),
          h("span", null, item.publisherName || tr("verified")),
        ) : null,
        safe ? h("span", { className: "sh-safe", title: tr("sec.badge") },
          h(ShieldIcon),
          tr("sec.badge"),
        ) : null,
      );
    }

    function ShieldIcon() {
      return h("svg", { className: "sh-sec-ico", viewBox: "0 0 20 20", fill: "none", "aria-hidden": "true" },
        h("path", {
          d: "M3.15 2.35 10 .83l6.85 1.52c.38.09.65.42.65.82v8.32c0 1.67-.84 3.23-2.23 4.16L10 19.17l-5.27-3.52C3.34 14.72 2.5 13.16 2.5 11.49V3.17c0-.39.27-.73.65-.82Zm7.68 5.98V4.17L6.67 10h2.5v4.17L13.33 8.33H10.83Z",
          fill: "url(#shShield)",
        }),
        h("defs", null,
          h("linearGradient", { id: "shShield", x1: "10", y1: "0.83", x2: "10", y2: "19.17", gradientUnits: "userSpaceOnUse" },
            h("stop", { stopColor: "var(--dsw-alias-state-success-secondary, #A6E527)" }),
            h("stop", { offset: "1", stopColor: "var(--dsw-alias-state-success-primary, #0CBF5B)" }),
          ),
        ),
      );
    }

    function EvaluationPane({ data }) {
      const tr = useTr();
      const ev = data?.evaluation;
      if (!ev) return h("p", { className: "sh-hint" }, tr("eval.none"));
      const scores = TRACE.map((d) => Number(ev.dimensions?.[d[0]]?.score) || 0);
      const grade = evalGrade(ev.score, tr);
      return h("div", null,
        h("div", { className: "sh-eval-hero" },
          h(RadarChart, { scores }),
          h("div", null,
            h("div", { className: "sh-eval-score" }, (ev.score != null ? ev.score : "-"), h("span", null, " / 5")),
            grade ? h("div", { className: "sh-eval-tag" }, tr("eval.grade", { g: grade })) : null,
            ev.userSummary ? h("p", { className: "sh-eval-sum" }, ev.userSummary) : null,
          ),
        ),
        h("div", { className: "sh-eval-h" }, tr("eval.detail")),
        TRACE.map((d) => {
          const dim = ev.dimensions?.[d[0]];
          const score = dim?.score;
          const barStyle = {
            "--bar-pct": ((Number(score) || 0) / 5 * 100) + "%",
            "--bar-tint": d[4],
          };
          return h("div", { key: d[0], className: "sh-eval-item", style: barStyle },
            h("div", { className: "sh-eval-top" },
              h("div", { className: "sh-eval-ico" }, h(DimIcon, { letter: d[1] })),
              h("div", { className: "sh-eval-name" }, d[1] + " · " + d[2] + " " + tr("dim." + d[0])),
              h("div", { className: "sh-eval-sc" }, (score == null ? "-" : score) + " / 5"),
            ),
            h("div", { className: "sh-eval-bar" }, h("span")),
            dim?.userReason ? h("p", { className: "sh-eval-why" }, dim.userReason) : null,
          );
        }),
      );
    }

    function DetailSwitch({ checked, onChange, disabled }) {
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

    function DetailCard({ item, onClose, onInstalled, onUninstalled }) {
      const tr = useTr();
      const [toast, setToast] = useState("");
      const [working, setWorking] = useState("");
      const [view, setView] = useState(item);
      const [confirmUninstall, setConfirmUninstall] = useState(false);
      const [fileTree, setFileTree] = useState([]);
      const [selectedFile, setSelectedFile] = useState("SKILL.md");
      const [skillMd, setSkillMd] = useState("");
      const [metaYaml, setMetaYaml] = useState("");
      const [copied, setCopied] = useState(false);
      const [moreMenuOpen, setMoreMenuOpen] = useState(false);
      const [refDirOpen, setRefDirOpen] = useState(false);

      useEffect(() => { setView(item); }, [item]);

      useEffect(() => {
        let live = true;
        const slug = item.slug || item.token || item.skillKey || item.skill || "";
        if (!slug) return undefined;
        api("detail", { slug })
          .then((d) => {
            if (!live || !d) return;
            const card = (d.card && typeof d.card === "object") ? d.card : {};
            setView((cur) => ({
              ...cur,
              ...card,
              installed: d.installed ?? cur.installed,
              version: d.version || card.version || cur.version,
              description: card.description || cur.description,
              source: d.source || cur.source,
            }));
          })
          .catch(() => {});

        api("skillContent", { slug })
          .then((d) => {
            if (!live || !d) return;
            if (d && d.found) {
              setFileTree(d.tree || []);
              setSkillMd(d.skillMd || "");
              setMetaYaml(d.metaYaml || "");
            } else {
              setFileTree([
                { name: "references", isDir: true, children: ["overview.md"] },
                { name: "meta.yaml", isDir: false },
                { name: "SKILL.md", isDir: false },
              ]);
            }
          })
          .catch(() => {});
        return () => { live = false; };
      }, [item.slug, item.token, item.skillKey, item.skill]);

      const handleInstall = async () => {
        setWorking("install");
        const slug = item.slug || item.token || item.skillKey || item.skill || "";
        try {
          await api("install", { slug, catalogId: item.catalogId || item.id });
          setView((cur) => ({ ...cur, installed: true, enabled: true }));
          item.installed = true;
          item.enabled = true;
          onInstalled?.(item);
          const displayName = typeof skillTitle === "function" ? skillTitle(view, tr) : (view.name || view.title || item.name || slug);
          setToast(tr("toast.installed", { name: displayName }));
        } catch (e) {
          setToast(e.message || String(e));
        } finally {
          setWorking("");
        }
      };

      const handleUninstall = async () => {
        setWorking("uninstall");
        const slug = item.slug || item.token || item.skillKey || item.skill || "";
        try {
          await api("uninstall", { slug });
          setView((cur) => ({ ...cur, installed: false }));
          item.installed = false;
          onUninstalled?.(item);
          const displayName = typeof skillTitle === "function" ? skillTitle(view, tr) : (view.name || view.title || item.name || slug);
          setToast(tr("toast.uninstalled", { name: displayName }));
          setConfirmUninstall(false);
          setMoreMenuOpen(false);
        } catch (e) {
          setToast(e.message || String(e));
        } finally {
          setWorking("");
        }
      };

      const handleToggleEnable = () => {
        const next = view.enabled === false;
        setView((cur) => ({ ...cur, enabled: next }));
        item.enabled = next;
      };

      const handleTry = () => {
        trySkillInSession(view);
        onClose();
      };

      const handleShare = () => {
        const slug = view.slug || view.skill || view.id || "";
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          navigator.clipboard.writeText("/" + slug).catch(() => {});
        }
        setToast("已复制技能指令: /" + slug);
      };

      const rawTitle = typeof skillTitle === "function" ? skillTitle(view, tr) : (view.name || view.title || item.slug || "");
      const title = typeof rawTitle === "object" ? (rawTitle.name || rawTitle.title || item.slug || "") : String(rawTitle || "");
      const rawDesc = typeof skillDesc === "function" ? skillDesc(view, tr) : (view.description || view.summary || "暂无描述");
      const desc = typeof rawDesc === "object" ? JSON.stringify(rawDesc) : String(rawDesc || "暂无描述");
      const category = catLabel(view, tr) || "通用";
      const isInstalled = Boolean(view.installed);
      const isEnabled = view.enabled !== false;
      const slug = view.slug || view.token || view.skillKey || view.skill || "";

      // 提取阶段标签 Badges (如: 动画 / 计划制定)
      const badges = [];
      if (Array.isArray(view.tags) && view.tags.length) {
        for (const t of view.tags) {
          if (t === "精选") continue;
          badges.push(String(t).includes("/") ? String(t) : (category + " / " + String(t)));
        }
      }
      if (!badges.length && category) {
        badges.push(category);
      }

      // 解析 YAML frontmatter 和 Markdown 正文
      let yamlText = metaYaml;
      let markdownBody = skillMd;
      if (skillMd) {
        const match = skillMd.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
        if (match) {
          if (!yamlText) yamlText = match[1].trim();
          markdownBody = match[2].trim();
        }
      }
      if (!yamlText) {
        yamlText = "name: " + slug + "\ndescription: |\n  " + (view.summaryEn || view.summary || desc).slice(0, 160) + "\ntrigger-words: [" + (view.tags || []).join(", ") + "]";
      }
      if (!markdownBody) {
        markdownBody = "# " + (view.titleEn || title) + "\n\n" + (view.summaryEn || desc) + "\n\n### STEP 1: Intake and Lock the Core Brief\nConfirm the premise, target length, aspect ratio, and audio mode before creating assets.";
      }

      const handleCopyYaml = () => {
        const toCopy = selectedFile === "meta.yaml" ? yamlText : (yamlText || skillMd);
        if (typeof navigator !== "undefined" && navigator.clipboard) {
          navigator.clipboard.writeText(toCopy).catch(() => {});
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      };

      // 解析 Markdown 简单块
      const mdElements = [];
      const lines = markdownBody.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        if (line.startsWith("### ")) {
          mdElements.push(h("h3", { key: "h3-" + i }, line.slice(4)));
        } else if (line.startsWith("## ")) {
          mdElements.push(h("h2", { key: "h2-" + i }, line.slice(3)));
        } else if (line.startsWith("# ")) {
          mdElements.push(h("h1", { key: "h1-" + i }, line.slice(2)));
        } else if (line.startsWith("- ") || line.startsWith("* ")) {
          mdElements.push(h("li", { key: "li-" + i }, line.slice(2)));
        } else {
          mdElements.push(h("p", { key: "p-" + i }, line));
        }
      }

      // 文件列表
      const treeItems = [];
      // 文件夹 references
      treeItems.push(
        h("div", {
          key: "tree-ref-dir",
          className: "ws-tree-node",
          onClick: () => setRefDirOpen(!refDirOpen),
        },
          h("svg", {
            width: "12",
            height: "12",
            viewBox: "0 0 24 24",
            fill: "none",
            stroke: "currentColor",
            strokeWidth: "2",
            style: { transform: refDirOpen ? "rotate(90deg)" : "none", transition: "transform .15s" },
          }, h("polyline", { points: "9 18 15 12 9 6" })),
          h("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" },
            h("path", { d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" }),
          ),
          h("span", null, "references"),
        ),
      );
      if (refDirOpen) {
        treeItems.push(
          h("div", {
            key: "tree-ref-sub",
            className: "ws-tree-node ws-tree-sub" + (selectedFile === "overview.md" ? " active" : ""),
            onClick: () => setSelectedFile("overview.md"),
          },
            h("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" },
              h("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }),
              h("polyline", { points: "14 2 14 8 20 8" }),
            ),
            h("span", null, "overview.md"),
          ),
        );
      }
      // meta.yaml
      treeItems.push(
        h("div", {
          key: "tree-meta-yaml",
          className: "ws-tree-node" + (selectedFile === "meta.yaml" ? " active" : ""),
          onClick: () => setSelectedFile("meta.yaml"),
        },
          h("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" },
            h("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }),
            h("polyline", { points: "14 2 14 8 20 8" }),
          ),
          h("span", null, "meta.yaml"),
        ),
      );
      // SKILL.md
      treeItems.push(
        h("div", {
          key: "tree-skill-md",
          className: "ws-tree-node" + (selectedFile === "SKILL.md" ? " active" : ""),
          onClick: () => setSelectedFile("SKILL.md"),
        },
          h("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" },
            h("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }),
            h("polyline", { points: "14 2 14 8 20 8" }),
          ),
          h("span", null, "SKILL.md"),
        ),
      );

      return h("div", { className: "modal-dialog ws-detail-dialog", role: "dialog", "aria-modal": "true" },
        // 顶部 Header 栏
        h("div", { className: "ws-detail-header-row" },
          h("div", { className: "ws-detail-header-left" },
            h("h3", { className: "ws-detail-header-title" }, title),
            h("div", { className: "ws-detail-badges" },
              badges.map((b, idx) => h("span", { key: "b-" + idx, className: "ws-detail-badge" }, b)),
            ),
          ),
          h("button", {
            type: "button",
            className: "modal-close-btn",
            "aria-label": tr("action.close"),
            onClick: onClose,
          },
            h("svg", { width: "18", height: "18", viewBox: "0 0 24 24" },
              h("line", { x1: "18", y1: "6", x2: "6", y2: "18", stroke: "currentColor", strokeWidth: "2" }),
              h("line", { x1: "6", y1: "6", x2: "18", y2: "18", stroke: "currentColor", strokeWidth: "2" }),
            ),
          ),
        ),
        // 简短描述段落
        h("p", { className: "ws-detail-desc" }, desc),
        // 主体分栏：左树右内容
        h("div", { className: "ws-detail-main" },
          h("div", { className: "ws-detail-tree" }, treeItems),
          h("div", { className: "ws-detail-content" },
            selectedFile === "meta.yaml" ? (
              h("div", { className: "ws-code-card" },
                h("div", { className: "ws-code-header" },
                  h("span", { className: "ws-code-lang" }, "YAML"),
                  h("button", { type: "button", className: "ws-code-copy", onClick: handleCopyYaml },
                    copied ? h("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5" }, h("polyline", { points: "20 6 9 17 4 12" })) : h("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, h("rect", { x: "9", y: "9", width: "13", height: "13", rx: "2", ry: "2" }), h("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" })),
                    h("span", null, copied ? "已复制" : "复制"),
                  ),
                ),
                h("pre", { className: "ws-code-pre" }, yamlText),
              )
            ) : (
              h("div", null,
                h("div", { className: "ws-code-card" },
                  h("div", { className: "ws-code-header" },
                    h("span", { className: "ws-code-lang" }, "YAML"),
                    h("button", { type: "button", className: "ws-code-copy", onClick: handleCopyYaml },
                      copied ? h("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2.5" }, h("polyline", { points: "20 6 9 17 4 12" })) : h("svg", { width: "13", height: "13", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" }, h("rect", { x: "9", y: "9", width: "13", height: "13", rx: "2", ry: "2" }), h("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" })),
                      h("span", null, copied ? "已复制" : "复制"),
                    ),
                  ),
                  h("pre", { className: "ws-code-pre" }, yamlText),
                ),
                h("div", { className: "ws-markdown-body" }, mdElements),
              )
            ),
          ),
        ),
        // 底部状态与操作栏
        h("div", { className: "ws-detail-footer" },
          h("div", { className: "ws-footer-status" },
            h(DetailSwitch, {
              checked: isInstalled && isEnabled,
              onChange: isInstalled ? handleToggleEnable : handleInstall,
            }),
            h("span", null, isInstalled ? (isEnabled ? "已启用" : "已停用") : "未安装"),
          ),
          h("div", { className: "ws-footer-actions" },
            h(Button, { size: "sm", variant: "outline", onClick: handleShare },
              h("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", style: { marginRight: "4px" } },
                h("circle", { cx: "18", cy: "5", r: "3" }),
                h("circle", { cx: "6", cy: "12", r: "3" }),
                h("circle", { cx: "18", cy: "19", r: "3" }),
                h("line", { x1: "8.59", y1: "13.51", x2: "15.42", y2: "17.49" }),
                h("line", { x1: "15.41", y1: "6.51", x2: "8.59", y2: "10.49" }),
              ),
              "分享",
            ),
            h(Button, { size: "sm", variant: "primary", onClick: isInstalled ? handleTry : handleInstall, loading: working === "install" },
              h("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", style: { marginRight: "4px" } },
                h("path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }),
              ),
              isInstalled ? tr("workshop.try") : tr("action.install"),
            ),
            h("div", { className: "ws-more-menu-wrap" },
              h(Button, { size: "sm", variant: "outline", onClick: () => setMoreMenuOpen(!moreMenuOpen) },
                h("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2" },
                  h("circle", { cx: "12", cy: "5", r: "1.5" }),
                  h("circle", { cx: "12", cy: "12", r: "1.5" }),
                  h("circle", { cx: "12", cy: "19", r: "1.5" }),
                ),
              ),
              moreMenuOpen ? (
                h("div", { className: "ws-more-menu" },
                  h("button", {
                    type: "button",
                    className: "ws-more-item",
                    onClick: () => {
                      if (typeof navigator !== "undefined" && navigator.clipboard) {
                        navigator.clipboard.writeText(slug).catch(() => {});
                      }
                      setToast("已复制标识: " + slug);
                      setMoreMenuOpen(false);
                    },
                  }, "复制标识"),
                  isInstalled ? (
                    h("button", {
                      type: "button",
                      className: "ws-more-item danger",
                      onClick: handleUninstall,
                    }, "卸载技能")
                  ) : null,
                )
              ) : null,
            ),
          ),
        ),
        toast ? h(Toast, { text: toast, onDone: () => setToast("") }) : null,
      );
    }

    const overlayStack = [];
    function Overlay({ children, onClose }) {
      useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        overlayStack.push(onClose);
        const onKey = (e) => {
          if (e.key !== "Escape") return;
          if (overlayStack[overlayStack.length - 1] !== onClose) return;
          e.preventDefault();
          e.stopImmediatePropagation();
          onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => {
          const i = overlayStack.lastIndexOf(onClose);
          if (i >= 0) overlayStack.splice(i, 1);
          document.body.style.overflow = overlayStack.length ? "hidden" : prev;
          window.removeEventListener("keydown", onKey);
        };
      }, [onClose]);
      const portaled = createPortal !== fallbackPortal;
      const hostRef = React.useRef(null);
      useEffect(() => {
        if (portaled) return;
        const el = hostRef.current;
        if (!el) return;
        document.body.appendChild(el);
        return () => { el.remove(); };
      }, [portaled]);
      const overlay = h("div", { ref: portaled ? undefined : hostRef, className: "sh-overlay", onClick: (e) => { if (e.target === e.currentTarget) onClose(); } }, children);
      return portaled && typeof document !== "undefined" ? createPortal(overlay, document.body) : overlay;
    }

    function Drawer({ item, onClose, onInstalled, onUninstalled }) {
      return h(Overlay, { onClose },
        h(DetailCard, { item, onClose, onInstalled, onUninstalled }),
      );
    }
