import { useEffect, useMemo, useState } from 'react';
import { fieldLabel } from '../lib/format';
import type { Draft } from '../state/session';
import { dispatchHuman } from '../state/store';
import type { FieldId } from '../state/types';
import { Button } from './Button';
import { Choice } from './Choice';

export interface ClarificationEditorProps {
  draft?: Draft;
  gaps: FieldId[];
  onFocusField?: (fieldId: FieldId) => void;
  sent?: Draft;
}

const askedLine = (count: number): string => `Sent · ${count} ${count === 1 ? 'field' : 'fields'} asked`;

// The draft is a document with a name; the tab shows it before and after the send.
const Title = () => <h2 className="clarification__title">Clarification email</h2>;

export function ClarificationEditor({ draft, gaps, onFocusField, sent }: ClarificationEditorProps) {
  const availableCovers = useMemo(
    () => draft?.covers.filter(fieldId => gaps.includes(fieldId)) ?? [],
    [draft, gaps],
  );
  const [subject, setSubject] = useState(draft?.subject ?? '');
  const [body, setBody] = useState(draft?.body ?? '');
  const [selectedCovers, setSelectedCovers] = useState<FieldId[]>(availableCovers);

  useEffect(() => {
    if (!draft) return;
    setSubject(draft.subject);
    setBody(draft.body);
    setSelectedCovers(draft.covers.filter(fieldId => gaps.includes(fieldId)));
  }, [draft]);

  useEffect(() => {
    setSelectedCovers(current => current.filter(fieldId => availableCovers.includes(fieldId)));
  }, [availableCovers]);

  if (sent) {
    return (
      <article className="clarification clarification--sent">
        <Title />
        <p className="clarification__sent-line">{askedLine(sent.covers.length)}</p>
        <h3 className="clarification__sent-subject">{sent.subject}</h3>
        <p className="clarification__sent-body untrusted">{sent.body}</p>
        <ul className="clarification__sent-covers">
          {sent.covers.map(fieldId => <li key={fieldId}>{fieldLabel(fieldId)}</li>)}
        </ul>
      </article>
    );
  }

  if (!draft) return null;

  const toggleCover = (fieldId: FieldId, checked: boolean) => {
    setSelectedCovers(current => checked
      ? current.includes(fieldId) ? current : [...current, fieldId]
      : current.filter(selected => selected !== fieldId));
  };
  const send = () => {
    const covers = availableCovers.filter(fieldId => selectedCovers.includes(fieldId));
    dispatchHuman({ type: 'send', subject, body, covers, at: Date.now() });
    const firstCovered = covers[0];
    if (firstCovered) onFocusField?.(firstCovered);
  };
  const canSend = subject.trim().length > 0 && body.trim().length > 0;

  return (
    <form className="clarification" onSubmit={event => { event.preventDefault(); send(); }}>
      <header className="clarification__intro">
        <Title />
        <p className="clarification__subtitle">
          Agent drafted it from the open gaps — edit anything before sending
        </p>
      </header>
      <label className="clarification__field">
        <span className="clarification__label">Subject</span>
        <input
          className="clarification__input untrusted"
          onChange={event => setSubject(event.currentTarget.value)}
          type="text"
          value={subject}
        />
      </label>
      <label className="clarification__field">
        <span className="clarification__label">Body</span>
        <textarea
          className="clarification__textarea untrusted"
          onChange={event => setBody(event.currentTarget.value)}
          value={body}
        />
      </label>
      <fieldset className="clarification__covers">
        <legend className="clarification__caption">Covers — resolved as “Asked customer” on send</legend>
        {availableCovers.map(fieldId => (
          <Choice
            checked={selectedCovers.includes(fieldId)}
            key={fieldId}
            onChange={checked => toggleCover(fieldId, checked)}
            type="checkbox"
          >
            {fieldLabel(fieldId)}
          </Choice>
        ))}
      </fieldset>
      <div className="clarification__actions">
        <Button disabled={!canSend} type="submit" variant="primary">Send</Button>
        <p className="clarification__hint">mock send — your edits vs the agent’s draft go to the change log</p>
      </div>
    </form>
  );
}
