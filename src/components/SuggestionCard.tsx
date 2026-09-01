import { relativeTime } from '../lib/format';
import { dispatchHuman } from '../state/store';
import type { Field, ResolutionKind } from '../state/types';
import { Button } from './Button';
import { ProvenanceLink } from './ProvenanceLink';

export interface SuggestionCardProps {
  field: Field;
}

const resolutionWord: Record<ResolutionKind, string> = {
  verified: 'verified',
  edited: 'edited',
  entered: 'entered',
  picked: 'picked',
  dismissed: 'marked not required',
  applied: 'applied',
  asked_customer: 'asked customer',
};

const sourceHref = (sourceRef: string) => `#source-${encodeURIComponent(sourceRef)}`;
const sourceLabel = (sourceRef: string) => {
  const [document, region] = sourceRef.split(':', 2);
  if (!region) return sourceRef;
  if (document === 'spec') return `spec §${region.replace(/^s/, '')}`;
  if (document === 'email') return `email ¶${region.replace(/^p/, '')}`;
  return `${document} ${region.replaceAll('_', ' ')}`;
};
const focusBadge = (fieldId: Field['id']) => {
  document.querySelector<HTMLElement>(`[data-field-badge="${fieldId}"]`)?.focus();
};

export const SuggestionCard = ({ field }: SuggestionCardProps) => {
  const suggestion = field.suggestion;
  if (!suggestion) return null;

  const resolveSuggestion = (type: 'apply' | 'dismiss_suggestion') => {
    dispatchHuman({ type, field_id: field.id, at: Date.now() });
    focusBadge(field.id);
  };

  return (
    <aside aria-label={`Agent suggestion for ${field.id}`} className="suggestion-card">
      <p className="suggestion-card__value">
        {suggestion.value}
        {suggestion.unit ? ` ${suggestion.unit}` : ''}
      </p>
      <div className="suggestion-card__sources">
        {suggestion.source_refs.map(sourceRef => (
          <ProvenanceLink href={sourceHref(sourceRef)} key={sourceRef}>{sourceLabel(sourceRef)}</ProvenanceLink>
        ))}
      </div>
      {suggestion.rationale && (
        <p className="suggestion-card__reason">
          <span>Agent's reason: </span>
          <q>{suggestion.rationale}</q>
        </p>
      )}
      <p className="suggestion-card__current">
        your value
        {field.resolution && `, ${resolutionWord[field.resolution.kind]} ${relativeTime(field.resolution.at, Date.now())}`}
      </p>
      <div className="suggestion-card__actions">
        <Button onClick={() => resolveSuggestion('apply')} variant="secondary">Apply</Button>
        <Button onClick={() => resolveSuggestion('dismiss_suggestion')} variant="text">Dismiss</Button>
      </div>
    </aside>
  );
};
