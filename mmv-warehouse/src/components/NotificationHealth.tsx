import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

export function NotificationHealth({ token }: { token: string }) {
  const [status, setStatus] = useState('Đang kiểm tra máy chủ thông báo…');
  const [checking, setChecking] = useState(false), [result, setResult] = useState('');
  useEffect(() => {
    let stopped = false;
    void fetch('/api/push').then(async r => {
      if (!r.ok) throw new Error('unavailable');
      const config = await r.json();
      if (!stopped) setStatus(config.enabled
        ? 'Máy chủ thông báo nền đã cấu hình. Mỗi thiết bị cần bấm “Bật thông báo” và cho phép trình duyệt. Không bắt buộc cài app (riêng iPhone cần thêm vào Màn hình chính để nhận nền).'
        : 'Thông báo trong web vẫn được lưu. Thông báo khi đóng web CHƯA hoạt động: máy chủ thiếu cấu hình gửi. Admin cần hoàn tất Secret trên Vercel, sau đó từng thiết bị bật quyền thông báo.');
    }).catch(() => { if (!stopped) setStatus('Chưa kiểm tra được máy chủ thông báo nền. Xem thông báo đã lưu trong mục Thông báo.'); });
    return () => { stopped = true; };
  }, []);
  return <section className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950"><p>{status}</p>
    <Button variant="outline" disabled={checking} onClick={async () => {
      setChecking(true); setResult('Đang kiểm tra luồng gửi…');
      try {
        const response = await fetch('/api/push', { method:'POST', headers:{Authorization:`Bearer ${token}`} });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(`${data.error || 'Không gửi được thông báo'}${data.stage ? ` [${data.stage}]` : ''}`);
        setResult(Number(data.delivered) > 0 ? `Dịch vụ push đã chấp nhận ${data.delivered} thông báo trong lượt gửi này (có thể thuộc nhiều người). Cần người nhận xác nhận trên điện thoại; đây chưa phải bằng chứng thiết bị đã hiển thị.` : 'Chưa có thông báo được gửi thành công trong lượt này. Có thể chưa đăng ký thiết bị, đang chờ thử lại hoặc không có thông báo đến hạn.');
      } catch (error) { setResult((error as Error).message); }
      finally { setChecking(false); }
    }}>Kiểm tra gửi thông báo</Button>
    {result && <p role="status" aria-live="polite">{result}</p>}
  </section>;
}
