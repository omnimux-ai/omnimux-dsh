    // 模型选择器：默认自动，可手动选择模型。
    // 勾选模型后关闭自动，并在输入框胶囊展示「模型图标 + 名称」。
    // 复用画布插件（omnimux-workflow）的模型品牌图标系统与设计规范。

    const BRAND_SVGS = {
      openai: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.0993 3.8558L12.6 8.3829l2.02-1.1638a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.1408 1.6465 4.4708 4.4708 0 0 1 .5765 3.0137zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997z"/></svg>`,
      bytedance: `<svg width="24" height="24" viewBox="0 0 24 25" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22.0004 4.62844L18.542 3.75781V21.2425L22.0004 20.3278V4.62844Z" fill="currentColor"/><path d="M1.99902 20.1939L5.42937 19.3073L5.44542 5.56984L1.99902 4.69922V20.1939Z" fill="currentColor"/><path d="M16.1213 9.26561C15.2507 9.43412 14.2998 9.75509 13.4252 9.97174C13.3048 10.0038 13.0962 9.93563 13.0521 10.068L13.04 17.5947L16.4985 18.4613V9.27765C16.4985 9.17735 16.1895 9.25358 16.1213 9.26561Z" fill="currentColor"/><path d="M7.49609 11.582V20.7336L7.60041 20.7657L10.9264 19.9312L10.9465 12.3925L7.80904 11.6583L7.49609 11.582Z" fill="currentColor"/></svg>`,
      google: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="currentColor"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="currentColor"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="currentColor"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="currentColor"/></svg>`,
      dreamina: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M 6.8 2 C 7 7 9 10 14 10.6 L 21 10.6 C 17.5 13 15 15.5 14.2 18.2 C 10 20.5 6.5 21.5 3 22 C 4.5 17 6 12 6.8 2 Z"/></svg>`,
      nanobanana: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 17.5a7.5 7.5 0 1 1 7.5-7.5 7.5 7.5 0 0 1-7.5 7.5zm0-11a3.5 3.5 0 1 0 3.5 3.5A3.5 3.5 0 0 0 12 8.5zm0 5a1.5 1.5 0 1 1 1.5-1.5 1.5 1.5 0 0 1-1.5 1.5z"/></svg>`,
      seedream: `<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><rect x="4.5" y="8" width="3.5" height="10" rx="1.75"/><rect x="10.25" y="4" width="3.5" height="16" rx="1.75"/><rect x="16" y="8" width="3.5" height="10" rx="1.75"/></svg>`,
      alibaba: `<svg width="24" height="24" viewBox="0 0 24 25" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10.3746 20.1092L5.16567 20.1062C5.04656 20.1039 4.94147 20.0419 4.85439 19.9666L3.4196 17.4835C3.34553 17.3048 3.33903 17.2085 3.41084 17.0267C3.72813 16.3438 4.29864 15.6458 4.59266 14.9689C4.61142 14.9256 4.6427 14.888 4.62468 14.8358L2.04987 10.351C1.95954 10.1332 2.00132 10.0117 2.10016 9.81354C2.50302 9.0051 3.06378 8.21279 3.49091 7.41191C3.588 7.3194 3.70561 7.26697 3.84098 7.26092L6.30019 7.25764L8.95533 2.64194C9.04466 2.57237 9.12649 2.53632 9.24034 2.52598C10.1537 2.4438 11.1886 2.58825 12.1144 2.5285C12.239 2.56455 12.3501 2.63766 12.4245 2.74505L13.6708 4.88929L18.8415 4.89307C18.9691 4.90189 19.0967 4.95786 19.1773 5.05844C19.5929 5.85554 20.1662 6.64381 20.557 7.44595C20.6321 7.59997 20.6796 7.68543 20.6416 7.86718L19.3815 10.1385L21.9971 14.7338L22.0006 14.9778C21.598 15.7376 21.1793 16.5127 20.7322 17.2508C20.5875 17.4896 20.5097 17.7099 20.1914 17.7386C19.4285 17.8074 18.5632 17.6864 17.789 17.7361L17.7157 17.7631L15.0668 22.3473C14.9838 22.4277 14.9062 22.4622 14.7918 22.473C13.8893 22.5585 12.8563 22.406 11.9398 22.4733C11.8124 22.4637 11.6805 22.3863 11.608 22.2787L10.3746 20.109V20.1092ZM9.27862 7.76509L10.6266 5.38514L9.30339 3.03066L6.73458 7.50468L8.22017 10.1032L8.89002 10.1334L18.7864 10.1284L20.1527 7.76509H9.27862ZM6.57894 7.76509H3.87926L9.27862 17.2591H6.55392L5.22898 19.601C5.57454 19.6073 5.9216 19.5937 6.26741 19.6003C6.33297 19.6015 6.39378 19.6265 6.46509 19.6277C7.7565 19.6474 9.05242 19.6252 10.3416 19.6033L10.3806 19.5851L11.8482 17.0161L6.57894 7.76509ZM18.8152 14.8669H21.5024L18.9486 10.3883L15.9524 10.3964L10.6631 19.6013L12.0278 21.9684L17.428 12.4995L18.815 14.8666L18.8152 14.8669Z" fill="currentColor"/></svg>`,
      minimax: `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="2.5" y="2.5" width="19" height="19" rx="4.5" stroke="currentColor" stroke-width="1.8"/><path d="M7 16.5V7.5L12 12.5L17 7.5V16.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
      grok: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24"><path fill="currentColor" d="M4.94 4.96a9.97 9.97 0 0 1 10.835-2.182a8.7 8.7 0 0 1 2.033 1.11l-3.006 1.39C12.003 4.101 8.797 4.9 6.84 6.86c-2.564 2.565-3.146 6.954-.36 9.922l.278.284L.124 23c1.875-1.973 3.771-4.427 2.636-7.19c-1.52-3.698-.635-8.03 2.18-10.85M23.9.1c-2.264 3.174-3.184 5.389-2.197 9.64l-.007-.007c.753 3.201-.052 6.75-2.653 9.355c-3.279 3.285-8.526 4.016-12.847 1.06L9.21 18.75c2.758 1.084 5.775.607 7.943-1.564c2.169-2.17 2.655-5.332 1.566-7.963c-.207-.5-.828-.625-1.263-.304L8.59 15.472l12.7-12.77v.01z"/></svg>`,
    };

    function resolveModelBrand(modelId) {
      if (!modelId || typeof modelId !== "string") return "bytedance";
      const id = modelId.trim().toLowerCase();
      if (BRAND_SVGS[id]) return id;
      if (/(^seedance|^dreamina)/i.test(id)) return "dreamina";
      if (/(^seedream)/i.test(id)) return "seedream";
      if (/(^nanobanana|nano[- ]?banana)/i.test(id)) return "nanobanana";
      if (/(^gpt|^openai)/i.test(id)) return "openai";
      if (/(^google|^gemini)/i.test(id)) return "google";
      if (/(^seed|doubao|豆包|即梦|bytedance)/i.test(id)) return "bytedance";
      if (/(^wan|\bwan\b|wanxiang|万相|通义|alibaba)/i.test(id)) return "alibaba";
      if (/(^minimax|\bminimax\b|hailuo|海螺)/i.test(id)) return "minimax";
      if (/(^grok|\bgrok\b|xai)/i.test(id)) return "grok";
      return "bytedance";
    }

    const MODEL_METADATA_PRESETS = {
      "seedance-2-5": {
        name: "Dreamina Seedance 2.5",
        capsuleName: "Dreamina Seedance 2.5",
        subtitle: "30秒视频生成，精准片段编辑",
        pro: true,
        icon: "dreamina",
      },
      "seedance-2-0-fast": {
        name: "Dreamina Seedance 2.0 快速版",
        capsuleName: "Dreamina Seedance 2.0 Fast",
        subtitle: "细节和质量提升，成本更低",
        pro: true,
        badge: { text: "高达43%折扣", type: "purple" },
        icon: "dreamina",
      },
      "seedance-2-0": {
        name: "Dreamina Seedance 2.0",
        capsuleName: "Dreamina Seedance 2.0",
        subtitle: "更精准的参考，更真实，高达4K",
        pro: true,
        icon: "dreamina",
      },
      "seedance-2-0-mini-trial": {
        name: "Dreamina Seedance 2.0 Mini (试用版)",
        capsuleName: "Dreamina Seedance 2.0 Mini",
        subtitle: "最适合快速生成，仅需7积分/秒",
        pro: true,
        badge: { text: "新增", type: "green" },
        icon: "dreamina",
      },
      "seedance-2-0-mini": {
        name: "Dreamina Seedance 2.0 Mini",
        capsuleName: "Dreamina Seedance 2.0 Mini",
        subtitle: "轻量级推理，最具成本效益",
        pro: true,
        badge: { text: "最高可享58折优惠", type: "purple" },
        icon: "dreamina",
      },
      "wan-3.0": {
        name: "Wan 3.0",
        capsuleName: "Wan 3.0",
        subtitle: "通义万相电影级视效与长镜头生成",
        pro: false,
        icon: "alibaba",
      },
      "minimax-h3": {
        name: "MiniMax H3",
        capsuleName: "MiniMax H3",
        subtitle: "电影感画质，原生高帧率动态生成",
        pro: true,
        icon: "minimax",
      },
      "grok-imagine-video-1-5": {
        name: "Grok Imagine Video 1.5",
        capsuleName: "Grok Video 1.5",
        subtitle: "极速拟真运镜与多画幅自适应",
        pro: false,
        icon: "grok",
      },
      "nanobanana-pro": {
        name: "Nano Banana Pro",
        capsuleName: "Nano Banana Pro",
        subtitle: "专业图像质量和文本布局",
        pro: true,
        icon: "nanobanana",
      },
      "gpt-image-2": {
        name: "GPT图像2",
        capsuleName: "GPT图像2",
        subtitle: "精准文本渲染，更强的推理能力",
        pro: false,
        icon: "openai",
      },
      "nanobanana": {
        name: "Nano Banana",
        capsuleName: "Nano Banana",
        subtitle: "图像质量可靠，价格更实惠",
        pro: false,
        icon: "nanobanana",
      },
      "seedream-5-0-pro": {
        name: "Seedream 5.0 Pro",
        capsuleName: "Seedream 5.0 Pro",
        subtitle: "更精确、更可控的编辑",
        pro: true,
        icon: "seedream",
      },
      "seedream-5-0-lite": {
        name: "Seedream 5.0 Lite",
        capsuleName: "Seedream 5.0 Lite",
        subtitle: "卓越的提示遵循和推理能力",
        pro: false,
        icon: "seedream",
      },
      "gpt-image-2.5": {
        name: "GPT Image 2.5",
        capsuleName: "GPT Image 2.5",
        subtitle: "高精细节渲染与指令遵循",
        pro: true,
        icon: "openai",
      },
      "grok-imagine-image-2": {
        name: "Grok Imagine Image 2",
        capsuleName: "Grok Image 2",
        subtitle: "极致写实摄影感与敏捷生图",
        pro: false,
        icon: "grok",
      },
    };

    const DEFAULT_MODEL_CATALOG = {
      video: [
        {
          id: "seedance-2-5",
          name: "Dreamina Seedance 2.5",
          capsuleName: "Dreamina Seedance 2.5",
          type: "video",
          subtitle: "30秒视频生成，精准片段编辑",
          pro: true,
          badge: null,
          icon: "dreamina",
        },
        {
          id: "seedance-2-0-fast",
          name: "Dreamina Seedance 2.0 快速版",
          capsuleName: "Dreamina Seedance 2.0 Fast",
          type: "video",
          subtitle: "细节和质量提升，成本更低",
          pro: true,
          badge: { text: "高达43%折扣", type: "purple" },
          icon: "dreamina",
        },
        {
          id: "seedance-2-0",
          name: "Dreamina Seedance 2.0",
          capsuleName: "Dreamina Seedance 2.0",
          type: "video",
          subtitle: "更精准的参考，更真实，高达4K",
          pro: true,
          badge: null,
          icon: "dreamina",
        },
        {
          id: "seedance-2-0-mini-trial",
          name: "Dreamina Seedance 2.0 Mini (试用版)",
          capsuleName: "Dreamina Seedance 2.0 Mini",
          type: "video",
          subtitle: "最适合快速生成，仅需7积分/秒",
          pro: true,
          badge: { text: "新增", type: "green" },
          icon: "dreamina",
        },
        {
          id: "seedance-2-0-mini",
          name: "Dreamina Seedance 2.0 Mini",
          capsuleName: "Dreamina Seedance 2.0 Mini",
          type: "video",
          subtitle: "轻量级推理，最具成本效益",
          pro: true,
          badge: { text: "最高可享58折优惠", type: "purple" },
          icon: "dreamina",
        },
      ],
      image: [
        {
          id: "nanobanana-pro",
          name: "Nano Banana Pro",
          capsuleName: "Nano Banana Pro",
          type: "image",
          subtitle: "专业图像质量和文本布局",
          pro: true,
          badge: null,
          icon: "nanobanana",
        },
        {
          id: "gpt-image-2",
          name: "GPT图像2",
          capsuleName: "GPT图像2",
          type: "image",
          subtitle: "精准文本渲染，更强的推理能力",
          pro: false,
          badge: null,
          icon: "openai",
        },
        {
          id: "nanobanana",
          name: "Nano Banana",
          capsuleName: "Nano Banana",
          type: "image",
          subtitle: "图像质量可靠，价格更实惠",
          pro: false,
          badge: null,
          icon: "nanobanana",
        },
        {
          id: "seedream-5-0-pro",
          name: "Seedream 5.0 Pro",
          capsuleName: "Seedream 5.0 Pro",
          type: "image",
          subtitle: "更精确、更可控的编辑",
          pro: true,
          badge: null,
          icon: "seedream",
        },
        {
          id: "seedream-5-0-lite",
          name: "Seedream 5.0 Lite",
          capsuleName: "Seedream 5.0 Lite",
          type: "image",
          subtitle: "卓越的提示遵循和推理能力",
          pro: false,
          badge: null,
          icon: "seedream",
        },
      ],
    };

    function mergeDynamicCatalog(baseCatalog, dynamicCatalog) {
      if (!dynamicCatalog || typeof dynamicCatalog !== "object") return baseCatalog;
      const next = {
        video: [...(baseCatalog.video || [])],
        image: [...(baseCatalog.image || [])],
      };

      const normalizeList = (dynList, type) => {
        if (!Array.isArray(dynList) || dynList.length === 0) return;
        dynList.forEach((row) => {
          if (!row || !row.id) return;
          const existingIdx = next[type].findIndex((m) => m.id === row.id);
          const meta = MODEL_METADATA_PRESETS[row.id] || {};
          const item = {
            id: row.id,
            name: meta.name || row.label || row.id,
            capsuleName: meta.capsuleName || row.label || row.id,
            type,
            subtitle: meta.subtitle || row.subtitle || (type === "video" ? "多模态高质量视频生成" : "高精细节渲染"),
            pro: typeof meta.pro === "boolean" ? meta.pro : Boolean(row.pro),
            badge: meta.badge || (row.badge ? { text: row.badge, type: "purple" } : null),
            icon: meta.icon || resolveModelBrand(row.id),
          };
          if (existingIdx >= 0) {
            next[type][existingIdx] = { ...next[type][existingIdx], ...item };
          } else {
            next[type].push(item);
          }
        });
      };

      normalizeList(dynamicCatalog.video, "video");
      normalizeList(dynamicCatalog.image, "image");
      return next;
    }

    function renderModelLayersIcon(size = 16) {
      const px = typeof size === "number" && Number.isFinite(size) && size > 0 ? size : 16;
      return h("svg", {
        width: px,
        height: px,
        viewBox: "0 0 24 24",
        fill: "none",
        stroke: "currentColor",
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round",
        style: { width: px + "px", height: px + "px", flex: "none", display: "block" },
      },
        h("path", { d: "m12 2 10 5-10 5L2 7Z" }),
        h("path", { d: "m2 17 10 5 10-5" }),
        h("path", { d: "m2 12 10 5 10-5" }),
      );
    }

    function renderPurpleDiamond(size = 14) {
      const px = typeof size === "number" && Number.isFinite(size) && size > 0 ? size : 14;
      return h("svg", {
        width: px,
        height: px,
        viewBox: "0 0 16 16",
        fill: "none",
        xmlns: "http://www.w3.org/2000/svg",
        className: "sh-model-diamond",
        style: { width: px + "px", height: px + "px", flexShrink: 0, display: "inline-block" },
      },
        h("polygon", { points: "5.5,2 10.5,2 9.2,5.5 6.8,5.5", fill: "currentColor", opacity: "0.95" }),
        h("polygon", { points: "2,5.5 5.5,2 6.8,5.5", fill: "currentColor", opacity: "0.75" }),
        h("polygon", { points: "10.5,2 14,5.5 9.2,5.5", fill: "currentColor", opacity: "0.85" }),
        h("polygon", { points: "6.8,5.5 9.2,5.5 8,14", fill: "currentColor", opacity: "0.9" }),
        h("polygon", { points: "2,5.5 6.8,5.5 8,14", fill: "currentColor", opacity: "0.6" }),
        h("polygon", { points: "9.2,5.5 14,5.5 8,14", fill: "currentColor", opacity: "0.7" }),
      );
    }

    function renderBrandIcon(iconOrId, size = 16) {
      const px = typeof size === "number" && Number.isFinite(size) && size > 0 ? size : 16;
      const brandKey = resolveModelBrand(iconOrId);
      const svgRaw = BRAND_SVGS[brandKey] || BRAND_SVGS.bytedance;
      return h("span", {
        className: "sh-model-brand-icon",
        style: {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: px + "px",
          height: px + "px",
          flexShrink: 0,
        },
        dangerouslySetInnerHTML: { __html: svgRaw },
      });
    }

    function ModelPickerPanel({ open, anchorRef, auto, selectedModel, modelsData, onToggleAuto, onSelectModel, onClose, t }) {
      const tr = typeof t === "function" ? t : lookup;
      const panelRef = useRef(null);
      const [tab, setTab] = useState("video");
      const [pos, setPos] = useState({ left: 0, top: 0, width: 480 });

      useLayoutEffect(() => {
        if (!open) return undefined;
        const place = () => {
          const anchor = anchorRef && anchorRef.current;
          const panel = panelRef.current;
          if (!anchor || typeof anchor.getBoundingClientRect !== "function") return;
          const r = anchor.getBoundingClientRect();
          const width = Math.min(520, Math.max(400, Math.min(480, window.innerWidth - 16)));
          const height = panel ? panel.offsetHeight : 460;
          let left = r.left;
          if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
          if (left < 8) left = 8;
          let top = r.top - height - 8;
          if (top < 8) top = Math.min(r.bottom + 8, window.innerHeight - height - 8);
          setPos({ left, top: Math.max(8, top), width });
        };
        place();
        window.addEventListener("resize", place);
        return () => window.removeEventListener("resize", place);
      }, [open, tab, anchorRef]);

      useEffect(() => {
        if (!open) return undefined;
        const onDoc = (e) => {
          const tEl = e.target;
          if (panelRef.current && panelRef.current.contains(tEl)) return;
          if (anchorRef && anchorRef.current && anchorRef.current.contains(tEl)) return;
          onClose();
        };
        const onKey = (e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            onClose();
          }
        };
        document.addEventListener("mousedown", onDoc);
        document.addEventListener("keydown", onKey);
        return () => {
          document.removeEventListener("mousedown", onDoc);
          document.removeEventListener("keydown", onKey);
        };
      }, [open, onClose, anchorRef]);

      if (!open) return null;

      const currentCatalog = modelsData || DEFAULT_MODEL_CATALOG;
      const items = currentCatalog[tab] || [];

      const node = h("div", {
        ref: panelRef,
        className: "sh-model-picker",
        role: "dialog",
        "aria-label": tr("modelPicker.title") || "模型",
        "aria-modal": "true",
        style: { left: pos.left + "px", top: pos.top + "px", width: pos.width + "px" },
      },
        h("div", { className: "sh-model-picker-header" },
          h("div", { className: "sh-model-picker-title" }, tr("modelPicker.title") || "模型"),
          h("div", { className: "sh-model-auto-row" },
            h("span", { className: "sh-model-auto-label" }, tr("modelPicker.auto") || "自动"),
            h("button", {
              type: "button",
              role: "switch",
              "aria-checked": auto ? "true" : "false",
              className: "sh-model-switch" + (auto ? " on" : ""),
              onClick: () => onToggleAuto(!auto),
            },
              h("span", { className: "sh-model-switch-thumb" }),
            ),
          ),
        ),
        h("div", { className: "sh-model-tabs", role: "tablist" },
          h("button", {
            type: "button",
            role: "tab",
            className: "sh-model-tab" + (tab === "video" ? " active" : ""),
            "aria-selected": tab === "video",
            onClick: () => setTab("video"),
          }, tr("modelPicker.tab.video") || "视频"),
          h("button", {
            type: "button",
            role: "tab",
            className: "sh-model-tab" + (tab === "image" ? " active" : ""),
            "aria-selected": tab === "image",
            onClick: () => setTab("image"),
          }, tr("modelPicker.tab.image") || "图像"),
        ),
        h("div", { className: "sh-model-section-title" }, tab === "video" ? (tr("modelPicker.tab.video") || "视频") : (tr("modelPicker.tab.image") || "图像")),
        h("div", { className: "sh-model-list", role: "listbox" },
          items.map((model) => {
            const isSelected = !auto && selectedModel && selectedModel.id === model.id;
            return h("div", {
              key: model.id,
              className: "sh-model-row" + (isSelected ? " selected" : ""),
              role: "option",
              "aria-selected": isSelected ? "true" : "false",
              onClick: () => onSelectModel(model),
            },
              h("div", { className: "sh-model-row-left" },
                h("div", { className: "sh-model-icon-box" }, renderBrandIcon(model.icon || model.id, 20)),
                h("div", { className: "sh-model-row-info" },
                  h("div", { className: "sh-model-row-title-row" },
                    h("span", { className: "sh-model-name" }, model.name),
                    model.pro ? renderPurpleDiamond(14) : null,
                    model.badge ? h("span", { className: "sh-model-badge " + (model.badge.type || "purple") }, model.badge.text) : null,
                  ),
                  h("div", { className: "sh-model-row-desc" }, model.subtitle),
                ),
              ),
              h("div", { className: "sh-model-row-right" },
                h("div", { className: "sh-model-radio" + (isSelected ? " checked" : "") },
                  isSelected ? h("span", { className: "sh-model-radio-dot" }) : null,
                ),
              ),
            );
          }),
        ),
      );

      if (typeof document === "undefined" || !document.body) return node;
      return createPortal(node, document.body);
    }

    function ModelPickerButton(props) {
      const tr = lookup;
      const [open, setOpen] = useState(false);
      const btnRef = useRef(null);
      const sessions = typeof plazaSessions !== "undefined" ? plazaSessions : null;

      const [sessionId, setSessionId] = useState(() => {
        return (props && props.sessionId) ||
          (sessions && sessions.list && typeof sessions.list.getSnapshot === "function" && sessions.list.getSnapshot().current) ||
          "default";
      });

      const [auto, setAuto] = useState(() => {
        try {
          const sid = (props && props.sessionId) ||
            (sessions && sessions.list && typeof sessions.list.getSnapshot === "function" && sessions.list.getSnapshot().current) ||
            "default";
          const raw = window.sessionStorage.getItem("omnimux:model:" + sid);
          if (raw) {
            const parsed = JSON.parse(raw);
            if (typeof parsed.auto === "boolean") return parsed.auto;
          }
        } catch {}
        return true;
      });

      const [selectedModel, setSelectedModel] = useState(() => {
        try {
          const sid = (props && props.sessionId) ||
            (sessions && sessions.list && typeof sessions.list.getSnapshot === "function" && sessions.list.getSnapshot().current) ||
            "default";
          const raw = window.sessionStorage.getItem("omnimux:model:" + sid);
          if (raw) {
            const parsed = JSON.parse(raw);
            return parsed.selectedModel || null;
          }
        } catch {}
        return null;
      });

      const [modelsData, setModelsData] = useState(() => DEFAULT_MODEL_CATALOG);

      useEffect(() => {
        let live = true;
        const loadModels = async () => {
          try {
            if (typeof api === "function") {
              const res = await api("getModelCatalog");
              if (live && res && res.catalog) {
                setModelsData((prev) => mergeDynamicCatalog(prev, res.catalog));
                return;
              }
            }
          } catch {}
          if (typeof fetch === "function") {
            try {
              const resp = await fetch("/omnimux/model-catalog");
              if (resp.ok) {
                const cat = await resp.json();
                if (live && cat) {
                  setModelsData((prev) => mergeDynamicCatalog(prev, cat));
                }
              }
            } catch {}
          }
        };
        loadModels();
        return () => { live = false; };
      }, []);

      useEffect(() => {
        const updateSession = () => {
          const s = typeof plazaSessions !== "undefined" ? plazaSessions : null;
          const currentId = (props && props.sessionId) ||
            (s && s.list && typeof s.list.getSnapshot === "function" && s.list.getSnapshot().current) ||
            "default";
          setSessionId((prev) => {
            if (prev !== currentId) {
              try {
                const raw = window.sessionStorage.getItem("omnimux:model:" + currentId);
                if (raw) {
                  const parsed = JSON.parse(raw);
                  setAuto(typeof parsed.auto === "boolean" ? parsed.auto : true);
                  setSelectedModel(parsed.selectedModel || null);
                } else {
                  setAuto(true);
                  setSelectedModel(null);
                }
              } catch {
                setAuto(true);
                setSelectedModel(null);
              }
              return currentId;
            }
            return prev;
          });
        };
        updateSession();
        if (sessions && sessions.list && typeof sessions.list.subscribe === "function") {
          return sessions.list.subscribe(updateSession);
        }
        return undefined;
      }, [props, sessions]);

      const handleToggleAuto = useCallback((nextAuto) => {
        setAuto(nextAuto);
        if (nextAuto) {
          setSelectedModel(null);
        }
        try {
          window.sessionStorage.setItem("omnimux:model:" + sessionId, JSON.stringify({
            auto: nextAuto,
            selectedModel: nextAuto ? null : selectedModel,
          }));
          window.dispatchEvent(new CustomEvent("omnimux:model:changed", {
            detail: { sessionId, auto: nextAuto, selectedModel: nextAuto ? null : selectedModel },
          }));
        } catch {}
        if (typeof api === "function") {
          api("setModelSelection", {
            sessionId,
            auto: nextAuto,
            selectedModel: nextAuto ? null : selectedModel,
          }).catch(() => {});
        }
      }, [sessionId, selectedModel]);

      const handleSelectModel = useCallback((model) => {
        setAuto(false);
        setSelectedModel(model);
        try {
          window.sessionStorage.setItem("omnimux:model:" + sessionId, JSON.stringify({
            auto: false,
            selectedModel: model,
          }));
          window.dispatchEvent(new CustomEvent("omnimux:model:changed", {
            detail: { sessionId, auto: false, selectedModel: model },
          }));
        } catch {}
        if (typeof api === "function") {
          api("setModelSelection", {
            sessionId,
            auto: false,
            selectedModel: model,
          }).catch(() => {});
        }
        setOpen(false);
      }, [sessionId]);

      const isModelChosen = !auto && selectedModel;

      return h("div", { className: "sh-model-picker-wrap" },
        isModelChosen ? h("button", {
          ref: btnRef,
          type: "button",
          className: "sh-model-capsule-btn" + (open ? " on" : ""),
          "aria-label": selectedModel.name,
          title: selectedModel.name,
          "aria-haspopup": "dialog",
          "aria-expanded": open ? "true" : "false",
          "data-omnimux-model-capsule": "",
          onClick: () => setOpen((v) => !v),
        },
          renderBrandIcon(selectedModel.icon || selectedModel.id, 14),
          h("span", { className: "sh-model-capsule-name" }, selectedModel.capsuleName || selectedModel.name),
        ) : h("button", {
          ref: btnRef,
          type: "button",
          className: "sh-picker-trigger sh-model-picker-trigger" + (open ? " on" : ""),
          "aria-label": tr("modelPicker.title") || "模型",
          title: tr("modelPicker.title") || "模型",
          "aria-haspopup": "dialog",
          "aria-expanded": open ? "true" : "false",
          "data-omnimux-model-picker": "",
          onClick: () => setOpen((v) => !v),
        },
          renderModelLayersIcon(16),
          h("span", { className: "sh-picker-trigger-label" }, tr("modelPicker.title") || "模型"),
        ),
        h(ModelPickerPanel, {
          open,
          anchorRef: btnRef,
          auto,
          selectedModel,
          modelsData,
          onToggleAuto: handleToggleAuto,
          onSelectModel: handleSelectModel,
          onClose: () => setOpen(false),
          t: tr,
        }),
      );
    }
