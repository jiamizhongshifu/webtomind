"""Extend the upstream service with user-masked visible watermark repair."""

from __future__ import annotations

import argparse
import base64
import os
import sys
from http import HTTPStatus
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse

sys.path.insert(0, "/app/scripts")
sys.path.insert(0, str(Path(__file__).resolve().parent))

import server as core  # type: ignore[import-not-found]
from visible_inpaint import inpaint_visible_image

VISIBLE_OPTION_KEYS = {
    "remove_visible",
    "visible_mask",
    "visible_boxes",
    "visible_padding_px",
    "visible_expand_px",
    "visible_inpaint_radius",
    "visible_inpaint_method",
}


class VisibleRepairError(RuntimeError):
    """Internal failure with a safe stage identifier for the HTTP boundary."""

    def __init__(self, stage: str, cause: Exception) -> None:
        super().__init__(stage)
        self.stage = stage
        self.cause = cause


def _visible_capabilities() -> dict[str, object]:
    return {
        "manual_mask": True,
        "manual_boxes": True,
        "auto_detect": False,
        "methods": ["telea", "ns"],
    }


def _clean_with_visible(data: bytes, name: str, body: dict[str, object]) -> dict[str, object]:
    raw_options = body.get("options")
    if raw_options is None:
        raw_options = {}
    if not isinstance(raw_options, dict):
        raise ValueError("'options' must be an object")
    if raw_options.get("remove_visible") is not True:
        raise ValueError("remove_visible must be true for visible repair")

    visible_options = {
        key: value for key, value in raw_options.items() if key in VISIBLE_OPTION_KEYS
    }
    core_options = {
        key: value for key, value in raw_options.items() if key not in VISIBLE_OPTION_KEYS
    }
    extension = Path(name).suffix or ".png"
    # A visible selection is a pixel operation on the uploaded image. Keep it
    # independent from the upstream metadata/pixel pipeline: the upstream
    # cleaner is intentionally format-oriented and may reject small or unusual
    # image inputs before the selected repair can run.
    try:
        cleaned_bytes, visible_report = inpaint_visible_image(
            data, extension, visible_options
        )
    except ValueError:
        raise
    except Exception as exc:
        raise VisibleRepairError("visible_inpaint", exc) from exc

    # Preserve the upstream contract for the other requested cleanup layers.
    # This runs after the selected repair so metadata-only cleaning cannot make
    # the mask refer to a different encoded image than the user's preview.
    if core_options:
        try:
            cleaned = core._clean_payload(cleaned_bytes, name, core_options)
        except ValueError:
            raise
        except Exception as exc:
            raise VisibleRepairError("upstream_cleanup", exc) from exc
        cleaned_bytes = base64.b64decode(str(cleaned["cleaned"]), validate=True)
    else:
        cleaned = {
            "ok": True,
            "kind": "image",
            "cleaned": base64.b64encode(cleaned_bytes).decode("ascii"),
            "report": {},
        }
    report = cleaned.get("report")
    if not isinstance(report, dict):
        report = {}
    report["visible_removal"] = visible_report
    cleaned["report"] = report
    return cleaned


class VisibleHandler(core.Handler):
    def do_GET(self) -> None:
        if urlparse(self.path).path != "/capabilities":
            super().do_GET()
            return
        if not self._authorized():
            self._respond(HTTPStatus.UNAUTHORIZED, {"ok": False, "error": "unauthorized"})
            return
        self._respond(
            HTTPStatus.OK,
            {"ok": True, **core.capabilities(), "visible_removal": _visible_capabilities()},
        )

    def _handle_clean(self, data: bytes, name: str, body: dict[str, object]) -> None:
        raw_options = body.get("options")
        has_visible = isinstance(raw_options, dict) and raw_options.get("remove_visible") is True
        if not has_visible:
            super()._handle_clean(data, name, body)
            return
        try:
            payload = _clean_with_visible(data, name, body)
        except VisibleRepairError as exc:
            core.eprint(f"visible repair failed at {exc.stage}: {exc.cause!r}")
            self._respond(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {
                    "ok": False,
                    "error": "internal error",
                    "code": "VISIBLE_REPAIR_FAILED",
                    "stage": exc.stage,
                },
            )
            return
        except ValueError as exc:
            self._respond(
                HTTPStatus.BAD_REQUEST,
                {"ok": False, "error": str(exc)},
            )
            return
        self._respond(HTTPStatus.OK, payload)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default=os.environ.get("WATERMARKS_SERVER_HOST", "127.0.0.1"))
    parser.add_argument(
        "--port", type=int, default=int(os.environ.get("WATERMARKS_SERVER_PORT", "8765"))
    )
    parser.add_argument("--api-key", default=core.API_KEY)
    parser.add_argument("-V", "--version", action="store_true")
    args = parser.parse_args()
    if args.version:
        print(core.VERSION)
        return 0

    core.API_KEY = args.api_key
    server = ThreadingHTTPServer((args.host, args.port), VisibleHandler)
    core.eprint(
        f"watermarks-remover visible service {core.VERSION} on http://{args.host}:{args.port}"
    )
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        core.eprint("shutting down")
        server.shutdown()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
