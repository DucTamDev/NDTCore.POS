# NDTCore.POS Phase 1 — Printer Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold NDTCore.POS (Vue 3 + Capacitor) from an empty repo and build the full Phase 1 printer stack — scan/connect/disconnect/test-print over USB (Web + Android) and LAN (Android only) — using a Generic ESC/POS driver.

**Architecture:** One Vue 3 + Vite app; Capacitor adds an Android shell. A single Capacitor plugin (`Printer`) exposes one TS interface with a web implementation (WebUSB) and a native Android implementation (Kotlin, `UsbManager` / `java.net.Socket`). Above the plugin: `Connection` (Usb/Lan) → `PrinterFactory`/`PrinterManager` → `GenericEscPosDriver` (canvas → ESC/POS raster bytes) → Pinia `usePrinterStore` → `PrinterSettingsPage.vue`.

**Tech Stack:** Vue 3, TypeScript, Vite, Vuetify 3, Pinia, Vue Router, Capacitor (core/cli/android/preferences), `@point-of-sale/receipt-printer-encoder`, Kotlin (Android plugin).

## Global Constraints

(Copied verbatim from `docs/superpowers/specs/2026-07-28-phase1-printer-integration-design.md`.)

- Khổ giấy 80mm, 203dpi, **576 dot ngang** — hằng số duy nhất cần chỉnh nếu sau này đo được số khác.
- Port LAN mặc định **9100** (cổng raw ESC/POS chuẩn).
- Phase 1 chỉ implement **Generic ESC/POS Driver** — không Vendor SDK driver.
- LAN chỉ hoạt động trên Android; trên web `connectLan()` phải ném lỗi rõ ràng "LAN không hỗ trợ trên trình duyệt".
- LAN không tự động dò subnet — user nhập IP + port thủ công.
- Bluetooth chỉ là placeholder UI, luôn disabled — ngoài scope Phase 1.
- Persistence dùng `@capacitor/preferences` (không tự viết nhánh storage theo platform).
- **Không** dùng package `@point-of-sale/webusb-receipt-printer` (hardcode 1 cặp vendorId/productId, không có cách thêm ID khác).
- Repo không có hạ tầng test tự động → verify bằng `npm run type-check` + lint; test tay bắt buộc trên thiết bị thật cho mọi luồng chạm hardware/browser API (WebUSB, USB Android, Socket LAN). Các bước "Verify" dưới đây thay thế bước "write failing test" của template chuẩn vì lý do này — đã được chốt và duyệt trong spec.
- Không có cơ chế fallback tự động giữa USB ↔ LAN hay giữa các driver.

---

## File Structure Overview

```text
package.json, vite.config.ts, tsconfig*.json, index.html   # scaffold (Task 1)
capacitor.config.ts, android/                               # Capacitor (Task 2)
src/
├── core/
│   └── storage/
│       └── preferences.storage.ts        # Task 3
├── router/index.ts                        # scaffold, modified Task 12
└── modules/
    └── printer/
        ├── plugin/
        │   ├── printer-plugin.types.ts    # Task 4
        │   ├── printer.plugin.ts          # Task 4
        │   └── printer-web.impl.ts        # Task 4
        ├── types/
        │   ├── printer-config.types.ts    # Task 7
        │   └── receipt-printer-encoder.d.ts  # Task 9
        ├── config/
        │   └── printer-config.storage.ts  # Task 7
        ├── connections/
        │   ├── connection.types.ts        # Task 8
        │   ├── usb-connection.ts          # Task 8
        │   └── lan-connection.ts          # Task 8
        ├── utils/
        │   └── build-test-bill-canvas.util.ts  # Task 9
        ├── drivers/
        │   └── generic-escpos.driver.ts   # Task 9
        ├── managers/
        │   ├── printer-factory.ts         # Task 10
        │   └── printer-manager.ts         # Task 10
        ├── stores/
        │   └── printer.store.ts           # Task 11
        └── pages/
            └── PrinterSettingsPage.vue     # Task 12
android/app/src/main/java/com/ndtcore/pos/
├── MainActivity.java                       # modified Task 5
└── printer/
    ├── PrinterPlugin.kt                    # Task 5, extended Task 6
    ├── UsbTransport.kt                     # Task 5
    └── LanTransport.kt                     # Task 6
```

---

### Task 1: Scaffold the Vue 3 app shell

**Files:**
- Create: entire scaffold via `npm create vue@latest` (package.json, vite.config.ts, tsconfig*.json, index.html, src/main.ts, src/App.vue, src/router/index.ts, src/stores/, eslint.config.js, .gitignore)
- Modify: `src/main.ts` (register Vuetify)
- Create: `src/plugins/vuetify.ts`

**Interfaces:**
- Produces: a running Vite dev server at `npm run dev`; `npm run type-check` and `npm run build` scripts in `package.json`.

- [ ] **Step 1: Run the scaffolder into the current (non-empty) repo**

```bash
cd "c:/NDTCORE/NDTCore/NDTCore.POS"
npm create vue@latest . -- --typescript --router --pinia --eslint --force
```

If the CLI still prompts interactively for any option not covered by the flags, answer: TypeScript **Yes**, JSX **No**, Router **Yes**, Pinia **Yes**, Vitest **No**, End-to-End Testing **No**, ESLint **Yes**, Prettier **No** (repo has no test infra per Global Constraints — do not add Vitest/Cypress/Playwright).

- [ ] **Step 2: Install dependencies and Vuetify**

```bash
npm install
npm install vuetify
npm install -D vite-plugin-vuetify sass-embedded
```

- [ ] **Step 3: Wire Vuetify into the app**

`src/plugins/vuetify.ts`:

```ts
import 'vuetify/styles'
import { createVuetify } from 'vuetify'

export const vuetify = createVuetify()
```

Add the Vuetify Vite plugin to `vite.config.ts` (merge into the existing scaffolded file, keep the existing `vue()` plugin and `resolve.alias` for `@`):

```ts
import vuetify from 'vite-plugin-vuetify'

// inside plugins: [...]
vuetify({ autoImport: true }),
```

Modify `src/main.ts` to register the plugin (keep existing router/pinia registration):

```ts
import { vuetify } from './plugins/vuetify'

app.use(vuetify)
```

- [ ] **Step 4: Verify**

```bash
npm run type-check
npm run dev
```

