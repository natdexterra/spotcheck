// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, test, vi } from 'vitest';
import { OpenPackageDialog } from './OpenPackageDialog';
import type { DrawingError, PreparedDrawing } from '../data/prepare-drawing';

/* jsdom carries no top layer: showModal and close are stubbed so the component's
   own open/close path still runs. Focus trapping, the backdrop and Esc are the
   element's own behaviour and are proved in the browser (e2e/own-package). */
beforeAll(() => {
  Object.assign(HTMLDialogElement.prototype, {
    showModal(this: HTMLDialogElement) { this.open = true; },
    close(this: HTMLDialogElement) { this.open = false; this.dispatchEvent(new Event('close')); },
  });
});

afterEach(cleanup);

const prepared = (dataUrl = 'data:image/webp;base64,AAAA') =>
  vi.fn(async (): Promise<PreparedDrawing | DrawingError> => ({ ok: true, dataUrl, width: 10, height: 10 }));

const setup = (props: Partial<Parameters<typeof OpenPackageDialog>[0]> = {}) => {
  const onOpenPackage = vi.fn();
  const onCancel = vi.fn();
  const view = render(
    <OpenPackageDialog
      open
      onCancel={onCancel}
      onOpenPackage={onOpenPackage}
      prepare={prepared()}
      sampleReference="RFQ 26-0812"
      {...props}
    />,
  );
  return { ...view, onCancel, onOpenPackage, user: userEvent.setup() };
};

const image = (name = 'sheet.png', type = 'image/png') =>
  new File([new Uint8Array([1, 2, 3])], name, { type });

describe('the dialog’s form', () => {
  test('every field carries a visible label and a hint of its own', () => {
    const { container } = setup();

    for (const label of ['Reference', 'Customer', 'Customer email', 'Specification', 'Drawing']) {
      expect(screen.getByText(label, { selector: 'label, legend' })).toBeInTheDocument();
    }
    expect(container.querySelectorAll('.dialog__hint')).toHaveLength(5);
    expect(screen.getByLabelText('Reference')).toHaveAttribute('placeholder', 'e.g. RFQ 26-0812');
    expect(screen.getByLabelText('Reference')).toHaveValue('');
  });

  test('the email and the specification are textareas, the drawing a file input', () => {
    setup();
    expect(screen.getByLabelText('Customer email').tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText('Specification').tagName).toBe('TEXTAREA');
    expect(screen.getByLabelText('Drawing')).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp');
  });

  test('it says where the pasted text goes, without promising the data stays here', () => {
    const { container } = setup();
    const privacy = container.querySelector('.dialog__privacy');

    expect(privacy).toHaveTextContent(
      'Nothing leaves this page on its own. Your agent receives what it reads through the page’s tools, ' +
      'one section at a time, and every read is logged',
    );
  });

  test('the sample is offered only while a package a person opened is in front of them', () => {
    const { rerender } = setup();
    expect(screen.queryByRole('button', { name: 'Use the sample package' })).toBeNull();

    rerender(
      <OpenPackageDialog
        open
        onCancel={vi.fn()}
        onOpenPackage={vi.fn()}
        onUseSample={vi.fn()}
        prepare={prepared()}
        sampleReference="RFQ 26-0812"
      />,
    );
    expect(screen.getByRole('button', { name: 'Use the sample package' })).toBeInTheDocument();
  });

});

describe('what the dialog refuses to open', () => {
  test('an empty reference is named, and takes the focus', async () => {
    const { onOpenPackage, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Open package' }));

    expect(screen.getByText('Enter a reference')).toBeInTheDocument();
    expect(screen.getByLabelText('Reference')).toHaveFocus();
    expect(onOpenPackage).not.toHaveBeenCalled();
  });

  test('an empty email is named once the reference is in', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Reference'), 'RFQ 91-2201');
    await user.click(screen.getByRole('button', { name: 'Open package' }));

    expect(screen.getByText('Paste the customer email')).toBeInTheDocument();
    expect(screen.getByLabelText('Customer email')).toHaveFocus();
  });

  test('a package with neither specification nor drawing says so under the specification', async () => {
    const { container, user } = setup();
    await user.type(screen.getByLabelText('Reference'), 'RFQ 91-2201');
    await user.type(screen.getByLabelText('Customer email'), 'Subject');
    await user.click(screen.getByRole('button', { name: 'Open package' }));

    const field = container.querySelector('.dialog__field--spec');
    expect(within(field as HTMLElement).getByText('Add the specification or a drawing')).toBeInTheDocument();
    expect(screen.getByLabelText('Specification')).toHaveFocus();
  });

  test('text past the cap is refused by the document it belongs to', async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText('Reference'), 'RFQ 91-2201');
    const email = screen.getByLabelText('Customer email');
    await user.click(email);
    await user.paste('x'.repeat(40_001));
    await user.click(screen.getByRole('button', { name: 'Open package' }));

    expect(screen.getByText('The customer email is longer than 40,000 characters; paste the relevant part'))
      .toBeInTheDocument();
  });

  test('an error is tied to its field, in the conflict colour, with the conflict icon', async () => {
    const { container, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Open package' }));
    const error = container.querySelector('.dialog__error');

    expect(error?.querySelector('svg')).toBeTruthy();
    expect(screen.getByLabelText('Reference'))
      .toHaveAttribute('aria-describedby', expect.stringContaining(error!.id));
    expect(screen.getByLabelText('Reference')).toHaveAttribute('aria-invalid', 'true');
  });
});

