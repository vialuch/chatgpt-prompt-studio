// ==UserScript==
// @name         ChatGPT Prompt Studio
// @namespace    https://github.com/your-name/chatgpt-prompt-studio
// @version      0.1.0
// @description  A tiny draggable prompt library, clipper, and style studio for ChatGPT web.
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  if (window.__promptStudio?.initialized) return;

  const CONFIG = {
    API_BASE: "http://localhost:8787",
    DEFAULT_LIMIT: 20,
    STORAGE_PREFIX: "prompt-studio:",
  };

  const state = {
    initialized: true,
    drawerOpen: false,
    libraryOpen: false,
    studioOpen: false,
    settingsOpen: false,
    rooms: [],
    room: "",
    query: "",
    items: [],
    loading: false,
    error: "",
    debounceTimer: null,
    settings: readJson("settings", {
      theme: "default",
      fontSize: 16,
      lineHeight: 1.6,
      compact: false,
      customBackground: "",
    }),
  };

  window.__promptStudio = state;
  window.PromptStudio = window.PromptStudio || {};
  window.PromptStudio.state = state;
  window.PromptStudio.resetFloatingButton = () => {
    localStorage.removeItem(`${CONFIG.STORAGE_PREFIX}fab-position`);
    toast("Position reset. Refresh the page.");
  };

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

  const $ = (selector, root = document) => root.querySelector(selector);

  function create(tag, attrs = {}, children = []) {
    const el = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (key === "class") el.className = value;
      else if (key === "text") el.textContent = value;
      else if (key === "html") el.innerHTML = value;
      else if (key.startsWith("on") && typeof value === "function") el.addEventListener(key.slice(2), value);
      else if (value !== undefined && value !== null) el.setAttribute(key, String(value));
    });
    children.forEach((child) => el.append(child));
    return el;
  }

  function readJson(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(`${CONFIG.STORAGE_PREFIX}${key}`) || "null") || fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(`${CONFIG.STORAGE_PREFIX}${key}`, JSON.stringify(value));
  }

  function toast(message) {
    let box = $("#ps-toast");
    if (!box) {
      box = create("div", { id: "ps-toast", class: "ps-toast" });
      document.body.append(box);
    }
    box.textContent = message;
    box.classList.add("ps-show");
    clearTimeout(box.__timer);
    box.__timer = setTimeout(() => box.classList.remove("ps-show"), 2200);
  }

  function apiUrl(path, params = {}) {
    const url = new URL(path, CONFIG.API_BASE.replace(/\/$/, "") + "/");
    Object.entries(params).forEach(([key, value]) => {
      if (value !== "" && value !== undefined && value !== null) url.searchParams.set(key, value);
    });
    return url.toString();
  }

  async function fetchJson(url, options = {}) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.ok === false) throw new Error(data.error || `Request failed: ${response.status}`);
    return data;
  }

  function getChatInput() {
    const selectors = [
      "textarea",
      "[contenteditable='true'][data-testid]",
      "[contenteditable='true']",
      "#prompt-textarea",
    ];
    for (const selector of selectors) {
      const el = $(selector);
      if (el && isVisible(el)) return el;
    }
    return null;
  }

  function isVisible(el) {
    const rect = el.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function getInputText() {
    const input = getChatInput();
    if (!input) return "";
    return input.value !== undefined ? input.value : input.textContent || "";
  }

  async function insertIntoChat(text) {
    const input = getChatInput();
    if (!input) {
      await navigator.clipboard.writeText(text);
      toast("Copied. Paste it into ChatGPT.");
      return false;
    }

    input.focus();
    if (input.value !== undefined) {
      const start = input.selectionStart ?? input.value.length;
      const end = input.selectionEnd ?? input.value.length;
      input.value = `${input.value.slice(0, start)}${text}${input.value.slice(end)}`;
      input.selectionStart = input.selectionEnd = start + text.length;
    } else {
      document.execCommand("insertText", false, text);
    }

    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: text }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
    toast("Inserted into ChatGPT.");
    return true;
  }

  async function copyText(text) {
    await navigator.clipboard.writeText(text);
    toast("Copied.");
  }

  function formatInsert(item) {
    return [
      `【Title】${item.title || ""}`,
      `【Room】${item.room || ""}`,
      `【Kind】${item.kind || ""}`,
      `【Summary】${item.summary || ""}`,
      `【Learning Goal】${item.learning_goal || ""}`,
      "【Reusable Block】",
      item.reusable || "",
    ].join("\n");
  }

  function formatReference(item) {
    return [
      "Please use the following Prompt Studio item as a reference. Do not copy it directly; learn its structure, rhythm, and transferable technique.",
      "",
      `Title: ${item.title || ""}`,
      `Room: ${item.room || ""}`,
      `Kind: ${item.kind || ""}`,
      `Tags: ${(item.tags || []).join(", ")}`,
      `Summary: ${item.summary || ""}`,
      `Learning goal: ${item.learning_goal || ""}`,
      "Reusable technique / prompt block:",
      item.reusable || "",
      "",
      "Now create the content I need based on this reference.",
    ].join("\n");
  }

  async function saveCurrent() {
    const selected = String(window.getSelection?.() || "").trim();
    const text = selected || getInputText().trim();
    if (!text) {
      toast("Select text or type something first.");
      return;
    }
    const room = prompt("Room? Examples: RP Prompt, Image Prompt, Writing Style, Mood", state.room || "Inbox") || "Inbox";
    const userNote = prompt("Note? Optional.", "") || "";
    await fetchJson(apiUrl("/clip"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room,
        text,
        page_title: document.title,
        source_url: location.href,
        user_note: userNote,
        source: "chatgpt_studio",
      }),
    });
    toast("Saved to Prompt Studio.");
  }

  async function loadRooms() {
    try {
      const data = await fetchJson(apiUrl("/library/rooms"));
      state.rooms = Array.isArray(data.rooms) && data.rooms.length ? data.rooms : ROOMS;
    } catch {
      state.rooms = ROOMS;
    }
    renderLibrary();
  }

  async function loadPrompts() {
    state.loading = true;
    state.error = "";
    renderLibrary();
    try {
      const data = await fetchJson(apiUrl("/library/prompts", {
        room: state.room,
        q: state.query,
        limit: CONFIG.DEFAULT_LIMIT,
      }));
      state.items = Array.isArray(data.items) ? data.items : [];
    } catch (error) {
      state.error = error.message || "Load failed";
      state.items = [];
    } finally {
      state.loading = false;
      renderLibrary();
    }
  }

  function debouncedSearch(value) {
    state.query = value;
    clearTimeout(state.debounceTimer);
    state.debounceTimer = setTimeout(loadPrompts, 300);
  }

  function toggleDrawer(force) {
    state.drawerOpen = typeof force === "boolean" ? force : !state.drawerOpen;
    $("#ps-drawer")?.classList.toggle("ps-open", state.drawerOpen);
  }

  function showPanel(name) {
    state.libraryOpen = name === "library";
    state.studioOpen = name === "studio";
    state.settingsOpen = name === "settings";
    renderPanels();
    if (name === "library") {
      loadRooms();
      loadPrompts();
    }
  }

  function applySettings() {
    const root = document.documentElement;
    const s = state.settings;
    root.style.setProperty("--ps-font-size", `${s.fontSize}px`);
    root.style.setProperty("--ps-line-height", String(s.lineHeight));
    document.body.classList.toggle("ps-compact-chat", Boolean(s.compact));
    let bg = $("#ps-background");
    if (!bg) {
      bg = create("div", { id: "ps-background" });
      document.body.prepend(bg);
    }
    bg.style.backgroundImage = s.customBackground ? `url("${s.customBackground}")` : "";
    bg.style.display = s.customBackground ? "block" : "none";
    document.body.classList.toggle("ps-theme-soft", s.theme === "soft");
    writeJson("settings", s);
  }

  function updateSetting(key, value) {
    state.settings[key] = value;
    applySettings();
    renderStudio();
  }

  function makeDraggableFab(el) {
    const key = `${CONFIG.STORAGE_PREFIX}fab-position`;
    const saved = readJson("fab-position", null);
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

    setTimeout(() => setPos(saved || defaultPos()), 0);

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

    el.addEventListener("pointerup", (event) => {
      if (!dragging) return;
      dragging = false;
      el.releasePointerCapture?.(event.pointerId);
      if (moved) {
        event.preventDefault();
        const rect = el.getBoundingClientRect();
        localStorage.setItem(key, JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) }));
        setTimeout(() => { moved = false; }, 0);
      } else {
        toggleDrawer();
      }
    });

    el.addEventListener("click", (event) => {
      if (moved) {
        event.preventDefault();
        event.stopPropagation();
      }
    });
  }

  function injectStyles() {
    if ($("#ps-style")) return;
    document.head.append(create("style", { id: "ps-style", text: `
      #ps-background {
        position: fixed;
        inset: 0;
        z-index: -1;
        background-size: cover;
        background-position: center;
        opacity: 0.22;
        pointer-events: none;
      }
      .ps-theme-soft main { font-size: var(--ps-font-size, 16px); line-height: var(--ps-line-height, 1.6); }
      .ps-compact-chat main { --thread-content-margin: 10px; }
      #ps-fab {
        position: fixed;
        width: 54px;
        height: 54px;
        border: 0;
        border-radius: 999px;
        z-index: 2147483000;
        background: linear-gradient(135deg, #ff8ac5, #8f7dff);
        color: white;
        box-shadow: 0 14px 35px rgba(72, 38, 96, 0.28);
        font-size: 25px;
        cursor: pointer;
        touch-action: none;
        user-select: none;
      }
      #ps-drawer {
        position: fixed;
        right: 18px;
        bottom: 206px;
        z-index: 2147482999;
        display: none;
        gap: 8px;
        flex-direction: column;
        padding: 10px;
        border: 1px solid rgba(120, 90, 140, 0.18);
        border-radius: 18px;
        background: rgba(255, 255, 255, 0.94);
        box-shadow: 0 18px 50px rgba(40, 20, 60, 0.18);
        backdrop-filter: blur(18px);
      }
      #ps-drawer.ps-open { display: flex; }
      .ps-drawer-btn {
        border: 0;
        border-radius: 13px;
        padding: 10px 12px;
        background: #f7edf5;
        color: #302231;
        font: 600 13px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        text-align: left;
        cursor: pointer;
      }
      .ps-panel {
        position: fixed;
        right: 14px;
        top: 74px;
        bottom: 18px;
        width: min(420px, calc(100vw - 28px));
        z-index: 2147482998;
        display: none;
        flex-direction: column;
        border: 1px solid rgba(120, 90, 140, 0.18);
        border-radius: 20px;
        background: rgba(255, 255, 255, 0.97);
        box-shadow: 0 22px 70px rgba(40, 20, 60, 0.22);
        overflow: hidden;
        color: #231b25;
        font: 14px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }
      .ps-panel.ps-open { display: flex; }
      .ps-panel header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        padding: 12px 14px;
        border-bottom: 1px solid rgba(120, 90, 140, 0.14);
        font-weight: 800;
      }
      .ps-panel button, .ps-panel select, .ps-panel input {
        font: inherit;
      }
      .ps-close, .ps-mini-btn {
        border: 0;
        border-radius: 10px;
        padding: 7px 9px;
        background: #f1e8f1;
        cursor: pointer;
      }
      .ps-tools {
        display: grid;
        gap: 8px;
        padding: 12px;
        border-bottom: 1px solid rgba(120, 90, 140, 0.12);
      }
      .ps-tools select, .ps-tools input, .ps-field input {
        width: 100%;
        box-sizing: border-box;
        border: 1px solid rgba(120, 90, 140, 0.18);
        border-radius: 12px;
        padding: 10px;
        background: white;
      }
      .ps-list {
        overflow: auto;
        padding: 12px;
        display: grid;
        gap: 10px;
      }
      .ps-card {
        border: 1px solid rgba(120, 90, 140, 0.14);
        border-radius: 14px;
        padding: 12px;
        background: #fffafd;
      }
      .ps-card h3 {
        margin: 0 0 6px;
        font-size: 15px;
      }
      .ps-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        margin-bottom: 8px;
        color: #7d6079;
        font-size: 12px;
      }
      .ps-card p {
        margin: 6px 0;
      }
      .ps-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 7px;
        margin-top: 10px;
      }
      .ps-actions button, .ps-primary {
        border: 0;
        border-radius: 10px;
        padding: 8px 10px;
        background: #2a202d;
        color: white;
        cursor: pointer;
      }
      .ps-actions .ps-secondary {
        background: #efe6ef;
        color: #2a202d;
      }
      details.ps-reusable {
        margin-top: 8px;
        white-space: pre-wrap;
      }
      .ps-studio-body {
        padding: 14px;
        overflow: auto;
        display: grid;
        gap: 12px;
      }
      .ps-field {
        display: grid;
        gap: 6px;
      }
      .ps-toast {
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
        transition: 180ms ease;
        pointer-events: none;
      }
      .ps-toast.ps-show {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }
      @media (max-width: 768px) {
        #ps-drawer { right: 14px; bottom: 210px; }
        .ps-panel { top: 58px; bottom: 94px; }
      }
    ` }));
  }

  function renderShell() {
    injectStyles();
    const fab = create("button", { id: "ps-fab", type: "button", title: "Prompt Studio", text: "🎀" });
    const drawer = create("div", { id: "ps-drawer" }, [
      create("button", { class: "ps-drawer-btn", text: "🏛️ Save", onclick: saveCurrent }),
      create("button", { class: "ps-drawer-btn", text: "📚 Library", onclick: () => showPanel("library") }),
      create("button", { class: "ps-drawer-btn", text: "🎨 Studio", onclick: () => showPanel("studio") }),
      create("button", { class: "ps-drawer-btn", text: "⚙️ Settings", onclick: () => showPanel("settings") }),
    ]);
    const library = create("section", { id: "ps-library", class: "ps-panel", "aria-label": "Prompt Library" });
    const studio = create("section", { id: "ps-studio", class: "ps-panel", "aria-label": "Studio Settings" });
    const settings = create("section", { id: "ps-settings", class: "ps-panel", "aria-label": "Settings" });

    document.body.append(fab, drawer, library, studio, settings);
    makeDraggableFab(fab);
    applySettings();
    renderPanels();

    document.addEventListener("pointerdown", (event) => {
      if (!state.drawerOpen) return;
      if (event.target.closest("#ps-fab, #ps-drawer")) return;
      toggleDrawer(false);
    });
  }

  function renderPanels() {
    $("#ps-library")?.classList.toggle("ps-open", state.libraryOpen);
    $("#ps-studio")?.classList.toggle("ps-open", state.studioOpen);
    $("#ps-settings")?.classList.toggle("ps-open", state.settingsOpen);
    if (state.libraryOpen) renderLibrary();
    if (state.studioOpen) renderStudio();
    if (state.settingsOpen) renderSettings();
  }

  function renderLibrary() {
    const panel = $("#ps-library");
    if (!panel) return;
    panel.replaceChildren(
      create("header", {}, [
        create("span", { text: "📚 Prompt Library" }),
        create("button", { class: "ps-close", text: "Close", onclick: () => { state.libraryOpen = false; renderPanels(); } }),
      ]),
      create("div", { class: "ps-tools" }, [
        create("select", { onchange: (event) => { state.room = event.target.value; loadPrompts(); } }, [
          create("option", { value: "", text: "All rooms" }),
          ...(state.rooms.length ? state.rooms : ROOMS).map((room) => create("option", {
            value: room,
            text: room,
            selected: state.room === room ? "selected" : null,
          })),
        ]),
        create("input", {
          type: "search",
          placeholder: "Search title, tags, summary, prompt...",
          value: state.query,
          oninput: (event) => debouncedSearch(event.target.value),
        }),
        create("button", { class: "ps-mini-btn", text: "Refresh", onclick: loadPrompts }),
      ]),
      create("div", { class: "ps-list" }, [
        state.loading ? create("p", { text: "Loading..." }) : null,
        state.error ? create("p", { text: `Load failed: ${state.error}` }) : null,
        !state.loading && !state.error && !state.items.length ? create("p", { text: "No items yet." }) : null,
        ...state.items.map(renderItem),
      ].filter(Boolean))
    );
  }

  function renderItem(item) {
    const tags = Array.isArray(item.tags) ? item.tags : [];
    const copyPayload = [item.reusable, item.summary, item.learning_goal].filter(Boolean).join("\n\n");
    return create("article", { class: "ps-card" }, [
      create("h3", { text: item.title || "Untitled" }),
      create("div", { class: "ps-meta" }, [
        create("span", { text: item.room || "Inbox" }),
        create("span", { text: item.kind || "note" }),
        ...tags.slice(0, 5).map((tag) => create("span", { text: `#${tag}` })),
      ]),
      item.summary ? create("p", { text: item.summary }) : null,
      item.learning_goal ? create("p", { text: `Goal: ${item.learning_goal}` }) : null,
      item.user_note ? create("p", { text: `Note: ${item.user_note}` }) : null,
      item.reusable ? create("details", { class: "ps-reusable" }, [
        create("summary", { text: "Reusable prompt / source text" }),
        create("div", { text: item.reusable }),
      ]) : null,
      create("div", { class: "ps-actions" }, [
        create("button", { text: "Copy", onclick: () => copyText(copyPayload) }),
        create("button", { text: "Insert", onclick: () => insertIntoChat(item.reusable || formatInsert(item)) }),
        create("button", { class: "ps-secondary", text: "Insert as Reference", onclick: () => insertIntoChat(formatReference(item)) }),
        item.source_url ? create("button", { class: "ps-secondary", text: "Open Source", onclick: () => window.open(item.source_url, "_blank", "noopener") }) : null,
      ].filter(Boolean)),
    ].filter(Boolean));
  }

  function renderStudio() {
    const panel = $("#ps-studio");
    if (!panel) return;
    const s = state.settings;
    panel.replaceChildren(
      create("header", {}, [
        create("span", { text: "🎨 Studio" }),
        create("button", { class: "ps-close", text: "Close", onclick: () => { state.studioOpen = false; renderPanels(); } }),
      ]),
      create("div", { class: "ps-studio-body" }, [
        create("label", { class: "ps-field" }, [
          create("span", { text: "Theme" }),
          create("select", { onchange: (event) => updateSetting("theme", event.target.value) }, [
            create("option", { value: "default", text: "Default", selected: s.theme === "default" ? "selected" : null }),
            create("option", { value: "soft", text: "Soft reading", selected: s.theme === "soft" ? "selected" : null }),
          ]),
        ]),
        create("label", { class: "ps-field" }, [
          create("span", { text: "Font size" }),
          create("input", { type: "range", min: "13", max: "22", value: s.fontSize, oninput: (event) => updateSetting("fontSize", Number(event.target.value)) }),
        ]),
        create("label", { class: "ps-field" }, [
          create("span", { text: "Line height" }),
          create("input", { type: "range", min: "1.2", max: "2", step: "0.05", value: s.lineHeight, oninput: (event) => updateSetting("lineHeight", Number(event.target.value)) }),
        ]),
        create("label", { class: "ps-field" }, [
          create("span", { text: "Background image URL" }),
          create("input", { value: s.customBackground, placeholder: "https://...", onchange: (event) => updateSetting("customBackground", event.target.value.trim()) }),
        ]),
        create("label", { class: "ps-field" }, [
          create("span", { text: "Compact chat" }),
          create("input", { type: "checkbox", checked: s.compact ? "checked" : null, onchange: (event) => updateSetting("compact", event.target.checked) }),
        ]),
      ])
    );
  }

  function renderSettings() {
    const panel = $("#ps-settings");
    if (!panel) return;
    panel.replaceChildren(
      create("header", {}, [
        create("span", { text: "⚙️ Settings" }),
        create("button", { class: "ps-close", text: "Close", onclick: () => { state.settingsOpen = false; renderPanels(); } }),
      ]),
      create("div", { class: "ps-studio-body" }, [
        create("p", { text: `API base: ${CONFIG.API_BASE}` }),
        create("button", { class: "ps-primary", text: "Reset floating button position", onclick: window.PromptStudio.resetFloatingButton }),
        create("button", { class: "ps-primary", text: "Reset Studio settings", onclick: () => { localStorage.removeItem(`${CONFIG.STORAGE_PREFIX}settings`); location.reload(); } }),
      ])
    );
  }

  renderShell();
})();
