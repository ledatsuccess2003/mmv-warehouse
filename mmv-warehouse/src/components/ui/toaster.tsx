import { CheckCircle2, XCircle, Info } from 'lucide-react'
import { useToast } from '@/store/useToast'
import { cn } from '@/lib/utils'

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
}

const STYLES = {
  success: 'bg-confirm text-white',
  error: 'bg-danger text-white',
  info: 'bg-navy text-white',
}

export function Toaster() {
  const toasts = useToast((s) => s.toasts)
  const remove = useToast((s) => s.remove)

  return (
    <div className="pointer-events-none fixed inset-x-0 top-4 z-[100] flex flex-col items-center gap-2 px-4">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind]
        return (
          <div
            key={t.id}
            onClick={() => remove(t.id)}
            className={cn(
              'pointer-events-auto flex w-full max-w-md animate-fade-in items-center gap-3 rounded-xl px-4 py-3 text-lg font-semibold shadow-lg',
              STYLES[t.kind]
            )}
          >
            <Icon className="h-6 w-6 shrink-0" />
            <span>{t.message}</span>
          </div>
        )
      })}
    </div>
  )
}
