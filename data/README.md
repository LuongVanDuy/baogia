# data/

Thư mục này được dùng như kho dữ liệu file cho các báo giá.

- Mỗi báo giá được lưu thành một file JSON riêng, ví dụ `PO_210826.json`.
- `index.json` là chỉ mục tóm tắt để quản lý danh sách báo giá.
- Trên Chrome/Edge, giao diện web có nút **Kết nối thư mục data**. Hãy chọn thư mục gốc của dự án; ứng dụng sẽ tự tạo/đọc/ghi thư mục `data/`.
- Trình duyệt vẫn giữ một bản cache trong `localStorage` để mở nhanh và làm phương án dự phòng.

Lưu ý: GitHub Pages là website tĩnh nên trình duyệt không thể tự commit file JSON lên GitHub. Nếu bạn chọn chính thư mục clone của repo trên máy tính, các file JSON sẽ xuất hiện trong `data/` cục bộ và có thể được commit/push như các file bình thường.
