document.addEventListener("DOMContentLoaded", () => {
  "use strict";

  const PAGE_VERSION = "FLOWER-NEXT-10-SYSTEM-CHECK-20260722";

  const state = {
    report: {
      version: PAGE_VERSION,
      generated_at: null,
      read_only: null,
      integration: null,
    },
    readRows: [],
    integrationRows: [],
  };

  const codeInput = DPRO.qs("#adminCode");
  const alertRoot = DPRO.qs("#alert");
  const jsonRoot = DPRO.qs("#jsonResult");

  mountNavigation();
  bindEvents();

  codeInput.value = DPRO.getAdminCode();
  DPRO.qs("#appVersion").textContent = PAGE_VERSION;

  if (DPRO.isDemo()) {
    window.setTimeout(() => runReadOnlyCheck(), 150);
  }

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
        <a href="owner.html${demo}"><span>🖥️</span>管理</a>
        <a href="staff.html${demo}"><span>🧺</span>作業</a>
        <a href="catalog.html"><span>🌷</span>カタログ</a>
        <a href="system-check.html${demo}" class="active"><span>⚙️</span>検査</a>
      `;
    }
  }

  function bindEvents() {
    DPRO.qs("#runCheck").addEventListener("click", runReadOnlyCheck);
    DPRO.qs("#runIntegration").addEventListener("click", runIntegrationTest);
    DPRO.qs("#prepareDemo").addEventListener("click", prepareDemo);
    DPRO.qs("#clearCode").addEventListener("click", clearSavedCode);
    DPRO.qs("#copyJson").addEventListener("click", copyJson);
    DPRO.qs("#downloadJson").addEventListener("click", downloadJson);

    codeInput.addEventListener("keydown", event => {
      if (event.key === "Enter") runReadOnlyCheck();
    });
  }

  async function runReadOnlyCheck() {
    const button = DPRO.qs("#runCheck");
    const startedAt = performance.now();
    const adminCode = currentAdminCode();

    DPRO.setAlert(alertRoot, "");
    DPRO.setButtonBusy(button, true, "総合検査中…");
    setOverall("running", "検査を実行しています", "API・DB・各画面を順番に確認しています。");
    setGroupBadge("platformBadge", "running", "検査中");
    setGroupBadge("dataBadge", "running", "検査中");
    setGroupBadge("apiBadge", "running", "検査中");
    setGroupBadge("pageBadge", "running", "検査中");

    const report = {
      version: PAGE_VERSION,
      started_at: new Date().toISOString(),
      health: null,
      admin_system_check: null,
      api_probes: [],
      page_probes: [],
      error: null,
    };

    try {
      const [healthResult, adminResult] = await Promise.all([
        rawApi("/health"),
        rawApi("/api/admin/system-check", {
          admin: true,
          adminCode,
        }),
      ]);

      report.health = healthResult.data;
      report.health_http = healthResult.status;
      report.admin_system_check = adminResult.data;
      report.admin_http = adminResult.status;

      const [apiRows, pageRows] = await Promise.all([
        runApiProbes(adminCode),
        runPageProbes(),
      ]);

      report.api_probes = apiRows;
      report.page_probes = pageRows;

      renderReadOnly(report);
      DPRO.setAlert(
        alertRoot,
        collectAllReadRows(report).every(row => row.ok !== false)
          ? "読取専用の総合検査が完了しました。"
          : "一部の検査で問題が見つかりました。NG項目を確認してください。",
        collectAllReadRows(report).every(row => row.ok !== false)
          ? "info"
          : "warning"
      );
    } catch (error) {
      report.error = serializeError(error);
      renderFatalReadError(error);
      DPRO.setAlert(alertRoot, error.message, "error");
    } finally {
      report.completed_at = new Date().toISOString();
      report.elapsed_ms = Math.round(performance.now() - startedAt);
      state.report.read_only = report;
      state.report.generated_at = new Date().toISOString();
      updateJson();
      DPRO.qs("#elapsedTime").textContent = `${report.elapsed_ms} ms`;
      DPRO.qs("#lastCheckedAt").textContent = formatClock(new Date());
      DPRO.setButtonBusy(button, false);
      updateOverallFromRows();
    }
  }

  async function runApiProbes(adminCode) {
    const today = DPRO.todayJst();
    const tomorrow = DPRO.addDaysJst(1);
    const rows = [];

    const probe = async (key, label, fn, detailFn = null) => {
      const startedAt = performance.now();
      try {
        const data = await fn();
        const detail = detailFn ? detailFn(data) : "正常に応答しました";
        rows.push({
          key,
          label,
          ok: true,
          detail,
          elapsed_ms: Math.round(performance.now() - startedAt),
        });
      } catch (error) {
        rows.push({
          key,
          label,
          ok: false,
          detail: error.message,
          error: serializeError(error),
          elapsed_ms: Math.round(performance.now() - startedAt),
        });
      }
    };

    await Promise.all([
      probe(
        "public_catalog",
        "公開商品カタログAPI",
        () => DPRO.api("/api/public/catalog?limit=5"),
        data => `商品 ${Number(data.products?.length || 0)}件を取得`
      ),
      probe(
        "public_delivery_areas",
        "配達エリアAPI",
        () => DPRO.api("/api/public/delivery-areas"),
        data => `有効エリア ${Number(data.delivery_areas?.length || 0)}件`
      ),
      probe(
        "public_time_slots",
        "30分空き枠API",
        () => DPRO.api(
          `/api/public/time-slots?date=${encodeURIComponent(tomorrow)}&fulfillment_type=pickup`
        ),
        data => `選択可能 ${Number((data.slots || []).filter(slot => slot.available).length)}枠`
      ),
      probe(
        "admin_login",
        "管理コード認証API",
        () => DPRO.api("/api/admin/login", {
          method: "POST",
          admin: true,
          adminCode,
        }),
        data => data.authenticated === true ? "認証成功" : "認証応答を確認"
      ),
      probe(
        "admin_dashboard",
        "オーナーダッシュボードAPI",
        () => DPRO.api(`/api/admin/dashboard?date=${encodeURIComponent(today)}`, {
          admin: true,
          adminCode,
        }),
        data => `本日の注文 ${Number(data.today_orders?.length || 0)}件`
      ),
      probe(
        "admin_products",
        "商品管理API",
        () => DPRO.api("/api/admin/products?limit=5", {
          admin: true,
          adminCode,
        }),
        data => `商品 ${Number(data.products?.length || 0)}件を取得`
      ),
      probe(
        "admin_categories",
        "カテゴリ管理API",
        () => DPRO.api("/api/admin/categories", {
          admin: true,
          adminCode,
        }),
        data => `カテゴリ ${Number(data.categories?.length || 0)}件`
      ),
      probe(
        "production_board",
        "制作ボードAPI",
        () => DPRO.api(
          `/api/admin/production-board?date=${encodeURIComponent(today)}`,
          { admin: true, adminCode }
        ),
        data => `制作タスク ${Number(data.tasks?.length || 0)}件`
      ),
      probe(
        "delivery_board",
        "配達ボードAPI",
        () => DPRO.api(
          `/api/admin/delivery-board?date=${encodeURIComponent(today)}`,
          { admin: true, adminCode }
        ),
        data => `配達タスク ${Number(data.tasks?.length || 0)}件`
      ),
      probe(
        "production_capacity",
        "制作受付上限API",
        () => DPRO.api("/api/admin/production-capacity", {
          admin: true,
          adminCode,
        }),
        data => `通常 ${Number(data.rules?.length || 0)}件・特別 ${Number(data.overrides?.length || 0)}件`
      ),
    ]);

    if (DPRO.isDemo()) {
      const lineUserId =
        new URLSearchParams(location.search).get("line_user_id") ||
        "U_DEMO_FLOWER_001";

      await Promise.all([
        probe(
          "member_profile",
          "会員プロフィールAPI",
          () => DPRO.api(
            `/api/member/profile?line_user_id=${encodeURIComponent(lineUserId)}`
          ),
          data => data.found
            ? `会員 ${data.customer?.customer_number || "登録済み"}`
            : "API応答正常・該当会員なし"
        ),
        probe(
          "member_orders",
          "会員注文・写真API",
          () => DPRO.api(
            `/api/member/orders?line_user_id=${encodeURIComponent(lineUserId)}`
          ),
          data => `注文 ${Number(data.orders?.length || 0)}件`
        ),
      ]);
    } else {
      rows.push({
        key: "member_live_api",
        label: "会員API実読取",
        ok: null,
        detail: "本番ではLINEログイン本人操作時に確認",
        skipped: true,
        elapsed_ms: 0,
      });
    }

    return rows.sort((a, b) => a.key.localeCompare(b.key));
  }

  async function runPageProbes() {
    const pages = [
      ["catalog", "公開商品カタログ", "catalog.html", ["商品カタログ"]],
      ["order", "LINE注文画面", "index.html", ["index.js"]],
      ["member", "お客様マイページ", "member.html", ["member-next.js"]],
      ["owner", "オーナーPC管理", "owner.html?demo=1", ["owner-next.js"]],
      ["staff", "スタッフ作業", "staff.html?demo=1", ["staff-next.js"]],
      ["counter", "電話・店頭注文", "counter.html?demo=1", ["counter-next.js"]],
      ["ipad", "店頭・iPad受付", "owner-ipad.html?demo=1", ["owner-ipad-next.js"]],
      ["system_check", "総合検査画面", "system-check.html?demo=1", ["system-check-next.js"]],
    ];

    return Promise.all(
      pages.map(async ([key, label, url, expected]) => {
        const startedAt = performance.now();
        try {
          const response = await fetch(cacheBust(url), {
            cache: "no-store",
          });
          const text = await response.text();
          const expectedOk = expected.every(token => text.includes(token));
          return {
            key,
            label,
            ok: response.ok && expectedOk,
            detail: !response.ok
              ? `HTTP ${response.status}`
              : expectedOk
                ? `公開済み・必要ファイル参照を確認`
                : `必要な参照が不足: ${expected.join(", ")}`,
            http_status: response.status,
            elapsed_ms: Math.round(performance.now() - startedAt),
          };
        } catch (error) {
          return {
            key,
            label,
            ok: false,
            detail: error.message,
            error: serializeError(error),
            elapsed_ms: Math.round(performance.now() - startedAt),
          };
        }
      })
    );
  }

  function renderReadOnly(report) {
    const admin = report.admin_system_check || {};
    const health = report.health || {};
    const checks = admin.checks || {};
    const integrity = admin.integrity || {};

    DPRO.qs("#workerVersion").textContent =
      admin.version || health.version || "未取得";
    DPRO.qs("#shopName").textContent =
      admin.shop?.shop_name ||
      health.database?.shop?.shop_name ||
      admin.shop_code ||
      "未取得";

    const platformRows = [
      rowFromCheck("worker_api", "Worker API", checks.worker_api ?? health.ok, admin.version || health.version),
      rowFromCheck("database_rpc", "Supabase RPC", checks.database_rpc, detailBoolean(checks.database_rpc)),
      rowFromCheck("next_database_rpc", "FLOWER NEXT DB検査", checks.next_database_rpc, admin.next_database?.version || ""),
      rowFromCheck("required_tables", "必須24テーブル", checks.required_tables, tableDetail(admin.worker_tests?.tables)),
      rowFromCheck("private_photo_bucket", "Private写真Storage", checks.private_photo_bucket, admin.worker_tests?.private_photo_bucket || ""),
      rowFromCheck("public_product_bucket", "公開商品Storage", checks.public_product_bucket, admin.worker_tests?.public_product_bucket || ""),
      rowFromCheck("phone_normalization", "電話番号4形式の正規化", checks.phone_normalization, phoneDetail(admin.worker_tests?.phone_normalize_tests)),
      rowFromCheck("thirty_minute", "30分枠・10:15拒否", Boolean(checks.thirty_minute_1000 && checks.thirty_minute_1030 && checks.reject_1015), "10:00/10:30許可・10:15拒否"),
      rowFromCheck("admin_code", "管理コード設定", checks.admin_code_configured, checks.admin_code_configured ? "設定済み" : "未設定"),
      rowFromCheck("production_guard", "デモ・本番保護", checks.production_guard, admin.shop?.is_demo ? "デモ店舗・保護有効" : "本番店舗設定"),
    ];

    const dataRows = [
      rowFromCheck("production_links", "制作タスクの商品リンク", checks.production_task_item_links, `${Number(integrity.unlinked_production_tasks || 0)}件の不整合`),
      rowFromCheck("order_item_links", "注文明細の注文リンク", checks.order_item_links, `${Number(integrity.orphan_order_items || 0)}件の不整合`),
      rowFromCheck("recipient_links", "届け先の注文リンク", checks.recipient_order_links, `${Number(integrity.orphan_order_recipients || 0)}件の不整合`),
      rowFromCheck("default_addresses", "いつもの届け先重複防止", checks.default_address_integrity, `${Number(integrity.duplicate_default_address_customers?.length || 0)}顧客で重複`),
      rowFromCheck("categories", "商品カテゴリ", checks.product_categories, countDetail(admin.counts?.categories)),
      rowFromCheck("products", "公開・販売商品", checks.active_products, `有効 ${displayCount(admin.counts?.products)}／公開 ${displayCount(admin.counts?.published_products)}`),
      rowFromCheck("capacity", "制作受付上限", checks.production_capacity_rules, countDetail(admin.counts?.capacity_rules)),
      rowFromCheck("delivery_areas", "配達エリア", checks.delivery_areas, countDetail(admin.counts?.delivery_areas)),
      rowFromCheck("member_address", "会員届け先管理", checks.member_address_management, "追加・編集・削除API"),
      rowFromCheck("member_anniversary", "会員記念日管理", checks.member_anniversary_management, "追加・編集・削除API"),
      rowFromCheck("repeat_order", "前回注文・記念日から再注文", checks.member_repeat_order, "最新商品・価格を再確認"),
    ];

    renderGroup("platformChecks", "platformBadge", platformRows);
    renderGroup("dataChecks", "dataBadge", dataRows);
    renderGroup("apiChecks", "apiBadge", report.api_probes || []);
    renderGroup("pageChecks", "pageBadge", report.page_probes || []);
    renderCounts(admin.counts || {});

    state.readRows = [
      ...platformRows,
      ...dataRows,
      ...(report.api_probes || []),
      ...(report.page_probes || []),
    ];
  }

  function renderCounts(counts) {
    const labels = {
      staff: "スタッフ",
      customers: "顧客",
      addresses: "届け先",
      anniversaries: "記念日",
      products: "有効商品",
      published_products: "公開商品",
      product_photos: "商品写真",
      orders: "全注文",
      open_orders: "対応中注文",
      production_tasks: "制作タスク",
      delivery_tasks: "配達タスク",
      categories: "カテゴリ",
      capacity_rules: "受付上限",
      delivery_areas: "配達エリア",
      order_status_logs: "注文履歴ログ",
      production_logs: "制作ログ",
      delivery_logs: "配達ログ",
      activity_logs: "操作ログ",
    };

    const entries = Object.entries(labels);
    DPRO.qs("#dataCounts").innerHTML = entries.map(([key, label]) => `
      <div class="check-count-item">
        <span>${DPRO.escape(label)}</span>
        <strong>${displayCount(counts[key])}</strong>
      </div>
    `).join("");
  }

  async function runIntegrationTest() {
    if (!DPRO.isDemo()) {
      DPRO.setAlert(
        alertRoot,
        "実書込み検査はデモ店舗でのみ実行できます。",
        "warning"
      );
      return;
    }

    if (!window.confirm(
      "デモ店舗に一時データと1ピクセル画像を書き込み、更新・読取・削除まで実行します。検査後に自動削除します。実行しますか？"
    )) {
      return;
    }

    const button = DPRO.qs("#runIntegration");
    const adminCode = currentAdminCode();

    DPRO.setButtonBusy(button, true, "実書込み検査中…");
    DPRO.setAlert(alertRoot, "");
    setGroupBadge("integrationBadge", "running", "実行中");
    DPRO.qs("#integrationChecks").innerHTML =
      `<div class="check-empty-row">一時データの追加・更新・削除を実行しています…</div>`;

    try {
      const result = await rawApi("/api/admin/integration-test", {
        method: "POST",
        admin: true,
        adminCode,
      });

      const data = result.data || {};
      const rows = (data.tests || []).map(test => ({
        key: test.key,
        label: test.label,
        ok: test.ok === true,
        detail: test.ok
          ? `${Number(test.elapsed_ms || 0)} ms`
          : test.error?.message || "検査失敗",
        raw: test,
      }));

      state.integrationRows = rows;
      state.report.integration = data;
      state.report.generated_at = new Date().toISOString();

      renderGroup("integrationChecks", "integrationBadge", rows);
      updateJson();
      updateOverallFromRows();

      DPRO.setAlert(
        alertRoot,
        data.ok
          ? `デモ実書込み検査 ${data.passed}/${data.total}項目が合格し、一時データを削除しました。`
          : `実書込み検査で ${data.failed}項目の問題が見つかりました。`,
        data.ok ? "info" : "warning"
      );

      await runReadOnlyCheck();
    } catch (error) {
      state.integrationRows = [{
        key: "integration_request",
        label: "実書込み検査API",
        ok: false,
        detail: error.message,
      }];
      state.report.integration = {
        ok: false,
        error: serializeError(error),
      };
      renderGroup(
        "integrationChecks",
        "integrationBadge",
        state.integrationRows
      );
      updateJson();
      updateOverallFromRows();
      DPRO.setAlert(alertRoot, error.message, "error");
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  async function prepareDemo() {
    if (!DPRO.isDemo()) {
      DPRO.setAlert(
        alertRoot,
        "デモデータ再生成はデモ店舗でのみ実行できます。",
        "warning"
      );
      return;
    }

    if (!window.confirm(
      "デモ店舗の注文・顧客・商品データを初期状態へ戻します。実行しますか？"
    )) {
      return;
    }

    const button = DPRO.qs("#prepareDemo");
    DPRO.setButtonBusy(button, true, "再生成中…");

    try {
      const adminCode = currentAdminCode();
      const result = await DPRO.api("/api/admin/demo-prepare", {
        method: "POST",
        admin: true,
        adminCode,
      });

      state.report.demo_prepare = result;
      state.report.generated_at = new Date().toISOString();
      updateJson();
      DPRO.setAlert(
        alertRoot,
        "デモデータを再生成しました。続けて総合検査を実行します。",
        "info"
      );
      await runReadOnlyCheck();
    } catch (error) {
      DPRO.setAlert(alertRoot, error.message, "error");
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }

  function renderGroup(rootId, badgeId, rows) {
    const root = DPRO.qs(`#${rootId}`);
    const failed = rows.filter(row => row.ok === false).length;
    const passed = rows.filter(row => row.ok === true).length;
    const skipped = rows.filter(row => row.ok == null || row.skipped).length;

    root.innerHTML = rows.length
      ? rows.map(row => checkRowHtml(row)).join("")
      : `<div class="check-empty-row">検査項目がありません。</div>`;

    if (failed > 0) {
      setGroupBadge(badgeId, "ng", `NG ${failed}`);
    } else if (passed > 0) {
      setGroupBadge(
        badgeId,
        "ok",
        skipped ? `OK ${passed}・対象外 ${skipped}` : `OK ${passed}`
      );
    } else {
      setGroupBadge(badgeId, "wait", "対象外");
    }
  }

  function checkRowHtml(row) {
    const status = row.ok === true
      ? ["ok", "OK"]
      : row.ok === false
        ? ["ng", "NG"]
        : ["skip", "対象外"];

    return `
      <div class="check-row-next">
        <div class="check-row-copy">
          <strong>${DPRO.escape(row.label || row.key || "検査")}</strong>
          <small>${DPRO.escape(row.detail || "")}</small>
        </div>
        <span class="check-row-result ${status[0]}">${status[1]}</span>
      </div>
    `;
  }

  function rowFromCheck(key, label, value, detail = "") {
    return {
      key,
      label,
      ok: value === true ? true : value === false ? false : null,
      detail,
    };
  }

  function setGroupBadge(id, type, text) {
    const badge = DPRO.qs(`#${id}`);
    if (!badge) return;
    badge.className = `check-group-badge ${type}`;
    badge.textContent = text;
  }

  function updateOverallFromRows() {
    const rows = [
      ...state.readRows,
      ...state.integrationRows,
    ];
    const passed = rows.filter(row => row.ok === true).length;
    const failed = rows.filter(row => row.ok === false).length;
    const total = rows.filter(row => row.ok != null).length;

    DPRO.qs("#passedCount").textContent = String(passed);
    DPRO.qs("#failedCount").textContent = String(failed);
    DPRO.qs("#totalCount").textContent = String(total);

    if (!rows.length) {
      setOverall(
        "waiting",
        "まだ検査していません",
        "「読取専用の総合検査」を押してください。"
      );
    } else if (failed === 0) {
      setOverall(
        "ok",
        "総合検査に合格しました",
        state.integrationRows.length
          ? "読取検査とデモ実書込み検査の両方が正常です。"
          : "読取専用検査は正常です。デモ環境では実書込み検査も実行できます。"
      );
    } else {
      setOverall(
        "ng",
        `${failed}項目の確認が必要です`,
        "NG項目の詳細を確認し、修正後に再検査してください。"
      );
    }
  }

  function setOverall(type, title, message) {
    const card = DPRO.qs("#overallCard");
    card.className = `check-overall-card ${type}`;
    DPRO.qs("#overallTitle").textContent = title;
    DPRO.qs("#overallMessage").textContent = message;
    DPRO.qs("#overallIcon").textContent = ({
      waiting: "⏳",
      running: "🔍",
      ok: "✅",
      ng: "⚠️",
    })[type] || "⏳";
  }

  function renderFatalReadError(error) {
    const row = [{
      key: "read_only_fatal",
      label: "総合検査の実行",
      ok: false,
      detail: error.message,
    }];

    renderGroup("platformChecks", "platformBadge", row);
    renderGroup("dataChecks", "dataBadge", []);
    renderGroup("apiChecks", "apiBadge", []);
    renderGroup("pageChecks", "pageBadge", []);
    state.readRows = row;
  }

  function currentAdminCode() {
    const code = codeInput.value.trim() || DPRO.getAdminCode();
    if (code) DPRO.saveAdminCode(code);
    return code;
  }

  function clearSavedCode() {
    DPRO.clearAdminCode();
    codeInput.value = "";
    DPRO.setAlert(alertRoot, "保存されている管理コードを削除しました。", "info");
  }

  async function rawApi(path, options = {}) {
    const url = path.startsWith("http")
      ? path
      : `${DPRO.cfg.API_BASE_URL}${path.startsWith("/") ? path : `/${path}`}`;

    const headers = new Headers(options.headers || {});
    headers.set("accept", "application/json");

    if (options.body !== undefined) {
      headers.set("content-type", "application/json");
    }

    if (options.admin) {
      const code = options.adminCode || DPRO.getAdminCode();
      if (!code) throw new Error("管理コードを入力してください。");
      headers.set("x-admin-code", code);
    }

    const response = await fetch(url, {
      method: options.method || "GET",
      headers,
      body: options.body === undefined
        ? undefined
        : JSON.stringify(options.body),
      cache: "no-store",
    });

    const data = await response.json().catch(() => ({
      ok: false,
      message: `HTTP ${response.status}`,
    }));

    if (!response.ok) {
      const error = new Error(
        data.message || data.error || `HTTP ${response.status}`
      );
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return {
      status: response.status,
      data,
    };
  }

  function cacheBust(url) {
    const separator = url.includes("?") ? "&" : "?";
    return `${url}${separator}_check=${Date.now()}_${Math.random().toString(16).slice(2)}`;
  }

  function collectAllReadRows(report) {
    return [
      ...state.readRows,
      ...(report.api_probes || []),
      ...(report.page_probes || []),
    ];
  }

  function detailBoolean(value) {
    return value === true ? "正常" : value === false ? "異常" : "未取得";
  }

  function tableDetail(tables) {
    if (!tables) return "未取得";
    const entries = Object.entries(tables);
    const ok = entries.filter(([, value]) => value === true).length;
    return `${ok}/${entries.length}テーブル`;
  }

  function phoneDetail(tests) {
    if (!tests) return "未取得";
    return Object.entries(tests)
      .map(([key, value]) => `${key}:${value}`)
      .join("／");
  }

  function countDetail(value) {
    return `${displayCount(value)}件`;
  }

  function displayCount(value) {
    return value === null || value === undefined ? "―" : String(value);
  }

  function formatClock(date) {
    return new Intl.DateTimeFormat("ja-JP", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(date);
  }

  function serializeError(error) {
    return {
      message: error?.message || String(error),
      status: error?.status || null,
      data: error?.data || null,
    };
  }

  function updateJson() {
    jsonRoot.textContent = JSON.stringify(state.report, null, 2);
  }

  async function copyJson() {
    const text = JSON.stringify(state.report, null, 2);

    try {
      await navigator.clipboard.writeText(text);
      DPRO.setAlert(alertRoot, "検査結果JSONをコピーしました。", "info");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      DPRO.setAlert(alertRoot, "検査結果JSONをコピーしました。", "info");
    }
  }

  function downloadJson() {
    const text = JSON.stringify(state.report, null, 2);
    const blob = new Blob([text], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download =
      `FLOWER-NEXT-10-system-check-${DPRO.todayJst()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }
});
