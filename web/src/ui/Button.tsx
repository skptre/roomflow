import type { ButtonHTMLAttributes, ReactNode } from 'react'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const variants: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink shadow-panel hover:opacity-90',
  secondary: 'border border-line bg-surface-raised text-ink hover:bg-surface-sunken',
  ghost: 'text-ink hover:bg-surface-sunken',
  danger: 'text-danger hover:bg-danger-soft',
}

const sizes: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-2.5 text-sm',
  md: 'h-10 gap-2 px-3.5 text-sm',
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  /** Icon-only buttons must pass aria-label. */
  icon?: ReactNode
}

/** Tokened button. Focus ring comes from the global :focus-visible style. */
export function Button({ variant = 'secondary', size = 'md', icon, children, className = '', type = 'button', ...rest }: ButtonProps) {
  const iconOnly = icon && !children
  return (
    <button
      type={type}
      className={`inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-[background-color,opacity,color] duration-[var(--duration-fast)] ease-[var(--ease-out-soft)] disabled:pointer-events-none disabled:opacity-45 ${variants[variant]} ${sizes[size]} ${iconOnly ? 'aspect-square px-0' : ''} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </button>
  )
}
