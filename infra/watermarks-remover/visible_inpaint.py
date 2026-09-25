"""Visible watermark inpainting helpers for the private HTTP service.

The client supplies a user-selected mask or normalized rectangles. This is
deliberate: arbitrary logo/text detection is not reliable without a trained
detector, and silently guessing a mask can destroy unrelated image content.
"""

from __future__ import annotations

import base64
import binascii
import math
from typing import Any

import cv2
import numpy as np

MAX_BOXES = 8
MAX_MASK_BYTES = 8 * 1024 * 1024
MAX_MASK_RATIO = 0.45
MAX_PADDING_PX = 32
MAX_VISIBLE_IMAGE_PIXELS = 30_000_000


def _decode_base64(value: str) -> bytes:
    raw = value.split(",", 1)[1] if value.startswith("data:") and "," in value else value
    if len(raw) > (MAX_MASK_BYTES * 4 // 3) + 8:
        raise ValueError("visible_mask is too large")
    try:
        decoded = base64.b64decode(raw, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("visible_mask must be valid base64") from exc
    if len(decoded) > MAX_MASK_BYTES:
        raise ValueError("visible_mask is too large")
    return decoded


def _number(value: Any, label: str) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError(f"{label} must be a number")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError(f"{label} must be finite")
    return result


def _normalized_box_mask(
    shape: tuple[int, int], boxes: Any, padding_px: int
) -> tuple[np.ndarray, int]:
    height, width = shape
    if boxes is None:
        return np.zeros((height, width), dtype=np.uint8), 0
    if not isinstance(boxes, list) or len(boxes) > MAX_BOXES:
        raise ValueError(f"visible_boxes must be an array with at most {MAX_BOXES} items")

    mask = np.zeros((height, width), dtype=np.uint8)
    count = 0
    for box in boxes:
        if not isinstance(box, dict):
            raise ValueError("each visible_boxes item must be an object")
        x = _number(box.get("x"), "visible_boxes.x")
        y = _number(box.get("y"), "visible_boxes.y")
        box_width = _number(box.get("width"), "visible_boxes.width")
        box_height = _number(box.get("height"), "visible_boxes.height")
        if (
            x < 0
            or y < 0
            or box_width <= 0
            or box_height <= 0
            or x + box_width > 1
            or y + box_height > 1
        ):
            raise ValueError("visible_boxes coordinates must stay within the image")
        left = max(0, int(round(x * width)) - padding_px)
        top = max(0, int(round(y * height)) - padding_px)
        right = min(width, int(round((x + box_width) * width)) + padding_px)
        bottom = min(height, int(round((y + box_height) * height)) + padding_px)
        mask[top:bottom, left:right] = 255
        count += 1
    return mask, count


def _mask_from_options(
    shape: tuple[int, int], options: dict[str, Any]
) -> tuple[np.ndarray, int]:
    height, width = shape
    padding_value = _number(options.get("visible_padding_px", 4), "visible_padding_px")
    if not padding_value.is_integer() or padding_value < 0 or padding_value > MAX_PADDING_PX:
        raise ValueError("visible_padding_px must be an integer between 0 and 32")
    mask, box_count = _normalized_box_mask(
        shape,
        options.get("visible_boxes"),
        int(padding_value),
    )
    if options.get("visible_mask") is not None:
        if not isinstance(options["visible_mask"], str):
            raise ValueError("visible_mask must be a base64 string")
        mask_bytes = _decode_base64(options["visible_mask"])
        decoded = cv2.imdecode(np.frombuffer(mask_bytes, dtype=np.uint8), cv2.IMREAD_GRAYSCALE)
        if decoded is None or decoded.shape != (height, width):
            raise ValueError("visible_mask dimensions must match the uploaded image")
        mask = np.maximum(mask, np.where(decoded > 0, 255, 0).astype(np.uint8))

    expand_value = _number(options.get("visible_expand_px", 3), "visible_expand_px")
    if not expand_value.is_integer() or expand_value < 0 or expand_value > 32:
        raise ValueError("visible_expand_px must be an integer between 0 and 32")
    expand_px = int(expand_value)
    if expand_px:
        kernel_size = expand_px * 2 + 1
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
        mask = cv2.dilate(mask, kernel)

    masked_ratio = float(np.count_nonzero(mask)) / float(width * height)
    if masked_ratio <= 0:
        raise ValueError("select at least one visible watermark area")
    if masked_ratio > MAX_MASK_RATIO:
        raise ValueError("visible watermark area cannot cover more than 45% of the image")
    return mask, box_count


def inpaint_visible_image(data: bytes, extension: str, options: dict[str, Any]) -> tuple[bytes, dict[str, Any]]:
    """Inpaint user-selected visible watermark regions and return encoded bytes."""

    source = cv2.imdecode(np.frombuffer(data, dtype=np.uint8), cv2.IMREAD_UNCHANGED)
    if source is None or source.ndim not in (2, 3):
        raise ValueError("uploaded image could not be decoded for visible removal")
    if source.ndim == 2:
        source = cv2.cvtColor(source, cv2.COLOR_GRAY2BGR)

    height, width = source.shape[:2]
    if width * height > MAX_VISIBLE_IMAGE_PIXELS:
        raise ValueError("visible removal supports images up to 30 million pixels")
    mask, box_count = _mask_from_options((height, width), options)
    suffix = extension.lower() or ".png"
    if suffix == ".jpeg":
        suffix = ".jpg"
    if suffix not in (".png", ".jpg", ".webp", ".bmp", ".tif", ".tiff"):
        raise ValueError("visible removal supports PNG, JPEG, WebP, BMP, or TIFF")
    channels = source.shape[2]
    alpha = source[:, :, 3] if channels == 4 else None
    bgr = source[:, :, :3] if channels >= 3 else source

    radius = _number(options.get("visible_inpaint_radius", 3), "visible_inpaint_radius")
    if radius <= 0 or radius > 15:
        raise ValueError("visible_inpaint_radius must be greater than 0 and at most 15")
    method = options.get("visible_inpaint_method", "telea")
    if method not in ("telea", "ns"):
        raise ValueError("visible_inpaint_method must be telea or ns")
    flags = cv2.INPAINT_NS if method == "ns" else cv2.INPAINT_TELEA
    repaired = cv2.inpaint(bgr, mask, float(radius), flags)
    if alpha is not None and suffix != ".jpg":
        repaired = np.dstack((repaired, alpha))
    encode_options: list[int] = []
    if suffix == ".jpg":
        encode_options = [cv2.IMWRITE_JPEG_QUALITY, 95]
    elif suffix == ".png":
        encode_options = [cv2.IMWRITE_PNG_COMPRESSION, 3]
    elif suffix == ".webp":
        encode_options = [cv2.IMWRITE_WEBP_QUALITY, 95]
    ok, encoded = cv2.imencode(suffix, repaired, encode_options)
    if not ok:
        raise ValueError("visible removal could not encode the repaired image")

    return bytes(encoded), {
        "available": True,
        "applied": True,
        "method": method,
        "box_count": box_count,
        "mask_pixels": int(np.count_nonzero(mask)),
        "mask_ratio": round(float(np.count_nonzero(mask)) / float(width * height), 6),
        "width": width,
        "height": height,
        "format": suffix[1:],
    }
