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
- Sau khi đổi project Supabase, chọn lại người dùng: phiên đăng nhập được lưu riêng theo từng project.

## Chạy và kiểm thử cục bộ

```sh
cd mmv-warehouse
npm run test:config
npm run build
```

Ứng dụng không còn chế độ dữ liệu mẫu. Thiếu cấu hình thì `npm run build` thất bại và `npm run dev` chỉ hiện màn hình "Chưa kết nối kho dữ liệu". `npm run dev` với `.env` hợp lệ ghi thẳng vào kho đang dùng; cần môi trường thử thì trỏ `.env` sang một project Supabase riêng.

Khi triển khai cùng bản mã mới nhất, kiểm tra backend đã có các RPC được ứng dụng gọi. Với dữ liệu đang dùng, áp dụng migration phù hợp; không chạy lại `schema.sql` vì file đó tạo mới cơ sở dữ liệu bằng cách xóa các bảng hiện có. Bộ test tự động không chạm tới RPC trên Supabase.

Tài liệu: [Vite — Env Variables and Modes](https://vite.dev/guide/env-and-mode), [Vercel — Managing environment variables](https://vercel.com/docs/environment-variables/managing-environment-variables).
