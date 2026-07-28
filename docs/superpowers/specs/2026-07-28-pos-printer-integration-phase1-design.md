# NDTCore.POS — Phase 1: Printer Integration — Design Spec

Ngày: 2026-07-28
Nguồn yêu cầu: [`docs/specs/project.md`](../../specs/project.md) — Phase 1 section

## 1. Mục tiêu Phase 1

Hoàn thiện hạ tầng tích hợp máy in hóa đơn để kiểm chứng khả năng chạy trên cả Web (Windows/Android browser) và Android App (Capacitor native), trước khi xây nghiệp vụ bán hàng (Phase 2).

Phase 1 **không bao gồm** nghiệp vụ bán hàng, chỉ tập trung: phát hiện thiết bị, cấu hình, kết nối, và in thử.

## 2. Kiến trúc tổng thể

```
Vue 3 (Vuetify)
   │
PrinterService (Vue composable)
   │
Capacitor PrinterPlugin  ← điểm giao Web/Android
   │              │
web.ts        PrinterPlugin.kt (Android)
   │              │
PrinterManager (orchestration: scan/connect/print/status)
   │
PrinterFactory (registry-based: tra driver theo config)
   │
Driver (GenericEscPosDriver | XPrinterDriver | EpsonDriver)
   │
Connection (UsbConnection | LanConnection) — chỉ áp dụng cho driver cần connection thô
   │
Printer (vật lý)
```

`PrinterManager`, `PrinterFactory`, `Driver`, `Connection` tồn tại **song song ở 2 nơi** vì khác ngôn ngữ/runtime:

- **Web**: TypeScript, sống trong `web.ts` của plugin.
- **Android**: Kotlin, sống trong plugin native (`android/.../printer/`).

Interface plugin API (`scanPrinters`, `connect`, `disconnect`, `print`, `testPrint`, `getStatus`, `saveConfig`, `loadConfig`) định nghĩa trong `definitions.ts` — là nguồn sự thật cho contract giữa Vue app và 2 implementation (web/android).

### Plugin structure

Local in-app plugin — **không tách package riêng**. Plugin sống ngay trong repo app, đăng ký trực tiếp qua Capacitor local plugin registration. Lý do: Phase 1 chỉ có 1 app dùng, tách package riêng là overhead không cần thiết ở giai đoạn này; có thể tách thành standalone package sau nếu có app khác cần dùng lại.

## 3. Ma trận năng lực theo platform

| Khả năng | Web (Windows/Android browser) | Android App (native) |
|---|---|---|
| Kết nối USB | ✅ WebUSB (`navigator.usb`) | ✅ USB Host API (Kotlin) |
| Kết nối LAN | ❌ (browser sandbox không có raw TCP socket) | ✅ TCP socket, port 9100 |
| Kết nối Bluetooth | ❌ chưa implement (registry slot trống) | ❌ chưa implement |
| Driver `generic-escpos` | ✅ qua `UsbConnection` | ✅ qua `UsbConnection`/`LanConnection` |
| Driver `xprinter` (SDK thật) | ❌ | ✅ SDK tự quản lý kết nối nội bộ |
| Driver `epson` (SDK thật) | ❌ | ✅ SDK tự quản lý kết nối nội bộ |
| Driver `star`, `sunmi` | Chưa implement | Chưa implement |

Ghi chú:
- "Web" áp dụng như nhau dù chạy trên Windows hay mở qua trình duyệt Android (Chrome mobile) — không phân biệt OS, chỉ phân biệt browser vs native app.
- Đã cân nhắc và **loại bỏ** phương án in qua `window.print()` (Windows Print Driver/OS spooler) khỏi Phase 1 — Web chỉ dùng WebUSB.
- XPrinter/Epson SDK không có bản cho web/browser nên chỉ implement trên Android.

## 4. Cơ chế mở rộng (Driver/Connection Registry)

`PrinterFactory` dùng **registry pattern** (map đăng ký theo key), không dùng if/else hay switch:

```ts
driverRegistry.register('generic-escpos', () => new GenericEscPosDriver())
driverRegistry.register('xprinter', () => new XPrinterDriver())      // Android only
driverRegistry.register('epson', () => new EpsonDriver())            // Android only

connectionRegistry.register('usb', () => new UsbConnection())
connectionRegistry.register('lan', () => new LanConnection())        // Android only
```

Thêm driver/connection mới ở phase sau = đăng ký thêm entry, không sửa code `PrinterFactory` hiện có.

