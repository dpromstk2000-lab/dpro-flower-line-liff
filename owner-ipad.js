document.addEventListener("DOMContentLoaded", () => {
  DPRO.mountChrome("owner");

  const lock = DPRO.qs("#adminLock");
  const app = DPRO.qs("#app");
  const code = DPRO.qs("#adminCode");
  code.value = DPRO.getAdminCode();
  DPRO.qs("#date").value = DPRO.todayJst();

  DPRO.qs("#loginButton").addEventListener("click", login);
  DPRO.qs("#clearCodeButton").addEventListener("click", () => {
    DPRO.clearAdminCode();
    code.value = "";
    DPRO.setAlert(DPRO.qs("#loginAlert"), "管理コードを削除しました。", "info");
  });
  DPRO.qs("#reload").addEventListener("click", load);
  if (DPRO.getAdminCode()) login();

  async function login() {
    try {
      const value = code.value.trim() || DPRO.getAdminCode();
      await DPRO.api("/api/admin/login", { method: "POST", admin: true, adminCode: value });
      DPRO.saveAdminCode(value);
      lock.classList.add("hidden");
      app.classList.remove("hidden");
      await load();
    } catch (error) {
      DPRO.setAlert(DPRO.qs("#loginAlert"), error.message, "error");
    }
  }

  async function load() {
    const root = DPRO.qs("#orders");
    root.innerHTML = `<div class="card loading">読み込み中…</div>`;
    try {
      const data = await DPRO.api(`/api/admin/dashboard?date=${DPRO.qs("#date").value}`, { admin: true });
      render(data.today_orders || []);
    } catch (error) {
      DPRO.setAlert(DPRO.qs("#alert"), error.message, "error");
    }
  }

  function render(orders) {
    const root = DPRO.qs("#orders");
    if (!orders.length) {
      root.innerHTML = `<div class="card empty">この日の注文はありません。</div>`;
      return;
    }

    root.innerHTML = orders.map(order => `
      <article class="card order-card">
        <div class="order-head">
          <div>
            <div class="order-number">${DPRO.escape(order.order_number)}</div>
            <div class="order-meta">${DPRO.dateTime(order.requested_at)}・${DPRO.escape(DPRO.fulfillmentLabel(order.fulfillment_type))}</div>
          </div>
          ${DPRO.statusBadge(order.status)}
        </div>
        <h3>${DPRO.escape(order.flower_customers?.customer_name || "お客様")}</h3>
        <p>${(order.flower_order_items || []).map(item => `${DPRO.escape(item.product_name_snapshot)} × ${item.quantity}`).join("<br>")}</p>
        <div class="actions">
          ${button(order, "producing", "制作開始")}
          ${button(order, "completed", "完成")}
          ${order.fulfillment_type === "delivery"
            ? button(order, "delivery_preparing", "配達準備")
            : button(order, "handed_over", "引渡し完了")}
        </div>
      </article>
    `).join("");

    DPRO.qsa("[data-status]", root).forEach(button => {
      button.addEventListener("click", async () => {
        DPRO.setButtonBusy(button, true, "更新中");
        try {
          await DPRO.api(`/api/admin/orders/${button.dataset.orderId}/status`, {
            method: "PATCH",
            admin: true,
            body: { status: button.dataset.status, updated_by: "owner-ipad" }
          });
          await load();
        } catch (error) {
          DPRO.setAlert(DPRO.qs("#alert"), error.message, "error");
        } finally {
          DPRO.setButtonBusy(button, false);
        }
      });
    });
  }

  function button(order, status, label) {
    return `<button class="btn btn-secondary" data-order-id="${DPRO.escape(order.id)}" data-status="${status}">${label}</button>`;
  }
});
