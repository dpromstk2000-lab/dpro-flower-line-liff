document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const PAGE_VERSION = "FLOWER-NEXT-4-PUBLIC-CATALOG-20260721";
  const state = {
    categories: [],
    products: [],
    selectedCategory: "",
    search: "",
    featuredOnly: false,
    loading: false,
  };

  const elements = {
    pageAlert: DPRO.qs("#pageAlert"),
    resultCount: DPRO.qs("#resultCount"),
    search: DPRO.qs("#catalogSearch"),
    clearSearch: DPRO.qs("#clearSearch"),
    featuredOnly: DPRO.qs("#featuredOnly"),
    categoryChips: DPRO.qs("#categoryChips"),
    featuredSection: DPRO.qs("#featuredSection"),
    featuredProducts: DPRO.qs("#featuredProducts"),
    productGrid: DPRO.qs("#productGrid"),
    emptyState: DPRO.qs("#emptyState"),
    resetFilters: DPRO.qs("#resetFilters"),
    reloadCatalog: DPRO.qs("#reloadCatalog"),
    dialog: DPRO.qs("#productDialog"),
    dialogContent: DPRO.qs("#productDialogContent"),
    closeDialog: DPRO.qs("#closeProductDialog"),
  };

  mountCatalogChrome();
  bindEvents();
  loadCatalog();

  function mountCatalogChrome() {
    const demo = DPRO.isDemo() ? "?demo=1" : "";
    const links = [
      ["catalog.html", "商品カタログ", "catalog"],
      ["index.html", "注文する", "order"],
      ["member.html", "マイページ", "member"],
      [`owner.html${demo}`, "オーナー", "owner"],
      [`staff.html${demo}`, "スタッフ", "staff"],
    ];

    const topnav = DPRO.qs("#topnav");
    if (topnav) {
      topnav.innerHTML = links.map(([href, label, key]) => `
        <a href="${href}" class="${key === "catalog" ? "active" : ""}">
          ${DPRO.escape(label)}
        </a>
      `).join("");
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
    let searchTimer = null;

    elements.search.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.search = elements.search.value.trim().toLowerCase();
        renderAll();
      }, 120);
    });

    elements.clearSearch.addEventListener("click", () => {
      elements.search.value = "";
      state.search = "";
      elements.search.focus();
      renderAll();
    });

    elements.featuredOnly.addEventListener("change", () => {
      state.featuredOnly = elements.featuredOnly.checked;
      renderAll();
    });

    elements.categoryChips.addEventListener("click", event => {
      const button = event.target.closest("[data-category]");
      if (!button) return;
      state.selectedCategory = button.dataset.category || "";
      renderAll();
    });

    elements.productGrid.addEventListener("click", handleGridClick);
    elements.featuredProducts.addEventListener("click", handleGridClick);

    elements.resetFilters.addEventListener("click", resetFilters);
    elements.reloadCatalog.addEventListener("click", loadCatalog);

    elements.closeDialog.addEventListener("click", closeProductDialog);
    elements.dialog.addEventListener("click", event => {
      if (event.target === elements.dialog) closeProductDialog();
    });
    elements.dialog.addEventListener("cancel", event => {
      event.preventDefault();
      closeProductDialog();
    });

    elements.dialogContent.addEventListener("click", event => {
      const closeButton = event.target.closest("[data-close-detail]");
      if (closeButton) {
        closeProductDialog();
        return;
      }

      const thumb = event.target.closest("[data-gallery-url]");
      if (!thumb) return;
      const main = DPRO.qs("#dialogMainPhoto", elements.dialogContent);
      if (!main || !("src" in main)) return;
      main.src = thumb.dataset.galleryUrl;
      main.alt = thumb.dataset.galleryAlt || "商品写真";
      DPRO.qsa("[data-gallery-url]", elements.dialogContent)
        .forEach(button => button.classList.toggle("active", button === thumb));
    });

    window.addEventListener("popstate", openProductFromUrl);
  }

  async function loadCatalog() {
    if (state.loading) return;
    state.loading = true;
    DPRO.setButtonBusy(elements.reloadCatalog, true, "更新中…");
    DPRO.setAlert(elements.pageAlert, "");
    elements.resultCount.textContent = "読み込み中…";

    try {
      const [categoryData, productData] = await Promise.all([
        DPRO.api("/api/public/catalog/categories"),
        DPRO.api("/api/public/catalog?limit=500"),
      ]);

      state.categories = Array.isArray(categoryData.categories)
        ? categoryData.categories
        : [];
      state.products = Array.isArray(productData.products)
        ? productData.products
        : [];

      renderAll();
      await openProductFromUrl();
    } catch (error) {
      DPRO.setAlert(
        elements.pageAlert,
        `商品カタログを読み込めませんでした。${error.message}`,
        "error",
      );
      elements.productGrid.innerHTML = `
        <article class="card catalog-empty">
          <div class="catalog-empty-icon">🌿</div>
          <h3>商品情報を表示できません</h3>
          <p>時間をおいて、もう一度「最新情報に更新」を押してください。</p>
        </article>
      `;
      elements.resultCount.textContent = "読込エラー";
    } finally {
      state.loading = false;
      DPRO.setButtonBusy(elements.reloadCatalog, false);
    }
  }

  function renderAll() {
    renderCategories();

    const filtered = filteredProducts();
    const featured = filtered.filter(product => product.is_featured === true);

    elements.resultCount.textContent = `${filtered.length}商品`;
    elements.emptyState.classList.toggle("hidden", filtered.length > 0);
    elements.productGrid.classList.toggle("hidden", filtered.length === 0);
    elements.productGrid.innerHTML = filtered.map(productCard).join("");

    const showFeatured =
      featured.length > 0 &&
      !state.featuredOnly &&
      !state.search &&
      !state.selectedCategory;
    elements.featuredSection.classList.toggle("hidden", !showFeatured);
    elements.featuredProducts.innerHTML = showFeatured
      ? featured.slice(0, 6).map(productCard).join("")
      : "";

    hydrateImageFallbacks(elements.productGrid);
    hydrateImageFallbacks(elements.featuredProducts);
  }

  function renderCategories() {
    const counts = new Map();
    state.products.forEach(product => {
      const code = product.flower_product_categories?.category_code || "";
      if (code) counts.set(code, (counts.get(code) || 0) + 1);
    });

    const allChip = categoryChip("", "すべて", state.products.length, "🌷");
    const categoryChips = state.categories.map(category => {
      const count = counts.get(category.category_code) || 0;
      return categoryChip(
        category.category_code,
        category.category_name,
        count,
        category.icon_name || "✿",
      );
    }).join("");

    elements.categoryChips.innerHTML = allChip + categoryChips;
  }

  function categoryChip(code, name, count, icon) {
    const active = state.selectedCategory === code;
    return `
      <button
        type="button"
        class="catalog-category-chip ${active ? "active" : ""}"
        data-category="${DPRO.escape(code)}"
        aria-pressed="${active}"
      >
        ${DPRO.escape(icon)} ${DPRO.escape(name)}
        <span class="catalog-chip-count">${Number(count || 0)}</span>
      </button>
    `;
  }

  function filteredProducts() {
    return state.products.filter(product => {
      const categoryCode =
        product.flower_product_categories?.category_code || "";

      if (
        state.selectedCategory &&
        categoryCode !== state.selectedCategory
      ) {
        return false;
      }

      if (state.featuredOnly && product.is_featured !== true) {
        return false;
      }

      if (state.search) {
        const haystack = [
          product.product_name,
          product.short_description,
          product.detail_description,
          product.description,
          product.seasonal_label,
          product.flower_product_categories?.category_name,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        if (!haystack.includes(state.search)) return false;
      }

      return true;
    });
  }

  function productCard(product) {
    const photoUrl = safeImageUrl(product.main_photo_url);
    const category =
      product.flower_product_categories?.category_name || "お花";
    const description =
      product.short_description ||
      product.description ||
      product.detail_description ||
      "用途やご予算に合わせてお作りします。";
    const orderable = product.orderable !== false && product.is_sold_out !== true;
    const slug = product.public_slug || "";
    const orderHref = buildOrderHref(product);
    const meta = productMeta(product);

    return `
      <article class="card catalog-product-card">
        <div class="catalog-product-photo-wrap">
          ${photoUrl ? `
            <img
              class="catalog-product-photo"
              src="${DPRO.escape(photoUrl)}"
              alt="${DPRO.escape(product.product_name || "お花の商品")}"
              loading="lazy"
              data-catalog-image
            >
          ` : photoPlaceholder()}
          <div class="catalog-product-badges">
            ${product.is_featured ? `
              <span class="catalog-product-badge recommended">おすすめ</span>
            ` : ""}
            ${product.seasonal_label ? `
              <span class="catalog-product-badge">${DPRO.escape(product.seasonal_label)}</span>
            ` : ""}
            ${!orderable ? `
              <span class="catalog-product-badge soldout">売り切れ</span>
            ` : ""}
          </div>
          ${!orderable ? `<div class="catalog-soldout-cover">SOLD OUT</div>` : ""}
        </div>

        <div class="catalog-product-body">
          <div class="catalog-product-category">${DPRO.escape(category)}</div>
          <h3 class="catalog-product-name">${DPRO.escape(product.product_name || "商品")}</h3>
          <p class="catalog-product-description">${DPRO.escape(description)}</p>

          <div class="catalog-product-meta">
            ${meta.map(value => `
              <span class="catalog-meta-tag">${DPRO.escape(value)}</span>
            `).join("")}
          </div>

          <div class="catalog-product-price-row">
            <div class="catalog-product-price">${DPRO.escape(priceLabel(product))}</div>
            <div class="catalog-product-size">${DPRO.escape(product.size_label || "")}</div>
          </div>

          <div class="catalog-product-actions">
            <button
              type="button"
              class="btn btn-secondary btn-small"
              data-detail-slug="${DPRO.escape(slug)}"
              data-detail-id="${DPRO.escape(product.id || "")}"
            >詳しく見る</button>
            ${orderable ? `
              <a class="btn btn-primary btn-small" href="${DPRO.escape(orderHref)}">
                ${product.product_type === "consultation" ? "相談する" : "この商品を注文"}
              </a>
            ` : `
              <button class="btn btn-primary btn-small" type="button" disabled>
                現在受付できません
              </button>
            `}
          </div>
        </div>
      </article>
    `;
  }

  function handleGridClick(event) {
    const detailButton = event.target.closest("[data-detail-slug]");
    if (!detailButton) return;

    const slug = detailButton.dataset.detailSlug;
    const id = detailButton.dataset.detailId;
    const local = state.products.find(product =>
      (slug && product.public_slug === slug) ||
      (!slug && product.id === id)
    );

    if (slug) {
      const url = new URL(location.href);
      url.searchParams.set("product", slug);
      history.pushState({ product: slug }, "", url);
    }

    openProductDialog(local, slug);
  }

  async function openProductFromUrl() {
    const slug = new URLSearchParams(location.search).get("product");
    if (!slug) {
      if (elements.dialog.open) closeDialogOnly();
      return;
    }

    const local = state.products.find(product => product.public_slug === slug);
    await openProductDialog(local, slug);
  }

  async function openProductDialog(localProduct, slug) {
    let product = localProduct || null;

    showDialog();
    elements.dialogContent.innerHTML = `<div class="catalog-dialog-info"><div class="loading">商品情報を読み込んでいます…</div></div>`;

    if (slug) {
      try {
        const data = await DPRO.api(
          `/api/public/catalog/products/${encodeURIComponent(slug)}`
        );
        if (data.product) product = data.product;
      } catch (error) {
        if (!product) {
          elements.dialogContent.innerHTML = `
            <div class="catalog-dialog-info">
              <div class="alert alert-error">${DPRO.escape(error.message)}</div>
            </div>
          `;
          return;
        }
      }
    }

    if (!product) {
      elements.dialogContent.innerHTML = `
        <div class="catalog-dialog-info">
          <div class="alert alert-error">商品情報を取得できませんでした。</div>
        </div>
      `;
      return;
    }

    elements.dialogContent.innerHTML = productDetail(product);
    hydrateImageFallbacks(elements.dialogContent);
  }

  function productDetail(product) {
    const photos = productPhotos(product);
    const mainPhoto = safeImageUrl(photos[0]?.public_url || product.main_photo_url);
    const description =
      product.detail_description ||
      product.description ||
      product.short_description ||
      "用途やご予算に合わせてお作りします。";
    const orderable = product.orderable !== false && product.is_sold_out !== true;
    const category =
      product.flower_product_categories?.category_name || "お花";
    const options = Array.isArray(product.flower_product_options)
      ? product.flower_product_options
      : [];

    return `
      <div class="catalog-dialog-grid">
        <div class="catalog-dialog-gallery">
          ${mainPhoto ? `
            <img
              id="dialogMainPhoto"
              class="catalog-dialog-main-photo"
              src="${DPRO.escape(mainPhoto)}"
              alt="${DPRO.escape(product.product_name || "商品写真")}"
              data-catalog-image
            >
          ` : `
            <div id="dialogMainPhoto" class="catalog-dialog-main-photo">
              ${photoPlaceholder()}
            </div>
          `}

          ${photos.length > 1 ? `
            <div class="catalog-dialog-thumbs">
              ${photos.map((photo, index) => {
                const url = safeImageUrl(photo.public_url);
                if (!url) return "";
                return `
                  <button
                    type="button"
                    class="catalog-dialog-thumb ${index === 0 ? "active" : ""}"
                    data-gallery-url="${DPRO.escape(url)}"
                    data-gallery-alt="${DPRO.escape(photo.alt_text || product.product_name || "商品写真")}"
                    aria-label="${index + 1}枚目の写真を表示"
                  >
                    <img src="${DPRO.escape(url)}" alt="" loading="lazy" data-catalog-image>
                  </button>
                `;
              }).join("")}
            </div>
          ` : ""}
        </div>

        <div class="catalog-dialog-info">
          <div class="catalog-product-category">${DPRO.escape(category)}</div>
          <h2 id="dialogProductName">${DPRO.escape(product.product_name || "商品")}</h2>

          <div class="catalog-product-meta">
            ${productMeta(product).map(value => `
              <span class="catalog-meta-tag">${DPRO.escape(value)}</span>
            `).join("")}
            ${product.is_featured ? `<span class="catalog-meta-tag">おすすめ</span>` : ""}
            ${product.seasonal_label ? `<span class="catalog-meta-tag">${DPRO.escape(product.seasonal_label)}</span>` : ""}
          </div>

          <div class="catalog-dialog-price">${DPRO.escape(priceLabel(product))}</div>
          <p class="catalog-dialog-description">${DPRO.escape(description)}</p>

          <div class="catalog-detail-list">
            ${detailRow("サイズ目安", product.size_label)}
            ${detailRow("制作目安", leadTimeLabel(product))}
            ${detailRow("店頭受取", product.pickup_enabled === false ? "不可" : "対応")}
            ${detailRow("店舗配達", product.delivery_enabled === false ? "不可" : "対応")}
            ${detailRow("商品タイプ", productTypeLabel(product.product_type))}
          </div>

          ${options.length ? `
            <h3>選べるオプション</h3>
            <div class="catalog-option-list">
              ${options.map(option => `
                <div class="catalog-option-item">
                  <strong>${DPRO.escape(option.option_name || "オプション")}</strong>
                  ${Number(option.price_adjustment || 0)
                    ? `　${Number(option.price_adjustment) > 0 ? "+" : ""}${DPRO.yen(option.price_adjustment)}`
                    : ""}
                  ${option.is_required ? "　必須" : ""}
                </div>
              `).join("")}
            </div>
          ` : ""}

          ${!orderable ? `
            <div class="alert alert-warning">この商品は現在、注文受付を停止しています。</div>
          ` : ""}

          <div class="catalog-dialog-actions">
            <button type="button" class="btn btn-secondary" data-close-detail>一覧へ戻る</button>
            ${orderable ? `
              <a class="btn btn-primary" href="${DPRO.escape(buildOrderHref(product))}">
                ${product.product_type === "consultation" ? "この内容を相談する" : "この商品を注文する"}
              </a>
            ` : `
              <button type="button" class="btn btn-primary" disabled>現在受付できません</button>
            `}
          </div>
        </div>
      </div>
    `;
  }

  function productPhotos(product) {
    const photos = Array.isArray(product.flower_product_photos)
      ? product.flower_product_photos
      : [];
    return photos.filter(photo => safeImageUrl(photo.public_url));
  }

  function detailRow(label, value) {
    if (!value) return "";
    return `
      <div class="catalog-detail-row">
        <span>${DPRO.escape(label)}</span>
        <strong>${DPRO.escape(value)}</strong>
      </div>
    `;
  }

  function productMeta(product) {
    const values = [];
    if (product.pickup_enabled !== false) values.push("店頭受取");
    if (product.delivery_enabled !== false) values.push("店舗配達");
    if (product.consultation_enabled === true || product.product_type === "consultation") {
      values.push("相談可");
    }
    const lead = leadTimeLabel(product);
    if (lead) values.push(lead);
    return [...new Set(values)].slice(0, 4);
  }

  function leadTimeLabel(product) {
    const days = Number(product.lead_time_days || 0);
    const minutes = Number(
      product.lead_time_minutes ||
      product.lead_minutes ||
      0
    );

    if (days > 0) return `${days}日前まで`;
    if (minutes >= 1440) return `${Math.ceil(minutes / 1440)}日前まで`;
    if (minutes > 0) return `${Math.ceil(minutes / 60)}時間前まで`;
    return "";
  }

  function productTypeLabel(value) {
    return ({
      ready_stock: "完成品在庫",
      made_to_order: "受注制作",
      limited_stock: "数量限定",
      seasonal_reservation: "期間限定予約",
      consultation: "相談商品",
    })[value] || "受注制作";
  }

  function priceLabel(product) {
    const type = String(product.price_display_type || "").toLowerCase();
    const minimum = Number(product.minimum_price || 0);
    const standard = Number(product.default_price || minimum || 0);
    const amount = standard || minimum;

    if (
      product.product_type === "consultation" ||
      product.requires_quote === true ||
      ["consultation", "quote", "ask"].includes(type)
    ) {
      return "価格はご相談";
    }

    if (!amount) return "価格はご相談";

    if (
      ["from", "minimum", "starting_from"].includes(type) ||
      minimum > 0 && standard > minimum
    ) {
      return `${DPRO.yen(minimum || amount)}〜`;
    }

    return DPRO.yen(amount);
  }

  function buildOrderHref(product) {
    const params = new URLSearchParams();
    if (product.id) params.set("product_id", product.id);
    if (product.public_slug) params.set("product", product.public_slug);
    if (product.product_type === "consultation") params.set("mode", "custom");
    return `index.html?${params.toString()}#orderForm`;
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

  function photoPlaceholder() {
    return `
      <div class="catalog-photo-placeholder">
        <div>
          <span>💐</span>
          <small>商品写真を準備中です</small>
        </div>
      </div>
    `;
  }

  function hydrateImageFallbacks(root) {
    DPRO.qsa("[data-catalog-image]", root).forEach(image => {
      image.addEventListener("error", () => {
        const wrap = image.closest(".catalog-product-photo-wrap") ||
          image.closest(".catalog-dialog-gallery");
        if (!wrap) return;
        if (image.id === "dialogMainPhoto") {
          image.outerHTML = `<div id="dialogMainPhoto" class="catalog-dialog-main-photo">${photoPlaceholder()}</div>`;
        } else if (image.closest(".catalog-dialog-thumb")) {
          image.closest(".catalog-dialog-thumb").remove();
        } else {
          image.outerHTML = photoPlaceholder();
        }
      }, { once: true });
    });
  }

  function showDialog() {
    if (typeof elements.dialog.showModal === "function") {
      if (!elements.dialog.open) elements.dialog.showModal();
    } else {
      elements.dialog.setAttribute("open", "");
    }
    document.body.style.overflow = "hidden";
  }

  function closeDialogOnly() {
    if (typeof elements.dialog.close === "function" && elements.dialog.open) {
      elements.dialog.close();
    } else {
      elements.dialog.removeAttribute("open");
    }
    document.body.style.overflow = "";
  }

  function closeProductDialog() {
    closeDialogOnly();
    const url = new URL(location.href);
    if (url.searchParams.has("product")) {
      url.searchParams.delete("product");
      history.pushState({}, "", url);
    }
  }

  function resetFilters() {
    state.selectedCategory = "";
    state.search = "";
    state.featuredOnly = false;
    elements.search.value = "";
    elements.featuredOnly.checked = false;
    renderAll();
  }
});
