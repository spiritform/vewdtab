import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

console.log("[Vewd2] extension loaded");

const PANEL_ID = "vewd2-panel";
const HANDLE_W = 20;
const PANEL_W_DEFAULT = 440;
const PANEL_W_MIN = 280;
const PANEL_W_MAX = 1200;
const STORAGE_KEY = "vewd2.panelWidth";
const PREVIEW_H_DEFAULT = 50;
const PREVIEW_H_MIN = 15;
const PREVIEW_H_MAX = 85;
const PREVIEW_KEY = "vewd2.previewPct";
const PREVIEW_COLLAPSED_KEY = "vewd2.previewCollapsed";
const FOLDER_KEY = "vewd2.saveFolder";

function loadWidth() {
    const v = parseInt(localStorage.getItem(STORAGE_KEY) || "", 10);
    return Number.isFinite(v) ? Math.min(PANEL_W_MAX, Math.max(PANEL_W_MIN, v)) : PANEL_W_DEFAULT;
}
function setWidth(px, persist = false) {
    const clamped = Math.min(PANEL_W_MAX, Math.max(PANEL_W_MIN, px));
    document.documentElement.style.setProperty("--vewd2-w", clamped + "px");
    if (persist) localStorage.setItem(STORAGE_KEY, String(clamped));
    return clamped;
}
setWidth(loadWidth());

function loadPreviewPct() {
    const v = parseFloat(localStorage.getItem(PREVIEW_KEY) || "");
    return Number.isFinite(v) ? Math.min(PREVIEW_H_MAX, Math.max(PREVIEW_H_MIN, v)) : PREVIEW_H_DEFAULT;
}
function setPreviewPct(pct, persist = false) {
    const clamped = Math.min(PREVIEW_H_MAX, Math.max(PREVIEW_H_MIN, pct));
    document.documentElement.style.setProperty("--vewd2-preview-h", clamped + "%");
    if (persist) localStorage.setItem(PREVIEW_KEY, String(clamped));
    return clamped;
}
setPreviewPct(loadPreviewPct());

function isPreviewCollapsed() {
    return localStorage.getItem(PREVIEW_COLLAPSED_KEY) === "1";
}
function applyPreviewCollapsed(collapsed) {
    document.body.classList.toggle("vewd2-preview-collapsed", collapsed);
    const btn = document.querySelector(`#${PANEL_ID} #vewd2-preview-toggle .pi`);
    if (btn) {
        btn.classList.toggle("pi-chevron-up", !collapsed);
        btn.classList.toggle("pi-chevron-down", collapsed);
    }
}
function togglePreviewCollapsed() {
    const next = !isPreviewCollapsed();
    localStorage.setItem(PREVIEW_COLLAPSED_KEY, next ? "1" : "0");
    applyPreviewCollapsed(next);
}

const state = {
    items: [],
    seen: new Set(),
    selected: new Set(),  // every selected index (single click = size 1)
    focus: -1,             // anchor / primary preview
    tagged: new Set(),
    filter: "all",
};

