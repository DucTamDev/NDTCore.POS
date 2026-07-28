# Thiết Kế: NDTCore.POS Phase 1 — Printer Integration

> **Scope:** Toàn bộ Phase 1 theo `docs/specs/project.md` — hạ tầng phát hiện/cấu hình/kết nối/test in máy in, chạy trên cả Web và Android. Không bao gồm nghiệp vụ bán hàng (Phase 2).

---

## 1. Bối Cảnh & Mục Đích

NDTCore.POS là app POS đa nền tảng (Web + Android qua Capacitor), một codebase duy nhất. Mục tiêu Phase 1: xây xong hạ tầng in — phát hiện máy in, cấu hình, kết nối, in thử — làm nền cho Phase 2 (in bill thật khi có đơn hàng).

Repo hiện chưa có code, chỉ có spec tổng quan (`docs/specs/project.md`) và `CLAUDE.md`. Đây là spec chi tiết cho việc implement Phase 1.

**Tham khảo:** Project chị em NDTCore.FE (`docs/superpowers/specs/2026-07-27-pos-bill-print-webusb-design.md` trong repo `NDTCore/`) đã có spec/plan cho việc in bill qua WebUSB (Xprinter, 80mm, ESC/POS raster) — chưa implement nhưng nhiều quyết định kỹ thuật ở đó được tái sử dụng ở đây (xem mục 3).

---

## 2. Kiến Trúc

Một Vue 3 + Vite app duy nhất; Capacitor bọc thêm shell Android — không phải 2 codebase riêng.

```text
usePrinterStore → PrinterManager → PrinterFactory → Driver (Generic ESC/POS)
                                                          │ encode() → bytes
                                                          ▼
                                              Connection (Usb | Lan)
                                                          │
                                          Capacitor Plugin ("Printer")
                                                          │
                                        ┌─────────────────┴─────────────────┐
                                   web impl                          android impl
                              (WebUSB, browser)                (Kotlin: UsbManager / Socket)
```

**Khác biệt so với sơ đồ trong `project.md`:** sơ đồ gốc đặt Capacitor Plugin ở trên Manager/Factory/Driver. Ở đây Plugin được đặt xuống dưới cùng, ngay trên Connection Layer, chỉ đóng vai trò transport thuần (scan/connect/write/disconnect byte thô). Lý do: logic build bill, chọn driver, encode ESC/POS cần nằm ở TypeScript dùng chung một chỗ; nếu để native Kotlin tự làm luôn Driver/Factory thì phải viết lại y hệt logic đó ở cả JS lẫn Kotlin và dễ lệch nhau theo thời gian.

### Repo / Module Structure

```text
src/
├── core/                       # storage (@capacitor/preferences), http client (dùng ở Phase 2)
└── modules/
    └── printer/
        ├── pages/               # PrinterSettingsPage.vue
        ├── components/          # PrinterDiscoveryList, ConnectionStatusChip...
        ├── stores/              # usePrinterStore (Pinia) — driver, connection type, device, status
        ├── managers/            # printer-manager.ts, printer-factory.ts
        ├── drivers/             # generic-escpos.driver.ts
        ├── connections/         # usb-connection.ts, lan-connection.ts
        └── plugin/              # printer-web.impl.ts (JS/WebUSB side of Capacitor plugin)
android/
└── app/src/main/java/.../printer/  # PrinterPlugin.kt (@CapacitorPlugin), UsbTransport.kt, LanTransport.kt
```

---

## 3. Capacitor Plugin — Transport Layer

Một Capacitor plugin (`Printer`), 1 TS interface, 2 implementation (web / android). Code Vue/Pinia/Manager không cần biết đang chạy platform nào.

