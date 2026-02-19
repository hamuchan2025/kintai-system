// =====================
// 講師勤怠システム app.js（全）
// =====================

// 保存キー
const STORAGE_KEY = "kintai_main_records";

// 管理者パス（必要なら変更）
const ADMIN_PASS = "1234";

// ===== プリセット（必要に応じて増やしてOK）=====
const PRESETS = [
  { label: "（選択）", start: "", end: "" },
  { label: "08:45-10:15", start: "08:45", end: "10:15" },
  { label: "09:15-10:45", start: "09:15", end: "10:45" },
  { label: "10:30-12:00", start: "10:30", end: "12:00" },
  { label: "11:00-12:30", start: "11:00", end: "12:30" },
  { label: "13:00-14:30", start: "13:00", end: "14:30" },
  { label: "13:30-15:00", start: "13:30", end: "15:00" },
  { label: "14:45-16:15", start: "14:45", end: "16:15" },
  { label: "15:15-16:45", start: "15:15", end: "16:45" },
  { label: "16:45-18:15", start: "16:45", end: "18:15" },
  { label: "13:45-15:15", start: "13:45", end: "15:15" },
  { label: "15:30-17:00", start: "15:30", end: "17:00" },
];

// ===== 勤務地ごとのデフォルト（旧版から復元）=====
const PLACE_DEFAULTS = {
  "寺津(土)": [
    { start: "08:45", end: "10:15" },
    { start: "10:30", end: "12:00" },
    { start: "13:00", end: "14:30" },
    { start: "14:45", end: "16:15" },
    { start: "", end: "" },
  ],
  "寺津(水)": [
    { start: "16:45", end: "18:15" },
    { start: "", end: "" },
    { start: "", end: "" },
    { start: "", end: "" },
    { start: "", end: "" },
  ],
  "安城": [
    { start: "08:45", end: "10:15" },
    { start: "10:30", end: "12:00" },
    { start: "13:00", end: "14:30" },
    { start: "14:45", end: "16:15" },
    { start: "", end: "" },
  ],
  "お城下": [
    { start: "09:15", end: "10:45" },
    { start: "11:00", end: "12:30" },
    { start: "13:30", end: "15:00" },
    { start: "15:15", end: "16:45" },
    { start: "", end: "" },
  ],
  "碧南": [
    { start: "09:15", end: "10:45" },
    { start: "11:00", end: "12:30" },
    { start: "", end: "" },
    { start: "", end: "" },
    { start: "", end: "" },
  ],
  // 吉良は旧版に無かったので空（必要なら入れて言って）
  "吉良": [
    { start: "", end: "" },
    { start: "", end: "" },
    { start: "", end: "" },
    { start: "", end: "" },
    { start: "", end: "" },
  ],
};

// ===== 交通費（旧版から復元）=====
const PLACE_FARE = {
  "寺津(土)": 60,
  "寺津(水)": 60,
  "安城": 220,
  "お城下": 80,
  "碧南": 160,
  "吉良": 0,
};

// =====================
// ユーティリティ
// =====================
function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function timeToMinutes(t) {
  if (!t) return null;
  const parts = t.split(":");
  if (parts.length !== 2) return null;
  const hh = Number(parts[0]);
  const mm = Number(parts[1]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  return hh * 60 + mm;
}

function calcSlotMinutes(start, end) {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s == null || e == null) return 0;
  if (e <= s) return 0;
  return e - s;
}

