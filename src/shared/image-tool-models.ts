export type ImageToolModelId =
  | 'real-esrgan-x4plus'
  | 'scunet-color-real-psnr'
  | 'lama'
  | 'silueta'
  | 'mobile-sam-encoder'
  | 'mobile-sam-decoder'
  | 'ort-webgpu-runtime'
  | 'ort-webgpu-module';

export interface ImageToolModelAsset {
  id: ImageToolModelId;
  upstream: string;
  license: string;
  route: string;
  version: string;
  sha256: string;
  inputScale: 1 | 255;
}

// The deployment script refuses to publish an asset when the recorded digest
// does not match the file. Model bytes are deliberately absent from the web
// bundle and are fetched only on the first real run.
export const IMAGE_TOOL_MODELS: Record<ImageToolModelId, ImageToolModelAsset> =
  {
    'real-esrgan-x4plus': {
      id: 'real-esrgan-x4plus',
      upstream: 'https://github.com/xinntao/Real-ESRGAN',
      license: 'BSD-3-Clause',
      route:
        '/models/image-tools/real-esrgan-x4plus.v0.1.0.115f5f6bcb405bba.onnx',
      version: 'v0.1.0-webtomind-64',
      sha256:
        '115f5f6bcb405bba3a68c626600549ad5a6df94c842b9ed8bf9c0fd9072b5cce',
      inputScale: 1
    },
    'scunet-color-real-psnr': {
      id: 'scunet-color-real-psnr',
      upstream: 'https://github.com/cszn/SCUNet',
      license: 'Apache-2.0',
      route:
        '/models/image-tools/scunet-color-real-psnr.kair-v1.0.a13b24f89596d103.onnx',
      version: 'kair-v1.0-webtomind-256',
      sha256:
        'a13b24f89596d10322f86a753386538f88826da2d3a0ecb685cd7820a7611ace',
      inputScale: 1
    },
    lama: {
      id: 'lama',
      upstream: 'https://github.com/advimman/lama',
      license: 'Apache-2.0',
      route:
        '/models/image-tools/lama-big.2023-11-18.35c08de11a5e2497.onnx',
      version: 'big-lama-2023-11-18-webtomind-256',
      sha256:
        '35c08de11a5e2497f2750bcc96a4de0f6a618e6ea49c08b60fc2aa132bac7564',
      inputScale: 1
    },
    silueta: {
      id: 'silueta',
      upstream: 'https://github.com/danielgatis/rembg',
      license: 'Apache-2.0',
      route: '/models/image-tools/silueta.u2net-2023.75da6c8d2f8096ec.onnx',
      version: 'u2net-silueta-2023-webtomind-320',
      sha256:
        '75da6c8d2f8096ec743d071951be73b4a8bc7b3e51d9a6625d63644f90ffeedb',
      inputScale: 1
    },
    'mobile-sam-encoder': {
      id: 'mobile-sam-encoder',
      upstream: 'https://github.com/ChaoningZhang/MobileSAM',
      license: 'Apache-2.0',
      route:
        '/models/image-tools/mobile-sam-encoder.v1.0.4125037c5e24d6ea.onnx',
      version: 'mobile-sam-encoder-v1.0-webtomind-1024',
      sha256:
        '4125037c5e24d6ea58e201b20e8d8fbbbd1135c0b881e34a8074b8c4f07e6918',
      inputScale: 1
    },
    'mobile-sam-decoder': {
      id: 'mobile-sam-decoder',
      upstream: 'https://github.com/ChaoningZhang/MobileSAM',
      license: 'Apache-2.0',
      route:
        '/models/image-tools/mobile-sam-decoder.v1.0.b0735abf07c7affd.onnx',
      version: 'mobile-sam-decoder-v1.0-webtomind-1024',
      sha256:
        'b0735abf07c7affddf20fffc3ce750f44af387ee6a7323880e909389ed15d279',
      inputScale: 1
    },
    'ort-webgpu-runtime': {
      id: 'ort-webgpu-runtime',
      upstream: 'https://github.com/microsoft/onnxruntime',
      license: 'MIT',
      route:
        '/models/image-tools/ort-wasm-simd-threaded.jsep.1.27.0.78feeeb3d08f6bce.wasm',
      version: '1.27.0',
      sha256:
        '78feeeb3d08f6bcee94d938ed322f69073bb8076b5f9d34697a574ffba8deb48',
      inputScale: 1
    },
    'ort-webgpu-module': {
      id: 'ort-webgpu-module',
      upstream: 'https://github.com/microsoft/onnxruntime',
      license: 'MIT',
      route:
        '/models/image-tools/ort-wasm-simd-threaded.jsep.1.27.0.3ee381d20a80f51a.mjs',
      version: '1.27.0',
      sha256:
        '3ee381d20a80f51a788a1c4a5872f6f1d047538dd4342f4af00062de5f9ea4c6',
      inputScale: 1
    }
  };

export function isPublishedImageToolModel(model: ImageToolModelAsset): boolean {
  return model.sha256 !== 'pending' && model.version !== 'conversion-pending';
}