```ts
interface PrinterPlugin {
  scanUsb(): Promise<{ devices: UsbDeviceInfo[] }>
  connectUsb(opts: { vendorId: number; productId: number }): Promise<{ connectionId: string }>
  connectLan(opts: { ip: string; port: number }): Promise<{ connectionId: string }>
  write(opts: { connectionId: string; data: number[] }): Promise<void>
  disconnect(opts: { connectionId: string }): Promise<void>
  getStatus(opts: { connectionId: string }): Promise<{ status: 'connected' | 'disconnected' | 'error' }>
}
```

### Web implementation

- `scanUsb()` / `connectUsb()`: dùng `navigator.usb`. Có thiết bị đã lưu (serialNumber/vendorId/productId trong storage) → `navigator.usb.getDevices()`, tìm khớp, mở lại không hỏi quyền. Chưa có → `navigator.usb.requestDevice({ filters: [] })` (không lọc gì, hiện mọi thiết bị USB — quyết định đã kiểm chứng ở spec WebUSB bên NDTCore.FE vì không chắc Vendor/Product ID thật của từng dòng Xprinter/OEM). Phải gọi trong cùng user-gesture (click handler).
- `connectLan()`: **ném lỗi rõ ràng "LAN không hỗ trợ trên trình duyệt"**. Lý do kỹ thuật: trình duyệt không có API mở raw TCP socket tới IP:port; chỉ Android native mới làm được. UI Settings disable option LAN khi chạy trên web (detect qua `Capacitor.getPlatform() === 'web'`).
- `write()`: `device.transferOut(endpointNumber, data)` sau khi đã `open()` → `selectConfiguration(1)` → tìm interface có endpoint OUT kiểu bulk → `claimInterface()`.

### Android implementation (Kotlin, `@CapacitorPlugin`)

- `scanUsb()` / `connectUsb()`: `UsbManager.deviceList`, xin quyền qua `UsbManager.requestPermission()`, mở kết nối qua `UsbDeviceConnection`, tìm endpoint OUT, `bulkTransfer()` để ghi.
- `connectLan()`: `java.net.Socket(ip, port)` (port mặc định 9100 — cổng raw ESC/POS chuẩn), lấy `OutputStream` để ghi.
- `write()`: ghi bytes qua transport tương ứng (USB bulkTransfer hoặc Socket OutputStream) dựa trên `connectionId` đã lưu trong plugin.

---

## 4. Driver — Generic ESC/POS

Deliverable Phase 1 chỉ có **Generic ESC/POS Driver** (kiến trúc hỗ trợ thêm Vendor SDK driver sau, không implement ở Phase 1 — xem `project.md` mục Deliverables).

Port lại quyết định đã kiểm chứng ở spec WebUSB bên NDTCore.FE: **render nội dung ra `<canvas>` bitmap đen-trắng rồi in bằng lệnh raster ảnh của ESC/POS**, không gửi text thô. Lý do: các bảng mã có sẵn trong `@point-of-sale/receipt-printer-encoder` (`cp437, cp850, cp860...`) không có bảng nào hỗ trợ tiếng Việt có dấu; dùng ảnh raster tránh hoàn toàn vấn đề bảng mã.

- Khổ giấy: 80mm, 203dpi, **576 dot ngang** (hằng số duy nhất cần chỉnh nếu sau này đo được số khác).
- `buildTestPrintBytes()`: dựng canvas nội dung bill mẫu tĩnh (tên cửa hàng, order mẫu, TOTAL, "Thank You" — nội dung mẫu giống ví dụ trong `project.md`), qua `new ReceiptPrinterEncoder({ language: 'esc-pos' }).initialize().image(canvas, 576, height, 'raster').cut().encode()`.
- Dùng thẳng package `@point-of-sale/receipt-printer-encoder` để dựng lệnh ESC/POS (không phụ thuộc thiết bị, an toàn dùng chung cả USB/LAN). **Không** dùng `@point-of-sale/webusb-receipt-printer` — lý do đã kiểm chứng ở spec WebUSB: package đó hardcode 1 cặp vendorId/productId, không có API thêm ID khác, rủi ro popup chọn thiết bị không hiện được máy in thật.
- Cần ambient type declaration (`.d.ts`) tối thiểu cho `@point-of-sale/receipt-printer-encoder` (package không có sẵn type), chỉ khai báo phần API dùng tới (constructor, `.initialize()`, `.image()`, `.cut()`, `.encode()`).

---

## 5. Data Model & Persistence

Dùng `@capacitor/preferences` (plugin chính thức của Capacitor) — tự map sang LocalStorage trên web / SharedPreferences trên Android, không cần tự viết nhánh storage theo platform.

```ts
interface StoredPrinterConfig {
  driver: 'generic-escpos'
  connectionType: 'usb' | 'lan'
  autoConnect: boolean
  usbDevice?: { serialNumber?: string; vendorId: number; productId: number }
  lanDevice?: { ip: string; port: number }
}
```

`serialNumber` optional vì không phải máy in nào cũng báo số serial qua WebUSB — khi đó reconnect dựa vào cặp `vendorId` + `productId`.

---

## 6. UI — Printer Settings Page

Một trang `PrinterSettingsPage.vue`:

1. Chọn Connection Type: USB / LAN (LAN disabled khi `Capacitor.getPlatform() === 'web'`) / Bluetooth (placeholder, luôn disabled — ngoài scope Phase 1).
2. Nếu USB: nút "Scan" → mở danh sách thiết bị tìm được (`scanUsb()`) → chọn 1 thiết bị → Connect.
3. Nếu LAN: form nhập IP + port thủ công (không tự động dò subnet — quyết định đã chốt để giữ đơn giản, đáng tin cậy) → Connect.
4. Chip trạng thái: Connected / Connecting / Disconnected / Error.
5. Nút "Print Test Bill" (chỉ enable khi Connected) → gọi `driver.buildTestPrintBytes()` → `connection.write(bytes)`.
6. Auto Connect: toggle, nếu bật thì khi mở app tự thử `connectUsb()`/`connectLan()` lại với device đã lưu (không tự động hiện popup xin quyền lại phía web nếu chưa từng cấp — giới hạn của WebUSB).

---

## 7. Error Handling

- `!('usb' in navigator)` (web) → toast lỗi ngay, không thử connect.
- `connectLan()` gọi trên web → toast lỗi "LAN không hỗ trợ trên trình duyệt".
- Kết nối thất bại (hủy popup, không tìm thấy thiết bị đã lưu, mất mạng LAN...) → toast lỗi, giữ nguyên trạng thái trước đó.
- `write()` thất bại (mất kết nối, máy in hết giấy, socket bị đóng...) → toast lỗi.
- Không có cơ chế tự động fallback giữa USB ↔ LAN hay giữa các driver — user tự chọn lại trong Settings.

---

## 8. Testing

Repo chưa có hạ tầng test tự động (giống hiện trạng NDTCore.FE) → verify bằng:

- `npm run type-check` + lint sau khi code xong.
- Test tay bắt buộc trên thiết bị thật: USB cần Chrome + máy in thật (popup cấp quyền WebUSB không mô phỏng được trong CI); LAN cần máy in thật cùng mạng + build Android thật (Socket TCP không chạy được trong browser dev server).

---

## 9. Out of Scope (Phase 1)

- Bluetooth (chỉ placeholder UI, không kết nối được).
- Vendor SDK driver (XPrinter/Epson/Star/Sunmi SDK) — chỉ Generic ESC/POS.
- LAN trên nền web thuần (cần thêm local bridge service — có thể làm sau nếu thực sự cần, xem ghi chú tương tự ở spec WebUSB bên NDTCore.FE).
- Tự động dò tìm máy in trên LAN (scan subnet) — chỉ nhập IP thủ công.
- Toàn bộ nghiệp vụ bán hàng (Phase 2: sales screen, cart, payment, receipt thật, order management, shift, customer, promotion, sync, reports).
- Test tự động (không có hạ tầng test trong repo).
