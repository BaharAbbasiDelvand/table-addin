const emailInput = document.getElementById("email");
const saveBtn = document.getElementById("save");
const clearBtn = document.getElementById("clear");
const statusEl = document.getElementById("status");

function setStatus(t) {
    statusEl.textContent = t || "";
}

function valid(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || "").trim());
}

document.addEventListener("DOMContentLoaded", () => {
    chrome.runtime.sendMessage({ type: "EMAIL_GET" }, (resp) => {
        emailInput.value = resp?.email || "";
        setStatus(
            resp?.email ? "Saved in this browser session." : "Not set yet."
        );
    });
});

saveBtn.addEventListener("click", () => {
    const email = emailInput.value.trim();
    if (!valid(email)) {
        setStatus("Please enter a valid email.");
        return;
    }
    chrome.runtime.sendMessage({ type: "EMAIL_SET", email }, (resp) => {
        if (resp?.ok) {
            setStatus("Saved. You can close this popup.");
            // notify all tabs so the toolbar status updates
            chrome.tabs.query({}, (tabs) => {
                for (const t of tabs) {
                    chrome.tabs.sendMessage(
                        t.id,
                        { type: "EMAIL_UPDATED", email: resp.email },
                        () => {}
                    );
                }
            });
        } else {
            setStatus(resp?.error || "Failed to save.");
        }
    });
});

clearBtn.addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "EMAIL_SET", email: "" }, (resp) => {
        emailInput.value = "";
        setStatus("Cleared. Set email to capture again.");
        chrome.tabs.query({}, (tabs) => {
            for (const t of tabs)
                chrome.tabs.sendMessage(
                    t.id,
                    { type: "EMAIL_UPDATED", email: "" },
                    () => {}
                );
        });
    });
});