Open the dev server URL in a browser — the default scaffolded page should render. Confirm no console errors about missing Vuetify styles.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: scaffold Vue 3 + Vite + TS + Router + Pinia + Vuetify app shell"
```

---

### Task 2: Add Capacitor and the Android platform

**Files:**
- Create: `capacitor.config.ts`
- Create: `android/` (generated by `cap add android`)
- Modify: `package.json` (new dependencies)

**Interfaces:**
- Produces: `android/` gradle project that `npx cap sync android` can update; app id `com.ndtcore.pos`.

- [ ] **Step 1: Install Capacitor**

```bash
npm install @capacitor/core
npm install -D @capacitor/cli
npx cap init "NDTCore POS" "com.ndtcore.pos" --web-dir dist
```

- [ ] **Step 2: Add the Android platform**

```bash
npm install @capacitor/android
npm run build
npx cap add android
```

`cap add android` generates its own `android/.gitignore` covering `build/`, `.gradle/`, `local.properties`, `*.iml` — confirm it exists (`android/.gitignore`) so build artifacts aren't committed.

- [ ] **Step 3: Verify**

```bash
npx cap sync android
```

Expected: completes without error and prints "Sync finished". This does not require the Android SDK — it only copies `dist/` into `android/app/src/main/assets/public` and updates plugin config. (Full Gradle build/emulator testing needs Android Studio + SDK, done manually in Task 13.)

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add Capacitor core + Android platform"
```

---

### Task 3: Core storage wrapper for @capacitor/preferences

**Files:**
- Create: `src/core/storage/preferences.storage.ts`

**Interfaces:**
- Produces: `getJson<T>(key: string): Promise<T | null>`, `setJson<T>(key: string, value: T): Promise<void>`, `remove(key: string): Promise<void>` — used by Task 7.

- [ ] **Step 1: Install the plugin**

```bash
npm install @capacitor/preferences
```

- [ ] **Step 2: Implement the wrapper**

`src/core/storage/preferences.storage.ts`:

```ts
import { Preferences } from '@capacitor/preferences'

export async function getJson<T>(key: string): Promise<T | null> {
  const { value } = await Preferences.get({ key })
  if (!value) return null
  return JSON.parse(value) as T
}

export async function setJson<T>(key: string, value: T): Promise<void> {
  await Preferences.set({ key, value: JSON.stringify(value) })
}

export async function remove(key: string): Promise<void> {
  await Preferences.remove({ key })
}
```

- [ ] **Step 3: Verify**

```bash
npm run type-check
```

Manual smoke check: in `src/App.vue`'s `<script setup>`, temporarily add `import { setJson, getJson } from './core/storage/preferences.storage'` and call `setJson('test', { a: 1 }).then(() => getJson('test')).then(console.log)` inside `onMounted`. Run `npm run dev`, open the browser console, confirm `{ a: 1 }` is logged. Remove the temporary code afterwards — do not commit it.

- [ ] **Step 4: Commit**

```bash
git add src/core/storage/preferences.storage.ts package.json package-lock.json
git commit -m "feat: add typed @capacitor/preferences storage wrapper"
```

---

### Task 4: Printer plugin contract + Web implementation (WebUSB)

**Files:**
- Create: `src/modules/printer/plugin/printer-plugin.types.ts`
- Create: `src/modules/printer/plugin/printer.plugin.ts`
- Create: `src/modules/printer/plugin/printer-web.impl.ts`

**Interfaces:**
- Produces: `Printer` (the registered plugin proxy) — `Printer.scanUsb()`, `Printer.connectUsb({vendorId, productId})`, `Printer.connectLan({ip, port})`, `Printer.write({connectionId, data})`, `Printer.disconnect({connectionId})`, `Printer.getStatus({connectionId})`. Consumed by Task 8 (`UsbConnection`/`LanConnection`) and Task 11 (`usePrinterStore.scanUsb`).

- [ ] **Step 1: Install WebUSB types**

```bash
npm install -D @types/w3c-web-usb
```

- [ ] **Step 2: Define the plugin contract**

`src/modules/printer/plugin/printer-plugin.types.ts`:

```ts
export interface UsbDeviceInfo {
  vendorId: number
  productId: number
  productName?: string
  serialNumber?: string
}

export type PrinterConnectionStatus = 'connected' | 'disconnected' | 'error'

export interface PrinterPlugin {
  scanUsb(): Promise<{ devices: UsbDeviceInfo[] }>
  connectUsb(opts: { vendorId: number; productId: number }): Promise<{ connectionId: string }>
  connectLan(opts: { ip: string; port: number }): Promise<{ connectionId: string }>
  write(opts: { connectionId: string; data: number[] }): Promise<void>
  disconnect(opts: { connectionId: string }): Promise<void>
  getStatus(opts: { connectionId: string }): Promise<{ status: PrinterConnectionStatus }>
}
```

- [ ] **Step 3: Register the plugin**

`src/modules/printer/plugin/printer.plugin.ts`:

```ts
import { registerPlugin } from '@capacitor/core'
import type { PrinterPlugin } from './printer-plugin.types'

export const Printer = registerPlugin<PrinterPlugin>('Printer', {
  web: () => import('./printer-web.impl').then((m) => new m.PrinterWeb()),
})
```

- [ ] **Step 4: Implement the Web (WebUSB) side**

`src/modules/printer/plugin/printer-web.impl.ts`:

