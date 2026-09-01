import { findDocument, type DocumentData } from '../data/package';
import { DocumentText, type DocumentTextProps } from './EmailDoc';

export interface SpecDocProps extends Omit<DocumentTextProps, 'document' | 'quiet'> {
  document?: DocumentData;
}

export function SpecDoc({ document = findDocument('spec'), ...props }: SpecDocProps) {
  if (!document) return null;
  return <DocumentText {...props} document={document} />;
}