describe('the image a person attaches', () => {
  test('is named beside the button once it is chosen', async () => {
    const { container, user } = setup();
    await user.upload(screen.getByLabelText('Drawing'), image());

    await waitFor(() => expect(container.querySelector('.dialog__file-name')).toHaveTextContent('sheet.png'));
  });

  test('a file of another type is refused in the words of the fix', async () => {
    const prepare = vi.fn(async (): Promise<DrawingError> => ({ ok: false, code: 'TYPE' }));
    setup({ prepare });
    // accept filters the picker, not the person: a browser still lets them
    // choose "all files", so the check has to hold on the way in.
    const user = userEvent.setup({ applyAccept: false });
    await user.upload(screen.getByLabelText('Drawing'), image('page.heic', 'image/heic'));

    expect(await screen.findByText('Choose a PNG, JPEG or WebP. A screenshot of the PDF page works'))
      .toBeInTheDocument();
  });

  test('a file over the limit and one that will not decode each say what to do', async () => {
    const { rerender, user } = setup({ prepare: vi.fn(async (): Promise<DrawingError> => ({ ok: false, code: 'SIZE' })) });
    await user.upload(screen.getByLabelText('Drawing'), image());
    expect(await screen.findByText('Choose an image under 10 MB')).toBeInTheDocument();

    rerender(
      <OpenPackageDialog
        open
        onCancel={vi.fn()}
        onOpenPackage={vi.fn()}
        prepare={vi.fn(async (): Promise<DrawingError> => ({ ok: false, code: 'DECODE' }))}
        sampleReference="RFQ 26-0812"
      />,
    );
    await user.upload(screen.getByLabelText('Drawing'), image('other.png'));
    expect(await screen.findByText('This file could not be opened as an image')).toBeInTheDocument();
  });
});

describe('opening', () => {
  test('hands over the trimmed fields and the re-encoded image', async () => {
    const { onOpenPackage, user } = setup();
    await user.type(screen.getByLabelText('Reference'), '  RFQ 91-2201 ');
    await user.type(screen.getByLabelText('Customer'), 'Ridgeway Panels');
    await user.click(screen.getByLabelText('Customer email'));
    await user.paste('Bay cover quote\n\nPlease quote 240 covers.');
    await user.upload(screen.getByLabelText('Drawing'), image());
    await user.click(screen.getByRole('button', { name: 'Open package' }));

    await waitFor(() => expect(onOpenPackage).toHaveBeenCalledWith({
      reference: 'RFQ 91-2201',
      customer: 'Ridgeway Panels',
      email: 'Bay cover quote\n\nPlease quote 240 covers.',
      spec: '',
      drawing: 'data:image/webp;base64,AAAA',
    }));
  });

  test('Cancel closes without opening anything', async () => {
    const { onCancel, onOpenPackage, user } = setup();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));

    expect(onCancel).toHaveBeenCalled();
    expect(onOpenPackage).not.toHaveBeenCalled();
  });

  test('a close request from the element itself cancels too', () => {
    const { container, onCancel } = setup();
    (container.querySelector('dialog') as HTMLDialogElement).close();

    expect(onCancel).toHaveBeenCalled();
  });
});

describe('P5: the scrim behind the dialog', () => {
  const componentsCss = readFileSync('src/styles/components.css', 'utf8');

  /** Every `prefers-reduced-motion: reduce` block in the stylesheet, braces balanced. */
  const reducedMotion = (css: string): string[] => {
    const opener = '@media (prefers-reduced-motion: reduce) {';
    const blocks: string[] = [];
    for (let from = css.indexOf(opener); from >= 0; from = css.indexOf(opener, from + 1)) {
      let depth = 0;
      let index = from + opener.length - 1;
      do {
        if (css[index] === '{') depth += 1;
        if (css[index] === '}') depth -= 1;
        index += 1;
      } while (depth > 0 && index < css.length);
      blocks.push(css.slice(from, index));
    }
    return blocks;
  };

  test('the backdrop holds still when motion is not wanted', () => {
    // The universal reset in base.css reaches ::before and ::after, never the
    // backdrop the top layer paints, so this rule has to exist on its own.
    expect(reducedMotion(componentsCss).join(' ')).toMatch(/\.dialog::backdrop\s*\{[^}]*transition:\s*none/);
  });
});