```ts
import { WebPlugin } from '@capacitor/core'
import type { PrinterPlugin, UsbDeviceInfo, PrinterConnectionStatus } from './printer-plugin.types'

interface OpenUsbConnection {
  device: USBDevice
  endpointNumber: number
}

export class PrinterWeb extends WebPlugin implements PrinterPlugin {
  private connections = new Map<string, OpenUsbConnection>()
  private nextId = 1

  async scanUsb(): Promise<{ devices: UsbDeviceInfo[] }> {
    this.assertUsbAvailable()
    const known = await navigator.usb.getDevices()
    if (known.length > 0) {
      return { devices: known.map(this.toDeviceInfo) }
    }
    const device = await navigator.usb.requestDevice({ filters: [] })
    return { devices: [this.toDeviceInfo(device)] }
  }

  async connectUsb(opts: { vendorId: number; productId: number }): Promise<{ connectionId: string }> {
    this.assertUsbAvailable()
    const known = await navigator.usb.getDevices()
    let device = known.find((d) => d.vendorId === opts.vendorId && d.productId === opts.productId)
    if (!device) {
      device = await navigator.usb.requestDevice({
        filters: [{ vendorId: opts.vendorId, productId: opts.productId }],
      })
    }
    await device.open()
    if (device.configuration === null) {
      await device.selectConfiguration(1)
    }
    const iface = device.configuration?.interfaces.find((i) =>
      i.alternates[0].endpoints.some((e) => e.direction === 'out' && e.type === 'bulk'),
    )
    if (!iface) {
      throw new Error('Không tìm thấy endpoint OUT (bulk) trên thiết bị USB')
    }
    await device.claimInterface(iface.interfaceNumber)
    const endpoint = iface.alternates[0].endpoints.find((e) => e.direction === 'out' && e.type === 'bulk')
    if (!endpoint) {
      throw new Error('Không tìm thấy endpoint OUT (bulk) trên thiết bị USB')
    }
    const connectionId = `usb-${this.nextId++}`
    this.connections.set(connectionId, { device, endpointNumber: endpoint.endpointNumber })
    return { connectionId }
  }

  async connectLan(): Promise<{ connectionId: string }> {
    throw new Error('LAN không hỗ trợ trên trình duyệt')
  }

  async write(opts: { connectionId: string; data: number[] }): Promise<void> {
    const conn = this.connections.get(opts.connectionId)
    if (!conn) {
      throw new Error(`Không tìm thấy kết nối ${opts.connectionId}`)
    }
    await conn.device.transferOut(conn.endpointNumber, new Uint8Array(opts.data))
  }

  async disconnect(opts: { connectionId: string }): Promise<void> {
    const conn = this.connections.get(opts.connectionId)
    if (!conn) return
    await conn.device.close()
    this.connections.delete(opts.connectionId)
  }

  async getStatus(opts: { connectionId: string }): Promise<{ status: PrinterConnectionStatus }> {
    const conn = this.connections.get(opts.connectionId)
    if (!conn) return { status: 'disconnected' }
    return { status: conn.device.opened ? 'connected' : 'disconnected' }
  }

  private assertUsbAvailable(): void {
    if (!('usb' in navigator)) {
      throw new Error('WebUSB không được trình duyệt hỗ trợ')
    }
  }

  private toDeviceInfo(device: USBDevice): UsbDeviceInfo {
    return {
      vendorId: device.vendorId,
      productId: device.productId,
      productName: device.productName,
      serialNumber: device.serialNumber,
    }
  }
}
```

- [ ] **Step 5: Verify**

```bash
npm run type-check
```

Full functional verification (clicking through `scanUsb`/`connectUsb` against a real printer) requires a user-gesture click and happens end-to-end in Task 12 — WebUSB's `requestDevice()` throws `SecurityError` if called outside a click handler, so it cannot be smoke-tested from the devtools console alone.

- [ ] **Step 6: Commit**

```bash
git add src/modules/printer/plugin package.json package-lock.json
git commit -m "feat: add Printer Capacitor plugin contract and WebUSB implementation"
```

---

### Task 5: Android native plugin — USB transport (Kotlin)

**Files:**
- Create: `android/app/src/main/java/com/ndtcore/pos/printer/PrinterPlugin.kt`
- Create: `android/app/src/main/java/com/ndtcore/pos/printer/UsbTransport.kt`
- Modify: `android/app/src/main/java/com/ndtcore/pos/MainActivity.java` (register the plugin)
- Modify: `android/app/build.gradle` (ensure Kotlin Android plugin is applied)

**Interfaces:**
- Produces: native handling of `scanUsb`/`connectUsb`/`write`/`disconnect`/`getStatus` method calls dispatched from the shared `PrinterPlugin` TS interface (Task 4) when running on Android. `connectLan`/`write` for LAN are added in Task 6.

- [ ] **Step 1: Confirm Kotlin support is enabled for the app module**

Open `android/app/build.gradle`. If it does not already have `apply plugin: 'kotlin-android'` (or the `plugins { id 'org.jetbrains.kotlin.android' }` block), add it alongside the existing `com.android.application` plugin, and add `implementation "org.jetbrains.kotlin:kotlin-stdlib:$kotlin_version"` to `dependencies`. Recent Capacitor Android templates (6.x+) ship with Kotlin already wired for first-party plugins — check before duplicating.

- [ ] **Step 2: Implement the USB transport**

`android/app/src/main/java/com/ndtcore/pos/printer/UsbTransport.kt`:

```kotlin
package com.ndtcore.pos.printer

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbManager
import android.os.Build

private const val ACTION_USB_PERMISSION = "com.ndtcore.pos.printer.USB_PERMISSION"

class UsbConnectionSession(
    val connection: UsbDeviceConnection,
    val iface: android.hardware.usb.UsbInterface,
    val endpoint: UsbEndpoint,
)

class UsbTransport(private val context: Context) {
    private val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
    private val sessions = mutableMapOf<String, UsbConnectionSession>()

    fun listDevices(): List<Map<String, Any?>> {
        return usbManager.deviceList.values.map { device ->
            mapOf(
                "vendorId" to device.vendorId,
                "productId" to device.productId,
                "productName" to device.productName,
                "serialNumber" to null,
            )
        }
    }

    fun connect(vendorId: Int, productId: Int, connectionId: String, onResult: (Result<Unit>) -> Unit) {
        val device = usbManager.deviceList.values.find { it.vendorId == vendorId && it.productId == productId }
        if (device == null) {
            onResult(Result.failure(Exception("Không tìm thấy thiết bị USB $vendorId:$productId")))
            return
        }
        if (usbManager.hasPermission(device)) {
            openDevice(device, connectionId, onResult)
            return
        }
        val flags = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
        val permissionIntent = PendingIntent.getBroadcast(context, 0, Intent(ACTION_USB_PERMISSION), flags)
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context, intent: Intent) {
                context.unregisterReceiver(this)
                if (intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)) {
                    openDevice(device, connectionId, onResult)
                } else {
                    onResult(Result.failure(Exception("Người dùng từ chối quyền truy cập USB")))
                }
            }
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            context.registerReceiver(receiver, IntentFilter(ACTION_USB_PERMISSION), Context.RECEIVER_NOT_EXPORTED)
        } else {
            context.registerReceiver(receiver, IntentFilter(ACTION_USB_PERMISSION))
        }
        usbManager.requestPermission(device, permissionIntent)
    }

    private fun openDevice(device: UsbDevice, connectionId: String, onResult: (Result<Unit>) -> Unit) {
        val iface = (0 until device.interfaceCount)
            .map { device.getInterface(it) }
            .firstOrNull { iface -> (0 until iface.endpointCount).any { iface.getEndpoint(it).direction == UsbConstants.USB_DIR_OUT } }
        if (iface == null) {
            onResult(Result.failure(Exception("Không tìm thấy endpoint OUT trên thiết bị USB")))
            return
        }
        val endpoint = (0 until iface.endpointCount)
            .map { iface.getEndpoint(it) }
            .first { it.direction == UsbConstants.USB_DIR_OUT }
        val connection = usbManager.openDevice(device)
        if (connection == null) {
            onResult(Result.failure(Exception("Không mở được kết nối USB")))
            return
        }
        connection.claimInterface(iface, true)
        sessions[connectionId] = UsbConnectionSession(connection, iface, endpoint)
        onResult(Result.success(Unit))
    }

    fun write(connectionId: String, data: ByteArray): Boolean {
        val session = sessions[connectionId] ?: return false
        val result = session.connection.bulkTransfer(session.endpoint, data, data.size, 5000)
        return result >= 0
    }

    fun disconnect(connectionId: String) {
        val session = sessions.remove(connectionId) ?: return
        session.connection.releaseInterface(session.iface)
        session.connection.close()
    }

    fun isConnected(connectionId: String): Boolean = sessions.containsKey(connectionId)
}
```