const styleEl = document.createElement("style");
styleEl.textContent = `
    body.vewd2-open .comfyui-menu,
    body.vewd2-open header.comfyui-menu { right: var(--vewd2-w) !important; transition: right 0.2s ease; }
    body.vewd2-open #graph-canvas,
    body.vewd2-open .graph-canvas-container,
    body.vewd2-open .litegraph.litegraph-canvas { width: calc(100vw - var(--vewd2-w)) !important; transition: width 0.2s ease; }
    body.vewd2-resizing #${PANEL_ID},
    body.vewd2-resizing .comfyui-menu,
    body.vewd2-resizing #graph-canvas,
    body.vewd2-resizing .graph-canvas-container,
    body.vewd2-resizing .litegraph.litegraph-canvas { transition: none !important; }

    #${PANEL_ID} {
        position: fixed; top: 0; right: 0;
        width: var(--vewd2-w); height: 100vh;
        background: #111;
        border-left: 1px solid #222;
        box-shadow: -4px 0 16px rgba(0,0,0,0.4);
        transform: translateX(100%);
        transition: transform 0.2s ease;
        z-index: 9000;
        display: flex; flex-direction: column;
        color: #ccc; font-family: inherit;
    }
    #${PANEL_ID}.open { transform: translateX(0); }

    #${PANEL_ID} .v2-handle {
        position: absolute; left: -${HANDLE_W}px; top: 50%;
        transform: translateY(-50%);
        width: ${HANDLE_W}px; height: 56px;
        background: #fff; color: #111;
        border: none; border-radius: 3px 0 0 3px;
        cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        font-family: inherit; font-size: 10px;
        letter-spacing: 0.5px; font-weight: 700;
        writing-mode: vertical-rl; text-orientation: mixed;
        box-shadow: -2px 0 6px rgba(0,0,0,0.3);
        transition: background 0.15s ease;
    }
    #${PANEL_ID} .v2-handle:hover { background: #e8e8e8; }

    #${PANEL_ID} .v2-resize {
        position: absolute; left: 0; top: 0;
        width: 5px; height: 100%;
        cursor: ew-resize;
        background: transparent;
        z-index: 1;
    }
    #${PANEL_ID} .v2-resize:hover,
    body.vewd2-resizing #${PANEL_ID} .v2-resize { background: rgba(255,255,255,0.08); }

    #${PANEL_ID} .v2-count { color: #666; font-size: 11px; flex-shrink: 0; }

    #${PANEL_ID} .v2-preview {
        background: #0a0a0a;
        height: var(--vewd2-preview-h);
        flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        overflow: hidden;
        position: relative;
        border-bottom: 1px solid #222;
        padding: 14px;
        box-sizing: border-box;
        cursor: zoom-in;
    }
    #${PANEL_ID} .v2-preview img,
    #${PANEL_ID} .v2-preview video {
        max-width: 100%; max-height: 100%;
        object-fit: contain;
        user-select: none;
        -webkit-user-drag: auto;
    }
    #${PANEL_ID} .v2-preview { user-select: none; }
    #${PANEL_ID} .v2-preview .v2-empty { color: #444; font-size: 12px; letter-spacing: 1px; }
    #${PANEL_ID} .v2-preview .v2-placeholder {
        color: #666; font-size: 14px; text-align: center; padding: 20px;
    }
    #${PANEL_ID} .v2-preview .v2-placeholder .pi {
        font-size: 36px; display: block; margin-bottom: 10px; color: #444;
    }

    #${PANEL_ID} .v2-hsplit {
        height: 6px;
        background: transparent;
        cursor: ns-resize;
        flex-shrink: 0;
        border-bottom: 1px solid #222;
        margin-top: -1px;
        position: relative;
        z-index: 2;
    }
    #${PANEL_ID} .v2-hsplit:hover,
    body.vewd2-resizing-h #${PANEL_ID} .v2-hsplit { background: rgba(255,255,255,0.08); }

    body.vewd2-preview-collapsed #${PANEL_ID} .v2-preview,
    body.vewd2-preview-collapsed #${PANEL_ID} .v2-hsplit { display: none !important; }

    #${PANEL_ID} .v2-icon-btn {
        background: transparent; border: none;
        color: #888; cursor: pointer;
        padding: 2px 6px; border-radius: 3px;
        font-size: 12px;
    }
    #${PANEL_ID} .v2-icon-btn:hover { color: #fff; background: #222; }

    #${PANEL_ID} .v2-folder-row {
        display: flex; align-items: center; gap: 8px;
        padding: 6px 12px;
        background: #141414;
        border-bottom: 1px solid #222;
        font-size: 11px;
    }
    #${PANEL_ID} .v2-folder-row label { color: #777; flex-shrink: 0; }
    #${PANEL_ID} .v2-folder-row input {
        flex: 1; min-width: 0;
        background: #1a1a1a; border: 1px solid #2a2a2a;
        color: #ccc; font-family: inherit; font-size: 11px;
        padding: 4px 8px; border-radius: 3px;
    }
    #${PANEL_ID} .v2-folder-row input:focus { outline: none; border-color: #444; color: #fff; }

    #${PANEL_ID} .v2-grid-area {
        flex: 1; min-height: 0;
        overflow-y: auto;
        padding: 6px;
        background: #0d0d0d;
    }
    #${PANEL_ID} .v2-grid-area::-webkit-scrollbar { width: 6px; }
    #${PANEL_ID} .v2-grid-area::-webkit-scrollbar-thumb { background: #2a2a2a; border-radius: 3px; }
    #${PANEL_ID} .v2-grid-area::-webkit-scrollbar-thumb:hover { background: #3a3a3a; }

    #${PANEL_ID} .v2-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
        gap: 6px;
    }
    #${PANEL_ID} .v2-tile {
        aspect-ratio: 1;
        background: #050505;
        border: 2px solid transparent;
        border-radius: 4px;
        overflow: hidden;
        cursor: pointer;
        position: relative;
        transition: border-color 0.12s ease;
    }
    #${PANEL_ID} .v2-tile:hover { border-color: #555; }
    #${PANEL_ID} .v2-tile.selected { border-color: #fff; }
    #${PANEL_ID} .v2-tile img,
    #${PANEL_ID} .v2-tile video {
        width: 100%; height: 100%; object-fit: cover; display: block;
    }
    #${PANEL_ID} .v2-tile .v2-icon {
        width: 100%; height: 100%;
        display: flex; align-items: center; justify-content: center;
        color: #555; font-size: 24px;
        background: #181818;
    }
    #${PANEL_ID} .v2-tile .v2-badge {
        position: absolute; bottom: 3px; left: 3px;
        background: rgba(0,0,0,0.75); color: #ddd;
        font-size: 9px; padding: 1px 4px; border-radius: 2px;
        letter-spacing: 0.5px; text-transform: uppercase;
    }
    #${PANEL_ID} .v2-tile.tagged::after {
        content: "♥";
        position: absolute; top: 2px; right: 4px;
        color: #ff5b7d; font-size: 14px;
        text-shadow: 0 0 3px rgba(0,0,0,0.9);
        pointer-events: none;
    }
    #${PANEL_ID} .v2-tile.hidden { display: none; }

    #${PANEL_ID} .v2-toolbar,
    #${PANEL_ID} .v2-actions {
        display: flex; align-items: center; gap: 4px;
        padding: 6px 8px;
        background: #161616;
        font-size: 11px;
        flex-wrap: nowrap;
    }
    #${PANEL_ID} .v2-actions { border-top: 1px solid #222; border-bottom: 1px solid #222; }
    #${PANEL_ID} .v2-toolbar { border-top: 1px solid #222; }
    #${PANEL_ID} .v2-toolbar button,
    #${PANEL_ID} .v2-actions button {
        background: #1f1f1f; border: 1px solid #2a2a2a;
        color: #aaa; cursor: pointer;
        padding: 4px 8px; border-radius: 3px;
        font-family: inherit; font-size: 11px;
        transition: background 0.12s ease, color 0.12s ease;
        display: inline-flex; align-items: center; gap: 4px;
    }
    #${PANEL_ID} .v2-toolbar button:hover,
    #${PANEL_ID} .v2-actions button:hover { background: #2a2a2a; color: #fff; }
    #${PANEL_ID} .v2-toolbar button.active { background: #fff; color: #111; border-color: #fff; }
    #${PANEL_ID} .v2-spacer { flex: 1; }
    #${PANEL_ID} .v2-heart-count { color: #ff5b7d; font-weight: 600; padding: 0 4px; }
    #${PANEL_ID} .v2-heart-btn.tagged { color: #ff5b7d; border-color: #ff5b7d; }
    #${PANEL_ID} #vewd2-download .pi { font-size: 11px; }
    #${PANEL_ID} .v2-filename {
        flex: 1; min-width: 0;
        font-size: 11px; color: #888;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        font-family: ui-monospace, monospace;
    }
    #${PANEL_ID} .v2-brand {
        background: #444; color: #fff;
        padding: 3px 8px; border-radius: 3px;
        font-weight: 700; font-size: 10px;
        letter-spacing: 0.5px;
        display: inline-flex; align-items: center;
        margin-left: 4px;
    }

    /* Fullscreen — image at natural size, scaled DOWN if larger than viewport, never UP */
    .v2-fullscreen {
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.96);
        z-index: 99999;
        display: flex; align-items: center; justify-content: center;
        padding: 32px;
    }
    .v2-fullscreen.hidden { display: none; }
    .v2-fullscreen img,
    .v2-fullscreen video {
        width: auto !important; height: auto !important;
        max-width: calc(100vw - 64px) !important;
        max-height: calc(100vh - 64px) !important;
        object-fit: contain;
        user-select: none;
        -webkit-user-drag: auto;
        display: block;
    }
    .v2-fullscreen .v2-fs-content {
        max-width: calc(100vw - 64px);
        max-height: calc(100vh - 64px);
        display: flex; align-items: center; justify-content: center;
    }
    .v2-fullscreen { user-select: none; }
    .v2-fs-close {
        position: absolute; top: 20px; right: 24px;
        background: rgba(255,255,255,0.08);
        color: #fff; border: none;
        font-size: 22px; cursor: pointer;
        width: 40px; height: 40px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
    }
    .v2-fs-close:hover { background: rgba(255,255,255,0.18); }
    .v2-fs-name {
        position: absolute; bottom: 16px; left: 50%;
        transform: translateX(-50%);
        background: rgba(0,0,0,0.6);
        color: #ccc;
        padding: 4px 12px;
        border-radius: 4px;
        font-size: 12px;
        font-family: ui-monospace, monospace;
    }

    /* Toast — matches old vewd: centered overlay, fade in/out */
    #${PANEL_ID} .v2-toast {
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0,0,0,0.8);
        color: #fff;
        padding: 8px 16px;
        border-radius: 6px;
        font-size: 13px;
        pointer-events: none;
        z-index: 100;
        opacity: 0;
        transition: opacity 0.3s ease;
        text-align: center;
        white-space: pre-wrap;
    }
    #${PANEL_ID} .v2-toast.show { opacity: 1; }
`;
document.head.appendChild(styleEl);

