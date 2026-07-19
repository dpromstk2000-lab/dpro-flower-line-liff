document.addEventListener("DOMContentLoaded", () => {
  DPRO.mountChrome("staff");

  const lock = DPRO.qs("#adminLock");
  const app = DPRO.qs("#app");
  const code = DPRO.qs("#adminCode");
  code.value = DPRO.getAdminCode();
  DPRO.qs("#taskDate").value = DPRO.todayJst();

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
    try {
      const data = await DPRO.api(`/api/staff/tasks?date=${DPRO.qs("#taskDate").value}`, { admin: true });
      renderProduction(data.production_tasks || []);
      renderDelivery(data.delivery_tasks || []);
    } catch (error) {
      DPRO.setAlert(DPRO.qs("#alert"), error.message, "error");
    }
  }

  function renderProduction(tasks) {
    const root = DPRO.qs("#productionTasks");
    if (!tasks.length) {
      root.innerHTML = `<div class="card empty">制作タスクはありません。</div>`;
      return;
    }
    root.innerHTML = tasks.map(task => {
      const order = task.flower_orders || {};
      const item = task.flower_order_items || {};
      return `
        <article class="card order-card">
          <div class="order-head">
            <div>
              <div class="order-number">${DPRO.escape(order.order_number || "")}</div>
              <div class="order-meta">${DPRO.dateTime(order.requested_at)}</div>
            </div>
            <span class="badge">${DPRO.escape(productionStatusLabel(task.status))}</span>
          </div>
          <h3>${DPRO.escape(item.product_name_snapshot || "商品")}</h3>
          <p>
            数量：${item.quantity || 1}<br>
            色・雰囲気：${DPRO.escape(item.color_mood || "おまかせ")}<br>
            ご希望：${DPRO.escape(item.flower_preferences || "なし")}
          </p>
          <div class="actions">
            <button class="btn btn-primary" data-production="${task.id}" data-status="producing">制作開始</button>
            <button class="btn btn-secondary" data-production="${task.id}" data-status="quality_check">確認待ち</button>
            <button class="btn btn-rose" data-production="${task.id}" data-status="completed">制作完了</button>
          </div>
        </article>
      `;
    }).join("");

    DPRO.qsa("[data-production]", root).forEach(button => {
      button.addEventListener("click", async () => {
        DPRO.setButtonBusy(button, true, "更新中");
        try {
          await DPRO.api(`/api/staff/production/${button.dataset.production}/status`, {
            method: "PATCH",
            admin: true,
            body: { status: button.dataset.status }
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

  function renderDelivery(tasks) {
    const root = DPRO.qs("#deliveryTasks");
    if (!tasks.length) {
      root.innerHTML = `<div class="card empty">配達タスクはありません。</div>`;
      return;
    }
    root.innerHTML = tasks.map(task => {
      const order = task.flower_orders || {};
      const recipient = order.flower_order_recipients || {};
      return `
        <article class="card order-card">
          <div class="order-head">
            <div>
              <div class="order-number">${DPRO.escape(order.order_number || "")}</div>
              <div class="order-meta">${DPRO.dateTime(task.scheduled_end_at || order.requested_at)}</div>
            </div>
            <span class="badge">${DPRO.escape(deliveryStatusLabel(task.status))}</span>
          </div>
          <h3>${DPRO.escape(recipient.recipient_name || recipient.company_or_facility_name || "お届け先")}</h3>
          <p>
            ${DPRO.escape([recipient.prefecture, recipient.city, recipient.address_line1].filter(Boolean).join(""))}<br>
            ${DPRO.escape(recipient.delivery_note || "")}
          </p>
          <div class="actions">
            <button class="btn btn-primary" data-delivery="${task.id}" data-status="departed">配達出発</button>
            <button class="btn btn-secondary" data-delivery="${task.id}" data-status="absent">不在</button>
            <button class="btn btn-rose" data-delivery="${task.id}" data-status="delivered">配達完了</button>
          </div>
        </article>
      `;
    }).join("");

    DPRO.qsa("[data-delivery]", root).forEach(button => {
      button.addEventListener("click", async () => {
        DPRO.setButtonBusy(button, true, "更新中");
        try {
          await DPRO.api(`/api/staff/delivery/${button.dataset.delivery}/status`, {
            method: "PATCH",
            admin: true,
            body: { status: button.dataset.status }
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

  function productionStatusLabel(value) {
    return ({
      waiting: "制作待ち",
      assigned: "担当決定",
      producing: "制作中",
      quality_check: "確認待ち",
      completed: "制作完了",
      cancelled: "キャンセル"
    })[value] || value || "未設定";
  }

  function deliveryStatusLabel(value) {
    return ({
      waiting: "配達待ち",
      assigned: "担当決定",
      preparing: "配達準備",
      departed: "配達中",
      delivered: "配達完了",
      absent: "不在",
      returned: "持ち戻り",
      cancelled: "キャンセル"
    })[value] || value || "未設定";
  }
});
