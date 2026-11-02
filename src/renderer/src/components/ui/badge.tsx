import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes } from 'react'
import { cn } from '@renderer/lib/utils'

const badgeVariants = cva(
  'inline-flex w-fit items-center rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        outline: 'text-foreground',
        destructive: 'border-transparent bg-destructive text-white'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>): React.JSX.Element {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge }
