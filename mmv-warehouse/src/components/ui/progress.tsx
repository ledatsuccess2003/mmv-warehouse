import { cn } from '@/lib/utils'

interface ProgressProps {
  value: number // 0..100
  className?: string
  barClassName?: string
}

export function Progress({ value, className, barClassName }: ProgressProps) {
  const v = Math.max(0, Math.min(100, value))
  return (
    <div className={cn('h-5 w-full overflow-hidden rounded-full bg-muted', className)}>
      <div
        className={cn('h-full rounded-full bg-confirm transition-all duration-300', barClassName)}
        style={{ width: `${v}%` }}
      />
    </div>
  )
}
