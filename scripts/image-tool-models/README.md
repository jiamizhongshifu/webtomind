# Official image-tool model pipeline

These assets are not committed to Git and are never bundled into the directory
page. They are converted from the recorded official upstream weights, verified
against PyTorch, uploaded to the production R2 bucket with a digest in the
filename, and fetched only when a user starts the matching tool.

## Reproduce

Use Python 3.12 and the exact package versions in `manifest.json`. Clone each
repository at its recorded commit, download the official weight, verify its
SHA-256, then run:

```bash
python scripts/image-tool-models/export_official_models.py \
  --model all \
  --real-esrgan-source /path/to/Real-ESRGAN \
  --real-esrgan-weight /path/to/RealESRGAN_x4plus.pth \
  --scunet-source /path/to/SCUNet \
  --scunet-weight /path/to/scunet_color_real_psnr.pth \
  --lama-source /path/to/lama \
  --lama-weight /path/to/big-lama/models/best.ckpt \
  --output-dir /path/to/onnx
```

The exporter checks the upstream weight digests, ONNX graph validity, fixed
input/output shapes, finite CPU inference, PyTorch/ONNX numerical agreement,
and the final file digests recorded in `manifest.json`.

LaMa uses ONNX `DFT` operators produced from the official Fast Fourier
Convolution blocks. The production worker runs it on a 256×256 crop containing
the mask plus context, then composites only inside the original mask. This
keeps every pixel outside the mask byte-for-byte unchanged while avoiding a
full-image 199 MB model pass.

## Publish

Upload each verified output to:

`webtomind-media-prod/models/image-tools/<outputFile>`

with `Content-Type: application/octet-stream` and
`Cache-Control: public, max-age=31536000, immutable`. The route manifest in
`src/shared/image-tool-models.ts` must contain the same full SHA-256. Verify a
normal request, `Range: bytes=0-1023`, `X-Model-SHA256`, CORS, and immutable
cache headers before enabling the UI.
