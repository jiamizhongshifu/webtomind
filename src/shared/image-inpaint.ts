export interface PixelRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function findMaskBounds(
  alpha: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  threshold = 16
): PixelRect | null {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] < threshold) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  if (right < left || bottom < top) return null;
  return {
    x: left,
    y: top,
    width: right - left + 1,
    height: bottom - top + 1
  };
}

export function expandMaskContext(
  rect: PixelRect,
  imageWidth: number,
  imageHeight: number,
  padding: number,
  minimumSize = 64
): PixelRect {
  const desiredWidth = Math.min(
    imageWidth,
    Math.max(minimumSize, rect.width + padding * 2)
  );
  const desiredHeight = Math.min(
    imageHeight,
    Math.max(minimumSize, rect.height + padding * 2)
  );
  const centerX = rect.x + rect.width / 2;
  const centerY = rect.y + rect.height / 2;
  const x = Math.max(
    0,
    Math.min(imageWidth - desiredWidth, Math.round(centerX - desiredWidth / 2))
  );
  const y = Math.max(
    0,
    Math.min(
      imageHeight - desiredHeight,
      Math.round(centerY - desiredHeight / 2)
    )
  );
  return { x, y, width: desiredWidth, height: desiredHeight };
}

function boxBlur(
  source: Float32Array,
  width: number,
  height: number,
  radius: number,
  horizontal: boolean
): Float32Array {
  if (radius <= 0) return source.slice();
  const output = new Float32Array(source.length);
  const major = horizontal ? height : width;
  const minor = horizontal ? width : height;
  for (let line = 0; line < major; line += 1) {
    let sum = 0;
    for (let position = -radius; position <= radius; position += 1) {
      const clamped = Math.max(0, Math.min(minor - 1, position));
      const index = horizontal
        ? line * width + clamped
        : clamped * width + line;
      sum += source[index];
    }
    for (let position = 0; position < minor; position += 1) {
      const index = horizontal
        ? line * width + position
        : position * width + line;
      output[index] = sum / (radius * 2 + 1);
      const leaving = Math.max(0, Math.min(minor - 1, position - radius));
      const entering = Math.max(0, Math.min(minor - 1, position + radius + 1));
      sum +=
        source[horizontal ? line * width + entering : entering * width + line] -
        source[horizontal ? line * width + leaving : leaving * width + line];
    }
  }
  return output;
}

export function createInnerFeatherMask(
  binaryMask: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  radius: number
): Uint8ClampedArray {
  const normalized = Float32Array.from(binaryMask, (value) =>
    value > 0 ? 1 : 0
  );
  if (radius <= 0) {
    return Uint8ClampedArray.from(normalized, (value) => (value > 0 ? 255 : 0));
  }
  const clampedRadius = Math.max(1, Math.min(64, Math.round(radius)));
  const horizontal = boxBlur(normalized, width, height, clampedRadius, true);
  const blurred = boxBlur(horizontal, width, height, clampedRadius, false);
  return Uint8ClampedArray.from(blurred, (value, index) =>
    normalized[index] > 0 ? Math.round(value * 255) : 0
  );
}

export function compositeMaskedPixels(
  original: Uint8ClampedArray,
  repaired: Uint8ClampedArray,
  maskAlpha: Uint8Array | Uint8ClampedArray
): Uint8ClampedArray {
  const output = new Uint8ClampedArray(original);
  for (let pixel = 0; pixel < maskAlpha.length; pixel += 1) {
    const weight = maskAlpha[pixel] / 255;
    if (weight <= 0) continue;
    const offset = pixel * 4;
    output[offset] = Math.round(
      original[offset] * (1 - weight) + repaired[offset] * weight
    );
    output[offset + 1] = Math.round(
      original[offset + 1] * (1 - weight) + repaired[offset + 1] * weight
    );
    output[offset + 2] = Math.round(
      original[offset + 2] * (1 - weight) + repaired[offset + 2] * weight
    );
    output[offset + 3] = original[offset + 3];
  }
  return output;
}

export function fillMaskedPixelsFromBoundary(
  original: Uint8ClampedArray,
  binaryMask: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  onProgress?: (completed: number, total: number) => void
): Uint8ClampedArray {
  const bounds = findMaskBounds(binaryMask, width, height, 1);
  const output = new Uint8ClampedArray(original);
  if (!bounds) return output;

  const pixelCount = width * height;
  const known = new Uint8Array(pixelCount);
  const queued = new Uint8Array(pixelCount);
  const queue: number[] = [];
  let maskedCount = 0;
  const offsets = [-1, 0, 1];

  for (let index = 0; index < pixelCount; index += 1) {
    if (binaryMask[index]) maskedCount += 1;
    else known[index] = 1;
  }

  const enqueueIfBoundary = (x: number, y: number) => {
    const index = y * width + x;
    if (!binaryMask[index] || queued[index] || known[index]) return;
    for (const dy of offsets) {
      for (const dx of offsets) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (
          nx >= 0 &&
          nx < width &&
          ny >= 0 &&
          ny < height &&
          known[ny * width + nx]
        ) {
          queued[index] = 1;
          queue.push(index);
          return;
        }
      }
    }
  };

  for (let y = bounds.y; y < bounds.y + bounds.height; y += 1) {
    for (let x = bounds.x; x < bounds.x + bounds.width; x += 1) {
      enqueueIfBoundary(x, y);
    }
  }
  if (queue.length === 0) {
    throw new Error('蒙版覆盖范围过大，周围没有可用于修复的纹理。');
  }

  let completed = 0;
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const index = queue[cursor];
    const x = index % width;
    const y = Math.floor(index / width);
    let red = 0;
    let green = 0;
    let blue = 0;
    let alpha = 0;
    let count = 0;
    for (const dy of offsets) {
      for (const dx of offsets) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const neighbor = ny * width + nx;
        if (!known[neighbor]) continue;
        const offset = neighbor * 4;
        red += output[offset];
        green += output[offset + 1];
        blue += output[offset + 2];
        alpha += output[offset + 3];
        count += 1;
      }
    }
    if (count === 0) continue;
    const offset = index * 4;
    output[offset] = Math.round(red / count);
    output[offset + 1] = Math.round(green / count);
    output[offset + 2] = Math.round(blue / count);
    output[offset + 3] = Math.round(alpha / count);
    known[index] = 1;
    completed += 1;

    for (const dy of offsets) {
      for (const dx of offsets) {
        if (dx === 0 && dy === 0) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (
          nx >= bounds.x &&
          nx < bounds.x + bounds.width &&
          ny >= bounds.y &&
          ny < bounds.y + bounds.height
        ) {
          enqueueIfBoundary(nx, ny);
        }
      }
    }
    if (completed % 4096 === 0) onProgress?.(completed, maskedCount);
  }
  onProgress?.(completed, maskedCount);
  return output;
}