- [ ] **Step 3: Implement the plugin shell (USB methods only — LAN methods stubbed to reject until Task 6)**

`android/app/src/main/java/com/ndtcore/pos/printer/PrinterPlugin.kt`:

```kotlin
package com.ndtcore.pos.printer

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject

@CapacitorPlugin(name = "Printer")
class PrinterPlugin : Plugin() {
    private val usbTransport by lazy { UsbTransport(context) }
    private var nextConnectionSeq = 1

    @PluginMethod
    fun scanUsb(call: PluginCall) {
        val devices = JSArray()
        usbTransport.listDevices().forEach { device -> devices.put(JSONObject(device)) }
        val result = JSObject()
        result.put("devices", devices)
        call.resolve(result)
    }

    @PluginMethod
    fun connectUsb(call: PluginCall) {
        val vendorId = call.getInt("vendorId")
        val productId = call.getInt("productId")
        if (vendorId == null || productId == null) {
            call.reject("vendorId và productId là bắt buộc")
            return
        }
        val connectionId = "usb-${nextConnectionSeq++}"
        usbTransport.connect(vendorId, productId, connectionId) { result ->
            result.fold(
                onSuccess = {
                    val response = JSObject()
                    response.put("connectionId", connectionId)
                    call.resolve(response)
                },
                onFailure = { call.reject(it.message, it) },
            )
        }
    }

    @PluginMethod
    fun connectLan(call: PluginCall) {
        call.reject("connectLan chưa được cài đặt")
    }

    @PluginMethod
    fun write(call: PluginCall) {
        val connectionId = call.getString("connectionId") ?: return call.reject("connectionId là bắt buộc")
        val dataArray = call.getArray("data") ?: return call.reject("data là bắt buộc")
        val bytes = ByteArray(dataArray.length()) { i -> dataArray.getLong(i).toByte() }
        val written = usbTransport.write(connectionId, bytes)
        if (!written) {
            call.reject("Ghi dữ liệu tới máy in thất bại")
            return
        }
        call.resolve()
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        val connectionId = call.getString("connectionId") ?: return call.reject("connectionId là bắt buộc")
        usbTransport.disconnect(connectionId)
        call.resolve()
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val connectionId = call.getString("connectionId") ?: return call.reject("connectionId là bắt buộc")
        val result = JSObject()
        result.put("status", if (usbTransport.isConnected(connectionId)) "connected" else "disconnected")
        call.resolve(result)
    }
}
```

- [ ] **Step 4: Register the plugin in `MainActivity`**

Modify `android/app/src/main/java/com/ndtcore/pos/MainActivity.java`:

```java
package com.ndtcore.pos;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.ndtcore.pos.printer.PrinterPlugin;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PrinterPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
```

- [ ] **Step 5: Verify**

Android SDK is not configured in this dev environment (no `ANDROID_HOME`/`ANDROID_SDK_ROOT`). Verify by code review against the Capacitor Android plugin API (`Plugin`, `PluginCall`, `@CapacitorPlugin`, `@PluginMethod`) and confirm the file compiles conceptually (matching method names/types to `PrinterPlugin` TS interface from Task 4). Real compilation (`cd android && ./gradlew compileDebugKotlin`) and on-device testing happens in Task 13 once Android Studio/SDK is available.

- [ ] **Step 6: Commit**

```bash
git add android/app/src/main/java/com/ndtcore/pos
git commit -m "feat: add Android native Printer plugin (USB transport)"
```

---

### Task 6: Android native plugin — LAN transport (Kotlin)

**Files:**
- Create: `android/app/src/main/java/com/ndtcore/pos/printer/LanTransport.kt`
- Modify: `android/app/src/main/java/com/ndtcore/pos/printer/PrinterPlugin.kt` (wire `connectLan` to `LanTransport`, route `write`/`disconnect`/`getStatus` by connection prefix)

**Interfaces:**
- Consumes: nothing new beyond Task 5's `PrinterPlugin` shell.
- Produces: native `connectLan` support. `write`/`disconnect`/`getStatus` now dispatch to either `usbTransport` or `lanTransport` based on the `connectionId` prefix (`"usb-"` vs `"lan-"`).

- [ ] **Step 1: Implement the LAN transport**

Socket I/O must not run on the main thread (`NetworkOnMainThreadException`), so it runs on a dedicated single-thread executor.

`android/app/src/main/java/com/ndtcore/pos/printer/LanTransport.kt`:

```kotlin
package com.ndtcore.pos.printer

import java.io.OutputStream
import java.net.Socket
import java.util.concurrent.Executors

private class LanConnectionSession(val socket: Socket, val outputStream: OutputStream)

class LanTransport {
    private val executor = Executors.newSingleThreadExecutor()
    private val sessions = mutableMapOf<String, LanConnectionSession>()

    fun connect(ip: String, port: Int, connectionId: String, onResult: (Result<Unit>) -> Unit) {
        executor.execute {
            try {
                val socket = Socket(ip, port)
                socket.soTimeout = 5000
                sessions[connectionId] = LanConnectionSession(socket, socket.getOutputStream())
                onResult(Result.success(Unit))
            } catch (e: Exception) {
                onResult(Result.failure(Exception("Không kết nối được tới $ip:$port — ${e.message}")))
            }
        }
    }

    fun write(connectionId: String, data: ByteArray, onResult: (Result<Unit>) -> Unit) {
        val session = sessions[connectionId]
        if (session == null) {
            onResult(Result.failure(Exception("Không tìm thấy kết nối LAN $connectionId")))
            return
        }
        executor.execute {
            try {
                session.outputStream.write(data)
                session.outputStream.flush()
                onResult(Result.success(Unit))
            } catch (e: Exception) {
                onResult(Result.failure(Exception("Ghi dữ liệu LAN thất bại — ${e.message}")))
            }
        }
    }

    fun disconnect(connectionId: String) {
        val session = sessions.remove(connectionId) ?: return
        executor.execute {
            session.socket.close()
        }
    }

    fun isConnected(connectionId: String): Boolean = sessions.containsKey(connectionId)
}
```

