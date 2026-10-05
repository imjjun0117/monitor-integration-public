// 버튼·입력·상태 안내의 공통 구성
import { usePermissions } from '../PermissionContext';
// Adapted from TailAdmin's MIT React components. See THIRD_PARTY_NOTICES.md.
import {
  createElement,
  type ButtonHTMLAttributes,
  type ChangeEvent,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { FormSelect, FormSelectOption } from './select';
export { FormSelect, FormSelectOption };

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'danger' | 'link' | 'plain';
  permission?: 'write' | 'admin';
  size?: 'sm' | 'md';
  isDisabled?: boolean;
  isLoading?: boolean;
};
export function Button({
  permission,
  variant = 'primary',
  size = 'md',
  isDisabled,
  isLoading,
  disabled,
  className = '',
  children,
  type = 'button',
  ...props
}: ButtonProps) {
  const permissions = usePermissions();
  if (permission && !(permission === 'admin' ? permissions.isAdmin : permissions.canWrite)) {
    return null;
  }
  const variants = {
    primary: 'bg-brand-500 text-white shadow-theme-xs hover:bg-brand-600',
    secondary: 'bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50',
    danger: 'bg-error-600 text-white shadow-theme-xs hover:bg-error-700',
    link: 'text-brand-500 hover:bg-brand-50',
    plain: 'text-gray-500 hover:bg-gray-100',
  };
  return (
    <button
      {...props}
      type={type}
      disabled={disabled || isDisabled || isLoading}
      aria-busy={isLoading || undefined}
      className={`ta-button ta-${variant} ta-button-${size} inline-flex shrink-0 items-center justify-center gap-2 rounded-lg text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${size === 'sm' ? 'min-h-9 px-3 py-2' : 'min-h-11 px-4 py-2.5'} ${variants[variant]} ${className}`}
    >
      {isLoading && <Spinner size="sm" aria-label="처리 중" />}
      {children}
    </button>
  );
}

type InputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange'> & {
  onChange?: (event: ChangeEvent<HTMLInputElement>, value: string) => void;
  isDisabled?: boolean;
};
const fieldStyle =
  'h-11 w-full rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm text-gray-800 shadow-theme-xs placeholder:text-gray-500 focus:border-brand-500 focus:ring-3 focus:ring-brand-500/15 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500';
export function TextInput({
  onChange,
  isDisabled,
  disabled,
  className = '',
  ...props
}: InputProps) {
  return (
    <input
      {...props}
      disabled={disabled || isDisabled}
      onChange={(event) => onChange?.(event, event.target.value)}
      className={`ta-input ${fieldStyle} ${className}`}
    />
  );
}
const badgeStyles = {
  green: 'bg-success-50 text-success-700',
  orange: 'bg-warning-50 text-warning-700',
  red: 'bg-error-50 text-error-700',
  grey: 'bg-gray-100 text-gray-600',
};
export function Label({
  color = 'grey',
  isCompact: _compact,
  className = '',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { color?: keyof typeof badgeStyles; isCompact?: boolean }) {
  return (
    <span
      {...props}
      className={`ta-badge inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium ${badgeStyles[color]} ${className}`}
    />
  );
}
export function Title({
  headingLevel = 'h2',
  className = '',
  ...props
}: HTMLAttributes<HTMLHeadingElement> & { headingLevel?: 'h1' | 'h2' | 'h3' | 'h4' }) {
  return createElement(headingLevel, {
    ...props,
    className: `ta-title font-semibold ${className}`,
  });
}
export function Spinner({
  size = 'md',
  className = '',
  ...props
}: HTMLAttributes<HTMLSpanElement> & { size?: 'sm' | 'md' }) {
  return (
    <span
      {...props}
      role="status"
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent ${size === 'sm' ? 'h-4 w-4' : 'h-6 w-6 text-brand-500'} ${className}`}
    />
  );
}
const alertStyles = {
  danger: 'border-error-200 bg-error-50 text-error-700',
  warning: 'border-warning-200 bg-warning-50 text-warning-700',
  success: 'border-success-200 bg-success-50 text-success-700',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
};
export function Alert({
  variant = 'info',
  title,
  children,
  actionLinks,
  isInline: _inline,
  className = '',
}: {
  variant?: keyof typeof alertStyles;
  title: ReactNode;
  children?: ReactNode;
  actionLinks?: ReactNode;
  isInline?: boolean;
  className?: string;
}) {
  return (
    <div
      role={variant === 'danger' ? 'alert' : 'status'}
      className={`ta-alert flex items-start gap-3 rounded-xl border p-4 ${alertStyles[variant]} ${className}`}
    >
      <svg
        className="mt-0.5 shrink-0"
        width="20"
        height="20"
        viewBox="0 0 20 20"
        fill="none"
        aria-hidden="true"
      >
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.6" />
        {variant === 'success' ? (
          <path
            d="m6 10 2.5 2.5L14 7"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : (
          <>
            <path d="M10 6v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            <circle cx="10" cy="13" r="1" fill="currentColor" />
          </>
        )}
      </svg>
      <div className="min-w-0 flex-1">
        <p className="ta-alert-title m-0 text-sm font-semibold">{title}</p>
        {children && <div className="ta-alert-description mt-1 text-sm">{children}</div>}
        {actionLinks && <div className="mt-2">{actionLinks}</div>}
      </div>
    </div>
  );
}
export function EmptyState({
  titleText,
  headingLevel = 'h2',
  children,
  className = '',
}: {
  titleText: string;
  headingLevel?: 'h1' | 'h2' | 'h3';
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-2 p-8 text-center ${className}`}>
      <Title headingLevel={headingLevel} className="m-0">
        {titleText}
      </Title>
      {children}
    </div>
  );
}
export function EmptyStateBody({ children }: { children: ReactNode }) {
  return <p className="m-0 text-sm text-gray-500">{children}</p>;
}