function loadRecords() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const arr = JSON.parse(raw || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

function saveRecords(arr) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

// =====================
// メイン
// =====================
document.addEventListener("DOMContentLoaded", () => {
  // DOM
  const elPlace = document.getElementById("place");
  const elDate = document.getElementById("date");

  const elAllowance = document.getElementById("allowance");
  const elTransport = document.getElementById("transport");
  const elHourly = document.getElementById("hourly");

  const elWorkMinutes = document.getElementById("workMinutes");
  const elWageAmount = document.getElementById("wageAmount");
  const elGrandTotal = document.getElementById("grandTotal");

  const btnCalc = document.getElementById("btnCalc");
  const btnSave = document.getElementById("btnSave");
  const btnClear = document.getElementById("btnClear");
  const btnClearAll = document.getElementById("btnClearAll");

  const adminPass = document.getElementById("adminPass");
  const btnExportCSV = document.getElementById("btnExportCSV");
  const btnExportPDF = document.getElementById("btnExportPDF");

  const historyBody = document.getElementById("historyBody");

  // ===== 今日を入れる =====
  if (elDate && !elDate.value) {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    elDate.value = `${yyyy}-${mm}-${dd}`;
  }

  // ===== プリセット初期化 =====
  function initPresets() {
    document.querySelectorAll(".koma").forEach((koma) => {
      const preset = koma.querySelector(".preset");
      if (!preset) return;

      preset.innerHTML = "";
      PRESETS.forEach((p) => {
        const opt = document.createElement("option");
        opt.value = JSON.stringify({ start: p.start, end: p.end });
        opt.textContent = p.label;
        preset.appendChild(opt);
      });

      preset.addEventListener("change", () => {
        const v = JSON.parse(preset.value || "{}");
        const s = koma.querySelector(".start");
        const e = koma.querySelector(".end");
        if (s) s.value = v.start || "";
        if (e) e.value = v.end || "";
        calcAndRender();
      });
    });
  }

  // ===== 勤務地デフォルト適用（自動入力）=====
  function applyPlaceDefaults(place) {
    const defs = PLACE_DEFAULTS[place] || [];

    document.querySelectorAll(".koma").forEach((koma, idx) => {
      const d = defs[idx] || { start: "", end: "" };

      const s = koma.querySelector(".start");
      const e = koma.querySelector(".end");
      const p = koma.querySelector(".preset");

      if (s) s.value = d.start || "";
      if (e) e.value = d.end || "";
      if (p) p.selectedIndex = 0; // プリセット表示は（選択）へ
    });

    // 交通費も自動セット（旧仕様）
    if (elTransport) elTransport.value = String(PLACE_FARE[place] ?? 0);

    calcAndRender();
  }

  // ===== 計算 =====
  function calc() {
    let totalMinutes = 0;
    const slots = [];

    document.querySelectorAll(".koma").forEach((koma) => {
      const start = (koma.querySelector(".start")?.value || "").trim();
      const end = (koma.querySelector(".end")?.value || "").trim();
      const minutes = calcSlotMinutes(start, end);

      slots.push({ start, end, minutes });
      totalMinutes += minutes;
    });

    const hourly = Number(elHourly?.value || 0);
    const allowance = Number(elAllowance?.value || 0);
    const transport = Number(elTransport?.value || 0);

    const wageAmount = Math.round((totalMinutes / 60) * hourly);
    const grandTotal = wageAmount + allowance + transport;

    return {
      date: elDate?.value || "",
      place: elPlace?.value || "",
      hourly,
      allowance,
      transport,
      slots,
      totalMinutes,
      wageAmount,
      grandTotal,
      createdAt: new Date().toISOString(),
    };
  }

  function calcAndRender() {
    const r = calc();
    if (elWorkMinutes) elWorkMinutes.textContent = String(r.totalMinutes);
    if (elWageAmount) elWageAmount.textContent = String(r.wageAmount);
    if (elGrandTotal) elGrandTotal.textContent = String(r.grandTotal);
  }

  // ===== 履歴表示 =====
  function makeDetailText(r) {
    const slots = (r.slots || [])
      .map(
        (s, i) =>
          `(${i + 1}) ${s.start || "--:--"}〜${s.end || "--:--"} / ${s.minutes || 0}分`
      )
      .join("　");

    return `
      <b>勤務：</b>${slots}<br>
      <b>合計：</b>${r.totalMinutes || 0}分　
      <b>時給：</b>${r.hourly || 0}円　
      <b>時給分：</b>${r.wageAmount || 0}円　
      <b>手当：</b>${r.allowance || 0}円　
      <b>交通費：</b>${r.transport || 0}円　
      <b>合計：</b>${r.grandTotal || 0}円
    `.trim();
  }

  function renderHistory() {
    const records = loadRecords();
    if (!historyBody) return;

    historyBody.innerHTML = "";

    if (records.length === 0) {
      historyBody.innerHTML = `<tr><td colspan="5" class="muted">履歴がありません</td></tr>`;
      return;
    }

    records.forEach((r, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${escapeHtml(r.date || "")}</td>
        <td>${escapeHtml(r.place || "")}</td>
        <td>${escapeHtml(String(r.grandTotal ?? 0))}</td>
        <td><button class="btn ghost" data-detail="${idx}">表示</button></td>
        <td><button class="btn danger ghost" data-del="${idx}">削除</button></td>
      `;
      historyBody.appendChild(tr);

      const tr2 = document.createElement("tr");
      tr2.style.display = "none";
      tr2.innerHTML = `
        <td colspan="5" style="text-align:left; padding:12px;">
          <div class="small">${makeDetailText(r)}</div>
        </td>
      `;
      historyBody.appendChild(tr2);
    });

    historyBody.querySelectorAll("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-del"));
        const records = loadRecords();
        if (!confirm("この履歴を削除しますか？")) return;
        records.splice(i, 1);
        saveRecords(records);
        renderHistory();
      });
    });

    historyBody.querySelectorAll("[data-detail]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const row = btn.closest("tr");
        const next = row?.nextElementSibling;
        if (!next) return;
        const open = next.style.display !== "none";
        next.style.display = open ? "none" : "table-row";
        btn.textContent = open ? "表示" : "閉じる";
      });
    });
  }

  // ===== 保存 =====
  function onSave() {
    const r = calc();

    if (!r.date) {
      alert("勤務日を入れてください");
      return;
    }
    if (r.totalMinutes <= 0) {
      alert("勤務時間が0分です（出勤/退勤を入れるかプリセットを選んでください）");
      return;
    }

    const records = loadRecords();
    records.unshift(r);
    saveRecords(records);
    renderHistory();
    alert("保存しました");
  }

  // ===== 入力クリア =====
  function clearInputs() {
    if (elAllowance) elAllowance.value = "0";
    // 時給は残したい場合が多いので触らない（必要ならここで0に）
    document.querySelectorAll(".koma").forEach((koma) => {
      const s = koma.querySelector(".start");
      const e = koma.querySelector(".end");
      const p = koma.querySelector(".preset");
      if (s) s.value = "";
      if (e) e.value = "";
      if (p) p.selectedIndex = 0;
    });
    // 交通費と時間は勤務地デフォルトに戻す
    applyPlaceDefaults(elPlace.value);
  }

  // ===== 管理者チェック =====
  function checkAdmin() {
    if (!adminPass) return false;
    if (adminPass.value !== ADMIN_PASS) {
      alert("管理者パスワードが違います");
      return false;
    }
    return true;
  }

  // ===== CSV出力 =====
  function exportCSV() {
    if (!checkAdmin()) return;

    const records = loadRecords();
    if (records.length === 0) {
      alert("データがありません");
      return;
    }

    const headers = [
      "勤務日","勤務地",
      "1出勤","1退勤","1分",
      "2出勤","2退勤","2分",
      "3出勤","3退勤","3分",
      "4出勤","4退勤","4分",
      "5出勤","5退勤","5分",
      "合計分","時給","時給分","手当","交通費","合計円"
    ];

    const rows = records.map(r => {
      const s = r.slots || [];
      const get = (i, k) => (s[i] && s[i][k] !== undefined) ? s[i][k] : "";
      return [
        r.date || "", r.place || "",
        get(0,"start"), get(0,"end"), get(0,"minutes"),
        get(1,"start"), get(1,"end"), get(1,"minutes"),
        get(2,"start"), get(2,"end"), get(2,"minutes"),
        get(3,"start"), get(3,"end"), get(3,"minutes"),
        get(4,"start"), get(4,"end"), get(4,"minutes"),
        r.totalMinutes ?? 0,
        r.hourly ?? 0,
        r.wageAmount ?? 0,
        r.allowance ?? 0,
        r.transport ?? 0,
        r.grandTotal ?? 0,
      ];
    });

    const csv = [headers, ...rows]
      .map(line => line.map(v => `"${String(v).replace(/"/g,'""')}"`).join(","))
      .join("\n");

    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `kintai_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();

    URL.revokeObjectURL(url);
  }

  // ===== PDF出力（印刷→PDF保存）=====
  function exportPDF() {
    if (!checkAdmin()) return;

    const records = loadRecords();
    if (records.length === 0) {
      alert("データがありません");
      return;
    }

    const htmlRows = records.map(r => {
      const total = r.grandTotal ?? 0;
      return `
        <tr>
          <td>${escapeHtml(r.date || "")}</td>
          <td>${escapeHtml(r.place || "")}</td>
          <td style="text-align:right;">${escapeHtml(String(total))}</td>
        </tr>
      `;
    }).join("");

    const w = window.open("", "_blank");
    w.document.write(`
      <!doctype html>
      <html lang="ja"><head><meta charset="utf-8">
        <title>勤怠一覧</title>
        <style>
          body{font-family:sans-serif; padding:16px;}
          h1{font-size:18px; margin:0 0 10px;}
          .muted{color:#666; font-size:12px;}
          table{border-collapse:collapse; width:100%; font-size:12px; margin-top:10px;}
          th,td{border:1px solid #999; padding:6px;}
          th{background:#f2f2f2;}
          button{margin: 10px 0; padding:8px 12px;}
          @media print { button { display:none; } }
        </style>
      </head><body>
        <h1>勤怠一覧</h1>
        <div class="muted">印刷画面で「PDFに保存」を選んでください</div>
        <button onclick="window.print()">印刷（PDF保存）</button>
        <table>
          <thead><tr><th>勤務日</th><th>勤務地</th><th>合計（円）</th></tr></thead>
          <tbody>${htmlRows}</tbody>
        </table>
      </body></html>
    `);
    w.document.close();
  }

  // =====================
  // イベント
  // =====================

  initPresets();

  // ★ 初期表示：必ず勤務地デフォルトを反映（ここが重要）
  applyPlaceDefaults(elPlace.value);

  // ★ 勤務地変更：デフォルト反映
  elPlace.addEventListener("change", () => {
    applyPlaceDefaults(elPlace.value);
  });

  // 入力変更で再計算（勤務地はapplyPlaceDefaults内で計算するので除外）
  document.querySelectorAll("input, select").forEach((x) => {
    x.addEventListener("change", () => {
      if (x === adminPass) return;
      if (x === elPlace) return;
      calcAndRender();
    });
  });

  btnCalc?.addEventListener("click", calcAndRender);
  btnSave?.addEventListener("click", onSave);
  btnClear?.addEventListener("click", clearInputs);

  btnClearAll?.addEventListener("click", () => {
    if (!confirm("履歴を全削除します。よろしいですか？")) return;
    saveRecords([]);
    renderHistory();
  });

  btnExportCSV?.addEventListener("click", exportCSV);
  btnExportPDF?.addEventListener("click", exportPDF);

  // 最初の履歴表示
  renderHistory();
  // 初回計算表示
  calcAndRender();
});
