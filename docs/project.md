# NDTCore.POS – Project Overview

## 1. Project Summary

**NDTCore.POS** là hệ thống Point of Sale (POS) đa nền tảng được xây dựng trên một codebase duy nhất, hỗ trợ chạy trên:

* Web Browser
* Android Application (Capacitor)

Mục tiêu của dự án là xây dựng một nền tảng POS có khả năng tích hợp với nhiều loại máy in hóa đơn và nhiều phương thức kết nối khác nhau mà không phụ thuộc vào một nhà sản xuất cụ thể.

Kiến trúc được thiết kế theo hướng mở rộng (Extensible Architecture), cho phép bổ sung thêm driver hoặc loại kết nối mới mà không ảnh hưởng đến giao diện hoặc nghiệp vụ của ứng dụng.

---

# Project Goals

* Một codebase cho Web và Android.
* Hỗ trợ nhiều loại máy in.
* Không phụ thuộc vào một vendor.
* Có thể mở rộng thêm driver mới.
* Kiến trúc rõ ràng, dễ bảo trì.
* Tách biệt UI, Business Logic và Native Integration.

---

# Technology Stack

## Frontend

* Vue 3
* TypeScript
* Vite
* Vuetify 3
* Pinia
* Vue Router

## Mobile

* Capacitor
* Android Native Plugin (Kotlin)

**Yêu cầu tối thiểu Android System WebView: Chromium 111+.** Vuetify 3 dùng
`color-mix()` (yêu cầu Chromium 111+) và CSS Cascade Layers `@layer` (yêu cầu
Chromium 99+) xuyên suốt CSS theming của nó, với các tham số phụ thuộc CSS
custom property runtime — không thể hạ cấp (downlevel) bằng build tool
(Lightning CSS/PostCSS) vì giá trị chỉ tính được lúc chạy trong trình duyệt.
Trên WebView cũ hơn ngưỡng này, toàn bộ style của Vuetify bị trình duyệt âm
thầm bỏ qua (trang chỉ còn chữ thô, không CSS). Thiết bị POS thực tế cần đảm
bảo Android System WebView tự cập nhật qua Play Store, hoặc chạy Android 10+
với WebView được cập nhật thủ công.

## Printer Integration

* USB
* LAN
* Bluetooth (future)
* Generic ESC/POS
* Vendor SDK (XPrinter, Epson, Star, Sunmi...)

---

# High Level Architecture

```text
                Vue + Vuetify

                       │

               PrinterService

                       │

            Capacitor Printer Plugin

                       │

               Printer Manager

                       │

              Printer Factory

                       │

       ┌───────────────┴────────────────┐
       │               │                │
 Generic ESC/POS   Vendor SDK      Future Drivers

       │               │                │

USB / LAN / Bluetooth Connection Layer

                       │

                   Printer
```

---

# Phase 1 – Printer Integration

## Objective

Hoàn thiện hạ tầng tích hợp máy in để kiểm chứng khả năng chạy trên cả Web và Android.

Phase này chỉ tập trung vào việc phát hiện, cấu hình, kết nối và kiểm thử máy in.

Không bao gồm chức năng bán hàng.

---

## Features

### Printer Settings

Trang cấu hình máy in.

Cho phép cấu hình:

* Connection Type

  * USB
  * LAN
  * Bluetooth (placeholder)

* Driver

  * Generic ESC/POS
  * XPrinter SDK
  * Epson SDK
  * Star SDK
  * Sunmi SDK

* Vendor

* Model

* Device

* Auto Connect

* Save Configuration

---

### Printer Discovery

Cho phép tìm kiếm thiết bị.

Ví dụ:

USB

* XPrinter XP-Q80I
* Epson TM-T82III
* Unknown USB Printer

LAN

* Epson Printer
* Network Thermal Printer

Bluetooth (future)

* Star Printer
* Sunmi Printer

---

### Driver Detection

Hệ thống đọc thông tin thiết bị:

* Vendor ID
* Product ID
* Product Name

Sau đó gợi ý Driver phù hợp.

Nếu không xác định được Driver:

=> sử dụng Generic ESC/POS Driver.

---

### Connect Printer

Cho phép:

* Connect
* Disconnect
* Reconnect

Hiển thị trạng thái:

* Connected
* Connecting
* Disconnected
* Error

---

### Test Print

Có nút:

**Print Test Bill**

In một bill mẫu.

Ví dụ

```text
NDT Bubble Tea

Order #1001

Classic Milk Tea

Pearl

Sugar 100%

Ice Normal

-------------------------

TOTAL

$8.50

Thank You
```

---

### Configuration

Lưu cấu hình:

* Driver
* Connection Type
* Selected Device
* Auto Connect

Android lưu bằng SharedPreferences hoặc DataStore.

Web lưu bằng LocalStorage.

---

### Printer Plugin

Xây dựng Capacitor Plugin.

Expose API:

* scanPrinters()
* connect()
* disconnect()
* print()
* testPrint()
* getStatus()
* saveConfig()
* loadConfig()

Plugin chỉ là bridge giữa Vue và Android.

---

### Architecture

```text
Vue

↓

PrinterService

↓

PrinterPlugin

↓

PrinterManager

↓

PrinterFactory

↓

Printer Driver

↓

Connection Layer

↓

Printer
```

---

### Deliverables

* Chạy được Web.
* Chạy được Android.
* Scan Printer.
* Connect Printer.
* Save Configuration.
* Auto Connect.
* Test Print.
* Generic ESC/POS Driver.
* Kiến trúc hỗ trợ nhiều Driver.

---

# Phase 2 – POS System

## Objective

Xây dựng đầy đủ hệ thống bán hàng dựa trên hạ tầng máy in đã hoàn thiện ở Phase 1.

---

## Sales Screen

* Product Grid
* Category
* Search Product
* Favorite Product
* Product Detail

---

## Cart

* Add Item
* Remove Item
* Quantity
* Discount
* Tax
* Note
* Modifier / Topping

---

## Payment

* Cash
* Card
* QR Payment
* Split Payment (future)

---

## Receipt

Sau khi thanh toán thành công:

```text
Create Order

↓

Save Transaction

↓

Generate Receipt

↓

PrinterService.print()

↓

Printer Plugin

↓

Printer
```

---

## Order Management

* Open Order
* Hold Order
* Resume Order
* Cancel Order

---

## Shift

* Open Shift
* Close Shift
* Cash Count

---

## Customer

* Walk-in Customer
* Member
* Loyalty (future)

---

## Promotion

* Discount
* Coupon
* Combo
* Campaign

---

## Synchronization

* Online Mode
* Offline Mode (future)
* Auto Sync

---

## Reports

* Daily Sales
* Revenue
* Payment Summary
* Product Sales

---

## Settings

* Printer
* Store
* Terminal
* Language
* Currency

---

## Final Goal

Sau khi hoàn thành cả hai phase, **NDTCore.POS** sẽ là một hệ thống POS đa nền tảng với:

* Một codebase cho Web và Android.
* Hệ thống driver máy in có khả năng mở rộng.
* Hỗ trợ nhiều phương thức kết nối (USB, LAN, Bluetooth).
* Có thể tích hợp nhiều hãng máy in thông qua driver hoặc SDK mà không làm thay đổi luồng nghiệp vụ của POS.
* Kiến trúc phân tầng rõ ràng, thuận lợi cho việc mở rộng thêm thiết bị ngoại vi khác như máy quét mã vạch, ngăn kéo tiền, màn hình khách hàng hoặc đầu đọc thẻ trong tương lai.
