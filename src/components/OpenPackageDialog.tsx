import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { ACCEPTED_IMAGE_TYPES, prepareDrawing as prepare_, type DrawingErrorCode } from '../data/prepare-drawing';
import { LockIcon, OpposingArrowsIcon } from '../icons';
import { Button } from './Button';

/**
 * The one way into a package a person brought: reference, customer, the email
 * and the specification as text, and the drawing as an image. Native `<dialog>`
 * carries the modality — the top layer, the backdrop, Esc, the focus trap and
 * the return of focus to the control that opened it are the element's, not the
 * app's. What the app adds is the form, its validation and its copy.
 */

const TEXT_CAP = 40_000;

export interface OpenPackageFields {
  reference: string;
  customer: string;
  email: string;
  spec: string;
  drawing?: string;
}

export interface OpenPackageDialogProps {
  open: boolean;
  onCancel: () => void;
  onOpenPackage: (fields: OpenPackageFields) => void;
  /** Offered only while a package a person opened is the one on the page. */
  onUseSample?: () => void;
  prepare?: typeof prepare_;
  /** The bundled package's reference, shown as the placeholder and never as a value. */
  sampleReference: string;
}

const IMAGE_MESSAGES: Record<DrawingErrorCode, string> = {
  TYPE: 'Choose a PNG, JPEG or WebP. A screenshot of the PDF page works',
  SIZE: 'Choose an image under 10 MB',
  DECODE: 'This file could not be opened as an image',
};

type FieldName = 'reference' | 'email' | 'spec' | 'drawing';

