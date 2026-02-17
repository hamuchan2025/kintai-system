// =====================
// 設定
// =====================
const STORAGE_KEY = "kintai_main_records";
const ADMIN_PASS = "1234"; // ←管理者パスワード（変更OK）

// プリセット（必要なら自由に追加/変更OK）
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
  { label: "15:30-17:00", start: "15:30", end: "17:00" },
  { label: "13:45-15:15", start: "13:45", end: "15:15" },
];

// ===== 勤務地デフォルト（旧版から復元）=====
const PLACE_DEFAULTS = {
  "寺津(土)": [
    { start:"08:45", end:"10:15" },
    { start:"10:30", end:"12:00" },
    { start:"13:00", end:"14:30" },
    { start:"14:45", end:"16:15" },
    { start:"", end:"" },
  ],
  "寺津(水)": [
    { start:"16:45", end:"18:15" },
    { start:"", end:"" },
    { start:"", end:"" },
    { start:"", end:"" },
    { start:"", end:"" },
  ],
  "安城": [
    { start:"08:45", end:"10:15" },
    { start:"10:30", end:"12:00" },
    { start:"13:00", end:"14:30" },
    { start:"14:45", end:"16:15" },
    { start:"", end:"" },
  ],
  "お城下": [
    { start:"09:15", end:"10:45" },
    { start:"11:00", end:"12:30" },
    { start:"13:30", end:"15:00" },
    { start:"15:15", end:"16:45" },
    { start:"", end:"" },
  ],
  "碧南": [
    { start:"09:15", end:"10:45" },
    { start:"11:00", end:"12:30" },
    { start:"", end:"" },
    { start:"", end:"" },
    { start:"", end:"" },
  ],
  // 吉良は旧コードに無かったので空（必要なら追加できます）
  "吉良": [
    { start:"", end:"" },
    { start:"", end:"" },
    { start:"", end:"" },
    { start:"", end:"" },
    { start:"", end:"" },
  ],
};

// 交通費（旧版そのまま）
const PLACE_FARE = {
  "寺津(土)": 60,
  "寺津(水)": 60,
  "安城": 220,
  "お城下": 80,
  "碧南": 160,
  "吉良": 0,
};

// =====================
// DOM
// =====================
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

// =====================
// 初期化
// =====================
initPresets();
setTodayIfEmpty();
applyPlaceDefaults(elPlace.value);
renderHistory();

// 入力変更で自動計算
document.querySelectorAll("input, select").forEach((x) => {
  x.addEventListener("change", () => {
    if (x === adminPass) return;
    calcAndRender();
  });
});

elPlace.addEventListener("change", () => {
  applyPlaceDefaults(elPlace.value);
});

btnCalc.addEventListener("click", calcAndRender);
btnSave.addEventListener("click", onSave);
btnClear.addEventListener("click", clearInputs);

btnClearAll.addEventListener("click", () => {
  if (!confirm("履歴を全削除します。よろしいですか？")) return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
  renderHistory();
});

btnExportCSV.addEventListener("click", exportCSV);
btnExportPDF.addEventListener("click", exportPDF);

// =====================
// プリセット
// =====================
function initPresets() {
  document.querySelectorAll(".koma").forEach((koma) => {
    const preset = koma.querySelector(".preset");
    preset.innerHTML = "";

    PRESETS.forEach((p) => {
      const opt = document.createElement("option");
      opt.value = JSON.stringify({ start: p.start, end: p.end });
      opt.textContent = p.label;
      preset.appendChild(opt);
    });

    preset.addEventListener("change", () => {
      const v = JSON.parse(preset.value);
      koma.querySelector(".start").value = v.start || "";
      koma.querySelector(".end").value = v.end || "";
      calcAndRender();
    });
  });
}

