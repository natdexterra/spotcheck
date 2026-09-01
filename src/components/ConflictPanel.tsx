import type { Field } from '../state/types';
import { Button } from './Button';
import { CandidateOption } from './CandidateOption';

export interface ConflictPanelProps {
  field: Field;
  onOpenEditor: () => void;
}

export const ConflictPanel = ({ field, onOpenEditor }: ConflictPanelProps) => (
  <section aria-label={`Conflicting values for ${field.id}`} className="conflict-panel">
    <ul className="conflict-panel__candidates">
      {field.candidates?.map((candidate, index) => (
        <CandidateOption candidate={candidate} fieldId={field.id} index={index} key={`${index}-${candidate.value}`} />
      ))}
    </ul>
    <Button onClick={onOpenEditor} variant="text">Enter another value</Button>
  </section>
);