- [ ] **Step 2: Wire `LanTransport` into `PrinterPlugin`**

Modify `android/app/src/main/java/com/ndtcore/pos/printer/PrinterPlugin.kt` — add the field, replace `connectLan`, and make `write`/`disconnect`/`getStatus` dispatch by `connectionId` prefix:

```kotlin
private val lanTransport by lazy { LanTransport() }
private var nextLanConnectionSeq = 1

@PluginMethod
fun connectLan(call: PluginCall) {
    val ip = call.getString("ip") ?: return call.reject("ip là bắt buộc")
    val port = call.getInt("port") ?: return call.reject("port là bắt buộc")
    val connectionId = "lan-${nextLanConnectionSeq++}"
    lanTransport.connect(ip, port, connectionId) { result ->
        result.fold(
            onSuccess = {
                val response = JSObject()
                response.put("connectionId", connectionId)
                call.resolve(response)
            },
            onFailure = { call.reject(it.message, it) },
        )
    }
}
```

Replace the body of `write`:

```kotlin
@PluginMethod
fun write(call: PluginCall) {
    val connectionId = call.getString("connectionId") ?: return call.reject("connectionId là bắt buộc")
    val dataArray = call.getArray("data") ?: return call.reject("data là bắt buộc")
    val bytes = ByteArray(dataArray.length()) { i -> dataArray.getLong(i).toByte() }
    if (connectionId.startsWith("lan-")) {
        lanTransport.write(connectionId, bytes) { result ->
            result.fold(onSuccess = { call.resolve() }, onFailure = { call.reject(it.message, it) })
        }
        return
    }
    val written = usbTransport.write(connectionId, bytes)
    if (!written) {
        call.reject("Ghi dữ liệu tới máy in thất bại")
        return
    }
    call.resolve()
}
```

Replace the body of `disconnect` and `getStatus` to branch the same way:

```kotlin
@PluginMethod
fun disconnect(call: PluginCall) {
    val connectionId = call.getString("connectionId") ?: return call.reject("connectionId là bắt buộc")
    if (connectionId.startsWith("lan-")) lanTransport.disconnect(connectionId) else usbTransport.disconnect(connectionId)
    call.resolve()
}

@PluginMethod
fun getStatus(call: PluginCall) {
    val connectionId = call.getString("connectionId") ?: return call.reject("connectionId là bắt buộc")
    val connected = if (connectionId.startsWith("lan-")) lanTransport.isConnected(connectionId) else usbTransport.isConnected(connectionId)
    val result = JSObject()
    result.put("status", if (connected) "connected" else "disconnected")
    call.resolve(result)
}
```

- [ ] **Step 3: Verify**

Code review against `LanTransport`/`PrinterPlugin` for consistent `connectionId` prefixing (`usb-` from Task 5, `lan-` here) — every dispatch site (`write`, `disconnect`, `getStatus`) must branch the same way. Real socket verification happens on a physical Android device in Task 13 (needs a printer reachable on the LAN).

- [ ] **Step 4: Commit**

```bash
git add android/app/src/main/java/com/ndtcore/pos/printer
git commit -m "feat: add Android LAN transport and wire it into the Printer plugin"
```

---

### Task 7: Printer config type + persistence

**Files:**
- Create: `src/modules/printer/types/printer-config.types.ts`
- Create: `src/modules/printer/config/printer-config.storage.ts`

**Interfaces:**
- Consumes: `getJson`/`setJson` from Task 3 (`src/core/storage/preferences.storage.ts`).
- Produces: `StoredPrinterConfig`, `DEFAULT_PRINTER_CONFIG`, `loadPrinterConfig(): Promise<StoredPrinterConfig>`, `savePrinterConfig(config: StoredPrinterConfig): Promise<void>` — consumed by Task 11 (`usePrinterStore`).

- [ ] **Step 1: Define the config type**

`src/modules/printer/types/printer-config.types.ts`:

```ts
export interface StoredUsbDevice {
  serialNumber?: string
  vendorId: number
  productId: number
}

export interface StoredLanDevice {
  ip: string
  port: number
}

export interface StoredPrinterConfig {
  driver: 'generic-escpos'
  connectionType: 'usb' | 'lan'
  autoConnect: boolean
  usbDevice?: StoredUsbDevice
  lanDevice?: StoredLanDevice
}

export const DEFAULT_PRINTER_CONFIG: StoredPrinterConfig = {
  driver: 'generic-escpos',
  connectionType: 'usb',
  autoConnect: false,
}
```

- [ ] **Step 2: Implement load/save**

`src/modules/printer/config/printer-config.storage.ts`:

```ts
import { getJson, setJson } from '@/core/storage/preferences.storage'
import { DEFAULT_PRINTER_CONFIG, type StoredPrinterConfig } from '../types/printer-config.types'

const PRINTER_CONFIG_KEY = 'printer.config'

export async function loadPrinterConfig(): Promise<StoredPrinterConfig> {
  const stored = await getJson<StoredPrinterConfig>(PRINTER_CONFIG_KEY)
  return stored ?? DEFAULT_PRINTER_CONFIG
}

export async function savePrinterConfig(config: StoredPrinterConfig): Promise<void> {
  await setJson(PRINTER_CONFIG_KEY, config)
}
```

- [ ] **Step 3: Verify**

```bash
npm run type-check
```

Manual smoke check (same technique as Task 3): temporarily call `savePrinterConfig({ ...DEFAULT_PRINTER_CONFIG, connectionType: 'lan', lanDevice: { ip: '192.168.1.50', port: 9100 } })` then `loadPrinterConfig().then(console.log)` from `App.vue`'s `onMounted`, confirm the browser console logs the LAN config back. Remove the temporary code before committing.

- [ ] **Step 4: Commit**

```bash
git add src/modules/printer/types/printer-config.types.ts src/modules/printer/config
git commit -m "feat: add printer config type and preferences-backed persistence"
```

---

### Task 8: Connection layer (Usb/Lan)

**Files:**
- Create: `src/modules/printer/connections/connection.types.ts`
- Create: `src/modules/printer/connections/usb-connection.ts`
- Create: `src/modules/printer/connections/lan-connection.ts`

**Interfaces:**
- Consumes: `Printer` proxy from Task 4.
- Produces: `PrinterConnection` interface, `UsbConnection`, `LanConnection` — both implement `connect(): Promise<void>`, `write(data: number[]): Promise<void>`, `disconnect(): Promise<void>`, `getStatus(): Promise<PrinterConnectionStatus>`. Consumed by Task 10 (`PrinterFactory`).

- [ ] **Step 1: Define the shared interface**

