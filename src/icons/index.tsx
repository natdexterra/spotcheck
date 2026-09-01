import { Icon, type IconProps } from './Icon';

export const DashIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 12h12" />
  </Icon>
);

export const CircleDotIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 17.25a5.25 5.25 0 1 0 0-10.5 5.25 5.25 0 0 0 0 10.5" />
    <path d="M12 13.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3" />
    <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0" />
  </Icon>
);

export const OpposingArrowsIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6.5 7.5h11M14 4l3.5 3.5L14 11m3.5 5.5h-11M10 13l-3.5 3.5L10 20" />
  </Icon>
);

export const DashedCircleIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M21 12a9 9 0 0 1-.706 3.5M12 21a9 9 0 0 1-3.5-.706M3 12c0-1.241.251-2.424.706-3.5M12 3c1.241 0 2.424.251 3.5.706m-9.864 1.93A9 9 0 0 1 8.5 3.706m9.864 14.658a9 9 0 0 1-2.864 1.93m2.864-14.658a9 9 0 0 1 1.93 2.864M5.636 18.364a9 9 0 0 1-1.93-2.864" />
  </Icon>
);

export const CheckCircleIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0" />
    <path d="m8.667 12.633 1.505 1.721a1 1 0 0 0 1.564-.073L15.333 9.3" />
  </Icon>
);

export const MinusCircleIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0M8.5 12h7" />
  </Icon>
);

export const EnvelopeIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m2.357 7.714 6.98 4.654c.963.641 1.444.962 1.964 1.087.46.11.939.11 1.398 0 .52-.125 1.001-.446 1.964-1.087l6.98-4.654M7.157 19.5h9.686c1.68 0 2.52 0 3.162-.327a3 3 0 0 0 1.31-1.311c.328-.642.328-1.482.328-3.162V9.3c0-1.68 0-2.52-.327-3.162a3 3 0 0 0-1.311-1.311c-.642-.327-1.482-.327-3.162-.327H7.157c-1.68 0-2.52 0-3.162.327a3 3 0 0 0-1.31 1.311c-.328.642-.328 1.482-.328 3.162v5.4c0 1.68 0 2.52.327 3.162a3 3 0 0 0 1.311 1.311c.642.327 1.482.327 3.162.327" />
  </Icon>
);

export const LockIcon = (props: IconProps) => (
  <Icon {...props} lockSize>
    <path d="M8 10V8c0-2.761 1.239-5 4-5s4 2.239 4 5v2M3.5 17.8v-4.6c0-1.12 0-1.68.218-2.107a2 2 0 0 1 .874-.875c.428-.217.988-.217 2.108-.217h10.6c1.12 0 1.68 0 2.108.217a2 2 0 0 1 .874.874c.218.428.218.988.218 2.108v4.6c0 1.12 0 1.68-.218 2.108a2 2 0 0 1-.874.874C18.98 21 18.42 21 17.3 21H6.7c-1.12 0-1.68 0-2.108-.218a2 2 0 0 1-.874-.874C3.5 19.481 3.5 18.921 3.5 17.8" />
  </Icon>
);

export const ArrowLeftIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M19.5 12h-15m5.625 6L4.5 12l5.625-6" />
  </Icon>
);

export const ChevronDownIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const CrossIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M18 6 6 18M6 6l12 12" />
  </Icon>
);

export const ErrorIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0m-9-4.373v5.5m0 3.246v-.5" />
  </Icon>
);

export const CheckedBoxIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 9.4c0-2.24 0-3.36.436-4.216a4 4 0 0 1 1.748-1.748C6.04 3 7.16 3 9.4 3h5.2c2.24 0 3.36 0 4.216.436a4 4 0 0 1 1.748 1.748C21 6.04 21 7.16 21 9.4v5.2c0 2.24 0 3.36-.436 4.216a4 4 0 0 1-1.748 1.748C17.96 21 16.84 21 14.6 21H9.4c-2.24 0-3.36 0-4.216-.436a4 4 0 0 1-1.748-1.748C3 17.96 3 16.84 3 14.6z" />
    <path d="m8.667 12.633 1.505 1.721a1 1 0 0 0 1.564-.073L15.333 9.3" />
  </Icon>
);
