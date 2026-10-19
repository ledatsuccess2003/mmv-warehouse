import { useEffect, useState } from 'react';

export function NotificationHealth() {
  const [status, setStatus] = useState('Đang kiểm tra máy chủ thông báo…');
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
  return <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">{status}</p>;
}
