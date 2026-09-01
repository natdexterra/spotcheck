// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, test } from 'vitest';
import * as icons from './index';

afterEach(cleanup);

describe('inline icons', () => {
  test.each(Object.entries(icons))(
    '%s renders a decorative MynaUI svg',
    (_name, IconComponent) => {
      const { container } = render(<IconComponent />);
      const svg = container.querySelector('svg');

      expect(svg).not.toBeNull();
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
      expect(svg).toHaveAttribute('stroke', 'currentColor');
      expect(svg).toHaveAttribute('stroke-width', '1.5');
    },
  );
});
