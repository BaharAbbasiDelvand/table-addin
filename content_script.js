// content_script.js

let pickMode = false;
let lastHighlighted = null;
let savedTables = [];
let currentEmail = "";

(async function init() {
  // get email from background (service worker)
  chrome.runtime.sendMessage({ type: "EMAIL_GET" }, (resp) => {
    currentEmail = resp?.email || "";
    restoreSaved();
    renderToolbar();
  });
})();

function renderToolbar() {
  // remove old toolbar (prevents duplicate listeners)
  const existing = document.getElementById("tableBridgeToolbar");
  if (existing) existing.remove();

  const bar = document.createElement("div");
  bar.id = "tableBridgeToolbar";
  bar.style.position = "fixed";
  bar.style.top = "20px";
  bar.style.right = "20px";
  bar.style.background = "#1f2937";
  bar.style.color = "#fff";
  bar.style.padding = "8px 10px";
  bar.style.borderRadius = "8px";
  bar.style.zIndex = "2147483647";
  bar.style.boxShadow = "0 6px 16px rgba(0,0,0,.25)";
  bar.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  bar.style.display = "flex";
  bar.style.alignItems = "center";
  bar.style.gap = "8px";
  bar.style.flexWrap = "wrap";

  if (!currentEmail) {
    bar.innerHTML = `
      <span style="font-size:13px;opacity:.9">Enter email to begin:</span>
      <input id="tbEmailInput" type="email" placeholder="you@example.com"
             style="padding:6px 8px;border-radius:6px;border:1px solid #374151;background:#111827;color:#fff;outline:none;min-width:220px"/>
      <button id="tbEmailSave" style="background:#2563eb;border:0;color:#fff;padding:6px 10px;border-radius:6px;cursor:pointer">Save</button>
      <span id="tbStatus" class="tg-status" style="font-size:12px;opacity:.9"></span>
    `;
    document.body.appendChild(bar);

    const input = document.getElementById("tbEmailInput");
    const save = document.getElementById("tbEmailSave");
    setStatus("Email required.");

    function trySave() {
      const email = String(input.value || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        setStatus("Please enter a valid email.");
        return;
      }
      chrome.runtime.sendMessage({ type: "EMAIL_SET", email }, (resp) => {
        if (resp?.ok) {
          currentEmail = resp.email;
          renderToolbar(); // re-render now showing the buttons
        } else {
          setStatus(resp?.error || "Failed to save.");
        }
      });
    }

    save.addEventListener("click", trySave);
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") trySave(); });
    input.focus();
    return;
  }

  bar.innerHTML = `
    <button id="tbPickBtn"   style="background:#2563eb;border:0;color:#fff;padding:6px 10px;border-radius:6px;cursor:pointer">Pick Table → Next.js</button>
    <button id="tbInjectBtn" style="background:#2563eb;border:0;color:#fff;padding:6px 10px;border-radius:6px;cursor:pointer">Inject from Next.js</button>
    <button id="tbExportBtn" style="background:#2563eb;border:0;color:#fff;padding:6px 10px;border-radius:6px;cursor:pointer">Download JSON</button>
    <span id="tbStatus" class="tg-status" style="font-size:12px;opacity:.9"></span>
    <span id="tbEmailEdit" title="Change email" style="font-size:12px;opacity:.8;text-decoration:underline;cursor:pointer">(${currentEmail})</span>
  `;
  document.body.appendChild(bar);

  document.getElementById("tbPickBtn").addEventListener("click", startPickMode);
  document.getElementById("tbInjectBtn").addEventListener("click", requestInjectFromNext);
  document.getElementById("tbExportBtn").addEventListener("click", exportLocalJSON);
  document.getElementById("tbEmailEdit").addEventListener("click", () => {
    currentEmail = ""; // force email mode
    renderToolbar();
  });

  updateStatusWithCounts();
}

function setStatus(msg) {
  const s = document.getElementById("tbStatus");
  if (s) s.textContent = msg || "";
}
function updateStatusWithCounts() {
  const base = currentEmail ? `Email: ${currentEmail}` : "Email: (not set)";
  setStatus(savedTables.length ? `${base} — Saved: ${savedTables.length}` : base);
}

function restoreSaved() {
  chrome.storage.local.get({ tableBridge_saved: [] }, ({ tableBridge_saved }) => {
    savedTables = Array.isArray(tableBridge_saved) ? tableBridge_saved : [];
  });
}
function persistSaved() {
  chrome.storage.local.set({ tableBridge_saved: savedTables });
}