**Lưu ý interface quan trọng**: `PrinterDriver.connect()` không bắt buộc phải dùng `Connection` abstraction:
- `generic-escpos` nhận 1 `Connection` instance (USB hoặc LAN) để gửi raw ESC/POS bytes.
- `xprinter`/`epson` tự quản lý kết nối nội bộ qua SDK vendor (SDK tự lo USB/network handshake), không đi qua `UsbConnection`/`LanConnection` của hệ thống.

`PrinterFactory` chỉ cần biết driver nào cần `Connection` (generic) và driver nào tự chủ (vendor SDK).

## 5. Driver detection

Khi phát hiện thiết bị USB, hệ thống đọc Vendor ID / Product ID / Product Name → tra bảng gợi ý driver:
- Khớp XPrinter → gợi ý `xprinter` (Android).
- Khớp Epson → gợi ý `epson` (Android).
- Không khớp hãng nào → fallback `generic-escpos`.

## 6. Cấu trúc thư mục (app-level)

```
src/
  core/                       # constants, storage, types — theo convention NDTCore.FE
  native/
    printer-plugin/
      definitions.ts          # PrinterPlugin interface + shared types (PrinterDevice, PrinterConfig, PrinterStatus)
      index.ts                # registerPlugin('PrinterPlugin', { web: () => import('./web') })
      web.ts                  # PrinterManager/Factory/GenericEscPosDriver/UsbConnection (TS)
  modules/
    printer/
      composables/usePrinter.ts
      stores/printer.store.ts    # trạng thái kết nối hiện tại (Pinia shared state)
      views/PrinterSettingsView.vue
      views/PrinterDiscoveryView.vue
      views/TestPrintView.vue
      components/...
android/
  app/src/main/java/.../printer/
    PrinterPlugin.kt
    manager/PrinterManager.kt
    factory/PrinterFactory.kt
    driver/GenericEscPosDriver.kt
    driver/XPrinterDriver.kt
    driver/EpsonDriver.kt
    connection/UsbConnection.kt
    connection/LanConnection.kt
```

## 7. Luồng dữ liệu chính

- **Scan**: UI gọi `usePrinter().scan(connectionType)` → plugin → `PrinterManager.scan()` → liệt kê `PrinterDevice[]` (vendorId/productId/name cho USB, IP cho LAN — LAN chỉ trên Android).
- **Driver suggestion**: sau khi chọn 1 device, `PrinterFactory` tra vendorId/productId theo bảng ở mục 5 → gợi ý driver; không match → fallback `generic-escpos`.
- **Connect**: `connect(config)` → lưu config → cập nhật status.
- **Test Print**: build 1 bill mẫu cứng (không phụ thuộc Order module, xem mẫu trong [`docs/specs/project.md`](../../specs/project.md) mục Test Print) → gửi qua Driver → (Connection nếu có).
- **Persist config**: Web dùng `localStorage`; Android dùng Preferences/DataStore (quyết định cụ thể ở implementation plan).
- **Auto Connect**: khi app khởi động, nếu `autoConnect = true` trong config đã lưu, thử `connect()` lại với device đã lưu; lỗi thì set status `error`, không throw chặn UI.

## 8. Trạng thái & lỗi

`PrinterStatus = 'disconnected' | 'connecting' | 'connected' | 'error'`, giữ trong `printer.store.ts` (Pinia). Lỗi kết nối/in hiển thị qua toast, không throw ra ngoài component — theo convention `useToastNotification` của NDTCore.FE.

## 9. UI

Hoàn chỉnh ngay từ Phase 1 (không phải bản nháp) — vì màn hình Settings/Discovery/Test Print sẽ tiếp tục là màn hình vận hành thật ở Phase 2, dùng Vuetify 3 theo convention NDTCore.FE.

## 10. Ngoài phạm vi Phase 1

- Kết nối Bluetooth (interface có thể định nghĩa trước nhưng không implement).
- Driver Star, Sunmi SDK thật.
- In qua `window.print()` / Windows Print Driver (OS spooler).
- Nghiệp vụ bán hàng, đồng bộ dữ liệu (Phase 2).

## 11. Quyết định đã cân nhắc và loại bỏ

- **Kế thừa code WebUSB cũ từ NDTCore.FE** (`usb-printer.service.ts`, `@point-of-sale/receipt-printer-encoder`): quyết định build mới hoàn toàn, không port lại, để không bị ràng buộc kiến trúc cũ.
- **LAN printing trên Web qua backend relay**: cân nhắc nhưng loại bỏ — Web chỉ hỗ trợ USB, LAN dành riêng cho Android.
- **`window.print()` trên Web/Windows**: cân nhắc thêm như driver riêng không cần Connection, nhưng quyết định loại bỏ khỏi Phase 1.
