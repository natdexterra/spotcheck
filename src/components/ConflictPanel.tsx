import type { Ref } from 'react';
import { fieldLabel } from '../lib/format';
import type { Field } from '../state/types';
import { Button } from './Button';
import { CandidateOption, type SourceHandler } from './CandidateOption';

export interface ConflictPanelProps {
  editorButtonRef?: Ref<HTMLButtonElement>;
  field: Field;
  onOpenEditor: () => void;
  onSource?: SourceHandler;
}

export const ConflictPanel = ({ editorButtonRef, field, onOpenEditor, onSource }: ConflictPanelProps) => (
  <section aria-label={`Conflicting values for ${fieldLabel(field.id)}`} className="conflict-panel">
    <ul className="conflict-panel__candidates">
      {field.candidates?.map((candidate, index) => (
        <CandidateOption
          candidate={candidate}
          fieldId={field.id}
          index={index}
          key={`${index}-${candidate.value}`}
          onSource={onSource}
        />
      ))}
    </ul>
    <Button onClick={onOpenEditor} ref={editorButtonRef} variant="text">Enter another value</Button>
  </section>
);
