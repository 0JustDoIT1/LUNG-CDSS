import { fromBlob } from "geotiff";

const MAX_PREVIEW_WIDTH = 1200;
const MAX_PREVIEW_HEIGHT = 800;

function calculatePreviewSize(width: number, height: number) {
  const scale = Math.min(
    MAX_PREVIEW_WIDTH / width,
    MAX_PREVIEW_HEIGHT / height,
    1,
  );

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function createSvsPreview(file: File): Promise<string> {
  const tiff = await fromBlob(file);
  const imageCount = await tiff.getImageCount();

  if (imageCount === 0) {
    throw new Error("SVS 내부 이미지를 찾을 수 없습니다.");
  }

  const firstImage = await tiff.getImage(0);
  const originalRatio = firstImage.getWidth() / firstImage.getHeight();

  let selectedImage = firstImage;
  let selectedArea = firstImage.getWidth() * firstImage.getHeight();

  /*
   * SVS에는 원본 피라미드 외에도 label, macro 이미지가 있을 수 있습니다.
   * 첫 번째 원본과 화면 비율이 비슷한 이미지 중 가장 작은 이미지를 선택합니다.
   */
  for (let index = 1; index < imageCount; index += 1) {
    const image = await tiff.getImage(index);
    const width = image.getWidth();
    const height = image.getHeight();

    if (width < 100 || height < 100) continue;

    const ratio = width / height;
    const ratioDifference = Math.abs(ratio - originalRatio) / originalRatio;
    const area = width * height;

    if (ratioDifference <= 0.1 && area < selectedArea) {
      selectedImage = image;
      selectedArea = area;
    }
  }

  const sourceWidth = selectedImage.getWidth();
  const sourceHeight = selectedImage.getHeight();
  const previewSize = calculatePreviewSize(sourceWidth, sourceHeight);

  const rgb = await selectedImage.readRGB({
    width: previewSize.width,
    height: previewSize.height,
    interleave: true,
  });

  const canvas = document.createElement("canvas");
  canvas.width = previewSize.width;
  canvas.height = previewSize.height;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("미리보기 Canvas를 만들 수 없습니다.");
  }

  const rgba = new Uint8ClampedArray(
    previewSize.width * previewSize.height * 4,
  );

  for (let sourceIndex = 0, targetIndex = 0;
    sourceIndex < rgb.length;
    sourceIndex += 3, targetIndex += 4) {
    rgba[targetIndex] = rgb[sourceIndex];
    rgba[targetIndex + 1] = rgb[sourceIndex + 1];
    rgba[targetIndex + 2] = rgb[sourceIndex + 2];
    rgba[targetIndex + 3] = 255;
  }

  const imageData = new ImageData(
    rgba,
    previewSize.width,
    previewSize.height,
  );

  context.putImageData(imageData, 0, 0);

  return canvas.toDataURL("image/jpeg", 0.9);
}