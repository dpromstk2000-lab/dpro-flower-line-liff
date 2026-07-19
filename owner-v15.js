document.addEventListener("DOMContentLoaded", () => {
  DPRO.mountChrome("owner");

  const lock = DPRO.qs("#adminLock");
  const app = DPRO.qs("#adminApp");
  const codeInput = DPRO.qs("#adminCode");
  const loginAlert = DPRO.qs("#loginAlert");
  const pageAlert = DPRO.qs("#pageAlert");

  codeInput.value = DPRO.getAdminCode();
  DPRO.qs("#dashboardDate").value = DPRO.todayJst();

  DPRO.qs("#loginButton").addEventListener("click", login);
  codeInput.addEventListener("keydown", event => {
    if (event.key === "Enter") login();
  });
  DPRO.qs("#clearCodeButton").addEventListener("click", () => {
    DPRO.clearAdminCode();
    codeInput.value = "";
    DPRO.setAlert(loginAlert, "保存されている管理コードを削除しました。", "info");
  });

  DPRO.qs("#reloadDashboard").addEventListener("click", loadDashboard);
  DPRO.qs("#searchOrders").addEventListener("click", loadOrders);
  DPRO.qs("#searchCustomers").addEventListener("click", searchCustomers);

  if (DPRO.getAdminCode()) login();

  async function login() {
    const code = codeInput.value.trim() || DPRO.getAdminCode();
    if (!code) {
      DPRO.setAlert(loginAlert, "管理コードを入力してください。", "error");
      return;
    }
    try {
      await DPRO.api("/api/admin/login", { method: "POST", admin: true, adminCode: code });
      DPRO.saveAdminCode(code);
      lock.classList.add("hidden");
      app.classList.remove("hidden");
      await Promise.all([loadDashboard(), loadOrders()]);
    } catch (error) {
      DPRO.setAlert(loginAlert, error.message, "error");
    }
  }

  async function loadDashboard() {
    DPRO.setAlert(pageAlert, "");
    const date = DPRO.qs("#dashboardDate").value || DPRO.todayJst();
    try {
      const data = await DPRO.api(`/api/admin/dashboard?date=${date}`, { admin: true });
      const s = data.summary || {};
      DPRO.qs("#statToday").textContent = s.today_orders ?? 0;
      DPRO.qs("#statProduction").textContent = s.production_open ?? 0;
      DPRO.qs("#statDelivery").textContent = s.delivery_open ?? 0;
      DPRO.qs("#statUnpaid").textContent = s.unpaid_orders ?? 0;
      renderToday(data.today_orders || []);
    } catch (error) {
      DPRO.setAlert(pageAlert, error.message, "error");
    }
  }

  function renderToday(orders) {
    const root = DPRO.qs("#todayOrders");
    if (!orders.length) {
      root.innerHTML = `<div class="empty">この日の注文はありません。</div>`;
      return;
    }
    root.innerHTML = `
      <table>
        <thead><tr><th>日時</th><th>受付番号</th><th>お客様</th><th>商品</th><th>受取</th><th>状態</th><th>金額</th></tr></thead>
        <tbody>${orders.map(order => `
          <tr>
            <td>${DPRO.dateTime(order.requested_at)}</td>
            <td><strong>${DPRO.escape(order.order_number)}</strong></td>
            <td>${DPRO.escape(order.flower_customers?.customer_name || "―")}<br><span class="help">${DPRO.escape(order.flower_customers?.phone || "")}</span></td>
            <td>${(order.flower_order_items || []).map(item => DPRO.escape(item.product_name_snapshot)).join("<br>")}</td>
            <td>${DPRO.escape(DPRO.fulfillmentLabel(order.fulfillment_type))}</td>
            <td>${DPRO.statusBadge(order.status)}</td>
            <td>${DPRO.yen(order.total_amount)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
    `;
  }

  async function loadOrders() {
    const status = DPRO.qs("#orderStatusFilter").value;
    const q = DPRO.qs("#orderQuery").value.trim();
    const params = new URLSearchParams({ limit: "100" });
    if (status) params.set("status", status);
    if (q) params.set("q", q);

    try {
      const data = await DPRO.api(`/api/admin/orders?${params}`, { admin: true });
      renderOrders(data.orders || []);
    } catch (error) {
      DPRO.setAlert(pageAlert, error.message, "error");
    }
  }

  function renderOrders(orders) {
    const root = DPRO.qs("#ordersTable");
    if (!orders.length) {
      root.innerHTML = `<div class="empty">条件に合う注文はありません。</div>`;
      return;
    }
    root.innerHTML = `
      <table>
        <thead><tr><th>受付番号</th><th>希望日時</th><th>お客様</th><th>商品</th><th>状態</th><th>変更</th></tr></thead>
        <tbody>${orders.map(order => `
          <tr>
            <td><strong>${DPRO.escape(order.order_number)}</strong><br><span class="help">${DPRO.escape(DPRO.usageLabel(order.usage_type))}</span></td>
            <td>${DPRO.dateTime(order.requested_at)}</td>
            <td>${DPRO.escape(order.flower_customers?.customer_name || "―")}<br><span class="help">${DPRO.escape(order.flower_customers?.phone || "")}</span></td>
            <td>${(order.flower_order_items || []).map(item => `${DPRO.escape(item.product_name_snapshot)} × ${item.quantity}`).join("<br>")}</td>
            <td>${DPRO.statusBadge(order.status)}</td>
            <td>
              <select class="statusSelect" data-order-id="${DPRO.escape(order.id)}">
                ${statusOptions(order.status)}
              </select>
              <button class="btn btn-secondary btn-small statusSave" data-order-id="${DPRO.escape(order.id)}">保存</button>
            </td>
          </tr>`).join("")}
        </tbody>
      </table>
    `;

    DPRO.qsa(".statusSave", root).forEach(button => {
      button.addEventListener("click", async () => {
        const orderId = button.dataset.orderId;
        const select = DPRO.qs(`.statusSelect[data-order-id="${orderId}"]`, root);
        DPRO.setButtonBusy(button, true, "保存中");
        try {
          await DPRO.api(`/api/admin/orders/${orderId}/status`, {
            method: "PATCH",
            admin: true,
            body: { status: select.value, updated_by: "owner-web" }
          });
          await Promise.all([loadDashboard(), loadOrders()]);
        } catch (error) {
          DPRO.setAlert(pageAlert, error.message, "error");
        } finally {
          DPRO.setButtonBusy(button, false);
        }
      });
    });
  }

  function statusOptions(current) {
    const values = [
      ["new","新規受付"],["reviewing","内容確認中"],["confirmed","注文確定"],
      ["payment_waiting","入金待ち"],["production_waiting","制作待ち"],
      ["producing","制作中"],["completed","完成"],["pickup_waiting","店頭受取待ち"],
      ["delivery_preparing","配達準備"],["delivering","配達中"],
      ["delivered","配達完了"],["handed_over","引渡し完了"],["cancelled","キャンセル"]
    ];
    return values.map(([value,label]) =>
      `<option value="${value}" ${value === current ? "selected" : ""}>${label}</option>`
    ).join("");
  }

  async function searchCustomers() {
    const q = DPRO.qs("#customerQuery").value.trim();
    const root = DPRO.qs("#customerResults");
    if (!q) {
      root.innerHTML = `<div class="card empty">検索文字を入力してください。</div>`;
      return;
    }
    root.innerHTML = `<div class="card loading">検索中…</div>`;
    try {
      const data = await DPRO.api(`/api/admin/customers/search?q=${encodeURIComponent(q)}`, { admin: true });
      const customers = data.customers || [];
      root.innerHTML = customers.length
        ? customers.map(customer => `
            <article class="card">
              <h3>${DPRO.escape(customer.customer_name)}</h3>
              <p>${DPRO.escape(customer.phone || "")}<br>${DPRO.escape(customer.company_name || "")}</p>
              <div class="summary-row"><span>顧客番号</span><strong>${DPRO.escape(customer.customer_number || "―")}</strong></div>
              <div class="summary-row"><span>注文回数</span><strong>${customer.order_count || 0}</strong></div>
              <div class="summary-row"><span>累計</span><strong>${DPRO.yen(customer.total_spend)}</strong></div>
              <div class="actions">
                <a
                  class="btn btn-secondary btn-small"
                  href="counter.html?demo=1&customer_id=${encodeURIComponent(customer.id)}"
                >この顧客で注文受付</a>
              </div>
            </article>
          `).join("")
        : `<div class="card empty">該当する顧客はありません。</div>`;
    } catch (error) {
      root.innerHTML = `<div class="card alert alert-error">${DPRO.escape(error.message)}</div>`;
    }
  }
});
