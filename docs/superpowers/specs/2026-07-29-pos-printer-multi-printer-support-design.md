# NDTCore.POS — Phase 1: Multi-Printer Concurrent Connections — Design Spec (Amendment)

Ngày: 2026-07-29
Amends: [`docs/superpowers/specs/2026-07-28-pos-printer-integration-phase1-design.md`](2026-07-28-pos-printer-integration-phase1-design.md)
Nguồn gốc: phát hiện trong task review của Task 19 (implementation plan `docs/superpowers/plans/2026-07-28-pos-printer-integration-phase1.md`) — `PrinterManager` (cả TS lẫn Kotlin) chỉ giữ 1 driver/1 connection/1 status tại một thời điểm; nếu `connect()` gọi lại khi đang `CONNECTED` mà lần mới thất bại, kết nối cũ bị rò rỉ (không được disconnect trước khi bị ghi đè). Root cause: toàn bộ kiến trúc gốc giả định **1 máy in duy nhất**.

## 1. Quyết định

Thay vì chỉ vá lỗi rò rỉ, đổi hẳn sang **hỗ trợ nhiều máy in kết nối đồng thời ngay từ Phase 1** — theo yêu cầu thực tế: 1 thiết bị POS cần in bill (quầy) và in phiếu bếp (kitchen) cùng lúc, có thể còn thêm vai trò khác sau này. Không giới hạn số lượng máy in hay ràng buộc role cố định — mỗi máy in là 1 entry độc lập do user tự đặt tên.

## 2. Định danh máy in

- `id: string` — UUID tự sinh khi tạo mới, không đổi trong suốt vòng đời entry (kể cả khi đổi tên). Tránh lỗi trùng tên/tên rỗng làm hỏng tham chiếu đã lưu (auto-connect, v.v.).
- `name: string` — tên hiển thị do user đặt (vd: "Máy in Bill", "Máy in Bếp"), có thể đổi tự do, không unique-constrained.

## 3. Thay đổi Plugin Contract (`src/native/printer-plugin/definitions.ts`)

```ts
export interface PrinterConfig {
  id: string
  name: string
  driver: PrinterDriverType
  connectionType: PrinterConnectionType
  device: PrinterDevice | null
  autoConnect: boolean
}

export interface PrinterPlugin {
  scanPrinters(options: { connectionType: PrinterConnectionType }): Promise<{ devices: PrinterDevice[] }>
  connect(options: { printerId: string; config: PrinterConfig }): Promise<{ config: PrinterConfig }>
  disconnect(options: { printerId: string }): Promise<void>
  print(options: { printerId: string; data: number[] }): Promise<void>
  testPrint(options: { printerId: string }): Promise<void>
  getStatus(options: { printerId: string }): Promise<{ status: PrinterStatus }>
  savePrinters(options: { configs: PrinterConfig[] }): Promise<void>
  loadPrinters(): Promise<{ configs: PrinterConfig[] }>
}
```

`scanPrinters` không đổi — quét thiết bị không gắn với 1 printer cụ thể. `savePrinters`/`loadPrinters` thay thế `saveConfig`/`loadConfig`, lưu **toàn bộ danh sách** (không phải append/patch từng phần — caller tự đọc-sửa-ghi lại cả mảng, đơn giản hơn API phân trang/patch).

## 4. `PrinterManager` — map thay vì field đơn

Áp dụng giống hệt cho cả TS (`src/native/printer-plugin/manager/printer-manager.ts`) và Kotlin (`android/.../printer/manager/PrinterManager.kt`):

```ts
interface PrinterSession {
  driver: PrinterDriver
  connection: PrinterConnection
  status: PrinterStatus
}

class PrinterManager {
  private sessions = new Map<string, PrinterSession>()

  async connect(printerId: string, config: PrinterConfig): Promise<PrinterConfig> {
    // Nếu printerId đã có session cũ (kể cả đang lỗi) → disconnect sạch trước khi thử kết nối mới.
    // Đây chính là chỗ vá lỗi rò rỉ phát hiện ở Task 19: switch (kể cả retry cùng id) luôn dọn session cũ trước.
    const existing = this.sessions.get(printerId)
    if (existing) {
      await existing.connection.disconnect().catch(() => {})
      this.sessions.delete(printerId)
    }
    // ...resolve driver/connection, connect, sessions.set(printerId, {...}), ném lỗi nếu thất bại (không set session)
  }

  async disconnect(printerId: string): Promise<void> { /* sessions.get(printerId)?.connection.disconnect(); sessions.delete(printerId) */ }
  async print(printerId: string, data: Uint8Array): Promise<void> { /* lookup session, ném lỗi nếu không có/không connected */ }
  async testPrint(printerId: string): Promise<void> { /* print(printerId, session.driver.buildTestPrintBytes()) */ }
  getStatus(printerId: string): PrinterStatus { return this.sessions.get(printerId)?.status ?? 'disconnected' }
}
```