// =====================
// 勤務地デフォルト適用（時間＋交通費）
// =====================
function applyPlaceDefaults(place) {
  const defs = PLACE_DEFAULTS[place] || [];

  document.querySelectorAll(".koma").forEach((koma, idx) => {
    const d = defs[idx] || { start:"", end:"" };

    const s = koma.querySelector(".start");
    const e = koma.querySelector(".end");
    const p = koma.querySelector(".preset");

    if (s) s.value = d.start || "";
    if (e) e.value = d.end || "";
    if (p) p.selectedIndex = 0; // プリセット表示は（選択）に戻す
  });

  // 交通費
  elTransport.value = (PLACE_FARE[place] ?? 0);

  calcAndRender();
}

// =====================
// 計算
// =====================
function timeToMinutes(t) {
  if (!t) return null;
  const [hh, mm] = t.split(":").map(Number);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

function calc() {
  const slots = [];
  let totalMinutes = 0;

  document.querySelectorAll(".koma").forEach((koma) => {
    const start = koma.querySelector(".start").value;
    const end = koma.querySelector(".end").value;

    const s = timeToMinutes(start);
    const e = timeToMinutes(end);

    let minutes = 0;
    if (s !== null && e !== null && e > s) minutes = e - s;

    slots.push({ start, end, minutes });
    totalMinutes += minutes;
  });

  const allowance = Number(elAllowance.value || 0);
  const transport = Number(elTransport.value || 0);
  const hourly = Number(elHourly.value || 0);

  const hours = totalMinutes / 60;
  const wageAmount = Math.round(hourly * hours);
  const grandTotal = wageAmount + allowance + transport;

  return {
    place: elPlace.value,
    date: elDate.value,
    allowance,
    transport,
    hourly,
    slots,
    totalMinutes,
    wageAmount,
    grandTotal,
  };
}

function calcAndRender() {
  const r = calc();
  elWorkMinutes.textContent = String(r.totalMinutes);
  elWageAmount.textContent = String(r.wageAmount);
  elGrandTotal.textContent = String(r.grandTotal);
}

// =====================
// 保存・履歴
// =====================
function loadRecords() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
}
function saveRecords(arr) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
}

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
  records.unshift({
    ...r,
    createdAt: new Date().toISOString(),
  });
  saveRecords(records);

  renderHistory();
  alert("保存しました");
}

function renderHistory() {
  const records = loadRecords();
  historyBody.innerHTML = "";

  if (records.length === 0) {
    historyBody.innerHTML = `<tr><td colspan="5" class="muted">履歴がありません</td></tr>`;
    return;
  }

  records.forEach((r, idx) => {
    const detail = makeDetailText(r);

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
        <div class="small">${detail}</div>
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
      const next = row.nextElementSibling;
      const open = next.style.display !== "none";
      next.style.display = open ? "none" : "table-row";
      btn.textContent = open ? "表示" : "閉じる";
    });
  });
}

function makeDetailText(r) {
  const slots = (r.slots || [])
    .map((s, i) => `(${i + 1}) ${s.start || "--:--"}〜${s.end || "--:--"} / ${s.minutes || 0}分`)
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

function clearInputs() {
  // 日付は残す
  elAllowance.value = "0";
  // 交通費は勤務地で自動セットするので、いったん再適用
  document.querySelectorAll(".koma").forEach((koma) => {
    koma.querySelector(".start").value = "";
    koma.querySelector(".end").value = "";
    koma.querySelector(".preset").selectedIndex = 0;
  });
  applyPlaceDefaults(elPlace.value);
}

function setTodayIfEmpty() {
  if (!elDate.value) {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    elDate.value = `${yyyy}-${mm}-${dd}`;
  }
  calcAndRender();
}

// =====================
// 管理者：CSV(Excel) / PDF
// =====================
function checkAdmin() {
  if (adminPass.value !== ADMIN_PASS) {
    alert("管理者パスワードが違います");
    return false;
  }
  return true;
}

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
        body{font-family: sans-serif; padding:16px;}
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
// ユーティリティ
// =====================
function escapeHtml(str){
  return String(str)
    .replaceAll("&","&amp;")
    .replaceAll("<","&lt;")
    .replaceAll(">","&gt;")
    .replaceAll('"',"&quot;")
    .replaceAll("'","&#39;");
}
