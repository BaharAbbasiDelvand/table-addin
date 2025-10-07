(function () {
    if (document.getElementById("tableGrabberToolbar")) return;

    const toolbar = document.createElement("div");
    toolbar.id = "tableGrabberToolbar";
    toolbar.innerHTML = `<button id="tgGetDataBtn">Get Data</button>
                         <button id="tgExportBtn">Export JSON</button>`;
    document.body.appendChild(toolbar);

    document
        .getElementById("tgGetDataBtn")
        .addEventListener("click", startPickMode);
    document
        .getElementById("tgExportBtn")
        .addEventListener("click", exportJSON);
})();

let pickMode = false;
let lastHighlighted = null;
let savedTables = [];

function startPickMode() {
    pickMode = true;
    setStatus("Pick mode: hover a table and click");
    document.body.style.cursor =
        "url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2332 height=%2332><text y=%2222%22 font-size=%2224%22>➤</text></svg>') 0 0, auto";

    document.addEventListener("mousemove", highlightTable);
    document.addEventListener("click", captureTable, { capture: true });
    document.addEventListener("keydown", escToCancel, { capture: true });
}

function stopPickMode() {
    pickMode = false;
    document.body.style.cursor = "auto";
    if (lastHighlighted) {
        lastHighlighted.classList.remove("tableGrabberHighlight");
        lastHighlighted = null;
    }
    document.removeEventListener("mousemove", highlightTable);
    document.removeEventListener("click", captureTable, { capture: true });
    document.removeEventListener("keydown", escToCancel, { capture: true });
    setStatus("Pick mode ended");
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
            lastHighlighted.classList.remove("tableGrabberHighlight");
        if (hovered) hovered.classList.add("tableGrabberHighlight");
        lastHighlighted = hovered || null;
    }
}

function captureTable(e) {
    if (!pickMode) return;

    e.preventDefault();
    e.stopPropagation();

    let table =
        lastHighlighted && lastHighlighted.isConnected ? lastHighlighted : null;

    if (!table && typeof document.elementFromPoint === "function") {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        table = el?.closest?.("table") || null;
    }

    if (table) {
        const json = parseTable(table);
        savedTables.push(json);
        setStatus("✅ Table captured to memory.");
    } else {
        setStatus("⚠️ No table detected at click.");
    }

    stopPickMode();
}

function setStatus(msg) {
    const bar = document.getElementById("tableGrabberToolbar");
    if (!bar) return;
    let s = bar.querySelector(".tg-status");
    if (!s) {
        s = document.createElement("span");
        s.className = "tg-status";
        s.style.marginLeft = "8px";
        s.style.fontSize = "12px";
        s.style.opacity = "0.9";
        bar.appendChild(s);
    }
    s.textContent = msg;
}

function parseTable(table) {
    const headers = [];
    const headerRow =
        table.querySelector("thead tr") || table.querySelector("tr");
    if (headerRow) {
        headerRow
            .querySelectorAll("th,td")
            .forEach((cell) => headers.push(cell.innerText.trim()));
    }

    const rows = [];
    table.querySelectorAll("tbody tr").forEach((tr) => {
        const cells = Array.from(tr.querySelectorAll("td,th")).map((td) =>
            td.innerText.trim()
        );
        if (cells.length) rows.push(cells);
    });

    return { headers, rows };
}

function exportJSON() {
    if (!savedTables.length) {
        alert("No tables saved yet.");
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
    URL.revokeObjectURL(url);
}