`src/modules/printer/connections/connection.types.ts`:

```ts
import type { PrinterConnectionStatus } from '../plugin/printer-plugin.types'

export interface PrinterConnection {
  connect(): Promise<void>
  write(data: number[]): Promise<void>
  disconnect(): Promise<void>
  getStatus(): Promise<PrinterConnectionStatus>
}
```

- [ ] **Step 2: Implement `UsbConnection`**

`src/modules/printer/connections/usb-connection.ts`:

```ts
import { Printer } from '../plugin/printer.plugin'
import type { PrinterConnectionStatus } from '../plugin/printer-plugin.types'
import type { PrinterConnection } from './connection.types'

export class UsbConnection implements PrinterConnection {
  private connectionId: string | null = null

  constructor(
    private readonly vendorId: number,
    private readonly productId: number,
  ) {}

  async connect(): Promise<void> {
    const { connectionId } = await Printer.connectUsb({ vendorId: this.vendorId, productId: this.productId })
    this.connectionId = connectionId
  }

  async write(data: number[]): Promise<void> {
    if (!this.connectionId) throw new Error('Chưa kết nối USB')
    await Printer.write({ connectionId: this.connectionId, data })
  }

  async disconnect(): Promise<void> {
    if (!this.connectionId) return
    await Printer.disconnect({ connectionId: this.connectionId })
    this.connectionId = null
  }

  async getStatus(): Promise<PrinterConnectionStatus> {
    if (!this.connectionId) return 'disconnected'
    const { status } = await Printer.getStatus({ connectionId: this.connectionId })
    return status
  }
}
```

- [ ] **Step 3: Implement `LanConnection`**

`src/modules/printer/connections/lan-connection.ts`:

```ts
import { Printer } from '../plugin/printer.plugin'
import type { PrinterConnectionStatus } from '../plugin/printer-plugin.types'
import type { PrinterConnection } from './connection.types'

export class LanConnection implements PrinterConnection {
  private connectionId: string | null = null

  constructor(
    private readonly ip: string,
    private readonly port: number,
  ) {}

  async connect(): Promise<void> {
    const { connectionId } = await Printer.connectLan({ ip: this.ip, port: this.port })
    this.connectionId = connectionId
  }

  async write(data: number[]): Promise<void> {
    if (!this.connectionId) throw new Error('Chưa kết nối LAN')
    await Printer.write({ connectionId: this.connectionId, data })
  }

  async disconnect(): Promise<void> {
    if (!this.connectionId) return
    await Printer.disconnect({ connectionId: this.connectionId })
    this.connectionId = null
  }

  async getStatus(): Promise<PrinterConnectionStatus> {
    if (!this.connectionId) return 'disconnected'
    const { status } = await Printer.getStatus({ connectionId: this.connectionId })
    return status
  }
}
```

- [ ] **Step 4: Verify**

```bash
npm run type-check
```

- [ ] **Step 5: Commit**

```bash
git add src/modules/printer/connections
git commit -m "feat: add Usb/Lan printer connection wrappers"
```

---

### Task 9: Generic ESC/POS driver

**Files:**
- Create: `src/modules/printer/types/receipt-printer-encoder.d.ts`
- Create: `src/modules/printer/utils/build-test-bill-canvas.util.ts`
- Create: `src/modules/printer/drivers/generic-escpos.driver.ts`

**Interfaces:**
- Produces: `GenericEscPosDriver.buildTestPrintBytes(storeName: string): number[]` — consumed by Task 10 (`PrinterManager.printTest`).

- [ ] **Step 1: Install the encoder**

```bash
npm install @point-of-sale/receipt-printer-encoder
```

- [ ] **Step 2: Add the ambient type declaration**

`src/modules/printer/types/receipt-printer-encoder.d.ts`:

```ts
declare module '@point-of-sale/receipt-printer-encoder' {
  export interface ReceiptPrinterEncoderOptions {
    language: 'esc-pos' | 'star-prnt'
  }

  export default class ReceiptPrinterEncoder {
    constructor(options: ReceiptPrinterEncoderOptions)
    initialize(): this
    image(source: HTMLCanvasElement, width: number, height: number, mode: 'raster' | 'column'): this
    cut(): this
    encode(): Uint8Array
  }
}
```

- [ ] **Step 3: Build the test-bill canvas util**

`src/modules/printer/utils/build-test-bill-canvas.util.ts`:

```ts
export const RECEIPT_WIDTH_DOTS = 576

export function buildTestBillCanvas(storeName: string): HTMLCanvasElement {
  const lines = [
    storeName,
    '',
    'Order #1001',
    'Classic Milk Tea',
    '  Pearl',
    '  Sugar 100%',
    '  Ice Normal',
    '-------------------------',
    'TOTAL',
    '$8.50',
    '',
    'Thank You',
  ]

  const lineHeight = 36
  const canvas = document.createElement('canvas')
  canvas.width = RECEIPT_WIDTH_DOTS
  canvas.height = lines.length * lineHeight + 40

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Không tạo được canvas 2D context')
  }
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#000'
  ctx.font = '28px monospace'
  ctx.textBaseline = 'top'
  lines.forEach((line, index) => {
    ctx.fillText(line, 16, 20 + index * lineHeight)
  })

  return canvas
}
```

- [ ] **Step 4: Implement the driver**

`src/modules/printer/drivers/generic-escpos.driver.ts`:

```ts
import ReceiptPrinterEncoder from '@point-of-sale/receipt-printer-encoder'
import { buildTestBillCanvas, RECEIPT_WIDTH_DOTS } from '../utils/build-test-bill-canvas.util'

export class GenericEscPosDriver {
  buildTestPrintBytes(storeName: string): number[] {
    const canvas = buildTestBillCanvas(storeName)
    const encoder = new ReceiptPrinterEncoder({ language: 'esc-pos' })
    const bytes = encoder.initialize().image(canvas, RECEIPT_WIDTH_DOTS, canvas.height, 'raster').cut().encode()
    return Array.from(bytes)
  }
}
```

- [ ] **Step 5: Verify**

```bash
npm run type-check
```

Manual smoke check: temporarily call `new GenericEscPosDriver().buildTestPrintBytes('NDT Bubble Tea')` from `App.vue`'s `onMounted` and `console.log(bytes.length)` — confirm it logs a positive number (not 0/NaN/throw) in the browser console. Remove the temporary code before committing.

- [ ] **Step 6: Commit**

```bash
git add src/modules/printer/types/receipt-printer-encoder.d.ts src/modules/printer/utils src/modules/printer/drivers package.json package-lock.json
git commit -m "feat: add Generic ESC/POS driver (canvas raster encoding)"
```

---