const VIDEO_EXTS = [".mp4", ".webm", ".mov", ".avi", ".mkv"];
const AUDIO_EXTS = [".mp3", ".wav", ".ogg", ".flac", ".aac"];
const MODEL_EXTS = [".glb", ".gltf", ".obj", ".stl"];
const SPLAT_EXTS = [".ply", ".splat"];

function detectType(filename) {
    const i = filename.lastIndexOf(".");
    if (i < 0) return "image";
    const ext = filename.slice(i).toLowerCase();
    if (VIDEO_EXTS.includes(ext)) return "video";
    if (AUDIO_EXTS.includes(ext)) return "audio";
    if (SPLAT_EXTS.includes(ext)) return "splat";
    if (MODEL_EXTS.includes(ext)) return "model";
    return "image";
}

function viewURL(item) {
    const params = new URLSearchParams({
        filename: item.filename,
        subfolder: item.subfolder || "",
        type: item.type || "temp",
        t: String(Date.now()),
    });
    return api.apiURL(`/view?${params.toString()}`);
}

function addMedia(item, fallbackType = "image") {
    const key = `${item.filename}|${item.subfolder || ""}|${item.type || "temp"}`;
    if (state.seen.has(key)) return;
    state.seen.add(key);

    const detected = detectType(item.filename);
    const type = detected !== "image" ? detected : fallbackType;
    const url = viewURL(item);
    const entry = {
        filename: item.filename,
        subfolder: item.subfolder || "",
        type: item.type || "temp",
        mediaType: type,
        url,
    };

    // Newest first — unshift items and bump every stored index by 1.
    state.items.unshift(entry);
    if (state.focus >= 0) state.focus += 1;
    if (state.selected.size) state.selected = new Set([...state.selected].map(i => i + 1));
    if (state.tagged.size) state.tagged = new Set([...state.tagged].map(i => i + 1));
    document.querySelectorAll(`#${PANEL_ID} .v2-tile`).forEach(t => {
        t.dataset.index = String(parseInt(t.dataset.index, 10) + 1);
    });

    renderTile(entry, 0);
    if (state.filter === "hearts") applyOrderAndVisibility();
    updateCount();

    setFocus(0);  // newest wins selection
}

