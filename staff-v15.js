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
      const photos = (order.flower_photos || [])
        .filter(photo =>
          ["completion_public", "completion_internal"].includes(
            photo.photo_type
          )
        );

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

          <div class="photo-uploader">
            <div class="photo-uploader-title">完成写真</div>
            <div class="photo-upload-row">
              <div class="field">
                <label for="photo-${task.id}">写真を選択</label>
                <input
                  id="photo-${task.id}"
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic"
                  data-photo-file="${task.id}"
                >
              </div>
              <button
                class="btn btn-secondary"
                data-photo-upload="${task.id}"
                data-order-id="${DPRO.escape(task.order_id || order.id || "")}"
                data-order-item-id="${DPRO.escape(task.order_item_id || item.id || "")}"
              >写真を登録</button>
            </div>

            <label class="photo-visibility">
              <input
                type="checkbox"
                checked
                data-photo-visible="${task.id}"
              >
              お客様のマイページへ公開する
            </label>
            <div class="help">JPEG・PNG・WebP・HEIC、10MB以内</div>
            <div
              class="hidden"
              data-photo-alert="${task.id}"
            ></div>

            ${photos.length ? `
              <div class="photo-preview-grid">
                ${photos.map(photo => `
                  <figure
                    class="photo-preview"
                    data-admin-photo="${DPRO.escape(photo.id)}"
                    data-photo-mime="${DPRO.escape(photo.mime_type || "")}"
                  >
                    <div class="loading">写真を読み込んでいます…</div>
                    <figcaption>
                      ${photo.is_customer_visible ? "お客様公開" : "内部のみ"}
                    </figcaption>
                  </figure>
                `).join("")}
              </div>
            ` : ""}
          </div>

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
        if (
          button.dataset.status === "completed" &&
          !button.closest(".order-card")?.querySelector("[data-admin-photo]")
        ) {
          const proceed = window.confirm(
            "完成写真がまだ登録されていません。写真なしで制作完了にしますか？"
          );
          if (!proceed) return;
        }

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

    DPRO.qsa("[data-photo-upload]", root).forEach(button => {
      button.addEventListener("click", () => uploadCompletionPhoto(button));
    });

    hydrateAdminPhotos(root);
  }

  async function uploadCompletionPhoto(button) {
    const taskId = button.dataset.photoUpload;
    const fileInput = DPRO.qs(`[data-photo-file="${taskId}"]`);
    const visibleInput = DPRO.qs(`[data-photo-visible="${taskId}"]`);
    const alert = DPRO.qs(`[data-photo-alert="${taskId}"]`);
    const file = fileInput?.files?.[0];

    DPRO.setAlert(alert, "");

    if (!file) {
      DPRO.setAlert(alert, "完成写真を選択してください。", "error");
      return;
    }

    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const inferredMime = ({
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      webp: "image/webp",
      heic: "image/heic"
    })[extension] || "";
    const mimeType = file.type || inferredMime;

    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/heic"
    ];
    if (!allowed.includes(mimeType)) {
      DPRO.setAlert(
        alert,
        "JPEG・PNG・WebP・HEICの写真を選択してください。",
        "error"
      );
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      DPRO.setAlert(alert, "写真は10MB以内にしてください。", "error");
      return;
    }
    if (!button.dataset.orderId) {
      DPRO.setAlert(alert, "注文情報を取得できません。", "error");
      return;
    }

    DPRO.setButtonBusy(button, true, "登録中");
    try {
      const base64Data = await readFileBase64(file);
      const isVisible = visibleInput?.checked !== false;

      await DPRO.api("/api/admin/photos/upload", {
        method: "POST",
        admin: true,
        body: {
          order_id: button.dataset.orderId,
          order_item_id: button.dataset.orderItemId || null,
          photo_type: isVisible
            ? "completion_public"
            : "completion_internal",
          filename: file.name,
          mime_type: mimeType,
          base64_data: base64Data,
          is_customer_visible: isVisible
        }
      });

      DPRO.setAlert(
        DPRO.qs("#alert"),
        isVisible
          ? "完成写真を登録し、お客様のマイページへ公開しました。"
          : "完成写真を内部用として登録しました。",
        "info"
      );
      await load();
    } catch (error) {
      DPRO.setAlert(alert, error.message, "error");
    } finally {
      DPRO.setButtonBusy(button, false);
    }
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

  async function hydrateAdminPhotos(root) {
    const figures = DPRO.qsa("[data-admin-photo]", root);
    await Promise.all(figures.map(async figure => {
      try {
        const params = new URLSearchParams({
          photo_id: figure.dataset.adminPhoto
        });
        const data = await DPRO.api(
          `/api/admin/photos/signed-url?${params}`,
          { admin: true }
        );

        const mime = data.photo?.mime_type || figure.dataset.photoMime || "";
        const caption = figure.querySelector("figcaption")?.outerHTML || "";

        figure.innerHTML = mime === "image/heic"
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
              alt="完成したお花の写真"
              loading="lazy"
            >
            ${caption}
          `;
      } catch (error) {
        figure.innerHTML = `
          <div class="alert alert-error">
            写真を表示できません。
          </div>
        `;
      }
    }));
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