### Task 10: PrinterFactory + PrinterManager

**Files:**
- Create: `src/modules/printer/managers/printer-factory.ts`
- Create: `src/modules/printer/managers/printer-manager.ts`

**Interfaces:**
- Consumes: `GenericEscPosDriver` (Task 9), `UsbConnection`/`LanConnection`/`PrinterConnection` (Task 8), `StoredPrinterConfig` (Task 7), `Printer` proxy (Task 4).
- Produces: `PrinterManager` with `scanUsb(): Promise<UsbDeviceInfo[]>`, `connect(config: StoredPrinterConfig): Promise<void>`, `disconnect(): Promise<void>`, `printTest(storeName: string): Promise<void>`, `getStatus(): Promise<PrinterConnectionStatus>` — consumed by Task 11 (`usePrinterStore`).

- [ ] **Step 1: Implement the factory**

`src/modules/printer/managers/printer-factory.ts`:

```ts
import { GenericEscPosDriver } from '../drivers/generic-escpos.driver'
import { UsbConnection } from '../connections/usb-connection'
import { LanConnection } from '../connections/lan-connection'
import type { PrinterConnection } from '../connections/connection.types'
import type { StoredPrinterConfig } from '../types/printer-config.types'

export class PrinterFactory {
  createDriver(): GenericEscPosDriver {
    return new GenericEscPosDriver()
  }

  createConnection(config: StoredPrinterConfig): PrinterConnection {
    if (config.connectionType === 'usb') {
      if (!config.usbDevice) throw new Error('Chưa chọn thiết bị USB')
      return new UsbConnection(config.usbDevice.vendorId, config.usbDevice.productId)
    }
    if (!config.lanDevice) throw new Error('Chưa nhập IP máy in LAN')
    return new LanConnection(config.lanDevice.ip, config.lanDevice.port)
  }
}
```

- [ ] **Step 2: Implement the manager**

`src/modules/printer/managers/printer-manager.ts`:

```ts
import { Printer } from '../plugin/printer.plugin'
import { PrinterFactory } from './printer-factory'
import type { PrinterConnection } from '../connections/connection.types'
import type { PrinterConnectionStatus, UsbDeviceInfo } from '../plugin/printer-plugin.types'
import type { StoredPrinterConfig } from '../types/printer-config.types'

export class PrinterManager {
  private connection: PrinterConnection | null = null
  private readonly factory = new PrinterFactory()

  async scanUsb(): Promise<UsbDeviceInfo[]> {
    const { devices } = await Printer.scanUsb()
    return devices
  }

  async connect(config: StoredPrinterConfig): Promise<void> {
    const connection = this.factory.createConnection(config)
    await connection.connect()
    this.connection = connection
  }

  async disconnect(): Promise<void> {
    if (!this.connection) return
    await this.connection.disconnect()
    this.connection = null
  }

  async printTest(storeName: string): Promise<void> {
    if (!this.connection) throw new Error('Chưa kết nối máy in')
    const driver = this.factory.createDriver()
    const bytes = driver.buildTestPrintBytes(storeName)
    await this.connection.write(bytes)
  }

  async getStatus(): Promise<PrinterConnectionStatus> {
    if (!this.connection) return 'disconnected'
    return this.connection.getStatus()
  }
}
```

- [ ] **Step 3: Verify**

```bash
npm run type-check
```

- [ ] **Step 4: Commit**

```bash
git add src/modules/printer/managers
git commit -m "feat: add PrinterFactory and PrinterManager orchestration"
```

---

### Task 11: Pinia `usePrinterStore`

**Files:**
- Create: `src/modules/printer/stores/printer.store.ts`

**Interfaces:**
- Consumes: `PrinterManager` (Task 10), `loadPrinterConfig`/`savePrinterConfig` (Task 7), `UsbDeviceInfo` (Task 4).
- Produces: `usePrinterStore()` with state `config`, `status`, `discoveredUsbDevices`, `errorMessage`; getter `isLanSupported`; actions `init()`, `scanUsb()`, `connect()`, `disconnect()`, `printTest(storeName: string)`, `setUsbDevice(device)`, `setLanDevice(ip, port)`, `setAutoConnect(value)` — consumed by Task 12 (`PrinterSettingsPage.vue`).

- [ ] **Step 1: Implement the store**

`src/modules/printer/stores/printer.store.ts`:

```ts
import { defineStore } from 'pinia'
import { Capacitor } from '@capacitor/core'
import { PrinterManager } from '../managers/printer-manager'
import { loadPrinterConfig, savePrinterConfig } from '../config/printer-config.storage'
import type { StoredPrinterConfig } from '../types/printer-config.types'
import type { UsbDeviceInfo } from '../plugin/printer-plugin.types'

const manager = new PrinterManager()

type UiStatus = 'connected' | 'connecting' | 'disconnected' | 'error'

export const usePrinterStore = defineStore('printer', {
  state: () => ({
    config: null as StoredPrinterConfig | null,
    status: 'disconnected' as UiStatus,
    discoveredUsbDevices: [] as UsbDeviceInfo[],
    errorMessage: null as string | null,
  }),
  getters: {
    isLanSupported: (): boolean => Capacitor.getPlatform() !== 'web',
  },
  actions: {
    async init(): Promise<void> {
      this.config = await loadPrinterConfig()
      if (this.config.autoConnect) {
        await this.connect()
      }
    },
    async scanUsb(): Promise<void> {
      this.errorMessage = null
      try {
        this.discoveredUsbDevices = await manager.scanUsb()
      } catch (error) {
        this.errorMessage = (error as Error).message
      }
    },
    async connect(): Promise<void> {
      if (!this.config) throw new Error('Config chưa được load')
      this.status = 'connecting'
      this.errorMessage = null
      try {
        await manager.connect(this.config)
        this.status = 'connected'
        await savePrinterConfig(this.config)
      } catch (error) {
        this.status = 'error'
        this.errorMessage = (error as Error).message
      }
    },
    async disconnect(): Promise<void> {
      await manager.disconnect()
      this.status = 'disconnected'
    },
    async printTest(storeName: string): Promise<void> {
      this.errorMessage = null
      try {
        await manager.printTest(storeName)
      } catch (error) {
        this.errorMessage = (error as Error).message
      }
    },
    setUsbDevice(device: UsbDeviceInfo): void {
      if (!this.config) return
      this.config.connectionType = 'usb'
      this.config.usbDevice = {
        serialNumber: device.serialNumber,
        vendorId: device.vendorId,
        productId: device.productId,
      }
    },
    setLanDevice(ip: string, port: number): void {
      if (!this.config) return
      this.config.connectionType = 'lan'
      this.config.lanDevice = { ip, port }
    },
    setAutoConnect(value: boolean): void {
      if (!this.config) return
      this.config.autoConnect = value
    },
  },
})
```

