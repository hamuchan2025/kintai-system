// =====================
// 講師勤怠システム app.js（Firestore共有対応）
// =====================

// ===== 設定 =====
const ADMIN_PASS = "1234";           // 管理者パス（ここを変更）
const CLOUD_COLLECTION = "kintai_records"; // Firestoreコレクション名
const CACHE_KEY = "kintai_cache_records";  // 端末キャッシュ（表示高速化用）

// プリセット（各コマ共通：start/endを入れる）
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

// 勤務地ごとの自動入力（時間/交通費）
const PLACE_DEFAULTS = {
  "寺津(土)": {
    slots: [
      { start: "08:45", end: "10:15" },
      { start: "10:30", end: "12:00" },
      { start: "13:00", end: "14:30" },
      { start: "14:45", end: "16:15" },
      { start: "", end: "" },
    ],
    transport: 60,
  },
  "寺津(水)": {
    slots: [
      { start: "16:45", end: "18:15" },
      { start: "", end: "" },
      { start: "", end: "" },
      { start: "", end: "" },
      { start: "", end: "" },
    ],
    transport: 60,
  },
  "安城": {
    slots: [
      { start: "08:45", end: "10:15" },
      { start: "10:30", end: "12:00" },
      { start: "13:00", end: "14:30" },
      { start: "14:45", end: "16:15" },
      { start: "", end: "" },
    ],
    transport: 220,
  },
  "お城下": {
    slots: [
      { start: "09:15", end: "10:45" },
      { start: "11:00", end: "12:30" },
      { start: "13:30", end: "15:00" },
      { start: "15:15", end: "16:45" },
      { start: "", end: "" },
    ],
    transport: 80,
  },
  "碧南": {
    slots: [
      { start: "09:15", end: "10:45" },
      { start: "11:00", end: "12:30" },
      { start: "", end: "" },
      { start: "", end: "" },
      { start: "", end: "" },
    ],
    transport: 160,
  },
  "吉良": {
    slots: [
      { start: "", end: "" },
      { start: "", end: "" },
      { start: "", end: "" },
      { start: "", end: "" },
      { start: "", end: "" },
    ],
    transport: 0,
  },
};

// ===== 共有変数 =====
let records = [];            // 表示用（Firestoreから）
let lastCalcRecord = null;   // 計算結果（保存用）
let unsubRealtime = null;    // onSnapshot解除用

// ===== util =====
function fmt(n) {
  const num = Number(n);
  if (!isFinite(num)) return "0";
  return num.toLocaleString("ja-JP");
}

