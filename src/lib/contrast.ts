export function contrastRatio(foreground: string, background: string): number {
  const luminance = (hex: string): number => {
    const channels = hex.replace('#', '').match(/.{2}/g);
    if (!channels || channels.length !== 3) throw new Error(`Invalid hex color: ${hex}`);
    const normalized = channels.map(channel => {
      const value = Number.parseInt(channel, 16) / 255;
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
    });
    const red = normalized[0]!;
    const green = normalized[1]!;
    const blue = normalized[2]!;
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };

  const light = Math.max(luminance(foreground), luminance(background));
  const dark = Math.min(luminance(foreground), luminance(background));
  return (light + 0.05) / (dark + 0.05);
}
