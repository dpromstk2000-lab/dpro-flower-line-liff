document.addEventListener("DOMContentLoaded", () => {
  DPRO.mountChrome("member");

  const params = new URLSearchParams(location.search);
  const created = params.get("created");
  if (created) {
    DPRO.setAlert(
      DPRO.qs("#createdNotice"),
      `ご注文を受け付けました。受付番号：${created}`,
      "info"
    );
  }

  load();

  async function load() {
    try {
      const lineUserId = DPRO.getDemoLineUserId();
      const [profileData, orderData] = await Promise.all([
        DPRO.api(`/api/member/profile?line_user_id=${encodeURIComponent(lineUserId)}`),
        DPRO.api(`/api/member/orders?line_user_id=${encodeURIComponent(lineUserId)}`)
      ]);

      if (!profileData.found) {
        DPRO.qs("#customerName").textContent = "未登録";
        DPRO.qs("#orderCount").textContent = "0";
        DPRO.qs("#addressCount").textContent = "0";
        DPRO.qs("#orders").innerHTML = `
          <div class="card empty">
            <h3>まだ注文履歴がありません</h3>
            <p>最初のお花を注文すると、ここに履歴が表示されます。</p>
            <a class="btn btn-primary" href="index.html">花を注文する</a>
          </div>
        `;
        DPRO.qs("#anniversaries").innerHTML = `<div class="card empty">登録された記念日はありません。</div>`;
        return;
      }

      const customer = profileData.customer;
      const orders = orderData.orders || [];
      DPRO.qs("#customerName").textContent = customer.customer_name || "―";
      DPRO.qs("#orderCount").textContent = String(orders.length);
      DPRO.qs("#addressCount").textContent = String((profileData.addresses || []).length);
      renderOrders(orders);
      renderAnniversaries(profileData.anniversaries || []);
    } catch (error) {
      DPRO.setAlert(DPRO.qs("#pageAlert"), error.message, "error");
      DPRO.qs("#orders").innerHTML = `<div class="card empty">注文情報を読み込めませんでした。</div>`;
    }
  }

  function renderOrders(orders) {
    if (!orders.length) {
      DPRO.qs("#orders").innerHTML = `<div class="card empty">注文履歴はありません。</div>`;
      return;
    }

    DPRO.qs("#orders").innerHTML = orders.map(order => {
      const items = (order.flower_order_items || [])
        .map(item => `${DPRO.escape(item.product_name_snapshot)} × ${item.quantity}`)
        .join("<br>");
      return `
        <article class="card order-card">
          <div class="order-head">
            <div>
              <div class="order-number">${DPRO.escape(order.order_number)}</div>
              <div class="order-meta">${DPRO.dateTime(order.requested_at)}・${DPRO.escape(DPRO.fulfillmentLabel(order.fulfillment_type))}</div>
            </div>
            ${DPRO.statusBadge(order.status)}
          </div>
          <div>${items || "商品情報なし"}</div>
          ${timeline(order.status)}
          <div class="summary-row"><span>用途</span><strong>${DPRO.escape(DPRO.usageLabel(order.usage_type))}</strong></div>
          <div class="summary-row"><span>合計</span><strong>${DPRO.yen(order.total_amount)}</strong></div>
          <div class="actions">
            <a class="btn btn-secondary btn-small" href="index.html">同じ用途で再注文</a>
          </div>
        </article>
      `;
    }).join("");
  }

  function timeline(status) {
    const steps = [
      ["new", "受付"],
      ["confirmed", "確定"],
      ["producing", "制作"],
      ["completed", "完成"],
      ["delivered", "お渡し"]
    ];
    const indexMap = {
      new: 0, reviewing: 0, quoted: 0, customer_waiting: 0,
      confirmed: 1, payment_waiting: 1, production_waiting: 1,
      producing: 2, completed: 3, pickup_waiting: 3,
      delivery_preparing: 3, delivering: 3,
      delivered: 4, handed_over: 4
    };
    const current = indexMap[status] ?? 0;
    return `<div class="timeline">${
      steps.map(([, label], index) => `
        <div class="timeline-step ${index < current ? "done" : index === current ? "active" : ""}">
          ${label}
        </div>
      `).join("")
    }</div>`;
  }

  function renderAnniversaries(items) {
    const root = DPRO.qs("#anniversaries");
    if (!items.length) {
      root.innerHTML = `<div class="card empty">登録された記念日はありません。</div>`;
      return;
    }
    root.innerHTML = items.map(item => `
      <article class="card">
        <span class="badge">${DPRO.escape(item.anniversary_type)}</span>
        <h3>${DPRO.escape(item.title)}</h3>
        <p>${DPRO.escape(item.anniversary_date)}・${item.remind_days_before}日前にお知らせ候補</p>
        <div class="price">${item.preferred_budget ? DPRO.yen(item.preferred_budget) : "予算未設定"}</div>
      </article>
    `).join("");
  }
});
