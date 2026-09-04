# App lấy vật tư xưởng — Mermaid Maritime Vietnam

Ứng dụng để kỹ thuật viên xưởng ghi nhận vật tư tiêu hao đã lấy, thay cho việc
viết giấy hoặc báo miệng. Giải bài toán ở **mục 4 (VẬT TƯ TIÊU HAO)** trong
`BAO_CAO_CONG_VIEC_KHO_CHO_IT.docx`.

Bản dùng thử — để KTV bấm thật và bộ phận IT lấy làm mẫu đặc tả.

## Nội dung

| File | Là gì |
|---|---|
| `app-vat-tu-xuong.html` | Toàn bộ ứng dụng: một file HTML, không cần build, không phụ thuộc thư viện ngoài |
| `docs/ke-hoach-kho-mmv.html` | Tài liệu rà soát hiện trạng và lộ trình 5 giai đoạn |

## Cách chạy

Mở trực tiếp `app-vat-tu-xuong.html` bằng trình duyệt là chạy được, nhưng
**dữ liệu chỉ lưu trên máy đó**.

Bản đang dùng chung được xuất bản dưới dạng Artifact trên claude.ai — dùng link
đó cho tablet ở xưởng để mọi máy cùng thấy một dữ liệu.

## Tài khoản

Lần đầu mở, app tự tạo danh sách tài khoản:

- `admin` / `mmv2026` — quản trị. **Đổi mật khẩu này ngay.**
- 15 tài khoản KTV, tên đăng nhập sinh từ họ tên (ví dụ `vinhnt`, `tulh`),
  mật khẩu ban đầu trùng tên đăng nhập.

Ba vai trò:

| Vai trò | Quyền |
|---|---|
| `ktv` | Ghi vật tư đã lấy, chỉ xem nhật ký của chính mình |
| `kho` | Xem toàn bộ nhật ký, xuất file cho sheet Movement |
| `admin` | Thêm/khóa/xóa tài khoản, đổi vai trò, đổi mật khẩu, tải `users.txt` |

## Dữ liệu

Danh mục 36 mã vật tư tiêu hao (33 mã tiêu hao + 3 mã cuộn cắt dần) lấy từ
sheet `CONSUMABLE MATERIAL` và `Material` của file `08-26.xlsx`. Danh sách JOB
lấy từ sheet `Movement`.

Nhật ký, danh sách tài khoản và mật khẩu lưu ngay trong trang, ở thẻ
`<script id="app-state">`. Mỗi lần bấm xác nhận, app dựng lại toàn bộ trang và
xuất bản thành một phiên bản mới.

Trên máy người dùng chỉ lưu ba khóa nhỏ trong `localStorage`:
`mmv.session` (ai đang đăng nhập), `mmv.job` (JOB chọn gần nhất),
`mmv.offline` (dòng chưa đẩy lên được khi mất mạng).

## Xuất sang Excel

Tab **Nhật ký** → **Tải file cho sheet Movement**. File ra đúng 12 cột của sheet
`Movement`:

```
ITEMS, SRV, SIV, DATE, CODE, DESCRIPTION, UNIT, RECEIPT, ISSUE, JOB CODE, VESSEL, REMAKS
```

Dùng mô tả tiếng Anh và đơn vị gốc (`pair`, `roll`, `pcs`…) đúng như sheet
`Material`, dán thẳng vào file tồn kho được.

## Giới hạn đã biết

- **Mật khẩu lưu dạng chữ thường, không mã hóa** — theo yêu cầu. Ai mở được app
  cũng đọc được. Đừng dùng lại mật khẩu email công ty.
- **Dữ liệu nằm trên hạ tầng claude.ai**, không phải hệ thống công ty. Bản chính
  thức phải chuyển về SharePoint List hoặc server nội bộ.
- **Số tồn hiển thị chưa đúng** — lấy từ bản `08-26.xlsx` trong thư mục
  *MMV AI Transformation* (26/08), trong khi file kho đang chạy nằm ở
  *Warehouse/01 Inventory/2026* và có số thấp hơn. Cần nạp lại.
- **Chưa chạy offline thật.** Mất mạng thì ghi tạm vào máy đó, máy khác chưa thấy.
- **Nhật ký chưa thật sự không xóa được** như `PR_PRO_002` yêu cầu — cơ chế là
  ghi đè cả trang.
- Hai người bấm xác nhận đúng cùng lúc thì một người phải bấm lại.

## Việc tiếp theo

1. Nạp lại số tồn thật từ `Warehouse/01 Inventory/2026/08-26.xlsx`
2. Chuyển chỗ lưu dữ liệu sang SharePoint List + Power Apps
3. Mở rộng sang phiếu OUT/IN, Material Request (`PR_FRM_005`) và số PO —
   những phần `PR_PRO_002` yêu cầu mà app chưa chạm tới
