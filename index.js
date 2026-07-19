document.addEventListener("DOMContentLoaded", () => {
  DPRO.mountChrome("order");

  const form = DPRO.qs("#flowerOrderForm");
  const productList = DPRO.qs("#productList");
  const fulfillment = DPRO.qs("#fulfillmentType");
  const dateInput = DPRO.qs("#requestedDate");
  const slotGrid = DPRO.qs("#slotGrid");
  const requestedAt = DPRO.qs("#requestedAt");
  const recipientCard = DPRO.qs("#recipientCard");
  const deliveryArea = DPRO.qs("#deliveryArea");
  const formAlert = DPRO.qs("#formAlert");
  const submitButton = DPRO.qs("#submitButton");
  const summary = DPRO.qs("#orderSummary");

  let products = [];
  let areas = [];

  dateInput.min = DPRO.todayJst();
  dateInput.value = DPRO.addDaysJst(1);

  init();

  async function init() {
    try {
      const [productData, areaData] = await Promise.all([
        DPRO.api("/api/public/products"),
        DPRO.api("/api/public/delivery-areas")
      ]);
      products = productData.products || [];
      areas = areaData.delivery_areas || [];
      renderProducts();
      renderAreas();
      toggleFulfillment();
      await loadSlots();
      updateSummary();
    } catch (error) {
      DPRO.setAlert(DPRO.qs("#pageAlert"), error.message, "error");
      productList.innerHTML = `<div class="empty">商品を読み込めませんでした。</div>`;
    }
  }

  function renderProducts() {
    if (!products.length) {
      productList.innerHTML = `<div class="empty">現在注文できる商品がありません。</div>`;
      return;
    }

    productList.innerHTML = products.map((product, index) => `
      <label class="product-option">
        <input type="radio" name="product" value="${DPRO.escape(product.id)}"
          ${index === 0 ? "checked" : ""}>
        <span>
          <span class="product-name">${DPRO.escape(product.product_name)}</span>
          <span class="product-desc">${DPRO.escape(product.description || "")}</span>
        </span>
        <span class="price">${DPRO.yen(product.default_price)}〜</span>
      </label>
    `).join("");

    DPRO.qsa('input[name="product"]').forEach(input => {
      input.addEventListener("change", updateSummary);
    });

    const first = products[0];
    if (first) DPRO.qs("#budgetAmount").value = first.default_price;
  }

  function renderAreas() {
    deliveryArea.innerHTML = `<option value="">選択してください</option>` +
      areas.map(area => `
        <option value="${DPRO.escape(area.id)}" data-fee="${Number(area.delivery_fee || 0)}">
          ${DPRO.escape(area.area_name)}（配達料 ${DPRO.yen(area.delivery_fee)}）
        </option>
      `).join("");
  }

  fulfillment.addEventListener("change", async () => {
    toggleFulfillment();
    await loadSlots();
    updateSummary();
  });
  dateInput.addEventListener("change", loadSlots);
  deliveryArea.addEventListener("change", updateSummary);
  DPRO.qs("#budgetAmount").addEventListener("input", updateSummary);

  function toggleFulfillment() {
    const type = fulfillment.value;
    recipientCard.classList.toggle("hidden", type !== "delivery");
    DPRO.qs("#dateField").classList.toggle("hidden", type === "shipping_consultation");
    DPRO.qs("#slotField").classList.toggle("hidden", type === "shipping_consultation");

    for (const id of ["recipientName", "recipientPhone", "recipientAddress1"]) {
      DPRO.qs(`#${id}`).required = type === "delivery";
    }
    dateInput.required = type !== "shipping_consultation";
    if (type === "shipping_consultation") requestedAt.value = "";
  }

  async function loadSlots() {
    requestedAt.value = "";
    slotGrid.innerHTML = `<span class="help">空き時間を確認しています…</span>`;

    if (fulfillment.value === "shipping_consultation") {
      slotGrid.innerHTML = "";
      return;
    }
    if (!dateInput.value) {
      slotGrid.innerHTML = `<span class="help">日付を選択してください。</span>`;
      return;
    }

    try {
      const data = await DPRO.api(
        `/api/public/time-slots?date=${encodeURIComponent(dateInput.value)}` +
        `&fulfillment_type=${encodeURIComponent(fulfillment.value)}`
      );
      const available = (data.slots || []).filter(slot => slot.available);
      if (!available.length) {
        slotGrid.innerHTML = `<div class="alert alert-warning">この日は選択できる時間がありません。</div>`;
        return;
      }

      slotGrid.innerHTML = data.slots.map(slot => `
        <button type="button" class="slot" data-at="${DPRO.escape(slot.requested_at)}"
          ${slot.available ? "" : "disabled"}>
          ${DPRO.escape(slot.time)}
        </button>
      `).join("");

      DPRO.qsa(".slot", slotGrid).forEach(button => {
        button.addEventListener("click", () => {
          DPRO.qsa(".slot", slotGrid).forEach(el => el.classList.remove("selected"));
          button.classList.add("selected");
          requestedAt.value = button.dataset.at;
          updateSummary();
        });
      });
    } catch (error) {
      slotGrid.innerHTML = `<div class="alert alert-error">${DPRO.escape(error.message)}</div>`;
    }
  }

  function selectedProduct() {
    const id = DPRO.qs('input[name="product"]:checked')?.value;
    return products.find(product => product.id === id) || null;
  }

  function selectedDeliveryFee() {
    const option = deliveryArea.selectedOptions[0];
    return fulfillment.value === "delivery"
      ? Number(option?.dataset.fee || 0)
      : 0;
  }

  function updateSummary() {
    const product = selectedProduct();
    const budget = Number(DPRO.qs("#budgetAmount").value || product?.default_price || 0);
    const fee = selectedDeliveryFee();
    summary.innerHTML = `
      <div class="summary-row"><span>商品</span><strong>${DPRO.escape(product?.product_name || "未選択")}</strong></div>
      <div class="summary-row"><span>受取方法</span><strong>${DPRO.escape(DPRO.fulfillmentLabel(fulfillment.value))}</strong></div>
      <div class="summary-row"><span>希望日時</span><strong>${requestedAt.value ? DPRO.dateTime(requestedAt.value) : fulfillment.value === "shipping_consultation" ? "店舗から連絡" : "未選択"}</strong></div>
      <div class="summary-row"><span>商品金額</span><strong>${DPRO.yen(budget)}</strong></div>
      <div class="summary-row"><span>配達料</span><strong>${DPRO.yen(fee)}</strong></div>
      <div class="summary-row"><span>合計目安</span><strong>${DPRO.yen(budget + fee)}</strong></div>
    `;
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    DPRO.setAlert(formAlert, "");

    const product = selectedProduct();
    if (!product) {
      DPRO.setAlert(formAlert, "商品を選択してください。", "error");
      return;
    }
    if (!form.reportValidity()) return;
    if (fulfillment.value !== "shipping_consultation" && !requestedAt.value) {
      DPRO.setAlert(formAlert, "希望時間を選択してください。", "error");
      return;
    }

    const budget = Math.max(
      Number(product.minimum_price || 0),
      Number(DPRO.qs("#budgetAmount").value || product.default_price || 0)
    );
    const fee = selectedDeliveryFee();

    const body = {
      idempotency_key: `flower-web-${DPRO.uuid()}`,
      source: "line",
      fulfillment_type: fulfillment.value,
      usage_type: DPRO.qs("#usageType").value,
      requested_at: requestedAt.value || null,
      delivery_fee: fee,
      customer: {
        customer_name: DPRO.qs("#customerName").value,
        phone: DPRO.qs("#customerPhone").value,
        email: DPRO.qs("#customerEmail").value,
        company_name: DPRO.qs("#companyName").value,
        line_user_id: DPRO.getDemoLineUserId(),
        line_link_approved: DPRO.isDemo(),
        marketing_opt_in: DPRO.qs("#marketingOptIn").checked
      },
      items: [{
        product_id: product.id,
        quantity: 1,
        unit_price: budget,
        budget_amount: budget,
        color_mood: DPRO.qs("#colorMood").value,
        flower_preferences: DPRO.qs("#flowerPreferences").value
      }],
      customer_note: DPRO.qs("#customerNote").value,
      message_card: DPRO.qs("#messageText").value ? {
        card_type: "message_card",
        message_text: DPRO.qs("#messageText").value,
        sender_name: DPRO.qs("#senderName").value,
        confirmed: true
      } : undefined
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

    DPRO.setButtonBusy(submitButton, true, "注文を登録しています…");
    try {
      const result = await DPRO.api("/api/order/create", {
        method: "POST",
        body
      });
      sessionStorage.setItem("dpro_flower_last_order", JSON.stringify(result.order));
      location.href = `member.html?demo=1&created=${encodeURIComponent(result.order.order_number)}`;
    } catch (error) {
      DPRO.setAlert(formAlert, error.message, "error");
      formAlert.scrollIntoView({ behavior: "smooth", block: "center" });
    } finally {
      DPRO.setButtonBusy(submitButton, false);
    }
  });
});
