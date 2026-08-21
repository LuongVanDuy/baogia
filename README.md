# Báo giá - Quote Generator

Website HTML tĩnh để tạo báo giá dựa theo file mẫu `MAU BAO GIA`.

## Chức năng

- Nhập TÊN CTY / Company và ĐỊA CHỈ / Address của bên mua.
- Repeater thêm / xóa nhiều hàng hóa, dịch vụ.
- Tự tính thành tiền, tổng trước VAT, VAT và tổng sau VAT.
- Thông tin bên bán được điền sẵn theo file mẫu và vẫn có thể chỉnh sửa.
- Lưu lịch sử báo giá bằng `localStorage` trên trình duyệt.
- Tải toàn bộ lịch sử thành file JSON và nhập JSON trở lại.
- Xuất Word (`.doc`), Excel (`.xlsx`) và PDF (`.pdf`).
- Không cần build, không cần Node.js: chỉ cần mở `index.html`.

## Chạy local

Mở trực tiếp `index.html`, hoặc dùng một static server bất kỳ.

Ví dụ với Python:

```bash
python -m http.server 8000
```

Sau đó mở `http://localhost:8000`.

## GitHub Pages

Repo có thể được publish bằng GitHub Pages từ branch `main`, thư mục `/ (root)`.

## Lưu ý về lịch sử JSON

Đây là website tĩnh, nên trình duyệt không thể tự ghi trực tiếp vào một file JSON trong repository GitHub mà không có backend/token. Vì vậy app lưu lịch sử bằng `localStorage`, đồng thời cung cấp nút **Tải lịch sử JSON** và **Nhập JSON** để sao lưu/khôi phục lịch sử.
