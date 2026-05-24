// ==UserScript==
// @name         Prompt Studio Web Clipper
// @namespace    https://github.com/your-name/chatgpt-prompt-studio
// @version      0.1.0
// @description  Save selected text from ordinary web pages to your Prompt Studio backend.
// @match        http://*/*
// @match        https://*/*
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  if (location.hostname === "chatgpt.com" || location.hostname === "chat.openai.com") return;
  if (window.__promptStudioClipper?.initialized) return;

  const CONFIG = {
    API_BASE: "http://localhost:8787",
    STORAGE_PREFIX: "prompt-studio-clipper:",
  };

  const state = { initialized: true };
  window.__promptStudioClipper = state;

  const ROOMS = [
    "RP Prompt",
    "Image Prompt",
    "Writing Style",
    "NSFW",
    "Jokes",
    "Dialogue",
    "Plot",
    "Mood",
    "Reference",
    "Inbox",
  ];

  function create(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === "class") el.className = value;
      else if (key === "text") el.textContent = value;
      else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
      else if (value !== undefined && value !== null) el.setAttribute(key, String(value));
    });
    children.forEach((child) => el.append(child));
    return el;
  }

  function toast(message) {
    let box = document.querySelector("#psc-toast");
    if (!box) {
      box = create("div", { id: "psc-toast", class: "psc-toast" });
      document.body.append(box);
    }
    box.textContent = message;
    box.classList.add("psc-show");
    clearTimeout(box.__timer);
    box.__timer = setTimeout(() => box.classList.remove("psc-show"), 2200);
  }

  function apiUrl(path) {
    return new URL(path, CONFIG.API_BASE.replace(/\/$/, "") + "/").toString();
  }

  function readPosition() {
    try {
      return JSON.parse(localStorage.getItem(`${CONFIG.STORAGE_PREFIX}fab-position`) || "null");
    } catch {
      return null;
    }
  }

  function writePosition(pos) {
    localStorage.setItem(`${CONFIG.STORAGE_PREFIX}fab-position`, JSON.stringify(pos));
  }

  function selectedText() {
    return String(window.getSelection?.() || "").trim();
  }

  async function saveSelection() {
    const text = selectedText();
    const sourceUrl = location.href;
    if (!text && !sourceUrl) {
      toast("Select text first.");
      return;
    }

    const room = prompt(`Room?\n${ROOMS.join(", ")}`, localStorage.getItem(`${CONFIG.STORAGE_PREFIX}last-room`) || "Inbox") || "Inbox";
    localStorage.setItem(`${CONFIG.STORAGE_PREFIX}last-room`, room);
    const userNote = prompt("Note? Optional.", "") || "";

    const response = await fetch(apiUrl("/clip"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room,
        text,
        source_url: sourceUrl,
        page_title: document.title,
        user_note: userNote,
        source: "web_clipper",
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || `Save failed: ${response.status}`);
    toast("Saved to Prompt Studio.");
  }

  function makeDraggable(el) {
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    function defaultPos() {
      const rect = el.getBoundingClientRect();
      return {
        left: Math.max(8, window.innerWidth - rect.width - 20),
        top: Math.max(80, window.innerHeight - rect.height - 140),
      };
    }

    function clamp(left, top) {
      const rect = el.getBoundingClientRect();
      return {
        left: Math.min(Math.max(left, 8), window.innerWidth - rect.width - 8),
        top: Math.min(Math.max(top, 80), window.innerHeight - rect.height - 80),
      };
    }

    function setPos(pos) {
      const clamped = clamp(pos.left, pos.top);
      el.style.left = `${clamped.left}px`;
      el.style.top = `${clamped.top}px`;
      el.style.right = "auto";
      el.style.bottom = "auto";
      return clamped;
    }

    setTimeout(() => setPos(readPosition() || defaultPos()), 0);

    el.addEventListener("pointerdown", (event) => {
      dragging = true;
      moved = false;
      startX = event.clientX;
      startY = event.clientY;
      const rect = el.getBoundingClientRect();
      startLeft = rect.left;
      startTop = rect.top;
      el.setPointerCapture?.(event.pointerId);
    });

    el.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      const dx = event.clientX - startX;
      const dy = event.clientY - startY;
      if (Math.hypot(dx, dy) > 6) moved = true;
      if (moved) {
        event.preventDefault();
        setPos({ left: startLeft + dx, top: startTop + dy });
      }
    });

    el.addEventListener("pointerup", async (event) => {
      if (!dragging) return;
      dragging = false;
      el.releasePointerCapture?.(event.pointerId);
      if (moved) {
        event.preventDefault();
        const rect = el.getBoundingClientRect();
        writePosition({ left: Math.round(rect.left), top: Math.round(rect.top) });
        setTimeout(() => { moved = false; }, 0);
        return;
      }
      try {
        await saveSelection();
      } catch (error) {
        toast(error.message || "Save failed.");
      }
    });
  }

  function injectStyles() {
    document.head.append(create("style", { text: `
      #prompt-studio-clipper-fab {
        position: fixed;
        width: 50px;
        height: 50px;
        z-index: 2147483000;
        border: 0;
        border-radius: 999px;
        background: linear-gradient(135deg, #f9d48a, #f093b8);
        color: white;
        box-shadow: 0 12px 28px rgba(80, 48, 30, 0.28);
        font-size: 24px;
        cursor: pointer;
        touch-action: none;
        user-select: none;
      }
      .psc-toast {
        position: fixed;
        left: 50%;
        bottom: 24px;
        transform: translateX(-50%) translateY(20px);
        opacity: 0;
        z-index: 2147483001;
        padding: 10px 14px;
        border-radius: 999px;
        background: rgba(35, 27, 37, 0.94);
        color: white;
        font: 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        transition: 180ms ease;
        pointer-events: none;
      }
      .psc-toast.psc-show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
    ` }));
  }

  injectStyles();
  const button = create("button", {
    id: "prompt-studio-clipper-fab",
    type: "button",
    title: "Save selected text to Prompt Studio",
    text: "🏛️",
  });
  document.body.append(button);
  makeDraggable(button);
})();
