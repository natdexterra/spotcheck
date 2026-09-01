import { forwardRef, type AnchorHTMLAttributes } from 'react';

export type JumpLinkProps = AnchorHTMLAttributes<HTMLAnchorElement>;

export const JumpLink = forwardRef<HTMLAnchorElement, JumpLinkProps>(
  ({ className, ...props }, ref) => {
    const classes = ['inline-link', 'inline-link--jump', className]
      .filter(Boolean)
      .join(' ');

    return <a {...props} ref={ref} className={classes} />;
  },
);

JumpLink.displayName = 'JumpLink';
