document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const PAGE_VERSION = "FLOWER-NEXT-5-ORDER-INTEGRATION-20260721";
  DPRO.mountChrome("order");
  mountNextNavigation();

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
  const budgetInput = DPRO.qs("#budgetAmount");
  const catalogCard = DPRO.qs("#catalogProductCard");
  const customCard = DPRO.qs("#customProductCard");
  const customBaseProduct = DPRO.qs("#customBaseProduct");
  const selectedProductPreview = DPRO.qs("#selectedProductPreview");
  const customSelectedProductPreview = DPRO.qs("#customSelectedProductPreview");
  const productOptionsRoot = DPRO.qs("#productOptions");
  const customProductOptionsRoot = DPRO.qs("#customProductOptions");

  const params = new URLSearchParams(location.search);
  const requestedMode = params.get("mode") === "custom" ? "custom" : "catalog";
  const requestedProductId = params.get("product_id") || "";
  const requestedProductSlug = params.get("product") || "";

  const state = {
    products: [],
    areas: [],
    mode: requestedMode,
    selectedProductId: "",
    budgetTouched: false,
    loading: false,
  };

  dateInput.min = DPRO.todayJst();
  dateInput.value = DPRO.addDaysJst(1);

  bindEvents();
  applyMode(state.mode, false);
  init();

  function mountNextNavigation() {
    const demo = DPRO.isDemo() ? "?demo=1" : "";

    const topnav = DPRO.qs("#topnav");
    if (topnav && !topnav.querySelector('a[href^="catalog.html"]')) {
      topnav.insertAdjacentHTML(
        "afterbegin",
        `<a href="catalog.html">商品カタログ</a>`
      );
    }

    const mobile = DPRO.qs("#mobileNav");
    if (mobile) {
      mobile.innerHTML = `
        <a href="catalog.html"><span>🌷</span>カタログ</a>
        <a href="index.html"><span>💐</span>注文</a>
        <a href="member.html"><span>🎫</span>マイページ</a>
        <a href="owner.html${demo}"><span>🖥️</span>管理</a>
        <a href="staff.html${demo}"><span>🧺</span>作業</a>
      `;
    }

    const version = DPRO.qs("#appVersion");
    if (version) version.textContent = PAGE_VERSION;
  }

  function bindEvents() {
    DPRO.qsa("[data-order-mode]").forEach(button => {
      button.addEventListener("click", () => {
        applyMode(button.dataset.orderMode, true);
      });
    });

    productList.addEventListener("change", event => {
      const input = event.target.closest('input[name="product"]');
      if (!input) return;
      selectProduct(input.value, {
        updateBudget: true,
        syncCustomSelect: true,
      });
    });

    productList.addEventListener("click", event => {
      const label = event.target.closest(".next-product-option");
      if (!label || label.classList.contains("is-disabled")) return;
      const input = label.querySelector('input[name="product"]');
      if (!input || input.disabled) return;
      input.checked = true;
      selectProduct(input.value, {
        updateBudget: true,
        syncCustomSelect: true,
      });
    });

    customBaseProduct.addEventListener("change", () => {
      selectProduct(customBaseProduct.value, {
        updateBudget: true,
        syncRadio: true,
      });
    });

    fulfillment.addEventListener("change", async () => {
      toggleFulfillment();
      await loadSlots();
      updateSummary();
    });

    dateInput.addEventListener("change", loadSlots);
    deliveryArea.addEventListener("change", updateSummary);

    budgetInput.addEventListener("input", () => {
      state.budgetTouched = true;
      updateSummary();
    });

    form.addEventListener("input", event => {
      if (
        event.target.closest("#productOptions") ||
        event.target.closest("#customProductOptions")
      ) {
        updateSummary();
      }
    });
    form.addEventListener("change", updateSummary);
    form.addEventListener("submit", submitOrder);
  }

  async function init() {
    if (state.loading) return;
    state.loading = true;

    try {
      const [productData, areaData] = await Promise.all([
        loadProducts(),
        DPRO.api("/api/public/delivery-areas"),
      ]);

      state.products = Array.isArray(productData.products)
        ? productData.products
        : [];
      state.areas = Array.isArray(areaData.delivery_areas)
        ? areaData.delivery_areas
        : [];

      renderProducts();
      renderCustomProductSelect();
      renderAreas();

      const requestedProduct = state.products.find(product =>
        (requestedProductId && product.id === requestedProductId) ||
        (requestedProductSlug && product.public_slug === requestedProductSlug)
      );

      const initialProduct =
        requestedProduct && isOrderable(requestedProduct)
          ? requestedProduct
          : firstOrderableProduct();

      if (requestedProduct && !isOrderable(requestedProduct)) {
        DPRO.setAlert(
          DPRO.qs("#catalogSelectionNotice"),
          "カタログで選択した商品は現在注文できないため、別の商品を選択してください。",
          "warning",
        );
      } else if (requestedProduct) {
        DPRO.setAlert(
          DPRO.qs("#catalogSelectionNotice"),
          `カタログで選んだ「${requestedProduct.product_name}」を注文内容へ反映しました。`,
          "info",
        );
      }

      if (initialProduct) {
        selectProduct(initialProduct.id, {
          updateBudget: true,
          syncRadio: true,
          syncCustomSelect: true,
        });
      }

      toggleFulfillment();
      await loadSlots();
      updateSummary();

      if (requestedProduct || requestedMode === "custom") {
        document.querySelector("#orderForm")?.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    } catch (error) {
      DPRO.setAlert(DPRO.qs("#pageAlert"), error.message, "error");
      productList.innerHTML =
        `<div class="empty">商品を読み込めませんでした。</div>`;
    } finally {
      state.loading = false;
    }
  }

  async function loadProducts() {
    try {
      return await DPRO.api("/api/public/catalog?limit=500");
    } catch (catalogError) {
      const fallback = await DPRO.api("/api/public/products");
      return {
        ok: true,
        products: (fallback.products || []).map(product => ({
          ...product,
          public_slug: "",
          short_description: product.description || "",
          detail_description: product.description || "",
          is_published: true,
          is_sold_out: false,
          orderable: true,
          consultation_enabled: true,
          flower_product_photos: [],
          flower_product_options: [],
        })),
        fallback: true,
      };
    }
  }

  function applyMode(mode, shouldScroll) {
    state.mode = mode === "custom" ? "custom" : "catalog";
    DPRO.qs("#orderModeInput").value = state.mode;

    DPRO.qsa("[data-order-mode]").forEach(button => {
      const active = button.dataset.orderMode === state.mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", String(active));
      const check = button.querySelector(".next-mode-check");
      if (check) check.textContent = active ? "選択中" : "こちらを選ぶ";
    });

    catalogCard.classList.toggle("hidden", state.mode !== "catalog");
    customCard.classList.toggle("hidden", state.mode !== "custom");
    DPRO.qs("#catalogAdjustmentField").classList.toggle(
      "hidden",
      state.mode !== "catalog"
    );

    customBaseProduct.required = state.mode === "custom";
    DPRO.qs("#designStyle").required = state.mode === "custom";

    DPRO.qs("#orderModeDescription").textContent =
      state.mode === "custom"
        ? "用途、ご予算、色合い、使用したい花などを入力してください。"
        : "写真付きカタログの商品を選択してください。";

    submitButton.textContent =
      state.mode === "custom"
        ? "この内容でオーダーメイドを相談する"
        : "この内容で注文する";

    const url = new URL(location.href);
    if (state.mode === "custom") {
      url.searchParams.set("mode", "custom");
    } else {
      url.searchParams.delete("mode");
    }
    history.replaceState({}, "", url);

    renderSelectedProduct();
    renderProductOptions();
    updateSummary();

    if (shouldScroll) {
      document.querySelector("#orderForm")?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }

  function renderProducts() {
    if (!state.products.length) {
      productList.innerHTML =
        `<div class="empty">現在注文できる商品がありません。</div>`;
      return;
    }

    productList.innerHTML = state.products.map(product => {
      const orderable = isOrderable(product);
      const photoUrl = safeImageUrl(
        product.main_photo_url ||
        product.flower_product_photos?.[0]?.public_url ||
        product.photo_url
      );
      const category =
        product.flower_product_categories?.category_name || "お花";
      const description =
        product.short_description ||
        product.description ||
        product.detail_description ||
        "用途やご予算に合わせてお作りします。";

      return `
        <label class="next-product-option ${orderable ? "" : "is-disabled"}">
          <input
            type="radio"
            name="product"
            value="${DPRO.escape(product.id)}"
            ${orderable ? "" : "disabled"}
          >
          ${photoUrl ? `
            <img
              class="next-product-thumb"
              src="${DPRO.escape(photoUrl)}"
              alt="${DPRO.escape(product.product_name || "商品写真")}"
              loading="lazy"
              data-product-image
            >
          ` : `
            <span class="next-product-thumb-placeholder">💐</span>
          `}
          <span class="next-product-copy">
            <span class="next-product-category">${DPRO.escape(category)}</span>
            <span class="next-product-name">
              ${DPRO.escape(product.product_name || "商品")}
              ${orderable ? "" : `<span class="next-product-soldout">受付停止</span>`}
            </span>
            <span class="next-product-description">${DPRO.escape(description)}</span>
            <span class="next-product-price">${DPRO.escape(priceLabel(product))}</span>
            <span class="next-product-tags">
              ${product.pickup_enabled !== false
                ? `<span class="next-product-tag">店頭受取</span>`
                : ""}
              ${product.delivery_enabled !== false
                ? `<span class="next-product-tag">店舗配達</span>`
                : ""}
              ${product.consultation_enabled === true
                ? `<span class="next-product-tag">相談可</span>`
                : ""}
            </span>
          </span>
        </label>
      `;
    }).join("");

    hydrateImageFallbacks(productList);
  }

  function renderCustomProductSelect() {
    const candidates = state.products.filter(product =>
      isOrderable(product) &&
      (
        product.consultation_enabled === true ||
        product.product_type === "consultation" ||
        product.product_type === "made_to_order"
      )
    );

    const source = candidates.length
      ? candidates
      : state.products.filter(isOrderable);

    customBaseProduct.innerHTML =
      `<option value="">選択してください</option>` +
      source.map(product => `
        <option value="${DPRO.escape(product.id)}">
          ${DPRO.escape(product.product_name)}（${DPRO.escape(priceLabel(product))}）
        </option>
      `).join("");
  }

  function renderAreas() {
    deliveryArea.innerHTML =
      `<option value="">選択してください</option>` +
      state.areas.map(area => `
        <option
          value="${DPRO.escape(area.id)}"
          data-fee="${Number(area.delivery_fee || 0)}"
        >
          ${DPRO.escape(area.area_name)}
          （配達料 ${DPRO.yen(area.delivery_fee)}）
        </option>
      `).join("");
  }

  function selectProduct(productId, options = {}) {
    const product = state.products.find(item => item.id === productId);

    if (!product || !isOrderable(product)) {
      DPRO.setAlert(
        DPRO.qs("#catalogSelectionNotice"),
        "この商品は現在注文できません。別の商品を選択してください。",
        "warning",
      );
      return;
    }

    state.selectedProductId = product.id;

    if (options.syncRadio !== false) {
      const radio = productList.querySelector(
        `input[name="product"][value="${cssEscape(product.id)}"]`
      );
      if (radio) radio.checked = true;
    }

    if (options.syncCustomSelect !== false) {
      customBaseProduct.value = product.id;
    }

    const minimumPrice = Number(product.minimum_price || 0);
    budgetInput.min = String(minimumPrice);
    DPRO.qs("#budgetHelp").textContent = minimumPrice > 0
      ? `この商品は${DPRO.yen(minimumPrice)}以上で承ります。`
      : "ご希望の予算を入力してください。";

    if (options.updateBudget && (!state.budgetTouched || !budgetInput.value)) {
      budgetInput.value =
        Number(product.default_price || product.minimum_price || 0);
      state.budgetTouched = false;
    }

    syncFulfillmentAvailability(product);
    renderSelectedProduct();
    renderProductOptions();
    updateSummary();
  }

  function selectedProduct() {
    return state.products.find(
      product => product.id === state.selectedProductId
    ) || null;
  }

  function firstOrderableProduct() {
    return state.products.find(isOrderable) || null;
  }

  function isOrderable(product) {
    return Boolean(
      product &&
      product.orderable !== false &&
      product.is_active !== false &&
      product.is_published !== false &&
      product.is_sold_out !== true
    );
  }

  function renderSelectedProduct() {
    const product = selectedProduct();
    const roots = [
      selectedProductPreview,
      customSelectedProductPreview,
    ];

    roots.forEach(root => {
      if (!root) return;
      if (!product) {
        root.classList.add("hidden");
        root.innerHTML = "";
        return;
      }

      const photoUrl = safeImageUrl(
        product.main_photo_url ||
        product.flower_product_photos?.[0]?.public_url ||
        product.photo_url
      );
      const description =
        product.detail_description ||
        product.description ||
        product.short_description ||
        "用途やご予算に合わせてお作りします。";

      root.innerHTML = `
        ${photoUrl ? `
          <img
            src="${DPRO.escape(photoUrl)}"
            alt="${DPRO.escape(product.product_name || "商品写真")}"
            data-product-image
          >
        ` : `
          <div class="next-selected-photo-placeholder">💐</div>
        `}
        <div>
          <div class="next-product-category">
            ${DPRO.escape(
              product.flower_product_categories?.category_name || "お花"
            )}
          </div>
          <h3>${DPRO.escape(product.product_name || "商品")}</h3>
          <p>${DPRO.escape(description)}</p>
          <div class="next-selected-price">
            ${DPRO.escape(priceLabel(product))}
          </div>
          ${product.size_label ? `
            <div class="help">サイズ目安：${DPRO.escape(product.size_label)}</div>
          ` : ""}
        </div>
      `;
      root.classList.remove("hidden");
      hydrateImageFallbacks(root);
    });
  }

  function renderProductOptions() {
    const product = selectedProduct();
    const activeRoot =
      state.mode === "custom"
        ? customProductOptionsRoot
        : productOptionsRoot;
    const inactiveRoot =
      state.mode === "custom"
        ? productOptionsRoot
        : customProductOptionsRoot;

    if (inactiveRoot) {
      inactiveRoot.classList.add("hidden");
      inactiveRoot.innerHTML = "";
    }

    if (!activeRoot) return;

    const options = Array.isArray(product?.flower_product_options)
      ? product.flower_product_options.filter(item => item.is_active !== false)
      : [];

    if (!options.length) {
      activeRoot.classList.add("hidden");
      activeRoot.innerHTML = "";
      return;
    }

    activeRoot.innerHTML = `
      <h3>商品オプション</h3>
      <div class="next-option-grid">
        ${options.map(optionField).join("")}
      </div>
    `;
    activeRoot.classList.remove("hidden");
  }

  function optionField(option) {
    const code = option.option_code || option.id || DPRO.uuid();
    const choices = normalizeChoices(option.choices);
    const adjustment = Number(option.price_adjustment || 0);
    const priceText = adjustment
      ? `（${adjustment > 0 ? "+" : ""}${DPRO.yen(adjustment)}）`
      : "";

    if (option.option_type === "checkbox") {
      return `
        <label class="next-option-check">
          <input
            type="checkbox"
            data-option-code="${DPRO.escape(code)}"
            data-option-name="${DPRO.escape(option.option_name || "オプション")}"
            data-price-adjustment="${adjustment}"
          >
          <span>
            ${DPRO.escape(option.option_name || "オプション")}
            ${DPRO.escape(priceText)}
          </span>
        </label>
      `;
    }

    if (option.option_type === "text") {
      return `
        <div class="field">
          <label for="option-${DPRO.escape(code)}">
            ${DPRO.escape(option.option_name || "オプション")}
            ${option.is_required ? "（必須）" : ""}
          </label>
          <input
            id="option-${DPRO.escape(code)}"
            data-option-code="${DPRO.escape(code)}"
            data-option-name="${DPRO.escape(option.option_name || "オプション")}"
            data-price-adjustment="${adjustment}"
            ${option.is_required ? "required" : ""}
          >
        </div>
      `;
    }

    return `
      <div class="field">
        <label for="option-${DPRO.escape(code)}">
          ${DPRO.escape(option.option_name || "オプション")}
          ${option.is_required ? "（必須）" : ""}
        </label>
        <select
          id="option-${DPRO.escape(code)}"
          data-option-code="${DPRO.escape(code)}"
          data-option-name="${DPRO.escape(option.option_name || "オプション")}"
          ${option.is_required ? "required" : ""}
        >
          <option value="">選択してください</option>
          ${choices.map(choice => `
            <option
              value="${DPRO.escape(choice.value)}"
              data-price-adjustment="${Number(choice.price_adjustment || adjustment)}"
            >
              ${DPRO.escape(choice.label)}
              ${Number(choice.price_adjustment || adjustment)
                ? `（${Number(choice.price_adjustment || adjustment) > 0 ? "+" : ""}${DPRO.yen(Number(choice.price_adjustment || adjustment))}）`
                : ""}
            </option>
          `).join("")}
        </select>
      </div>
    `;
  }

  function normalizeChoices(value) {
    if (Array.isArray(value)) {
      return value.map(choice => {
        if (typeof choice === "string") {
          return { value: choice, label: choice, price_adjustment: 0 };
        }
        return {
          value: String(choice.value ?? choice.code ?? choice.label ?? ""),
          label: String(choice.label ?? choice.name ?? choice.value ?? ""),
          price_adjustment: Number(
            choice.price_adjustment ?? choice.price ?? 0
          ),
        };
      }).filter(choice => choice.value);
    }

    if (value && typeof value === "object") {
      return Object.entries(value).map(([key, item]) => ({
        value: key,
        label:
          typeof item === "string"
            ? item
            : String(item?.label ?? item?.name ?? key),
        price_adjustment:
          typeof item === "object"
            ? Number(item?.price_adjustment ?? item?.price ?? 0)
            : 0,
      }));
    }

    if (typeof value === "string" && value.trim()) {
      try {
        return normalizeChoices(JSON.parse(value));
      } catch {
        return value.split(",").map(item => ({
          value: item.trim(),
          label: item.trim(),
          price_adjustment: 0,
        })).filter(item => item.value);
      }
    }

    return [];
  }

  function collectSelectedOptions() {
    const root =
      state.mode === "custom"
        ? customProductOptionsRoot
        : productOptionsRoot;
    const selected = {};
    let priceAdjustment = 0;

    DPRO.qsa("[data-option-code]", root).forEach(control => {
      const code = control.dataset.optionCode;
      const name = control.dataset.optionName || code;

      if (control.type === "checkbox") {
        if (!control.checked) return;
        selected[code] = {
          name,
          value: true,
        };
        priceAdjustment += Number(
          control.dataset.priceAdjustment || 0
        );
        return;
      }

      if (!control.value) return;

      const option =
        control.tagName === "SELECT"
          ? control.selectedOptions[0]
          : null;
      const adjustment = Number(
        option?.dataset.priceAdjustment ||
        control.dataset.priceAdjustment ||
        0
      );

      selected[code] = {
        name,
        value: control.value,
      };
      priceAdjustment += adjustment;
    });

    return { selected, priceAdjustment };
  }

  function syncFulfillmentAvailability(product) {
    const pickupOption = fulfillment.querySelector(
      'option[value="pickup"]'
    );
    const deliveryOption = fulfillment.querySelector(
      'option[value="delivery"]'
    );

    pickupOption.disabled = product?.pickup_enabled === false;
    deliveryOption.disabled = product?.delivery_enabled === false;

    if (fulfillment.selectedOptions[0]?.disabled) {
      if (!pickupOption.disabled) {
        fulfillment.value = "pickup";
      } else if (!deliveryOption.disabled) {
        fulfillment.value = "delivery";
      } else {
        fulfillment.value = "shipping_consultation";
      }
      requestedAt.value = "";
      loadSlots();
    }

    const labels = [];
    if (product?.pickup_enabled !== false) labels.push("店頭受取対応");
    if (product?.delivery_enabled !== false) labels.push("店舗配達対応");
    if (product?.consultation_enabled === true) labels.push("配送相談対応");
    DPRO.qs("#fulfillmentHelp").textContent = labels.join("・");
  }

  function toggleFulfillment() {
    const type = fulfillment.value;
    recipientCard.classList.toggle("hidden", type !== "delivery");

    const customerStepNumber = DPRO.qs("#customerStepNumber");
    if (customerStepNumber) {
      customerStepNumber.textContent = type === "delivery" ? "5" : "4";
    }

    DPRO.qs("#dateField").classList.toggle(
      "hidden",
      type === "shipping_consultation"
    );
    DPRO.qs("#slotField").classList.toggle(
      "hidden",
      type === "shipping_consultation"
    );

    for (const id of [
      "recipientName",
      "recipientPhone",
      "recipientAddress1",
    ]) {
      DPRO.qs(`#${id}`).required = type === "delivery";
    }

    deliveryArea.required = type === "delivery";
    dateInput.required = type !== "shipping_consultation";

    if (type === "shipping_consultation") {
      requestedAt.value = "";
    }
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

      slotGrid.innerHTML = data.slots.map(slot => `
        <button
          type="button"
          class="slot"
          data-at="${DPRO.escape(slot.requested_at)}"
          ${slot.available ? "" : "disabled"}
        >
          ${DPRO.escape(slot.time)}
        </button>
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
    const option = deliveryArea.selectedOptions[0];
    return fulfillment.value === "delivery"
      ? Number(option?.dataset.fee || 0)
      : 0;
  }

  function updateSummary() {
    const product = selectedProduct();
    const budget = Number(
      budgetInput.value ||
      product?.default_price ||
      product?.minimum_price ||
      0
    );
    const fee = selectedDeliveryFee();
    const optionData = collectSelectedOptions();
    const itemAmount = budget + optionData.priceAdjustment;

    summary.innerHTML = `
      <div class="summary-row">
        <span>注文方法</span>
        <strong>${state.mode === "custom" ? "オーダーメイド" : "写真から商品を選ぶ"}</strong>
      </div>
      <div class="summary-row">
        <span>商品</span>
        <strong>${DPRO.escape(product?.product_name || "未選択")}</strong>
      </div>
      ${optionData.priceAdjustment ? `
        <div class="summary-row">
          <span>商品オプション</span>
          <strong>${optionData.priceAdjustment > 0 ? "+" : ""}${DPRO.yen(optionData.priceAdjustment)}</strong>
        </div>
      ` : ""}
      <div class="summary-row">
        <span>受取方法</span>
        <strong>${DPRO.escape(DPRO.fulfillmentLabel(fulfillment.value))}</strong>
      </div>
      <div class="summary-row">
        <span>希望日時</span>
        <strong>
          ${requestedAt.value
            ? DPRO.dateTime(requestedAt.value)
            : fulfillment.value === "shipping_consultation"
              ? "店舗から連絡"
              : "未選択"}
        </strong>
      </div>
      <div class="summary-row">
        <span>商品金額</span>
        <strong>${DPRO.yen(itemAmount)}</strong>
      </div>
      <div class="summary-row">
        <span>配達料</span>
        <strong>${DPRO.yen(fee)}</strong>
      </div>
      <div class="summary-row">
        <span>合計目安</span>
        <strong>${DPRO.yen(itemAmount + fee)}</strong>
      </div>
    `;
  }

  async function submitOrder(event) {
    event.preventDefault();
    DPRO.setAlert(formAlert, "");

    const product = selectedProduct();
    if (!product) {
      DPRO.setAlert(
        formAlert,
        state.mode === "custom"
          ? "お花の形を選択してください。"
          : "商品を選択してください。",
        "error",
      );
      return;
    }

    if (!isOrderable(product)) {
      DPRO.setAlert(
        formAlert,
        "選択商品は現在注文できません。商品を選び直してください。",
        "error",
      );
      return;
    }

    if (!form.reportValidity()) return;

    if (
      fulfillment.value !== "shipping_consultation" &&
      !requestedAt.value
    ) {
      DPRO.setAlert(
        formAlert,
        "希望時間を選択してください。",
        "error",
      );
      return;
    }

    if (
      fulfillment.value === "pickup" &&
      product.pickup_enabled === false
    ) {
      DPRO.setAlert(
        formAlert,
        "この商品は店頭受取に対応していません。",
        "error",
      );
      return;
    }

    if (
      fulfillment.value === "delivery" &&
      product.delivery_enabled === false
    ) {
      DPRO.setAlert(
        formAlert,
        "この商品は店舗配達に対応していません。",
        "error",
      );
      return;
    }

    const optionData = collectSelectedOptions();
    const baseBudget = Math.max(
      Number(product.minimum_price || 0),
      Number(
        budgetInput.value ||
        product.default_price ||
        product.minimum_price ||
        0
      )
    );
    const unitPrice = baseBudget + optionData.priceAdjustment;
    const fee = selectedDeliveryFee();

    const preferredFlowers =
      state.mode === "custom"
        ? DPRO.qs("#preferredFlowers").value
        : DPRO.qs("#flowerPreferences").value;

    const body = {
      idempotency_key: `flower-web-${DPRO.uuid()}`,
      source: "line",
      order_type: state.mode === "custom" ? "custom" : "catalog",
      fulfillment_type: fulfillment.value,
      usage_type: DPRO.qs("#usageType").value,
      requested_at: requestedAt.value || null,
      delivery_fee: fee,
      customer: {
        customer_name: DPRO.qs("#customerName").value,
        phone: DPRO.qs("#customerPhone").value,
        email: DPRO.qs("#customerEmail").value,
        company_name: DPRO.qs("#companyName").value,
        line_user_id: DPRO.isDemo()
          ? DPRO.getDemoLineUserId()
          : null,
        line_link_approved: DPRO.isDemo(),
        marketing_opt_in: DPRO.qs("#marketingOptIn").checked,
      },
      items: [{
        product_id: product.id,
        quantity: 1,
        unit_price: unitPrice,
        budget_amount: unitPrice,
        color_mood: DPRO.qs("#colorMood").value,
        flower_preferences: preferredFlowers,
        preferred_flowers: preferredFlowers,
        avoid_flowers:
          state.mode === "custom"
            ? DPRO.qs("#avoidFlowers").value
            : "",
        item_type: state.mode === "custom" ? "custom" : "catalog",
        size_label:
          state.mode === "custom"
            ? DPRO.qs("#customSizeLabel").value
            : product.size_label || "",
        design_style:
          state.mode === "custom"
            ? DPRO.qs("#designStyle").value
            : DPRO.qs("#colorMood").value,
        ribbon_text:
          state.mode === "custom"
            ? DPRO.qs("#ribbonText").value
            : "",
        standing_sign_text:
          state.mode === "custom"
            ? DPRO.qs("#standingSignText").value
            : "",
        wrapping_option:
          state.mode === "custom"
            ? DPRO.qs("#wrappingOption").value
            : "",
        reference_photo_required:
          state.mode === "custom" &&
          DPRO.qs("#referencePhotoRequired").checked,
        selected_options: optionData.selected,
        item_note:
          state.mode === "custom"
            ? DPRO.qs("#referenceImageNote").value
            : "",
        metadata: {
          order_mode: state.mode,
          catalog_slug: product.public_slug || null,
          reference_image_note:
            state.mode === "custom"
              ? DPRO.qs("#referenceImageNote").value
              : null,
        },
      }],
      customer_note: DPRO.qs("#customerNote").value,
      message_card: DPRO.qs("#messageText").value ? {
        card_type: "message_card",
        message_text: DPRO.qs("#messageText").value,
        sender_name: DPRO.qs("#senderName").value,
        confirmed: true,
      } : undefined,
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

    DPRO.setButtonBusy(
      submitButton,
      true,
      state.mode === "custom"
        ? "相談内容を登録しています…"
        : "注文を登録しています…"
    );

    try {
      const result = await DPRO.api("/api/order/create", {
        method: "POST",
        body,
      });

      sessionStorage.setItem(
        "dpro_flower_last_order",
        JSON.stringify(result.order)
      );

      location.href =
        `member.html?demo=1&created=${encodeURIComponent(result.order.order_number)}`;
    } catch (error) {
      DPRO.setAlert(formAlert, error.message, "error");
      formAlert.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    } finally {
      DPRO.setButtonBusy(submitButton, false);
    }
  }

  function priceLabel(product) {
    const minimum = Number(product.minimum_price || 0);
    const standard = Number(product.default_price || minimum || 0);
    const type = String(product.price_display_type || "").toLowerCase();

    if (
      product.product_type === "consultation" ||
      product.requires_quote === true ||
      ["consultation", "quote", "ask"].includes(type)
    ) {
      return "価格はご相談";
    }

    if (!standard && !minimum) return "価格はご相談";

    if (
      ["from", "minimum", "starting_from"].includes(type) ||
      (minimum > 0 && standard > minimum)
    ) {
      return `${DPRO.yen(minimum || standard)}〜`;
    }

    return DPRO.yen(standard || minimum);
  }

  function safeImageUrl(value) {
    const text = String(value || "").trim();
    if (!text) return "";

    try {
      const url = new URL(text, location.href);
      if (!["http:", "https:"].includes(url.protocol)) return "";
      return url.href;
    } catch {
      return "";
    }
  }

  function hydrateImageFallbacks(root) {
    DPRO.qsa("[data-product-image]", root).forEach(image => {
      image.addEventListener("error", () => {
        const replacement = document.createElement("span");
        replacement.className =
          image.classList.contains("next-product-thumb")
            ? "next-product-thumb-placeholder"
            : "next-selected-photo-placeholder";
        replacement.textContent = "💐";
        image.replaceWith(replacement);
      }, { once: true });
    });
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return CSS.escape(String(value));
    return String(value).replace(/["\\]/g, "\\$&");
  }
});
