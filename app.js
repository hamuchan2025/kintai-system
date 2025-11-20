/* ========= 共通ユーティリティ ========= */

// 数字を「1,234」形式に
function fmt(n) {
  const num = Number(n);
  if (!isFinite(num)) return "0";
  return num.toLocaleString("ja-JP");
}

// "HH:MM" → 分
function timeToMinutes(t) {
  if (!t) return null;
  const parts = t.split(":");
  if (parts.length !== 2) return null;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(h) || isNaN(m)) return null;
  return h * 60 + m;
}

// 分差分
function diffMinutes(start, end) {
  const s = timeToMinutes(start);
  const e = timeToMinutes(end);
  if (s == null || e == null) return 0;
  const d = e - s;
  return d > 0 ? d : 0;
}

// 分 → {h, m}
function toHm(mins) {
  const m = Math.max(0, mins | 0);
  return { h: Math.floor(m / 60), m: m % 60 };
}

/* ========= データ管理 ========= */

const STORAGE_KEY = "kintai_main_records";
let records = [];      
let lastRecord = null; 
let editingId = null;  

/* ========= 初期処理 ========= */

window.addEventListener("load", () => {

  const dateEl = document.getElementById("date");
  if (dateEl && !dateEl.value) {
    dateEl.value = new Date().toISOString().slice(0, 10);
  }

  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    try {
      const data = JSON.parse(saved);
      records = Array.isArray(data) ? data : [];
    } catch {
      records = [];
    }
  }

  const hourly = document.getElementById("hourly");
  const hourlyDisp = document.getElementById("hourlyDisplay");
  if (hourly && hourlyDisp) {
    hourlyDisp.textContent = `${fmt(hourly.value)} 円`;
    hourly.addEventListener("input", () => {
      hourlyDisp.textContent = `${fmt(hourly.value)} 円`;
    });
  }

  setupTimePresets();
  setupPlaceDefaults();
  renderHistory();
});

/* ========= プリセット ========= */

function setupTimePresets() {
  [1, 2, 3, 4, 5].forEach(i => {
    const sp = document.getElementById(`s${i}-preset`);
    const si = document.getElementById(`s${i}`);
    if (sp && si) {
      sp.addEventListener("change", () => {
        if (sp.value) si.value = sp.value;
      });
    }

    const ep = document.getElementById(`e${i}-preset`);
    const ei = document.getElementById(`e${i}`);
    if (ep && ei) {
      ep.addEventListener("change", () => {
        if (ep.value) ei.value = ep.value;
      });
    }
  });
}

/* ========= 勤務地デフォルト ========= */

function setupPlaceDefaults() {

  const defaults = {
    "寺津(土)": { s1:"08:45",e1:"10:15", s2:"10:30",e2:"12:00", s3:"13:00",e3:"14:30", s4:"14:45",e4:"16:15" },
    "寺津(水)": { s1:"16:45",e1:"18:15" },
    "安城":     { s1:"08:45",e1:"10:15", s2:"10:30",e2:"12:00", s3:"13:00",e3:"14:30", s4:"14:45",e4:"16:15" },
    "お城下":   { s1:"09:15",e1:"10:45", s2:"11:00",e2:"12:30", s3:"13:30",e3:"15:00", s4:"15:15",e4:"16:45" },
    "碧南":     { s1:"09:15",e1:"10:45", s2:"11:00",e2:"12:30" }
  };

  const fare = {
    "寺津(土)": 60,
    "寺津(水)": 60,
    "安城": 220,
    "お城下": 80,
    "碧南": 160
  };

  function applyDefaults() {
    const placeEl = document.getElementById("place");
    const p = placeEl.value;
    const d = defaults[p] || {};

    for (let i = 1; i <= 5; i++) {
      document.getElementById(`s${i}`).value = d[`s${i}`] || "";
      document.getElementById(`e${i}`).value = d[`e${i}`] || "";
    }

    document.getElementById("transport").value = fare[p] ?? "";

    // ★ 安城のときだけ特別手当表示
    const specialBox = document.getElementById("specialBonusBox");
    specialBox.style.display = (p === "安城") ? "block" : "none";
  }

  document.getElementById("place").addEventListener("change", applyDefaults);
  applyDefaults();
}

/* ========= 5コマ計算 ========= */

