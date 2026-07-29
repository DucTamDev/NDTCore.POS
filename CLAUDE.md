# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Summary

NDTCore.POS là hệ thống Point of Sale (POS) đa nền tảng, một codebase Vue 3 duy nhất chạy trên:

- Web Browser
- Android (qua Capacitor)

Mục tiêu cốt lõi: tích hợp với nhiều loại máy in hóa đơn (nhiều vendor, nhiều phương thức kết nối, nhiều máy in kết nối đồng thời — ví dụ máy in quầy + máy in bếp) mà không phụ thuộc vào một nhà sản xuất cụ thể. Kiến trúc mở rộng được: thêm driver/connection mới không ảnh hưởng UI hay business logic.

Phase 1 (đang triển khai): hạ tầng phát hiện/cấu hình/kết nối/test in. Không bao gồm nghiệp vụ bán hàng — xem [`docs/project.md`](docs/project.md) để biết roadmap đầy đủ (Phase 2 — POS System).

## Commands

Tất cả lệnh chạy từ thư mục gốc repo trừ khi ghi chú khác.

```bash
# Web
npm run dev                    # dev server (Vite)
npm run build                  # vue-tsc --build && vite build
npm run type-check             # vue-tsc --build (không emit)
npm run test:unit              # vitest, toàn bộ test
npx vitest run <path>          # chạy 1 file test, vd: npx vitest run src/native/printer-plugin/manager/printer-manager.test.ts
npx vitest run <path> -t "<tên test>"   # chạy 1 test case cụ thể

# Đồng bộ sang Android sau khi sửa code Vue/TS (bắt buộc trước khi build/chạy Android)
npm run build && npx cap sync android

# Android (chạy trong thư mục android/, cần JAVA_HOME trỏ tới JDK hợp lệ nếu biến môi trường mặc định sai)
cd android && ./gradlew assembleDebug              # build APK debug
cd android && ./gradlew testDebugUnitTest           # toàn bộ unit test Kotlin (JVM, không cần thiết bị)
cd android && ./gradlew testDebugUnitTest --tests "com.ndtcore.pos.printer.manager.PrinterManagerTest"   # 1 class test
```

Không có lệnh lint (chưa cấu hình ESLint/oxlint cho sub-project này).

`android/capacitor-cordova-android-plugins/` là thư mục Capacitor tự sinh, nằm trong `.gitignore` — nếu mất (ví dụ sau khi checkout/merge ở máy khác), chạy lại `npm run build && npx cap sync android` để tái tạo trước khi mở bằng Android Studio.

## Kiến trúc

### Hai implementation song song, một hợp đồng chung

Printer plugin tồn tại **hai lần độc lập**, không share code, nhưng phải cùng semantics:

- **TS/Web**: `src/native/printer-plugin/` — `PrinterManager` (session map) → `DriverRegistry`/`ConnectionRegistry` (factory, mỗi `resolve()` tạo instance mới) → Driver (`GenericEscPosDriver`) / Connection (`UsbConnection` dùng WebUSB).
- **Android/Kotlin**: `android/app/src/main/java/com/ndtcore/pos/printer/` — cùng layering (`manager/PrinterManager.kt`, `registry/*Registry.kt`, `driver/*.kt`, `connection/*.kt`), cộng thêm `PrinterPlugin.kt` (Capacitor plugin thật, bridge sang native Android USB/SharedPreferences).

**`src/native/printer-plugin/definitions.ts`** (interface `PrinterPlugin`) là nguồn sự thật duy nhất cho wire contract giữa hai bên — mọi field name (`printerId`, `configs`, `connectionType`...) phải khớp chính xác với cách `PrinterPlugin.kt` đọc qua `call.getString`/`getObject`/`getArray`. Sửa contract ở TS mà không đối chiếu lại Kotlin (và ngược lại) sẽ vỡ runtime, không phải build.

### Multi-printer: session map theo `printerId`

Cả hai `PrinterManager` (TS lẫn Kotlin) dùng `Map<printerId, session>` để giữ nhiều kết nối máy in đồng thời. Quy tắc bất biến đã fix từ một resource-leak thật (xem `docs/superpowers/specs/2026-07-29-pos-printer-multi-printer-support-design.md`):

- `connect(printerId, ...)` luôn disconnect session cũ của cùng `printerId` **trước** khi tạo session mới (kể cả retry), lỗi disconnect cũ bị swallow (best-effort).
- `connect()` thất bại thì **không** lưu session — `getStatus(printerId)` trả `'disconnected'`, không phải `'error'`. Trạng thái `'connecting'`/`'error'` chỉ tồn tại ở tầng Pinia store (`printer.store.ts`), không phải trong `PrinterManager`.
- `DriverRegistry`/`ConnectionRegistry` không đổi khi thêm multi-printer — vì factory pattern của chúng đã tạo instance mới mỗi lần `resolve()`, nên nhiều session dùng nhiều instance độc lập một cách tự nhiên.

### Pinia store là nơi giữ trạng thái UI-facing

`src/modules/printer/stores/printer.store.ts`: `printers: PrinterConfig[]` + `statuses`/`errorMessages: Record<string, ...>` theo id. `PrinterConfig.id` là UUID sinh một lần lúc tạo (`crypto.randomUUID()`), bất biến kể cả khi đổi tên. `removePrinter()`/`connect()` có guard chống race (xoá máy in trong lúc đang connect dở) — xem lại kỹ nếu sửa 2 action này.

### Lưu trữ

- Web: `localStorage` key `ndtcore_pos_printers`, giá trị là **mảng** `PrinterConfig[]` (JSON).
- Android: `SharedPreferences` file `ndtcore_pos_printer_config`, key `printers`, cùng shape mảng.

### USB permission (Android)

`PrinterPlugin.kt` giữ **một slot pending** cho USB permission request (Android chỉ hiện một dialog xin quyền tại một thời điểm) — giới hạn đã biết: hai máy in cùng lúc xin quyền lần đầu có thể bị nhầm slot. Permission pre-check trong `connect()` và matching thật trong `finishConnect()`/`UsbConnection.kt` đều ưu tiên match theo `serialNumber` trước, fallback về `vendorId`+`productId` — cần giữ đồng bộ nếu sửa một trong hai chỗ.

### Quy ước

- Mọi thông báo lỗi hiển thị cho user: **tiếng Việt**.
- Không có giới hạn nhân tạo số lượng máy in đồng thời.
- **Yêu cầu tối thiểu Android System WebView: Chromium 111+** — Vuetify 3 dùng `color-mix()`/`@layer` với giá trị phụ thuộc CSS variable runtime, không thể hạ cấp bằng build tool (đã verify: Lightning CSS không downlevel được khi tham số là `var(...)`). WebView cũ hơn sẽ mất toàn bộ CSS của Vuetify (trang chỉ còn chữ thô).
- Test dùng `mountWithVuetify()` (`src/test/mount-with-vuetify.ts`) thay vì `mount()` trực tiếp; test store/view dùng `createTestingPinia({ createSpy: vi.fn, stubActions: true })`.

## Docs

- [`docs/project.md`](docs/project.md) — spec tổng thể, roadmap Phase 1/2.
- `docs/superpowers/specs/` — design spec từng amendment (vd: multi-printer support).
- `docs/superpowers/plans/` — implementation plan dạng task-by-task, có thể có nhiều bản amend cho cùng một plan gốc (đọc phần "Relationship to the original plan" ở đầu file amend để biết task nào bị supersede).