function escapeHtml(str) {
  return String(str ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function timeToMinutes(t) {
  if (!t) return null;
  const [hh, mm] = String(t).split(":");
  const h = parseInt(hh, 10);
  const m = parseInt(mm, 10);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
}

function diffMinutes(start, end) {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s == null || e == null) return 0;
  const d = e - s;
  return d > 0 ? d : 0;
}

function toHm(mins) {
  const m = Math.max(0, mins | 0);
  return { h: Math.floor(m / 60), m: m % 60 };
}

// ===== DOM取得 =====
function $id(id) { return document.getElementById(id); }
function komaEls() { return Array.from(document.querySelectorAll(".koma")); }

function getSlotInputs() {
  // HTMLは .koma 内に .start .end .preset がある前提
  return komaEls().map(k => ({
    koma: k,
    start: k.querySelector(".start"),
    end: k.querySelector(".end"),
    preset: k.querySelector(".preset"),
  }));
}

// ===== Firebase/Firestore準備 =====
async function ensureFirebaseReady() {
  if (!window.db || !window.fb) {
    alert("Firebaseが初期化されていません（index.htmlのFirebaseブロックを確認）");
    throw new Error("Firebase not ready");
  }
  if (window.authReady) {
    await window.authReady; // 匿名ログイン完了待ち（ある場合）
  }
}

function hasRealtime() {
  return !!(window.fb && window.fb.onSnapshot);
}

// ===== Firestore操作 =====
function docIdOf(rec) {
  return String(rec.id);
}

async function upsertCloud(rec) {
  await ensureFirebaseReady();
  const { doc, setDoc } = window.fb;
  const ref = doc(window.db, CLOUD_COLLECTION, docIdOf(rec));
  await setDoc(ref, rec, { merge: true });
}

async function deleteCloud(id) {
  await ensureFirebaseReady();
  const { doc, deleteDoc } = window.fb;
  const ref = doc(window.db, CLOUD_COLLECTION, String(id));
  await deleteDoc(ref);
}

async function loadCloudOnce() {
  await ensureFirebaseReady();
  const { collection, getDocs } = window.fb;

  const snap = await getDocs(collection(window.db, CLOUD_COLLECTION));
  const arr = [];
  snap.forEach(d => arr.push(d.data()));

  // 日付降順（dateが無いと最後へ）
  arr.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  return arr;
}

async function startRealtime() {
  await ensureFirebaseReady();
  if (!hasRealtime()) return false;

  const { collection, onSnapshot } = window.fb;
  const ref = collection(window.db, CLOUD_COLLECTION);

  if (unsubRealtime) unsubRealtime();

  unsubRealtime = onSnapshot(ref, (snap) => {
    const arr = [];
    snap.forEach(d => arr.push(d.data()));
    arr.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    records = arr;
    localStorage.setItem(CACHE_KEY, JSON.stringify(records));
    renderHistory();
  }, (err) => {
    console.warn(err);
  });

  return true;
}

// ===== プリセット設定 =====
function setupPresets() {
  const slots = getSlotInputs();

  slots.forEach(({ preset, start, end }) => {
    if (!preset) return;

    preset.innerHTML = "";
    PRESETS.forEach(p => {
      const opt = document.createElement("option");
      opt.value = JSON.stringify({ start: p.start, end: p.end });
      opt.textContent = p.label;
      preset.appendChild(opt);
    });

    preset.addEventListener("change", () => {
      try {
        const v = JSON.parse(preset.value || "{}");
        if (start) start.value = v.start || "";
        if (end) end.value = v.end || "";
        calcAndShow();
      } catch {}
    });
  });
}

// ===== 勤務地自動入力 =====
function applyPlaceDefaults() {
  const place = $id("place")?.value || "";
  const def = PLACE_DEFAULTS[place];
  const slots = getSlotInputs();

  if (def && def.slots) {
    slots.forEach((s, i) => {
      const d = def.slots[i] || { start: "", end: "" };
      if (s.start) s.start.value = d.start || "";
      if (s.end) s.end.value = d.end || "";
      if (s.preset) s.preset.selectedIndex = 0;
    });
  }

  const transportEl = $id("transport");
  if (transportEl) {
    transportEl.value = String(def?.transport ?? 0);
  }

  calcAndShow();
}

// ===== 計算 =====
function calcRecordFromUI() {
  const date = $id("date")?.value || "";
  const place = $id("place")?.value || "";

  const allowance = Number($id("allowance")?.value || 0);
  const transport = Number($id("transport")?.value || 0);
  const hourly = Number($id("hourly")?.value || 0);

  const slots = getSlotInputs().map(({ start, end }) => {
    const s = (start?.value || "").trim();
    const e = (end?.value || "").trim();
    const minutes = diffMinutes(s, e);
    return { start: s, end: e, minutes };
  });

  const totalMinutes = slots.reduce((sum, x) => sum + (x.minutes || 0), 0);
  const wageAmount = Math.round((totalMinutes / 60) * hourly);
  const grandTotal = wageAmount + allowance + transport;

  const id = Date.now(); // 保存時にdocIdとして使う（ユニークでOK）

  return {
    id,
    date,
    place,
    hourly,
    allowance,
    transport,
    slots,
    totalMinutes,
    wageAmount,
    grandTotal,
    createdAt: new Date().toISOString(),
    createdBy: window.currentUid || "",
  };
}

function calcAndShow() {
  const r = calcRecordFromUI();
  lastCalcRecord = r;

  if ($id("workMinutes")) $id("workMinutes").textContent = String(r.totalMinutes);
  if ($id("wageAmount")) $id("wageAmount").textContent = String(r.wageAmount);
  if ($id("grandTotal")) $id("grandTotal").textContent = String(r.grandTotal);
}

// ===== 保存 =====
async function saveRecord() {
  calcAndShow();
  const r = lastCalcRecord;

  if (!r.date) return alert("勤務日を入れてください");
  if (!r.place) return alert("勤務地を選んでください");
  if (r.totalMinutes <= 0) return alert("勤務時間が0分です（出勤/退勤を入れてください）");

  // Firestore保存
  try {
    await upsertCloud(r);
  } catch (e) {
    console.error(e);
    alert("クラウド保存に失敗しました（Firebase設定/電波/ルールを確認）");
    return;
  }

  // リアルタイムが無い場合は再取得
  if (!hasRealtime()) {
    try {
      records = await loadCloudOnce();
      localStorage.setItem(CACHE_KEY, JSON.stringify(records));
      renderHistory();
    } catch (e) {
      console.warn(e);
    }
  }

  alert("保存しました（クラウド）");
}

// ===== 入力クリア =====
function clearInputs() {
  // 手当/交通費は0に戻す（交通費は勤務地の自動入力で入る）
  if ($id("allowance")) $id("allowance").value = "0";

  // 時間クリア → 勤務地デフォルトをもう一度入れる
  getSlotInputs().forEach(({ start, end, preset }) => {
    if (start) start.value = "";
    if (end) end.value = "";
    if (preset) preset.selectedIndex = 0;
  });

  applyPlaceDefaults();
}

// ===== 履歴表示 =====
function renderHistory() {
  const body = $id("historyBody");
  if (!body) return;

  body.innerHTML = "";

  if (!records || records.length === 0) {
    body.innerHTML = `<tr><td colspan="5">履歴がありません</td></tr>`;
    return;
  }

  records.forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${escapeHtml(r.date || "")}</td>
      <td>${escapeHtml(r.place || "")}</td>
      <td style="text-align:right;">${escapeHtml(String(r.grandTotal ?? 0))}</td>
      <td><button class="btn ghost btn-detail" data-id="${r.id}">表示</button></td>
      <td><button class="btn danger ghost btn-del" data-id="${r.id}">削除</button></td>
    `;

    const tr2 = document.createElement("tr");
    tr2.style.display = "none";
    const detail = makeDetailHtml(r);
    tr2.innerHTML = `<td colspan="5" style="text-align:left; padding:10px;">${detail}</td>`;

    body.appendChild(tr);
    body.appendChild(tr2);

    tr.querySelector(".btn-detail")?.addEventListener("click", () => {
      const open = tr2.style.display !== "none";
      tr2.style.display = open ? "none" : "table-row";
      tr.querySelector(".btn-detail").textContent = open ? "表示" : "閉じる";
    });

    tr.querySelector(".btn-del")?.addEventListener("click", async () => {
      if (!confirm("この履歴を削除しますか？")) return;

      try {
        await deleteCloud(r.id);
      } catch (e) {
        console.error(e);
        alert("クラウド削除に失敗しました");
        return;
      }

      if (!hasRealtime()) {
        records = records.filter(x => x.id !== r.id);
        localStorage.setItem(CACHE_KEY, JSON.stringify(records));
        renderHistory();
      }
    });
  });
}

function makeDetailHtml(r) {
  const lines = (r.slots || []).map((s, i) => {
    const m = Number(s.minutes || 0);
    const hm = toHm(m);
    const label = `${i + 1}コマ：${s.start || "--:--"}〜${s.end || "--:--"}（${hm.h}時間${hm.m}分）`;
    return `・${escapeHtml(label)}`;
  });

  return `
    <div class="small">
      ${lines.join("<br>")}
      <br><br>
      勤務合計：${escapeHtml(String(r.totalMinutes ?? 0))} 分<br>
      時給：${escapeHtml(String(r.hourly ?? 0))} 円<br>
      時給分：${escapeHtml(String(r.wageAmount ?? 0))} 円<br>
      手当：${escapeHtml(String(r.allowance ?? 0))} 円<br>
      交通費：${escapeHtml(String(r.transport ?? 0))} 円<br>
      <strong>合計：${escapeHtml(String(r.grandTotal ?? 0))} 円</strong>
    </div>
  `;
}

// ===== 管理者チェック =====
function checkAdmin() {
  const pass = $id("adminPass")?.value || "";
  if (pass !== ADMIN_PASS) {
    alert("管理者パスワードが違います");
    return false;
  }
  return true;
}

// ===== CSV出力（管理者のみ・共有対応）=====
async function exportCSV() {
  if (!checkAdmin()) return;

  // 最新を1回取り直す（確実に全件）
  let arr = records;
  try {
    arr = await loadCloudOnce();
  } catch (e) {
    console.warn(e);
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

  const rows = arr.map(r => {
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

  const content = "\ufeff" + csv; // Excel文字化け対策
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });

  const filename = `kintai_${new Date().toISOString().slice(0,10)}.csv`;
  await shareOrDownloadFile(filename, "text/csv", blob);
}

// ===== PDF出力（管理者のみ・日本語・共有対応）=====
async function exportPDF() {
  if (!checkAdmin()) return;

  // 最新を1回取り直す
  let arr = records;
  try {
    arr = await loadCloudOnce();
  } catch (e) {
    console.warn(e);
  }

  const { jsPDF } = window.jspdf || {};
  if (!jsPDF) {
    alert("jsPDFが読み込まれていません（index.htmlにjsPDFを入れてください）");
    return;
  }

  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

  // 日本語フォント（NotoSansJP）
  try {
    doc.setFont("NotoSansJP-Regular", "normal");
  } catch {
    alert("日本語フォントが読み込まれていません（NotoSansJPのscriptを確認）");
    return;
  }

  const today = new Date().toISOString().slice(0, 10);

  let y = 15;
  doc.setFontSize(16);
  doc.text("講師勤怠一覧", 105, y, { align: "center" });

  y += 10;
  doc.setFontSize(10);
  doc.text(`出力日：${today}`, 14, y);

  y += 8;
  doc.setFontSize(11);
  doc.text("勤務日", 14, y);
  doc.text("勤務地", 60, y);
  doc.text("合計（円）", 190, y, { align: "right" });

  y += 4;
  doc.line(14, y, 196, y);
  y += 6;

  doc.setFontSize(10);
  for (const r of arr) {
    if (y > 280) {
      doc.addPage();
      doc.setFont("NotoSansJP-Regular", "normal");
      y = 15;
    }
    doc.text(String(r.date || ""), 14, y);
    doc.text(String(r.place || ""), 60, y);
    doc.text(String(r.grandTotal ?? 0), 190, y, { align: "right" });
    y += 6;
  }

  const blob = doc.output("blob");
  const filename = `勤怠一覧_${today}.pdf`;
  await shareOrDownloadFile(filename, "application/pdf", blob);
}

// ===== 共有 or ダウンロード（スマホ最強）=====
async function shareOrDownloadFile(filename, mime, blob) {
  const file = new File([blob], filename, { type: mime });

  if (navigator.canShare && navigator.canShare({ files: [file] }) && navigator.share) {
    await navigator.share({ files: [file], title: filename });
    return;
  }

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// ===== 全削除（履歴）=====
async function clearAllHistory() {
  // 安全のため：今は「全削除」はローカルUIだけ（クラウド全消しは危険）
  // 必要なら「管理者だけクラウド全削除」も実装できます。
  if (!confirm("画面の表示をクリアします（クラウドのデータは消しません）。よろしいですか？")) return;
  records = [];
  localStorage.removeItem(CACHE_KEY);
  renderHistory();
}

// ===== 初期化 =====
window.addEventListener("load", async () => {
  // 日付を今日に
  const dateEl = $id("date");
  if (dateEl && !dateEl.value) dateEl.value = new Date().toISOString().slice(0, 10);

  // プリセットを作る
  setupPresets();

  // 勤務地変更で自動入力
  $id("place")?.addEventListener("change", applyPlaceDefaults);

  // 入力変更で再計算
  ["allowance","transport","hourly","date"].forEach(id => {
    $id(id)?.addEventListener("input", calcAndShow);
    $id(id)?.addEventListener("change", calcAndShow);
  });
  getSlotInputs().forEach(({ start, end }) => {
    start?.addEventListener("change", calcAndShow);
    end?.addEventListener("change", calcAndShow);
  });

  // ボタン
  $id("btnCalc")?.addEventListener("click", calcAndShow);
  $id("btnSave")?.addEventListener("click", saveRecord);
  $id("btnClear")?.addEventListener("click", clearInputs);
  $id("btnClearAll")?.addEventListener("click", clearAllHistory);

  $id("btnExportCSV")?.addEventListener("click", exportCSV);
  $id("btnExportPDF")?.addEventListener("click", exportPDF);

  // まず勤務地デフォルト適用（自動入力）
  applyPlaceDefaults();

  // キャッシュ表示（すぐ見えるように）
  try {
    const cache = JSON.parse(localStorage.getItem(CACHE_KEY) || "[]");
    if (Array.isArray(cache) && cache.length) {
      records = cache;
      renderHistory();
    }
  } catch {}

  // クラウド表示（本番）
  try {
    const started = await startRealtime();
    if (!started) {
      records = await loadCloudOnce();
      localStorage.setItem(CACHE_KEY, JSON.stringify(records));
      renderHistory();
    }
  } catch (e) {
    console.warn("cloud load failed:", e);
    // オフライン等はキャッシュのまま
  }

  // 初回計算
  calcAndShow();
});
