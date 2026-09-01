export type NormalizedBox = readonly [number, number, number, number];

export interface OverlayBoxProps {
  active?: boolean;
  box: NormalizedBox;
  label: string;
  onActivate: (sourceRef: string) => void;
  sourceRef: string;
}

const percentage = (value: number): string => `${Number((value * 100).toFixed(3))}%`;

export function OverlayBox({ active = false, box, label, onActivate, sourceRef }: OverlayBoxProps) {
  const [x, y, width, height] = box;

  return (
    <button
      aria-label={`${sourceRef} ${label}`.trim()}
      className={[
        'drawing-overlay',
        active && 'drawing-overlay--active',
        sourceRef === 'drawing:title_area' && 'drawing-overlay--title-area',
      ].filter(Boolean).join(' ')}
      onClick={() => onActivate(sourceRef)}
      style={{
        height: percentage(height),
        left: percentage(x),
        top: percentage(y),
        width: percentage(width),
      }}
      type="button"
    />
  );
}
