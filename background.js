const NEXT_BASE = "http://localhost:3000"; // change for prod
const TABLES_ENDPOINT = `${NEXT_BASE}/api/table-reader`;
const INJECT_ENDPOINT  = `${NEXT_BASE}/api/inject`;

const EMAIL_KEY = "tableBridge_email";
const sessionStore = chrome.storage?.session || chrome.storage.local;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

console.log("[BG] boot", { TABLES_ENDPOINT, INJECT_ENDPOINT });

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      if (msg?.type === "EMAIL_GET") {
        const got = await sessionStore.get(EMAIL_KEY);
        sendResponse({ ok: true, email: got?.[EMAIL_KEY] || "" });
        return;
      }

      if (msg?.type === "EMAIL_SET") {
        const email = String(msg?.email || "").trim();
        if (!EMAIL_REGEX.test(email)) {
          sendResponse({ ok: false, error: "Invalid email" });
          return;
        }
        await sessionStore.set({ [EMAIL_KEY]: email });
        sendResponse({ ok: true, email });
        return;
      }

      if (msg?.type === "TABLE_CAPTURED") {
        const payload = { ...msg.payload, capturedAt: new Date().toISOString() };

        // ensure email is present; if missing, pull from storage
        if (!payload.email) {
          const got = await sessionStore.get(EMAIL_KEY);
          const email = got?.[EMAIL_KEY] || "";
          if (!email) {
            sendResponse({ ok: false, error: "Email not set" });
            return;
          }
          payload.email = email;
        }

        console.log("[BG] POST →", TABLES_ENDPOINT, { email: payload.email, url: payload.url });

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

        chrome.tabs.sendMessage(tabId, { type: "INJECT_DATA", payload: data }, () => {
          sendResponse({ ok: true });
        });
        return;
      }

      sendResponse({ ok: false, error: "Unknown message" });
    } catch (err) {
      console.error("[BG] error", err);
      sendResponse({ ok: false, error: String(err) });
    }
  })();

  return true;
});
