document.addEventListener("DOMContentLoaded", () => {
  DPRO.mountChrome("owner");

  const lock = DPRO.qs("#adminLock");
  const app = DPRO.qs("#counterApp");
  const codeInput = DPRO.qs("#adminCode");
  const pageAlert = DPRO.qs("#pageAlert");
  const form = DPRO.qs("#counterOrderForm");
  const itemsRoot = DPRO.qs("#orderItems");
  const fulfillment = DPRO.qs("#fulfillmentType");
  const dateInput = DPRO.qs("#requestedDate");
  const requestedAt = DPRO.qs("#requestedAt");
  const slotGrid = DPRO.qs("#slotGrid");
  const recipientCard = DPRO.qs("#recipientCard");
  const deliveryArea = DPRO.qs("#deliveryArea");
  const submitButton = DPRO.qs("#submitButton");

  let products = [];
  let deliveryAreas = [];
  let orderItems = [];
  let selectedCustomer = null;
  let selectedAddresses = [];

  codeInput.value = DPRO.getAdminCode();
  dateInput.min = DPRO.todayJst();
  dateInput.value = DPRO.addDaysJst(1);

  DPRO.qs("#loginButton").addEventListener("click", login);
  codeInput.addEventListener("keydown", event => {
    if (event.key === "Enter") login();
  });
  DPRO.qs("#clearCodeButton").addEventListener("click", () => {
    DPRO.clearAdminCode();
    codeInput.value = "";
    DPRO.setAlert(
      DPRO.qs("#loginAlert"),
      "管理コードを削除しました。",
      "info"
    );
  });

  DPRO.qs("#customerSearchButton").addEventListener(
    "click",
    searchCustomers
  );
  DPRO.qs("#customerSearch").addEventListener("keydown", event => {
    if (event.key === "Enter") {
      event.preventDefault();
      searchCustomers();
    }
  });
  DPRO.qs("#newCustomerButton").addEventListener(
    "click",
    clearSelectedCustomer
  );
  DPRO.qs("#addItemButton").addEventListener("click", addOrderItem);
  DPRO.qs("#savedAddress").addEventListener(
    "change",
    applySavedAddress
  );

  fulfillment.addEventListener("change", async () => {
    toggleFulfillment();
    await loadSlots();
    updateSummary();
  });
  dateInput.addEventListener("change", loadSlots);
  deliveryArea.addEventListener("change", updateSummary);

  form.addEventListener("input", updateSummary);
  form.addEventListener("change", updateSummary);
  form.addEventListener("submit", submitOrder);

  itemsRoot.addEventListener("change", handleItemChange);
  itemsRoot.addEventListener("input", handleItemChange);
  itemsRoot.addEventListener("click", handleItemClick);

  if (DPRO.getAdminCode()) login();

  async function login() {
    const code = codeInput.value.trim() || DPRO.getAdminCode();
    if (!code) {
      DPRO.setAlert(
        DPRO.qs("#loginAlert"),
        "管理コードを入力してください。",
        "error"
      );
      return;
    }

    try {
      await DPRO.api("/api/admin/login", {
        method: "POST",
        admin: true,
        adminCode: code
      });
      DPRO.saveAdminCode(code);
      lock.classList.add("hidden");
      app.classList.remove("hidden");
      await initialize();
    } catch (error) {
      DPRO.setAlert(
        DPRO.qs("#loginAlert"),
        error.message,
        "error"
      );
    }
  }

  async function initialize() {
    try {
      const [productData, areaData] = await Promise.all([
        DPRO.api("/api/public/products"),
        DPRO.api("/api/public/delivery-areas")
      ]);
      products = productData.products || [];
      deliveryAreas = areaData.delivery_areas || [];

      renderDeliveryAreas();
      resetOrderItems();
      toggleFulfillment();
      await loadSlots();

      const customerId =
        new URLSearchParams(location.search).get("customer_id");
      if (customerId) {
        await selectCustomer(customerId);
      }
      updateSummary();
    } catch (error) {
      DPRO.setAlert(pageAlert, error.message, "error");
    }
  }

  function resetOrderItems() {
    const first = products[0];
    orderItems = [{
      key: DPRO.uuid(),
      product_id: first?.id || "",
      quantity: 1,
      unit_price: Number(first?.default_price || 0),
      color_mood: "おまかせ",
      flower_preferences: ""
    }];
    renderOrderItems();
  }

  function addOrderItem() {
    if (orderItems.length >= 20) {
      DPRO.setAlert(
        DPRO.qs("#formAlert"),
        "商品は20件まで登録できます。",
        "warning"
      );
      return;
    }
    const first = products[0];
    orderItems.push({
      key: DPRO.uuid(),
      product_id: first?.id || "",
      quantity: 1,
      unit_price: Number(first?.default_price || 0),
      color_mood: "おまかせ",
      flower_preferences: ""
    });
    renderOrderItems();
    updateSummary();
  }

  function renderOrderItems() {
    if (!products.length) {
      itemsRoot.innerHTML =
        `<div class="empty">現在登録できる商品がありません。</div>`;
      return;
    }

    itemsRoot.innerHTML = orderItems.map((item, index) => `
      <div class="order-item-row" data-item-row="${item.key}">
        <div class="order-item-head">
          <div class="order-item-title">商品 ${index + 1}</div>
          ${orderItems.length > 1 ? `
            <button
              type="button"
              class="btn btn-rose btn-small"
              data-remove-item="${item.key}"
            >削除</button>
          ` : ""}
        </div>
        <div class="order-item-grid">
          <div class="field">
            <label class="required">商品</label>
            <select data-item-field="product_id" required>
              ${products.map(product => `
                <option
                  value="${DPRO.escape(product.id)}"
                  ${product.id === item.product_id ? "selected" : ""}
                >
                  ${DPRO.escape(product.product_name)}
                </option>
              `).join("")}
            </select>
          </div>
          <div class="field">
            <label class="required">数量</label>
            <input
              type="number"
              min="1"
              max="20"
              value="${item.quantity}"
              data-item-field="quantity"
              required
            >
          </div>
          <div class="field">
            <label class="required">単価</label>
            <input
              type="number"
              min="0"
              step="100"
              value="${item.unit_price}"
              data-item-field="unit_price"
              required
            >
          </div>
          <div class="field">
            <label>色・雰囲気</label>
            <select data-item-field="color_mood">
              ${[
                "おまかせ",
                "赤・ピンク系",
                "黄色・オレンジ系",
                "白・グリーン系",
                "青・紫系",
                "カラフル",
                "優しい",
                "明るい",
                "華やか",
                "上品",
                "シック"
              ].map(value => `
                <option
                  ${value === item.color_mood ? "selected" : ""}
                >${DPRO.escape(value)}</option>
              `).join("")}
            </select>
          </div>
          <div class="field wide">
            <label>ご希望・避けたい花</label>
            <textarea
              data-item-field="flower_preferences"
              placeholder="例：春らしく、香りの強い花は避ける"
            >${DPRO.escape(item.flower_preferences)}</textarea>
          </div>
        </div>
      </div>
    `).join("");
  }

  function handleItemChange(event) {
    const field = event.target.dataset.itemField;
    if (!field) return;

    const row = event.target.closest("[data-item-row]");
    const item = orderItems.find(
      value => value.key === row?.dataset.itemRow
    );
    if (!item) return;

    if (field === "product_id") {
      item.product_id = event.target.value;
      const product = productById(item.product_id);
      item.unit_price = Number(product?.default_price || 0);
      renderOrderItems();
    } else if (field === "quantity") {
      item.quantity = Math.max(
        1,
        Math.min(20, Number(event.target.value || 1))
      );
    } else if (field === "unit_price") {
      item.unit_price = Math.max(
        0,
        Number(event.target.value || 0)
      );
    } else {
      item[field] = event.target.value;
    }
    updateSummary();
  }

  function handleItemClick(event) {
    const button = event.target.closest("[data-remove-item]");
    if (!button) return;
    orderItems = orderItems.filter(
      item => item.key !== button.dataset.removeItem
    );
    renderOrderItems();
    updateSummary();
  }

  function productById(id) {
    return products.find(product => product.id === id) || null;
  }

  function renderDeliveryAreas() {
    deliveryArea.innerHTML =
      `<option value="">選択してください</option>` +
      deliveryAreas.map(area => `
        <option
          value="${DPRO.escape(area.id)}"
          data-fee="${Number(area.delivery_fee || 0)}"
        >
          ${DPRO.escape(area.area_name)}
          （配達料 ${DPRO.yen(area.delivery_fee)}）
        </option>
      `).join("");
  }

  function toggleFulfillment() {
    const type = fulfillment.value;
    const delivery = type === "delivery";
    const consultation = type === "shipping_consultation";

    recipientCard.classList.toggle("hidden", !delivery);
    DPRO.qs("#dateField").classList.toggle("hidden", consultation);
    DPRO.qs("#slotField").classList.toggle("hidden", consultation);

    for (const id of [
      "recipientName",
      "recipientPhone",
      "recipientAddress1"
    ]) {
      DPRO.qs(`#${id}`).required = delivery;
    }
    deliveryArea.required = delivery;
    dateInput.required = !consultation;
    if (consultation) requestedAt.value = "";
  }

  async function loadSlots() {
    requestedAt.value = "";
    slotGrid.innerHTML =
      `<span class="help">空き時間を確認しています…</span>`;

    if (fulfillment.value === "shipping_consultation") {
      slotGrid.innerHTML = "";
      updateSummary();
      return;
    }
    if (!dateInput.value) {
      slotGrid.innerHTML =
        `<span class="help">日付を選択してください。</span>`;
      return;
    }

    try {
      const data = await DPRO.api(
        `/api/public/time-slots?date=${encodeURIComponent(dateInput.value)}` +
        `&fulfillment_type=${encodeURIComponent(fulfillment.value)}`
      );
      const available = (data.slots || []).filter(slot => slot.available);
      if (!available.length) {
        slotGrid.innerHTML =
          `<div class="alert alert-warning">この日は選択できる時間がありません。</div>`;
        return;
      }

      slotGrid.innerHTML = data.slots.map(slot => `
        <button
          type="button"
          class="slot"
          data-at="${DPRO.escape(slot.requested_at)}"
          ${slot.available ? "" : "disabled"}
        >${DPRO.escape(slot.time)}</button>
      `).join("");

      DPRO.qsa(".slot", slotGrid).forEach(button => {
        button.addEventListener("click", () => {
          DPRO.qsa(".slot", slotGrid).forEach(element =>
            element.classList.remove("selected")
          );
          button.classList.add("selected");
          requestedAt.value = button.dataset.at;
          updateSummary();
        });
      });
    } catch (error) {
      slotGrid.innerHTML =
        `<div class="alert alert-error">${DPRO.escape(error.message)}</div>`;
    }
  }

  async function searchCustomers() {
    const q = DPRO.qs("#customerSearch").value.trim();
    const root = DPRO.qs("#customerSearchResults");
    const alert = DPRO.qs("#customerSearchAlert");

    DPRO.setAlert(alert, "");
    if (!q) {
      DPRO.setAlert(
        alert,
        "検索文字を入力してください。",
        "warning"
      );
      return;
    }

    root.innerHTML = `<div class="loading">検索中…</div>`;
    try {
      const data = await DPRO.api(
        `/api/admin/customers/search?q=${encodeURIComponent(q)}&limit=30`,
        { admin: true }
      );
      const customers = data.customers || [];
      root.innerHTML = customers.length
        ? customers.map(customer => `
          <button
            type="button"
            class="customer-choice"
            data-customer-id="${DPRO.escape(customer.id)}"
          >
            <strong>${DPRO.escape(customer.customer_name)}</strong>
            <span>
              ${DPRO.escape(customer.customer_number || "顧客番号なし")}
              ／ ${DPRO.escape(customer.phone || "")}
            </span>
            <span>
              ${DPRO.escape(customer.company_name || "")}
              注文 ${customer.order_count || 0}件
            </span>
          </button>
        `).join("")
        : `<div class="empty">該当する顧客はありません。</div>`;

      DPRO.qsa("[data-customer-id]", root).forEach(button => {
        button.addEventListener("click", () =>
          selectCustomer(button.dataset.customerId)
        );
      });
    } catch (error) {
      DPRO.setAlert(alert, error.message, "error");
      root.innerHTML = "";
    }
  }

  async function selectCustomer(customerId) {
    try {
      const data = await DPRO.api(
        `/api/admin/customers/detail?customer_id=${encodeURIComponent(customerId)}`,
        { admin: true }
      );
      selectedCustomer = data.customer;
      selectedAddresses = data.addresses || [];

      DPRO.qs("#selectedCustomerNumber").value =
        selectedCustomer.customer_number || "";
      DPRO.qs("#customerName").value =
        selectedCustomer.customer_name || "";
      DPRO.qs("#customerPhone").value =
        selectedCustomer.phone || "";
      DPRO.qs("#customerEmail").value =
        selectedCustomer.email || "";
      DPRO.qs("#customerCompany").value =
        selectedCustomer.company_name || "";

      renderSelectedCustomer(data);
      renderSavedAddresses();

      const defaultAddress = selectedAddresses.find(
        address => address.is_default
      );
      if (defaultAddress) {
        DPRO.qs("#savedAddress").value = defaultAddress.id;
        applySavedAddress();
      }

      updateSummary();
    } catch (error) {
      DPRO.setAlert(
        DPRO.qs("#customerSearchAlert"),
        error.message,
        "error"
      );
    }
  }

  function renderSelectedCustomer(data) {
    const customer = data.customer;
    const recentOrders = data.orders || [];
    DPRO.qs("#selectedCustomer").innerHTML = `
      <div class="notice">
        <strong>${DPRO.escape(customer.customer_name)}</strong><br>
        ${DPRO.escape(customer.customer_number || "")}
        ／ ${DPRO.escape(customer.phone || "")}<br>
        注文履歴：${recentOrders.length}件
        ${recentOrders[0] ? `<br>前回：${DPRO.escape(recentOrders[0].order_number)} ${DPRO.usageLabel(recentOrders[0].usage_type)}` : ""}
      </div>
    `;
  }

  function clearSelectedCustomer() {
    selectedCustomer = null;
    selectedAddresses = [];
    DPRO.qs("#selectedCustomerNumber").value = "";
    DPRO.qs("#customerName").value = "";
    DPRO.qs("#customerPhone").value = "";
    DPRO.qs("#customerEmail").value = "";
    DPRO.qs("#customerCompany").value = "";
    DPRO.qs("#selectedCustomer").innerHTML =
      `<div class="notice">新しいお客様として登録します。</div>`;
    renderSavedAddresses();
    updateSummary();
  }

  function renderSavedAddresses() {
    const select = DPRO.qs("#savedAddress");
    select.innerHTML =
      `<option value="">使用しない・直接入力</option>` +
      selectedAddresses.map(address => `
        <option value="${DPRO.escape(address.id)}">
          ${DPRO.escape(address.address_label || address.recipient_name || "届け先")}
          ／ ${DPRO.escape([
            address.prefecture,
            address.city,
            address.address_line1
          ].filter(Boolean).join(""))}
        </option>
      `).join("");
  }

  function applySavedAddress() {
    const id = DPRO.qs("#savedAddress").value;
    const address = selectedAddresses.find(item => item.id === id);
    if (!address) return;

    DPRO.qs("#recipientName").value =
      address.recipient_name || "";
    DPRO.qs("#recipientPhone").value =
      address.recipient_phone || "";
    DPRO.qs("#recipientPostalCode").value =
      address.postal_code || "";
    DPRO.qs("#recipientPrefecture").value =
      address.prefecture || "福岡県";
    DPRO.qs("#recipientCity").value =
      address.city || "";
    DPRO.qs("#recipientAddress1").value =
      [address.address_line1, address.address_line2]
        .filter(Boolean)
        .join(" ");
    DPRO.qs("#facilityName").value =
      address.company_or_facility_name || "";
    DPRO.qs("#venueName").value =
      address.venue_name || "";
    DPRO.qs("#deliveryNote").value =
      address.delivery_note || "";
  }

  function selectedDeliveryFee() {
    if (fulfillment.value !== "delivery") return 0;
    return Number(
      deliveryArea.selectedOptions[0]?.dataset.fee || 0
    );
  }

  function updateSummary() {
    const subtotal = orderItems.reduce((sum, item) => {
      return sum +
        Number(item.quantity || 0) *
        Number(item.unit_price || 0);
    }, 0);
    const fee = selectedDeliveryFee();

    DPRO.qs("#counterSummary").innerHTML = `
      <div class="summary-row">
        <span>お客様</span>
        <strong>${DPRO.escape(DPRO.qs("#customerName").value || "未入力")}</strong>
      </div>
      <div class="summary-row">
        <span>受付</span>
        <strong>${DPRO.qs("#sourceType").value === "phone" ? "電話注文" : "店頭注文"}</strong>
      </div>
      <div class="summary-row">
        <span>商品点数</span>
        <strong>${orderItems.length}</strong>
      </div>
      <div class="summary-row">
        <span>商品金額</span>
        <strong>${DPRO.yen(subtotal)}</strong>
      </div>
      <div class="summary-row">
        <span>配達料</span>
        <strong>${DPRO.yen(fee)}</strong>
      </div>
      <div class="summary-row">
        <span>合計目安</span>
        <strong>${DPRO.yen(subtotal + fee)}</strong>
      </div>
    `;
  }

  async function submitOrder(event) {
    event.preventDefault();
    const alert = DPRO.qs("#formAlert");
    DPRO.setAlert(alert, "");

    if (!form.reportValidity()) return;
    if (!orderItems.length) {
      DPRO.setAlert(alert, "商品を追加してください。", "error");
      return;
    }
    if (
      fulfillment.value !== "shipping_consultation" &&
      !requestedAt.value
    ) {
      DPRO.setAlert(alert, "希望時間を選択してください。", "error");
      return;
    }

    for (const item of orderItems) {
      const product = productById(item.product_id);
      if (!product) {
        DPRO.setAlert(alert, "商品情報を確認してください。", "error");
        return;
      }
      item.unit_price = Math.max(
        Number(product.minimum_price || 0),
        Number(item.unit_price || product.default_price || 0)
      );
    }

    const body = {
      idempotency_key: `flower-counter-${DPRO.uuid()}`,
      source: DPRO.qs("#sourceType").value,
      fulfillment_type: fulfillment.value,
      usage_type: DPRO.qs("#usageType").value,
      requested_at: requestedAt.value || null,
      customer: {
        customer_name: DPRO.qs("#customerName").value,
        phone: DPRO.qs("#customerPhone").value,
        email: DPRO.qs("#customerEmail").value,
        company_name: DPRO.qs("#customerCompany").value
      },
      items: orderItems.map(item => ({
        product_id: item.product_id,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        budget_amount:
          Number(item.quantity) * Number(item.unit_price),
        color_mood: item.color_mood,
        flower_preferences: item.flower_preferences
      })),
      customer_note: DPRO.qs("#customerNote").value,
      internal_note: DPRO.qs("#internalNote").value,
      message_card: DPRO.qs("#messageText").value
        ? {
            card_type: "message_card",
            message_text: DPRO.qs("#messageText").value,
            sender_name: DPRO.qs("#senderName").value,
            confirmed: true
          }
        : undefined
    };

    if (fulfillment.value === "delivery") {
      body.recipient = {
        recipient_name: DPRO.qs("#recipientName").value,
        recipient_phone: DPRO.qs("#recipientPhone").value,
        postal_code: DPRO.qs("#recipientPostalCode").value,
        prefecture: DPRO.qs("#recipientPrefecture").value,
        city: DPRO.qs("#recipientCity").value,
        address_line1: DPRO.qs("#recipientAddress1").value,
        company_or_facility_name: DPRO.qs("#facilityName").value,
        venue_name: DPRO.qs("#venueName").value,
        delivery_area_id: deliveryArea.value || null,
        delivery_note: DPRO.qs("#deliveryNote").value
      };
    }

    DPRO.setButtonBusy(
      submitButton,
      true,
      "注文を登録しています…"
    );
    try {
      const data = await DPRO.api("/api/admin/orders", {
        method: "POST",
        admin: true,
        body
      });

      DPRO.setAlert(
        alert,
        `注文を登録しました。受付番号：${data.order.order_number}`,
        "info"
      );
      alert.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });

      requestedAt.value = "";
      DPRO.qsa(".slot", slotGrid).forEach(element =>
        element.classList.remove("selected")
      );
      resetOrderItems();
      DPRO.qs("#messageText").value = "";
      DPRO.qs("#senderName").value = "";
      DPRO.qs("#customerNote").value = "";
      DPRO.qs("#internalNote").value = "";
      updateSummary();
    } catch (error) {
      DPRO.setAlert(alert, error.message, "error");
      alert.scrollIntoView({
        behavior: "smooth",
        block: "center"
      });
    } finally {
      DPRO.setButtonBusy(submitButton, false);
    }
  }
});
