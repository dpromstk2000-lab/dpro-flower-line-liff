document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const PAGE_VERSION = "FLOWER-NEXT-7-STAFF-FIELD-20260722";

  const state = {
    authenticated: false,
    activeMode: "production",
    productionTasks: [],
    pickupOrders: [],
    deliveryTasks: [],
    loading: false,
  };

  const lock = DPRO.qs("#adminLock");
  const app = DPRO.qs("#staffApp");
  const codeInput = DPRO.qs("#adminCode");
  const loginAlert = DPRO.qs("#loginAlert");
  const pageAlert = DPRO.qs("#pageAlert");
  const dateInput = DPRO.qs("#taskDate");
  const showCompletedInput = DPRO.qs("#showCompleted");
  const mobileModeNav = DPRO.qs("#mobileModeNav");
  const problemDialog = DPRO.qs("#problemDialog");
  const problemForm = DPRO.qs("#problemForm");

  mountNavigation();
  initializeDate();
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
        <a href="staff.html${demo}" class="active">スタッフ</a>
      `;
    }
    DPRO.qs("#appVersion").textContent = PAGE_VERSION;
  }

  function initializeDate() {
    dateInput.value = DPRO.todayJst();
  }

  function enhanceDateInput() {
    if (dateInput.closest(".staff-date-control")) return;

    const wrapper = document.createElement("div");
    wrapper.className = "staff-date-control";

    const readable = document.createElement("span");
    readable.className = "staff-date-readable";
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
    DPRO.qs("#reloadButton").addEventListener("click", loadAll);

    showCompletedInput.addEventListener("change", renderAll);

    DPRO.qsa("[data-mode-button]").forEach(button => {
      button.addEventListener("click", () => openMode(button.dataset.modeButton));
    });

    DPRO.qs("#closeProblemDialog").addEventListener("click", closeProblemDialog);
    DPRO.qs("#cancelProblemDialog").addEventListener("click", closeProblemDialog);
    problemDialog.addEventListener("cancel", event => {
      event.preventDefault();
      closeProblemDialog();
    });
    problemForm.addEventListener("submit", saveProblemReport);
  }

  async function login() {
    const code = codeInput.value.trim() || DPRO.getAdminCode();
    if (!code) {
      DPRO.setAlert(loginAlert, "管理コードを入力してください。", "error");
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
      mobileModeNav.classList.remove("hidden");
      DPRO.setAlert(loginAlert, "");
      await loadAll();
    } catch (error) {
      DPRO.setAlert(loginAlert, error.message, "error");
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  function logout() {
    state.authenticated = false;
    app.classList.add("hidden");
    lock.classList.remove("hidden");
    mobileModeNav.classList.add("hidden");
    codeInput.value = DPRO.getAdminCode();
    codeInput.focus();
  }

  function clearSavedCode() {
    DPRO.clearAdminCode();
    codeInput.value = "";
    DPRO.setAlert(loginAlert, "保存されている管理コードを削除しました。", "info");
  }

  function openMode(mode) {
    if (!["production", "pickup", "delivery"].includes(mode)) {
      mode = "production";
    }
    state.activeMode = mode;

    DPRO.qsa("[data-mode-panel]").forEach(panel => {
      panel.classList.toggle("active", panel.dataset.modePanel === mode);
    });
    DPRO.qsa("[data-mode-button]").forEach(button => {
      button.classList.toggle("active", button.dataset.modeButton === mode);
    });

    const target = DPRO.qs(`#mode-${mode}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  async function loadAll() {
    if (state.loading) return;
    state.loading = true;

    const button = DPRO.qs("#reloadButton");
    DPRO.setButtonBusy(button, true, "更新中…");
    DPRO.setAlert(pageAlert, "");

    const date = dateInput.value || DPRO.todayJst();
    const encodedDate = encodeURIComponent(date);

    try {
      const [productionData, orderData, deliveryData] = await Promise.all([
        DPRO.api(`/api/admin/production-board?date=${encodedDate}`, {
          admin: true,
        }),
        DPRO.api(
          `/api/admin/orders?from=${encodedDate}&to=${encodedDate}&limit=300`,
          { admin: true }
        ),
        DPRO.api(`/api/admin/delivery-board?date=${encodedDate}`, {
          admin: true,
        }),
      ]);

      state.productionTasks = Array.isArray(productionData.tasks)
        ? productionData.tasks
        : [];
      state.pickupOrders = (orderData.orders || []).filter(order =>
        order.fulfillment_type === "pickup" &&
        !["cancelled"].includes(order.status)
      );
      state.deliveryTasks = Array.isArray(deliveryData.tasks)
        ? deliveryData.tasks
        : [];

      renderAll();
      updateLastUpdated();
    } catch (error) {
      DPRO.setAlert(pageAlert, error.message, "error");
    } finally {
      state.loading = false;
      DPRO.setButtonBusy(button, false);
    }
  }

  function renderAll() {
    renderCounts();
    renderProduction();
    renderPickup();
    renderDelivery();
  }

  function renderCounts() {
    const productionActive = state.productionTasks.filter(task =>
      !["completed", "cancelled"].includes(task.detail_status)
    ).length;
    const pickupActive = state.pickupOrders.filter(order =>
      order.status !== "handed_over"
    ).length;
    const deliveryActive = state.deliveryTasks.filter(task =>
      !["delivered", "cancelled"].includes(task.detail_status)
    ).length;

    setCount("productionCount", productionActive);
    setCount("pickupCount", pickupActive);
    setCount("deliveryCount", deliveryActive);
    setCount("mobileProductionCount", productionActive);
    setCount("mobilePickupCount", pickupActive);
    setCount("mobileDeliveryCount", deliveryActive);
  }

  function setCount(id, value) {
    const element = DPRO.qs(`#${id}`);
    if (element) element.textContent = String(value);
  }

  function updateLastUpdated() {
    const time = new Intl.DateTimeFormat("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date());
    DPRO.qs("#lastUpdatedAt").textContent = `最終更新 ${time}`;
  }

  function visibleProductionTasks() {
    if (showCompletedInput.checked) return state.productionTasks;
    return state.productionTasks.filter(task =>
      !["completed", "cancelled"].includes(task.detail_status)
    );
  }

  function renderProduction() {
    const root = DPRO.qs("#productionTasks");
    const tasks = visibleProductionTasks();

    renderStatusSummary(
      DPRO.qs("#productionStatusSummary"),
      state.productionTasks,
      task => task.detail_status,
      productionStatusLabel
    );

    if (!tasks.length) {
      root.innerHTML = emptyState("💐", "制作タスクはありません");
      return;
    }

    root.innerHTML = tasks.map(task => {
      const order = task.flower_orders || {};
      const item = firstRelated(task.flower_order_items) || {};
      const customer = order.flower_customers || {};
      const photos = (order.flower_photos || []).filter(photo =>
        ["completion_public", "completion_internal"].includes(photo.photo_type)
      );
      const status = task.detail_status || "materials_check";
      const action = productionPrimaryAction(status);
      const completed = ["completed", "cancelled"].includes(status);
      const phone = customer.phone || "";
      const noteParts = [
        item.preferred_flowers || item.flower_preferences
          ? `希望：${item.preferred_flowers || item.flower_preferences}`
          : "",
        item.avoid_flowers ? `避けたい花：${item.avoid_flowers}` : "",
        item.ribbon_text ? `リボン・札：${item.ribbon_text}` : "",
        item.standing_sign_text ? `立札：${item.standing_sign_text}` : "",
      ].filter(Boolean);

      return `
        <article class="staff-task-card ${completed ? "completed" : ""}" data-production-card="${DPRO.escape(task.id)}">
          <header class="staff-task-head">
            <div>
              <div class="staff-task-number">${DPRO.escape(order.order_number || "制作タスク")}</div>
              <div class="staff-task-time">完成期限 ${DPRO.dateTime(
                task.production_due_at ||
                task.end_at ||
                order.production_due_at ||
                order.requested_at
              )}</div>
            </div>
            <span class="staff-task-status ${productionStatusClass(status)}">
              ${DPRO.escape(productionStatusLabel(status))}
            </span>
          </header>

          <div class="staff-task-body staff-production-layout">
            <div>
              <h3 class="staff-task-product">
                ${DPRO.escape(item.product_name_snapshot || "商品")}
                × ${Number(item.quantity || 1)}
              </h3>

              <div class="staff-task-customer">
                <strong>${DPRO.escape(customer.customer_name || "お客様名未登録")}</strong>
                ${phone ? `<a class="staff-phone-link" href="tel:${DPRO.escape(DPRO.normalizePhone(phone))}">☎ ${DPRO.escape(phone)}</a>` : ""}
              </div>

              <div class="staff-task-detail-grid">
                ${taskDetail("用途", DPRO.usageLabel(order.usage_type))}
                ${taskDetail("色・雰囲気", item.color_mood || item.design_style || "おまかせ")}
                ${taskDetail("サイズ", item.size_label || "商品標準")}
                ${taskDetail("受取方法", DPRO.fulfillmentLabel(order.fulfillment_type))}
                ${taskDetail("制作ポイント", task.production_points ?? item.production_points ?? 0)}
                ${taskDetail("優先度", priorityLabel(order.priority || task.priority || "normal"))}
              </div>

              ${order.internal_alert ? `
                <div class="staff-important-note">重要：${DPRO.escape(order.internal_alert)}</div>
              ` : ""}

              ${noteParts.length ? `
                <div class="staff-normal-note">${noteParts.map(DPRO.escape).join("<br>")}</div>
              ` : ""}

              ${order.customer_note ? `
                <div class="staff-normal-note">お客様メモ：${DPRO.escape(order.customer_note)}</div>
              ` : ""}

              <section class="staff-photo-box">
                <h4>完成写真</h4>
                <div class="staff-photo-upload">
                  <div class="field">
                    <label for="production-photo-${DPRO.escape(task.id)}">写真を選択</label>
                    <input
                      id="production-photo-${DPRO.escape(task.id)}"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic"
                      data-production-photo-file="${DPRO.escape(task.id)}"
                    >
                  </div>
                  <button
                    type="button"
                    class="btn btn-secondary"
                    data-production-photo-upload="${DPRO.escape(task.id)}"
                    data-order-id="${DPRO.escape(task.order_id || order.id || "")}"
                    data-order-item-id="${DPRO.escape(task.order_item_id || item.id || "")}"
                  >写真を登録</button>
                </div>
                <label class="staff-photo-visible">
                  <input type="checkbox" checked data-production-photo-visible="${DPRO.escape(task.id)}">
                  <span>お客様のマイページにも公開する</span>
                </label>
                <div class="help">JPEG・PNG・WebP・HEIC、10MB以内</div>
                <div class="hidden" data-production-photo-alert="${DPRO.escape(task.id)}"></div>

                ${photos.length ? `
                  <div class="staff-photo-preview-grid">
                    ${photos.map(photo => photoPreview(photo, "完成したお花")).join("")}
                  </div>
                ` : ""}
              </section>
            </div>

            <aside class="staff-action-panel">
              ${productionProgress(status)}
              ${action ? `
                <button
                  type="button"
                  class="btn btn-primary staff-primary-action"
                  data-production-action="${DPRO.escape(task.id)}"
                  data-target-status="${DPRO.escape(action.status)}"
                  data-version="${Number(task.version_number || 1)}"
                  data-has-photo="${photos.length ? "1" : "0"}"
                >${DPRO.escape(action.label)}</button>
              ` : `
                <div class="notice">${completed ? "この制作タスクは完了しています。" : "次の操作はありません。"}</div>
              `}

              ${!completed ? `
                <div class="staff-secondary-actions">
                  <button
                    type="button"
                    class="btn btn-secondary"
                    data-production-reload="${DPRO.escape(task.id)}"
                  >最新状態を確認</button>
                  <button
                    type="button"
                    class="btn btn-danger"
                    data-problem-type="production"
                    data-problem-task="${DPRO.escape(task.id)}"
                    data-problem-version="${Number(task.version_number || 1)}"
                    data-problem-status="hold"
                  >保留・問題</button>
                </div>
              ` : ""}
            </aside>
          </div>
        </article>
      `;
    }).join("");

    bindProductionActions(root);
    hydratePrivatePhotos(root);
  }

  function bindProductionActions(root) {
    DPRO.qsa("[data-production-action]", root).forEach(button => {
      button.addEventListener("click", () => advanceProduction(button));
    });

    DPRO.qsa("[data-production-reload]", root).forEach(button => {
      button.addEventListener("click", loadAll);
    });

    DPRO.qsa("[data-production-photo-upload]", root).forEach(button => {
      button.addEventListener("click", () => uploadProductionPhoto(button));
    });

    DPRO.qsa('[data-problem-type="production"]', root).forEach(button => {
      button.addEventListener("click", () => openProblemDialog(button));
    });
  }

  async function advanceProduction(button) {
    const taskId = button.dataset.productionAction;
    const targetStatus = button.dataset.targetStatus;
    const hasPhoto = button.dataset.hasPhoto === "1";

    if (
      ["quality_check", "completed"].includes(targetStatus) &&
      !hasPhoto
    ) {
      DPRO.setAlert(
        pageAlert,
        "先に完成写真を1枚以上登録してください。内部用写真でも構いません。",
        "error"
      );
      pageAlert.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const message = productionConfirmMessage(targetStatus);
    if (message && !window.confirm(message)) return;

    DPRO.setButtonBusy(button, true, "更新中…");

    try {
      await DPRO.api(`/api/admin/production/${taskId}/status`, {
        method: "PATCH",
        admin: true,
        body: {
          status: targetStatus,
          version_number: Number(button.dataset.version || 1),
          note: "スタッフ現場画面から更新",
        },
      });
      await loadAll();
      DPRO.setAlert(pageAlert, "制作工程を更新しました。", "info");
    } catch (error) {
      DPRO.setAlert(pageAlert, error.message, "error");
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  async function uploadProductionPhoto(button) {
    const taskId = button.dataset.productionPhotoUpload;
    const fileInput = DPRO.qs(
      `[data-production-photo-file="${cssEscape(taskId)}"]`
    );
    const visibleInput = DPRO.qs(
      `[data-production-photo-visible="${cssEscape(taskId)}"]`
    );
    const alert = DPRO.qs(
      `[data-production-photo-alert="${cssEscape(taskId)}"]`
    );
    const file = fileInput?.files?.[0];

    DPRO.setAlert(alert, "");

    const prepared = validateImageFile(file);
    if (!prepared.ok) {
      DPRO.setAlert(alert, prepared.message, "error");
      return;
    }

    if (!button.dataset.orderId) {
      DPRO.setAlert(alert, "注文情報を取得できません。", "error");
      return;
    }

    DPRO.setButtonBusy(button, true, "登録中…");

    try {
      const base64Data = await readFileBase64(file);
      const visible = visibleInput?.checked !== false;

      await DPRO.api("/api/admin/photos/upload", {
        method: "POST",
        admin: true,
        body: {
          order_id: button.dataset.orderId,
          order_item_id: button.dataset.orderItemId || null,
          photo_type: visible
            ? "completion_public"
            : "completion_internal",
          filename: file.name,
          mime_type: prepared.mimeType,
          base64_data: base64Data,
          is_customer_visible: visible,
        },
      });

      DPRO.setAlert(
        pageAlert,
        visible
          ? "完成写真を登録し、お客様のマイページへ公開しました。"
          : "完成写真を内部用として登録しました。",
        "info"
      );
      await loadAll();
    } catch (error) {
      DPRO.setAlert(alert, error.message, "error");
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  function visiblePickupOrders() {
    if (showCompletedInput.checked) return state.pickupOrders;
    return state.pickupOrders.filter(order => order.status !== "handed_over");
  }

  function renderPickup() {
    const root = DPRO.qs("#pickupTasks");
    const orders = visiblePickupOrders();

    renderStatusSummary(
      DPRO.qs("#pickupStatusSummary"),
      state.pickupOrders,
      order => order.status,
      pickupStatusLabel
    );

    if (!orders.length) {
      root.innerHTML = emptyState("🛍️", "店頭受取はありません");
      return;
    }

    root.innerHTML = orders.map(order => {
      const customer = order.flower_customers || {};
      const action = pickupPrimaryAction(order.status);
      const completed = order.status === "handed_over";
      const phone = customer.phone || "";

      return `
        <article class="staff-task-card staff-pickup-card ${completed ? "completed" : ""}">
          <header class="staff-task-head">
            <div>
              <div class="staff-task-number">${DPRO.escape(order.order_number || "")}</div>
              <div class="staff-task-time">${DPRO.escape(DPRO.usageLabel(order.usage_type))}</div>
            </div>
            <span class="staff-task-status ${completed ? "done" : ""}">
              ${DPRO.escape(pickupStatusLabel(order.status))}
            </span>
          </header>

          <div class="staff-task-body">
            <div class="staff-pickup-time">${DPRO.dateTime(order.requested_at)}</div>

            <div class="staff-task-customer">
              <strong>${DPRO.escape(customer.customer_name || "お客様名未登録")}</strong>
              ${phone ? `<a class="staff-phone-link" href="tel:${DPRO.escape(DPRO.normalizePhone(phone))}">☎ ${DPRO.escape(phone)}</a>` : ""}
            </div>

            <div class="staff-pickup-items">${orderItemsText(order)}</div>

            ${order.customer_note ? `
              <div class="staff-normal-note">お客様メモ：${DPRO.escape(order.customer_note)}</div>
            ` : ""}

            ${order.internal_note ? `
              <div class="staff-important-note">店舗メモ：${DPRO.escape(order.internal_note)}</div>
            ` : ""}

            ${action ? `
              <button
                type="button"
                class="btn btn-primary staff-primary-action"
                data-pickup-order="${DPRO.escape(order.id)}"
                data-pickup-status="${DPRO.escape(action.status)}"
              >${DPRO.escape(action.label)}</button>
            ` : `
              <div class="notice">
                ${completed
                  ? "お客様への引渡しが完了しています。"
                  : "制作完了後に、受取準備完了を登録できます。"}
              </div>
            `}
          </div>
        </article>
      `;
    }).join("");

    DPRO.qsa("[data-pickup-order]", root).forEach(button => {
      button.addEventListener("click", () => updatePickup(button));
    });
  }

  async function updatePickup(button) {
    const targetStatus = button.dataset.pickupStatus;
    const confirmMessage =
      targetStatus === "handed_over"
        ? "商品とお客様を確認しましたか？ 引渡し完了にします。"
        : "商品・メッセージカード・立札を確認し、受取準備完了にします。";

    if (!window.confirm(confirmMessage)) return;

    DPRO.setButtonBusy(button, true, "更新中…");

    try {
      await DPRO.api(`/api/admin/orders/${button.dataset.pickupOrder}/status`, {
        method: "PATCH",
        admin: true,
        body: {
          status: targetStatus,
          updated_by: "staff-next-pickup",
        },
      });
      await loadAll();
      DPRO.setAlert(
        pageAlert,
        targetStatus === "handed_over"
          ? "引渡し完了を登録しました。"
          : "店頭受取の準備完了を登録しました。",
        "info"
      );
    } catch (error) {
      DPRO.setAlert(pageAlert, error.message, "error");
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  function visibleDeliveryTasks() {
    if (showCompletedInput.checked) return state.deliveryTasks;
    return state.deliveryTasks.filter(task =>
      !["delivered", "cancelled"].includes(task.detail_status)
    );
  }

  function renderDelivery() {
    const root = DPRO.qs("#deliveryTasks");
    const tasks = visibleDeliveryTasks();

    renderStatusSummary(
      DPRO.qs("#deliveryStatusSummary"),
      state.deliveryTasks,
      task => task.detail_status,
      deliveryStatusLabel
    );

    if (!tasks.length) {
      root.innerHTML = emptyState("🚚", "配達タスクはありません");
      return;
    }

    root.innerHTML = tasks.map(task => {
      const order = task.flower_orders || {};
      const customer = order.flower_customers || {};
      const recipient = firstRelated(order.flower_order_recipients) || {};
      const status = task.detail_status || "waiting";
      const action = deliveryPrimaryAction(status);
      const completed = ["delivered", "cancelled"].includes(status);
      const photos = (order.flower_photos || []).filter(photo =>
        photo.photo_type === "delivery_proof"
      );
      const phone = recipient.recipient_phone || customer.phone || "";
      const address = [
        recipient.postal_code,
        recipient.prefecture,
        recipient.city,
        recipient.address_line1,
        recipient.address_line2,
      ].filter(Boolean).join(" ");
      const mapUrl = deliveryMapUrl(recipient, address);

      return `
        <article class="staff-task-card ${completed ? "completed" : ""}" data-delivery-card="${DPRO.escape(task.id)}">
          <header class="staff-task-head">
            <div>
              <div class="staff-task-number">${DPRO.escape(order.order_number || "配達タスク")}</div>
              <div class="staff-task-time">
                配達予定 ${DPRO.dateTime(task.scheduled_end_at || order.requested_at)}
              </div>
            </div>
            <span class="staff-task-status ${deliveryStatusClass(status)}">
              ${DPRO.escape(deliveryStatusLabel(status))}
            </span>
          </header>

          <div class="staff-task-body staff-delivery-layout">
            <div>
              <div class="staff-task-customer">
                <span class="staff-delivery-order">
                  <span>配達順</span>
                  <strong>${task.route_order != null ? Number(task.route_order) : "―"}</strong>
                </span>
                <div>
                  <h3 class="staff-task-product">
                    ${DPRO.escape(
                      recipient.recipient_name ||
                      recipient.company_or_facility_name ||
                      customer.customer_name ||
                      "お届け先"
                    )}
                  </h3>
                  <div class="help">
                    ${DPRO.escape(
                      recipient.company_or_facility_name ||
                      recipient.venue_name ||
                      customer.company_name ||
                      ""
                    )}
                  </div>
                </div>
              </div>

              <div class="staff-task-customer">
                ${phone ? `<a class="staff-phone-link" href="tel:${DPRO.escape(DPRO.normalizePhone(phone))}">☎ ${DPRO.escape(phone)}</a>` : ""}
                ${mapUrl ? `<a class="staff-map-link" href="${DPRO.escape(mapUrl)}" target="_blank" rel="noopener">📍 地図を開く</a>` : ""}
              </div>

              <div class="staff-address">${DPRO.escape(address || "配達住所が未登録です。")}</div>

              <div class="staff-task-detail-grid">
                ${taskDetail("商品", deliveryItemsText(order))}
                ${taskDetail("用途", DPRO.usageLabel(order.usage_type))}
                ${taskDetail("車両", task.vehicle_name || task.vehicle_label || "未設定")}
                ${taskDetail("梱包", task.packing_completed_at ? "完了" : "未完了")}
                ${taskDetail("積込", task.loaded_at ? "完了" : "未完了")}
                ${taskDetail("到着前電話", task.arrival_call_completed_at ? "完了" : task.arrival_call_required ? "必要" : "任意")}
              </div>

              ${recipient.delivery_note ? `
                <div class="staff-important-note">配達注意：${DPRO.escape(recipient.delivery_note)}</div>
              ` : ""}

              ${order.internal_alert ? `
                <div class="staff-important-note">重要：${DPRO.escape(order.internal_alert)}</div>
              ` : ""}

              ${task.failure_reason || task.absent_note ? `
                <div class="staff-important-note">前回記録：${DPRO.escape(task.failure_reason || task.absent_note)}</div>
              ` : ""}

              <section class="staff-photo-box">
                <h4>配達完了写真</h4>
                <div class="staff-photo-upload">
                  <div class="field">
                    <label for="delivery-photo-${DPRO.escape(task.id)}">写真を選択</label>
                    <input
                      id="delivery-photo-${DPRO.escape(task.id)}"
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic"
                      data-delivery-photo-file="${DPRO.escape(task.id)}"
                    >
                  </div>
                  <button
                    type="button"
                    class="btn btn-secondary"
                    data-delivery-photo-upload="${DPRO.escape(task.id)}"
                  >写真を登録</button>
                </div>
                <label class="staff-photo-visible">
                  <input type="checkbox" checked data-delivery-photo-visible="${DPRO.escape(task.id)}">
                  <span>お客様のマイページにも公開する</span>
                </label>
                <div class="help">設置場所・商品・受取状況が分かる写真を登録します。</div>
                <div class="hidden" data-delivery-photo-alert="${DPRO.escape(task.id)}"></div>

                ${photos.length ? `
                  <div class="staff-photo-preview-grid">
                    ${photos.map(photo => photoPreview(photo, "配達完了写真")).join("")}
                  </div>
                ` : ""}
              </section>
            </div>

            <aside class="staff-action-panel">
              ${deliveryProgress(status)}

              <label class="staff-photo-visible">
                <input
                  type="checkbox"
                  data-arrival-call="${DPRO.escape(task.id)}"
                  ${task.arrival_call_completed_at ? "checked disabled" : ""}
                >
                <span>${task.arrival_call_completed_at ? "到着前電話済み" : "到着前電話を完了した"}</span>
              </label>

              ${["arrived", "delivered"].includes(status) ? `
                <div class="staff-delivery-completion-fields">
                  <div class="field">
                    <label for="received-by-${DPRO.escape(task.id)}">受取確認者</label>
                    <input
                      id="received-by-${DPRO.escape(task.id)}"
                      data-received-by="${DPRO.escape(task.id)}"
                      value="${DPRO.escape(task.received_by || "")}"
                      placeholder="例：受付 山田様"
                    >
                  </div>
                  <div class="field">
                    <label for="completion-note-${DPRO.escape(task.id)}">完了メモ</label>
                    <textarea
                      id="completion-note-${DPRO.escape(task.id)}"
                      data-completion-note="${DPRO.escape(task.id)}"
                      placeholder="例：正面入口右側へ設置"
                    >${DPRO.escape(task.completion_note || "")}</textarea>
                  </div>
                </div>
              ` : ""}

              ${action ? `
                <button
                  type="button"
                  class="btn btn-primary staff-primary-action"
                  data-delivery-action="${DPRO.escape(task.id)}"
                  data-target-status="${DPRO.escape(action.status)}"
                  data-version="${Number(task.version_number || 1)}"
                  data-has-photo="${photos.length ? "1" : "0"}"
                >${DPRO.escape(action.label)}</button>
              ` : `
                <div class="notice">${completed ? "この配達タスクは完了しています。" : "次の操作はありません。"}</div>
              `}

              ${!completed ? `
                <div class="staff-secondary-actions">
                  ${["departed", "arrived"].includes(status) ? `
                    <button
                      type="button"
                      class="btn btn-secondary"
                      data-problem-type="delivery"
                      data-problem-task="${DPRO.escape(task.id)}"
                      data-problem-version="${Number(task.version_number || 1)}"
                      data-problem-status="absent"
                    >不在</button>
                  ` : ""}
                  <button
                    type="button"
                    class="btn btn-danger"
                    data-problem-type="delivery"
                    data-problem-task="${DPRO.escape(task.id)}"
                    data-problem-version="${Number(task.version_number || 1)}"
                    data-problem-status="${["absent", "failed"].includes(status) ? "returned" : "failed"}"
                  >${["absent", "failed"].includes(status) ? "持ち戻り" : "配達不能・問題"}</button>
                </div>
              ` : ""}
            </aside>
          </div>
        </article>
      `;
    }).join("");

    bindDeliveryActions(root);
    hydratePrivatePhotos(root);
  }

  function bindDeliveryActions(root) {
    DPRO.qsa("[data-delivery-action]", root).forEach(button => {
      button.addEventListener("click", () => advanceDelivery(button));
    });

    DPRO.qsa("[data-delivery-photo-upload]", root).forEach(button => {
      button.addEventListener("click", () => uploadDeliveryPhoto(button));
    });

    DPRO.qsa('[data-problem-type="delivery"]', root).forEach(button => {
      button.addEventListener("click", () => openProblemDialog(button));
    });
  }

  async function advanceDelivery(button) {
    const taskId = button.dataset.deliveryAction;
    const targetStatus = button.dataset.targetStatus;
    const hasPhoto = button.dataset.hasPhoto === "1";

    if (targetStatus === "delivered" && !hasPhoto) {
      DPRO.setAlert(
        pageAlert,
        "先に配達完了写真を1枚以上登録してください。内部用写真でも構いません。",
        "error"
      );
      pageAlert.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    const message = deliveryConfirmMessage(targetStatus);
    if (message && !window.confirm(message)) return;

    const arrivalCall = DPRO.qs(
      `[data-arrival-call="${cssEscape(taskId)}"]`
    );
    const receivedBy = DPRO.qs(
      `[data-received-by="${cssEscape(taskId)}"]`
    );
    const completionNote = DPRO.qs(
      `[data-completion-note="${cssEscape(taskId)}"]`
    );

    DPRO.setButtonBusy(button, true, "更新中…");

    try {
      await DPRO.api(`/api/admin/delivery/${taskId}/status`, {
        method: "PATCH",
        admin: true,
        body: {
          status: targetStatus,
          version_number: Number(button.dataset.version || 1),
          arrival_call_completed: arrivalCall?.checked === true,
          received_by: receivedBy?.value || undefined,
          completion_note: completionNote?.value || undefined,
          note: "スタッフ現場画面から更新",
        },
      });
      await loadAll();
      DPRO.setAlert(pageAlert, "配達工程を更新しました。", "info");
    } catch (error) {
      DPRO.setAlert(pageAlert, error.message, "error");
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  async function uploadDeliveryPhoto(button) {
    const taskId = button.dataset.deliveryPhotoUpload;
    const fileInput = DPRO.qs(
      `[data-delivery-photo-file="${cssEscape(taskId)}"]`
    );
    const visibleInput = DPRO.qs(
      `[data-delivery-photo-visible="${cssEscape(taskId)}"]`
    );
    const alert = DPRO.qs(
      `[data-delivery-photo-alert="${cssEscape(taskId)}"]`
    );
    const file = fileInput?.files?.[0];

    DPRO.setAlert(alert, "");

    const prepared = validateImageFile(file);
    if (!prepared.ok) {
      DPRO.setAlert(alert, prepared.message, "error");
      return;
    }

    DPRO.setButtonBusy(button, true, "登録中…");

    try {
      const base64Data = await readFileBase64(file);
      await DPRO.api(`/api/admin/delivery/${taskId}/proof-photo`, {
        method: "POST",
        admin: true,
        body: {
          filename: file.name,
          mime_type: prepared.mimeType,
          base64_data: base64Data,
          is_customer_visible: visibleInput?.checked !== false,
        },
      });

      DPRO.setAlert(pageAlert, "配達完了写真を登録しました。", "info");
      await loadAll();
    } catch (error) {
      DPRO.setAlert(alert, error.message, "error");
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  function openProblemDialog(button) {
    const type = button.dataset.problemType;
    const targetStatus = button.dataset.problemStatus;

    DPRO.qs("#problemTaskType").value = type;
    DPRO.qs("#problemTaskId").value = button.dataset.problemTask;
    DPRO.qs("#problemTaskVersion").value =
      button.dataset.problemVersion || "1";
    DPRO.qs("#problemTargetStatus").value = targetStatus;
    DPRO.qs("#problemReason").value = "";
    DPRO.setAlert(DPRO.qs("#problemAlert"), "");

    DPRO.qs("#problemDialogTitle").textContent =
      type === "production"
        ? "制作の保留・問題を記録"
        : ({
            absent: "不在を記録",
            failed: "配達不能・問題を記録",
            returned: "持ち戻りを記録",
          })[targetStatus] || "配達の問題を記録";

    if (typeof problemDialog.showModal === "function") {
      problemDialog.showModal();
    } else {
      problemDialog.setAttribute("open", "");
    }
    document.body.style.overflow = "hidden";
    setTimeout(() => DPRO.qs("#problemReason").focus(), 50);
  }

  function closeProblemDialog() {
    if (typeof problemDialog.close === "function" && problemDialog.open) {
      problemDialog.close();
    } else {
      problemDialog.removeAttribute("open");
    }
    document.body.style.overflow = "";
  }

  async function saveProblemReport(event) {
    event.preventDefault();

    const type = DPRO.qs("#problemTaskType").value;
    const taskId = DPRO.qs("#problemTaskId").value;
    const version = Number(DPRO.qs("#problemTaskVersion").value || 1);
    const status = DPRO.qs("#problemTargetStatus").value;
    const reason = DPRO.qs("#problemReason").value.trim();
    const alert = DPRO.qs("#problemAlert");

    if (!reason) {
      DPRO.setAlert(alert, "状況・理由を入力してください。", "error");
      return;
    }

    const button = DPRO.qs("#saveProblemButton");
    DPRO.setButtonBusy(button, true, "記録中…");

    try {
      if (type === "production") {
        await DPRO.api(`/api/admin/production/${taskId}/status`, {
          method: "PATCH",
          admin: true,
          body: {
            status,
            version_number: version,
            hold_reason: reason,
            note: reason,
          },
        });
      } else {
        await DPRO.api(`/api/admin/delivery/${taskId}/status`, {
          method: "PATCH",
          admin: true,
          body: {
            status,
            version_number: version,
            failure_reason: reason,
            note: reason,
          },
        });
      }

      closeProblemDialog();
      await loadAll();
      DPRO.setAlert(pageAlert, "状況を記録しました。", "info");
    } catch (error) {
      DPRO.setAlert(alert, error.message, "error");
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  async function hydratePrivatePhotos(root) {
    const figures = DPRO.qsa("[data-private-photo]", root);

    await Promise.all(figures.map(async figure => {
      try {
        const data = await DPRO.api(
          `/api/admin/photos/signed-url?photo_id=${encodeURIComponent(figure.dataset.privatePhoto)}`,
          { admin: true }
        );

        const mimeType =
          data.photo?.mime_type ||
          figure.dataset.photoMime ||
          "";
        const caption = figure.querySelector("figcaption")?.outerHTML || "";

        figure.innerHTML = mimeType === "image/heic"
          ? `
            <a
              class="btn btn-secondary btn-small"
              href="${DPRO.escape(data.signed_url)}"
              target="_blank"
              rel="noopener"
            >写真を開く</a>
            ${caption}
          `
          : `
            <img
              src="${DPRO.escape(data.signed_url)}"
              alt="${DPRO.escape(figure.dataset.photoAlt || "作業写真")}"
              loading="lazy"
            >
            ${caption}
          `;
      } catch {
        figure.innerHTML =
          `<div class="alert alert-error">写真を表示できません。</div>`;
      }
    }));
  }

  function photoPreview(photo, alt) {
    return `
      <figure
        class="staff-photo-preview"
        data-private-photo="${DPRO.escape(photo.id)}"
        data-photo-mime="${DPRO.escape(photo.mime_type || "")}"
        data-photo-alt="${DPRO.escape(alt)}"
      >
        <div class="loading">読込中…</div>
        <figcaption>
          ${photo.is_customer_visible ? "お客様公開" : "内部のみ"}
        </figcaption>
      </figure>
    `;
  }

  function renderStatusSummary(root, items, statusGetter, labelGetter) {
    const counts = new Map();

    items.forEach(item => {
      const status = statusGetter(item) || "unknown";
      counts.set(status, (counts.get(status) || 0) + 1);
    });

    const visible = [...counts.entries()]
      .filter(([, count]) => count > 0)
      .map(([status, count]) => `
        <span class="staff-status-chip">
          ${DPRO.escape(labelGetter(status))} ${count}件
        </span>
      `)
      .join("");

    root.innerHTML =
      `<span class="staff-status-chip">合計 ${items.length}件</span>${visible}`;
  }

  function productionPrimaryAction(status) {
    return ({
      materials_check: {
        status: "producing",
        label: "花材を確認して制作開始",
      },
      waiting: {
        status: "producing",
        label: "制作を開始する",
      },
      assigned: {
        status: "producing",
        label: "制作を開始する",
      },
      producing: {
        status: "photo_pending",
        label: "制作を終えて写真登録へ",
      },
      photo_pending: {
        status: "quality_check",
        label: "写真を確認して最終確認へ",
      },
      quality_check: {
        status: "completed",
        label: "最終確認済み・制作完了",
      },
      hold: {
        status: "producing",
        label: "制作を再開する",
      },
    })[status] || null;
  }

  function pickupPrimaryAction(status) {
    if (status === "completed") {
      return {
        status: "pickup_waiting",
        label: "商品を確認して受取準備完了",
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

  function deliveryPrimaryAction(status) {
    return ({
      waiting: { status: "packed", label: "梱包完了" },
      assigned: { status: "packed", label: "梱包完了" },
      preparing: { status: "packed", label: "梱包完了" },
      packed: { status: "loaded", label: "車両へ積込完了" },
      loaded: { status: "departed", label: "配達へ出発" },
      departed: { status: "arrived", label: "配達先へ到着" },
      arrived: { status: "delivered", label: "受取確認・配達完了" },
      absent: { status: "preparing", label: "再配達の準備へ戻す" },
      failed: { status: "preparing", label: "再配達の準備へ戻す" },
      returned: { status: "preparing", label: "再配達の準備へ戻す" },
    })[status] || null;
  }

  function productionProgress(status) {
    const steps = [
      ["materials_check", "花材・内容確認"],
      ["producing", "制作"],
      ["photo_pending", "完成写真"],
      ["quality_check", "最終確認"],
      ["completed", "制作完了"],
    ];
    const rank = ({
      materials_check: 0,
      waiting: 0,
      assigned: 0,
      hold: 1,
      producing: 1,
      photo_pending: 2,
      quality_check: 3,
      completed: 5,
      cancelled: 0,
    })[status] ?? 0;

    return `
      <div class="staff-progress">
        ${steps.map(([, label], index) => `
          <div class="staff-progress-row ${rank > index ? "done" : ""}">
            <span class="staff-progress-mark">${rank > index ? "✓" : index + 1}</span>
            <span>${DPRO.escape(label)}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  function deliveryProgress(status) {
    const steps = [
      ["packed", "梱包"],
      ["loaded", "積込"],
      ["departed", "出発"],
      ["arrived", "到着"],
      ["delivered", "完了"],
    ];
    const rank = ({
      waiting: 0,
      assigned: 0,
      preparing: 0,
      packed: 1,
      loaded: 2,
      departed: 3,
      arrived: 4,
      delivered: 5,
      absent: 3,
      failed: 3,
      returned: 0,
      cancelled: 0,
    })[status] ?? 0;

    return `
      <div class="staff-progress">
        ${steps.map(([, label], index) => `
          <div class="staff-progress-row ${rank > index ? "done" : ""}">
            <span class="staff-progress-mark">${rank > index ? "✓" : index + 1}</span>
            <span>${DPRO.escape(label)}</span>
          </div>
        `).join("")}
      </div>
    `;
  }

  function productionConfirmMessage(status) {
    return ({
      producing: "花材・注文内容・注意事項を確認し、制作を開始します。",
      photo_pending: "制作内容を確認し、完成写真の登録工程へ進みます。",
      quality_check: "完成写真と商品を確認し、最終確認へ進みます。",
      completed: "商品・写真・メッセージカード・立札を確認し、制作完了にします。",
    })[status] || "";
  }

  function deliveryConfirmMessage(status) {
    return ({
      packed: "商品・札・カード・配達先を確認し、梱包完了にします。",
      loaded: "商品を車両へ積み込みましたか？",
      departed: "配達先・電話番号・地図を確認し、出発します。",
      arrived: "配達先へ到着しましたか？",
      delivered: "受取人・設置場所・完了写真を確認し、配達完了にします。",
      preparing: "再配達の準備へ戻します。",
    })[status] || "";
  }

  function productionStatusLabel(status) {
    return ({
      materials_check: "花材確認",
      waiting: "制作待ち",
      assigned: "担当決定",
      producing: "制作中",
      photo_pending: "完成写真待ち",
      quality_check: "最終確認",
      completed: "制作完了",
      hold: "保留",
      cancelled: "中止",
    })[status] || status || "未設定";
  }

  function productionStatusClass(status) {
    if (status === "completed") return "done";
    if (status === "hold") return "warning";
    if (status === "cancelled") return "problem";
    return "";
  }

  function pickupStatusLabel(status) {
    return ({
      new: "新規受付",
      reviewing: "内容確認中",
      quoted: "見積提示",
      customer_waiting: "お客様確認待ち",
      confirmed: "注文確定",
      payment_waiting: "入金待ち",
      production_waiting: "制作待ち",
      producing: "制作中",
      completed: "完成",
      pickup_waiting: "店頭受取待ち",
      handed_over: "引渡し完了",
    })[status] || status || "未設定";
  }

  function deliveryStatusLabel(status) {
    return ({
      waiting: "準備待ち",
      assigned: "担当決定",
      preparing: "配達準備",
      packed: "梱包済み",
      loaded: "積込済み",
      departed: "配達中",
      arrived: "到着",
      delivered: "配達完了",
      absent: "不在",
      failed: "配達不能",
      returned: "持ち戻り",
      cancelled: "中止",
    })[status] || status || "未設定";
  }

  function deliveryStatusClass(status) {
    if (status === "delivered") return "done";
    if (["absent", "failed", "returned", "cancelled"].includes(status)) {
      return "problem";
    }
    if (status === "arrived") return "warning";
    return "";
  }

  function priorityLabel(value) {
    return ({
      urgent: "緊急",
      high: "優先",
      normal: "通常",
      low: "低",
    })[value] || value || "通常";
  }

  function taskDetail(label, value) {
    return `
      <div class="staff-task-detail">
        <span>${DPRO.escape(label)}</span>
        <strong>${DPRO.escape(value ?? "―")}</strong>
      </div>
    `;
  }

  function orderItemsText(order) {
    const items = Array.isArray(order.flower_order_items)
      ? order.flower_order_items
      : order.flower_order_items
        ? [order.flower_order_items]
        : [];

    return items.length
      ? items.map(item =>
          `${DPRO.escape(item.product_name_snapshot || "商品")} × ${Number(item.quantity || 1)}`
        ).join("<br>")
      : "商品情報なし";
  }

  function deliveryItemsText(order) {
    const items = Array.isArray(order.flower_order_items)
      ? order.flower_order_items
      : order.flower_order_items
        ? [order.flower_order_items]
        : [];

    return items.length
      ? items.map(item =>
          `${item.product_name_snapshot || "商品"} × ${Number(item.quantity || 1)}`
        ).join("、")
      : "商品情報なし";
  }

  function firstRelated(value) {
    if (Array.isArray(value)) return value[0] || null;
    return value || null;
  }

  function deliveryMapUrl(recipient, address) {
    const explicit = String(recipient.map_url || "").trim();
    if (explicit) {
      try {
        const url = new URL(explicit);
        if (["http:", "https:"].includes(url.protocol)) return url.href;
      } catch {
        // Fall through to generated Google Maps URL.
      }
    }

    if (!address) return "";
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
  }

  function validateImageFile(file) {
    if (!file) {
      return { ok: false, message: "写真を選択してください。" };
    }

    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const inferredMime = ({
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      heic: "image/heic",
    })[extension] || "";
    const mimeType = file.type || inferredMime;

    if (!["image/jpeg", "image/png", "image/webp", "image/heic"].includes(mimeType)) {
      return {
        ok: false,
        message: "JPEG・PNG・WebP・HEICの写真を選択してください。",
      };
    }

    if (file.size > 10 * 1024 * 1024) {
      return { ok: false, message: "写真は10MB以内にしてください。" };
    }

    return { ok: true, mimeType };
  }

  function readFileBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const value = String(reader.result || "");
        const comma = value.indexOf(",");
        if (comma < 0) {
          reject(new Error("写真データを読み取れませんでした。"));
          return;
        }
        resolve(value.slice(comma + 1));
      };
      reader.onerror = () =>
        reject(new Error("写真を読み取れませんでした。"));
      reader.readAsDataURL(file);
    });
  }

  function emptyState(icon, message) {
    return `
      <div class="staff-empty">
        <div class="staff-empty-icon">${DPRO.escape(icon)}</div>
        <strong>${DPRO.escape(message)}</strong>
        <p>表示日を変更するか、「この日の作業を更新」を押してください。</p>
      </div>
    `;
  }

  function formatReadableDate(value) {
    if (!value) return "日付を選択";
    const parts = String(value).split("-").map(Number);
    if (parts.length !== 3 || parts.some(Number.isNaN)) return value;

    const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    const weekday = ["日", "月", "火", "水", "木", "金", "土"][date.getUTCDay()];
    return `${parts[0]}/${String(parts[1]).padStart(2, "0")}/${String(parts[2]).padStart(2, "0")}（${weekday}）`;
  }

  function cssEscape(value) {
    if (window.CSS?.escape) return CSS.escape(String(value));
    return String(value).replace(/["\\]/g, "\\$&");
  }
});
