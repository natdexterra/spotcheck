import type { ReactNode, SVGProps } from 'react';

export type IconProps = Omit<
  SVGProps<SVGSVGElement>,
  | 'aria-hidden'
  | 'children'
  | 'fill'
  | 'focusable'
  | 'stroke'
  | 'strokeWidth'
  | 'viewBox'
>;

type IconBaseProps = IconProps & {
  children: ReactNode;
  lockSize?: boolean;
};

export const Icon = ({ children, className, lockSize = false, ...props }: IconBaseProps) => {
  const classes = ['icon', lockSize && 'icon--lock', className]
    .filter(Boolean)
    .join(' ');

  return (
    <svg
      {...props}
      aria-hidden="true"
      className={classes}
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      viewBox="0 0 24 24"
      xmlns="http://www.w3.org/2000/svg"
    >
      {children}
    </svg>
  );
};
