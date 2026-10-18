// Do not cache authenticated records, API responses or mutations. Offline is not a successful issue.
self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(Promise.all([
  self.clients.claim(),caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('mmv-shell-')).map(k=>caches.delete(k))))
])))
self.addEventListener('push', (event) => {
  let data={title:'Kho MMV',body:'Có cập nhật yêu cầu vật tư. Mở kho MMV để xem.',id:'mmv'}
  try {data={...data,...event.data.json()}} catch { /* still show a visible notification */ }
  const url=/^[a-f0-9-]{36}$/i.test(data.request_id||'')?`/?request=${encodeURIComponent(data.request_id)}`:'/'
  event.waitUntil(self.registration.showNotification(data.title,{body:data.body,tag:String(data.id),icon:'/icons/icon-192.svg',data:{url}}))
})
self.addEventListener('notificationclick',event=>{
  event.notification.close()
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(windows=>{
    const tab=windows.find(w=>new URL(w.url).origin===self.location.origin)
    const target=new URL(event.notification.data?.url||'/',self.location.origin)
    const url=target.origin===self.location.origin?target.href:self.location.origin+'/'
    return tab?tab.navigate(url).then(t=>t?.focus()):self.clients.openWindow(url)
  }))
})
