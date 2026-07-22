document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const PAGE_VERSION = "FLOWER-NEXT-8-IPAD-20260722";

  const state = {
    authenticated: false,
    orders: [],
    activeFilter: "all",
    loading: false,
  };

  const lock = DPRO.qs("#adminLock");
  const app = DPRO.qs("#ipadApp");
  const codeInput = DPRO.qs("#adminCode");
  const dateInput = DPRO.qs("#date");
  const alertRoot = DPRO.qs("#alert");
  const ordersRoot = DPRO.qs("#orders");

  initializeDate();
  enhanceDateInput();
  bindEvents();

  codeInput.value = DPRO.getAdminCode();
  DPRO.qs("#appVersion").textContent = PAGE_VERSION;

  if (DPRO.getAdminCode()) login();

  function initializeDate() {
    dateInput.value = DPRO.todayJst();
  }

  function enhanceDateInput() {
    if (dateInput.closest(".ipad-date-control")) return;

    const wrapper = document.createElement("div");
    wrapper.className = "ipad-date-control";

    const readable = document.createElement("span");
    readable.className = "ipad-date-readable";
    readable.setAttribute("aria-hidden", "true");

    dateInput.parentNode.insertBefore(wrapper, dateInput);
    wrapper.appendChild(dateInput);
    wrapper.appendChild(readable);

    const update = () => {
      readable.textContent = formatReadableDate(dateInput.value);
    };

    dateInput.addEventListener("input", update);
    dateInput.addEventListener("change", update);
    update();
  }

  function bindEvents() {
    DPRO.qs("#loginButton").addEventListener("click", login);
    codeInput.addEventListener("keydown", event => {
      if (event.key === "Enter") login();
    });

    DPRO.qs("#clearCodeButton").addEventListener("click", clearSavedCode);
    DPRO.qs("#logoutButton").addEventListener("click", logout);
    DPRO.qs("#reload").addEventListener("click", load);

    DPRO.qsa("[data-filter]").forEach(button => {
      button.addEventListener("click", () => setFilter(button.dataset.filter));
    });

    DPRO.qs("#orderSearch").addEventListener("input", render);
    DPRO.qs("#showCompleted").addEventListener("change", render);
  }

  async function login() {
    const code = codeInput.value.trim() || DPRO.getAdminCode();

    if (!code) {
      DPRO.setAlert(DPRO.qs("#loginAlert"), "管理コードを入力してください。", "error");
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
      await load();
    } catch (error) {
      DPRO.setAlert(DPRO.qs("#loginAlert"), error.message, "error");
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  function logout() {
    state.authenticated = false;
    app.classList.add("hidden");
    lock.classList.remove("hidden");
    codeInput.value = DPRO.getAdminCode();
    codeInput.focus();
  }

  function clearSavedCode() {
    DPRO.clearAdminCode();
    codeInput.value = "";
    DPRO.setAlert(
      DPRO.qs("#loginAlert"),
      "保存されている管理コードを削除しました。",
      "info"
    );
  }

  function setFilter(filter) {
    state.activeFilter = ["all", "attention", "pickup", "delivery", "completed"].includes(filter)
      ? filter
      : "all";

    DPRO.qsa("[data-filter]").forEach(button => {
      button.classList.toggle("active", button.dataset.filter === state.activeFilter);
    });

    render();
  }

  async function load() {
    if (state.loading) return;
    state.loading = true;

    const button = DPRO.qs("#reload");
    DPRO.setButtonBusy(button, true, "更新中…");
    DPRO.setAlert(alertRoot, "");
    ordersRoot.innerHTML = `<div class="card loading">注文を読み込んでいます…</div>`;

    try {
      const data = await DPRO.api(
        `/api/admin/dashboard?date=${encodeURIComponent(dateInput.value)}`,
        { admin: true }
      );

      state.orders = Array.isArray(data.today_orders)
        ? data.today_orders
        : [];

      renderCounts();
      render();
      updateLastUpdated();
    } catch (error) {
      DPRO.setAlert(alertRoot, error.message, "error");
      ordersRoot.innerHTML = "";
    } finally {
      state.loading = false;
      DPRO.setButtonBusy(button, false);
    }
  }

  function renderCounts() {
    const attentionStatuses = new Set([
      "new",
      "reviewing",
      "quoted",
      "customer_waiting",
    ]);
    const completedStatuses = new Set([
      "handed_over",
      "delivered",
      "cancelled",
    ]);

    setText("#countAll", state.orders.length);
    setText(
      "#countAttention",
      state.orders.filter(order => attentionStatuses.has(order.status)).length
    );
    setText(
      "#countPickup",
      state.orders.filter(order =>
        order.fulfillment_type === "pickup" &&
        order.status !== "cancelled"
      ).length
    );
    setText(
      "#countDelivery",
      state.orders.filter(order =>
        order.fulfillment_type === "delivery" &&
        order.status !== "cancelled"
      ).length
    );
    setText(
      "#countCompleted",
      state.orders.filter(order => completedStatuses.has(order.status)).length
    );
  }

  function filteredOrders() {
    const query = DPRO.qs("#orderSearch").value.trim().toLowerCase();
    const showCompleted = DPRO.qs("#showCompleted").checked;
    const attentionStatuses = new Set([
      "new",
      "reviewing",
      "quoted",
      "customer_waiting",
    ]);
    const completedStatuses = new Set([
      "handed_over",
      "delivered",
      "cancelled",
    ]);

    return state.orders
      .filter(order => {
        if (state.activeFilter === "attention") {
          return attentionStatuses.has(order.status);
        }

        if (state.activeFilter === "pickup") {
          return (
            order.fulfillment_type === "pickup" &&
            order.status !== "cancelled"
          );
        }

        if (state.activeFilter === "delivery") {
          return (
            order.fulfillment_type === "delivery" &&
            order.status !== "cancelled"
          );
        }

        if (state.activeFilter === "completed") {
          return completedStatuses.has(order.status);
        }

        if (!showCompleted && completedStatuses.has(order.status)) {
          return false;
        }

        return true;
      })
      .filter(order => {
        if (!query) return true;

        const customer = order.flower_customers || {};
        const items = Array.isArray(order.flower_order_items)
          ? order.flower_order_items
          : [];

        const haystack = [
          order.order_number,
          customer.customer_name,
          customer.phone,
          customer.company_name,
          ...items.map(item => item.product_name_snapshot),
        ].filter(Boolean).join(" ").toLowerCase();

        return haystack.includes(query);
      })
      .sort((a, b) =>
        String(a.requested_at || "").localeCompare(String(b.requested_at || ""))
      );
  }

  function render() {
    const orders = filteredOrders();

    if (!orders.length) {
      ordersRoot.innerHTML = `
        <div class="ipad-empty">
          <div>🌷</div>
          <strong>条件に合う注文はありません。</strong>
          <p>表示日・絞り込み・検索条件を確認してください。</p>
        </div>
      `;
      return;
    }

    ordersRoot.innerHTML = orders.map(order => {
      const customer = order.flower_customers || {};
      const phone = customer.phone || "";
      const completed = ["handed_over", "delivered", "cancelled"].includes(order.status);
      const action = primaryAction(order);
      const secondary = secondaryNotice(order);

      return `
        <article class="ipad-order-card ${completed ? "completed" : ""}">
          <header class="ipad-order-head">
            <div>
              <div class="ipad-order-number">${DPRO.escape(order.order_number || "")}</div>
              <div class="ipad-order-time">
                ${DPRO.dateTime(order.requested_at)}
                ・${DPRO.escape(DPRO.fulfillmentLabel(order.fulfillment_type))}
              </div>
            </div>
            ${DPRO.statusBadge(order.status)}
          </header>

          <div class="ipad-order-body">
            <div class="ipad-customer-row">
              <h2>${DPRO.escape(customer.customer_name || "お客様名未登録")}</h2>
              ${phone ? `
                <a class="ipad-phone-button" href="tel:${DPRO.escape(DPRO.normalizePhone(phone))}">
                  ☎ ${DPRO.escape(phone)}
                </a>
              ` : ""}
            </div>

            <div class="ipad-items">${orderItemsText(order)}</div>

            <div class="ipad-order-detail-grid">
              ${detail("用途", DPRO.usageLabel(order.usage_type))}
              ${detail("受付", sourceLabel(order.source))}
              ${detail("金額", DPRO.yen(order.total_amount || 0))}
              ${detail("支払い", paymentLabel(order.payment_status))}
              ${detail("優先度", priorityLabel(order.priority))}
              ${detail("注文方法", order.order_type === "custom" ? "オーダーメイド" : "カタログ")}
            </div>

            ${order.customer_note ? `
              <div class="ipad-order-note">お客様希望：${DPRO.escape(order.customer_note)}</div>
            ` : ""}

            ${order.internal_note ? `
              <div class="ipad-order-note">店舗メモ：${DPRO.escape(order.internal_note)}</div>
            ` : ""}

            <div class="ipad-action-area">
              ${action ? `
                <button
                  type="button"
                  class="btn btn-primary ipad-primary-action"
                  data-order-action="${DPRO.escape(order.id)}"
                  data-target-status="${DPRO.escape(action.status)}"
                >${DPRO.escape(action.label)}</button>
              ` : `
                <div class="notice">${DPRO.escape(secondary)}</div>
              `}

              <div class="ipad-secondary-actions">
                <a class="btn btn-secondary" href="owner.html?demo=1#orders">注文管理で詳細</a>
                ${needsStaffLink(order) ? `
                  <a class="btn btn-secondary" href="staff.html?demo=1">作業画面を開く</a>
                ` : `
                  <a class="btn btn-secondary" href="counter.html?demo=1&customer_id=${encodeURIComponent(customer.id || "")}">この顧客で再注文</a>
                `}
              </div>
            </div>
          </div>
        </article>
      `;
    }).join("");

    DPRO.qsa("[data-order-action]", ordersRoot).forEach(button => {
      button.addEventListener("click", () => updateOrder(button));
    });
  }

  async function updateOrder(button) {
    const targetStatus = button.dataset.targetStatus;
    const message = ({
      reviewing: "注文内容の確認を開始します。",
      confirmed: "商品・日時・受取方法を確認し、注文を確定します。",
      pickup_waiting: "商品・カード・札を確認し、店頭受取準備完了にします。",
      delivery_preparing: "商品を確認し、配達準備へ進めます。",
      handed_over: "お客様と商品を確認し、引渡し完了にします。",
    })[targetStatus] || "注文状態を更新します。";

    if (!window.confirm(message)) return;

    DPRO.setButtonBusy(button, true, "更新中…");

    try {
      await DPRO.api(
        `/api/admin/orders/${button.dataset.orderAction}/status`,
        {
          method: "PATCH",
          admin: true,
          body: {
            status: targetStatus,
            updated_by: "owner-ipad-next",
          },
        }
      );

      await load();
      DPRO.setAlert(alertRoot, "注文状態を更新しました。", "info");
    } catch (error) {
      DPRO.setAlert(alertRoot, error.message, "error");
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  function primaryAction(order) {
    const status = order.status;

    if (status === "new") {
      return {
        status: "reviewing",
        label: "内容確認を開始",
      };
    }

    if (["reviewing", "quoted", "customer_waiting"].includes(status)) {
      return {
        status: "confirmed",
        label: "内容を確認して注文確定",
      };
    }

    if (status === "completed" && order.fulfillment_type === "pickup") {
      return {
        status: "pickup_waiting",
        label: "商品を確認して受取準備完了",
      };
    }

    if (status === "completed" && order.fulfillment_type === "delivery") {
      return {
        status: "delivery_preparing",
        label: "商品を確認して配達準備へ",
      };
    }

    if (status === "pickup_waiting") {
      return {
        status: "handed_over",
        label: "お客様へ引渡し完了",
      };
    }

    return null;
  }

  function secondaryNotice(order) {
    return ({
      confirmed: "注文確定済みです。制作作業画面で進行してください。",
      payment_waiting: "入金確認後、制作作業画面で進行してください。",
      production_waiting: "制作待ちです。作業画面で担当してください。",
      producing: "現在制作中です。",
      delivery_preparing: "配達準備中です。作業画面で梱包・積込を行います。",
      delivering: "現在配達中です。",
      delivered: "配達完了しています。",
      handed_over: "店頭での引渡しが完了しています。",
      cancelled: "キャンセル済みです。",
    })[order.status] || "現在この画面で実行できる操作はありません。";
  }

  function needsStaffLink(order) {
    return [
      "confirmed",
      "payment_waiting",
      "production_waiting",
      "producing",
      "completed",
      "delivery_preparing",
      "delivering",
    ].includes(order.status);
  }

  function orderItemsText(order) {
    const items = Array.isArray(order.flower_order_items)
      ? order.flower_order_items
      : [];

    return items.length
      ? items.map(item =>
          `${DPRO.escape(item.product_name_snapshot || "商品")} × ${Number(item.quantity || 1)}`
        ).join("<br>")
      : "商品情報なし";
  }

  function detail(label, value) {
    return `
      <div class="ipad-order-detail">
        <span>${DPRO.escape(label)}</span>
        <strong>${DPRO.escape(value || "―")}</strong>
      </div>
    `;
  }

  function sourceLabel(value) {
    return ({
      phone: "電話",
      counter: "店頭",
      line: "LINE",
      web: "Web",
    })[value] || value || "LINE";
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
    })[value] || value || "通常";
  }

  function updateLastUpdated() {
    const now = new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date());

    DPRO.qs("#lastUpdatedAt").textContent = `最終更新 ${now}`;
  }

  function setText(selector, value) {
    const element = DPRO.qs(selector);
    if (element) element.textContent = String(value);
  }

  function formatReadableDate(value) {
    if (!value) return "日付を選択";

    const parts = String(value).split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return value;

    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    const weekday = ["日", "月", "火", "水", "木", "金", "土"][date.getUTCDay()];

    return `${parts[0]}/${String(parts[1]).padStart(2, "0")}/${String(parts[2]).padStart(2, "0")}（${weekday}）`;
  }
});
