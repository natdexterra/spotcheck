import { sourceHref, sourceLabel } from '../lib/format';
import { dispatchHuman } from '../state/store';
import type { Candidate, FieldId } from '../state/types';
import { Button } from './Button';
import { ProvenanceLink } from './ProvenanceLink';

export type SourceHandler = (ref: string) => (event: { preventDefault: () => void }) => void;

export interface CandidateOptionProps {
  candidate: Candidate;
  fieldId: FieldId;
  index: number;
  onSource?: SourceHandler;
}

export const CandidateOption = ({ candidate, fieldId, index, onSource }: CandidateOptionProps) => (
  <li className="candidate-option">
    {/* Export 02: the reading and where it comes from stack, and Pick stands
        beside the pair rather than under it. */}
    <div className="candidate-option__body">
      <p className="candidate-option__value">
        {candidate.value}
        {candidate.unit ? ` ${candidate.unit}` : ''}
      </p>
      <div className="candidate-option__sources">
        {candidate.source_refs.map(sourceRef => (
          <ProvenanceLink href={sourceHref(sourceRef)} key={sourceRef} onClick={onSource?.(sourceRef)}>
            {sourceLabel(sourceRef)}
          </ProvenanceLink>
        ))}
      </div>
      {candidate.note && <p className="candidate-option__note">Agent: {candidate.note}</p>}
    </div>
    <Button
      onClick={() => dispatchHuman({ type: 'pick', field_id: fieldId, index, at: Date.now() })}
      variant="secondary"
    >
      Pick
    </Button>
  </li>
);
