import * as React from 'react'
import { cn } from '../../lib/utils'

type SwitchProps = React.InputHTMLAttributes<HTMLInputElement>

export const Switch = React.forwardRef<HTMLInputElement, SwitchProps>(
  ({ className, ...props }, ref) => {
    return (
      <label className={cn('inline-flex items-center gap-2', className)}>
        <span className="relative inline-flex h-4 w-8 flex-shrink-0 cursor-pointer items-center rounded-full border border-border bg-muted transition data-[state=checked]:bg-primary" data-state={props.checked ? 'checked' : 'unchecked'}>
          <input
            type="checkbox"
            className="sr-only"
            ref={ref}
            {...props}
          />
          <span
            data-state={props.checked ? 'checked' : 'unchecked'}
            className="pointer-events-none absolute left-0.5 h-3 w-3 rounded-full bg-background shadow transition-transform data-[state=checked]:translate-x-4"
          />
        </span>
      </label>
    )
  }
)

Switch.displayName = 'Switch'
