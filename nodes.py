import json
import shutil
import numpy as np
import torch
from pathlib import Path
from PIL import Image
import folder_paths
from aiohttp import web
from server import PromptServer


IMAGE_EXTS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".gif"}


def _type_dirs():
    return {
        "temp": folder_paths.get_temp_directory(),
        "output": folder_paths.get_output_directory(),
        "input": folder_paths.get_input_directory(),
    }


def _resolve_path(item):
    base = _type_dirs().get(item.get("type", "temp"), folder_paths.get_temp_directory())
    sub = item.get("subfolder", "")
    fn = item.get("filename", "")
    return Path(base) / sub / fn if sub else Path(base) / fn


class VewdSidebar:
    """Thin shell node — UI lives in the right-side panel.
    Sidebar writes selection JSON into selected_media; here we load and return it."""

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "optional": {
                "selected_media": ("STRING", {"default": ""}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("output",)
    FUNCTION = "process"
    CATEGORY = "image"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("NaN")

    def process(self, selected_media="", unique_id=None):
        img_tensor = None

        if selected_media:
            try:
                parsed = json.loads(selected_media)
                items = parsed if isinstance(parsed, list) else [parsed]

                tensors = []
                target_size = None
                for it in items:
                    fn = it.get("filename", "")
                    if not fn:
                        continue
                    ext = Path(fn).suffix.lower()
                    if ext not in IMAGE_EXTS:
                        continue  # skip video/audio/3D for now — image output only
                    p = _resolve_path(it)
                    if not p.exists():
                        print(f"[Vewd2] file not found: {p}")
                        continue
                    img = Image.open(p).convert("RGB")
                    if target_size is None:
                        target_size = img.size
                    elif img.size != target_size:
                        img = img.resize(target_size, Image.LANCZOS)
                    arr = np.array(img).astype(np.float32) / 255.0
                    tensors.append(torch.from_numpy(arr).unsqueeze(0))

                if tensors:
                    img_tensor = torch.cat(tensors, dim=0)
                    print(f"[Vewd2] loaded {img_tensor.shape[0]} image(s)")
            except Exception as e:
                print(f"[Vewd2] selected_media parse failed: {e}")

        if img_tensor is None:
            img_tensor = torch.zeros(1, 512, 512, 3)
        return (img_tensor,)


def _copy_items_to(items, dest_dir):
    dest_dir.mkdir(parents=True, exist_ok=True)
    count = 0
    for it in items:
        src = _resolve_path(it)
        if not src.exists():
            print(f"[Vewd2] save: missing {src}")
            continue
        dst = dest_dir / src.name
        # Avoid overwriting — append (1), (2)…
        n = 1
        while dst.exists():
            dst = dest_dir / f"{src.stem} ({n}){src.suffix}"
            n += 1
        shutil.copy2(src, dst)
        count += 1
    return count


@PromptServer.instance.routes.post("/vewd2/export")
async def export_items(request):
    try:
        data = await request.json()
        items = data.get("items", [])
        folder = (data.get("folder") or "").strip().strip('"')
        if not items:
            return web.json_response({"success": False, "error": "no items"})
        dest = Path(folder) if folder else Path(folder_paths.get_output_directory()) / "vewd2"
        count = _copy_items_to(items, dest)
        return web.json_response({"success": True, "count": count, "folder": str(dest)})
    except Exception as e:
        return web.json_response({"success": False, "error": str(e)})


NODE_CLASS_MAPPINGS = {
    "VewdSidebar": VewdSidebar,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "VewdSidebar": "Vewd Tab",
}