function calcDay() {
  const hourly = Number(document.getElementById("hourly").value || 0);
  const transport = Number(document.getElementById("transport").value || 0);
  const place = document.getElementById("place").value;

  let totalMin = 0;
  const details = [];
  let extraSum = 0;
  const extraPerSlot = [];

  // 通常手当（extra1〜extra5）
  for (let i = 1; i <= 5; i++) {
    const ex = Number(document.getElementById("extra" + i).value || 0);
    extraPerSlot.push(ex);
    extraSum += ex;
  }

  // ★ 特別手当（安城の場合のみ 2,625円）
  const specialBonus = (place === "安城") ? 2625 : 0;

  let detailHtml = "";

  for (let i = 1; i <= 5; i++) {
    const s = document.getElementById("s" + i).value;
    const e = document.getElementById("e" + i).value;
    if (!s || !e) continue;

    const diff = diffMinutes(s, e);
    if (!diff) continue;

    totalMin += diff;
    const hm = toHm(diff);

    const perBase = Math.round((diff / 60) * hourly);
    const perTotal = perBase + extraPerSlot[i - 1];

    detailHtml += `【${i}コマ】 ${s}〜${e}（${hm.h}時間${hm.m}分） ／ 手当込み：${fmt(perTotal)}円<br>`;

    details.push({ index: i, start: s, end: e, diffMin: diff });
  }

  const totalHm = toHm(totalMin);
  const baseSalary = Math.round((totalMin / 60) * hourly);

  const totalSalary = baseSalary + extraSum + specialBonus + transport;

  const date = document.getElementById("date").value;

  const id = editingId != null ? editingId : Date.now();

  lastRecord = {
    id,
    place,
    date,
    totalMin,
    baseSalary,
    extraSum,             // ★通常手当
    specialBonus,         // ★特別手当
    transport,
    totalSalary,
    extraPerSlot,
    detailsList: details,
    hourly
  };

  const specialLine = (specialBonus > 0)
    ? `特別手当：${fmt(specialBonus)} 円<br>`
    : "";

  document.getElementById("result").innerHTML =
    `<strong>【勤務日】</strong>${date}<br>` +
    `<strong>【勤務地】</strong>${place}<br><br>` +
    `<strong>【時間内訳】</strong><br>${detailHtml}<br>` +
    `勤務：${totalHm.h}時間${totalHm.m}分<br>` +
    `基本給：${fmt(baseSalary)} 円<br>` +
    `通常手当合計：${fmt(extraSum)} 円<br>` +
    specialLine +
    `交通費：${fmt(transport)} 円<br>` +
    `<strong>日給：${fmt(totalSalary)} 円</strong>`;
}

/* ========= 履歴登録 ========= */

function addHistory() {
  if (!lastRecord) {
    alert("先に計算してください");
    return;
  }

  if (editingId == null) {
    records.push(lastRecord);
  } else {
    const idx = records.findIndex(r => r.id === editingId);
    if (idx >= 0) records[idx] = lastRecord;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  editingId = null;
  lastRecord = null;

  document.getElementById("result").textContent = "ここに計算結果が表示されます";

  renderHistory();
}

/* ========= 履歴表示 ========= */

function renderHistory() {
  const historyDiv = document.getElementById("history");
  const totalDiv = document.getElementById("total-sum");

  historyDiv.innerHTML = "";
  let sum = 0;

  const sorted = [...records].sort((a, b) =>
    (b.date || "").localeCompare(a.date || "")
  );

  sorted.forEach(r => {
    const wrap = document.createElement("div");
    wrap.className = "history-item";

    const hm = toHm(r.totalMin);

    let detail = "";
    r.detailsList.forEach(d => {
      const hm2 = toHm(d.diffMin);
      const perBase = Math.round((d.diffMin / 60) * r.hourly);
      const perExtra = r.extraPerSlot[d.index - 1] || 0;
      const perTotal = perBase + perExtra;

      detail += `・${d.index}コマ：${d.start}〜${d.end}（${hm2.h}時間${hm2.m}分） ／ 手当込み：${fmt(perTotal)}円<br>`;
    });

    const specialLine = r.specialBonus
      ? `特別手当：${fmt(r.specialBonus)} 円<br>`
      : "";

    const dayTotal = r.baseSalary + r.extraSum + r.specialBonus + r.transport;

    wrap.innerHTML =
      `<div>` +
        `<input type="checkbox" class="delete-check" data-id="${r.id}">` +
        `<strong>${r.place}</strong> ｜ ${r.date}` +
        `<span class="edit-link" data-id="${r.id}" style="margin-left:6px; color:#06c; cursor:pointer; font-size:0.8rem;">編集</span>` +
      `</div>` +
      detail +
      `勤務：${hm.h}時間${hm.m}分<br>` +
      `基本給：${fmt(r.baseSalary)} 円<br>` +
      `通常手当合計：${fmt(r.extraSum)} 円<br>` +
      specialLine +
      `交通費：${fmt(r.transport)} 円<br>` +
      `<strong>日給：${fmt(dayTotal)} 円</strong>`;

    historyDiv.appendChild(wrap);
    sum += dayTotal;
  });

  totalDiv.innerHTML = `<strong>月合計：</strong> ${fmt(sum)} 円`;

  if (records.length > 0) {
    const btn = document.createElement("button");
    btn.textContent = "選択した履歴を削除";
    btn.className = "btn-sub";
    btn.onclick = deleteSelectedRecords;
    historyDiv.appendChild(btn);
  }

  document.querySelectorAll(".edit-link").forEach(link => {
    link.addEventListener("click", () => startEdit(Number(link.dataset.id)));
  });
}

/* ========= 履歴削除 ========= */

function deleteSelectedRecords() {
  const checks = document.querySelectorAll(".delete-check");
  const ids = [];
  checks.forEach(c => { if (c.checked) ids.push(Number(c.dataset.id)); });

  records = records.filter(r => !ids.includes(r.id));
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  renderHistory();
}

/* ========= 編集 ========= */

function startEdit(id) {
  const rec = records.find(r => r.id === id);
  if (!rec) return;

  editingId = id;

  document.getElementById("date").value = rec.date;
  document.getElementById("place").value = rec.place;
  document.getElementById("place").dispatchEvent(new Event("change"));

  rec.detailsList.forEach(d => {
    document.getElementById(`s${d.index}`).value = d.start;
    document.getElementById(`e${d.index}`).value = d.end;
  });

  rec.extraPerSlot.forEach((v, i) => {
    document.getElementById(`extra${i + 1}`).value = v;
  });

  document.getElementById("transport").value = rec.transport;

  document.getElementById("result").textContent =
    "編集モードです。「5コマを計算する」→「履歴に登録」で上書き保存されます。";
}
