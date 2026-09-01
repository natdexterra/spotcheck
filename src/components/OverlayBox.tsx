export type NormalizedBox = readonly [number, number, number, number];

/** `drawing:title_area` names itself "Title area" — a region id is not a label. */
const regionName = (sourceRef: string): string => {
  const words = (sourceRef.split(':', 2)[1] ?? sourceRef).replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

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
      aria-label={[regionName(sourceRef), label].filter(Boolean).join(', ')}
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
