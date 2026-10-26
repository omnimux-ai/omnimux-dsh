    function parseToolArgs(props) {
      const block = props?.block;
      // rc.3 把运行中的调用按阶段拆开：只有已派发（phase === 'start'）才带原始参数，
      // preparing 阶段还没有；已结算的结果则把参数留在配对的调用头上。
      // 旧写法按"有没有 kind"判断，会把运行中的块当成结算块，导致参数永远为空。
      const settled = !!block && "kind" in block && block.kind === "tool-result";
      const raw = (settled ? block.call?.argsRaw : block?.phase === "start" ? block.argsRaw : "") || "";
      if (!raw || typeof raw !== "string") return {};
      try { return JSON.parse(raw); } catch { return {}; }
    }

    function contentText(node) {
      if (!node) return "";
      if (typeof node === "string") return node;
      if (Array.isArray(node)) return node.map(contentText).join("\n");
      if (typeof node === "object") {
        if (typeof node.text === "string") return node.text;
        if (node.content) return contentText(node.content);
      }
      return "";
    }

    function pickPayload(props) {
      const found = [];
      const visit = (node, depth) => {
        if (!node || depth > 6) return;
        if (typeof node === "string") {
          const t = node.trim();
          if ((t.startsWith("{") || t.startsWith("[")) && t.length > 8) {
            try { visit(JSON.parse(t), depth + 1); } catch { /* ignore */ }
          }
          return;
        }
        if (typeof node !== "object") return;
        if (Array.isArray(node)) {
          for (const x of node) visit(x, depth + 1);
          return;
        }
        if (Array.isArray(node.items)) found.push(node);
        for (const key of ["block", "meta", "result", "resultView", "view", "data", "value", "payload", "content", "message"]) {
          if (node[key] != null) visit(node[key], depth + 1);
        }
      };
      visit(props, 0);
      const block = props?.block;
      visit(block?.meta, 1);
      visit(block?.content, 1);
      visit(block?.resultView, 1);
      visit(contentText(block?.content), 1);
      return found.find((x) => Array.isArray(x.items) && x.items.length) || found[0] || null;
    }

    function SearchToolView(props) {
      useEffect(() => ensureCss(), []);
      const payload = pickPayload(props);
      const args = parseToolArgs(props);
      const query = String(payload?.query || args.query || "").trim();
      const fromTool = Array.isArray(payload?.items) && payload.items.length ? payload.items : null;
      const running = !!(props?.block && !("kind" in props.block));
      const [items, setItems] = useState(fromTool || []);
      const [err, setErr] = useState("");
      const [open, setOpen] = useState(null);
      useEffect(() => {
        if (fromTool) setItems(fromTool);
      }, [fromTool]);
      useEffect(() => {
        if (fromTool || running) return;
        let live = true;
        api("search", { query, queries: args.queries, category: args.category, offset: args.offset, limit: args.limit })
          .then((d) => { if (live) setItems(d.items || []); })
          .catch((e) => { if (live) { setItems([]); setErr(e.message || String(e)); } });
        return () => { live = false; };
      }, [query, running, !!fromTool]);
      if (running || !items.length) return err ? h("div", { className: "sh-err" }, err) : null;
      const mark = (item, installed) => {
        setItems((cur) => cur.map((it) => it.slug === item.slug ? { ...it, installed } : it));
        setOpen((cur) => cur && cur.slug === item.slug ? { ...cur, installed } : cur);
      };
      const tr = typeof props.t === "function" ? props.t : lookup;
      return h(I18nProvider, { t: tr },
        h("div", { className: "sh-root sh-tool" },
          h("div", { className: "sh-hint" }, tr("search.hint", { n: items.length })),
          h(Cards, { items, onOpen: setOpen }),
          open ? h(Drawer, {
            item: open,
            onClose: () => setOpen(null),
            onInstalled: (it) => mark(it, true),
            onUninstalled: (it) => mark(it, false),
          }) : null,
        ),
      );
    }

    let plazaSessions = null;

    function plazaOfferKey(sessionId) {
      return "omnimux-market:plaza:" + String(sessionId || "");
    }

    function readPlazaOffer(sessionId) {
      if (!sessionId || typeof sessionStorage === "undefined") return "";
      try { return sessionStorage.getItem(plazaOfferKey(sessionId)) || ""; } catch { return ""; }
    }

    function writePlazaOffer(sessionId, value) {
      if (!sessionId || typeof sessionStorage === "undefined") return;
      try { sessionStorage.setItem(plazaOfferKey(sessionId), value); } catch { /* quota */ }
    }

    function currentSessionId(sessions) {
      try {
        return sessions?.list?.getSnapshot?.()?.current || "";
      } catch {
        return "";
      }
    }

    function blockText(block) {
      if (!block) return "";
      if (typeof block === "string") return block;
      if (typeof block.text === "string") return block.text;
      if (Array.isArray(block.content)) return block.content.map(blockText).join("");
      return "";
    }

    /** 会话最后一条用户原文，截 500。路径：session.getSnapshot().nodes 中 kind=user 的 content[].text */
    function lastUserExcerpt(face) {
      try {
        const snap = typeof face.getSnapshot === "function" ? face.getSnapshot() : null;
        const nodes = snap?.nodes || snap?.chat?.legacy?.nodes || [];
        const list = Array.isArray(nodes) ? nodes : [];
        for (let i = list.length - 1; i >= 0; i--) {
          const node = list[i];
          if (!node || node.kind !== "user") continue;
          const text = (node.content || []).map(blockText).join("").trim();
          if (text) return text.slice(0, 500);
        }
      } catch { /* snapshot 形状因 rc 可能变 */ }
      return "";
    }

    function findSendButton() {
      if (typeof document === "undefined") return null;
      return document.querySelector(
        'button[aria-label="发送消息"], button[aria-label="Send message"], button[aria-label="Send"]',
      );
    }

    /**
     * 方案 B：官方 session.prompt(..., "queue")。失败再 insertGesture + 点发送；再失败 toast。
     * Host 零用户消息。mode 只用 queue，禁用 steer。成功仍 insertGesture。
     */
    async function sendPlazaFollowUp({ sessions, skill, excerpt }) {
      const id = sessions.list.getSnapshot().current;
      const face = id && sessions.binding(id)?.session;
      const text = excerpt
        ? `/${skill} 继续当前任务：${excerpt}`
        : `/${skill} 继续当前任务`;
      const gesture = `/${skill}`;
      const writeGesture = () => {
        const field = findComposer();
        if (field instanceof HTMLTextAreaElement || field instanceof HTMLInputElement) {
          return insertGesture(field, gesture);
        }
        return false;
      };
      try {
        if (!face || typeof face.prompt !== "function") throw new Error("no session face");
        const result = await face.prompt([{ type: "text", text }], "queue");
        if (result && result.ok === false) throw new Error(result.error?.message || "prompt refused");
        writeGesture();
        return { ok: true, via: "prompt" };
      } catch {
        const wrote = writeGesture();
        const send = findSendButton();
        if (wrote && send instanceof HTMLElement && !send.disabled) {
          try {
            send.click();
            return { ok: true, via: "click" };
          } catch { /* toast */ }
        }
        return { ok: false, via: "toast" };
      }
    }

    /**
     * 对话内专家选择走官方 ask_user_question 输入区选项卡。
     * 货架卡会跟选项卡叠层，这里故意不渲染。座仍注册，避免 key 丢失。
     */
    function PlazaSearchToolView() {
      return null;
    }
