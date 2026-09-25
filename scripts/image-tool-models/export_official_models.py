#!/usr/bin/env python3
"""Reproducible ONNX exports for WebToMind's official image-tool weights."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import types
from pathlib import Path

import numpy as np
import onnx
import onnxruntime as ort
import torch


ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = Path(__file__).with_name("manifest.json")


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def model_record(model_id: str) -> dict:
    manifest = json.loads(MANIFEST_PATH.read_text())
    return next(item for item in manifest["models"] if item["id"] == model_id)


def require_digest(path: Path, expected: str, label: str) -> None:
    actual = sha256(path)
    if actual != expected:
        raise RuntimeError(f"{label} digest mismatch: expected {expected}, got {actual}")


def verify_export(
    path: Path,
    expected_digest: str,
    feeds: dict[str, np.ndarray],
    expected_shape: list[int],
) -> np.ndarray:
    onnx.checker.check_model(onnx.load(path))
    session = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    output = session.run(None, feeds)[0]
    if list(output.shape) != expected_shape:
        raise RuntimeError(f"{path.name} output shape is {output.shape}")
    if not np.isfinite(output).all():
        raise RuntimeError(f"{path.name} produced non-finite output")
    require_digest(path, expected_digest, path.name)
    return output


def export_real_esrgan(source: Path, weight: Path, output_dir: Path) -> None:
    record = model_record("real-esrgan-x4plus")
    require_digest(weight, record["weightSha256"], weight.name)
    sys.path.insert(0, str(source))
    import torchvision.transforms.functional as functional

    compatibility = types.ModuleType("torchvision.transforms.functional_tensor")
    compatibility.rgb_to_grayscale = functional.rgb_to_grayscale
    sys.modules[compatibility.__name__] = compatibility
    from basicsr.archs.rrdbnet_arch import RRDBNet

    model = RRDBNet(
        num_in_ch=3,
        num_out_ch=3,
        num_feat=64,
        num_block=23,
        num_grow_ch=32,
        scale=4,
    )
    state = torch.load(weight, map_location="cpu", weights_only=True)
    model.load_state_dict(state["params_ema"], strict=True)
    model.eval()
    sample = torch.rand(record["inputShape"], generator=torch.Generator().manual_seed(7))
    output = output_dir / record["outputFile"]
    torch.onnx.export(
        model,
        sample,
        output,
        input_names=["input"],
        output_names=["output"],
        opset_version=18,
    )
    with torch.no_grad():
        expected = model(sample).numpy()
    actual = verify_export(
        output,
        record["outputSha256"],
        {"input": sample.numpy()},
        record["outputShape"],
    )
    if np.max(np.abs(expected - actual)) > 1e-4:
        raise RuntimeError("Real-ESRGAN PyTorch/ONNX error exceeds 1e-4")


def export_scunet(source: Path, weight: Path, output_dir: Path) -> None:
    record = model_record("scunet-color-real-psnr")
    require_digest(weight, record["weightSha256"], weight.name)
    sys.path.insert(0, str(source))
    from models.network_scunet import SCUNet

    model = SCUNet(
        in_nc=3,
        config=[4, 4, 4, 4, 4, 4, 4],
        dim=64,
        input_resolution=256,
    )
    model.load_state_dict(
        torch.load(weight, map_location="cpu", weights_only=True), strict=True
    )
    model.eval()
    sample = torch.rand(record["inputShape"], generator=torch.Generator().manual_seed(7))
    output = output_dir / record["outputFile"]
    torch.onnx.export(
        model,
        sample,
        output,
        input_names=["input"],
        output_names=["output"],
        opset_version=18,
    )
    with torch.no_grad():
        expected = model(sample).numpy()
    actual = verify_export(
        output,
        record["outputSha256"],
        {"input": sample.numpy()},
        record["outputShape"],
    )
    if np.max(np.abs(expected - actual)) > 1e-4:
        raise RuntimeError("SCUNet PyTorch/ONNX error exceeds 1e-4")


def export_lama(source: Path, weight: Path, output_dir: Path) -> None:
    record = model_record("lama")
    require_digest(weight, record["weightSha256"], weight.name)
    sys.path.insert(0, str(source))
    from saicinpainting.training.modules.ffc import FFCResNetGenerator

    generator = FFCResNetGenerator(
        input_nc=4,
        output_nc=3,
        ngf=64,
        n_downsampling=3,
        n_blocks=18,
        add_out_act="sigmoid",
        init_conv_kwargs={"ratio_gin": 0, "ratio_gout": 0, "enable_lfu": False},
        downsample_conv_kwargs={
            "ratio_gin": 0,
            "ratio_gout": 0,
            "enable_lfu": False,
        },
        resnet_conv_kwargs={
            "ratio_gin": 0.75,
            "ratio_gout": 0.75,
            "enable_lfu": False,
        },
    )
    checkpoint = torch.load(weight, map_location="cpu", weights_only=False)
    generator.load_state_dict(
        {
            key.removeprefix("generator."): value
            for key, value in checkpoint["state_dict"].items()
            if key.startswith("generator.")
        },
        strict=True,
    )
    generator.eval()

    class Wrapper(torch.nn.Module):
        def __init__(self, model: torch.nn.Module):
            super().__init__()
            self.model = model

        def forward(self, image: torch.Tensor, mask: torch.Tensor) -> torch.Tensor:
            predicted = self.model(torch.cat((image * (1 - mask), mask), dim=1))
            return mask * predicted + (1 - mask) * image

    wrapper = Wrapper(generator).eval()
    torch.manual_seed(7)
    image = torch.rand(record["inputShapes"]["image"])
    mask = torch.zeros(record["inputShapes"]["mask"])
    mask[:, :, 64:192, 80:176] = 1
    output = output_dir / record["outputFile"]
    torch.onnx.export(
        wrapper,
        (image, mask),
        output,
        input_names=["image", "mask"],
        output_names=["output"],
        opset_version=18,
        dynamo=True,
        external_data=False,
    )
    with torch.no_grad():
        expected = wrapper(image, mask).numpy()
    actual = verify_export(
        output,
        record["outputSha256"],
        {"image": image.numpy(), "mask": mask.numpy()},
        record["outputShape"],
    )
    if np.max(np.abs(expected - actual)) > 1e-4:
        raise RuntimeError("LaMa PyTorch/ONNX error exceeds 1e-4")
    if np.max(np.abs((actual - image.numpy()) * (1 - mask.numpy()))) != 0:
        raise RuntimeError("LaMa changed pixels outside the mask")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model",
        choices=["all", "real-esrgan", "scunet", "lama"],
        default="all",
    )
    parser.add_argument("--real-esrgan-source", type=Path)
    parser.add_argument("--real-esrgan-weight", type=Path)
    parser.add_argument("--scunet-source", type=Path)
    parser.add_argument("--scunet-weight", type=Path)
    parser.add_argument("--lama-source", type=Path)
    parser.add_argument("--lama-weight", type=Path)
    parser.add_argument("--output-dir", type=Path, required=True)
    args = parser.parse_args()
    args.output_dir.mkdir(parents=True, exist_ok=True)
    if args.model in {"all", "real-esrgan"}:
        export_real_esrgan(
            args.real_esrgan_source, args.real_esrgan_weight, args.output_dir
        )
    if args.model in {"all", "scunet"}:
        export_scunet(args.scunet_source, args.scunet_weight, args.output_dir)
    if args.model in {"all", "lama"}:
        export_lama(args.lama_source, args.lama_weight, args.output_dir)
    print("All requested model exports verified.")


if __name__ == "__main__":
    main()
