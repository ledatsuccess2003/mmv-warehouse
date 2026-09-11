import { useEffect, useState } from 'react'
import { Download, Share, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface DeferredInstallPrompt extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

function isMobile() {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.matchMedia('(max-width: 767px)').matches
}

export function InstallAppPrompt() {
  const [mobile, setMobile] = useState(false)
  const [ios, setIos] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [deferred, setDeferred] = useState<DeferredInstallPrompt | null>(null)

  useEffect(() => {
    setMobile(isMobile())
    setIos(/iPhone|iPad|iPod/i.test(navigator.userAgent))
    setInstalled(window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true)

    const onBeforeInstall = (event: Event) => {
      event.preventDefault()
      setDeferred(event as DeferredInstallPrompt)
    }
    const onInstalled = () => setInstalled(true)
    window.addEventListener('beforeinstallprompt', onBeforeInstall)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstall)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (!mobile || installed) return null

  async function install() {
    if (!deferred) return
    await deferred.prompt()
    const choice = await deferred.userChoice
    if (choice.outcome === 'accepted') setInstalled(true)
    setDeferred(null)
  }

  return (
    <div className="install-prompt no-print" role="dialog" aria-modal="true" aria-labelledby="install-title">
      <div className="install-prompt__card">
        <div className="install-prompt__icon"><Smartphone className="h-7 w-7" /></div>
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.16em] text-navy-light">Kho MMV trên điện thoại</p>
          <h2 id="install-title" className="mt-1 text-2xl font-extrabold text-navy">Cài ứng dụng để dùng nhanh hơn</h2>
          {ios ? (
            <p className="mt-2 text-base text-muted-foreground">Nhấn <Share className="mx-1 inline h-4 w-4 text-navy" /> Chia sẻ, rồi chọn <b>Thêm vào Màn hình chính</b>.</p>
          ) : deferred ? (
            <p className="mt-2 text-base text-muted-foreground">Cài một lần để mở nhanh như ứng dụng, dùng toàn màn hình và không phải tìm lại trang web.</p>
          ) : (
            <p className="mt-2 text-base text-muted-foreground">Mở menu trình duyệt và chọn <b>“Cài đặt ứng dụng”</b> hoặc <b>“Thêm vào màn hình chính”</b>.</p>
          )}
        </div>
        {deferred && <Button size="lg" className="mt-5 w-full" onClick={install}><Download className="h-5 w-5" /> Cài Kho MMV</Button>}
      </div>
    </div>
  )
}