function renderTile(entry, index) {
    const grid = document.querySelector(`#${PANEL_ID} .v2-grid`);
    if (!grid) return;
    const tile = document.createElement("div");
    tile.className = "v2-tile";
    tile.dataset.index = String(index);
    tile.dataset.mediaType = entry.mediaType;

    let inner;
    if (entry.mediaType === "image") {
        inner = `<img src="${entry.url}" alt="" loading="lazy">`;
    } else if (entry.mediaType === "video") {
        inner = `<video src="${entry.url}" muted preload="metadata"></video><span class="v2-badge">vid</span>`;
    } else if (entry.mediaType === "audio") {
        inner = `<div class="v2-icon"><span class="pi pi-volume-up"></span></div><span class="v2-badge">aud</span>`;
    } else if (entry.mediaType === "splat") {
        inner = `<div class="v2-icon"><span class="pi pi-cloud"></span></div><span class="v2-badge">splat</span>`;
    } else {
        inner = `<div class="v2-icon"><span class="pi pi-box"></span></div><span class="v2-badge">3d</span>`;
    }
    tile.innerHTML = inner;
    tile.addEventListener("click", (e) => handleTileClick(e, parseInt(tile.dataset.index, 10)));
    tile.addEventListener("dblclick", (e) => {
        e.preventDefault();
        setFocus(parseInt(tile.dataset.index, 10));
        openFullscreen();
    });
    if (!tileVisible(entry.mediaType, index)) tile.classList.add("hidden");
    grid.prepend(tile);
}

function handleTileClick(e, idx) {
    if (e.ctrlKey || e.metaKey) {
        if (state.selected.has(idx)) state.selected.delete(idx);
        else state.selected.add(idx);
        state.focus = idx;
        afterSelectionChanged();
    } else if (e.shiftKey && state.focus >= 0) {
        const [a, b] = [Math.min(state.focus, idx), Math.max(state.focus, idx)];
        state.selected.clear();
        for (let i = a; i <= b; i++) state.selected.add(i);
        state.focus = idx;
        afterSelectionChanged();
    } else {
        setFocus(idx);
    }
}

function setFocus(idx) {
    if (idx < 0 || idx >= state.items.length) {
        state.focus = -1;
        state.selected.clear();
        afterSelectionChanged();
        return;
    }
    state.selected.clear();
    state.selected.add(idx);
    state.focus = idx;
    afterSelectionChanged();
}

function afterSelectionChanged() {
    refreshTileSelection();
    refreshHeartButton();
    if (state.focus >= 0 && state.focus < state.items.length) {
        const entry = state.items[state.focus];
        renderPreview(entry);
        const fn = document.querySelector(`#${PANEL_ID} .v2-filename`);
        if (fn) fn.textContent = entry.filename;
        scrollTileIntoView(state.focus);
    } else {
        const pv = document.querySelector(`#${PANEL_ID} .v2-preview`);
        if (pv) pv.innerHTML = `<div class="v2-empty">no media</div>`;
        const fn = document.querySelector(`#${PANEL_ID} .v2-filename`);
        if (fn) fn.textContent = "no selection";
    }
    syncSelectionToNode();
    if (_fsEl && !_fsEl.classList.contains("hidden")) openFullscreen();
}

