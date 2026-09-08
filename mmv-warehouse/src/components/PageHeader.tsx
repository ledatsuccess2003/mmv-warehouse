import { useNavigate } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

interface Props {
  title: string
  subtitle?: string
  back?: string | boolean | (() => void)
  right?: React.ReactNode
}

export function PageHeader({ title, subtitle, back, right }: Props) {
  const navigate = useNavigate()
  return (
    <div className="no-print mb-5 flex items-center gap-3">
      {back && (
        <button
          onClick={() => typeof back === 'function' ? back() : typeof back === 'string' ? navigate(back) : navigate(-1)}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border-2 border-navy text-navy hover:bg-navy/5"
          aria-label="Quay lại"
        >
          <ArrowLeft className="h-6 w-6" />
        </button>
      )}
      <div className="min-w-0">
        <h1 className="truncate text-2xl font-extrabold text-navy">{title}</h1>
        {subtitle && <p className="text-base text-muted-foreground">{subtitle}</p>}
      </div>
      {right && <div className="ml-auto shrink-0">{right}</div>}
    </div>
  )
}