`DriverRegistry`/`ConnectionRegistry` (TS Task 5, Kotlin Task 16) **không đổi** — mỗi `resolve()` đã tạo instance mới (factory pattern), không phải singleton, nên nhiều session dùng nhiều instance độc lập một cách tự nhiên.

## 5. Pinia Store (`src/modules/printer/stores/printer.store.ts`)

```ts
state: () => ({
  printers: [] as PrinterConfig[],
  statuses: {} as Record<string, PrinterStatus>,
  errorMessages: {} as Record<string, string | null>,
  knownDevices: [] as PrinterDevice[],
}),
actions: {
  async loadPrinters(): Promise<void> { /* Printer.loadPrinters() → this.printers */ }
  async addPrinter(input: Omit<PrinterConfig, 'id'>): Promise<void> { /* id = crypto.randomUUID(), push, savePrinters() */ }
  async removePrinter(id: string): Promise<void> { /* disconnect(id) nếu đang connected, splice, savePrinters() */ }
  async renamePrinter(id: string, name: string): Promise<void> { /* patch tên, savePrinters() */ }
  async scan(connectionType): Promise<PrinterDevice[]> { /* không đổi */ }
  async connect(id: string): Promise<void> { /* statuses[id] = 'connecting', Printer.connect({printerId:id, config}), statuses[id]=..., savePrinters() */ }
  async disconnect(id: string): Promise<void> { /* Printer.disconnect({printerId:id}), statuses[id]='disconnected' */ }
  async testPrint(id: string): Promise<void> { /* Printer.testPrint({printerId:id}) */ }
  async autoConnectAll(): Promise<void> {
    // Gọi lúc app khởi động (thay cho auto-connect đơn ở main.ts hiện tại).
    // Promise.allSettled — 1 máy in lỗi không chặn máy còn lại.
  }
}
```

## 6. UI — `PrinterSettingsView.vue`

Viết lại từ form-1-máy-in thành list:
- Mỗi `printer` trong `store.printers` → 1 card: tên, chip trạng thái (`statuses[printer.id]`), nút Connect/Disconnect, nút Print Test Bill (chỉ enable khi connected), nút xoá, nút đổi tên.
- Nút "Thêm máy in" mở form (tên, connection type, driver, chọn thiết bị qua `PrinterDeviceList`/scan) → `store.addPrinter(...)`.
- `ConnectionStatusChip.vue` (Task 11) và `PrinterDeviceList.vue` (Task 12) tái sử dụng nguyên trạng, chỉ đổi chỗ gọi (render theo từng printer thay vì 1 lần).

## 7. Auto-connect khi khởi động (`src/main.ts`)

Thay logic hiện tại (load 1 config, connect 1 lần nếu `autoConnect`) bằng: `printerStore.loadPrinters()` → `printerStore.autoConnectAll()` (không block mount nếu có lỗi, giống quyết định gốc ở Task 14).

## 8. Android (`android/.../printer/`)

Task 19 (`PrinterManager.kt`) áp dụng mục 4 y hệt bản TS. Task 20 (UsbConnection Kotlin), 21 (PrinterPlugin.kt wiring), 22-23 (XPrinterDriver/EpsonDriver) **chưa được implement** — thiết kế `printerId`-aware ngay từ đầu, không phát sinh rework. Task 21 tự chọn cơ chế lưu trữ Android (SharedPreferences/DataStore, theo `docs/project.md`) cho **mảng** `PrinterConfig`, cùng shape với `savePrinters`/`loadPrinters`.

## 9. Ngoài phạm vi

- Giới hạn số lượng máy in tối đa — không giới hạn nhân tạo, chỉ bị chặn bởi phần cứng (số cổng USB, v.v.).
- Đồng bộ trạng thái nhiều tab/nhiều thiết bị POS — ngoài phạm vi Phase 1 (giữ nguyên giả định gốc: state cục bộ theo từng thiết bị chạy app).
- In đồng thời cùng 1 lúc trên nhiều máy in cho cùng 1 nội dung (broadcast print) — Phase 2 nếu cần, hiện tại mỗi `testPrint(id)`/`print(id, data)` nhắm đúng 1 máy in.
