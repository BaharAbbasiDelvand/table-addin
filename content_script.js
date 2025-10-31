let pickMode = false;
let lastHighlighted = null;
let savedTables = [];
let currentEmail = "";
//minimize support
const MIN_KEY = "tableBridge_minimized";
const minStore = chrome.storage?.session || chrome.storage.local;
let toolbarMinimized = false;

async function loadMinState() {
    try {
        const got = await minStore.get(MIN_KEY);
        toolbarMinimized = !!got?.[MIN_KEY];
    } catch {
        toolbarMinimized = false;
    }
}
async function setMinState(next) {
    toolbarMinimized = !!next;
    try {
        await minStore.set({ [MIN_KEY]: toolbarMinimized });
    } catch {}
    renderToolbar();
}

(async function init() {
    await loadMinState();
    // get email from background (service worker)
    chrome.runtime.sendMessage({ type: "EMAIL_GET" }, (resp) => {
        currentEmail = resp?.email || "";
        restoreSaved();

        renderToolbar();
    });
})();
// CSS for highlighted table
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
    bar.style.fontFamily =
        "system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    bar.style.display = "flex";
    bar.style.alignItems = "center";
    bar.style.gap = "8px";
    bar.style.flexWrap = "wrap";
    // minimize toggle button (simple header control)
    const minBtn = document.createElement("button");
    minBtn.id = "tbMinToggle";
    minBtn.textContent = toolbarMinimized ? "+" : "–";
    minBtn.title = toolbarMinimized ? "Expand" : "Minimize";
    Object.assign(minBtn.style, {
        background: "#374151",
        border: "0",
        color: "#fff",
        padding: "2px 8px",
        borderRadius: "6px",
        cursor: "pointer",
        fontSize: "14px",
    });
    minBtn.addEventListener("click", () => setMinState(!toolbarMinimized));

    // title

    const title = document.createElement("span");
    title.textContent = toolbarMinimized
        ? `M4H (${savedTables.length || 0})`
        : " ";
    title.style.fontSize = "13px";
    title.style.opacity = ".95";
    title.style.fontWeight = "600";
    const headerRow = document.createElement("div");
    headerRow.style.display = "flex";
    headerRow.style.alignItems = "center";
    headerRow.style.gap = "8px";
    headerRow.appendChild(title);
    headerRow.appendChild(minBtn);

    bar.appendChild(headerRow);
    if (toolbarMinimized) {
        bar.style.padding = "2px 6px";
        bar.style.gap = "4px";
        bar.style.flexWrap = "nowrap";
        title.style.fontSize = "12px";
        minBtn.style.padding = "0 6px";
    }

    if (!currentEmail) {
        const row = document.createElement("div");
        row.style.display = toolbarMinimized ? "none" : "flex";
        row.style.alignItems = "center";
        row.style.gap = "8px";
        row.style.flexWrap = "wrap";

        const prompt = document.createElement("span");
        prompt.style.fontSize = "13px";
        prompt.style.opacity = ".9";
        prompt.textContent = "Enter email to begin:";

        const input = document.createElement("input");
        input.id = "tbEmailInput";
        input.type = "email";
        input.placeholder = "you@example.com";
        Object.assign(input.style, {
            padding: "6px 8px",
            borderRadius: "6px",
            border: "1px solid #374151",
            background: "#111827",
            color: "#fff",
            outline: "none",
            minWidth: "220px",
        });

        const save = document.createElement("button");
        save.id = "tbEmailSave";
        save.textContent = "Save";
        Object.assign(save.style, {
            background: "#2563eb",
            border: "0",
            color: "#fff",
            padding: "6px 10px",
            borderRadius: "6px",
            cursor: "pointer",
        });

        row.appendChild(prompt);
        row.appendChild(input);
        row.appendChild(save);

        // status (always visible)
        const status = document.createElement("span");
        status.id = "tbStatus";
        status.className = "tg-status";
        status.style.fontSize = "12px";
        status.style.opacity = ".9";
        status.style.marginLeft = "4px";
        if (toolbarMinimized) {
            controls.style.display = "none";
            status.style.display = "none";
        }
        bar.appendChild(row);
        bar.appendChild(status);
        document.body.appendChild(bar);

        // setup email save handlers
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
                    renderToolbar(); // re-render with buttons
                } else {
                    setStatus(resp?.error || "Failed to save.");
                }
            });
        }

        save.addEventListener("click", trySave);
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") trySave();
        });
        // if (toolbarMinimized) {
        //   row.style.display = "none";
        //   status.style.display = "none";
        // }
        if (!toolbarMinimized) input.focus();

        return;
    }

    // controls wrapper so we can hide/show it when minimized
    const controls = document.createElement("div");
    controls.id = "tbControls";
    controls.style.display = toolbarMinimized ? "none" : "flex";
    controls.style.alignItems = "center";
    controls.style.gap = "8px";
    controls.style.flexWrap = "wrap";

    controls.innerHTML = `
  <button id="tbPickBtn"   style="background:#2563eb;border:0;color:#fff;padding:6px 10px;border-radius:6px;cursor:pointer">Pick Table → Next.js</button>
  <button id="tbInjectBtn" style="background:#2563eb;border:0;color:#fff;padding:6px 10px;border-radius:6px;cursor:pointer">Inject from Next.js</button>
  <button id="tbExportBtn" style="background:#2563eb;border:0;color:#fff;padding:6px 10px;border-radius:6px;cursor:pointer">Download JSON</button>
  <span id="tbEmailEdit" title="Change email" style="font-size:12px;opacity:.8;text-decoration:underline;cursor:pointer">(${currentEmail})</span>
`;

    // status (keep visible when expanded; hide if minimized)
    const status = document.createElement("span");
    status.id = "tbStatus";
    status.className = "tg-status";
    status.style.fontSize = "12px";
    status.style.opacity = ".9";
    status.style.marginLeft = "4px";

    if (toolbarMinimized) {
        status.style.display = "none";
    }

    bar.appendChild(controls);
    bar.appendChild(status);
    document.body.appendChild(bar);

    document
        .getElementById("tbPickBtn")
        .addEventListener("click", startPickMode);
    document
        .getElementById("tbInjectBtn")
        .addEventListener("click", requestInjectFromNext);
    document
        .getElementById("tbExportBtn")
        .addEventListener("click", exportLocalJSON);
    document.getElementById("tbEmailEdit").addEventListener("click", () => {
        currentEmail = ""; // force email mode
        renderToolbar();
    });

    updateStatusWithCounts();

    // ultra-slim pill when minimized
    bar.style.padding = toolbarMinimized ? "2px 6px" : "8px 10px";
}
function setStatus(msg) {
    const s = document.getElementById("tbStatus");
    if (s) s.textContent = msg || "";
}
// update status with saved table counts
function updateStatusWithCounts() {
    const base = currentEmail ? `Email: ${currentEmail}` : "Email: (not set)";
    setStatus(
        savedTables.length ? `${base} — Saved: ${savedTables.length}` : base
    );
}
// load saved tables from storage
function restoreSaved() {
    chrome.storage.local.get(
        { tableBridge_saved: [] },
        ({ tableBridge_saved }) => {
            savedTables = Array.isArray(tableBridge_saved)
                ? tableBridge_saved
                : [];
        }
    );
}
// persist saved tables to storage
function persistSaved() {
    chrome.storage.local.set({ tableBridge_saved: savedTables });
}

