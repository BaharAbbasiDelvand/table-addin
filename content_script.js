function parseTable(table) {
    const out = {
        html: table.outerHTML,
        rows: [],
        headers: [],
    };

    const thead = table.querySelector("thead");
    if (thead) {
        const ths = Array.from(thead.querySelectorAll("th"));
        out.headers = ths.map((th) => th.innerText.trim());
    } else {
        const firstRow = table.querySelector("tr");
        if (firstRow) {
            const ths = Array.from(firstRow.querySelectorAll("th"));
            if (ths.length) out.headers = ths.map((th) => th.innerText.trim());
        }
    }

    let rows = [];
    const tbody = table.querySelector("tbody");
    if (tbody) rows = Array.from(tbody.querySelectorAll("tr"));
    else rows = Array.from(table.querySelectorAll("tr"));

    for (let r = 0; r < rows.length; r++) {
        const row = rows[r];
        if (
            r === 0 &&
            table.querySelectorAll("th").length &&
            out.headers.length
        ) {
            if (row.querySelectorAll("th").length) continue;
        }
        const cells = Array.from(row.querySelectorAll("td,th"));
        if (!cells.length) continue;
        const rowData = cells.map((cell) => cell.innerText.trim());
        out.rows.push(rowData);
    }

    return out;
}

function extractAllTables() {
    const tables = Array.from(document.querySelectorAll("table"));
    return tables.map(parseTable);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg && msg.action === "getTables") {
        const tables = extractAllTables();
        sendResponse({ ok: true, tables });
        return true;
    }
});
