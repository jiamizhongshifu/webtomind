import base64
import sys
import unittest
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))

from visible_inpaint import inpaint_visible_image


def encode_image(image: np.ndarray, suffix: str = ".png") -> bytes:
    ok, encoded = cv2.imencode(suffix, image)
    if not ok:
        raise AssertionError(f"could not encode {suffix}")
    return bytes(encoded)


class VisibleInpaintTests(unittest.TestCase):
    def setUp(self) -> None:
        height, width = 96, 128
        image = np.zeros((height, width, 3), dtype=np.uint8)
        for y in range(height):
            image[y, :, 0] = y * 2
            image[y, :, 1] = np.arange(width, dtype=np.uint8)
            image[y, :, 2] = 180
        cv2.rectangle(image, (82, 66), (116, 86), (20, 20, 240), thickness=-1)
        self.image = image
        self.data = encode_image(image)

    def test_repairs_user_selected_box_and_returns_report(self) -> None:
        repaired, report = inpaint_visible_image(
            self.data,
            ".png",
            {
                "visible_boxes": [{"x": 82 / 128, "y": 66 / 96, "width": 34 / 128, "height": 20 / 96}],
                "visible_padding_px": 0,
                "visible_expand_px": 0,
            },
        )

        result = cv2.imdecode(np.frombuffer(repaired, dtype=np.uint8), cv2.IMREAD_COLOR)
        self.assertIsNotNone(result)
        self.assertEqual(result.shape, self.image.shape)
        self.assertTrue(report["applied"])
        self.assertEqual(report["box_count"], 1)
        self.assertGreater(report["mask_pixels"], 0)

    def test_accepts_a_png_mask_and_preserves_dimensions(self) -> None:
        mask = np.zeros(self.image.shape[:2], dtype=np.uint8)
        mask[66:87, 82:117] = 255
        mask_base64 = base64.b64encode(encode_image(mask)).decode("ascii")

        repaired, report = inpaint_visible_image(
            self.data,
            ".png",
            {"visible_mask": mask_base64, "visible_expand_px": 0},
        )

        result = cv2.imdecode(np.frombuffer(repaired, dtype=np.uint8), cv2.IMREAD_COLOR)
        self.assertIsNotNone(result)
        self.assertEqual(result.shape, self.image.shape)
        self.assertEqual(report["box_count"], 0)
        self.assertAlmostEqual(report["mask_ratio"], (21 * 35) / (96 * 128), places=5)

    def test_rejects_empty_or_oversized_masks(self) -> None:
        with self.assertRaisesRegex(ValueError, "select at least one"):
            inpaint_visible_image(
                self.data,
                ".png",
                {"visible_boxes": [], "visible_expand_px": 0},
            )

        with self.assertRaisesRegex(ValueError, "45%"):
            inpaint_visible_image(
                self.data,
                ".png",
                {
                    "visible_boxes": [{"x": 0, "y": 0, "width": 1, "height": 1}],
                    "visible_expand_px": 0,
                },
            )

    def test_rejects_mask_with_wrong_dimensions(self) -> None:
        mask = np.zeros((10, 10), dtype=np.uint8)
        mask_base64 = base64.b64encode(encode_image(mask)).decode("ascii")
        with self.assertRaisesRegex(ValueError, "dimensions"):
            inpaint_visible_image(
                self.data,
                ".png",
                {"visible_mask": mask_base64, "visible_expand_px": 0},
            )


if __name__ == "__main__":
    unittest.main()