export function OpenPackageDialog({
  open,
  onCancel,
  onOpenPackage,
  onUseSample,
  prepare = prepare_,
  sampleReference,
}: OpenPackageDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [reference, setReference] = useState('');
  const [customer, setCustomer] = useState('');
  const [email, setEmail] = useState('');
  const [spec, setSpec] = useState('');
  const [fileName, setFileName] = useState('');
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  // Re-encoding an image takes a moment. Pressing Open in that moment must wait
  // for it, not decide the drawing is missing, so the outcome is held where the
  // submit handler can read it after awaiting the work.
  const preparing = useRef<Promise<void>>();
  const prepared = useRef<{ dataUrl?: string; error?: string }>({});

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      // Every opening starts from a blank form: the package on the page is the
      // one that was opened, and the form is for the next one.
      setReference(''); setCustomer(''); setEmail(''); setSpec('');
      setFileName(''); setErrors({});
      preparing.current = undefined;
      prepared.current = {};
      dialog.showModal();
    }
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const fieldId = (name: FieldName | 'customer') => `${id}-${name}`;
  const hintId = (name: FieldName | 'customer') => `${id}-${name}-hint`;
  const errorId = (name: FieldName) => `${id}-${name}-error`;
  const describedBy = (name: FieldName | 'customer') =>
    [hintId(name), name !== 'customer' && errors[name] ? errorId(name) : ''].filter(Boolean).join(' ');

  // An error answers the state of the field, so it goes as soon as the person
  // touches it: no one should be told to enter a reference they just entered.
  const clear = (name: FieldName) => setErrors(current =>
    current[name] === undefined ? current : { ...current, [name]: undefined });

  const chooseFile = (file: File | undefined) => {
    setFileName(file?.name ?? '');
    prepared.current = {};
    if (!file) {
      setErrors(current => ({ ...current, drawing: undefined }));
      return;
    }
    preparing.current = prepare(file).then(result => {
      if (result.ok) {
        prepared.current = { dataUrl: result.dataUrl };
        setErrors(current => ({ ...current, drawing: undefined, spec: undefined }));
      } else {
        prepared.current = { error: IMAGE_MESSAGES[result.code] };
        setErrors(current => ({ ...current, drawing: IMAGE_MESSAGES[result.code] }));
      }
    });
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await preparing.current;
    const drawing = prepared.current.dataUrl;
    const found: Partial<Record<FieldName, string>> = { drawing: prepared.current.error };
    if (reference.trim() === '') found.reference = 'Enter a reference';
    if (email.trim() === '') found.email = 'Paste the customer email';
    else if (email.length > TEXT_CAP) {
      found.email = `The customer email is longer than ${TEXT_CAP.toLocaleString('en-US')} characters; paste the relevant part`;
    }
    if (spec.length > TEXT_CAP) {
      found.spec = `The specification is longer than ${TEXT_CAP.toLocaleString('en-US')} characters; paste the relevant part`;
    } else if (spec.trim() === '' && drawing === undefined) found.spec = 'Add the specification or a drawing';
    setErrors(found);

    const order: FieldName[] = ['reference', 'email', 'spec', 'drawing'];
    const first = order.find(name => found[name]);
    if (first) {
      dialogRef.current?.querySelector<HTMLElement>(`#${CSS.escape(fieldId(first))}`)?.focus();
      return;
    }
    onOpenPackage({ reference: reference.trim(), customer: customer.trim(), email, spec, drawing });
  };

  const error = (name: FieldName) => errors[name] === undefined ? null : (
    <p className="dialog__error" id={errorId(name)}>
      <OpposingArrowsIcon />
      {errors[name]}
    </p>
  );

  return (
    <dialog aria-labelledby={`${id}-title`} className="dialog" onClose={onCancel} ref={dialogRef}>
      <form className="dialog__form" onSubmit={event => void submit(event)}>
        <h2 className="dialog__title" id={`${id}-title`}>Your package</h2>

        <div className="dialog__field">
          <label className="dialog__label" htmlFor={fieldId('reference')}>Reference</label>
          <p className="dialog__hint" id={hintId('reference')}>Shown in the header and used as the session name</p>
          <input
            aria-describedby={describedBy('reference')}
            aria-invalid={errors.reference !== undefined}
            className="dialog__input"
            id={fieldId('reference')}
            onChange={event => { setReference(event.target.value); clear('reference'); }}
            placeholder={`e.g. ${sampleReference}`}
            type="text"
            value={reference}
          />
          {error('reference')}
        </div>

        <div className="dialog__field">
          <label className="dialog__label" htmlFor={fieldId('customer')}>Customer</label>
          <p className="dialog__hint" id={hintId('customer')}>Company name only. Contact details are not needed</p>
          <input
            aria-describedby={describedBy('customer')}
            className="dialog__input"
            id={fieldId('customer')}
            onChange={event => setCustomer(event.target.value)}
            type="text"
            value={customer}
          />
        </div>

        <div className="dialog__field">
          <label className="dialog__label" htmlFor={fieldId('email')}>Customer email</label>
          <p className="dialog__hint" id={hintId('email')}>Paste the text. Blank lines separate paragraphs; the first line is the subject</p>
          <textarea
            aria-describedby={describedBy('email')}
            aria-invalid={errors.email !== undefined}
            className="dialog__textarea"
            id={fieldId('email')}
            onChange={event => { setEmail(event.target.value); clear('email'); }}
            rows={6}
            value={email}
          />
          {error('email')}
        </div>

        <div className="dialog__field dialog__field--spec">
          <label className="dialog__label" htmlFor={fieldId('spec')}>Specification</label>
          <p className="dialog__hint" id={hintId('spec')}>Paste the text. Numbered or capitalised lines become section titles</p>
          <textarea
            aria-describedby={describedBy('spec')}
            aria-invalid={errors.spec !== undefined}
            className="dialog__textarea"
            id={fieldId('spec')}
            onChange={event => { setSpec(event.target.value); clear('spec'); }}
            rows={6}
            value={spec}
          />
          {error('spec')}
        </div>

        <div className="dialog__field">
          <label className="dialog__label" htmlFor={fieldId('drawing')}>Drawing</label>
          <p className="dialog__hint" id={hintId('drawing')}>
            PNG, JPEG or WebP, up to 10 MB; a screenshot of a PDF page works. No text is read from the image:
            the agent reports what it cannot see as missing
          </p>
          {/* The native input is the control: it holds the tab stop and the
              focus ring (.dialog__file:has(input:focus-visible)). The visible
              button only forwards a pointer click, so it stays out of the tab
              order and out of the accessibility tree; otherwise "Drawing"
              would name two controls. */}
          <div className="dialog__file">
            <input
              accept={ACCEPTED_IMAGE_TYPES.join(',')}
              aria-describedby={describedBy('drawing')}
              aria-invalid={errors.drawing !== undefined}
              className="visually-hidden"
              id={fieldId('drawing')}
              onChange={event => chooseFile(event.target.files?.[0])}
              type="file"
            />
            <Button
              aria-hidden="true"
              onClick={() => dialogRef.current?.querySelector<HTMLInputElement>(`#${CSS.escape(fieldId('drawing'))}`)?.click()}
              size="compact"
              tabIndex={-1}
              variant="secondary"
            >
              Choose image
            </Button>
            <span className="dialog__file-name">{fileName === '' ? 'No image chosen' : fileName}</span>
          </div>
          {error('drawing')}
        </div>

        <p className="dialog__privacy">
          <LockIcon />
          Nothing leaves this page on its own. Your agent receives what it reads through the page’s tools,
          one section at a time, and every read is logged
        </p>

        <div className="dialog__actions">
          <Button size="large" type="submit" variant="primary">Open package</Button>
          <Button onClick={onCancel} variant="text">Cancel</Button>
          {onUseSample ? <Button onClick={onUseSample} variant="text">Use the sample package</Button> : null}
        </div>
      </form>
    </dialog>
  );
}
