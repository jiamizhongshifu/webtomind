# Keep the upstream metadata/container pipeline pinned, then add our own
# deterministic visible-watermark repair layer. Wrangler builds this Dockerfile
# for Cloudflare Containers.
FROM ghcr.io/guillaumemeyer/watermarks-remover@sha256:c4ad0dcefff63fdb978f37103e9bd4d5e4367a2835c68668f6b72eccea350d47

USER root

# The upstream digest is intentionally pinned for supply-chain reproducibility,
# but its Debian layer can age between upstream releases. Apply the current
# Debian security updates to the image that actually runs in production.
RUN apt-get update \
    && apt-get dist-upgrade -y --no-install-recommends \
    && apt-get install -y --no-install-recommends libxcb1 libglib2.0-0 \
    && msgpack_debs="$(dpkg-query -W -f='${binary:Package} ${db:Status-Status}\n' 2>/dev/null | awk '$1 ~ /msgpack/ && $2 == "installed" {print $1}')" \
    && if [ -n "$msgpack_debs" ]; then apt-get purge -y $msgpack_debs; fi \
    && rm -rf /var/lib/apt/lists/*

# OpenCV's classical inpainting is intentionally used for user-selected masks:
# it is lightweight enough for a CPU Container and does not silently claim an
# unlicensed or unavailable generative model is present.
RUN python3 - <<'PY'
from pathlib import Path
import shutil

for root in (
    Path("/usr/local/lib"),
    Path("/usr/lib"),
    Path("/root/.local/lib"),
    Path("/opt"),
):
    for package in ("msgpack", "setuptools"):
        for pattern in (
            f"python*/site-packages/{package}",
            f"python*/site-packages/{package}-*.dist-info",
            f"python*/site-packages/{package}-*.egg-info",
            f"python*/dist-packages/{package}",
            f"python*/dist-packages/{package}-*.dist-info",
            f"python*/dist-packages/{package}-*.egg-info",
        ):
            for path in root.glob(pattern):
                if path.is_dir():
                    shutil.rmtree(path)
                elif path.exists():
                    path.unlink()
PY
RUN python3 -m pip uninstall -y msgpack setuptools || true
RUN python3 -m pip install --no-cache-dir \
      "msgpack==1.2.1" \
      "setuptools==84.0.0" \
    && python3 -m pip install --no-cache-dir "opencv-python-headless==4.13.0.90"
RUN python3 - <<'PY'
from importlib import metadata

assert metadata.version("msgpack") == "1.2.1"
assert metadata.version("setuptools") == "84.0.0"
PY

COPY visible_inpaint.py /app/visible_inpaint.py
COPY visible_server.py /app/visible_server.py
RUN chmod 0644 /app/visible_inpaint.py /app/visible_server.py

USER remover

ENTRYPOINT ["python3"]
CMD ["/app/visible_server.py", "--host", "0.0.0.0"]
