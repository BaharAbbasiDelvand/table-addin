(function () {
  if (document.getElementById("tableBridgeToolbar")) return;

  const bar = document.createElement("div");
  bar.id = "tableBridgeToolbar";
  bar.innerHTML = `
    <button id="tbPickBtn">Pick Table → Next.js</button>
    <button id="tbInjectBtn">Inject from Next.js</button>
    <button id="tbExportBtn">Download JSON</button>
    <span class="tg-status" id="tbStatus"></span>
  `;
  document.body.appendChild(bar);

  document.getElementById("tbPickBtn").addEventListener("click", startPickMode);
  document.getElementById("tbInjectBtn").addEventListener("click", requestInjectFromNext);
  document.getElementById("tbExportBtn").addEventListener("click", exportLocalJSON);

  // warm-load any previously saved captures
  chrome.storage.local.get({ tableBridge_saved: [] }, ({ tableBridge_saved }) => {
    savedTables = Array.isArray(tableBridge_saved) ? tableBridge_saved : [];
    setStatus(savedTables.length ? `Saved: ${savedTables.length}` : "");
  });
})();

let pickMode = false;
let lastHighlighted = null;
let savedTables = []; 

// small helpers
function setStatus(msg) {
  const s = document.getElementById("tbStatus");
  if (s) s.textContent = msg || "";
}
function persist() {
  chrome.storage.local.set({ tableBridge_saved: savedTables });
}

function startPickMode() {
  if (pickMode) return;
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
  // keep whatever status we last set (helps show counts)
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
function captureTable(e) {
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
    // save locally for Download JSON
    savedTables.push(json);
    persist();
    setStatus(`Saved: ${savedTables.length} — sending…`);

    // also send to Next.js as before
    chrome.runtime.sendMessage(
      { type: "TABLE_CAPTURED", payload: json },
      (resp) => { setStatus(resp?.ok ? `Saved: ${savedTables.length} — Sent ✅` : `Send failed: ${resp?.error || "unknown"}`); }
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
  setStatus("Fetching from Next.js…");
  chrome.runtime.sendMessage({ type: "FETCH_AND_INJECT" }, (resp) => {
    setStatus(resp?.ok ? "Injected ✅" : `Inject failed: ${resp?.error || "unknown"}`);
  });
}

function exportLocalJSON() {
  if (!savedTables.length) {
    setStatus("No saved tables");
    return;
  }
  const blob = new Blob([JSON.stringify(savedTables, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tables.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 3000);
  setStatus(`Downloaded (${savedTables.length})`);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "INJECT_DATA") {
    try {
      const data = msg.payload; // { headers, rows }
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
      sendResponse({ ok: true });
    } catch (e) {
      setStatus("Inject error");
      sendResponse({ ok: false, error: String(e) });
    }
    return true;
  }
});
