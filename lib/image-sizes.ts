export const imageVariantVersion = 2;
export const imageWidths = [160, 360, 480, 640, 960, 1440, 1920, 2400] as const;
export function preparedImageWidth(width: number) {
  return (
    imageWidths.find((size) => size >= width) ??
    imageWidths[imageWidths.length - 1]
  );
}
