import { forwardRef, type ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'text';
export type ButtonSize = 'compact' | 'large';

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant: ButtonVariant;
  size?: ButtonSize;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size, type = 'button', variant, ...props }, ref) => {
    const resolvedSize = size ?? (variant === 'primary' ? 'large' : 'compact');
    const classes = [
      'button',
      `button--${variant}`,
      `button--${resolvedSize}`,
      className,
    ]
      .filter(Boolean)
      .join(' ');

    return <button {...props} ref={ref} type={type} className={classes} />;
  },
);

Button.displayName = 'Button';
