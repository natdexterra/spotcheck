import { forwardRef, type AnchorHTMLAttributes } from 'react';

export type ProvenanceLinkProps = AnchorHTMLAttributes<HTMLAnchorElement>;

export const ProvenanceLink = forwardRef<
  HTMLAnchorElement,
  ProvenanceLinkProps
>(({ className, ...props }, ref) => {
  const classes = ['inline-link', 'inline-link--provenance', className]
    .filter(Boolean)
    .join(' ');

  return <a {...props} ref={ref} className={classes} />;
});

ProvenanceLink.displayName = 'ProvenanceLink';
