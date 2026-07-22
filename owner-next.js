document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const PAGE_VERSION = "FLOWER-NEXT-6-OWNER-PC-20260721";
  const PANEL_META = {
    dashboard: { eyebrow: "OWNER DASHBOARD", title: "今日の状況", description: "注文・制作・受取・配達の状況を確認します。" },
    orders: { eyebrow: "ORDER MANAGEMENT", title: "注文管理", description: "LINE・電話・店頭注文を検索し、状態を更新します。" },
    production: { eyebrow: "PRODUCTION BOARD", title: "制作管理", description: "花材確認から完成写真・最終確認まで管理します。" },
    pickup: { eyebrow: "PICKUP CONTROL", title: "店頭受取", description: "完成した商品と受取待ち・引渡し完了を管理します。" },
    delivery: { eyebrow: "DELIVERY BOARD", title: "配達管理", description: "梱包・積込・出発・到着・配達完了を管理します。" },
    products: { eyebrow: "PRODUCT CATALOG", title: "商品カタログ", description: "商品、写真、価格、公開、売り切れ、カテゴリを管理します。" },
    customers: { eyebrow: "CUSTOMER MANAGEMENT", title: "顧客管理", description: "顧客情報、届け先、記念日、注文履歴を確認します。" },
    capacity: { eyebrow: "PRODUCTION CAPACITY", title: "制作受付上限", description: "曜日・時間・特別日ごとの制作ポイント上限を設定します。" },
    system: { eyebrow: "SYSTEM & LINKS", title: "関連画面・システム検査", description: "現場画面、公開画面、Worker・DBの状態を確認します。" },
  };

  const state = {
    activePanel: "dashboard",
    authenticated: false,
    loaded: new Set(),
    products: [],
    categories: [],
    customers: [],
    selectedCustomerId: "",
    currentEditingProduct: null,
  };

  const lock = DPRO.qs("#adminLock");
  const app = DPRO.qs("#adminApp");
  const codeInput = DPRO.qs("#adminCode");
  const loginAlert = DPRO.qs("#loginAlert");
  const pageAlert = DPRO.qs("#pageAlert");
  const sidebar = DPRO.qs("#ownerSidebar");
  const backdrop = DPRO.qs("#sidebarBackdrop");
  const mobileMenuButton = DPRO.qs("#mobileSidebarButton");
  const productDialog = DPRO.qs("#productEditorDialog");
  const productForm = DPRO.qs("#productEditorForm");
  const productEditorAlert = DPRO.qs("#productEditorAlert");

  mountPublicNavigation();
  initializeDates();
  enhanceDateInputs();
  bindEvents();

  codeInput.value = DPRO.getAdminCode();
  if (DPRO.getAdminCode()) login();

  function mountPublicNavigation() {
    const demo = DPRO.isDemo() ? "?demo=1" : "";
    const topnav = DPRO.qs("#topnav");
    if (topnav) {
      topnav.innerHTML = `
        <a href="catalog.html">商品カタログ</a>
        <a href="index.html">注文する</a>
        <a href="member.html">マイページ</a>
        <a href="owner.html${demo}" class="active">オーナー</a>
        <a href="staff.html${demo}">スタッフ</a>
      `;
    }
    DPRO.qs("#appVersion").textContent = PAGE_VERSION;
    DPRO.qs("#sidebarVersion").textContent = PAGE_VERSION;
  }

  function initializeDates() {
    const today = DPRO.todayJst();
    ["dashboardDate", "productionDate", "pickupDate", "deliveryDate", "capacityDate"].forEach(id => {
      const input = DPRO.qs(`#${id}`);
      if (input) {
        input.value = today;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    });
    DPRO.qs("#orderFrom").value = today;
    DPRO.qs("#orderTo").value = DPRO.addDaysJst(14);
  }

  function enhanceDateInputs() {
    DPRO.qsa('input[type="date"]').forEach(input => {
      if (input.closest(".owner-date-control")) return;

      const wrapper = document.createElement("div");
      wrapper.className = "owner-date-control";

      const display = document.createElement("span");
      display.className = "owner-date-readable";
      display.setAttribute("aria-hidden", "true");

      input.parentNode.insertBefore(wrapper, input);
      wrapper.appendChild(input);
      wrapper.appendChild(display);

      const update = () => {
        display.textContent = formatReadableDate(input.value);
      };

      input.addEventListener("change", update);
      input.addEventListener("input", update);
      update();
    });
  }

  function formatReadableDate(value) {
    if (!value) return "日付を選択";
    const parts = String(value).split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return value;

    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    const weekday = ["日", "月", "火", "水", "木", "金", "土"][date.getUTCDay()];
    return `${parts[0]}/${String(parts[1]).padStart(2, "0")}/${String(parts[2]).padStart(2, "0")}（${weekday}）`;
  }

  function bindEvents() {
    DPRO.qs("#loginButton").addEventListener("click", login);
    codeInput.addEventListener("keydown", event => {
      if (event.key === "Enter") login();
    });

    DPRO.qs("#clearCodeButton").addEventListener("click", clearSavedCode);
    DPRO.qs("#deleteSavedCodeButton").addEventListener("click", clearSavedCode);
    DPRO.qs("#logoutButton").addEventListener("click", logout);

    DPRO.qsa("[data-panel]").forEach(button => {
      button.addEventListener("click", () => openPanel(button.dataset.panel));
    });
    DPRO.qsa("[data-open-panel]").forEach(button => {
      button.addEventListener("click", () => openPanel(button.dataset.openPanel));
    });

    DPRO.qs("#refreshCurrentPanel").addEventListener("click", () => {
      loadPanel(state.activePanel, true);
    });

    mobileMenuButton.addEventListener("click", toggleSidebar);
    backdrop.addEventListener("click", closeSidebar);

    DPRO.qs("#reloadDashboard").addEventListener("click", loadDashboard);
    DPRO.qs("#searchOrders").addEventListener("click", loadOrders);
    DPRO.qs("#reloadProduction").addEventListener("click", loadProduction);
    DPRO.qs("#reloadPickup").addEventListener("click", loadPickup);
    DPRO.qs("#reloadDelivery").addEventListener("click", loadDelivery);
    DPRO.qs("#searchProducts").addEventListener("click", loadProducts);
    DPRO.qs("#searchCustomers").addEventListener("click", searchCustomers);
    DPRO.qs("#runSystemCheck").addEventListener("click", runSystemCheck);

    bindEnterSearch("orderQuery", loadOrders);
    bindEnterSearch("productQuery", loadProducts);
    bindEnterSearch("customerQuery", searchCustomers);

    DPRO.qs("#newProductButton").addEventListener("click", () => openProductEditor(null));
    DPRO.qs("#toggleCategoryManager").addEventListener("click", () => {
      DPRO.qs("#categoryManager").classList.toggle("hidden");
    });
    DPRO.qs("#newCategoryForm").addEventListener("submit", createCategory);

    DPRO.qs("#closeProductEditor").addEventListener("click", closeProductEditor);
    DPRO.qs("#cancelProductEditor").addEventListener("click", closeProductEditor);
    productDialog.addEventListener("cancel", event => {
      event.preventDefault();
      closeProductEditor();
    });
    productForm.addEventListener("submit", saveProduct);
    DPRO.qs("#uploadProductPhoto").addEventListener("click", uploadProductPhoto);

    DPRO.qs("#capacityOverrideForm").addEventListener("submit", saveCapacityOverride);
    DPRO.qs("#capacityRuleForm").addEventListener("submit", saveCapacityRule);

    window.addEventListener("hashchange", () => {
      if (!state.authenticated) return;
      const panel = location.hash.replace("#", "");
      if (PANEL_META[panel]) openPanel(panel, { updateHash: false });
    });
  }

  function bindEnterSearch(inputId, handler) {
    DPRO.qs(`#${inputId}`).addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        handler();
      }
    });
  }

  async function login() {
    const code = codeInput.value.trim() || DPRO.getAdminCode();
    if (!code) {
      DPRO.setAlert(loginAlert, "管理コードを入力してください。", "error");
      return;
    }

    const button = DPRO.qs("#loginButton");
    DPRO.setButtonBusy(button, true, "確認中…");

    try {
      await DPRO.api("/api/admin/login", {
        method: "POST",
        admin: true,
        adminCode: code,
      });
      DPRO.saveAdminCode(code);
      state.authenticated = true;
      lock.classList.add("hidden");
      app.classList.remove("hidden");

      const requestedPanel = location.hash.replace("#", "");
      openPanel(PANEL_META[requestedPanel] ? requestedPanel : "dashboard", {
        updateHash: false,
      });
    } catch (error) {
      DPRO.setAlert(loginAlert, error.message, "error");
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  function logout() {
    state.authenticated = false;
    closeSidebar();
    app.classList.add("hidden");
    lock.classList.remove("hidden");
    codeInput.value = DPRO.getAdminCode();
    codeInput.focus();
  }

  function clearSavedCode() {
    DPRO.clearAdminCode();
    codeInput.value = "";
    if (state.authenticated) logout();
    DPRO.setAlert(loginAlert, "保存されている管理コードを削除しました。", "info");
  }

  function toggleSidebar() {
    const open = !sidebar.classList.contains("open");
    sidebar.classList.toggle("open", open);
    backdrop.classList.toggle("hidden", !open);
    mobileMenuButton.setAttribute("aria-expanded", String(open));
  }

  function closeSidebar() {
    sidebar.classList.remove("open");
    backdrop.classList.add("hidden");
    mobileMenuButton.setAttribute("aria-expanded", "false");
  }

  function openPanel(panel, options = {}) {
    if (!PANEL_META[panel]) panel = "dashboard";
    state.activePanel = panel;

    DPRO.qsa("[data-owner-panel]").forEach(section => {
      section.classList.toggle("active", section.dataset.ownerPanel === panel);
    });
    DPRO.qsa("[data-panel]").forEach(button => {
      button.classList.toggle("active", button.dataset.panel === panel);
    });

    const meta = PANEL_META[panel];
    DPRO.qs("#panelEyebrow").textContent = meta.eyebrow;
    DPRO.qs("#panelTitle").textContent = meta.title;
    DPRO.qs("#panelDescription").textContent = meta.description;
    DPRO.setAlert(pageAlert, "");

    if (options.updateHash !== false) {
      history.replaceState({}, "", `${location.pathname}${location.search}#${panel}`);
    }

    closeSidebar();
    loadPanel(panel, options.force === true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function loadPanel(panel, force = false) {
    if (!force && state.loaded.has(panel)) return;

    const loaders = {
      dashboard: loadDashboard,
      orders: loadOrders,
      production: loadProduction,
      pickup: loadPickup,
      delivery: loadDelivery,
      products: loadProducts,
      customers: async () => {},
      capacity: loadCapacity,
      system: async () => {},
    };

    try {
      await loaders[panel]?.();
      state.loaded.add(panel);
      updateTimestamp();
    } catch (error) {
      showPageError(error);
    }
  }

  function updateTimestamp() {
    const now = new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date());
    DPRO.qs("#lastUpdatedAt").textContent = `最終更新 ${now}`;
  }

  function showPageError(error) {
    DPRO.setAlert(pageAlert, error?.message || "処理に失敗しました。", "error");
    pageAlert.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function loadDashboard() {
    const date = DPRO.qs("#dashboardDate").value || DPRO.todayJst();
    const data = await DPRO.api(`/api/admin/dashboard?date=${encodeURIComponent(date)}`, { admin: true });
    const summary = data.summary || {};

    setText("#statToday", summary.today_orders ?? 0);
    setText("#statOpenOrders", summary.open_orders ?? 0);
    setText("#statProduction", summary.production_open ?? 0);
    setText("#statDelivery", summary.delivery_open ?? 0);
    setText("#statUnpaid", summary.unpaid_orders ?? 0);
    setText("#statSales", DPRO.yen(summary.today_sales || 0));

    updateNavBadge("#navOrderBadge", summary.open_orders || 0);
    updateNavBadge("#navProductionBadge", summary.production_open || 0);
    updateNavBadge("#navDeliveryBadge", summary.delivery_open || 0);

    renderTodayOrders(data.today_orders || []);
    updateTimestamp();
  }

  function renderTodayOrders(orders) {
    const root = DPRO.qs("#todayOrders");
    if (!orders.length) {
      root.innerHTML = `<div class="owner-empty">この日の注文はありません。</div>`;
      return;
    }

    root.innerHTML = `
      <table>
        <thead><tr><th>希望日時</th><th>受付番号</th><th>お客様</th><th>商品</th><th>受取</th><th>状態</th><th>金額</th></tr></thead>
        <tbody>
          ${orders.map(order => `
            <tr>
              <td>${DPRO.dateTime(order.requested_at)}</td>
              <td><strong>${DPRO.escape(order.order_number)}</strong></td>
              <td>${DPRO.escape(order.flower_customers?.customer_name || "―")}<br><span class="help">${DPRO.escape(order.flower_customers?.phone || "")}</span></td>
              <td>${orderItemsText(order)}</td>
              <td>${DPRO.escape(DPRO.fulfillmentLabel(order.fulfillment_type))}</td>
              <td>${DPRO.statusBadge(order.status)}</td>
              <td>${DPRO.yen(order.total_amount)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  async function loadOrders() {
    const params = new URLSearchParams({ limit: "300" });
    const status = DPRO.qs("#orderStatusFilter").value;
    const q = DPRO.qs("#orderQuery").value.trim();
    const from = DPRO.qs("#orderFrom").value;
    const to = DPRO.qs("#orderTo").value;

    if (status) params.set("status", status);
    if (q) params.set("q", q);
    if (from) params.set("from", from);
    if (to) params.set("to", to);

    const root = DPRO.qs("#ordersTable");
    root.innerHTML = `<div class="loading">注文を読み込んでいます…</div>`;

    const data = await DPRO.api(`/api/admin/orders?${params}`, { admin: true });
    const orders = data.orders || [];
    DPRO.qs("#orderResultCount").textContent = `${orders.length}件の注文`;
    renderOrders(orders);
    updateTimestamp();
  }

  function renderOrders(orders) {
    const root = DPRO.qs("#ordersTable");
    if (!orders.length) {
      root.innerHTML = `<div class="owner-empty">条件に合う注文はありません。</div>`;
      return;
    }

    root.innerHTML = orders.map(order => {
      const recipient = Array.isArray(order.flower_order_recipients)
        ? order.flower_order_recipients[0]
        : order.flower_order_recipients;
      const notes = [
        order.customer_note ? `お客様希望：${order.customer_note}` : "",
        order.internal_note ? `店舗メモ：${order.internal_note}` : "",
      ].filter(Boolean).join("\n");

      return `
        <article class="owner-order-card">
          <div class="owner-order-head">
            <div>
              <div class="owner-order-number">${DPRO.escape(order.order_number)}</div>
              <div class="owner-order-meta">${DPRO.escape(DPRO.usageLabel(order.usage_type))}・${DPRO.escape(order.source || "line")}・${DPRO.escape(DPRO.fulfillmentLabel(order.fulfillment_type))}</div>
            </div>
            ${DPRO.statusBadge(order.status)}
          </div>

          <div class="owner-order-grid">
            <div class="owner-order-block">
              <span>お客様</span>
              <strong>${DPRO.escape(order.flower_customers?.customer_name || "―")}</strong>
              <div class="help">${DPRO.escape(order.flower_customers?.phone || "")}</div>
            </div>
            <div class="owner-order-block"><span>商品</span><strong>${orderItemsText(order)}</strong></div>
            <div class="owner-order-block">
              <span>希望日時・金額</span>
              <strong>${DPRO.dateTime(order.requested_at)}</strong>
              <div>${DPRO.yen(order.total_amount)}・${paymentLabel(order.payment_status)}</div>
            </div>
          </div>

          ${recipient ? `<div class="owner-order-note">配達先：${DPRO.escape([
            recipient.recipient_name,
            recipient.company_or_facility_name,
            recipient.venue_name,
            recipient.prefecture,
            recipient.city,
            recipient.address_line1,
          ].filter(Boolean).join(" "))}</div>` : ""}

          ${notes ? `<div class="owner-order-note">${DPRO.escape(notes)}</div>` : ""}

          <div class="owner-order-actions">
            <div class="field">
              <label for="order-status-${DPRO.escape(order.id)}">注文状態</label>
              <select id="order-status-${DPRO.escape(order.id)}" class="owner-order-status" data-order-id="${DPRO.escape(order.id)}">
                ${orderStatusOptions(order.status)}
              </select>
            </div>
            <button type="button" class="btn btn-primary btn-small owner-order-save" data-order-id="${DPRO.escape(order.id)}">状態を保存</button>
            ${order.flower_customers?.id ? `<a class="btn btn-secondary btn-small" href="counter.html?demo=1&customer_id=${encodeURIComponent(order.flower_customers.id)}">この顧客で再注文</a>` : ""}
          </div>
        </article>
      `;
    }).join("");

    DPRO.qsa(".owner-order-save", root).forEach(button => {
      button.addEventListener("click", () => saveOrderStatus(button));
    });
  }

  async function saveOrderStatus(button) {
    const orderId = button.dataset.orderId;
    const select = DPRO.qs(`.owner-order-status[data-order-id="${cssEscape(orderId)}"]`);
    DPRO.setButtonBusy(button, true, "保存中…");

    try {
      await DPRO.api(`/api/admin/orders/${orderId}/status`, {
        method: "PATCH",
        admin: true,
        body: { status: select.value, updated_by: "owner-next-pc" },
      });
      await Promise.all([loadOrders(), loadDashboard()]);
      DPRO.setAlert(pageAlert, "注文状態を更新しました。", "info");
    } catch (error) {
      showPageError(error);
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  async function loadProduction() {
    const date = DPRO.qs("#productionDate").value || DPRO.todayJst();
    const status = DPRO.qs("#productionStatusFilter").value;
    const params = new URLSearchParams({ date });
    if (status) params.set("status", status);

    const root = DPRO.qs("#productionBoard");
    root.innerHTML = `<div class="loading">制作タスクを読み込んでいます…</div>`;

    const data = await DPRO.api(`/api/admin/production-board?${params}`, { admin: true });
    renderBoardSummary(DPRO.qs("#productionSummary"), data.summary || {}, productionLabel);
    renderProductionBoard(data.tasks || []);
    updateTimestamp();
  }

  function renderProductionBoard(tasks) {
    const root = DPRO.qs("#productionBoard");
    if (!tasks.length) {
      root.innerHTML = `<div class="owner-empty">この日の制作タスクはありません。</div>`;
      return;
    }

    const columns = [
      ["materials_check", "花材確認"], ["waiting", "制作待ち"], ["assigned", "担当決定"],
      ["producing", "制作中"], ["photo_pending", "完成写真待ち"], ["quality_check", "最終確認"],
      ["completed", "制作完了"], ["hold", "保留"], ["cancelled", "中止"],
    ];

    root.innerHTML = columns.map(([status, label]) => {
      const items = tasks.filter(task => task.detail_status === status);
      if (!items.length) return "";
      return `
        <section class="owner-kanban-column">
          <div class="owner-kanban-column-head"><span>${DPRO.escape(label)}</span><span>${items.length}件</span></div>
          <div class="owner-kanban-items">${items.map(productionCard).join("")}</div>
        </section>
      `;
    }).join("");

    DPRO.qsa(".owner-production-save", root).forEach(button => {
      button.addEventListener("click", () => saveProductionStatus(button));
    });
  }

  function productionCard(task) {
    const order = task.flower_orders || {};
    const item = task.flower_order_items || {};
    const customer = order.flower_customers || {};
    const priority = order.priority || task.priority || "normal";

    return `
      <article class="owner-production-card">
        <div class="owner-task-head">
          <div>
            <div class="owner-order-number">${DPRO.escape(order.order_number || "制作タスク")}</div>
            <div class="owner-order-meta">${DPRO.dateTime(task.production_due_at || task.end_at || order.production_due_at || order.requested_at)}</div>
          </div>
          ${priority !== "normal" ? `<span class="owner-task-priority">${DPRO.escape(priorityLabel(priority))}</span>` : ""}
        </div>
        <div class="owner-task-product">${DPRO.escape(item.product_name_snapshot || "商品")}${item.quantity ? ` × ${Number(item.quantity)}` : ""}</div>
        <div class="help">${DPRO.escape(customer.customer_name || "―")}${customer.phone ? `・${DPRO.escape(customer.phone)}` : ""}</div>
        <div class="owner-task-details">
          ${taskDetail("用途", DPRO.usageLabel(order.usage_type))}
          ${taskDetail("色・雰囲気", item.color_mood || "おまかせ")}
          ${taskDetail("制作ポイント", task.production_points ?? item.production_points ?? 0)}
          ${taskDetail("受取", DPRO.fulfillmentLabel(order.fulfillment_type))}
        </div>
        ${item.flower_preferences || item.preferred_flowers ? `<div class="owner-order-note">${DPRO.escape(item.preferred_flowers || item.flower_preferences)}</div>` : ""}
        ${item.avoid_flowers ? `<div class="owner-order-note">避けたい花：${DPRO.escape(item.avoid_flowers)}</div>` : ""}
        <div class="owner-task-actions">
          <select class="owner-production-status" data-task-id="${DPRO.escape(task.id)}">${productionStatusOptions(task.detail_status)}</select>
          <button type="button" class="btn btn-primary btn-small owner-production-save" data-task-id="${DPRO.escape(task.id)}" data-version="${Number(task.version_number || 1)}">工程を保存</button>
        </div>
      </article>
    `;
  }

  async function saveProductionStatus(button) {
    const taskId = button.dataset.taskId;
    const select = DPRO.qs(`.owner-production-status[data-task-id="${cssEscape(taskId)}"]`);
    DPRO.setButtonBusy(button, true, "保存中…");

    try {
      await DPRO.api(`/api/admin/production/${taskId}/status`, {
        method: "PATCH",
        admin: true,
        body: {
          status: select.value,
          version_number: Number(button.dataset.version || 1),
          note: "オーナーPC画面から更新",
        },
      });
      await Promise.all([loadProduction(), loadDashboard()]);
      DPRO.setAlert(pageAlert, "制作工程を更新しました。", "info");
    } catch (error) {
      showPageError(error);
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  async function loadPickup() {
    const date = DPRO.qs("#pickupDate").value || DPRO.todayJst();
    const status = DPRO.qs("#pickupStatusFilter").value;
    const params = new URLSearchParams({ limit: "300", from: date, to: date });
    if (status) params.set("status", status);

    const root = DPRO.qs("#pickupBoard");
    root.innerHTML = `<div class="loading">店頭受取を読み込んでいます…</div>`;

    const data = await DPRO.api(`/api/admin/orders?${params}`, { admin: true });
    const visibleStatuses = new Set([
      "new", "reviewing", "confirmed", "payment_waiting", "production_waiting",
      "producing", "completed", "pickup_waiting", "handed_over",
    ]);
    const orders = (data.orders || []).filter(order =>
      order.fulfillment_type === "pickup" && visibleStatuses.has(order.status)
    );
    renderPickup(orders);
    updateTimestamp();
  }

  function renderPickup(orders) {
    const root = DPRO.qs("#pickupBoard");
    if (!orders.length) {
      root.innerHTML = `<div class="owner-empty">この日の店頭受取はありません。</div>`;
      return;
    }

    root.innerHTML = orders.map(order => `
      <article class="owner-pickup-card">
        <div class="owner-task-head"><div class="owner-order-number">${DPRO.escape(order.order_number)}</div>${DPRO.statusBadge(order.status)}</div>
        <div class="owner-pickup-time">${DPRO.dateTime(order.requested_at)}</div>
        <h3>${DPRO.escape(order.flower_customers?.customer_name || "―")}</h3>
        <div class="help">${DPRO.escape(order.flower_customers?.phone || "")}</div>
        <div class="owner-task-product">${orderItemsText(order)}</div>
        <div class="owner-order-actions">
          <select class="owner-pickup-status" data-order-id="${DPRO.escape(order.id)}">${orderStatusOptions(order.status)}</select>
          <button type="button" class="btn btn-primary btn-small owner-pickup-save" data-order-id="${DPRO.escape(order.id)}">状態を保存</button>
        </div>
      </article>
    `).join("");

    DPRO.qsa(".owner-pickup-save", root).forEach(button => {
      button.addEventListener("click", async () => {
        const orderId = button.dataset.orderId;
        const select = DPRO.qs(`.owner-pickup-status[data-order-id="${cssEscape(orderId)}"]`);
        DPRO.setButtonBusy(button, true, "保存中…");
        try {
          await DPRO.api(`/api/admin/orders/${orderId}/status`, {
            method: "PATCH",
            admin: true,
            body: { status: select.value, updated_by: "owner-next-pickup" },
          });
          await Promise.all([loadPickup(), loadDashboard()]);
        } catch (error) {
          showPageError(error);
        } finally {
          DPRO.setButtonBusy(button, false);
        }
      });
    });
  }

  async function loadDelivery() {
    const date = DPRO.qs("#deliveryDate").value || DPRO.todayJst();
    const status = DPRO.qs("#deliveryStatusFilter").value;
    const params = new URLSearchParams({ date });
    if (status) params.set("status", status);

    const root = DPRO.qs("#deliveryBoard");
    root.innerHTML = `<div class="loading">配達タスクを読み込んでいます…</div>`;

    const data = await DPRO.api(`/api/admin/delivery-board?${params}`, { admin: true });
    renderBoardSummary(DPRO.qs("#deliverySummary"), data.summary || {}, deliveryLabel);
    renderDelivery(data.tasks || []);
    updateTimestamp();
  }

  function renderDelivery(tasks) {
    const root = DPRO.qs("#deliveryBoard");
    if (!tasks.length) {
      root.innerHTML = `<div class="owner-empty">この日の配達タスクはありません。</div>`;
      return;
    }

    root.innerHTML = tasks.map(task => {
      const order = task.flower_orders || {};
      const customer = order.flower_customers || {};
      const recipient = Array.isArray(order.flower_order_recipients)
        ? order.flower_order_recipients[0]
        : order.flower_order_recipients || {};
      const address = [
        recipient.postal_code, recipient.prefecture, recipient.city,
        recipient.address_line1, recipient.address_line2,
      ].filter(Boolean).join(" ");

      return `
        <article class="owner-delivery-card">
          <div class="owner-delivery-time">
            <strong>${formatTime(task.scheduled_end_at || order.requested_at)}</strong>
            <span>${task.route_order != null ? `配達順 ${Number(task.route_order)}` : "配達"}</span>
          </div>
          <div>
            <div class="owner-task-head">
              <div><div class="owner-order-number">${DPRO.escape(order.order_number || "配達タスク")}</div><div class="owner-order-meta">${DPRO.escape(deliveryLabel(task.detail_status))}</div></div>
              ${DPRO.statusBadge(order.status)}
            </div>
            <h3>${DPRO.escape(recipient.recipient_name || customer.customer_name || "―")}</h3>
            <div class="help">${DPRO.escape(recipient.recipient_phone || customer.phone || "")}${recipient.company_or_facility_name ? `・${DPRO.escape(recipient.company_or_facility_name)}` : ""}</div>
            <div class="owner-delivery-address">${DPRO.escape(address || "住所未登録")}</div>
            ${recipient.delivery_note ? `<div class="owner-order-note">${DPRO.escape(recipient.delivery_note)}</div>` : ""}
          </div>
          <div class="owner-task-actions">
            <select class="owner-delivery-status" data-task-id="${DPRO.escape(task.id)}">${deliveryStatusOptions(task.detail_status)}</select>
            <button type="button" class="btn btn-primary btn-small owner-delivery-save" data-task-id="${DPRO.escape(task.id)}" data-version="${Number(task.version_number || 1)}">工程を保存</button>
          </div>
        </article>
      `;
    }).join("");

    DPRO.qsa(".owner-delivery-save", root).forEach(button => {
      button.addEventListener("click", () => saveDeliveryStatus(button));
    });
  }

  async function saveDeliveryStatus(button) {
    const taskId = button.dataset.taskId;
    const select = DPRO.qs(`.owner-delivery-status[data-task-id="${cssEscape(taskId)}"]`);
    DPRO.setButtonBusy(button, true, "保存中…");

    try {
      await DPRO.api(`/api/admin/delivery/${taskId}/status`, {
        method: "PATCH",
        admin: true,
        body: {
          status: select.value,
          version_number: Number(button.dataset.version || 1),
          note: "オーナーPC画面から更新",
        },
      });
      await Promise.all([loadDelivery(), loadDashboard()]);
      DPRO.setAlert(pageAlert, "配達工程を更新しました。", "info");
    } catch (error) {
      showPageError(error);
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  async function loadProducts() {
    const params = new URLSearchParams({ limit: "500" });
    const q = DPRO.qs("#productQuery").value.trim();
    const published = DPRO.qs("#productPublishedFilter").value;
    if (q) params.set("q", q);
    if (published) params.set("published", published);

    const root = DPRO.qs("#productAdminGrid");
    root.innerHTML = `<div class="loading">商品を読み込んでいます…</div>`;

    const [productData, categoryData] = await Promise.all([
      DPRO.api(`/api/admin/products?${params}`, { admin: true }),
      DPRO.api("/api/admin/categories", { admin: true }),
    ]);

    state.products = productData.products || [];
    state.categories = categoryData.categories || [];
    DPRO.qs("#productResultCount").textContent =
      `${state.products.length}商品・${state.categories.filter(c => c.is_published !== false).length}公開カテゴリ`;

    renderProducts();
    renderCategories();
    updateProductCategorySelect();
    updateTimestamp();
  }

  function renderProducts() {
    const root = DPRO.qs("#productAdminGrid");
    if (!state.products.length) {
      root.innerHTML = `<div class="owner-empty">条件に合う商品はありません。</div>`;
      return;
    }

    root.innerHTML = state.products.map(product => `
      <article class="owner-product-admin-card">
        ${product.main_photo_url
          ? `<img class="owner-product-admin-photo" src="${DPRO.escape(product.main_photo_url)}" alt="${DPRO.escape(product.product_name || "商品写真")}" loading="lazy">`
          : `<div class="owner-product-admin-photo">💐</div>`}
        <div class="owner-product-admin-body">
          <div class="owner-product-admin-category">${DPRO.escape(product.flower_product_categories?.category_name || "未分類")}</div>
          <div class="owner-product-admin-head">
            <h3>${DPRO.escape(product.product_name)}</h3>
            <strong>${DPRO.escape(productPriceLabel(product))}</strong>
          </div>
          <div class="help">${DPRO.escape(product.product_code || "")}</div>
          <div class="owner-product-statuses">
            <span class="owner-mini-badge ${product.is_published ? "" : "off"}">${product.is_published ? "公開" : "非公開"}</span>
            <span class="owner-mini-badge ${product.is_sold_out ? "off" : ""}">${product.is_sold_out ? "売り切れ" : "受付中"}</span>
            ${product.is_featured ? `<span class="owner-mini-badge">おすすめ</span>` : ""}
            <span class="owner-mini-badge">制作 ${Number(product.production_points || 0)}pt</span>
          </div>
          <div class="owner-product-actions">
            <button type="button" class="btn btn-primary btn-small owner-edit-product" data-product-id="${DPRO.escape(product.id)}">編集・写真</button>
            <a class="btn btn-secondary btn-small" href="catalog.html?product=${encodeURIComponent(product.public_slug || "")}" target="_blank" rel="noopener">公開表示</a>
          </div>
        </div>
      </article>
    `).join("");

    DPRO.qsa(".owner-edit-product", root).forEach(button => {
      button.addEventListener("click", () => {
        const product = state.products.find(item => item.id === button.dataset.productId);
        openProductEditor(product || null);
      });
    });
  }

  function renderCategories() {
    const root = DPRO.qs("#categoryList");
    if (!state.categories.length) {
      root.innerHTML = `<div class="owner-empty">カテゴリがありません。</div>`;
      return;
    }

    root.innerHTML = state.categories.map(category => `
      <div class="owner-category-row" data-category-id="${DPRO.escape(category.id)}">
        <div class="field"><label>アイコン</label><input class="category-icon" value="${DPRO.escape(category.icon_name || "✿")}" maxlength="20"></div>
        <div class="field"><label>カテゴリ名</label><input class="category-name" value="${DPRO.escape(category.category_name || "")}" maxlength="160"></div>
        <div class="field"><label>表示順</label><input class="category-order" type="number" min="0" value="${Number(category.display_order || 0)}"></div>
        <label class="owner-check-row"><input class="category-published" type="checkbox" ${category.is_published !== false ? "checked" : ""}><span>公開</span></label>
        <button type="button" class="btn btn-secondary btn-small category-save">保存</button>
      </div>
    `).join("");

    DPRO.qsa(".category-save", root).forEach(button => {
      button.addEventListener("click", () => saveCategory(button));
    });
  }

  async function saveCategory(button) {
    const row = button.closest("[data-category-id]");
    const categoryId = row.dataset.categoryId;
    DPRO.setButtonBusy(button, true, "保存中…");

    try {
      await DPRO.api(`/api/admin/categories/${categoryId}`, {
        method: "PATCH",
        admin: true,
        body: {
          category_name: DPRO.qs(".category-name", row).value,
          icon_name: DPRO.qs(".category-icon", row).value,
          display_order: Number(DPRO.qs(".category-order", row).value || 0),
          is_published: DPRO.qs(".category-published", row).checked,
        },
      });
      await loadProducts();
      DPRO.setAlert(pageAlert, "カテゴリを更新しました。", "info");
    } catch (error) {
      showPageError(error);
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  async function createCategory(event) {
    event.preventDefault();
    const button = event.submitter;
    DPRO.setButtonBusy(button, true, "追加中…");

    try {
      await DPRO.api("/api/admin/categories", {
        method: "POST",
        admin: true,
        body: {
          category_name: DPRO.qs("#newCategoryName").value,
          category_code: DPRO.qs("#newCategoryCode").value,
          icon_name: DPRO.qs("#newCategoryIcon").value,
          display_order: Number(DPRO.qs("#newCategoryOrder").value || 100),
          is_published: true,
        },
      });
      event.target.reset();
      DPRO.qs("#newCategoryIcon").value = "✿";
      DPRO.qs("#newCategoryOrder").value = "100";
      await loadProducts();
    } catch (error) {
      showPageError(error);
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  function openProductEditor(product) {
    state.currentEditingProduct = product;
    DPRO.setAlert(productEditorAlert, "");

    setValue("#editProductId", product?.id || "");
    setValue("#editProductName", product?.product_name || "");
    setValue("#editProductCode", product?.product_code || "");
    setValue("#editProductType", product?.product_type || "made_to_order");
    setValue("#editPriceType", product?.price_display_type || "from");
    setValue("#editUnitLabel", product?.unit_label || "点");
    setValue("#editMinimumPrice", product?.minimum_price ?? 0);
    setValue("#editDefaultPrice", product?.default_price ?? 0);
    setValue("#editSizeLabel", product?.size_label || "");
    setValue("#editSeasonalLabel", product?.seasonal_label || "");
    setValue("#editShortDescription", product?.short_description || product?.description || "");
    setValue("#editDetailDescription", product?.detail_description || product?.description || "");
    setValue("#editProductionPoints", product?.production_points ?? 1);
    setValue("#editLeadMinutes", product?.lead_time_minutes ?? product?.lead_minutes ?? 0);
    setValue("#editLeadDays", product?.lead_time_days ?? 0);
    setValue("#editStockMode", product?.stock_mode || "unlimited");
    setValue("#editAvailableStock", product?.available_stock ?? "");
    setValue("#editDailyLimit", product?.daily_order_limit ?? "");
    setValue("#editDisplayOrder", product?.display_order ?? product?.sort_order ?? 100);

    setChecked("#editPickupEnabled", product?.pickup_enabled !== false);
    setChecked("#editDeliveryEnabled", product?.delivery_enabled !== false);
    setChecked("#editConsultationEnabled", product?.consultation_enabled !== false);
    setChecked("#editFeatured", product?.is_featured === true);
    setChecked("#editSoldOut", product?.is_sold_out === true);
    setChecked("#editPublished", product?.is_published !== false);
    setChecked("#editActive", product?.is_active !== false);
    setChecked("#editRequiresQuote", product?.requires_quote === true);
    setChecked("#editRequiresSignboard", product?.requires_signboard === true);
    setChecked("#editRequiresRecipient", product?.requires_recipient === true);

    DPRO.qs("#productEditorTitle").textContent = product ? "商品を編集" : "新しい商品を登録";
    DPRO.qs("#productPhotoSection").classList.toggle("hidden", !product);
    renderProductPhotos(product);
    updateProductCategorySelect(product?.category_id || "");

    if (typeof productDialog.showModal === "function") {
      productDialog.showModal();
    } else {
      productDialog.setAttribute("open", "");
    }
    document.body.style.overflow = "hidden";
  }

  function closeProductEditor() {
    if (typeof productDialog.close === "function" && productDialog.open) {
      productDialog.close();
    } else {
      productDialog.removeAttribute("open");
    }
    document.body.style.overflow = "";
    state.currentEditingProduct = null;
  }

  function updateProductCategorySelect(selectedValue = null) {
    const select = DPRO.qs("#editProductCategory");
    const current = selectedValue !== null ? selectedValue : select.value;

    select.innerHTML =
      `<option value="">未分類</option>` +
      state.categories
        .filter(category => category.is_published !== false || category.id === current)
        .map(category => `
          <option value="${DPRO.escape(category.id)}">${DPRO.escape(category.icon_name || "✿")} ${DPRO.escape(category.category_name)}</option>
        `).join("");
    select.value = current || "";
  }

  async function saveProduct(event) {
    event.preventDefault();
    DPRO.setAlert(productEditorAlert, "");
    if (!productForm.reportValidity()) return;

    const productId = DPRO.qs("#editProductId").value;
    const body = {
      product_name: DPRO.qs("#editProductName").value,
      product_code: DPRO.qs("#editProductCode").value || undefined,
      category_id: DPRO.qs("#editProductCategory").value || null,
      product_type: DPRO.qs("#editProductType").value,
      price_display_type: DPRO.qs("#editPriceType").value,
      unit_label: DPRO.qs("#editUnitLabel").value,
      minimum_price: Number(DPRO.qs("#editMinimumPrice").value || 0),
      default_price: Number(DPRO.qs("#editDefaultPrice").value || 0),
      size_label: DPRO.qs("#editSizeLabel").value,
      seasonal_label: DPRO.qs("#editSeasonalLabel").value || null,
      short_description: DPRO.qs("#editShortDescription").value,
      detail_description: DPRO.qs("#editDetailDescription").value,
      description: DPRO.qs("#editShortDescription").value,
      production_points: Number(DPRO.qs("#editProductionPoints").value || 0),
      lead_time_minutes: Number(DPRO.qs("#editLeadMinutes").value || 0),
      lead_time_days: Number(DPRO.qs("#editLeadDays").value || 0),
      stock_mode: DPRO.qs("#editStockMode").value,
      available_stock: nullableNumber(DPRO.qs("#editAvailableStock").value),
      daily_order_limit: nullableNumber(DPRO.qs("#editDailyLimit").value),
      display_order: Number(DPRO.qs("#editDisplayOrder").value || 100),
      pickup_enabled: DPRO.qs("#editPickupEnabled").checked,
      delivery_enabled: DPRO.qs("#editDeliveryEnabled").checked,
      consultation_enabled: DPRO.qs("#editConsultationEnabled").checked,
      is_featured: DPRO.qs("#editFeatured").checked,
      is_sold_out: DPRO.qs("#editSoldOut").checked,
      is_published: DPRO.qs("#editPublished").checked,
      is_active: DPRO.qs("#editActive").checked,
      requires_quote: DPRO.qs("#editRequiresQuote").checked,
      requires_signboard: DPRO.qs("#editRequiresSignboard").checked,
      requires_recipient: DPRO.qs("#editRequiresRecipient").checked,
    };

    const button = DPRO.qs("#saveProductButton");
    DPRO.setButtonBusy(button, true, "保存中…");

    try {
      const data = await DPRO.api(
        productId ? `/api/admin/products/${productId}` : "/api/admin/products",
        {
          method: productId ? "PATCH" : "POST",
          admin: true,
          body,
        }
      );

      const savedProduct = data.product;
      state.currentEditingProduct = savedProduct;
      setValue("#editProductId", savedProduct.id);
      DPRO.qs("#productPhotoSection").classList.remove("hidden");
      DPRO.qs("#productEditorTitle").textContent = "商品を編集";
      renderProductPhotos(savedProduct);
      await loadProducts();
      DPRO.setAlert(
        productEditorAlert,
        productId ? "商品を更新しました。" : "商品を登録しました。写真も追加できます。",
        "info"
      );
    } catch (error) {
      DPRO.setAlert(productEditorAlert, error.message, "error");
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  async function uploadProductPhoto() {
    const productId = DPRO.qs("#editProductId").value;
    const file = DPRO.qs("#productPhotoFile").files[0];

    if (!productId) {
      DPRO.setAlert(productEditorAlert, "先に商品を保存してください。", "error");
      return;
    }
    if (!file) {
      DPRO.setAlert(productEditorAlert, "追加する写真を選択してください。", "error");
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      DPRO.setAlert(productEditorAlert, "写真は10MB以内にしてください。", "error");
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      DPRO.setAlert(productEditorAlert, "JPEG・PNG・WebPを選択してください。", "error");
      return;
    }

    const button = DPRO.qs("#uploadProductPhoto");
    DPRO.setButtonBusy(button, true, "送信中…");

    try {
      const base64Data = await fileToBase64(file);
      await DPRO.api(`/api/admin/products/${productId}/photos`, {
        method: "POST",
        admin: true,
        body: {
          filename: file.name,
          mime_type: file.type,
          base64_data: base64Data,
          is_primary: DPRO.qs("#productPhotoPrimary").checked,
          alt_text: DPRO.qs("#editProductName").value,
        },
      });
      DPRO.qs("#productPhotoFile").value = "";
      DPRO.qs("#productPhotoPrimary").checked = false;
      await loadProducts();
      const updated = state.products.find(product => product.id === productId);
      state.currentEditingProduct = updated || state.currentEditingProduct;
      renderProductPhotos(state.currentEditingProduct);
      DPRO.setAlert(productEditorAlert, "商品写真を追加しました。", "info");
    } catch (error) {
      DPRO.setAlert(productEditorAlert, error.message, "error");
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  function renderProductPhotos(product) {
    const root = DPRO.qs("#productPhotoList");
    const photos = product?.flower_product_photos || [];
    if (!photos.length) {
      root.innerHTML = `<div class="owner-empty">商品写真はまだありません。</div>`;
      return;
    }

    root.innerHTML = photos.map(photo => `
      <article class="owner-photo-item">
        <img src="${DPRO.escape(photo.public_url)}" alt="${DPRO.escape(photo.alt_text || product.product_name || "商品写真")}" loading="lazy">
        <div class="owner-photo-item-foot">
          <span>${photo.is_primary ? "メイン写真" : "商品写真"}</span>
          <button type="button" class="btn btn-danger btn-small owner-delete-photo" data-photo-id="${DPRO.escape(photo.id)}">削除</button>
        </div>
      </article>
    `).join("");

    DPRO.qsa(".owner-delete-photo", root).forEach(button => {
      button.addEventListener("click", () => deleteProductPhoto(button));
    });
  }

  async function deleteProductPhoto(button) {
    const productId = DPRO.qs("#editProductId").value;
    const photoId = button.dataset.photoId;
    if (!confirm("この商品写真を削除しますか？")) return;

    DPRO.setButtonBusy(button, true, "削除中…");
    try {
      await DPRO.api(`/api/admin/products/${productId}/photos/${photoId}`, {
        method: "DELETE",
        admin: true,
      });
      await loadProducts();
      const updated = state.products.find(product => product.id === productId);
      state.currentEditingProduct = updated || state.currentEditingProduct;
      renderProductPhotos(state.currentEditingProduct);
    } catch (error) {
      DPRO.setAlert(productEditorAlert, error.message, "error");
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  async function searchCustomers() {
    const q = DPRO.qs("#customerQuery").value.trim();
    const root = DPRO.qs("#customerResults");

    if (!q) {
      root.innerHTML = `<div class="owner-empty">検索文字を入力してください。</div>`;
      return;
    }

    root.innerHTML = `<div class="loading">顧客を検索しています…</div>`;
    const data = await DPRO.api(
      `/api/admin/customers/search?q=${encodeURIComponent(q)}&limit=100`,
      { admin: true }
    );
    state.customers = data.customers || [];
    renderCustomers();
    updateTimestamp();
  }

  function renderCustomers() {
    const root = DPRO.qs("#customerResults");
    if (!state.customers.length) {
      root.innerHTML = `<div class="owner-empty">該当する顧客はありません。</div>`;
      return;
    }

    root.innerHTML = state.customers.map(customer => `
      <button type="button" class="owner-customer-choice ${state.selectedCustomerId === customer.id ? "active" : ""}" data-customer-id="${DPRO.escape(customer.id || customer.customer_id || "")}">
        <strong>${DPRO.escape(customer.customer_name || "氏名未登録")}</strong>
        <span>${DPRO.escape(customer.phone || "")}</span>
        <span>${DPRO.escape(customer.company_name || customer.customer_number || "")}</span>
        <span>注文 ${Number(customer.order_count || 0)}回・累計 ${DPRO.yen(customer.total_spend || 0)}</span>
      </button>
    `).join("");

    DPRO.qsa("[data-customer-id]", root).forEach(button => {
      button.addEventListener("click", () => loadCustomerDetail(button.dataset.customerId));
    });
  }

  async function loadCustomerDetail(customerId) {
    if (!customerId) return;
    state.selectedCustomerId = customerId;
    renderCustomers();

    const root = DPRO.qs("#customerDetail");
    root.innerHTML = `<div class="loading">顧客情報を読み込んでいます…</div>`;

    try {
      const data = await DPRO.api(
        `/api/admin/customers/detail?customer_id=${encodeURIComponent(customerId)}`,
        { admin: true }
      );
      renderCustomerDetail(data);
    } catch (error) {
      root.innerHTML = `<div class="alert alert-error">${DPRO.escape(error.message)}</div>`;
    }
  }

  function renderCustomerDetail(data) {
    const customer = data.customer || {};
    const addresses = data.addresses || [];
    const anniversaries = data.anniversaries || [];
    const orders = data.orders || [];

    DPRO.qs("#customerDetail").innerHTML = `
      <div class="owner-customer-card-head">
        <div><div class="owner-order-number">${DPRO.escape(customer.customer_name || "氏名未登録")}</div><div class="owner-order-meta">${DPRO.escape(customer.customer_number || "")}</div></div>
        <a class="btn btn-primary btn-small" href="counter.html?demo=1&customer_id=${encodeURIComponent(customer.id || "")}">この顧客で注文受付</a>
      </div>

      <div class="owner-order-grid">
        <div class="owner-order-block"><span>電話番号</span><strong>${DPRO.escape(customer.phone || "―")}</strong></div>
        <div class="owner-order-block"><span>会社名</span><strong>${DPRO.escape(customer.company_name || "―")}</strong></div>
        <div class="owner-order-block"><span>LINE連携</span><strong>${customer.line_user_id ? "連携済み" : "未連携"}</strong></div>
      </div>

      <h3>登録届け先 ${addresses.length}件</h3>
      ${addresses.length ? addresses.map(address => `
        <div class="owner-customer-order">
          <strong>${DPRO.escape(address.address_label || address.recipient_name || "届け先")}</strong>
          <div class="help">${DPRO.escape([
            address.company_or_facility_name, address.venue_name,
            address.prefecture, address.city, address.address_line1, address.address_line2,
          ].filter(Boolean).join(" "))}</div>
        </div>
      `).join("") : `<div class="help">登録届け先はありません。</div>`}

      <h3>記念日 ${anniversaries.length}件</h3>
      ${anniversaries.length ? anniversaries.map(item => `
        <div class="owner-customer-order">
          <strong>${DPRO.escape(item.title || "記念日")}</strong>
          <div class="help">${DPRO.escape(item.anniversary_date || "")}・${DPRO.yen(item.preferred_budget || 0)}</div>
        </div>
      `).join("") : `<div class="help">記念日は登録されていません。</div>`}

      <h3>注文履歴 ${orders.length}件</h3>
      <div class="owner-customer-order-list">
        ${orders.slice(0, 20).map(order => `
          <div class="owner-customer-order">
            <div class="owner-task-head"><strong>${DPRO.escape(order.order_number)}</strong>${DPRO.statusBadge(order.status)}</div>
            <div class="help">${DPRO.dateTime(order.requested_at)}・${DPRO.yen(order.total_amount)}</div>
            <div>${orderItemsText(order)}</div>
          </div>
        `).join("") || `<div class="help">注文履歴はありません。</div>`}
      </div>
    `;
  }

  async function loadCapacity() {
    const date = DPRO.qs("#capacityDate").value || DPRO.todayJst();
    const data = await DPRO.api(
      `/api/admin/production-capacity?date=${encodeURIComponent(date)}`,
      { admin: true }
    );
    renderCapacityRules(data.rules || []);
    renderCapacityOverrides(data.overrides || []);
    updateTimestamp();
  }

  function renderCapacityRules(rules) {
    const root = DPRO.qs("#capacityRules");
    if (!rules.length) {
      root.innerHTML = `<div class="owner-empty">通常設定はありません。</div>`;
      return;
    }

    root.innerHTML = `
      <table>
        <thead><tr><th>曜日</th><th>時間</th><th>最大ポイント</th><th>最大注文数</th><th>状態</th></tr></thead>
        <tbody>
          ${rules.map(rule => `
            <tr>
              <td>${DPRO.escape(weekdayLabel(rule.weekday))}</td>
              <td>${DPRO.escape(String(rule.slot_time || "").slice(0, 5))}</td>
              <td>${rule.max_points ?? "―"}</td>
              <td>${rule.max_orders ?? "―"}</td>
              <td>${rule.is_active !== false ? "有効" : "停止"}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  }

  function renderCapacityOverrides(overrides) {
    const root = DPRO.qs("#capacityOverrides");
    if (!overrides.length) {
      root.innerHTML = `<div class="owner-empty">この日の特別設定はありません。</div>`;
      return;
    }

    root.innerHTML = overrides.map(item => `
      <div class="owner-capacity-item">
        <strong>${DPRO.escape(item.target_date || "")}</strong>
        <span>${item.slot_time ? DPRO.escape(String(item.slot_time).slice(0, 5)) : "終日"}</span>
        <span>${item.is_closed
          ? `受付停止${item.reason ? `・${DPRO.escape(item.reason)}` : ""}`
          : `最大 ${item.max_points ?? "―"}pt・${item.max_orders ?? "―"}件`}</span>
      </div>
    `).join("");
  }

  async function saveCapacityOverride(event) {
    event.preventDefault();
    const button = event.submitter;
    DPRO.setButtonBusy(button, true, "保存中…");

    try {
      await DPRO.api("/api/admin/production-capacity", {
        method: "PUT",
        admin: true,
        body: {
          overrides: [{
            target_date: DPRO.qs("#capacityDate").value,
            slot_time: DPRO.qs("#capacitySlot").value || null,
            max_points: nullableNumber(DPRO.qs("#capacityMaxPoints").value),
            max_orders: nullableNumber(DPRO.qs("#capacityMaxOrders").value),
            is_closed: DPRO.qs("#capacityClosed").checked,
            reason: DPRO.qs("#capacityReason").value,
          }],
        },
      });
      await loadCapacity();
      DPRO.setAlert(pageAlert, "日付別の特別設定を保存しました。", "info");
    } catch (error) {
      showPageError(error);
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  async function saveCapacityRule(event) {
    event.preventDefault();
    const button = event.submitter;
    DPRO.setButtonBusy(button, true, "保存中…");

    try {
      await DPRO.api("/api/admin/production-capacity", {
        method: "PUT",
        admin: true,
        body: {
          rules: [{
            weekday: Number(DPRO.qs("#capacityWeekday").value),
            slot_time: DPRO.qs("#capacityRuleTime").value,
            max_points: Number(DPRO.qs("#capacityRulePoints").value || 0),
            max_orders: Number(DPRO.qs("#capacityRuleOrders").value || 0),
            is_active: DPRO.qs("#capacityRuleActive").checked,
          }],
        },
      });
      await loadCapacity();
      DPRO.setAlert(pageAlert, "通常の制作上限を保存しました。", "info");
    } catch (error) {
      showPageError(error);
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  async function runSystemCheck() {
    const button = DPRO.qs("#runSystemCheck");
    const root = DPRO.qs("#systemCheckResult");
    DPRO.setButtonBusy(button, true, "検査中…");
    root.innerHTML = `<div class="loading">システムを検査しています…</div>`;

    try {
      const data = await DPRO.api("/api/admin/system-check", { admin: true });
      const checks = flattenChecks(data);
      root.innerHTML = `
        <div class="notice">総合判定：<strong>${data.ok ? "正常" : "要確認"}</strong>・Worker ${DPRO.escape(data.version || "")}</div>
        <div class="owner-system-check-grid">
          ${checks.map(check => `
            <div class="owner-check-item ${check.ok ? "ok" : "ng"}">
              <span>${check.ok ? "✓" : "!"}</span>
              <span>${DPRO.escape(check.label)}：${DPRO.escape(check.value)}</span>
            </div>
          `).join("")}
        </div>
      `;
      updateTimestamp();
    } catch (error) {
      root.innerHTML = `<div class="alert alert-error">${DPRO.escape(error.message)}</div>`;
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  function flattenChecks(data) {
    const rows = [];
    const walk = (value, path) => {
      if (typeof value === "boolean") {
        rows.push({
          label: path.join(" / "),
          ok: value,
          value: value ? "正常" : "要確認",
        });
        return;
      }

      if (value === null || typeof value === "string" || typeof value === "number") {
        if (path.length && rows.length < 80) {
          rows.push({
            label: path.join(" / "),
            ok: value !== null,
            value: String(value ?? "未設定"),
          });
        }
        return;
      }

      if (Array.isArray(value)) return;
      if (value && typeof value === "object") {
        Object.entries(value).forEach(([key, child]) => {
          if (["time", "request_id"].includes(key)) return;
          walk(child, [...path, key]);
        });
      }
    };

    walk({
      ok: data.ok,
      database: data.database?.ok,
      next_database: data.next_database?.ok,
      worker_tests: data.worker_tests,
      next_tests: data.next_tests,
    }, []);

    return rows.slice(0, 80);
  }

  function renderBoardSummary(root, summary, labelFunction) {
    const entries = Object.entries(summary)
      .filter(([key, value]) => key !== "total" && Number(value) > 0);

    root.innerHTML = `
      <span class="owner-summary-chip">合計 ${Number(summary.total || 0)}件</span>
      ${entries.map(([key, value]) => `
        <span class="owner-summary-chip">${DPRO.escape(labelFunction(key))} ${Number(value)}件</span>
      `).join("")}
    `;
  }

  function updateNavBadge(selector, value) {
    const element = DPRO.qs(selector);
    element.textContent = String(value);
    element.classList.toggle("hidden", Number(value) <= 0);
  }

  function setText(selector, value) {
    const element = DPRO.qs(selector);
    if (element) element.textContent = String(value);
  }

  function setValue(selector, value) {
    const element = DPRO.qs(selector);
    if (element) element.value = value ?? "";
  }

  function setChecked(selector, value) {
    const element = DPRO.qs(selector);
    if (element) element.checked = Boolean(value);
  }

  function taskDetail(label, value) {
    return `
      <div class="owner-task-detail">
        <span>${DPRO.escape(label)}</span>
        <strong>${DPRO.escape(value ?? "―")}</strong>
      </div>
    `;
  }

  function orderItemsText(order) {
    const items = order.flower_order_items || [];
    return items.length
      ? items.map(item =>
          `${DPRO.escape(item.product_name_snapshot || "商品")} × ${Number(item.quantity || 1)}`
        ).join("<br>")
      : "商品情報なし";
  }

  function paymentLabel(value) {
    return ({
      unpaid: "未入金",
      partially_paid: "一部入金",
      paid: "入金済み",
      refunded: "返金済み",
      cancelled: "取消",
    })[value] || value || "未設定";
  }

  function priorityLabel(value) {
    return ({
      urgent: "緊急",
      high: "優先",
      normal: "通常",
      low: "低",
    })[value] || value;
  }

  function productionLabel(value) {
    return ({
      materials_check: "花材確認",
      waiting: "制作待ち",
      assigned: "担当決定",
      producing: "制作中",
      photo_pending: "完成写真待ち",
      quality_check: "最終確認",
      completed: "制作完了",
      hold: "保留",
      cancelled: "中止",
    })[value] || value || "未設定";
  }

  function deliveryLabel(value) {
    return ({
      waiting: "準備待ち",
      assigned: "担当決定",
      preparing: "配達準備",
      packed: "梱包済み",
      loaded: "積込済み",
      departed: "出発",
      arrived: "到着",
      delivered: "配達完了",
      absent: "不在",
      failed: "配達不能",
      returned: "持ち戻り",
      cancelled: "中止",
    })[value] || value || "未設定";
  }

  function orderStatusOptions(current) {
    const values = [
      ["new", "新規受付"], ["reviewing", "内容確認中"], ["quoted", "見積提示"],
      ["customer_waiting", "お客様確認待ち"], ["confirmed", "注文確定"],
      ["payment_waiting", "入金待ち"], ["production_waiting", "制作待ち"],
      ["producing", "制作中"], ["completed", "完成"], ["pickup_waiting", "店頭受取待ち"],
      ["delivery_preparing", "配達準備"], ["delivering", "配達中"],
      ["delivered", "配達完了"], ["handed_over", "引渡し完了"], ["cancelled", "キャンセル"],
    ];
    return values.map(([value, label]) =>
      `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`
    ).join("");
  }

  function productionStatusOptions(current) {
    return [
      ["materials_check", "花材確認"], ["waiting", "制作待ち"], ["assigned", "担当決定"],
      ["producing", "制作中"], ["photo_pending", "完成写真待ち"],
      ["quality_check", "最終確認"], ["completed", "制作完了"],
      ["hold", "保留"], ["cancelled", "中止"],
    ].map(([value, label]) =>
      `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`
    ).join("");
  }

  function deliveryStatusOptions(current) {
    return [
      ["waiting", "準備待ち"], ["assigned", "担当決定"], ["preparing", "配達準備"],
      ["packed", "梱包済み"], ["loaded", "積込済み"], ["departed", "出発"],
      ["arrived", "到着"], ["delivered", "配達完了"], ["absent", "不在"],
      ["failed", "配達不能"], ["returned", "持ち戻り"], ["cancelled", "中止"],
    ].map(([value, label]) =>
      `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`
    ).join("");
  }

  function productPriceLabel(product) {
    if (
      product.product_type === "consultation" ||
      product.price_display_type === "consultation"
    ) {
      return "価格はご相談";
    }

    const minimum = Number(product.minimum_price || 0);
    const standard = Number(product.default_price || minimum || 0);
    if (product.price_display_type === "from" || standard > minimum) {
      return `${DPRO.yen(minimum || standard)}〜`;
    }
    return DPRO.yen(standard || minimum);
  }

  function weekdayLabel(value) {
    return ["日", "月", "火", "水", "木", "金", "土"][Number(value)] || value;
  }

  function formatTime(value) {
    if (!value) return "未設定";
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }

  function nullableNumber(value) {
    return value === "" || value === null || value === undefined
      ? null
      : Number(value);
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = String(reader.result || "");
        resolve(text.includes(",") ? text.split(",").pop() : text);
      };
      reader.onerror = () => reject(new Error("写真を読み込めませんでした。"));
      reader.readAsDataURL(file);
    });
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return CSS.escape(String(value));
    return String(value).replace(/["\\]/g, "\\$&");
  }
});