function refreshTileSelection() {
    document.querySelectorAll(`#${PANEL_ID} .v2-tile`).forEach(t => {
        const idx = parseInt(t.dataset.index, 10);
        t.classList.toggle("selected", state.selected.has(idx));
    });
}

function scrollTileIntoView(i) {
    const tile = document.querySelector(`#${PANEL_ID} .v2-tile[data-index="${i}"]`);
    tile?.scrollIntoView({ block: "nearest", inline: "nearest" });
}

function getGridCols() {
    const grid = document.querySelector(`#${PANEL_ID} .v2-grid`);
    if (!grid) return 1;
    return getComputedStyle(grid).gridTemplateColumns.split(" ").length || 1;
}

function visibleTiles() {
    return [...document.querySelectorAll(`#${PANEL_ID} .v2-tile:not(.hidden)`)];
}

function moveSelection(direction) {
    const tiles = visibleTiles();
    if (tiles.length === 0) return;
    let cur = tiles.findIndex(t => parseInt(t.dataset.index, 10) === state.focus);
    if (cur < 0) cur = 0;
    let next = cur;
    if (direction === "left") next = Math.max(0, cur - 1);
    else if (direction === "right") next = Math.min(tiles.length - 1, cur + 1);
    else if (direction === "up") next = Math.max(0, cur - getGridCols());
    else if (direction === "down") next = Math.min(tiles.length - 1, cur + getGridCols());
    setFocus(parseInt(tiles[next].dataset.index, 10));
}

function tileVisible(mediaType, index) {
    const f = state.filter;
    if (f === "all" || f === "hearts") return true;
    return mediaType === f;
}

function applyOrderAndVisibility() {
    const grid = document.querySelector(`#${PANEL_ID} .v2-grid`);
    if (!grid) return;
    const tiles = [...grid.querySelectorAll(".v2-tile")];
    const f = state.filter;
    tiles.sort((a, b) => {
        const ai = parseInt(a.dataset.index, 10);
        const bi = parseInt(b.dataset.index, 10);
        if (f === "hearts") {
            const ah = state.tagged.has(ai);
            const bh = state.tagged.has(bi);
            if (ah !== bh) return ah ? -1 : 1;
        }
        return ai - bi;
    });
    grid.append(...tiles);
    tiles.forEach(t => {
        const idx = parseInt(t.dataset.index, 10);
        t.classList.toggle("hidden", !tileVisible(t.dataset.mediaType, idx));
    });
}

function setFilter(f) {
    state.filter = f;
    document.querySelectorAll(`#${PANEL_ID} .v2-toolbar [data-filter]`).forEach(b => {
        b.classList.toggle("active", b.dataset.filter === f);
    });
    applyOrderAndVisibility();
}

function removeAtIndex(i) {
    if (i < 0 || i >= state.items.length) return;
    const removed = state.items.splice(i, 1)[0];

    // Remap tagged + selected: drop i, decrement anything > i
    const remapSet = (set) => {
        const out = new Set();
        for (const t of set) {
            if (t === i) continue;
            out.add(t > i ? t - 1 : t);
        }
        return out;
    };
    state.tagged = remapSet(state.tagged);
    state.selected = remapSet(state.selected);

    const key = `${removed.filename}|${removed.subfolder}|${removed.type}`;
    state.seen.delete(key);

    const removedTile = document.querySelector(`#${PANEL_ID} .v2-tile[data-index="${i}"]`);
    if (removedTile) removedTile.remove();
    document.querySelectorAll(`#${PANEL_ID} .v2-tile`).forEach(t => {
        const idx = parseInt(t.dataset.index, 10);
        if (idx > i) t.dataset.index = String(idx - 1);
    });

    // Adjust focus
    if (state.focus === i) {
        if (state.items.length === 0) {
            state.focus = -1;
            state.selected.clear();
            afterSelectionChanged();
        } else {
            setFocus(Math.min(i, state.items.length - 1));
        }
    } else if (state.focus > i) {
        state.focus -= 1;
        afterSelectionChanged();
    }

    updateCount();
    updateHeartCount();
    refreshHeartButton();
}

function toggleTagged(i) {
    if (i < 0 || i >= state.items.length) return;
    if (state.tagged.has(i)) state.tagged.delete(i);
    else state.tagged.add(i);
    const tile = document.querySelector(`#${PANEL_ID} .v2-tile[data-index="${i}"]`);
    if (tile) tile.classList.toggle("tagged", state.tagged.has(i));
    if (state.filter === "hearts") applyOrderAndVisibility();
    updateHeartCount();
    refreshHeartButton();
}