- [ ] **Step 2: Verify**

```bash
npm run type-check
```

- [ ] **Step 3: Commit**

```bash
git add src/modules/printer/stores
git commit -m "feat: add usePrinterStore wiring config, manager, and connection status"
```

---

### Task 12: Printer Settings page + router wiring

**Files:**
- Create: `src/modules/printer/pages/PrinterSettingsPage.vue`
- Modify: `src/router/index.ts` (add route)

**Interfaces:**
- Consumes: `usePrinterStore` (Task 11).
- Produces: a reachable `/printer-settings` page.

- [ ] **Step 1: Implement the page**

`src/modules/printer/pages/PrinterSettingsPage.vue`:

```vue
<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { usePrinterStore } from '../stores/printer.store'
import type { UsbDeviceInfo } from '../plugin/printer-plugin.types'

const store = usePrinterStore()
const lanIp = ref('')
const lanPort = ref(9100)
const testStoreName = ref('NDT Bubble Tea')

onMounted(() => {
  store.init()
})

function selectUsbDevice(device: UsbDeviceInfo): void {
  store.setUsbDevice(device)
}

function connectLan(): void {
  store.setLanDevice(lanIp.value, lanPort.value)
  store.connect()
}

const connectionTypeItems = [
  { title: 'USB', value: 'usb' as const },
  { title: 'LAN', value: 'lan' as const },
]
</script>

<template>
  <v-container v-if="store.config">
    <v-select
      v-model="store.config.connectionType"
      :items="connectionTypeItems"
      item-title="title"
      item-value="value"
      label="Connection Type"
    />
    <v-alert v-if="!store.isLanSupported && store.config.connectionType === 'lan'" type="warning" class="mb-4">
      LAN không hỗ trợ trên trình duyệt — chỉ hoạt động trên app Android.
    </v-alert>

    <template v-if="store.config.connectionType === 'usb'">
      <v-btn @click="store.scanUsb">Scan</v-btn>
      <v-list v-if="store.discoveredUsbDevices.length">
        <v-list-item
          v-for="device in store.discoveredUsbDevices"
          :key="`${device.vendorId}-${device.productId}`"
          :title="device.productName ?? `USB ${device.vendorId}:${device.productId}`"
          @click="selectUsbDevice(device)"
        />
      </v-list>
      <v-btn color="primary" :disabled="!store.config.usbDevice" @click="store.connect">Connect</v-btn>
    </template>

    <template v-else>
      <v-text-field v-model="lanIp" label="IP máy in" />
      <v-text-field v-model.number="lanPort" label="Port" type="number" />
      <v-btn color="primary" @click="connectLan">Connect</v-btn>
    </template>

    <v-chip :color="store.status === 'connected' ? 'success' : store.status === 'error' ? 'error' : 'grey'" class="my-4">
      {{ store.status }}
    </v-chip>

    <v-alert v-if="store.errorMessage" type="error" class="mb-4">{{ store.errorMessage }}</v-alert>

    <v-switch
      :model-value="store.config.autoConnect"
      label="Auto Connect"
      @update:model-value="(value) => store.setAutoConnect(!!value)"
    />

    <v-btn :disabled="store.status !== 'connected'" @click="store.printTest(testStoreName)">Print Test Bill</v-btn>
  </v-container>
</template>
```

- [ ] **Step 2: Add the route**

Modify `src/router/index.ts` — add to the `routes` array (keep the scaffolded default route as-is):

```ts
{
  path: '/printer-settings',
  name: 'printer-settings',
  component: () => import('../modules/printer/pages/PrinterSettingsPage.vue'),
},
```

- [ ] **Step 3: Verify — full manual test on Web**

```bash
npm run type-check
npm run dev
```

Navigate to `/printer-settings` in Chrome. With a real USB thermal printer connected:

1. Connection Type = USB → click **Scan** → grant the browser's device-picker permission → confirm the printer appears in the list.
2. Click the printer in the list → click **Connect** → confirm the chip shows `connected`.
3. Click **Print Test Bill** → confirm a physical test receipt prints with the sample content ("NDT Bubble Tea", "Order #1001", "Classic Milk Tea", "TOTAL", "$8.50", "Thank You").
4. Switch Connection Type to LAN → confirm the warning alert appears and Connect is not expected to work (browser has no raw TCP).

If no physical printer is available, at minimum confirm: page renders without console errors, Scan triggers the WebUSB device picker (proves the plugin call reaches `navigator.usb.requestDevice`), and switching to LAN shows the "not supported on browser" warning.

- [ ] **Step 4: Commit**

```bash
git add src/modules/printer/pages src/router/index.ts
git commit -m "feat: add Printer Settings page and route"
```

---

### Task 13: Android build wiring + final manual verification

**Files:**
- Modify: none expected (verification-only task; fix forward if Task 5/6/12 review surfaces issues)

**Interfaces:**
- Consumes: everything from Tasks 1–12.
- Produces: a synced Android project ready for Android Studio, and a manual verification record for the parts that cannot be checked in this dev environment (no `ANDROID_HOME` configured here).

- [ ] **Step 1: Rebuild and sync**

```bash
npm run type-check
npm run build
npx cap sync android
```

Expected: all three succeed with no errors.

- [ ] **Step 2: Manual verification checklist — requires Android Studio + a physical Android device (not available in this dev environment; run on a machine that has them)**

Open `android/` in Android Studio, run on a device with a USB thermal printer attached via OTG and/or a LAN printer on the same network, then confirm:

1. App launches, navigating to the printer settings route shows the same UI as Task 12.
2. Connection Type = USB → Scan → Android's USB permission dialog appears → grant it → device appears in the list → Connect → chip shows `connected`.
3. Print Test Bill produces a physical receipt over USB.
4. Connection Type = LAN → enter the printer's IP and port 9100 → Connect → chip shows `connected` (no "unsupported" warning, unlike web).
5. Print Test Bill produces a physical receipt over LAN.
6. Force-disconnect the printer (unplug USB / power off LAN printer) mid-session, then attempt Print Test Bill again → confirm an error toast/alert appears instead of a silent failure or crash.

- [ ] **Step 3: Record the result**

If all checks in Step 2 pass, Phase 1 is functionally complete. If any check fails, file the specific failure (which step, what happened) before starting Phase 2 — do not silently patch around it without updating this plan/spec.

- [ ] **Step 4: Commit (only if Step 1 or manual testing required code fixes)**

```bash
git add -A
git commit -m "fix: address issues found during Phase 1 manual verification"
```
