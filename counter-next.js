document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const PAGE_VERSION = "FLOWER-NEXT-8-COUNTER-20260722";

  const state = {
    authenticated: false,
    products: [],
    deliveryAreas: [],
    orderItems: [],
    orderMode: "catalog",
    selectedCustomer: null,
    selectedAddresses: [],
    recentOrders: [],
    loading: false,
  };

  const lock = DPRO.qs("#adminLock");
  const app = DPRO.qs("#counterApp");
  const codeInput = DPRO.qs("#adminCode");
  const pageAlert = DPRO.qs("#pageAlert");
  const form = DPRO.qs("#counterOrderForm");
  const productCatalog = DPRO.qs("#productCatalog");
  const itemsRoot = DPRO.qs("#orderItems");
  const fulfillment = DPRO.qs("#fulfillmentType");
  const dateInput = DPRO.qs("#requestedDate");
  const requestedAt = DPRO.qs("#requestedAt");
  const slotGrid = DPRO.qs("#slotGrid");
  const recipientCard = DPRO.qs("#recipientCard");
  const deliveryArea = DPRO.qs("#deliveryArea");
  const submitButton = DPRO.qs("#submitButton");

  mountNavigation();
  initializeDates();
  enhanceDateInput();
  bindEvents();

  codeInput.value = DPRO.getAdminCode();
  if (DPRO.getAdminCode()) login();

  function mountNavigation() {
    const demo = DPRO.isDemo() ? "?demo=1" : "";
    const topnav = DPRO.qs("#topnav");
    if (topnav) {
      topnav.innerHTML = `
        <a href="catalog.html">商品カタログ</a>
        <a href="index.html">注文する</a>
        <a href="member.html">マイページ</a>
        <a href="owner.html${demo}">オーナー</a>
        <a href="staff.html${demo}">スタッフ</a>
      `;
    }

    const mobile = DPRO.qs("#mobileNav");
    if (mobile) {
      mobile.innerHTML = `
        <a href="owner-ipad.html${demo}"><span>📱</span>iPad受付</a>
        <a href="owner.html${demo}#orders"><span>🧾</span>注文管理</a>
        <a href="staff.html${demo}"><span>🧺</span>作業</a>
      `;
    }

    DPRO.qs("#appVersion").textContent = PAGE_VERSION;
  }

  function initializeDates() {
    dateInput.min = DPRO.todayJst();
    dateInput.value = DPRO.addDaysJst(1);

    const source = new URLSearchParams(location.search).get("source");
    if (["phone", "counter"].includes(source)) {
      DPRO.qs("#sourceType").value = source;
    }
  }

  function enhanceDateInput() {
    if (dateInput.closest(".counter-date-control")) return;

    const wrapper = document.createElement("div");
    wrapper.className = "counter-date-control";

    const readable = document.createElement("span");
    readable.className = "counter-date-readable";
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

    DPRO.qs("#customerSearchButton").addEventListener("click", searchCustomers);
    DPRO.qs("#customerSearch").addEventListener("keydown", event => {
      if (event.key === "Enter") {
        event.preventDefault();
        searchCustomers();
      }
    });
    DPRO.qs("#newCustomerButton").addEventListener("click", clearSelectedCustomer);

    DPRO.qsa("[data-order-mode]").forEach(button => {
      button.addEventListener("click", () => setOrderMode(button.dataset.orderMode));
    });

    DPRO.qs("#productSearch").addEventListener("input", renderProductCatalog);
    DPRO.qs("#showFeaturedOnly").addEventListener("change", renderProductCatalog);
    productCatalog.addEventListener("click", handleProductCatalogClick);

    DPRO.qs("#clearItemsButton").addEventListener("click", () => {
      state.orderItems = [];
      renderOrderItems();
      updateSummary();
    });

    itemsRoot.addEventListener("input", handleItemInput);
    itemsRoot.addEventListener("change", handleItemInput);
    itemsRoot.addEventListener("click", handleItemClick);

    DPRO.qs("#savedAddress").addEventListener("change", applySavedAddress);

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
      await initialize();
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
    DPRO.setAlert(DPRO.qs("#loginAlert"), "保存されている管理コードを削除しました。", "info");
  }

  async function initialize() {
    if (state.loading) return;
    state.loading = true;
    DPRO.setAlert(pageAlert, "");

    try {
      const [productData, areaData] = await Promise.all([
        loadProductCatalogData(),
        DPRO.api("/api/public/delivery-areas"),
      ]);

      state.products = (productData.products || []).filter(product =>
        product.is_active !== false
      );
      state.deliveryAreas = areaData.delivery_areas || [];

      renderDeliveryAreas();
      renderProductCatalog();
      renderOrderItems();
      toggleFulfillment();
      await loadSlots();

      const customerId = new URLSearchParams(location.search).get("customer_id");
      if (customerId) await selectCustomer(customerId);

      updateSummary();
    } catch (error) {
      DPRO.setAlert(pageAlert, error.message, "error");
    } finally {
      state.loading = false;
    }
  }

  async function loadProductCatalogData() {
    try {
      return await DPRO.api("/api/public/catalog?limit=500");
    } catch {
      const fallback = await DPRO.api("/api/public/products");
      return {
        products: (fallback.products || []).map(product => ({
          ...product,
          is_published: true,
          is_sold_out: false,
          orderable: true,
          flower_product_photos: [],
        })),
      };
    }
  }

  function setOrderMode(mode) {
    state.orderMode = mode === "custom" ? "custom" : "catalog";

    DPRO.qsa("[data-order-mode]").forEach(button => {
      button.classList.toggle("active", button.dataset.orderMode === state.orderMode);
    });

    renderProductCatalog();
  }

  function productIsOrderable(product) {
    return Boolean(
      product &&
      product.orderable !== false &&
      product.is_active !== false &&
      product.is_published !== false &&
      product.is_sold_out !== true
    );
  }

  function productMatchesMode(product) {
    if (state.orderMode === "catalog") return true;
    return (
      product.consultation_enabled === true ||
      ["made_to_order", "consultation"].includes(product.product_type)
    );
  }

  function visibleProducts() {
    const query = DPRO.qs("#productSearch").value.trim().toLowerCase();
    const featuredOnly = DPRO.qs("#showFeaturedOnly").checked;

    return state.products.filter(product => {
      if (!productMatchesMode(product)) return false;
      if (featuredOnly && product.is_featured !== true) return false;

      const haystack = [
        product.product_name,
        product.product_code,
        product.flower_product_categories?.category_name,
        product.short_description,
      ].filter(Boolean).join(" ").toLowerCase();

      return !query || haystack.includes(query);
    });
  }

  function renderProductCatalog() {
    const products = visibleProducts();

    if (!products.length) {
      productCatalog.innerHTML = `<div class="counter-empty-small">条件に合う商品はありません。</div>`;
      return;
    }

    productCatalog.innerHTML = products.map(product => {
      const orderable = productIsOrderable(product);
      const photo = safePhotoUrl(
        product.main_photo_url ||
        product.flower_product_photos?.[0]?.public_url ||
        product.photo_url
      );

      return `
        <article class="counter-product-card ${orderable ? "" : "is-disabled"}">
          ${photo
            ? `<img class="counter-product-photo" src="${DPRO.escape(photo)}" alt="${DPRO.escape(product.product_name || "商品写真")}" loading="lazy">`
            : `<div class="counter-product-photo">💐</div>`}
          <div class="counter-product-body">
            <div class="counter-product-category">${DPRO.escape(product.flower_product_categories?.category_name || "お花")}</div>
            <h3>${DPRO.escape(product.product_name || "商品")}</h3>
            <div class="counter-product-price">${DPRO.escape(productPriceLabel(product))}</div>
            <button
              type="button"
              class="btn btn-primary btn-small"
              data-add-product="${DPRO.escape(product.id)}"
              ${orderable ? "" : "disabled"}
            >${orderable ? "注文へ追加" : "受付停止"}</button>
          </div>
        </article>
      `;
    }).join("");
  }

  function handleProductCatalogClick(event) {
    const button = event.target.closest("[data-add-product]");
    if (!button) return;

    const product = state.products.find(item => item.id === button.dataset.addProduct);
    if (!product || !productIsOrderable(product)) return;

    if (state.orderItems.length >= 20) {
      DPRO.setAlert(DPRO.qs("#formAlert"), "商品は20件まで登録できます。", "warning");
      return;
    }

    state.orderItems.push(makeOrderItem(product, state.orderMode));
    renderOrderItems();
    updateSummary();

    DPRO.qs("#orderItems").scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function makeOrderItem(product, mode = "catalog") {
    return {
      key: DPRO.uuid(),
      order_type: mode,
      product_id: product.id,
      quantity: 1,
      unit_price: Number(product.default_price || product.minimum_price || 0),
      color_mood: "おまかせ",
      size_label: product.size_label || "",
      design_style: mode === "custom" ? "おまかせ" : "",
      preferred_flowers: "",
      avoid_flowers: "",
      ribbon_text: "",
      standing_sign_text: "",
      wrapping_option: "",
      item_note: "",
    };
  }

  function renderOrderItems() {
    if (!state.orderItems.length) {
      itemsRoot.innerHTML = `<div class="counter-empty-small">商品を選択してください。</div>`;
      return;
    }

    itemsRoot.innerHTML = state.orderItems.map((item, index) => {
      const product = productById(item.product_id);
      const photo = safePhotoUrl(
        product?.main_photo_url ||
        product?.flower_product_photos?.[0]?.public_url ||
        product?.photo_url
      );
      const custom = item.order_type === "custom";

      return `
        <article class="counter-item-card ${custom ? "custom" : ""}" data-item-key="${DPRO.escape(item.key)}">
          <div class="counter-item-head">
            ${photo
              ? `<img class="counter-item-photo" src="${DPRO.escape(photo)}" alt="${DPRO.escape(product?.product_name || "商品写真")}">`
              : `<div class="counter-item-photo">💐</div>`}
            <div>
              <h4>商品 ${index + 1}：${DPRO.escape(product?.product_name || "商品")}</h4>
              <p class="help">${custom ? "オーダーメイド" : "カタログ商品"}・${DPRO.escape(productPriceLabel(product || {}))}</p>
            </div>
            <button type="button" class="btn btn-danger btn-small" data-remove-item="${DPRO.escape(item.key)}">削除</button>
          </div>

          <div class="counter-item-body">
            <div class="counter-item-fields">
              <div class="field">
                <label>注文方式</label>
                <select data-item-field="order_type">
                  <option value="catalog" ${custom ? "" : "selected"}>カタログ商品</option>
                  <option value="custom" ${custom ? "selected" : ""}>オーダーメイド</option>
                </select>
              </div>
              <div class="field">
                <label>数量</label>
                <input type="number" min="1" max="20" value="${Number(item.quantity)}" data-item-field="quantity">
              </div>
              <div class="field">
                <label>単価・予算</label>
                <input type="number" min="${Number(product?.minimum_price || 0)}" step="100" value="${Number(item.unit_price)}" data-item-field="unit_price">
              </div>
              <div class="field">
                <label>色・雰囲気</label>
                <select data-item-field="color_mood">
                  ${moodOptions(item.color_mood)}
                </select>
              </div>
              <div class="field wide">
                <label>商品への調整希望</label>
                <textarea data-item-field="preferred_flowers" placeholder="例：明るめ、バラを入れる">${DPRO.escape(item.preferred_flowers)}</textarea>
              </div>
              <div class="field wide">
                <label>避けたい花・色・香り</label>
                <textarea data-item-field="avoid_flowers" placeholder="例：ユリを避ける">${DPRO.escape(item.avoid_flowers)}</textarea>
              </div>
            </div>

            <div class="counter-custom-fields">
              <div class="field">
                <label>サイズ・ボリューム</label>
                <input data-item-field="size_label" value="${DPRO.escape(item.size_label)}" placeholder="例：標準、ボリューム重視">
              </div>
              <div class="field">
                <label>仕上がり</label>
                <select data-item-field="design_style">
                  ${designOptions(item.design_style)}
                </select>
              </div>
              <div class="field">
                <label>ラッピング</label>
                <input data-item-field="wrapping_option" value="${DPRO.escape(item.wrapping_option)}" placeholder="例：上品、法人向け">
              </div>
              <div class="field">
                <label>リボン・短い札</label>
                <input data-item-field="ribbon_text" value="${DPRO.escape(item.ribbon_text)}">
              </div>
              <div class="field">
                <label>立札</label>
                <input data-item-field="standing_sign_text" value="${DPRO.escape(item.standing_sign_text)}">
              </div>
              <div class="field">
                <label>制作メモ</label>
                <textarea data-item-field="item_note">${DPRO.escape(item.item_note)}</textarea>
              </div>
            </div>
          </div>
        </article>
      `;
    }).join("");
  }

  function handleItemInput(event) {
    const field = event.target.dataset.itemField;
    if (!field) return;

    const card = event.target.closest("[data-item-key]");
    const item = state.orderItems.find(value => value.key === card?.dataset.itemKey);
    if (!item) return;

    if (field === "quantity") {
      item.quantity = Math.max(1, Math.min(20, Number(event.target.value || 1)));
    } else if (field === "unit_price") {
      const product = productById(item.product_id);
      item.unit_price = Math.max(
        Number(product?.minimum_price || 0),
        Number(event.target.value || 0)
      );
    } else {
      item[field] = event.target.value;
    }

    if (field === "order_type") renderOrderItems();
    updateSummary();
  }

  function handleItemClick(event) {
    const button = event.target.closest("[data-remove-item]");
    if (!button) return;
    state.orderItems = state.orderItems.filter(item => item.key !== button.dataset.removeItem);
    renderOrderItems();
    updateSummary();
  }

  async function searchCustomers() {
    const query = DPRO.qs("#customerSearch").value.trim();
    const root = DPRO.qs("#customerSearchResults");
    const alert = DPRO.qs("#customerSearchAlert");

    DPRO.setAlert(alert, "");
    if (!query) {
      DPRO.setAlert(alert, "検索文字を入力してください。", "warning");
      return;
    }

    root.innerHTML = `<div class="loading">検索中…</div>`;

    try {
      const data = await DPRO.api(
        `/api/admin/customers/search?q=${encodeURIComponent(query)}&limit=50`,
        { admin: true }
      );
      const customers = data.customers || [];

      root.innerHTML = customers.length
        ? customers.map(customer => `
          <button type="button" class="counter-customer-choice" data-customer-id="${DPRO.escape(customer.id || customer.customer_id || "")}">
            <strong>${DPRO.escape(customer.customer_name || "氏名未登録")}</strong>
            <span>${DPRO.escape(customer.customer_number || "顧客番号なし")}／${DPRO.escape(customer.phone || "")}</span>
            <span>${DPRO.escape(customer.company_name || "")}　注文 ${Number(customer.order_count || 0)}件</span>
          </button>
        `).join("")
        : `<div class="counter-empty-small">該当する顧客はありません。</div>`;

      DPRO.qsa("[data-customer-id]", root).forEach(button => {
        button.addEventListener("click", () => selectCustomer(button.dataset.customerId));
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

      state.selectedCustomer = data.customer || null;
      state.selectedAddresses = data.addresses || [];
      state.recentOrders = data.orders || [];

      applyCustomerToForm();
      renderSelectedCustomer(data);
      renderRecentOrders();
      renderSavedAddresses();

      const defaultAddress = state.selectedAddresses.find(address => address.is_default);
      if (defaultAddress) {
        DPRO.qs("#savedAddress").value = defaultAddress.id;
        applySavedAddress();
      }

      updateSummary();
    } catch (error) {
      DPRO.setAlert(DPRO.qs("#customerSearchAlert"), error.message, "error");
    }
  }

  function applyCustomerToForm() {
    const customer = state.selectedCustomer || {};
    DPRO.qs("#selectedCustomerNumber").value = customer.customer_number || "";
    DPRO.qs("#customerName").value = customer.customer_name || "";
    DPRO.qs("#customerPhone").value = customer.phone || "";
    DPRO.qs("#customerEmail").value = customer.email || "";
    DPRO.qs("#customerCompany").value = customer.company_name || "";
  }

  function renderSelectedCustomer(data) {
    const customer = data.customer || {};
    const orderCount = (data.orders || []).length;

    DPRO.qs("#selectedCustomer").innerHTML = `
      <div class="counter-selected-profile">
        <div class="counter-selected-name">${DPRO.escape(customer.customer_name || "氏名未登録")}</div>
        <div class="counter-selected-meta">
          ${DPRO.escape(customer.customer_number || "")}<br>
          ${DPRO.escape(customer.phone || "")}<br>
          ${DPRO.escape(customer.company_name || "")}
        </div>
        <div class="counter-customer-stats">
          <div class="counter-customer-stat"><span>注文履歴</span><strong>${orderCount}件</strong></div>
          <div class="counter-customer-stat"><span>登録届け先</span><strong>${state.selectedAddresses.length}件</strong></div>
        </div>
      </div>
    `;
  }

  function renderRecentOrders() {
    const card = DPRO.qs("#recentOrdersCard");
    const root = DPRO.qs("#recentOrders");

    if (!state.recentOrders.length) {
      card.classList.add("hidden");
      root.innerHTML = "";
      return;
    }

    card.classList.remove("hidden");
    root.innerHTML = state.recentOrders.slice(0, 8).map((order, index) => `
      <article class="counter-recent-order">
        <div class="counter-recent-order-head">
          <strong>${DPRO.escape(order.order_number || `注文 ${index + 1}`)}</strong>
          <span class="help">${DPRO.dateTime(order.requested_at)}</span>
        </div>
        <div class="help">${DPRO.escape(DPRO.usageLabel(order.usage_type))}・${DPRO.escape(DPRO.fulfillmentLabel(order.fulfillment_type))}</div>
        <div>${recentOrderItemsText(order)}</div>
        <button type="button" class="btn btn-secondary btn-small" data-repeat-order="${index}">前回と同じ内容を入れる</button>
      </article>
    `).join("");

    DPRO.qsa("[data-repeat-order]", root).forEach(button => {
      button.addEventListener("click", () => repeatOrder(Number(button.dataset.repeatOrder)));
    });
  }

  function repeatOrder(index) {
    const order = state.recentOrders[index];
    if (!order) return;

    const previousItems = Array.isArray(order.flower_order_items)
      ? order.flower_order_items
      : [];

    const mapped = previousItems.map(previous => {
      const product = state.products.find(item =>
        item.id === previous.product_id ||
        item.product_name === previous.product_name_snapshot
      );
      if (!product || !productIsOrderable(product)) return null;

      return {
        key: DPRO.uuid(),
        order_type: previous.item_type || previous.order_type || "catalog",
        product_id: product.id,
        quantity: Number(previous.quantity || 1),
        unit_price: Math.max(
          Number(product.minimum_price || 0),
          Number(previous.unit_price || product.default_price || 0)
        ),
        color_mood: previous.color_mood || "おまかせ",
        size_label: previous.size_label || product.size_label || "",
        design_style: previous.design_style || "",
        preferred_flowers: previous.preferred_flowers || previous.flower_preferences || "",
        avoid_flowers: previous.avoid_flowers || "",
        ribbon_text: previous.ribbon_text || "",
        standing_sign_text: previous.standing_sign_text || "",
        wrapping_option: previous.wrapping_option || "",
        item_note: previous.item_note || "",
      };
    }).filter(Boolean);

    if (!mapped.length) {
      DPRO.setAlert(pageAlert, "前回の商品が現在受付できないため、自動入力できませんでした。", "warning");
      return;
    }

    state.orderItems = mapped;
    DPRO.qs("#usageType").value = order.usage_type || "";
    fulfillment.value = order.fulfillment_type || "pickup";
    DPRO.qs("#customerNote").value = order.customer_note || "";
    DPRO.qs("#internalNote").value = "";

    toggleFulfillment();
    renderOrderItems();
    loadSlots();
    updateSummary();

    DPRO.setAlert(pageAlert, "前回の注文内容を入力しました。日時・価格・商品状態を確認してください。", "info");
  }

  function clearSelectedCustomer() {
    state.selectedCustomer = null;
    state.selectedAddresses = [];
    state.recentOrders = [];

    ["selectedCustomerNumber", "customerName", "customerPhone", "customerEmail", "customerCompany"].forEach(id => {
      DPRO.qs(`#${id}`).value = "";
    });

    DPRO.qs("#selectedCustomer").innerHTML =
      `<div class="counter-empty-small">新しいお客様として受付します。</div>`;
    DPRO.qs("#recentOrdersCard").classList.add("hidden");
    DPRO.qs("#recentOrders").innerHTML = "";
    renderSavedAddresses();
    updateSummary();
  }

  function renderSavedAddresses() {
    const select = DPRO.qs("#savedAddress");
    select.innerHTML =
      `<option value="">使用しない・直接入力</option>` +
      state.selectedAddresses.map(address => `
        <option value="${DPRO.escape(address.id)}">
          ${DPRO.escape(address.address_label || address.recipient_name || "届け先")}
          ／ ${DPRO.escape([
            address.prefecture,
            address.city,
            address.address_line1,
          ].filter(Boolean).join(""))}
        </option>
      `).join("");
  }

  function applySavedAddress() {
    const id = DPRO.qs("#savedAddress").value;
    const address = state.selectedAddresses.find(item => item.id === id);
    if (!address) return;

    DPRO.qs("#recipientName").value = address.recipient_name || "";
    DPRO.qs("#recipientPhone").value = address.recipient_phone || "";
    DPRO.qs("#recipientPostalCode").value = address.postal_code || "";
    DPRO.qs("#recipientPrefecture").value = address.prefecture || "福岡県";
    DPRO.qs("#recipientCity").value = address.city || "";
    DPRO.qs("#recipientAddress1").value = [
      address.address_line1,
      address.address_line2,
    ].filter(Boolean).join(" ");
    DPRO.qs("#facilityName").value =
      address.company_or_facility_name || "";
    DPRO.qs("#venueName").value = address.venue_name || "";
    DPRO.qs("#deliveryNote").value = address.delivery_note || "";

    updateSummary();
  }

  function renderDeliveryAreas() {
    deliveryArea.innerHTML =
      `<option value="">選択してください</option>` +
      state.deliveryAreas.map(area => `
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
    DPRO.qs("#messageStepNumber").textContent = delivery ? "5" : "4";

    for (const id of [
      "recipientName",
      "recipientPhone",
      "recipientAddress1",
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
      slotGrid.innerHTML =
        `<span class="help">店舗から日時確認のご連絡をします。</span>`;
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

      slotGrid.innerHTML = (data.slots || []).map(slot => `
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

  function selectedDeliveryFee() {
    if (fulfillment.value !== "delivery") return 0;
    return Number(
      deliveryArea.selectedOptions[0]?.dataset.fee || 0
    );
  }

  function updateSummary() {
    const subtotal = state.orderItems.reduce((sum, item) =>
      sum +
      Number(item.quantity || 0) *
      Number(item.unit_price || 0),
    0);
    const fee = selectedDeliveryFee();
    const customCount = state.orderItems.filter(
      item => item.order_type === "custom"
    ).length;

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
        <span>商品</span>
        <strong>${state.orderItems.length}点${customCount ? `・オーダー ${customCount}点` : ""}</strong>
      </div>
      <div class="summary-row">
        <span>受取方法</span>
        <strong>${DPRO.escape(DPRO.fulfillmentLabel(fulfillment.value))}</strong>
      </div>
      <div class="summary-row">
        <span>希望日時</span>
        <strong>${
          fulfillment.value === "shipping_consultation"
            ? "店舗から連絡"
            : requestedAt.value
              ? DPRO.dateTime(requestedAt.value)
              : "未選択"
        }</strong>
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

    if (!state.orderItems.length) {
      DPRO.setAlert(alert, "商品を1点以上追加してください。", "error");
      return;
    }

    if (
      fulfillment.value !== "shipping_consultation" &&
      !requestedAt.value
    ) {
      DPRO.setAlert(alert, "希望時間を選択してください。", "error");
      return;
    }

    for (const item of state.orderItems) {
      const product = productById(item.product_id);

      if (!product || !productIsOrderable(product)) {
        DPRO.setAlert(
          alert,
          "売り切れ・非公開の商品が含まれています。商品を選び直してください。",
          "error"
        );
        return;
      }

      if (
        fulfillment.value === "pickup" &&
        product.pickup_enabled === false
      ) {
        DPRO.setAlert(
          alert,
          `「${product.product_name}」は店頭受取に対応していません。`,
          "error"
        );
        return;
      }

      if (
        fulfillment.value === "delivery" &&
        product.delivery_enabled === false
      ) {
        DPRO.setAlert(
          alert,
          `「${product.product_name}」は店舗配達に対応していません。`,
          "error"
        );
        return;
      }

      item.unit_price = Math.max(
        Number(product.minimum_price || 0),
        Number(item.unit_price || product.default_price || 0)
      );
    }

    const overallOrderType = state.orderItems.some(
      item => item.order_type === "custom"
    ) ? "custom" : "catalog";

    const body = {
      idempotency_key: `flower-counter-next-${DPRO.uuid()}`,
      source: DPRO.qs("#sourceType").value,
      order_type: overallOrderType,
      fulfillment_type: fulfillment.value,
      usage_type: DPRO.qs("#usageType").value,
      requested_at: requestedAt.value || null,
      delivery_fee: selectedDeliveryFee(),
      customer: {
        customer_name: DPRO.qs("#customerName").value,
        phone: DPRO.qs("#customerPhone").value,
        email: DPRO.qs("#customerEmail").value,
        company_name: DPRO.qs("#customerCompany").value,
      },
      items: state.orderItems.map(item => ({
        product_id: item.product_id,
        quantity: Number(item.quantity),
        unit_price: Number(item.unit_price),
        budget_amount:
          Number(item.quantity) * Number(item.unit_price),
        color_mood: item.color_mood,
        flower_preferences: item.preferred_flowers,
        preferred_flowers: item.preferred_flowers,
        avoid_flowers: item.avoid_flowers,
        item_type: item.order_type,
        size_label: item.size_label,
        design_style: item.design_style,
        ribbon_text: item.ribbon_text,
        standing_sign_text: item.standing_sign_text,
        wrapping_option: item.wrapping_option,
        item_note: item.item_note,
        metadata: {
          counter_order_mode: item.order_type,
        },
      })),
      customer_note: DPRO.qs("#customerNote").value,
      internal_note: DPRO.qs("#internalNote").value,
      message_card: DPRO.qs("#messageText").value
        ? {
            card_type: "message_card",
            message_text: DPRO.qs("#messageText").value,
            sender_name: DPRO.qs("#senderName").value,
            confirmed: true,
          }
        : undefined,
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
        delivery_note: DPRO.qs("#deliveryNote").value,
      };
    }

    if (!window.confirm("お客様情報・商品・受取日時を確認し、注文を登録します。")) {
      return;
    }

    DPRO.setButtonBusy(submitButton, true, "注文を登録しています…");

    try {
      const data = await DPRO.api("/api/admin/orders", {
        method: "POST",
        admin: true,
        body,
      });

      DPRO.setAlert(
        alert,
        `注文を登録しました。受付番号：${data.order.order_number}`,
        "info"
      );
      alert.scrollIntoView({ behavior: "smooth", block: "center" });

      state.orderItems = [];
      requestedAt.value = "";
      DPRO.qsa(".slot", slotGrid).forEach(element =>
        element.classList.remove("selected")
      );

      [
        "messageText",
        "senderName",
        "customerNote",
        "internalNote",
      ].forEach(id => {
        DPRO.qs(`#${id}`).value = "";
      });

      renderOrderItems();
      updateSummary();

      if (state.selectedCustomer?.id) {
        await selectCustomer(state.selectedCustomer.id);
      }
    } catch (error) {
      DPRO.setAlert(alert, error.message, "error");
      alert.scrollIntoView({ behavior: "smooth", block: "center" });
    } finally {
      DPRO.setButtonBusy(submitButton, false);
    }
  }

  function productById(id) {
    return state.products.find(product => product.id === id) || null;
  }

  function productPriceLabel(product) {
    if (
      product.product_type === "consultation" ||
      product.price_display_type === "consultation" ||
      product.requires_quote === true
    ) {
      return "価格はご相談";
    }

    const minimum = Number(product.minimum_price || 0);
    const standard = Number(product.default_price || minimum || 0);

    if (
      product.price_display_type === "from" ||
      standard > minimum
    ) {
      return `${DPRO.yen(minimum || standard)}〜`;
    }

    return DPRO.yen(standard || minimum);
  }

  function moodOptions(current) {
    return [
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
      "シック",
    ].map(value =>
      `<option ${value === current ? "selected" : ""}>${DPRO.escape(value)}</option>`
    ).join("");
  }

  function designOptions(current) {
    return [
      "おまかせ",
      "優しくナチュラル",
      "明るく可愛らしい",
      "華やかで豪華",
      "上品で落ち着いた",
      "シックで大人っぽい",
      "個性的・印象的",
    ].map(value =>
      `<option ${value === current ? "selected" : ""}>${DPRO.escape(value)}</option>`
    ).join("");
  }

  function safePhotoUrl(value) {
    const text = String(value || "").trim();
    if (!text) return "";

    try {
      const url = new URL(text, location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function formatReadableDate(value) {
    if (!value) return "日付を選択";

    const parts = String(value).split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return value;

    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    const weekday = ["日", "月", "火", "水", "木", "金", "土"][date.getUTCDay()];

    return `${parts[0]}/${String(parts[1]).padStart(2, "0")}/${String(parts[2]).padStart(2, "0")}（${weekday}）`;
  }

  function recentOrderItemsText(order) {
    const items = Array.isArray(order.flower_order_items)
      ? order.flower_order_items
      : [];

    return items.length
      ? items.map(item =>
          `${DPRO.escape(item.product_name_snapshot || "商品")} × ${Number(item.quantity || 1)}`
        ).join("<br>")
      : "商品情報なし";
  }
});
