import { dispatchHuman } from '../state/store';
import type { Candidate, FieldId } from '../state/types';
import { Button } from './Button';
import { ProvenanceLink } from './ProvenanceLink';

export interface CandidateOptionProps {
  candidate: Candidate;
  fieldId: FieldId;
  index: number;
}

const sourceHref = (sourceRef: string) => `#source-${encodeURIComponent(sourceRef)}`;
const sourceLabel = (sourceRef: string) => {
  const [document, region] = sourceRef.split(':', 2);
  if (!region) return sourceRef;
  if (document === 'spec') return `spec §${region.replace(/^s/, '')}`;
  if (document === 'email') return `email ¶${region.replace(/^p/, '')}`;
  return `${document} ${region.replaceAll('_', ' ')}`;
};

export const CandidateOption = ({ candidate, fieldId, index }: CandidateOptionProps) => (
  <li className="candidate-option">
    <p className="candidate-option__value">
      {candidate.value}
      {candidate.unit ? ` ${candidate.unit}` : ''}
    </p>
    <div className="candidate-option__sources">
      {candidate.source_refs.map(sourceRef => (
        <ProvenanceLink href={sourceHref(sourceRef)} key={sourceRef}>{sourceLabel(sourceRef)}</ProvenanceLink>
      ))}
    </div>
    {candidate.note && <p className="candidate-option__note">Agent: {candidate.note}</p>}
    <Button
      onClick={() => dispatchHuman({ type: 'pick', field_id: fieldId, index, at: Date.now() })}
      variant="secondary"
    >
      Pick
    </Button>
  </li>
);
