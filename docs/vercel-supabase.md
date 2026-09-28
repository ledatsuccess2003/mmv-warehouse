# Kết nối MMV Warehouse với Supabase trên Vercel

Ứng dụng React/Vite nằm trong `mmv-warehouse`. Không dùng file HTML thử nghiệm ở thư mục gốc để kiểm tra kết nối của bản Vercel.

## Cấu hình

1. Lấy Project URL và public anon key (hoặc publishable key) của đúng dự án trong Supabase. Không dùng `service_role` hoặc secret key cho ứng dụng trình duyệt.
2. Khi chạy trên máy, sao chép `mmv-warehouse/.env.example` thành `mmv-warehouse/.env` và thay hai giá trị mẫu. File `.env` không được đưa lên Git.
3. Trong Vercel → project `mmvwarehouse` → Settings → Environment Variables, thêm `VITE_SUPABASE_URL` và `VITE_SUPABASE_ANON_KEY`, chọn Production. Nếu cần bản Preview kết nối cùng backend, cấu hình Preview riêng theo nhu cầu.
4. Lưu rồi Redeploy bản Production. Biến Vite được chèn vào JavaScript khi build; lưu biến không thay đổi bản đang chạy.

## Kiểm tra

- Build Production thiếu/sai cấu hình phải thất bại với tên biến cần sửa, không in giá trị khóa.
- Mở lại website và xem Console: không còn cảnh báo `[MMV]` về thiếu cấu hình.
- Tại màn hình chọn nhân viên, Network phải có request tới `<Project URL>/rest/v1/users` và nhận phản hồi thành công. Có request chưa đủ: kiểm tra HTTP status và nội dung phản hồi. Danh sách rỗng có thể là dữ liệu chưa được nạp hoặc policy chưa phù hợp.
- Nếu request lỗi, xử lý URL/key/schema/policy tương ứng. Không chuyển sang dữ liệu mẫu để che lỗi.
- Sau khi chuyển từ demo sang Supabase hoặc đổi project, chọn lại người dùng. Phiên dùng thử không được dùng làm danh tính trong kho thật.

## Chạy và kiểm thử cục bộ

```sh
cd mmv-warehouse
npm run test:config
npm run build
```

`npm run dev` cho phép thử giao diện với dữ liệu mẫu nếu chưa có cấu hình hợp lệ. `npm run build:demo` tạo bản xem thử cục bộ. Cả hai hiển thị thông báo dữ liệu mẫu, không lưu lên kho chung. Vercel từ chối chế độ build demo.

Khi triển khai cùng bản mã mới nhất, kiểm tra backend đã có các RPC được ứng dụng gọi. Với dữ liệu đang dùng, áp dụng migration phù hợp; không chạy lại `schema.sql` vì file đó tạo mới cơ sở dữ liệu bằng cách xóa các bảng hiện có. Kiểm thử dữ liệu mẫu không xác nhận được RPC trên Supabase thật.

Tài liệu: [Vite — Env Variables and Modes](https://vite.dev/guide/env-and-mode), [Vercel — Managing environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables).
