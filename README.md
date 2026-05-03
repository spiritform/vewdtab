# Vewd Tab

A side panel companion to [Vewd](https://github.com/spiritform/vewd). A persistent right-side tab in ComfyUI for reviewing, hearting, and exporting generated media — auto-captures images, video, audio, 3D, and splats from any workflow.

## Why Vewd Tab?

Vewd Tab keeps the viewer **outside** the canvas. The grid lives in a slide-out side panel that pushes the canvas over so nothing gets covered, persists across workflow switches, and resizes to whatever space you want to give it. No more wrestling with node-height layout — review, like, and export without losing your place.

## Features

- **Right-side slide panel** — drag the white `vewd` tab to open/close, drag the left edge to resize the panel width
- **Vertical layout** — full-size preview on top, scrolling thumbnail grid below, draggable horizontal split between them
- **Auto-capture** — every generation lands in the grid: images, video, audio, 3D models, Gaussian splats
- **Fullscreen viewer** — double-click any tile (or press `F`/`Enter`) to view at natural size, scaled down only if larger than the screen
- **Multi-select** — Ctrl/Cmd-click to add, Shift-click for ranges, like or delete a whole batch at once
- **Hearts + filters** — Spacebar to heart, sort or filter by likes, type filters for img / vid / aud / 3d / splat
- **Folder export** — set a destination folder once, click `export` to copy hearted (or selected) files there
- **Keyboard navigation** — arrow keys to move through the grid, Delete to remove, Esc to close fullscreen
- **Drag-to-LoadImage** — drag any thumbnail straight onto a `Load Image` node to use it as input

## Installation

### Via Git

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/spiritform/vewdtab.git
```

Restart ComfyUI.

### Manual

Download and extract to `ComfyUI/custom_nodes/vewdtab/`, then restart ComfyUI.

## Usage

1. Click the small white **`vewd`** tab on the right edge of the screen — the panel slides in
2. Run any workflow — generated media auto-appears in the grid (newest first)
3. Click a tile to preview, double-click for fullscreen
4. Spacebar to heart your favorites
5. Set an export folder at the top of the panel and click **export**

To use the selection in a workflow, add the **Vewd Tab** node (found under `image`) and wire its `output` into anything downstream — when you click a tile in the panel, the next queue uses that image.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| ← → ↑ ↓ | Navigate grid |
| Spacebar | Heart / unheart selection |
| F / Enter | Open fullscreen |
| Esc | Close fullscreen |
| Delete / Backspace | Remove from viewer (file stays on disk) |
| Ctrl/Cmd + click | Toggle item in selection |
| Shift + click | Range select |

## License

MIT