function selectionTargets() {
    return state.selected.size ? [...state.selected] : (state.focus >= 0 ? [state.focus] : []);
}

function heartTargets() {
    const targets = selectionTargets();
    if (targets.length === 0) return;
    // If any target is unhearted, heart all; else unheart all
    const anyUntagged = targets.some(i => !state.tagged.has(i));
    targets.forEach(i => {
        const isTagged = state.tagged.has(i);
        if (anyUntagged && !isTagged) toggleTagged(i);
        else if (!anyUntagged && isTagged) toggleTagged(i);
    });
}

function updateHeartCount() {
    const el = document.querySelector(`#${PANEL_ID} .v2-heart-count`);
    if (el) el.textContent = String(state.tagged.size);
}

function syncSelectionToNode() {
    const graph = app.graph;
    if (!graph || !graph._nodes) return;
    if (state.focus < 0) return;
    const item = state.items[state.focus];
    const payload = {
        filename: item.filename,
        subfolder: item.subfolder,
        type: item.type,
        media_type: item.mediaType,
    };
    const value = JSON.stringify(payload);
    for (const node of graph._nodes) {
        if (node.comfyClass !== "VewdSidebar") continue;
        for (const w of node.widgets || []) {
            if (w.name === "selected_media") w.value = value;
        }
    }
}

function getTaggedPayload() {
    return [...state.tagged].sort((a, b) => a - b).map(i => {
        const it = state.items[i];
        return {
            filename: it.filename,
            subfolder: it.subfolder,
            type: it.type,
            media_type: it.mediaType,
        };
    });
}

function getSelectedPayload() {
    return [...state.selected].sort((a, b) => a - b).map(i => {
        const it = state.items[i];
        return {
            filename: it.filename,
            subfolder: it.subfolder,
            type: it.type,
            media_type: it.mediaType,
        };
    });
}

function renderPreview(entry) {
    const pv = document.querySelector(`#${PANEL_ID} .v2-preview`);
    if (!pv) return;
    if (entry.mediaType === "image") {
        pv.innerHTML = `<img src="${entry.url}" alt="${entry.filename}">`;
    } else if (entry.mediaType === "video") {
        pv.innerHTML = `<video src="${entry.url}" controls autoplay loop muted></video>`;
    } else {
        const icon = entry.mediaType === "audio" ? "pi-volume-up"
            : entry.mediaType === "splat" ? "pi-cloud" : "pi-box";
        pv.innerHTML = `<div class="v2-placeholder"><span class="pi ${icon}"></span>${entry.filename}<br><span style="font-size:11px;color:#444;">${entry.mediaType} preview not yet wired</span></div>`;
    }
}

function updateCount() {
    const el = document.querySelector(`#${PANEL_ID} .v2-count`);
    if (el) el.textContent = String(state.items.length);
}

function clearAll() {
    state.items = [];
    state.seen.clear();
    state.selected.clear();
    state.focus = -1;
    state.tagged.clear();
    const grid = document.querySelector(`#${PANEL_ID} .v2-grid`);
    if (grid) grid.innerHTML = "";
    afterSelectionChanged();
    updateCount();
    updateHeartCount();
}

function doDownload() {
    if (state.focus < 0) return showToast("No item selected");
    const item = state.items[state.focus];
    const a = document.createElement("a");
    a.href = item.url;
    a.download = item.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
}

function refreshHeartButton() {
    const tagged = state.focus >= 0 && state.tagged.has(state.focus);
    document.querySelectorAll(`#${PANEL_ID} .v2-heart-toggle`).forEach(btn => {
        btn.classList.toggle("tagged", tagged);
    });
}

let _fsEl = null;
function openFullscreen() {
    if (state.focus < 0) return;
    const entry = state.items[state.focus];
    if (!_fsEl) {
        _fsEl = document.createElement("div");
        _fsEl.className = "v2-fullscreen hidden";
        _fsEl.innerHTML = `<div class="v2-fs-content"></div><button class="v2-fs-close" title="Close (Esc)">×</button><div class="v2-fs-name"></div>`;
        document.body.appendChild(_fsEl);
        _fsEl.querySelector(".v2-fs-close").addEventListener("click", closeFullscreen);
        _fsEl.addEventListener("click", (e) => {
            if (e.target === _fsEl) closeFullscreen();
        });
    }
    const content = _fsEl.querySelector(".v2-fs-content");
    if (entry.mediaType === "image") content.innerHTML = `<img src="${entry.url}">`;
    else if (entry.mediaType === "video") content.innerHTML = `<video src="${entry.url}" controls autoplay loop></video>`;
    else content.innerHTML = `<div style="color:#888;text-align:center;">${entry.mediaType} — fullscreen not yet wired</div>`;
    _fsEl.querySelector(".v2-fs-name").textContent = entry.filename;
    _fsEl.classList.remove("hidden");
}
function closeFullscreen() {
    if (!_fsEl || _fsEl.classList.contains("hidden")) return false;
    _fsEl.classList.add("hidden");
    _fsEl.querySelector(".v2-fs-content").innerHTML = "";
    return true;
}

