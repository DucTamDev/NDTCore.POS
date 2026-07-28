# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Status

**NDTCore.POS chưa có code** — repo hiện chỉ có spec design tại [`docs/project.md`](docs/project.md). Chưa có build system, package.json, hay source code nào được khởi tạo. Khi bắt đầu implement, cập nhật file này với các lệnh build/lint/test thực tế.

## Project Summary

NDTCore.POS là hệ thống Point of Sale (POS) đa nền tảng, một codebase duy nhất chạy trên:

- Web Browser
- Android (qua Capacitor)

Mục tiêu cốt lõi: tích hợp với nhiều loại máy in hóa đơn (nhiều vendor, nhiều phương thức kết nối) mà không phụ thuộc vào một nhà sản xuất cụ thể, theo kiến trúc mở rộng được (thêm driver/connection mới không ảnh hưởng UI hay business logic).

## Technology Stack (dự kiến)

- **Frontend**: Vue 3, TypeScript, Vite, Vuetify 3, Pinia, Vue Router
- **Mobile**: Capacitor, Android Native Plugin (Kotlin)
- **Printer Integration**: USB, LAN, Bluetooth (future); Generic ESC/POS; Vendor SDK (XPrinter, Epson, Star, Sunmi...)

## Architecture

Luồng phân tầng cho tích hợp máy in (chi tiết: [`docs/project.md`](docs/project.md)):

```
Vue + Vuetify
    → PrinterService
        → Capacitor Printer Plugin (bridge Vue ↔ Android, chỉ expose API,
          không chứa business logic)
            → Printer Manager
                → Printer Factory
                    → Driver (Generic ESC/POS | Vendor SDK | Future Drivers)
                        → Connection Layer (USB / LAN / Bluetooth)
                            → Printer
```

Nếu không xác định được driver phù hợp với thiết bị (dựa trên Vendor ID / Product ID / Product Name), hệ thống fallback về Generic ESC/POS Driver.

Cấu hình máy in (driver, connection type, selected device, auto connect) lưu:
- Android: SharedPreferences hoặc DataStore
- Web: LocalStorage

## Roadmap

- **Phase 1 — Printer Integration**: hạ tầng phát hiện/cấu hình/kết nối/test in trên cả Web và Android. Không bao gồm nghiệp vụ bán hàng.
- **Phase 2 — POS System**: sales screen, cart, payment, receipt, order management, shift, customer, promotion, sync, reports — xây trên hạ tầng máy in đã hoàn thiện ở Phase 1.

Chi tiết đầy đủ từng phase: [`docs/project.md`](docs/project.md).
