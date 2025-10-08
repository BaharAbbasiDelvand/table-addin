const NEXT_BASE = "http://localhost:3000";             // change for prod
const TABLES_ENDPOINT = `${NEXT_BASE}/api/table-reader`;
const INJECT_ENDPOINT  = `${NEXT_BASE}/api/inject`;

console.log("[BG] boot", { TABLES_ENDPOINT, INJECT_ENDPOINT });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "TABLE_CAPTURED") {
        const payload = { ...msg.payload, capturedAt: new Date().toISOString() };
        console.log("[BG] POST →", TABLES_ENDPOINT, payload);

        const res = await fetch(TABLES_ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          cache: "no-store",
          body: JSON.stringify(payload)
        });

        console.log("[BG] POST status", res.status);
        if (!res.ok) {
          const text = await res.text().catch(() => "");
          console.error("[BG] POST body", text);
          sendResponse({ ok: false, error: `POST ${res.status}` });
          return;
        }
        sendResponse({ ok: true });
        return;
      }

      if (msg?.type === "FETCH_AND_INJECT") {
        console.log("[BG] GET →", INJECT_ENDPOINT);

        // short timeout so UI never hangs
        const ac = new AbortController();
        const to = setTimeout(() => ac.abort("timeout"), 7000);

        let data;
        try {
          const res = await fetch(INJECT_ENDPOINT, { signal: ac.signal, cache: "no-store" });
          clearTimeout(to);
          console.log("[BG] GET status", res.status);
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            sendResponse({ ok: false, error: `GET ${res.status}: ${text.slice(0,120)}` });
            return;
          }
          data = await res.json();
        } catch (e) {
          clearTimeout(to);
          console.error("[BG] fetch error (inject)", e);
          sendResponse({ ok: false, error: String(e) });
          return;
        }

        const tabId = sender?.tab?.id;
        if (!tabId) { sendResponse({ ok: false, error: "No sender tab" }); return; }

        // don't await; respond when the send completes
        chrome.tabs.sendMessage(tabId, { type: "INJECT_DATA", payload: data }, () => {
          // even if no response from content script, complete the request
          sendResponse({ ok: true });
        });
        return;
      }

      sendResponse({ ok: false, error: "Unknown message" });
    } catch (err) {
      console.error("[BG] fetch error", err);
      sendResponse({ ok: false, error: String(err) });
    }
  })();

  return true; // keep message channel open for async sendResponse
});
