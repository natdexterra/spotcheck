import { useEffect, useState } from 'react';

// One breakpoint for the whole shell: below it the layout is a single scrolling
// column and the source pane and change log open as sheets (DESIGN.md § Layout ladder).
const NARROW_QUERY = '(width < 64rem)';

export function useNarrowLayout(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof matchMedia === 'function' && matchMedia(NARROW_QUERY).matches,
  );

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const media = matchMedia(NARROW_QUERY);
    const update = () => setNarrow(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  return narrow;
}