let _toastEl = null;
let _toastTimer = null;
function showToast(msg, duration = 2000) {
    if (!_toastEl) {
        const panel = document.getElementById(PANEL_ID);
        if (!panel) return;
        _toastEl = document.createElement("div");
        _toastEl.className = "v2-toast";
        panel.appendChild(_toastEl);
    }
    _toastEl.textContent = msg;
    _toastEl.classList.add("show");
    clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => _toastEl.classList.remove("show"), duration);
}

function getFolderValue() {
    const el = document.querySelector(`#${PANEL_ID} #vewd2-folder`);
    return (el?.value || "").trim().replace(/^"|"$/g, "");
}

async function doExport() {
    // Priority: hearted > multi-selection > focus
    let items = [];
    if (state.tagged.size > 0) items = getTaggedPayload();
    else if (state.selected.size > 0) items = getSelectedPayload();
    if (items.length === 0) return showToast("No items to export");
    const folder = getFolderValue();
    const r = await fetch("/vewd2/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items, folder }),
    }).then(r => r.json());
    console.log("[Vewd2] export:", r);
    showToast(r.success ? `Exported ${r.count}` : "Export failed");
}

function buildPanel() {
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
        <button class="v2-handle" title="Toggle Vewd">vewd</button>
        <div class="v2-resize" title="Drag to resize"></div>
        <div class="v2-folder-row">
            <label>folder</label>
            <input id="vewd2-folder" type="text" placeholder="e.g. C:/AI/comfy/output/vewd" spellcheck="false">
            <button id="vewd2-preview-toggle" class="v2-icon-btn" title="Hide / show preview"><span class="pi pi-chevron-up"></span></button>
        </div>
        <div class="v2-preview"><div class="v2-empty">no media</div></div>
        <div class="v2-hsplit" title="Drag to resize"></div>
        <div class="v2-actions">
            <span class="v2-filename">no selection</span>
            <button class="v2-heart-btn v2-heart-toggle" title="Heart selected (Spacebar)">♥</button>
            <button id="vewd2-export" title="Export hearted (or selected) to folder">export</button>
        </div>
        <div class="v2-grid-area"><div class="v2-grid"></div></div>
        <div class="v2-toolbar">
            <span class="v2-count">0</span>
            <button id="vewd2-clear" title="Clear all media">clear</button>
            <button data-filter="all" class="active">all</button>
            <button data-filter="image">img</button>
            <button data-filter="video">vid</button>
            <button data-filter="audio">aud</button>
            <button data-filter="model">3d</button>
            <button data-filter="splat">splat</button>
            <button id="vewd2-heart" class="v2-heart-btn v2-heart-toggle" title="Heart selected (Spacebar)">♥ <span class="v2-heart-count">0</span></button>
            <span class="v2-spacer"></span>
            <button id="vewd2-download" title="Download selected"><span class="pi pi-download"></span></button>
        </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector(".v2-handle").addEventListener("click", togglePanel);
    panel.querySelector("#vewd2-clear").addEventListener("click", clearAll);
    panel.querySelector("#vewd2-preview-toggle").addEventListener("click", togglePreviewCollapsed);
    panel.querySelectorAll(".v2-heart-toggle").forEach(b => b.addEventListener("click", heartTargets));
    panel.querySelector(".v2-preview").addEventListener("click", () => {
        if (state.focus >= 0) openFullscreen();
    });
    panel.querySelector("#vewd2-download").addEventListener("click", doDownload);

    const folderEl = panel.querySelector("#vewd2-folder");
    folderEl.value = localStorage.getItem(FOLDER_KEY) || "";
    folderEl.addEventListener("input", () => localStorage.setItem(FOLDER_KEY, folderEl.value));
    applyPreviewCollapsed(isPreviewCollapsed());

    // Drag horizontal split between preview and grid
    const hsplit = panel.querySelector(".v2-hsplit");
    hsplit.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const rect = panel.getBoundingClientRect();
        document.body.classList.add("vewd2-resizing-h");
        const onMove = (ev) => {
            const pct = ((ev.clientY - rect.top) / rect.height) * 100;
            setPreviewPct(pct);
        };
        const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            document.body.classList.remove("vewd2-resizing-h");
            const finalPct = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--vewd2-preview-h"));
            if (Number.isFinite(finalPct)) localStorage.setItem(PREVIEW_KEY, String(finalPct));
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    });

    // Drag-to-resize from the left edge
    const resizer = panel.querySelector(".v2-resize");
    resizer.addEventListener("mousedown", (e) => {
        e.preventDefault();
        const startX = e.clientX;
        const startW = panel.getBoundingClientRect().width;
        document.body.classList.add("vewd2-resizing");
        const onMove = (ev) => setWidth(startW + (startX - ev.clientX));
        const onUp = () => {
            document.removeEventListener("mousemove", onMove);
            document.removeEventListener("mouseup", onUp);
            document.body.classList.remove("vewd2-resizing");
            const finalW = parseInt(getComputedStyle(panel).width, 10);
            localStorage.setItem(STORAGE_KEY, String(finalW));
            window.dispatchEvent(new Event("resize"));
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
    });

    panel.querySelectorAll(".v2-toolbar [data-filter]").forEach(b => {
        b.addEventListener("click", () => setFilter(b.dataset.filter));
    });
    panel.querySelector("#vewd2-export").addEventListener("click", doExport);

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => {
        if (e.code === "Escape") {
            if (closeFullscreen()) { e.preventDefault(); return; }
        }
        if (!panel.classList.contains("open")) return;
        const tag = document.activeElement?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA") return;

        if (e.code === "Space") {
            e.preventDefault();
            heartTargets();
        } else if (e.code === "Delete" || e.code === "Backspace") {
            e.preventDefault();
            const targets = selectionTargets().sort((a, b) => b - a);
            targets.forEach(removeAtIndex);
        } else if (e.code === "ArrowLeft") { e.preventDefault(); moveSelection("left"); }
        else if (e.code === "ArrowRight") { e.preventDefault(); moveSelection("right"); }
        else if (e.code === "ArrowUp") { e.preventDefault(); moveSelection("up"); }
        else if (e.code === "ArrowDown") { e.preventDefault(); moveSelection("down"); }
        else if (e.code === "KeyF" || e.code === "Enter") { e.preventDefault(); openFullscreen(); }
    });

    return panel;
}

