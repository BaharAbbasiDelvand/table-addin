document.getElementById("extractBtn").addEventListener("click", async () => {
    const status = document.getElementById("status");
    status.textContent = "Requesting table data...";

    const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
    });
    if (!tab) {
        status.textContent = "No active tab found.";
        return;
    }

    chrome.tabs.sendMessage(tab.id, { action: "getTables" }, (response) => {
        if (!response) {
            status.textContent =
                "No response — maybe the page blocked scripts or requires reload.";
            return;
        }
        if (!response.ok) {
            status.textContent = "Failed to extract tables.";
            return;
        }
        const tables = response.tables;
        status.textContent = `Found ${tables.length} table(s).`;

        const container = document.getElementById("tablesContainer");
        container.innerHTML = "";

        tables.forEach((t, idx) => {
            const panel = document.createElement("div");
            panel.style.border = "1px solid #ddd";
            panel.style.padding = "6px";
            panel.style.margin = "6px 0";

            const title = document.createElement("div");
            title.textContent = `Table ${idx + 1} — ${
                t.headers.length ? t.headers.length + " cols" : ""
            } ${t.rows.length} rows`;
            panel.appendChild(title);

            const tablePreview = document.createElement("table");
            tablePreview.style.width = "100%";
            tablePreview.style.borderCollapse = "collapse";
            tablePreview.style.marginTop = "6px";

            // build header row if available
            if (t.headers && t.headers.length) {
                const hr = document.createElement("tr");
                t.headers.forEach((h) => {
                    const th = document.createElement("th");
                    th.textContent = h;
                    th.style.border = "1px solid #ccc";
                    th.style.padding = "4px";
                    hr.appendChild(th);
                });
                tablePreview.appendChild(hr);
            }

            // preview up to 8 rows
            t.rows.slice(0, 8).forEach((r) => {
                const tr = document.createElement("tr");
                r.forEach((c) => {
                    const td = document.createElement("td");
                    td.textContent = c;
                    td.style.border = "1px solid #eee";
                    td.style.padding = "4px";
                    tr.appendChild(td);
                });
                tablePreview.appendChild(tr);
            });

            panel.appendChild(tablePreview);

            const downloadBtn = document.createElement("button");
            downloadBtn.textContent = "Download CSV";
            downloadBtn.style.marginTop = "6px";
            downloadBtn.addEventListener("click", () => {
                const csv = toCSV(t);
                downloadBlob(csv, `table-${idx + 1}.csv`);
            });
            panel.appendChild(downloadBtn);

            const copyBtn = document.createElement("button");
            copyBtn.textContent = "Copy CSV";
            copyBtn.style.marginLeft = "6px";
            copyBtn.addEventListener("click", async () => {
                const csv = toCSV(t);
                try {
                    await navigator.clipboard.writeText(csv);
                    status.textContent = "CSV copied to clipboard.";
                } catch (e) {
                    status.textContent = "Copy failed: " + e;
                }
            });
            panel.appendChild(copyBtn);

            container.appendChild(panel);
        });
    });
});

function toCSV(table) {
    const rows = [];
    if (table.headers && table.headers.length) rows.push(table.headers);
    table.rows.forEach((r) => rows.push(r));
    return rows
        .map((cols) =>
            cols.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")
        )
        .join("\n");
}

function downloadBlob(text, filename) {
    const blob = new Blob([text], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
}
