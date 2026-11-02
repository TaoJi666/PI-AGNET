import type { InputHTMLAttributes } from 'react'
import { cn } from '@renderer/lib/utils'

function Input({
  className,
  type = 'text',
  ...props
}: InputHTMLAttributes<HTMLInputElement>): React.JSX.Element {
  return (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full min-w-0 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}

export { Input }
