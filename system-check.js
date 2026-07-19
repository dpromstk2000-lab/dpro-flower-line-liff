document.addEventListener("DOMContentLoaded", () => {
  DPRO.mountChrome("");

  const code = DPRO.qs("#adminCode");
  code.value = DPRO.getAdminCode();

  DPRO.qs("#clearCode").addEventListener("click", () => {
    DPRO.clearAdminCode();
    code.value = "";
    DPRO.setAlert(DPRO.qs("#alert"), "管理コードを削除しました。", "info");
  });
  DPRO.qs("#runCheck").addEventListener("click", run);
  DPRO.qs("#prepareDemo").addEventListener("click", prepare);

  if (DPRO.isDemo()) run();

  async function run() {
    const button = DPRO.qs("#runCheck");
    DPRO.setButtonBusy(button, true, "検査中…");
    DPRO.setAlert(DPRO.qs("#alert"), "");
    const adminCode = code.value.trim() || DPRO.getAdminCode();
    if (adminCode) DPRO.saveAdminCode(adminCode);

    let health;
    let admin;
    try {
      health = await DPRO.api("/health");
      renderPublic(health);
    } catch (error) {
      renderPublic({ ok: false, message: error.message });
    }

    try {
      admin = await DPRO.api("/api/admin/system-check", {
        admin: true,
        adminCode
      });
      renderAdmin(admin);
    } catch (error) {
      admin = { ok: false, message: error.message };
      renderAdmin(admin);
    }

    DPRO.qs("#jsonResult").textContent = JSON.stringify({ health, admin }, null, 2);
    DPRO.setButtonBusy(button, false);
  }

  function renderPublic(data) {
    const items = [
      ["Worker API", data.ok === true],
      ["Supabase接続", data.database?.ok === true],
      ["production_guard", data.production_guard === true],
      ["30分枠", data.features?.thirty_minute_slots === true],
      ["電話番号正規化", data.database?.tests?.phone_normalize_test === "09012345678"],
      ["非公開写真", data.features?.private_photo_storage === true]
    ];
    DPRO.qs("#publicChecks").innerHTML = items.map(([label, ok]) => row(label, ok)).join("");
  }

  function renderAdmin(data) {
    const tests = data.worker_tests || {};
    const tableValues = Object.values(tests.tables || {});
    const items = [
      ["管理API", data.ok === true],
      ["Supabase REST", tests.supabase_rest === true],
      ["主要テーブル", tableValues.length > 0 && tableValues.every(Boolean)],
      ["10:00枠", tests.thirty_minute_test_1000 === true],
      ["10:15拒否", tests.thirty_minute_test_1015 === false],
      ["管理コード設定", tests.admin_code_configured === true],
      ["デモ生成可能", data.database?.features?.demo_prepare === true]
    ];
    DPRO.qs("#adminChecks").innerHTML = items.map(([label, ok]) => row(label, ok)).join("");
  }

  function row(label, ok) {
    return `<div class="check-item"><span>${DPRO.escape(label)}</span><span class="${ok ? "check-ok" : "check-ng"}">${ok ? "OK" : "NG"}</span></div>`;
  }

  async function prepare() {
    if (!confirm("デモ店舗の注文・顧客・商品データを初期状態へ戻します。実行しますか？")) return;
    const button = DPRO.qs("#prepareDemo");
    DPRO.setButtonBusy(button, true, "再生成中…");
    try {
      const adminCode = code.value.trim() || DPRO.getAdminCode();
      if (adminCode) DPRO.saveAdminCode(adminCode);
      const result = await DPRO.api("/api/admin/demo-prepare", {
        method: "POST",
        admin: true,
        adminCode
      });
      DPRO.setAlert(DPRO.qs("#alert"), "デモデータを再生成しました。", "info");
      DPRO.qs("#jsonResult").textContent = JSON.stringify(result, null, 2);
      await run();
    } catch (error) {
      DPRO.setAlert(DPRO.qs("#alert"), error.message, "error");
    } finally {
      DPRO.setButtonBusy(button, false);
    }
  }
});