function getPanel() {
    return document.getElementById(PANEL_ID) || buildPanel();
}

function togglePanel() {
    const panel = getPanel();
    const opening = !panel.classList.contains("open");
    panel.classList.toggle("open", opening);
    document.body.classList.toggle("vewd2-open", opening);
    setTimeout(() => window.dispatchEvent(new Event("resize")), 220);
}

function handleExecuted({ detail }) {
    const output = detail?.output;
    if (!output) return;

    if (output.images) output.images.forEach(i => addMedia(i, "image"));

    if (output.gifs) {
        output.gifs.forEach(g => {
            const ext = g.filename?.slice(g.filename.lastIndexOf(".")).toLowerCase();
            addMedia(g, ext === ".gif" ? "image" : "video");
        });
    }

    if (output.videos) output.videos.forEach(v => addMedia(v, "video"));
    if (output.video) {
        const list = Array.isArray(output.video) ? output.video : [output.video];
        list.forEach(v => addMedia(v, "video"));
    }

    const audioSrc = output.audio || output.audios || output.audio_file;
    if (audioSrc) {
        const list = Array.isArray(audioSrc) ? audioSrc : [audioSrc];
        list.forEach(a => addMedia(a, "audio"));
    }

    const meshKeys = ["mesh", "model_file", "GLB", "OBJ", "3d"];
    meshKeys.forEach(k => {
        if (!output[k]) return;
        const list = Array.isArray(output[k]) ? output[k] : [output[k]];
        list.forEach(m => {
            if (typeof m === "string" && m.length > 0) {
                const filename = m.split(/[\/\\]/).pop();
                const subfolder = m.includes("/") ? m.slice(0, m.lastIndexOf("/")) : "";
                m = { filename, subfolder, type: "output" };
            }
            if (m?.filename) addMedia(m, "model");
        });
    });

    if (output.ply_file) {
        const list = Array.isArray(output.ply_file) ? output.ply_file : [output.ply_file];
        list.forEach(p => {
            if (typeof p === "string" && p.length > 0) {
                const filename = p.split(/[\/\\]/).pop();
                const subfolder = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : "";
                addMedia({ filename, subfolder, type: "output" }, "splat");
            }
        });
    }
}

app.registerExtension({
    name: "vewd.sidebar",

    commands: [{
        id: "vewd.sidebar.toggle",
        label: "Toggle Vewd panel",
        icon: "pi pi-images",
        function: togglePanel,
    }],

    async setup() {
        getPanel();
        api.addEventListener("executed", handleExecuted);
        console.log("[Vewd2] panel + auto-capture ready");
    },

    async nodeCreated(node) {
        if (node.comfyClass !== "VewdSidebar") return;
        if (node.widgets) {
            for (const w of node.widgets) {
                if (w.name === "selected_media") {
                    w.type = "hidden";
                    w.computeSize = () => [0, -4];
                }
            }
        }
    },
});
