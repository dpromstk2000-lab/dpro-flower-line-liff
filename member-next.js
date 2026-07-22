document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const PAGE_VERSION = "FLOWER-NEXT-9-MEMBER-20260722";
  const REPEAT_ORDER_KEY = "dpro_flower_repeat_order_v1";
  const FINAL_STATUSES = new Set(["delivered", "handed_over", "cancelled"]);

  const state = {
    profile: null,
    orders: [],
    addresses: [],
    anniversaries: [],
    activeTab: "orders",
    orderFilter: "active",
    editingAddressId: "",
    editingAnniversaryId: "",
  };

  const memberLoading = DPRO.qs("#memberLoading");
  const memberApp = DPRO.qs("#memberApp");
  const pageAlert = DPRO.qs("#pageAlert");
  const ordersRoot = DPRO.qs("#orders");
  const addressesRoot = DPRO.qs("#addresses");
  const anniversariesRoot = DPRO.qs("#anniversaries");

  const addressDialog = DPRO.qs("#addressDialog");
  const addressForm = DPRO.qs("#addressForm");
  const addressAlert = DPRO.qs("#addressAlert");

  const anniversaryDialog = DPRO.qs("#anniversaryDialog");
  const anniversaryForm = DPRO.qs("#anniversaryForm");
  const anniversaryAlert = DPRO.qs("#anniversaryAlert");

  const cancelDialog = DPRO.qs("#cancelDialog");
  const cancelForm = DPRO.qs("#cancelForm");
  const cancelAlert = DPRO.qs("#cancelAlert");

  mountNavigation();
  bindEvents();
  showCreatedNotice();
  load();

  function mountNavigation() {
    DPRO.mountChrome("member");

    const topnav = DPRO.qs("#topnav");
    if (topnav && !topnav.querySelector('a[href^="catalog.html"]')) {
      topnav.insertAdjacentHTML(
        "afterbegin",
        `<a href="catalog.html">商品カタログ</a>`
      );
    }

    const mobile = DPRO.qs("#mobileNav");
    if (mobile) {
      const demo = DPRO.isDemo() ? "?demo=1" : "";
      mobile.innerHTML = `
        <a href="catalog.html"><span>🌷</span>カタログ</a>
        <a href="index.html"><span>💐</span>注文</a>
        <a href="member.html" class="active"><span>🎫</span>マイページ</a>
        <a href="owner.html${demo}"><span>🖥️</span>管理</a>
        <a href="staff.html${demo}"><span>🧺</span>作業</a>
      `;
    }

    DPRO.qs("#appVersion").textContent = PAGE_VERSION;
  }

  function showCreatedNotice() {
    const created = new URLSearchParams(location.search).get("created");
    if (!created) return;

    DPRO.setAlert(
      DPRO.qs("#createdNotice"),
      `ご注文を受け付けました。受付番号：${created}`,
      "info"
    );
  }

  function bindEvents() {
    DPRO.qsa("[data-member-tab]").forEach(button => {
      button.addEventListener("click", () => openTab(button.dataset.memberTab));
    });

    DPRO.qsa("[data-open-tab]").forEach(button => {
      button.addEventListener("click", () => openTab(button.dataset.openTab));
    });

    DPRO.qsa("[data-order-filter]").forEach(button => {
      button.addEventListener("click", () => {
        state.orderFilter = button.dataset.orderFilter;
        DPRO.qsa("[data-order-filter]").forEach(item => {
          item.classList.toggle("active", item === button);
        });
        renderOrders();
      });
    });

    DPRO.qs("#newAddressButton").addEventListener("click", () => openAddressEditor(null));
    DPRO.qs("#closeAddressDialog").addEventListener("click", closeAddressEditor);
    DPRO.qs("#cancelAddressDialog").addEventListener("click", closeAddressEditor);
    addressDialog.addEventListener("cancel", event => {
      event.preventDefault();
      closeAddressEditor();
    });
    addressForm.addEventListener("submit", saveAddress);

    DPRO.qs("#newAnniversaryButton").addEventListener("click", () => openAnniversaryEditor(null));
    DPRO.qs("#closeAnniversaryDialog").addEventListener("click", closeAnniversaryEditor);
    DPRO.qs("#cancelAnniversaryDialog").addEventListener("click", closeAnniversaryEditor);
    anniversaryDialog.addEventListener("cancel", event => {
      event.preventDefault();
      closeAnniversaryEditor();
    });
    anniversaryForm.addEventListener("submit", saveAnniversary);

    DPRO.qs("#closeCancelDialog").addEventListener("click", closeCancelDialog);
    DPRO.qs("#cancelCancelDialog").addEventListener("click", closeCancelDialog);
    cancelDialog.addEventListener("cancel", event => {
      event.preventDefault();
      closeCancelDialog();
    });
    cancelForm.addEventListener("submit", sendCancelRequest);
  }

  function memberPath(path) {
    if (!DPRO.isDemo()) return path;

    const separator = path.includes("?") ? "&" : "?";
    return `${path}${separator}line_user_id=${encodeURIComponent(DPRO.getDemoLineUserId())}`;
  }

  async function memberApi(path, options = {}) {
    const headers = new Headers(options.headers || {});

    try {
      if (
        globalThis.liff?.isLoggedIn?.() &&
        typeof globalThis.liff.getIDToken === "function"
      ) {
        const token = globalThis.liff.getIDToken();
        if (token) headers.set("authorization", `Bearer ${token}`);
      }
    } catch {
      // Demo and non-LIFF browser continue with the existing member path.
    }

    return DPRO.api(memberPath(path), {
      ...options,
      headers,
    });
  }

  async function load() {
    memberLoading.classList.remove("hidden");
    memberApp.classList.add("hidden");
    DPRO.setAlert(pageAlert, "");

    try {
      const [profileData, orderData] = await Promise.all([
        memberApi("/api/member/profile"),
        memberApi("/api/member/orders"),
      ]);

      state.profile = profileData.found ? profileData.customer : null;
      state.addresses = profileData.addresses || [];
      state.anniversaries = profileData.anniversaries || [];
      state.orders = orderData.orders || [];

      renderProfile();
      renderStats();
      renderOrders();
      renderAddresses();
      renderAnniversaries();

      memberLoading.classList.add("hidden");
      memberApp.classList.remove("hidden");

      await hydrateMemberPhotos();
    } catch (error) {
      memberLoading.classList.add("hidden");
      memberApp.classList.remove("hidden");
      DPRO.setAlert(pageAlert, error.message, "error");
      renderLoadError();
    }
  }

  function renderLoadError() {
    ordersRoot.innerHTML = emptyState(
      "🌷",
      "注文情報を読み込めませんでした。",
      "時間をおいて、もう一度マイページを開いてください。"
    );
    addressesRoot.innerHTML = emptyState(
      "📍",
      "届け先を読み込めませんでした。",
      ""
    );
    anniversariesRoot.innerHTML = emptyState(
      "🎂",
      "記念日を読み込めませんでした。",
      ""
    );
  }

  function renderProfile() {
    if (!state.profile) {
      DPRO.qs("#customerName").textContent = "まだお客様情報がありません";
      DPRO.qs("#customerMeta").textContent =
        "最初のお花を注文すると、注文履歴・届け先・記念日を利用できます。";
      return;
    }

    DPRO.qs("#customerName").textContent =
      state.profile.customer_name || "お客様";
    DPRO.qs("#customerMeta").textContent = [
      state.profile.customer_number,
      state.profile.phone,
      state.profile.company_name,
    ].filter(Boolean).join("・") || "LINE会員";
  }

  function renderStats() {
    const activeCount = state.orders.filter(order =>
      !FINAL_STATUSES.has(order.status)
    ).length;

    const photoCount = state.orders.reduce((sum, order) =>
      sum + customerVisiblePhotos(order).length,
    0);

    setText("#activeOrderCount", activeCount);
    setText("#photoCount", photoCount);
    setText("#addressCount", state.addresses.length);
    setText("#anniversaryCount", state.anniversaries.length);
  }

  function openTab(tab) {
    if (!["orders", "addresses", "anniversaries"].includes(tab)) {
      tab = "orders";
    }
    state.activeTab = tab;

    DPRO.qsa("[data-member-panel]").forEach(panel => {
      panel.classList.toggle("active", panel.dataset.memberPanel === tab);
    });
    DPRO.qsa("[data-member-tab]").forEach(button => {
      button.classList.toggle("active", button.dataset.memberTab === tab);
    });
    DPRO.qsa("[data-open-tab]").forEach(button => {
      button.classList.toggle("active", button.dataset.openTab === tab);
    });

    const panel = DPRO.qs(`#panel-${tab}`);
    panel?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function filteredOrders() {
    if (state.orderFilter === "history") {
      return state.orders.filter(order => FINAL_STATUSES.has(order.status));
    }
    if (state.orderFilter === "all") return state.orders;
    return state.orders.filter(order => !FINAL_STATUSES.has(order.status));
  }

  function renderOrders() {
    const orders = filteredOrders();

    if (!state.profile && !state.orders.length) {
      ordersRoot.innerHTML = emptyState(
        "💐",
        "まだ注文履歴がありません。",
        "最初のお花を注文すると、進捗と完成写真がここに表示されます。",
        `<a class="btn btn-primary" href="index.html">花を注文する</a>`
      );
      return;
    }

    if (!orders.length) {
      ordersRoot.innerHTML = emptyState(
        "🧾",
        state.orderFilter === "active"
          ? "対応中の注文はありません。"
          : "この条件の注文履歴はありません。",
        ""
      );
      return;
    }

    ordersRoot.innerHTML = orders.map(order => {
      const completed = FINAL_STATUSES.has(order.status);
      const recipient = firstRelated(order.flower_order_recipients);
      const photos = customerVisiblePhotos(order);
      const cancellable = !FINAL_STATUSES.has(order.status);
      const items = Array.isArray(order.flower_order_items)
        ? order.flower_order_items
        : [];

      return `
        <article class="member-order-card ${completed ? "completed" : ""}">
          <header class="member-order-head">
            <div>
              <div class="member-order-number">${DPRO.escape(order.order_number || "")}</div>
              <div class="member-order-meta">
                ${DPRO.dateTime(order.requested_at)}
                ・${DPRO.escape(DPRO.fulfillmentLabel(order.fulfillment_type))}
              </div>
            </div>
            ${DPRO.statusBadge(order.status)}
          </header>

          <div class="member-order-body">
            <div class="member-order-layout">
              <div>
                <div class="member-item-list">
                  ${items.length
                    ? items.map(item => orderItemHtml(item)).join("")
                    : `<div class="member-next-message">商品情報を確認中です。</div>`}
                </div>

                ${progressHtml(order)}
                <div class="member-next-message">${DPRO.escape(nextActionMessage(order))}</div>

                <div class="member-order-summary summary-list">
                  <div class="summary-row"><span>用途</span><strong>${DPRO.escape(DPRO.usageLabel(order.usage_type))}</strong></div>
                  <div class="summary-row"><span>注文方法</span><strong>${order.order_type === "custom" ? "オーダーメイド" : "カタログ商品"}</strong></div>
                  <div class="summary-row"><span>お支払い</span><strong>${DPRO.escape(paymentLabel(order.payment_status))}</strong></div>
                  <div class="summary-row"><span>合計</span><strong>${DPRO.yen(order.total_amount)}</strong></div>
                </div>

                ${recipient ? recipientHtml(recipient) : ""}
                ${order.customer_note
                  ? `<div class="member-recipient-card"><strong>ご希望</strong><span>${DPRO.escape(order.customer_note)}</span></div>`
                  : ""}

                ${photos.length ? photoSectionHtml(photos) : ""}
              </div>

              <aside class="member-order-actions">
                <button
                  type="button"
                  class="btn btn-primary"
                  data-repeat-order="${DPRO.escape(order.id)}"
                >この内容をもとに再注文</button>

                ${cancellable ? `
                  <button
                    type="button"
                    class="btn btn-secondary"
                    data-cancel-order="${DPRO.escape(order.order_number)}"
                  >変更・キャンセルを相談</button>
                ` : ""}

                <a class="btn btn-secondary" href="catalog.html">ほかの商品を見る</a>
                <p class="help">再注文時は、現在の商品・価格・空き日時をもう一度確認してください。</p>
              </aside>
            </div>
          </div>
        </article>
      `;
    }).join("");

    DPRO.qsa("[data-repeat-order]", ordersRoot).forEach(button => {
      button.addEventListener("click", () => repeatOrder(button.dataset.repeatOrder));
    });

    DPRO.qsa("[data-cancel-order]", ordersRoot).forEach(button => {
      button.addEventListener("click", () => openCancelDialog(button.dataset.cancelOrder));
    });

    hydrateMemberPhotos();
  }

  function orderItemHtml(item) {
    const photo = safeImageUrl(item.product_photo_snapshot);
    const detail = [
      item.color_mood,
      item.size_label,
      item.design_style,
    ].filter(Boolean).join("・");

    return `
      <div class="member-item">
        ${photo
          ? `<img class="member-item-photo" src="${DPRO.escape(photo)}" alt="${DPRO.escape(item.product_name_snapshot || "商品写真")}" loading="lazy">`
          : `<div class="member-item-photo">💐</div>`}
        <div>
          <strong>${DPRO.escape(item.product_name_snapshot || "商品")} × ${Number(item.quantity || 1)}</strong>
          <span>${DPRO.escape(detail || "内容は店舗で確認しています")}</span>
        </div>
        <div class="member-item-price">${DPRO.yen(item.line_total || Number(item.unit_price || 0) * Number(item.quantity || 1))}</div>
      </div>
    `;
  }

  function progressHtml(order) {
    const lastLabel =
      order.fulfillment_type === "delivery" ? "配達完了" : "お渡し";
    const steps = ["受付", "注文確定", "制作", "完成", lastLabel];
    const current = progressIndex(order.status);

    return `
      <div class="member-progress" aria-label="注文進捗">
        ${steps.map((label, index) => `
          <div class="member-progress-step ${
            index < current ? "done" : index === current ? "active" : ""
          }">${index < current ? "✓ " : ""}${DPRO.escape(label)}</div>
        `).join("")}
      </div>
    `;
  }

  function progressIndex(status) {
    return ({
      new: 0,
      reviewing: 0,
      quoted: 0,
      customer_waiting: 0,
      confirmed: 1,
      payment_waiting: 1,
      production_waiting: 1,
      producing: 2,
      completed: 3,
      pickup_waiting: 3,
      delivery_preparing: 3,
      delivering: 3,
      delivered: 4,
      handed_over: 4,
      cancelled: 0,
    })[status] ?? 0;
  }

  function nextActionMessage(order) {
    return ({
      new: "ご注文を受け付けました。店舗で内容を確認します。",
      reviewing: "店舗で商品・日時・ご希望を確認しています。",
      quoted: "お見積り内容をご確認ください。店舗からご連絡します。",
      customer_waiting: "確認が必要な内容があります。店舗からのご連絡をお待ちください。",
      confirmed: "注文が確定しました。制作開始までお待ちください。",
      payment_waiting: "お支払い確認後に制作へ進みます。",
      production_waiting: "制作の準備をしています。",
      producing: "お花を制作しています。",
      completed: order.fulfillment_type === "delivery"
        ? "お花が完成しました。配達準備へ進みます。"
        : "お花が完成しました。受取準備をしています。",
      pickup_waiting: "店頭でお受け取りいただけます。",
      delivery_preparing: "梱包・配達準備をしています。",
      delivering: "お届け先へ配達中です。",
      delivered: "配達が完了しました。ご利用ありがとうございました。",
      handed_over: "店頭でのお渡しが完了しました。ご利用ありがとうございました。",
      cancelled: "この注文はキャンセルされています。",
    })[order.status] || "店舗で注文状況を確認しています。";
  }

  function recipientHtml(recipient) {
    const address = [
      recipient.postal_code,
      recipient.prefecture,
      recipient.city,
      recipient.address_line1,
      recipient.address_line2,
    ].filter(Boolean).join(" ");

    return `
      <div class="member-recipient-card">
        <strong>お届け先</strong>
        <span>
          ${DPRO.escape([
            recipient.recipient_name,
            recipient.company_or_facility_name,
            recipient.venue_name,
          ].filter(Boolean).join("・"))}<br>
          ${DPRO.escape(address)}
        </span>
      </div>
    `;
  }

  function photoSectionHtml(photos) {
    return `
      <section class="member-photo-section">
        <h4>店舗から届いた写真</h4>
        <div class="member-photo-grid">
          ${photos.map(photo => `
            <figure
              class="member-photo"
              data-member-photo="${DPRO.escape(photo.id)}"
              data-photo-mime="${DPRO.escape(photo.mime_type || "")}"
            >
              <div class="loading">写真を読み込んでいます…</div>
              <figcaption>${photo.photo_type === "delivery_proof" ? "配達完了写真" : "完成したお花"}</figcaption>
            </figure>
          `).join("")}
        </div>
      </section>
    `;
  }

  function customerVisiblePhotos(order) {
    return (order.flower_photos || []).filter(photo =>
      photo.is_customer_visible === true &&
      ["completion_public", "delivery_proof"].includes(photo.photo_type)
    );
  }

  async function hydrateMemberPhotos() {
    const figures = DPRO.qsa("[data-member-photo]");

    await Promise.all(figures.map(async figure => {
      if (figure.dataset.hydrated === "1") return;
      figure.dataset.hydrated = "1";

      try {
        const data = await memberApi(
          `/api/member/photos/signed-url?photo_id=${encodeURIComponent(figure.dataset.memberPhoto)}`
        );
        const mime = data.photo?.mime_type || figure.dataset.photoMime || "";
        const caption = figure.querySelector("figcaption")?.outerHTML || "";

        figure.innerHTML = mime === "image/heic"
          ? `
            <a class="btn btn-secondary btn-small" href="${DPRO.escape(data.signed_url)}" target="_blank" rel="noopener">写真を開く</a>
            ${caption}
          `
          : `
            <img src="${DPRO.escape(data.signed_url)}" alt="店舗から届いたお花の写真" loading="lazy">
            ${caption}
          `;
      } catch {
        figure.innerHTML = `
          <div class="alert alert-error">写真を表示できませんでした。</div>
        `;
      }
    }));
  }

  function repeatOrder(orderId) {
    const order = state.orders.find(item => item.id === orderId);
    if (!order) return;

    const item = Array.isArray(order.flower_order_items)
      ? order.flower_order_items[0]
      : null;
    const recipient = firstRelated(order.flower_order_recipients);

    const payload = {
      saved_at: new Date().toISOString(),
      source: "member_repeat",
      order_number: order.order_number,
      mode: item?.item_type === "custom" || order.order_type === "custom"
        ? "custom"
        : "catalog",
      product_id: item?.product_id || "",
      product_name: item?.product_name_snapshot || "",
      usage_type: order.usage_type || "",
      fulfillment_type: order.fulfillment_type || "pickup",
      color_mood: item?.color_mood || "おまかせ",
      budget_amount: Number(
        item?.unit_price ||
        (Number(order.subtotal || order.total_amount || 0) -
          Number(order.delivery_fee || 0))
      ),
      flower_preferences:
        item?.preferred_flowers ||
        item?.flower_preferences ||
        "",
      custom_size_label: item?.size_label || "",
      design_style: item?.design_style || "",
      preferred_flowers: item?.preferred_flowers || "",
      avoid_flowers: item?.avoid_flowers || "",
      ribbon_text: item?.ribbon_text || "",
      standing_sign_text: item?.standing_sign_text || "",
      wrapping_option: item?.wrapping_option || "",
      customer_note: order.customer_note || "",
      recipient: recipient
        ? {
            recipient_name: recipient.recipient_name || "",
            recipient_phone: recipient.recipient_phone || "",
            postal_code: recipient.postal_code || "",
            prefecture: recipient.prefecture || "",
            city: recipient.city || "",
            address_line1: [
              recipient.address_line1,
              recipient.address_line2,
            ].filter(Boolean).join(" "),
            company_or_facility_name:
              recipient.company_or_facility_name || "",
            venue_name: recipient.venue_name || "",
            delivery_note: recipient.delivery_note || "",
          }
        : null,
    };

    try {
      sessionStorage.setItem(REPEAT_ORDER_KEY, JSON.stringify(payload));
    } catch {
      // Query parameters still preselect the product and mode.
    }

    const params = new URLSearchParams();
    if (payload.mode === "custom") params.set("mode", "custom");
    if (payload.product_id) params.set("product_id", payload.product_id);
    params.set("repeat", "1");

    location.href = `index.html?${params.toString()}#orderForm`;
  }

  function repeatFromAnniversary(anniversaryId) {
    const item = state.anniversaries.find(value => value.id === anniversaryId);
    if (!item) return;

    const payload = {
      saved_at: new Date().toISOString(),
      source: "member_anniversary",
      anniversary_id: item.id,
      mode: "custom",
      product_id: "",
      usage_type: usageForAnniversary(item.anniversary_type),
      fulfillment_type: "pickup",
      color_mood: item.preferred_color_mood || "おまかせ",
      budget_amount: Number(item.preferred_budget || 0),
      customer_note: `${item.title}のお花を相談したい`,
    };

    try {
      sessionStorage.setItem(REPEAT_ORDER_KEY, JSON.stringify(payload));
    } catch {
      // Continue with mode query.
    }

    location.href = "index.html?mode=custom&repeat=1#orderForm";
  }

  function renderAddresses() {
    if (!state.profile) {
      addressesRoot.innerHTML = emptyState(
        "📍",
        "届け先を利用するには、最初にお花をご注文ください。",
        "",
        `<a class="btn btn-primary" href="index.html">花を注文する</a>`
      );
      return;
    }

    if (!state.addresses.length) {
      addressesRoot.innerHTML = emptyState(
        "📍",
        "登録された届け先はありません。",
        "ご家族、会社、会場などを登録すると、次回注文が簡単になります。",
        `<button type="button" class="btn btn-primary" data-empty-new-address>届け先を追加</button>`
      );
      DPRO.qs("[data-empty-new-address]", addressesRoot)?.addEventListener(
        "click",
        () => openAddressEditor(null)
      );
      return;
    }

    addressesRoot.innerHTML = state.addresses.map(address => {
      const addressText = [
        address.postal_code,
        address.prefecture,
        address.city,
        address.address_line1,
        address.address_line2,
      ].filter(Boolean).join(" ");

      return `
        <article class="member-address-card">
          <div class="member-card-head">
            <h3>${DPRO.escape(address.address_label || "届け先")}</h3>
            ${address.is_default
              ? `<span class="member-default-badge">いつもの届け先</span>`
              : ""}
          </div>
          <div class="member-address-name">
            ${DPRO.escape([
              address.recipient_name,
              address.company_or_facility_name,
              address.venue_name,
            ].filter(Boolean).join("・"))}
          </div>
          <div class="member-address-text">
            ${DPRO.escape(addressText || "住所未登録")}<br>
            ${DPRO.escape(address.recipient_phone || "")}
          </div>
          ${address.delivery_note
            ? `<div class="member-anniversary-preference">配達注意：${DPRO.escape(address.delivery_note)}</div>`
            : ""}
          <div class="member-card-actions">
            <button type="button" class="btn btn-secondary btn-small" data-edit-address="${DPRO.escape(address.id)}">編集</button>
            <button type="button" class="btn btn-danger btn-small" data-delete-address="${DPRO.escape(address.id)}">削除</button>
          </div>
        </article>
      `;
    }).join("");

    DPRO.qsa("[data-edit-address]", addressesRoot).forEach(button => {
      button.addEventListener("click", () => {
        const address = state.addresses.find(item => item.id === button.dataset.editAddress);
        openAddressEditor(address || null);
      });
    });

    DPRO.qsa("[data-delete-address]", addressesRoot).forEach(button => {
      button.addEventListener("click", () => deleteAddress(button));
    });
  }

  function openAddressEditor(address) {
    if (!state.profile) {
      DPRO.setAlert(
        pageAlert,
        "届け先を登録するには、最初にお花をご注文ください。",
        "warning"
      );
      return;
    }

    state.editingAddressId = address?.id || "";
    DPRO.qs("#addressDialogTitle").textContent =
      address ? "届け先を編集" : "届け先を追加";
    setValue("#addressId", address?.id || "");
    setValue("#addressLabel", address?.address_label || "届け先");
    setValue("#addressRecipientName", address?.recipient_name || "");
    setValue("#addressRecipientPhone", address?.recipient_phone || "");
    setValue("#addressPostalCode", address?.postal_code || "");
    setValue("#addressPrefecture", address?.prefecture || "福岡県");
    setValue("#addressCity", address?.city || "");
    setValue("#addressLine1", address?.address_line1 || "");
    setValue("#addressLine2", address?.address_line2 || "");
    setValue("#addressFacility", address?.company_or_facility_name || "");
    setValue("#addressVenue", address?.venue_name || "");
    setValue("#addressDeliveryNote", address?.delivery_note || "");
    DPRO.qs("#addressDefault").checked =
      address?.is_default === true || state.addresses.length === 0;
    DPRO.setAlert(addressAlert, "");

    openDialog(addressDialog);
  }

  function closeAddressEditor() {
    closeDialog(addressDialog);
    state.editingAddressId = "";
  }

  async function saveAddress(event) {
    event.preventDefault();
    if (!addressForm.reportValidity()) return;

    const id = DPRO.qs("#addressId").value;
    const body = {
      address_label: DPRO.qs("#addressLabel").value,
      recipient_name: DPRO.qs("#addressRecipientName").value,
      recipient_phone: DPRO.qs("#addressRecipientPhone").value,
      postal_code: DPRO.qs("#addressPostalCode").value,
      prefecture: DPRO.qs("#addressPrefecture").value,
      city: DPRO.qs("#addressCity").value,
      address_line1: DPRO.qs("#addressLine1").value,
      address_line2: DPRO.qs("#addressLine2").value,
      company_or_facility_name: DPRO.qs("#addressFacility").value,
      venue_name: DPRO.qs("#addressVenue").value,
      delivery_note: DPRO.qs("#addressDeliveryNote").value,
      is_default: DPRO.qs("#addressDefault").checked,
    };

    const button = DPRO.qs("#saveAddressButton");
    DPRO.setButtonBusy(button, true, "保存中…");
    DPRO.setAlert(addressAlert, "");

    try {
      await memberApi(
        id ? `/api/member/addresses/${id}` : "/api/member/addresses",
        {
          method: id ? "PATCH" : "POST",
          body,
        }
      );

      closeAddressEditor();
      await reloadProfileOnly();
      DPRO.setAlert(
        pageAlert,
        id ? "届け先を更新しました。" : "届け先を追加しました。",
        "info"
      );
    } catch (error) {
      DPRO.setAlert(addressAlert, error.message, "error");
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  async function deleteAddress(button) {
    const address = state.addresses.find(
      item => item.id === button.dataset.deleteAddress
    );
    if (!address) return;

    if (!window.confirm(`「${address.address_label || "届け先"}」を削除しますか？`)) {
      return;
    }

    DPRO.setButtonBusy(button, true, "削除中…");

    try {
      await memberApi(`/api/member/addresses/${address.id}`, {
        method: "DELETE",
      });
      await reloadProfileOnly();
      DPRO.setAlert(pageAlert, "届け先を削除しました。", "info");
    } catch (error) {
      DPRO.setAlert(pageAlert, error.message, "error");
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  function renderAnniversaries() {
    if (!state.profile) {
      anniversariesRoot.innerHTML = emptyState(
        "🎂",
        "記念日を利用するには、最初にお花をご注文ください。",
        "",
        `<a class="btn btn-primary" href="index.html">花を注文する</a>`
      );
      return;
    }

    if (!state.anniversaries.length) {
      anniversariesRoot.innerHTML = emptyState(
        "🎂",
        "登録された記念日はありません。",
        "誕生日や結婚記念日を登録して、次のお花を忘れずに準備できます。",
        `<button type="button" class="btn btn-primary" data-empty-new-anniversary>記念日を追加</button>`
      );
      DPRO.qs(
        "[data-empty-new-anniversary]",
        anniversariesRoot
      )?.addEventListener("click", () => openAnniversaryEditor(null));
      return;
    }

    const sorted = [...state.anniversaries].sort((a, b) =>
      daysUntilAnniversary(a) - daysUntilAnniversary(b)
    );

    anniversariesRoot.innerHTML = sorted.map(item => {
      const days = daysUntilAnniversary(item);
      const daysText = days === 0
        ? "今日"
        : days > 0
          ? `あと ${days}日`
          : "日付を確認";

      return `
        <article class="member-anniversary-card">
          <div class="member-anniversary-top">
            <span class="badge">${DPRO.escape(anniversaryLabel(item.anniversary_type))}</span>
            <h3>${DPRO.escape(item.title || "記念日")}</h3>
            <div class="member-anniversary-date">${DPRO.date(item.anniversary_date)}</div>
          </div>
          <div class="member-anniversary-body">
            <div class="member-anniversary-days">
              ${DPRO.escape(daysText)}
              <small>・${Number(item.remind_days_before || 0)}日前から準備</small>
            </div>
            <div class="member-anniversary-preference">
              ご予算：${item.preferred_budget ? DPRO.yen(item.preferred_budget) : "未設定"}<br>
              色・雰囲気：${DPRO.escape(item.preferred_color_mood || "未設定")}
            </div>
            <div class="member-order-actions">
              <button type="button" class="btn btn-primary btn-small" data-order-anniversary="${DPRO.escape(item.id)}">この記念日のお花を注文</button>
            </div>
            <div class="member-card-actions">
              <button type="button" class="btn btn-secondary btn-small" data-edit-anniversary="${DPRO.escape(item.id)}">編集</button>
              <button type="button" class="btn btn-danger btn-small" data-delete-anniversary="${DPRO.escape(item.id)}">削除</button>
            </div>
          </div>
        </article>
      `;
    }).join("");

    DPRO.qsa("[data-order-anniversary]", anniversariesRoot).forEach(button => {
      button.addEventListener("click", () =>
        repeatFromAnniversary(button.dataset.orderAnniversary)
      );
    });

    DPRO.qsa("[data-edit-anniversary]", anniversariesRoot).forEach(button => {
      button.addEventListener("click", () => {
        const item = state.anniversaries.find(
          value => value.id === button.dataset.editAnniversary
        );
        openAnniversaryEditor(item || null);
      });
    });

    DPRO.qsa("[data-delete-anniversary]", anniversariesRoot).forEach(button => {
      button.addEventListener("click", () => deleteAnniversary(button));
    });
  }

  function openAnniversaryEditor(item) {
    if (!state.profile) {
      DPRO.setAlert(
        pageAlert,
        "記念日を登録するには、最初にお花をご注文ください。",
        "warning"
      );
      return;
    }

    state.editingAnniversaryId = item?.id || "";
    DPRO.qs("#anniversaryDialogTitle").textContent =
      item ? "記念日を編集" : "記念日を追加";

    setValue("#anniversaryId", item?.id || "");
    setValue("#anniversaryType", item?.anniversary_type || "birthday");
    setValue("#anniversaryTitle", item?.title || "");
    setValue("#anniversaryDate", item?.anniversary_date || "");
    setValue("#anniversaryRemindDays", item?.remind_days_before ?? 30);
    setValue("#anniversaryBudget", item?.preferred_budget ?? "");
    setValue("#anniversaryColor", item?.preferred_color_mood || "");
    DPRO.qs("#anniversaryRepeatYearly").checked =
      item?.repeat_yearly !== false;
    DPRO.setAlert(anniversaryAlert, "");

    openDialog(anniversaryDialog);
  }

  function closeAnniversaryEditor() {
    closeDialog(anniversaryDialog);
    state.editingAnniversaryId = "";
  }

  async function saveAnniversary(event) {
    event.preventDefault();
    if (!anniversaryForm.reportValidity()) return;

    const id = DPRO.qs("#anniversaryId").value;
    const body = {
      anniversary_type: DPRO.qs("#anniversaryType").value,
      title: DPRO.qs("#anniversaryTitle").value,
      anniversary_date: DPRO.qs("#anniversaryDate").value,
      repeat_yearly: DPRO.qs("#anniversaryRepeatYearly").checked,
      remind_days_before: Number(
        DPRO.qs("#anniversaryRemindDays").value || 0
      ),
      preferred_budget:
        DPRO.qs("#anniversaryBudget").value === ""
          ? null
          : Number(DPRO.qs("#anniversaryBudget").value),
      preferred_color_mood: DPRO.qs("#anniversaryColor").value || null,
      is_active: true,
    };

    const button = DPRO.qs("#saveAnniversaryButton");
    DPRO.setButtonBusy(button, true, "保存中…");
    DPRO.setAlert(anniversaryAlert, "");

    try {
      await memberApi(
        id
          ? `/api/member/anniversaries/${id}`
          : "/api/member/anniversaries",
        {
          method: id ? "PATCH" : "POST",
          body,
        }
      );

      closeAnniversaryEditor();
      await reloadProfileOnly();
      DPRO.setAlert(
        pageAlert,
        id ? "記念日を更新しました。" : "記念日を追加しました。",
        "info"
      );
    } catch (error) {
      DPRO.setAlert(anniversaryAlert, error.message, "error");
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  async function deleteAnniversary(button) {
    const item = state.anniversaries.find(
      value => value.id === button.dataset.deleteAnniversary
    );
    if (!item) return;

    if (!window.confirm(`「${item.title || "記念日"}」を削除しますか？`)) {
      return;
    }

    DPRO.setButtonBusy(button, true, "削除中…");

    try {
      await memberApi(`/api/member/anniversaries/${item.id}`, {
        method: "DELETE",
      });
      await reloadProfileOnly();
      DPRO.setAlert(pageAlert, "記念日を削除しました。", "info");
    } catch (error) {
      DPRO.setAlert(pageAlert, error.message, "error");
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  async function reloadProfileOnly() {
    const profileData = await memberApi("/api/member/profile");
    state.profile = profileData.found ? profileData.customer : null;
    state.addresses = profileData.addresses || [];
    state.anniversaries = profileData.anniversaries || [];

    renderProfile();
    renderStats();
    renderAddresses();
    renderAnniversaries();
  }

  function openCancelDialog(orderNumber) {
    const order = state.orders.find(item => item.order_number === orderNumber);
    if (!order) return;

    DPRO.qs("#cancelOrderNumber").value = orderNumber;
    DPRO.qs("#cancelOrderLabel").textContent =
      `${orderNumber}／${DPRO.dateTime(order.requested_at)}／${DPRO.fulfillmentLabel(order.fulfillment_type)}`;
    DPRO.qs("#cancelReason").value = "";
    DPRO.setAlert(cancelAlert, "");

    openDialog(cancelDialog);
  }

  function closeCancelDialog() {
    closeDialog(cancelDialog);
  }

  async function sendCancelRequest(event) {
    event.preventDefault();
    if (!cancelForm.reportValidity()) return;

    const button = DPRO.qs("#sendCancelRequestButton");
    DPRO.setButtonBusy(button, true, "送信中…");
    DPRO.setAlert(cancelAlert, "");

    try {
      await memberApi("/api/order/cancel-request", {
        method: "POST",
        body: {
          order_number: DPRO.qs("#cancelOrderNumber").value,
          reason: DPRO.qs("#cancelReason").value,
          phone: state.profile?.phone || "",
        },
      });

      closeCancelDialog();
      await load();
      DPRO.setAlert(
        pageAlert,
        "変更・キャンセル相談を店舗へ送りました。店舗からの連絡をお待ちください。",
        "info"
      );
    } catch (error) {
      DPRO.setAlert(cancelAlert, error.message, "error");
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  function daysUntilAnniversary(item) {
    if (!item?.anniversary_date) return Number.MAX_SAFE_INTEGER;

    const [year, month, day] = item.anniversary_date.split("-").map(Number);
    if (!year || !month || !day) return Number.MAX_SAFE_INTEGER;

    const nowText = DPRO.todayJst();
    const [nowYear, nowMonth, nowDay] = nowText.split("-").map(Number);
    const today = Date.UTC(nowYear, nowMonth - 1, nowDay);

    let targetYear = item.repeat_yearly === false ? year : nowYear;
    let target = Date.UTC(targetYear, month - 1, day);

    if (item.repeat_yearly !== false && target < today) {
      targetYear += 1;
      target = Date.UTC(targetYear, month - 1, day);
    }

    return Math.ceil((target - today) / 86_400_000);
  }

  function usageForAnniversary(type) {
    return ({
      birthday: "birthday",
      wedding_anniversary: "wedding_anniversary",
      opening_day: "opening",
      company_anniversary: "anniversary",
      memorial_day: "memorial",
      mother_day: "mother_day",
      respect_for_aged_day: "other",
      custom: "other",
    })[type] || "other";
  }

  function anniversaryLabel(value) {
    return ({
      birthday: "誕生日",
      wedding_anniversary: "結婚記念日",
      opening_day: "開業日",
      company_anniversary: "会社設立・周年",
      memorial_day: "命日・法要",
      mother_day: "母の日",
      respect_for_aged_day: "敬老の日",
      custom: "その他",
    })[value] || value || "記念日";
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

  function firstRelated(value) {
    if (Array.isArray(value)) return value[0] || null;
    return value || null;
  }

  function safeImageUrl(value) {
    const text = String(value || "").trim();
    if (!text) return "";

    try {
      const url = new URL(text, location.href);
      return ["http:", "https:"].includes(url.protocol) ? url.href : "";
    } catch {
      return "";
    }
  }

  function emptyState(icon, title, description, action = "") {
    return `
      <div class="member-empty">
        <div class="member-empty-icon">${DPRO.escape(icon)}</div>
        <strong>${DPRO.escape(title)}</strong>
        ${description ? `<p>${DPRO.escape(description)}</p>` : ""}
        ${action}
      </div>
    `;
  }

  function setText(selector, value) {
    const element = DPRO.qs(selector);
    if (element) element.textContent = String(value);
  }

  function setValue(selector, value) {
    const element = DPRO.qs(selector);
    if (element) element.value = value ?? "";
  }

  function openDialog(dialog) {
    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    document.body.style.overflow = "hidden";
  }

  function closeDialog(dialog) {
    if (typeof dialog.close === "function" && dialog.open) {
      dialog.close();
    } else {
      dialog.removeAttribute("open");
    }
    document.body.style.overflow = "";
  }
});
