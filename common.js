(() => {
  "use strict";

  const cfg = window.DPRO_FLOWER_CONFIG;
  if (!cfg) throw new Error("config.js が読み込まれていません。");

  const DPRO = {
    cfg,

    qs(selector, root = document) {
      return root.querySelector(selector);
    },

    qsa(selector, root = document) {
      return [...root.querySelectorAll(selector)];
    },

    yen(value) {
      return new Intl.NumberFormat("ja-JP", {
        style: "currency",
        currency: "JPY",
        maximumFractionDigits: 0
      }).format(Number(value || 0));
    },

    dateTime(value) {
      if (!value) return "未設定";
      return new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit"
      }).format(new Date(value));
    },

    date(value) {
      if (!value) return "未設定";
      return new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        weekday: "short"
      }).format(new Date(`${value}T12:00:00+09:00`));
    },

    todayJst() {
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(new Date());
    },

    addDaysJst(days) {
      const now = new Date();
      now.setDate(now.getDate() + days);
      return new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Tokyo",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(now);
    },

    escape(value) {
      return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
    },

    normalizePhone(value) {
      const map = {"０":"0","１":"1","２":"2","３":"3","４":"4","５":"5","６":"6","７":"7","８":"8","９":"9"};
      let text = String(value || "").replace(/[０-９]/g, c => map[c]);
      text = text.replace(/\D/g, "");
      if (/^81[1-9]/.test(text)) text = `0${text.slice(2)}`;
      return text;
    },

    isDemo() {
      return new URLSearchParams(location.search).get("demo") === "1";
    },

    getDemoLineUserId() {
      const explicitId = new URLSearchParams(location.search).get("line_user_id");
      if (explicitId) return explicitId;

      const storageKey = "dpro_flower_demo_browser_line_user_id";

      try {
        let storedId = localStorage.getItem(storageKey);
        if (!storedId) {
          const randomPart = typeof crypto?.randomUUID === "function"
            ? crypto.randomUUID().replaceAll("-", "")
            : `${Date.now()}${Math.random().toString(16).slice(2)}`;
          storedId = `U_DEMO_FLOWER_BROWSER_${randomPart.slice(0, 32)}`;
          localStorage.setItem(storageKey, storedId);
        }
        return storedId;
      } catch {
        if (!globalThis.__dproFlowerDemoBrowserId) {
          const randomPart = typeof crypto?.randomUUID === "function"
            ? crypto.randomUUID().replaceAll("-", "")
            : `${Date.now()}${Math.random().toString(16).slice(2)}`;
          globalThis.__dproFlowerDemoBrowserId =
            `U_DEMO_FLOWER_BROWSER_${randomPart.slice(0, 32)}`;
        }
        return globalThis.__dproFlowerDemoBrowserId;
      }
    },

    getAdminCode() {
      if (DPRO.isDemo()) return cfg.DEMO_ADMIN_CODE;
      return sessionStorage.getItem("dpro_flower_admin_code") || "";
    },

    saveAdminCode(code) {
      sessionStorage.setItem("dpro_flower_admin_code", String(code || ""));
    },

    clearAdminCode() {
      sessionStorage.removeItem("dpro_flower_admin_code");
    },

    async api(path, options = {}) {
      const url = path.startsWith("http")
        ? path
        : `${cfg.API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

      const headers = new Headers(options.headers || {});
      headers.set("accept", "application/json");
      if (options.body !== undefined && !headers.has("content-type")) {
        headers.set("content-type", "application/json");
      }

      if (options.admin) {
        const code = options.adminCode || DPRO.getAdminCode();
        if (!code) throw new Error("管理コードを入力してください。");
        headers.set("x-admin-code", code);
      }

      const response = await fetch(url, {
        method: options.method || "GET",
        headers,
        body: options.body === undefined
          ? undefined
          : typeof options.body === "string"
            ? options.body
            : JSON.stringify(options.body)
      });

      const data = await response.json().catch(() => ({
        ok: false,
        message: `HTTP ${response.status}`
      }));

      if (!response.ok || data.ok === false) {
        const error = new Error(data.message || data.error || "通信に失敗しました。");
        error.status = response.status;
        error.data = data;
        throw error;
      }
      return data;
    },

    setAlert(element, message, type = "info") {
      if (!element) return;
      if (!message) {
        element.className = "hidden";
        element.textContent = "";
        return;
      }
      element.className = `alert alert-${type}`;
      element.textContent = message;
    },

    setButtonBusy(button, busy, busyText = "処理中…") {
      if (!button) return;
      if (busy) {
        button.dataset.originalText = button.textContent;
        button.textContent = busyText;
        button.disabled = true;
      } else {
        button.textContent = button.dataset.originalText || button.textContent;
        button.disabled = false;
      }
    },

    statusBadge(status) {
      const map = {
        new: ["新規受付", "rose"],
        reviewing: ["内容確認中", "gold"],
        quoted: ["見積提示", "gold"],
        customer_waiting: ["お客様確認待ち", "gold"],
        confirmed: ["注文確定", ""],
        payment_waiting: ["入金待ち", "gold"],
        production_waiting: ["制作待ち", "gray"],
        producing: ["制作中", ""],
        completed: ["完成", ""],
        pickup_waiting: ["店頭受取待ち", ""],
        delivery_preparing: ["配達準備", ""],
        delivering: ["配達中", ""],
        delivered: ["配達完了", ""],
        handed_over: ["引渡し完了", ""],
        cancelled: ["キャンセル", "rose"]
      };
      const [label, cls] = map[status] || [status || "不明", "gray"];
      return `<span class="badge ${cls}">${DPRO.escape(label)}</span>`;
    },

    fulfillmentLabel(value) {
      return ({
        pickup: "店頭受取",
        delivery: "店舗配達",
        shipping_consultation: "配送相談"
      })[value] || value || "未設定";
    },

    usageLabel(value) {
      return ({
        birthday: "誕生日",
        wedding_anniversary: "結婚記念日",
        mother_day: "母の日",
        father_day: "父の日",
        farewell: "送別・退職",
        entrance_graduation: "入学・卒業",
        opening: "開店・開業祝い",
        anniversary: "周年祝い",
        recital_event: "発表会・公演",
        get_well: "お見舞い",
        memorial: "お供え・法事",
        funeral: "葬儀・供花",
        home_use: "自宅用",
        business: "法人・ビジネス",
        other: "その他"
      })[value] || value || "未設定";
    },

    uuid() {
      return crypto.randomUUID();
    },

    navHtml(active = "") {
      const links = [
        ["index.html", "注文する", "order"],
        ["member.html", "マイページ", "member"],
        ["owner.html?demo=1", "オーナー", "owner"],
        ["staff.html?demo=1", "スタッフ", "staff"]
      ];
      return links.map(([href, label, key]) =>
        `<a href="${href}" class="${active === key ? "active" : ""}">${label}</a>`
      ).join("");
    },

    mountChrome(active = "") {
      const nav = DPRO.qs("#topnav");
      if (nav) nav.innerHTML = DPRO.navHtml(active);
      const mobile = DPRO.qs("#mobileNav");
      if (mobile) {
        mobile.innerHTML = `
          <a href="index.html"><span>💐</span>注文</a>
          <a href="member.html"><span>🎫</span>マイページ</a>
          <a href="owner.html?demo=1"><span>🖥️</span>管理</a>
          <a href="staff.html?demo=1"><span>🧺</span>作業</a>
        `;
      }
      const version = DPRO.qs("#appVersion");
      if (version) version.textContent = cfg.VERSION;
    }
  };

  window.DPRO = DPRO;
})();