function startPickMode() {
    if (pickMode) return;
    if (!currentEmail) {
        renderToolbar();
        return;
    } // show email mode
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
    if (lastHighlighted) {
        lastHighlighted.classList.remove("tableBridgeHighlight");
        lastHighlighted = null;
    }
    document.removeEventListener("mousemove", highlightTable);
    document.removeEventListener("click", captureTable, { capture: true });
    document.removeEventListener("keydown", escToCancel, { capture: true });
}
function escToCancel(e) {
    if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setStatus("Cancelled");
        stopPickMode();
    }
}
function highlightTable(e) {
    if (!pickMode) return;
    const hovered = e.target.closest?.("table");
    if (hovered !== lastHighlighted) {
        if (lastHighlighted)
            lastHighlighted.classList.remove("tableBridgeHighlight");
        if (hovered) hovered.classList.add("tableBridgeHighlight");
        lastHighlighted = hovered || null;
    }
}
// to capture the table under the cursor while in pick mode
async function captureTable(e) {
    if (!pickMode) return; /// ignore clicks unless user toggled pick mode
    e.preventDefault();
    e.stopPropagation();
    // find the table under cursor or last highlighted
    let table =
        lastHighlighted && lastHighlighted.isConnected ? lastHighlighted : null;
    // try to get from point if not found
    if (!table && typeof document.elementFromPoint === "function") {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        table = el?.closest?.("table") || null;
    }
    if (table) {
        const json = parseTable(table); //convert to JSON
        json.email = currentEmail;
        //save locally
        savedTables.push(json);
        persistSaved();
        updateStatusWithCounts();
        setStatus(
            `Email: ${currentEmail} — Saved: ${savedTables.length} — sending…`
        );
        //send to background to forward to Next.js
        chrome.runtime.sendMessage(
            { type: "TABLE_CAPTURED", payload: json },
            (resp) => {
                setStatus(
                    resp?.ok
                        ? `Email: ${currentEmail} — Saved: ${savedTables.length} — Sent ✅`
                        : `Send failed: ${resp?.error || "unknown"}`
                );
                if (resp?.ok) {
                    window.open(
                        "http://localhost:3000/web/playground/table-reader",
                        "_blank"
                    );
                }
            }
        );
    } else {
        setStatus("No table here");
    }

    stopPickMode();
}
// parse HTML table into structured JSON
function parseTable(table) {
    let headers = [];
    const headerRow =
        table.querySelector("thead tr") || table.querySelector("tr");
    if (headerRow) {
        headers = Array.from(headerRow.querySelectorAll("th,td")).map((c) =>
            (c.textContent || "").trim()
        );
    }

    const rows = [];
    const bodyRows = table.querySelectorAll("tbody tr");
    const trs = bodyRows.length ? bodyRows : table.querySelectorAll("tr");
    trs.forEach((tr, idx) => {
        if (idx === 0 && headers.length && tr.querySelectorAll("th").length)
            return;
        // skip header row if already captured
        const cells = Array.from(tr.querySelectorAll("td,th")).map((td) => {
            const rawText = (td.textContent || "").trim();
            // extract images
            const imgs = Array.from(td.querySelectorAll("img"))
                .map((img) => img.getAttribute("src") || "")
                .filter(Boolean)
                .map((src) => {
                    try {
                        return new URL(src, location.href).href;
                    } catch {
                        return src;
                    }
                });
            // extract anchor hrefs
            const anchorHrefs = Array.from(td.querySelectorAll("a[href]"))
                .map((a) => a.getAttribute("href") || "")
                .filter(Boolean)
                .map((href) => {
                    try {
                        return new URL(href, location.href).href;
                    } catch {
                        return href;
                    }
                });
            // extract YouTube links
            const YT_RE =
                /https?:\/\/(?:www\.)?(?:youtube\.com\/(?:watch\?v=[\w-]+(?:&\S*)?|shorts\/[\w-]+|embed\/[\w-]+)|youtu\.be\/[\w-]+(?:\?\S*)?)/gi;
            // matches various YouTube URL formats
            const ytFromAnchors = anchorHrefs.filter((u) =>
                /(?:youtube\.com|youtu\.be)/i.test(u)
            );
            const ytFromText = Array.from(String(rawText).matchAll(YT_RE)).map(
                (m) => m[0]
            );
            // extract YouTube links from text content
            const ytLinks = Array.from(
                new Set([...ytFromAnchors, ...ytFromText])
            );
            // clean text by removing image alt texts and YouTube links
            const cleanedText = String(rawText)
                .replace(YT_RE, "")
                .replace(/\s{2,}/g, " ")
                .trim();
            // assemble parts
            const parts = [];
            if (imgs[0] || ytLinks.length > 0) {
                if (cleanedText) parts.push({ type: "text", val: cleanedText });
                imgs.forEach((src) => parts.push({ type: "image", src }));
                ytLinks.forEach((src) => parts.push({ type: "video", src }));
            }
            // else{

            // }
            if (parts.length) {
                console.log("parts are:", parts);
                return parts;
            }
            console.log("cleaned text is:", cleanedText);
            return cleanedText;
        });
        if (cells.length) rows.push(cells);
    });
    return {
        headers,
        rows,
        url: location.href,
        capturedAt: new Date().toISOString(),
    };
}
// request injection data from Next.js via background
function requestInjectFromNext() {
    if (!currentEmail) {
        renderToolbar();
        return;
    }
    setStatus("Fetching from Next.js…");
    chrome.runtime.sendMessage({ type: "FETCH_AND_INJECT" }, (resp) => {
        setStatus(
            resp?.ok
                ? "Injected ✅"
                : `Inject failed: ${resp?.error || "unknown"}`
        );
    });
}
// export saved tables as JSON file
function exportLocalJSON() {
    if (!savedTables.length) {
        setStatus("No saved tables");
        return;
    }
    const blob = new Blob([JSON.stringify(savedTables, null, 2)], {
        type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "tables.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000); // cleanup
    setStatus(`Downloaded (${savedTables.length})`);
}
// listen for updates from background ( email changes, injection data)
chrome.runtime.onMessage.addListener((msg, _sender, _sendResponse) => {
    if (msg?.type === "EMAIL_UPDATED") {
        currentEmail = msg.email || "";
        renderToolbar();
    }
    if (msg?.type === "INJECT_DATA") {
        try {
            const data = msg.payload;
            // reuse existing first table or create a simple one at top of page
            let table = document.querySelector("table");
            if (!table) {
                table = document.createElement("table");
                table.style.borderCollapse = "collapse";
                table.style.margin = "12px 0";
                table.style.width = "100%";
                document.body.prepend(table);
            }
            table.innerHTML = "";
            // build table from data
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