function startPickMode() {
  if (pickMode) return;
  if (!currentEmail) { renderToolbar(); return; } // show email mode
  pickMode = true;
  setStatus("Pick mode: hover a table and click");
  document.body.style.cursor =
    "url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2232%22 height=%2232%22><text y=%2222%22 font-size=%2224%22>➤</text></svg>') 0 0, auto";
  document.addEventListener("mousemove", highlightTable);
  document.addEventListener("click", captureTable, { capture: true });
  document.addEventListener("keydown", escToCancel, { capture: true });
}
function stopPickMode() {
  pickMode = false;
  document.body.style.cursor = "auto";
  if (lastHighlighted) { lastHighlighted.classList.remove("tableBridgeHighlight"); lastHighlighted = null; }
  document.removeEventListener("mousemove", highlightTable);
  document.removeEventListener("click", captureTable, { capture: true });
  document.removeEventListener("keydown", escToCancel, { capture: true });
}
function escToCancel(e) {
  if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); setStatus("Cancelled"); stopPickMode(); }
}
function highlightTable(e) {
  if (!pickMode) return;
  const hovered = e.target.closest?.("table");
  if (hovered !== lastHighlighted) {
    if (lastHighlighted) lastHighlighted.classList.remove("tableBridgeHighlight");
    if (hovered) hovered.classList.add("tableBridgeHighlight");
    lastHighlighted = hovered || null;
  }
}

async function captureTable(e) {
  if (!pickMode) return;
  e.preventDefault();
  e.stopPropagation();

  let table = (lastHighlighted && lastHighlighted.isConnected) ? lastHighlighted : null;
  if (!table && typeof document.elementFromPoint === "function") {
    const el = document.elementFromPoint(e.clientX, e.clientY);
    table = el?.closest?.("table") || null;
  }

  if (table) {
    const json = parseTable(table);
    json.email = currentEmail;

    savedTables.push(json);
    persistSaved();
    updateStatusWithCounts();
    setStatus(`Email: ${currentEmail} — Saved: ${savedTables.length} — sending…`);

    chrome.runtime.sendMessage(
      { type: "TABLE_CAPTURED", payload: json },
      (resp) => {
        setStatus(resp?.ok
          ? `Email: ${currentEmail} — Saved: ${savedTables.length} — Sent ✅`
          : `Send failed: ${resp?.error || "unknown"}`
        );
      }
    );
  } else {
    setStatus("No table here");
  }

  stopPickMode();
}

function parseTable(table) {
  let headers = [];
  const headerRow = table.querySelector("thead tr") || table.querySelector("tr");
  if (headerRow) {
    headers = Array.from(headerRow.querySelectorAll("th,td")).map(
      (c) => (c.textContent || "").trim()
    );
  }

  const rows = [];
  const bodyRows = table.querySelectorAll("tbody tr");
  const trs = bodyRows.length ? bodyRows : table.querySelectorAll("tr");
  trs.forEach((tr, idx) => {
    if (idx === 0 && headers.length && tr.querySelectorAll("th").length) return;
    const cells = Array.from(tr.querySelectorAll("td,th")).map(
      (td) => (td.textContent || "").trim()
    );
    if (cells.length) rows.push(cells);
  });

  return { headers, rows, url: location.href, capturedAt: new Date().toISOString() };
}

function requestInjectFromNext() {
  if (!currentEmail) { renderToolbar(); return; }
  setStatus("Fetching from Next.js…");
  chrome.runtime.sendMessage({ type: "FETCH_AND_INJECT" }, (resp) => {
    setStatus(resp?.ok ? "Injected ✅" : `Inject failed: ${resp?.error || "unknown"}`);
  });
}

function exportLocalJSON() {
  if (!savedTables.length) { setStatus("No saved tables"); return; }
  const blob = new Blob([JSON.stringify(savedTables, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "tables.json";
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  setStatus(`Downloaded (${savedTables.length})`);
}

chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
  if (msg?.type === "EMAIL_UPDATED") {
    currentEmail = msg.email || "";
    renderToolbar();
  }
  if (msg?.type === "INJECT_DATA") {
    try {
      const data = msg.payload;
      let table = document.querySelector("table");
      if (!table) {
        table = document.createElement("table");
        table.style.borderCollapse = "collapse";
        table.style.margin = "12px 0";
        table.style.width = "100%";
        document.body.prepend(table);
      }
      table.innerHTML = "";

      if (Array.isArray(data.headers) && data.headers.length) {
        const thead = document.createElement("thead");
        const tr = document.createElement("tr");
        data.headers.forEach((h) => {
          const th = document.createElement("th");
          th.textContent = String(h);
          th.style.border = "1px solid #ccc";
          th.style.padding = "4px";
          tr.appendChild(th);
        });
        thead.appendChild(tr);
        table.appendChild(thead);
      }

      const tbody = document.createElement("tbody");
      (data.rows || []).forEach((row) => {
        const tr = document.createElement("tr");
        row.forEach((c) => {
          const td = document.createElement("td");
          td.textContent = String(c);
          td.style.border = "1px solid #eee";
          td.style.padding = "4px";
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);

      setStatus("Injected ✅");
    } catch {
      setStatus("Inject error");
    }
  }
});
