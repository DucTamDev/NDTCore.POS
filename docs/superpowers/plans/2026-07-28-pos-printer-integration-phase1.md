# NDTCore.POS Phase 1 — Printer Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the printer-integration infrastructure for NDTCore.POS (scan/connect/configure/test-print a receipt printer) running on both Web (WebUSB) and Android (Capacitor native), per [`docs/superpowers/specs/2026-07-28-pos-printer-integration-phase1-design.md`](../specs/2026-07-28-pos-printer-integration-phase1-design.md).

**Architecture:** A single Vue 3 + Vite app wraps a local (non-published) Capacitor plugin named `Printer`. The plugin has one TypeScript interface (`definitions.ts`) and two independent implementations: `web.ts` (WebUSB, TypeScript) and `PrinterPlugin.kt` (Android native, Kotlin). Each side independently implements the same layered pattern — `PrinterManager → PrinterFactory (registry) → Driver → Connection` — because the two runtimes don't share code.

**Tech Stack:** Vue 3 (Composition API), TypeScript strict, Vite, Vitest, Vuetify 3, Pinia, Vue Router, Capacitor 6 (core + android), Kotlin + JUnit4 for Android unit tests.

## Global Constraints

- Node version: `^20.19.0 || >=22.12.0` (matches NDTCore.FE).
- Package manager: npm.
- TypeScript strict mode, no `any` anywhere.
- No comments explaining WHAT code does — only WHY, and only when non-obvious.
- App ID: `com.ndtcore.pos`, app name: `NDTCore POS`.
- Alias `@` maps to `src/`.
- All error messages shown to the user are in Vietnamese (matches existing NDTCore.FE convention).
- **Known risk (Task 22):** XPrinter's official SDK has no public Maven coordinate; the code in Task 22 uses the `net.posprinter` (`POSConnect`/`POSPrinter`/`IDeviceConnection`) API pattern as **best-effort**, based on community documentation, NOT verified against the vendor's actual v3.2.0 package. This must be checked against the real SDK jar/aar before running against physical hardware.

---

## Task 1: Scaffold the Vite + Vue 3 + TypeScript project

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `src/main.ts`, `src/App.vue`, `.gitignore`

**Interfaces:**
- Produces: a runnable `npm run dev` app and a working `npm run type-check` / `npm run test:unit` pipeline that every later task relies on.

- [ ] **Step 1: Scaffold with the official Vite template**

```bash
npm create vite@latest . -- --template vue-ts
```

When prompted about the current directory not being empty (it has `.git`, `CLAUDE.md`, `docs/`), confirm to continue.

- [ ] **Step 2: Install base dependencies**

```bash
npm install
npm install -D vitest jsdom @vue/test-utils @types/node
```

- [ ] **Step 3: Replace `vite.config.ts` with alias + Vitest config**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'jsdom',
    globals: false,
  },
})
```

- [ ] **Step 4: Update `tsconfig.json` compiler options**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "useDefineForClassFields": true,
    "module": "ESNext",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "moduleResolution": "Bundler",
    "strict": true,
    "noImplicitAny": true,
    "jsx": "preserve",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    },
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts", "src/**/*.d.ts", "src/**/*.tsx", "src/**/*.vue"]
}
```

- [ ] **Step 5: Add npm scripts to `package.json`**

```json
{
  "scripts": {
    "dev": "vite",
    "build": "vue-tsc --build && vite build",
    "type-check": "vue-tsc --build",
    "test:unit": "vitest"
  }
}
```

- [ ] **Step 6: Verify the pipeline works**

Run: `npm run type-check`
Expected: exits with code 0, no errors.

Run: `npx vitest run`
Expected: "No test files found" (expected — no tests yet), exit code 0 is fine here since it's a config smoke test, not a real gate.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vite.config.ts index.html src .gitignore
git commit -m "chore: scaffold Vite + Vue 3 + TypeScript project"
```

---

## Task 2: Add Vuetify, Pinia, Vue Router

**Files:**
- Create: `src/plugins/vuetify.ts`, `src/router/index.ts`, `src/test/mount-with-vuetify.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Produces: `vuetify` (Vuetify instance), `router` (Vue Router instance), `mountWithVuetify()` test helper used by every component test in later tasks.

- [ ] **Step 1: Install dependencies**

```bash
npm install vuetify pinia vue-router @mdi/font
```

- [ ] **Step 2: Create `src/plugins/vuetify.ts`**

```ts
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

export const vuetify = createVuetify({
  components,
  directives,
  icons: { defaultSet: 'mdi' },
})
```

- [ ] **Step 3: Create `src/router/index.ts`**

```ts
import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/printer-settings',
    },
    {
      path: '/printer-settings',
      name: 'printer-settings',
      component: () => import('@/modules/printer/views/PrinterSettingsView.vue'),
    },
  ],
})
```

- [ ] **Step 4: Wire everything in `src/main.ts`**

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { vuetify } from './plugins/vuetify'

const app = createApp(App)

app.use(createPinia())
app.use(router)
app.use(vuetify)

app.mount('#app')
```

- [ ] **Step 5: Replace `src/App.vue` with a router outlet**

```vue
<template>
  <v-app>
    <v-main>
      <router-view />
    </v-main>
  </v-app>
</template>

<script setup lang="ts"></script>
```

- [ ] **Step 6: Create the shared component test helper `src/test/mount-with-vuetify.ts`**

```ts
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { mount, type ComponentMountingOptions } from '@vue/test-utils'
import type { Component } from 'vue'

const vuetify = createVuetify({ components, directives })

export function mountWithVuetify<T extends Component>(
  component: T,
  options: ComponentMountingOptions<T> = {},
) {
  return mount(component, {
    ...options,
    global: {
      ...options.global,
      plugins: [vuetify, ...(options.global?.plugins ?? [])],
    },
  })
}
```

- [ ] **Step 7: Verify build still passes**

Run: `npm run type-check`
Expected: exit code 0.

This task has no dedicated automated test (it's wiring/plumbing); `PrinterSettingsView.vue` doesn't exist yet so the router will 404 until Task 11 — that's expected at this point.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json src
git commit -m "chore: wire up Vuetify, Pinia, Vue Router"
```

---

## Task 3: Add Capacitor core + Android platform

**Files:**
- Create: `capacitor.config.ts`
- Modify: `package.json`
- Generated: `android/` (via CLI, do not hand-write)

**Interfaces:**
- Produces: an `android/` Gradle project that later Android tasks (15–24) add Kotlin source files into.

- [ ] **Step 1: Install Capacitor**

```bash
npm install @capacitor/core
npm install -D @capacitor/cli
npm install @capacitor/android
```

- [ ] **Step 2: Initialize Capacitor**

```bash
npx cap init "NDTCore POS" "com.ndtcore.pos" --web-dir=dist
```

This creates `capacitor.config.ts`. Confirm it looks like:

```ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.ndtcore.pos',
  appName: 'NDTCore POS',
  webDir: 'dist',
}

export default config
```

- [ ] **Step 3: Build the web app once (Capacitor needs `dist/` to exist) and add the Android platform**

```bash
npm run build
npx cap add android
```

- [ ] **Step 4: Verify the Android project builds**

Run: `cd android && ./gradlew assembleDebug` (Windows: `android\gradlew.bat assembleDebug`)
Expected: `BUILD SUCCESSFUL`.

This requires Android SDK/Gradle to be installed locally — if this environment doesn't have Android Studio set up yet, note that as a blocker and confirm with the user before continuing to Task 15+.

- [ ] **Step 5: Commit**

```bash
git add capacitor.config.ts package.json package-lock.json android
git commit -m "chore: add Capacitor core and Android platform"
```

---

## Task 4: Define the PrinterPlugin contract and internal architecture types

**Files:**
- Create: `src/native/printer-plugin/definitions.ts`
- Create: `src/native/printer-plugin/internal/types.ts`

**Interfaces:**
- Produces: `PrinterConnectionType`, `PrinterDriverType`, `PrinterStatus`, `UsbPrinterDevice`, `LanPrinterDevice`, `PrinterDevice`, `PrinterConfig`, `PrinterPlugin` (all from `definitions.ts`); `PrinterDriver`, `PrinterConnection` (from `internal/types.ts`). Every later web-side task consumes these exact names.

- [ ] **Step 1: Create `src/native/printer-plugin/definitions.ts`**

```ts
export type PrinterConnectionType = 'usb' | 'lan' | 'bluetooth'

export type PrinterDriverType = 'generic-escpos' | 'xprinter' | 'epson' | 'star' | 'sunmi'

export type PrinterStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface UsbPrinterDevice {
  connectionType: 'usb'
  vendorId: number
  productId: number
  productName: string | null
  serialNumber: string | null
}

export interface LanPrinterDevice {
  connectionType: 'lan'
  ip: string
  port: number
}

export type PrinterDevice = UsbPrinterDevice | LanPrinterDevice

export interface PrinterConfig {
  driver: PrinterDriverType
  connectionType: PrinterConnectionType
  device: PrinterDevice | null
  autoConnect: boolean
}

export interface PrinterPlugin {
  scanPrinters(options: { connectionType: PrinterConnectionType }): Promise<{ devices: PrinterDevice[] }>
  connect(options: { config: PrinterConfig }): Promise<{ config: PrinterConfig }>
  disconnect(): Promise<void>
  print(options: { data: number[] }): Promise<void>
  testPrint(): Promise<void>
  getStatus(): Promise<{ status: PrinterStatus }>
  saveConfig(options: { config: PrinterConfig }): Promise<void>
  loadConfig(): Promise<{ config: PrinterConfig | null }>
}
```

- [ ] **Step 2: Create `src/native/printer-plugin/internal/types.ts`**

```ts
import type { PrinterDevice } from '../definitions'

export interface PrinterDriver {
  buildTestPrintBytes(): Uint8Array
}

export interface PrinterConnection {
  connectTo(device: PrinterDevice): Promise<void>
  disconnect(): Promise<void>
  write(data: Uint8Array): Promise<void>
  isConnected(): boolean
}
```

- [ ] **Step 3: Verify types compile**

Run: `npm run type-check`
Expected: exit code 0 (these are pure type declarations, nothing consumes them yet).

- [ ] **Step 4: Commit**

```bash
git add src/native/printer-plugin/definitions.ts src/native/printer-plugin/internal/types.ts
git commit -m "feat: define PrinterPlugin contract and internal architecture types"
```

---

## Task 5: Driver registry and Connection registry (TypeScript)

**Files:**
- Create: `src/native/printer-plugin/registry/driver-registry.ts`
- Create: `src/native/printer-plugin/registry/connection-registry.ts`
- Test: `src/native/printer-plugin/registry/driver-registry.test.ts`
- Test: `src/native/printer-plugin/registry/connection-registry.test.ts`

**Interfaces:**
- Consumes: `PrinterDriver`, `PrinterConnection` from `../internal/types` (Task 4); `PrinterDriverType`, `PrinterConnectionType` from `../definitions` (Task 4).
- Produces: `DriverRegistry` (`.register(type, factory)`, `.resolve(type): PrinterDriver`), `ConnectionRegistry` (`.register(type, factory)`, `.resolve(type): PrinterConnection`) — consumed by `PrinterManager` in Task 8 and `web.ts` in Task 9.

- [ ] **Step 1: Write the failing test for `DriverRegistry`**

```ts
// src/native/printer-plugin/registry/driver-registry.test.ts
import { describe, it, expect } from 'vitest'
import { DriverRegistry } from './driver-registry'
import type { PrinterDriver } from '../internal/types'

class FakeDriver implements PrinterDriver {
  buildTestPrintBytes(): Uint8Array {
    return new Uint8Array([0x01])
  }
}

describe('DriverRegistry', () => {
  it('resolves a registered driver by type', () => {
    const registry = new DriverRegistry()
    registry.register('generic-escpos', () => new FakeDriver())

    const driver = registry.resolve('generic-escpos')

    expect(driver).toBeInstanceOf(FakeDriver)
  })

  it('throws a clear error when the type is not registered', () => {
    const registry = new DriverRegistry()
    expect(() => registry.resolve('epson')).toThrow('Driver "epson" chưa được đăng ký.')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/native/printer-plugin/registry/driver-registry.test.ts`
Expected: FAIL — `./driver-registry` module not found.

- [ ] **Step 3: Implement `DriverRegistry`**

```ts
// src/native/printer-plugin/registry/driver-registry.ts
import type { PrinterDriverType } from '../definitions'
import type { PrinterDriver } from '../internal/types'

export class DriverRegistry {
  private readonly factories = new Map<PrinterDriverType, () => PrinterDriver>()

  register(type: PrinterDriverType, factory: () => PrinterDriver): void {
    this.factories.set(type, factory)
  }

  resolve(type: PrinterDriverType): PrinterDriver {
    const factory = this.factories.get(type)
    if (!factory) {
      throw new Error(`Driver "${type}" chưa được đăng ký.`)
    }
    return factory()
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/native/printer-plugin/registry/driver-registry.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing test for `ConnectionRegistry`**

```ts
// src/native/printer-plugin/registry/connection-registry.test.ts
import { describe, it, expect } from 'vitest'
import { ConnectionRegistry } from './connection-registry'
import type { PrinterConnection } from '../internal/types'
import type { PrinterDevice } from '../definitions'

class FakeConnection implements PrinterConnection {
  async connectTo(_device: PrinterDevice): Promise<void> {}
  async disconnect(): Promise<void> {}
  async write(_data: Uint8Array): Promise<void> {}
  isConnected(): boolean {
    return false
  }
}

describe('ConnectionRegistry', () => {
  it('resolves a registered connection by type', () => {
    const registry = new ConnectionRegistry()
    registry.register('usb', () => new FakeConnection())

    expect(registry.resolve('usb')).toBeInstanceOf(FakeConnection)
  })

  it('throws a clear error when the type is not registered', () => {
    const registry = new ConnectionRegistry()
    expect(() => registry.resolve('lan')).toThrow('Connection "lan" chưa được đăng ký.')
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `npx vitest run src/native/printer-plugin/registry/connection-registry.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 7: Implement `ConnectionRegistry`**

```ts
// src/native/printer-plugin/registry/connection-registry.ts
import type { PrinterConnectionType } from '../definitions'
import type { PrinterConnection } from '../internal/types'

export class ConnectionRegistry {
  private readonly factories = new Map<PrinterConnectionType, () => PrinterConnection>()

  register(type: PrinterConnectionType, factory: () => PrinterConnection): void {
    this.factories.set(type, factory)
  }

  resolve(type: PrinterConnectionType): PrinterConnection {
    const factory = this.factories.get(type)
    if (!factory) {
      throw new Error(`Connection "${type}" chưa được đăng ký.`)
    }
    return factory()
  }
}
```

- [ ] **Step 8: Run both test files to verify they pass**

Run: `npx vitest run src/native/printer-plugin/registry`
Expected: PASS (4 tests total).

- [ ] **Step 9: Commit**

```bash
git add src/native/printer-plugin/registry
git commit -m "feat: add driver and connection registries"
```

---

## Task 6: GenericEscPosDriver (TypeScript, Web)

**Files:**
- Create: `src/native/printer-plugin/drivers/generic-escpos.driver.ts`
- Test: `src/native/printer-plugin/drivers/generic-escpos.driver.test.ts`

**Interfaces:**
- Consumes: `PrinterDriver` from `../internal/types` (Task 4).
- Produces: `GenericEscPosDriver` class, registered under key `'generic-escpos'` in Task 9.

- [ ] **Step 1: Write the failing test**

```ts
// src/native/printer-plugin/drivers/generic-escpos.driver.test.ts
import { describe, it, expect } from 'vitest'
import { GenericEscPosDriver } from './generic-escpos.driver'

describe('GenericEscPosDriver', () => {
  it('starts the byte stream with the ESC @ initialize command', () => {
    const bytes = new GenericEscPosDriver().buildTestPrintBytes()
    expect(Array.from(bytes.slice(0, 2))).toEqual([0x1b, 0x40])
  })

  it('ends the byte stream with the GS V 0 full-cut command', () => {
    const bytes = new GenericEscPosDriver().buildTestPrintBytes()
    expect(Array.from(bytes.slice(-3))).toEqual([0x1d, 0x56, 0x00])
  })

  it('contains the sample bill text from the project spec', () => {
    const bytes = new GenericEscPosDriver().buildTestPrintBytes()
    const text = new TextDecoder().decode(bytes)
    expect(text).toContain('NDT Bubble Tea')
    expect(text).toContain('Order #1001')
    expect(text).toContain('TOTAL')
    expect(text).toContain('$8.50')
    expect(text).toContain('Thank You')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/native/printer-plugin/drivers/generic-escpos.driver.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `GenericEscPosDriver`**

```ts
// src/native/printer-plugin/drivers/generic-escpos.driver.ts
import type { PrinterDriver } from '../internal/types'

const ESC = 0x1b
const GS = 0x1d

const TEST_BILL_LINES = [
  'NDT Bubble Tea',
  '',
  'Order #1001',
  'Classic Milk Tea',
  'Pearl',
  'Sugar 100%',
  'Ice Normal',
  '-------------------------',
  'TOTAL',
  '$8.50',
  '',
  'Thank You',
  '',
  '',
  '',
]

export class GenericEscPosDriver implements PrinterDriver {
  buildTestPrintBytes(): Uint8Array {
    const bytes: number[] = [ESC, 0x40] // ESC @ — initialize

    for (const line of TEST_BILL_LINES) {
      bytes.push(...Array.from(new TextEncoder().encode(line)), 0x0a)
    }

    bytes.push(GS, 0x56, 0x00) // GS V 0 — full cut

    return new Uint8Array(bytes)
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/native/printer-plugin/drivers/generic-escpos.driver.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/native/printer-plugin/drivers
git commit -m "feat: add GenericEscPosDriver for web"
```

---

## Task 7: UsbConnection (TypeScript, WebUSB)

**Files:**
- Create: `src/native/printer-plugin/connections/usb-connection.ts`
- Test: `src/native/printer-plugin/connections/usb-connection.test.ts`

**Interfaces:**
- Consumes: `PrinterConnection` from `../internal/types` (Task 4); `PrinterDevice`, `UsbPrinterDevice` from `../definitions` (Task 4).
- Produces: `UsbConnection` class with `pickDevice(): Promise<UsbPrinterDevice>`, `listKnownDevices(): Promise<UsbPrinterDevice[]>`, plus the `PrinterConnection` interface methods — consumed by `PrinterManager` (Task 8) and `web.ts` (Task 9).

- [ ] **Step 1: Install WebUSB ambient types**

```bash
npm install -D @types/w3c-web-usb
```

Add `"@types/w3c-web-usb"` to the `"types"` array in `tsconfig.json`'s `compilerOptions`.

- [ ] **Step 2: Write the failing tests**

```ts
// src/native/printer-plugin/connections/usb-connection.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UsbConnection } from './usb-connection'
import type { UsbPrinterDevice } from '../definitions'

function createFakeUsbDevice(overrides: Record<string, unknown> = {}) {
  return {
    vendorId: 0x0483,
    productId: 0x5743,
    productName: 'Fake Printer',
    serialNumber: 'SN123',
    configuration: {
      interfaces: [
        {
          interfaceNumber: 0,
          alternate: { endpoints: [{ direction: 'out', endpointNumber: 1 }] },
        },
      ],
    },
    configurations: [{ configurationValue: 1 }],
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    selectConfiguration: vi.fn().mockResolvedValue(undefined),
    claimInterface: vi.fn().mockResolvedValue(undefined),
    transferOut: vi.fn().mockResolvedValue({ status: 'ok' }),
    ...overrides,
  } as unknown as USBDevice
}

const targetDevice: UsbPrinterDevice = {
  connectionType: 'usb',
  vendorId: 0x0483,
  productId: 0x5743,
  productName: 'Fake Printer',
  serialNumber: 'SN123',
}

describe('UsbConnection', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {
      usb: {
        getDevices: vi.fn().mockResolvedValue([]),
        requestDevice: vi.fn(),
      },
    })
  })

  it('connectTo opens the device, selects a configuration, and claims the interface', async () => {
    const fakeDevice = createFakeUsbDevice()
    vi.mocked(navigator.usb.getDevices).mockResolvedValue([fakeDevice])

    const connection = new UsbConnection()
    await connection.connectTo(targetDevice)

    expect(fakeDevice.open).toHaveBeenCalled()
    expect(fakeDevice.claimInterface).toHaveBeenCalledWith(0)
    expect(connection.isConnected()).toBe(true)
  })

  it('write() sends data through transferOut on the claimed OUT endpoint', async () => {
    const fakeDevice = createFakeUsbDevice()
    vi.mocked(navigator.usb.getDevices).mockResolvedValue([fakeDevice])

    const connection = new UsbConnection()
    await connection.connectTo(targetDevice)
    await connection.write(new Uint8Array([0x1b, 0x40]))

    expect(fakeDevice.transferOut).toHaveBeenCalledWith(1, new Uint8Array([0x1b, 0x40]))
  })

  it('write() throws a clear error when not connected', async () => {
    const connection = new UsbConnection()
    await expect(connection.write(new Uint8Array([0x00]))).rejects.toThrow(
      'Chưa kết nối máy in USB.',
    )
  })

  it('connectTo throws when given a non-USB device', async () => {
    const connection = new UsbConnection()
    await expect(
      connection.connectTo({ connectionType: 'lan', ip: '192.168.1.50', port: 9100 }),
    ).rejects.toThrow('UsbConnection chỉ nhận thiết bị USB.')
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/native/printer-plugin/connections/usb-connection.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `UsbConnection`**

```ts
// src/native/printer-plugin/connections/usb-connection.ts
import type { PrinterConnection } from '../internal/types'
import type { PrinterDevice, UsbPrinterDevice } from '../definitions'

const CHUNK_SIZE = 4096

function isUsbDevice(device: PrinterDevice): device is UsbPrinterDevice {
  return device.connectionType === 'usb'
}

function findBulkOutEndpoint(
  device: USBDevice,
): { interfaceNumber: number; endpointNumber: number } | null {
  const configuration = device.configuration
  if (!configuration) return null

  for (const iface of configuration.interfaces) {
    const outEndpoint = iface.alternate.endpoints.find((e) => e.direction === 'out')
    if (outEndpoint) {
      return { interfaceNumber: iface.interfaceNumber, endpointNumber: outEndpoint.endpointNumber }
    }
  }
  return null
}

function toUsbPrinterDevice(device: USBDevice): UsbPrinterDevice {
  return {
    connectionType: 'usb',
    vendorId: device.vendorId,
    productId: device.productId,
    productName: device.productName ?? null,
    serialNumber: device.serialNumber ?? null,
  }
}

export class UsbConnection implements PrinterConnection {
  private device: USBDevice | null = null
  private outEndpointNumber: number | null = null

  async pickDevice(): Promise<UsbPrinterDevice> {
    if (!('usb' in navigator)) {
      throw new Error('Trình duyệt không hỗ trợ WebUSB.')
    }
    const device = await navigator.usb.requestDevice({ filters: [] })
    return toUsbPrinterDevice(device)
  }

  async listKnownDevices(): Promise<UsbPrinterDevice[]> {
    if (!('usb' in navigator)) return []
    const devices = await navigator.usb.getDevices()
    return devices.map(toUsbPrinterDevice)
  }

  async connectTo(target: PrinterDevice): Promise<void> {
    if (!isUsbDevice(target)) {
      throw new Error('UsbConnection chỉ nhận thiết bị USB.')
    }
    if (!('usb' in navigator)) {
      throw new Error('Trình duyệt không hỗ trợ WebUSB.')
    }

    const known = await navigator.usb.getDevices()
    const match =
      (target.serialNumber && known.find((d) => d.serialNumber === target.serialNumber)) ||
      known.find((d) => d.vendorId === target.vendorId && d.productId === target.productId)

    const device =
      match ??
      (await navigator.usb.requestDevice({
        filters: [{ vendorId: target.vendorId, productId: target.productId }],
      }))

    await device.open()
    if (!device.configuration) {
      const configurationValue = device.configurations[0]?.configurationValue
      if (configurationValue === undefined) {
        throw new Error('Thiết bị USB không có configuration khả dụng.')
      }
      await device.selectConfiguration(configurationValue)
    }

    const endpoint = findBulkOutEndpoint(device)
    if (!endpoint) {
      throw new Error('Không tìm thấy cổng gửi dữ liệu (OUT endpoint) trên thiết bị USB này.')
    }
    await device.claimInterface(endpoint.interfaceNumber)

    this.device = device
    this.outEndpointNumber = endpoint.endpointNumber
  }

  async disconnect(): Promise<void> {
    if (this.device) {
      await this.device.close()
    }
    this.device = null
    this.outEndpointNumber = null
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.device || this.outEndpointNumber === null) {
      throw new Error('Chưa kết nối máy in USB.')
    }
    for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
      const chunk = data.slice(offset, offset + CHUNK_SIZE)
      const result = await this.device.transferOut(this.outEndpointNumber, chunk)
      if (result.status !== 'ok') {
        throw new Error(`Gửi lệnh in thất bại: ${result.status}`)
      }
    }
  }

  isConnected(): boolean {
    return this.device !== null
  }
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/native/printer-plugin/connections/usb-connection.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json src/native/printer-plugin/connections
git commit -m "feat: add WebUSB connection implementation"
```

---

## Task 8: PrinterManager (TypeScript)

**Files:**
- Create: `src/native/printer-plugin/manager/printer-manager.ts`
- Test: `src/native/printer-plugin/manager/printer-manager.test.ts`

**Interfaces:**
- Consumes: `DriverRegistry`, `ConnectionRegistry` (Task 5); `PrinterDriver`, `PrinterConnection` (Task 4); `PrinterConfig`, `PrinterStatus`, `PrinterConnectionType`, `PrinterDevice` (Task 4); `UsbConnection` (Task 7, only for the `pickDevice()` fallback path).
- Produces: `PrinterManager` with `scan(connectionType): Promise<PrinterDevice[]>`, `connect(config): Promise<PrinterConfig>`, `disconnect(): Promise<void>`, `print(data): Promise<void>`, `testPrint(): Promise<void>`, `getStatus(): PrinterStatus` — consumed by `web.ts` (Task 9).

- [ ] **Step 1: Write the failing tests**

```ts
// src/native/printer-plugin/manager/printer-manager.test.ts
import { describe, it, expect } from 'vitest'
import { PrinterManager } from './printer-manager'
import { DriverRegistry } from '../registry/driver-registry'
import { ConnectionRegistry } from '../registry/connection-registry'
import type { PrinterDriver, PrinterConnection } from '../internal/types'
import type { PrinterConfig, PrinterDevice } from '../definitions'

class FakeDriver implements PrinterDriver {
  buildTestPrintBytes(): Uint8Array {
    return new Uint8Array([0x01, 0x02])
  }
}

class FakeConnection implements PrinterConnection {
  connected = false
  written: Uint8Array | null = null

  async connectTo(_device: PrinterDevice): Promise<void> {
    this.connected = true
  }
  async disconnect(): Promise<void> {
    this.connected = false
  }
  async write(data: Uint8Array): Promise<void> {
    this.written = data
  }
  isConnected(): boolean {
    return this.connected
  }
}

function buildManager() {
  const driverRegistry = new DriverRegistry()
  driverRegistry.register('generic-escpos', () => new FakeDriver())

  const fakeConnection = new FakeConnection()
  const connectionRegistry = new ConnectionRegistry()
  connectionRegistry.register('usb', () => fakeConnection)

  return { manager: new PrinterManager(driverRegistry, connectionRegistry), fakeConnection }
}

const baseConfig: PrinterConfig = {
  driver: 'generic-escpos',
  connectionType: 'usb',
  device: {
    connectionType: 'usb',
    vendorId: 1,
    productId: 2,
    productName: null,
    serialNumber: null,
  },
  autoConnect: false,
}

describe('PrinterManager', () => {
  it('connect() resolves driver + connection and sets status to connected', async () => {
    const { manager, fakeConnection } = buildManager()
    await manager.connect(baseConfig)

    expect(manager.getStatus()).toBe('connected')
    expect(fakeConnection.connected).toBe(true)
  })

  it('testPrint() writes the driver bytes through the connection', async () => {
    const { manager, fakeConnection } = buildManager()
    await manager.connect(baseConfig)
    await manager.testPrint()

    expect(fakeConnection.written).toEqual(new Uint8Array([0x01, 0x02]))
  })

  it('disconnect() resets status to disconnected', async () => {
    const { manager, fakeConnection } = buildManager()
    await manager.connect(baseConfig)
    await manager.disconnect()

    expect(manager.getStatus()).toBe('disconnected')
    expect(fakeConnection.connected).toBe(false)
  })

  it('print() throws when not connected', async () => {
    const { manager } = buildManager()
    await expect(manager.print(new Uint8Array([0x00]))).rejects.toThrow('Chưa kết nối máy in.')
  })

  it('connect() sets status to error and rethrows when the driver is unregistered', async () => {
    const { manager } = buildManager()
    await expect(manager.connect({ ...baseConfig, driver: 'epson' })).rejects.toThrow(
      'Driver "epson" chưa được đăng ký.',
    )
    expect(manager.getStatus()).toBe('error')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/native/printer-plugin/manager/printer-manager.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `PrinterManager`**

```ts
// src/native/printer-plugin/manager/printer-manager.ts
import type { DriverRegistry } from '../registry/driver-registry'
import type { ConnectionRegistry } from '../registry/connection-registry'
import type { PrinterDriver, PrinterConnection } from '../internal/types'
import type { PrinterConfig, PrinterStatus, PrinterConnectionType, PrinterDevice } from '../definitions'
import type { UsbConnection } from '../connections/usb-connection'

export class PrinterManager {
  private currentDriver: PrinterDriver | null = null
  private currentConnection: PrinterConnection | null = null
  private status: PrinterStatus = 'disconnected'

  constructor(
    private readonly driverRegistry: DriverRegistry,
    private readonly connectionRegistry: ConnectionRegistry,
  ) {}

  async scan(connectionType: PrinterConnectionType): Promise<PrinterDevice[]> {
    if (connectionType !== 'usb') return []
    const connection = this.connectionRegistry.resolve('usb') as UsbConnection
    return connection.listKnownDevices()
  }

  async connect(config: PrinterConfig): Promise<PrinterConfig> {
    this.status = 'connecting'
    try {
      const driver = this.driverRegistry.resolve(config.driver)
      const connection = this.connectionRegistry.resolve(config.connectionType)

      let device = config.device
      if (!device) {
        if (config.connectionType !== 'usb') {
          throw new Error(
            `Không thể tự chọn thiết bị cho connection type "${config.connectionType}" trên Web.`,
          )
        }
        device = await (connection as UsbConnection).pickDevice()
      }

      await connection.connectTo(device)

      this.currentDriver = driver
      this.currentConnection = connection
      this.status = 'connected'

      return { ...config, device }
    } catch (error) {
      this.status = 'error'
      throw error
    }
  }

  async disconnect(): Promise<void> {
    await this.currentConnection?.disconnect()
    this.currentConnection = null
    this.currentDriver = null
    this.status = 'disconnected'
  }

  async print(data: Uint8Array): Promise<void> {
    if (!this.currentConnection || this.status !== 'connected') {
      throw new Error('Chưa kết nối máy in.')
    }
    await this.currentConnection.write(data)
  }

  async testPrint(): Promise<void> {
    if (!this.currentDriver) {
      throw new Error('Chưa chọn driver máy in.')
    }
    await this.print(this.currentDriver.buildTestPrintBytes())
  }

  getStatus(): PrinterStatus {
    return this.status
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/native/printer-plugin/manager/printer-manager.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/native/printer-plugin/manager
git commit -m "feat: add PrinterManager orchestration layer"
```

---

## Task 9: Capacitor plugin wiring — `web.ts` and `index.ts`

**Files:**
- Create: `src/native/printer-plugin/web.ts`
- Create: `src/native/printer-plugin/index.ts`
- Test: `src/native/printer-plugin/web.test.ts`

**Interfaces:**
- Consumes: `PrinterPlugin` interface (Task 4); `DriverRegistry`, `ConnectionRegistry` (Task 5); `GenericEscPosDriver` (Task 6); `UsbConnection` (Task 7); `PrinterManager` (Task 8).
- Produces: `PrinterWeb` class (the `web` implementation registered by Capacitor); `Printer` (the registered plugin proxy) — consumed by `printer.store.ts` in Task 10.

- [ ] **Step 1: Write the failing test for config persistence (the only pure-logic part of this file — `localStorage` is real and available under jsdom, so this is genuinely testable)**

```ts
// src/native/printer-plugin/web.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { PrinterWeb } from './web'
import type { PrinterConfig } from './definitions'

describe('PrinterWeb config persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loadConfig() returns null when nothing has been saved', async () => {
    const plugin = new PrinterWeb()
    const { config } = await plugin.loadConfig()
    expect(config).toBeNull()
  })

  it('saveConfig() then loadConfig() round-trips the config', async () => {
    const plugin = new PrinterWeb()
    const config: PrinterConfig = {
      driver: 'generic-escpos',
      connectionType: 'usb',
      device: null,
      autoConnect: true,
    }

    await plugin.saveConfig({ config })
    const { config: loaded } = await plugin.loadConfig()

    expect(loaded).toEqual(config)
  })

  it('getStatus() starts as disconnected', async () => {
    const plugin = new PrinterWeb()
    const { status } = await plugin.getStatus()
    expect(status).toBe('disconnected')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/native/printer-plugin/web.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `web.ts`**

```ts
// src/native/printer-plugin/web.ts
import { WebPlugin } from '@capacitor/core'
import type {
  PrinterPlugin as PrinterPluginInterface,
  PrinterConfig,
  PrinterConnectionType,
} from './definitions'
import { DriverRegistry } from './registry/driver-registry'
import { ConnectionRegistry } from './registry/connection-registry'
import { GenericEscPosDriver } from './drivers/generic-escpos.driver'
import { UsbConnection } from './connections/usb-connection'
import { PrinterManager } from './manager/printer-manager'

const STORAGE_KEY = 'ndtcore_pos_printer_config'

const driverRegistry = new DriverRegistry()
driverRegistry.register('generic-escpos', () => new GenericEscPosDriver())

const connectionRegistry = new ConnectionRegistry()
connectionRegistry.register('usb', () => new UsbConnection())

const manager = new PrinterManager(driverRegistry, connectionRegistry)

export class PrinterWeb extends WebPlugin implements PrinterPluginInterface {
  async scanPrinters(options: { connectionType: PrinterConnectionType }) {
    const devices = await manager.scan(options.connectionType)
    return { devices }
  }

  async connect(options: { config: PrinterConfig }) {
    const config = await manager.connect(options.config)
    return { config }
  }

  async disconnect() {
    await manager.disconnect()
  }

  async print(options: { data: number[] }) {
    await manager.print(new Uint8Array(options.data))
  }

  async testPrint() {
    await manager.testPrint()
  }

  async getStatus() {
    return { status: manager.getStatus() }
  }

  async saveConfig(options: { config: PrinterConfig }) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options.config))
  }

  async loadConfig() {
    const raw = localStorage.getItem(STORAGE_KEY)
    return { config: raw ? (JSON.parse(raw) as PrinterConfig) : null }
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/native/printer-plugin/web.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Create `index.ts` (no test — pure Capacitor registration wiring)**

```ts
// src/native/printer-plugin/index.ts
import { registerPlugin } from '@capacitor/core'
import type { PrinterPlugin } from './definitions'

export const Printer = registerPlugin<PrinterPlugin>('Printer', {
  web: () => import('./web').then((m) => new m.PrinterWeb()),
})

export * from './definitions'
```

- [ ] **Step 6: Verify the whole project still type-checks**

Run: `npm run type-check`
Expected: exit code 0.

- [ ] **Step 7: Commit**

```bash
git add src/native/printer-plugin/web.ts src/native/printer-plugin/index.ts src/native/printer-plugin/web.test.ts
git commit -m "feat: wire up the web implementation of the Printer Capacitor plugin"
```

---

## Task 10: Pinia store and composable

**Files:**
- Create: `src/modules/printer/stores/printer.store.ts`
- Create: `src/modules/printer/composables/usePrinter.ts`
- Test: `src/modules/printer/stores/printer.store.test.ts`

**Interfaces:**
- Consumes: `Printer` (Task 9); `PrinterConfig`, `PrinterStatus`, `PrinterDevice`, `PrinterConnectionType` (Task 4).
- Produces: `usePrinterStore()` (state: `status`, `config`, `knownDevices`; actions: `loadConfig`, `scan`, `connect`, `disconnect`, `testPrint`) — consumed by every view in Tasks 11–13; `usePrinter()` composable — thin wrapper exposing the store to components.

- [ ] **Step 1: Write the failing tests**

```ts
// src/modules/printer/stores/printer.store.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/native/printer-plugin', () => ({
  Printer: {
    loadConfig: vi.fn(),
    scanPrinters: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    testPrint: vi.fn(),
    saveConfig: vi.fn(),
  },
}))

import { Printer } from '@/native/printer-plugin'
import { usePrinterStore } from './printer.store'
import type { PrinterConfig } from '@/native/printer-plugin/definitions'

const baseConfig: PrinterConfig = {
  driver: 'generic-escpos',
  connectionType: 'usb',
  device: null,
  autoConnect: false,
}

describe('usePrinterStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  it('connect() sets status to connected and persists the resolved config', async () => {
    const store = usePrinterStore()
    vi.mocked(Printer.connect).mockResolvedValue({ config: baseConfig })

    await store.connect(baseConfig)

    expect(store.status).toBe('connected')
    expect(store.config).toEqual(baseConfig)
    expect(Printer.saveConfig).toHaveBeenCalledWith({ config: baseConfig })
  })

  it('connect() sets status to error and rethrows when the plugin call rejects', async () => {
    const store = usePrinterStore()
    vi.mocked(Printer.connect).mockRejectedValue(new Error('boom'))

    await expect(store.connect(baseConfig)).rejects.toThrow('boom')
    expect(store.status).toBe('error')
  })

  it('scan() stores the returned devices', async () => {
    const store = usePrinterStore()
    const devices = [
      { connectionType: 'usb' as const, vendorId: 1, productId: 2, productName: null, serialNumber: null },
    ]
    vi.mocked(Printer.scanPrinters).mockResolvedValue({ devices })

    const result = await store.scan('usb')

    expect(result).toEqual(devices)
    expect(store.knownDevices).toEqual(devices)
  })

  it('disconnect() sets status back to disconnected', async () => {
    const store = usePrinterStore()
    store.status = 'connected'
    vi.mocked(Printer.disconnect).mockResolvedValue(undefined)

    await store.disconnect()

    expect(store.status).toBe('disconnected')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modules/printer/stores/printer.store.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `printer.store.ts`**

```ts
// src/modules/printer/stores/printer.store.ts
import { defineStore } from 'pinia'
import { Printer } from '@/native/printer-plugin'
import type {
  PrinterConfig,
  PrinterStatus,
  PrinterDevice,
  PrinterConnectionType,
} from '@/native/printer-plugin/definitions'

export const usePrinterStore = defineStore('printer', {
  state: () => ({
    status: 'disconnected' as PrinterStatus,
    config: null as PrinterConfig | null,
    knownDevices: [] as PrinterDevice[],
  }),
  actions: {
    async loadConfig(): Promise<void> {
      const { config } = await Printer.loadConfig()
      this.config = config
    },

    async scan(connectionType: PrinterConnectionType): Promise<PrinterDevice[]> {
      const { devices } = await Printer.scanPrinters({ connectionType })
      this.knownDevices = devices
      return devices
    },

    async connect(config: PrinterConfig): Promise<void> {
      this.status = 'connecting'
      try {
        const result = await Printer.connect({ config })
        this.config = result.config
        this.status = 'connected'
        await Printer.saveConfig({ config: result.config })
      } catch (error) {
        this.status = 'error'
        throw error
      }
    },

    async disconnect(): Promise<void> {
      await Printer.disconnect()
      this.status = 'disconnected'
    },

    async testPrint(): Promise<void> {
      await Printer.testPrint()
    },
  },
})
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/modules/printer/stores/printer.store.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Create the composable (no dedicated test — thin pass-through, exercised indirectly via component tests in Tasks 11–13)**

```ts
// src/modules/printer/composables/usePrinter.ts
import { storeToRefs } from 'pinia'
import { usePrinterStore } from '../stores/printer.store'

export function usePrinter() {
  const store = usePrinterStore()
  const { status, config, knownDevices } = storeToRefs(store)

  return {
    status,
    config,
    knownDevices,
    loadConfig: store.loadConfig,
    scan: store.scan,
    connect: store.connect,
    disconnect: store.disconnect,
    testPrint: store.testPrint,
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add src/modules/printer/stores src/modules/printer/composables
git commit -m "feat: add printer Pinia store and usePrinter composable"
```

---

## Task 11: `ConnectionStatusChip.vue` component

**Files:**
- Create: `src/modules/printer/components/ConnectionStatusChip.vue`
- Test: `src/modules/printer/components/ConnectionStatusChip.test.ts`

**Interfaces:**
- Consumes: `PrinterStatus` (Task 4); `mountWithVuetify` (Task 2).
- Produces: `<ConnectionStatusChip :status="..." />` — consumed by `PrinterSettingsView.vue` (Task 13).

- [ ] **Step 1: Write the failing test**

```ts
// src/modules/printer/components/ConnectionStatusChip.test.ts
import { describe, it, expect } from 'vitest'
import { mountWithVuetify } from '@/test/mount-with-vuetify'
import ConnectionStatusChip from './ConnectionStatusChip.vue'

describe('ConnectionStatusChip', () => {
  it('renders "Connected" when status is connected', () => {
    const wrapper = mountWithVuetify(ConnectionStatusChip, { props: { status: 'connected' } })
    expect(wrapper.text()).toContain('Connected')
  })

  it('renders "Disconnected" when status is disconnected', () => {
    const wrapper = mountWithVuetify(ConnectionStatusChip, { props: { status: 'disconnected' } })
    expect(wrapper.text()).toContain('Disconnected')
  })

  it('renders "Error" when status is error', () => {
    const wrapper = mountWithVuetify(ConnectionStatusChip, { props: { status: 'error' } })
    expect(wrapper.text()).toContain('Error')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modules/printer/components/ConnectionStatusChip.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```vue
<!-- src/modules/printer/components/ConnectionStatusChip.vue -->
<template>
  <v-chip :color="color">{{ label }}</v-chip>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PrinterStatus } from '@/native/printer-plugin/definitions'

const props = defineProps<{ status: PrinterStatus }>()

const color = computed(() => {
  switch (props.status) {
    case 'connected':
      return 'success'
    case 'connecting':
      return 'warning'
    case 'error':
      return 'error'
    default:
      return 'grey'
  }
})

const label = computed(() => {
  switch (props.status) {
    case 'connected':
      return 'Connected'
    case 'connecting':
      return 'Connecting'
    case 'error':
      return 'Error'
    default:
      return 'Disconnected'
  }
})
</script>
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/modules/printer/components/ConnectionStatusChip.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/printer/components/ConnectionStatusChip.vue src/modules/printer/components/ConnectionStatusChip.test.ts
git commit -m "feat: add ConnectionStatusChip component"
```

---

## Task 12: `PrinterDeviceList.vue` component (scan + pick a device)

**Files:**
- Create: `src/modules/printer/components/PrinterDeviceList.vue`
- Test: `src/modules/printer/components/PrinterDeviceList.test.ts`

**Interfaces:**
- Consumes: `PrinterDevice` (Task 4); `mountWithVuetify` (Task 2).
- Produces: `<PrinterDeviceList :devices="..." @select="(device) => ..." @scan="..." />` — emits `scan` (no payload) and `select` (payload: `PrinterDevice`) — consumed by `PrinterSettingsView.vue` (Task 13).

- [ ] **Step 1: Write the failing test**

```ts
// src/modules/printer/components/PrinterDeviceList.test.ts
import { describe, it, expect } from 'vitest'
import { mountWithVuetify } from '@/test/mount-with-vuetify'
import PrinterDeviceList from './PrinterDeviceList.vue'
import type { PrinterDevice } from '@/native/printer-plugin/definitions'

const devices: PrinterDevice[] = [
  { connectionType: 'usb', vendorId: 1155, productId: 22339, productName: 'XP-Q80I', serialNumber: null },
]

describe('PrinterDeviceList', () => {
  it('renders one row per known device', () => {
    const wrapper = mountWithVuetify(PrinterDeviceList, { props: { devices } })
    expect(wrapper.text()).toContain('XP-Q80I')
  })

  it('shows a fallback label when productName is null', () => {
    const wrapper = mountWithVuetify(PrinterDeviceList, {
      props: { devices: [{ ...devices[0], productName: null }] },
    })
    expect(wrapper.text()).toContain('Unknown USB Printer')
  })

  it('emits "select" with the chosen device when a row is clicked', async () => {
    const wrapper = mountWithVuetify(PrinterDeviceList, { props: { devices } })
    await wrapper.find('[data-test="device-row-0"]').trigger('click')

    expect(wrapper.emitted('select')?.[0]).toEqual([devices[0]])
  })

  it('emits "scan" when the scan button is clicked', async () => {
    const wrapper = mountWithVuetify(PrinterDeviceList, { props: { devices: [] } })
    await wrapper.find('[data-test="scan-button"]').trigger('click')

    expect(wrapper.emitted('scan')).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modules/printer/components/PrinterDeviceList.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the component**

```vue
<!-- src/modules/printer/components/PrinterDeviceList.vue -->
<template>
  <div>
    <v-btn data-test="scan-button" variant="tonal" @click="emit('scan')">Scan</v-btn>
    <v-list>
      <v-list-item
        v-for="(device, index) in props.devices"
        :key="deviceKey(device)"
        :data-test="`device-row-${index}`"
        :title="deviceLabel(device)"
        @click="emit('select', device)"
      />
    </v-list>
  </div>
</template>

<script setup lang="ts">
import type { PrinterDevice } from '@/native/printer-plugin/definitions'

const props = defineProps<{ devices: PrinterDevice[] }>()
const emit = defineEmits<{ scan: []; select: [device: PrinterDevice] }>()

function deviceLabel(device: PrinterDevice): string {
  if (device.connectionType === 'usb') {
    return device.productName ?? 'Unknown USB Printer'
  }
  return `${device.ip}:${device.port}`
}

function deviceKey(device: PrinterDevice): string {
  if (device.connectionType === 'usb') {
    return `usb-${device.vendorId}-${device.productId}-${device.serialNumber ?? ''}`
  }
  return `lan-${device.ip}-${device.port}`
}
</script>
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/modules/printer/components/PrinterDeviceList.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/modules/printer/components/PrinterDeviceList.vue src/modules/printer/components/PrinterDeviceList.test.ts
git commit -m "feat: add PrinterDeviceList component"
```

---

## Task 13: `PrinterSettingsView.vue` page

**Files:**
- Create: `src/modules/printer/views/PrinterSettingsView.vue`
- Test: `src/modules/printer/views/PrinterSettingsView.test.ts`

**Interfaces:**
- Consumes: `usePrinter()` (Task 10); `ConnectionStatusChip` (Task 11); `PrinterDeviceList` (Task 12); `PrinterConnectionType`, `PrinterDriverType` (Task 4).
- Produces: the page mounted at route `/printer-settings` (Task 2).

Per the design spec, Web only supports `connectionType: 'usb'` and `driver: 'generic-escpos'` in Phase 1 — the select options below are exhaustive on purpose, not a placeholder omission.

- [ ] **Step 1: Write the failing test**

```ts
// src/modules/printer/views/PrinterSettingsView.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestingPinia } from '@pinia/testing'
import { mountWithVuetify } from '@/test/mount-with-vuetify'
import PrinterSettingsView from './PrinterSettingsView.vue'
import { usePrinterStore } from '../stores/printer.store'

describe('PrinterSettingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('disables "Print Test Bill" when not connected', () => {
    const wrapper = mountWithVuetify(PrinterSettingsView, {
      global: { plugins: [createTestingPinia({ createSpy: vi.fn })] },
    })
    const button = wrapper.find('[data-test="test-print-button"]')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('calls store.connect() with the selected driver/connectionType when Connect is clicked', async () => {
    const wrapper = mountWithVuetify(PrinterSettingsView, {
      global: { plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: true })] },
    })
    const store = usePrinterStore()

    await wrapper.find('[data-test="connect-button"]').trigger('click')

    expect(store.connect).toHaveBeenCalledWith({
      driver: 'generic-escpos',
      connectionType: 'usb',
      device: null,
      autoConnect: false,
    })
  })

  it('calls store.testPrint() when "Print Test Bill" is clicked while connected', async () => {
    const wrapper = mountWithVuetify(PrinterSettingsView, {
      global: {
        plugins: [
          createTestingPinia({
            createSpy: vi.fn,
            stubActions: true,
            initialState: { printer: { status: 'connected', config: null, knownDevices: [] } },
          }),
        ],
      },
    })
    const store = usePrinterStore()

    await wrapper.find('[data-test="test-print-button"]').trigger('click')

    expect(store.testPrint).toHaveBeenCalled()
  })

  it('shows the error message in a snackbar when connect() rejects', async () => {
    const wrapper = mountWithVuetify(PrinterSettingsView, {
      global: { plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: true })] },
    })
    const store = usePrinterStore()
    vi.mocked(store.connect).mockRejectedValue(new Error('Chưa kết nối máy in USB.'))

    await wrapper.find('[data-test="connect-button"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Chưa kết nối máy in USB.')
  })
})
```

Add `@pinia/testing` as a dev dependency before running this: `npm install -D @pinia/testing`.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modules/printer/views/PrinterSettingsView.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the view**

```vue
<!-- src/modules/printer/views/PrinterSettingsView.vue -->
<template>
  <v-container>
    <v-card>
      <v-card-title>Cấu hình máy in</v-card-title>
      <v-card-text>
        <v-select
          v-model="connectionType"
          label="Connection Type"
          :items="[{ title: 'USB', value: 'usb' }]"
          item-title="title"
          item-value="value"
        />
        <v-select
          v-model="driver"
          label="Driver"
          :items="[{ title: 'Generic ESC/POS', value: 'generic-escpos' }]"
          item-title="title"
          item-value="value"
        />
        <v-switch v-model="autoConnect" label="Auto Connect" />

        <PrinterDeviceList :devices="knownDevices" @scan="onScan" @select="onSelectDevice" />

        <ConnectionStatusChip :status="status" />
      </v-card-text>
      <v-card-actions>
        <v-btn
          data-test="connect-button"
          color="primary"
          :loading="status === 'connecting'"
          @click="onConnect"
        >
          Connect
        </v-btn>
        <v-btn
          data-test="test-print-button"
          :disabled="status !== 'connected'"
          @click="onTestPrint"
        >
          Print Test Bill
        </v-btn>
      </v-card-actions>
    </v-card>

    <v-snackbar v-model="showError" color="error" data-test="error-snackbar">
      {{ errorMessage }}
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { usePrinter } from '../composables/usePrinter'
import ConnectionStatusChip from '../components/ConnectionStatusChip.vue'
import PrinterDeviceList from '../components/PrinterDeviceList.vue'
import type {
  PrinterConnectionType,
  PrinterDriverType,
  PrinterDevice,
} from '@/native/printer-plugin/definitions'

const { status, knownDevices, connect, scan, testPrint } = usePrinter()

const connectionType = ref<PrinterConnectionType>('usb')
const driver = ref<PrinterDriverType>('generic-escpos')
const autoConnect = ref(false)
const selectedDevice = ref<PrinterDevice | null>(null)
const showError = ref(false)
const errorMessage = ref('')

function showErrorMessage(error: unknown) {
  errorMessage.value = error instanceof Error ? error.message : 'Đã có lỗi xảy ra.'
  showError.value = true
}

async function onScan() {
  try {
    await scan(connectionType.value)
  } catch (error) {
    showErrorMessage(error)
  }
}

function onSelectDevice(device: PrinterDevice) {
  selectedDevice.value = device
}

async function onConnect() {
  try {
    await connect({
      driver: driver.value,
      connectionType: connectionType.value,
      device: selectedDevice.value,
      autoConnect: autoConnect.value,
    })
  } catch (error) {
    showErrorMessage(error)
  }
}

async function onTestPrint() {
  try {
    await testPrint()
  } catch (error) {
    showErrorMessage(error)
  }
}
</script>
```

Errors are caught at the component boundary and surfaced via the snackbar, never thrown past this view — matching the "no throw ra ngoài component" rule from the design spec §8.

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/modules/printer/views/PrinterSettingsView.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Run the full test suite and type-check**

Run: `npm run test:unit -- --run`
Expected: all tests across every task so far pass.

Run: `npm run type-check`
Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/modules/printer/views
git commit -m "feat: add PrinterSettingsView page"
```

---

## Task 14: Auto-connect on app startup

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `usePrinterStore` (Task 10).

- [ ] **Step 1: Update `src/main.ts` to load config and auto-connect before mounting**

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { vuetify } from './plugins/vuetify'
import { usePrinterStore } from './modules/printer/stores/printer.store'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(vuetify)

async function bootstrap() {
  const printerStore = usePrinterStore()
  await printerStore.loadConfig()

  if (printerStore.config?.autoConnect) {
    try {
      await printerStore.connect(printerStore.config)
    } catch {
      // Auto-connect failure must not block app startup — user can retry manually
      // from Printer Settings; status is already 'error' via the store action.
    }
  }

  app.mount('#app')
}

bootstrap()
```

- [ ] **Step 2: Verify manually**

Run: `npm run dev`, open the app, confirm it mounts normally with no saved config (no auto-connect attempt, no console error).

- [ ] **Step 3: Verify type-check still passes**

Run: `npm run type-check`
Expected: exit code 0.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts
git commit -m "feat: auto-connect to saved printer config on startup"
```

---

## Task 15: Android project skeleton for the printer plugin

**Files:**
- Create: `android/app/src/main/java/com/ndtcore/pos/printer/connection/ConnectionTarget.kt`
- Create: `android/app/src/main/java/com/ndtcore/pos/printer/connection/PrinterConnection.kt`
- Create: `android/app/src/main/java/com/ndtcore/pos/printer/driver/PrinterDriver.kt`
- Create: `android/app/build.gradle` test dependencies (modify existing)

**Interfaces:**
- Produces: `ConnectionTarget` (sealed class: `Usb(vendorId, productId)`, `Lan(ip, port)`), `PrinterConnection` interface (`connect(target)`, `disconnect()`, `write(data)`, `isConnected()`), `PrinterDriver` interface (`buildTestPrintBytes(): ByteArray`) — consumed by every Android task from here on.

- [ ] **Step 1: Add JUnit4 test dependency to `android/app/build.gradle`**

Confirm `android/app/build.gradle`'s `dependencies` block includes (Capacitor's template usually already has `testImplementation "junit:junit:4.13.2"` — add it if missing):

```groovy
dependencies {
    testImplementation "junit:junit:4.13.2"
}
```

- [ ] **Step 2: Create `ConnectionTarget.kt`**

```kotlin
// android/app/src/main/java/com/ndtcore/pos/printer/connection/ConnectionTarget.kt
package com.ndtcore.pos.printer.connection

sealed class ConnectionTarget {
    data class Usb(val vendorId: Int, val productId: Int) : ConnectionTarget()
    data class Lan(val ip: String, val port: Int) : ConnectionTarget()
}
```

- [ ] **Step 3: Create `PrinterConnection.kt`**

```kotlin
// android/app/src/main/java/com/ndtcore/pos/printer/connection/PrinterConnection.kt
package com.ndtcore.pos.printer.connection

interface PrinterConnection {
    fun connect(target: ConnectionTarget)
    fun disconnect()
    fun write(data: ByteArray)
    fun isConnected(): Boolean
}
```

- [ ] **Step 4: Create `PrinterDriver.kt`**

```kotlin
// android/app/src/main/java/com/ndtcore/pos/printer/driver/PrinterDriver.kt
package com.ndtcore.pos.printer.driver

interface PrinterDriver {
    fun buildTestPrintBytes(): ByteArray
}
```

- [ ] **Step 5: Verify the Android project still builds**

Run: `cd android && ./gradlew compileDebugKotlin` (Windows: `android\gradlew.bat compileDebugKotlin`)
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 6: Commit**

```bash
git add android/app/build.gradle android/app/src/main/java/com/ndtcore/pos/printer
git commit -m "feat(android): add printer plugin interfaces skeleton"
```

---

## Task 16: DriverRegistry and ConnectionRegistry (Kotlin)

**Files:**
- Create: `android/app/src/main/java/com/ndtcore/pos/printer/registry/DriverRegistry.kt`
- Create: `android/app/src/main/java/com/ndtcore/pos/printer/registry/ConnectionRegistry.kt`
- Test: `android/app/src/test/java/com/ndtcore/pos/printer/registry/DriverRegistryTest.kt`
- Test: `android/app/src/test/java/com/ndtcore/pos/printer/registry/ConnectionRegistryTest.kt`

**Interfaces:**
- Consumes: `PrinterDriver`, `PrinterConnection` (Task 15).
- Produces: `DriverRegistry` (`.register(type, factory)`, `.resolve(type): PrinterDriver`), `ConnectionRegistry` (same shape for `PrinterConnection`) — consumed by `PrinterManager` (Task 19) and `PrinterPlugin` (Task 21).

- [ ] **Step 1: Write the failing test for `DriverRegistry`**

```kotlin
// android/app/src/test/java/com/ndtcore/pos/printer/registry/DriverRegistryTest.kt
package com.ndtcore.pos.printer.registry

import com.ndtcore.pos.printer.driver.PrinterDriver
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test

private class FakeDriver : PrinterDriver {
    override fun buildTestPrintBytes(): ByteArray = byteArrayOf(0x01)
}

class DriverRegistryTest {
    @Test
    fun `resolve returns a registered driver`() {
        val registry = DriverRegistry()
        registry.register("generic-escpos") { FakeDriver() }

        assertTrue(registry.resolve("generic-escpos") is FakeDriver)
    }

    @Test
    fun `resolve throws a clear error when the type is not registered`() {
        val registry = DriverRegistry()
        val error = assertThrows(IllegalArgumentException::class.java) { registry.resolve("epson") }
        assertTrue(error.message!!.contains("epson"))
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd android && ./gradlew testDebugUnitTest --tests "com.ndtcore.pos.printer.registry.DriverRegistryTest"`
Expected: FAIL — `DriverRegistry` unresolved reference.

- [ ] **Step 3: Implement `DriverRegistry.kt`**

```kotlin
// android/app/src/main/java/com/ndtcore/pos/printer/registry/DriverRegistry.kt
package com.ndtcore.pos.printer.registry

import com.ndtcore.pos.printer.driver.PrinterDriver

class DriverRegistry {
    private val factories = mutableMapOf<String, () -> PrinterDriver>()

    fun register(type: String, factory: () -> PrinterDriver) {
        factories[type] = factory
    }

    fun resolve(type: String): PrinterDriver {
        val factory = factories[type]
            ?: throw IllegalArgumentException("Driver \"$type\" chưa được đăng ký.")
        return factory()
    }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd android && ./gradlew testDebugUnitTest --tests "com.ndtcore.pos.printer.registry.DriverRegistryTest"`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the failing test for `ConnectionRegistry`**

```kotlin
// android/app/src/test/java/com/ndtcore/pos/printer/registry/ConnectionRegistryTest.kt
package com.ndtcore.pos.printer.registry

import com.ndtcore.pos.printer.connection.ConnectionTarget
import com.ndtcore.pos.printer.connection.PrinterConnection
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

private class FakeConnection : PrinterConnection {
    override fun connect(target: ConnectionTarget) {}
    override fun disconnect() {}
    override fun write(data: ByteArray) {}
    override fun isConnected(): Boolean = false
}

class ConnectionRegistryTest {
    @Test
    fun `resolve returns a registered connection`() {
        val registry = ConnectionRegistry()
        registry.register("usb") { FakeConnection() }

        assertTrue(registry.resolve("usb") is FakeConnection)
    }

    @Test
    fun `resolve throws a clear error when the type is not registered`() {
        val registry = ConnectionRegistry()
        val error = assertThrows(IllegalArgumentException::class.java) { registry.resolve("lan") }
        assertTrue(error.message!!.contains("lan"))
    }
}
```

- [ ] **Step 6: Run it to verify it fails**

Run: `cd android && ./gradlew testDebugUnitTest --tests "com.ndtcore.pos.printer.registry.ConnectionRegistryTest"`
Expected: FAIL — `ConnectionRegistry` unresolved reference.

- [ ] **Step 7: Implement `ConnectionRegistry.kt`**

```kotlin
// android/app/src/main/java/com/ndtcore/pos/printer/registry/ConnectionRegistry.kt
package com.ndtcore.pos.printer.registry

import com.ndtcore.pos.printer.connection.PrinterConnection

class ConnectionRegistry {
    private val factories = mutableMapOf<String, () -> PrinterConnection>()

    fun register(type: String, factory: () -> PrinterConnection) {
        factories[type] = factory
    }

    fun resolve(type: String): PrinterConnection {
        val factory = factories[type]
            ?: throw IllegalArgumentException("Connection \"$type\" chưa được đăng ký.")
        return factory()
    }
}
```

- [ ] **Step 8: Run both test files to verify they pass**

Run: `cd android && ./gradlew testDebugUnitTest --tests "com.ndtcore.pos.printer.registry.*"`
Expected: PASS (4 tests total).

- [ ] **Step 9: Commit**

```bash
git add android/app/src/main/java/com/ndtcore/pos/printer/registry android/app/src/test/java/com/ndtcore/pos/printer/registry
git commit -m "feat(android): add driver and connection registries"
```

---

## Task 17: GenericEscPosDriver (Kotlin, Android)

**Files:**
- Create: `android/app/src/main/java/com/ndtcore/pos/printer/driver/GenericEscPosDriver.kt`
- Test: `android/app/src/test/java/com/ndtcore/pos/printer/driver/GenericEscPosDriverTest.kt`

**Interfaces:**
- Consumes: `PrinterDriver` (Task 15).
- Produces: `GenericEscPosDriver` — registered under key `"generic-escpos"` in Task 21.

- [ ] **Step 1: Write the failing test**

```kotlin
// android/app/src/test/java/com/ndtcore/pos/printer/driver/GenericEscPosDriverTest.kt
package com.ndtcore.pos.printer.driver

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GenericEscPosDriverTest {
    @Test
    fun `buildTestPrintBytes starts with ESC init command`() {
        val bytes = GenericEscPosDriver().buildTestPrintBytes()
        assertArrayEquals(byteArrayOf(0x1B, 0x40), bytes.copyOfRange(0, 2))
    }

    @Test
    fun `buildTestPrintBytes ends with full cut command`() {
        val bytes = GenericEscPosDriver().buildTestPrintBytes()
        assertArrayEquals(byteArrayOf(0x1D, 0x56, 0x00), bytes.copyOfRange(bytes.size - 3, bytes.size))
    }

    @Test
    fun `buildTestPrintBytes contains the sample bill text`() {
        val text = String(GenericEscPosDriver().buildTestPrintBytes(), Charsets.US_ASCII)
        assertTrue(text.contains("NDT Bubble Tea"))
        assertTrue(text.contains("TOTAL"))
        assertTrue(text.contains("Thank You"))
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd android && ./gradlew testDebugUnitTest --tests "com.ndtcore.pos.printer.driver.GenericEscPosDriverTest"`
Expected: FAIL — `GenericEscPosDriver` unresolved reference.

- [ ] **Step 3: Implement `GenericEscPosDriver.kt`**

```kotlin
// android/app/src/main/java/com/ndtcore/pos/printer/driver/GenericEscPosDriver.kt
package com.ndtcore.pos.printer.driver

import java.io.ByteArrayOutputStream

class GenericEscPosDriver : PrinterDriver {
    override fun buildTestPrintBytes(): ByteArray {
        val lines = listOf(
            "NDT Bubble Tea",
            "",
            "Order #1001",
            "Classic Milk Tea",
            "Pearl",
            "Sugar 100%",
            "Ice Normal",
            "-------------------------",
            "TOTAL",
            "\$8.50",
            "",
            "Thank You",
            "",
            "",
            "",
        )

        val output = ByteArrayOutputStream()
        output.write(byteArrayOf(0x1B, 0x40)) // ESC @ — initialize
        for (line in lines) {
            output.write(line.toByteArray(Charsets.US_ASCII))
            output.write(0x0A)
        }
        output.write(byteArrayOf(0x1D, 0x56, 0x00)) // GS V 0 — full cut

        return output.toByteArray()
    }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd android && ./gradlew testDebugUnitTest --tests "com.ndtcore.pos.printer.driver.GenericEscPosDriverTest"`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/ndtcore/pos/printer/driver/GenericEscPosDriver.kt android/app/src/test/java/com/ndtcore/pos/printer/driver/GenericEscPosDriverTest.kt
git commit -m "feat(android): add GenericEscPosDriver"
```

---

## Task 18: LanConnection (Kotlin, real TCP socket)

**Files:**
- Create: `android/app/src/main/java/com/ndtcore/pos/printer/connection/LanConnection.kt`
- Test: `android/app/src/test/java/com/ndtcore/pos/printer/connection/LanConnectionTest.kt`

**Interfaces:**
- Consumes: `PrinterConnection`, `ConnectionTarget` (Task 15).
- Produces: `LanConnection` — registered under key `"lan"` in Task 21.

This class is pure `java.net.Socket` usage with no Android framework dependency, so it's a genuine local JVM unit test against a real `ServerSocket` — no emulator, no Robolectric needed.

- [ ] **Step 1: Write the failing test**

```kotlin
// android/app/src/test/java/com/ndtcore/pos/printer/connection/LanConnectionTest.kt
package com.ndtcore.pos.printer.connection

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.ServerSocket
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit

class LanConnectionTest {
    @Test
    fun `connect and write sends bytes to the target socket`() {
        val serverSocket = ServerSocket(0)
        val receivedBytes = CompletableFuture<ByteArray>()

        val serverThread = Thread {
            val clientSocket = serverSocket.accept()
            val buffer = ByteArray(4)
            val readCount = clientSocket.getInputStream().read(buffer)
            receivedBytes.complete(buffer.copyOfRange(0, readCount))
            clientSocket.close()
        }
        serverThread.start()

        val connection = LanConnection()
        connection.connect(ConnectionTarget.Lan("127.0.0.1", serverSocket.localPort))
        assertTrue(connection.isConnected())

        connection.write(byteArrayOf(0x1B, 0x40, 0x0A, 0x0A))
        connection.disconnect()

        assertArrayEquals(byteArrayOf(0x1B, 0x40, 0x0A, 0x0A), receivedBytes.get(2, TimeUnit.SECONDS))
        serverThread.join(2000)
        serverSocket.close()
    }

    @Test
    fun `write throws when not connected`() {
        val connection = LanConnection()
        val error = org.junit.Assert.assertThrows(IllegalStateException::class.java) {
            connection.write(byteArrayOf(0x00))
        }
        assertTrue(error.message!!.contains("Chưa kết nối"))
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd android && ./gradlew testDebugUnitTest --tests "com.ndtcore.pos.printer.connection.LanConnectionTest"`
Expected: FAIL — `LanConnection` unresolved reference.

- [ ] **Step 3: Implement `LanConnection.kt`**

```kotlin
// android/app/src/main/java/com/ndtcore/pos/printer/connection/LanConnection.kt
package com.ndtcore.pos.printer.connection

import java.io.OutputStream
import java.net.Socket

class LanConnection : PrinterConnection {
    private var socket: Socket? = null
    private var outputStream: OutputStream? = null

    override fun connect(target: ConnectionTarget) {
        require(target is ConnectionTarget.Lan) { "LanConnection chỉ nhận ConnectionTarget.Lan." }
        val newSocket = Socket(target.ip, target.port)
        socket = newSocket
        outputStream = newSocket.getOutputStream()
    }

    override fun disconnect() {
        socket?.close()
        socket = null
        outputStream = null
    }

    override fun write(data: ByteArray) {
        val stream = outputStream ?: throw IllegalStateException("Chưa kết nối máy in qua LAN.")
        stream.write(data)
        stream.flush()
    }

    override fun isConnected(): Boolean = socket?.isConnected == true
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd android && ./gradlew testDebugUnitTest --tests "com.ndtcore.pos.printer.connection.LanConnectionTest"`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/ndtcore/pos/printer/connection/LanConnection.kt android/app/src/test/java/com/ndtcore/pos/printer/connection/LanConnectionTest.kt
git commit -m "feat(android): add LAN (TCP socket) connection"
```

---

## Task 19: PrinterManager (Kotlin)

**Files:**
- Create: `android/app/src/main/java/com/ndtcore/pos/printer/manager/PrinterManager.kt`
- Test: `android/app/src/test/java/com/ndtcore/pos/printer/manager/PrinterManagerTest.kt`

**Interfaces:**
- Consumes: `DriverRegistry`, `ConnectionRegistry` (Task 16); `PrinterDriver`, `PrinterConnection`, `ConnectionTarget` (Task 15).
- Produces: `PrinterManager` (`connect(driverType, connectionType, target)`, `disconnect()`, `print(data)`, `testPrint()`, `status: PrinterStatus`), `PrinterStatus` enum — consumed by `PrinterPlugin.kt` (Task 21).

- [ ] **Step 1: Write the failing tests**

```kotlin
// android/app/src/test/java/com/ndtcore/pos/printer/manager/PrinterManagerTest.kt
package com.ndtcore.pos.printer.manager

import com.ndtcore.pos.printer.connection.ConnectionTarget
import com.ndtcore.pos.printer.connection.PrinterConnection
import com.ndtcore.pos.printer.driver.PrinterDriver
import com.ndtcore.pos.printer.registry.ConnectionRegistry
import com.ndtcore.pos.printer.registry.DriverRegistry
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

private class FakeDriver : PrinterDriver {
    override fun buildTestPrintBytes(): ByteArray = byteArrayOf(0x01, 0x02)
}

private class FakeConnection : PrinterConnection {
    var connected = false
    var written: ByteArray? = null

    override fun connect(target: ConnectionTarget) { connected = true }
    override fun disconnect() { connected = false }
    override fun write(data: ByteArray) { written = data }
    override fun isConnected(): Boolean = connected
}

class PrinterManagerTest {
    private fun buildManager(): Pair<PrinterManager, FakeConnection> {
        val connection = FakeConnection()
        val driverRegistry = DriverRegistry().apply { register("fake-driver") { FakeDriver() } }
        val connectionRegistry = ConnectionRegistry().apply { register("fake-connection") { connection } }
        return PrinterManager(driverRegistry, connectionRegistry) to connection
    }

    @Test
    fun `connect resolves driver and connection then sets status connected`() {
        val (manager, connection) = buildManager()
        manager.connect("fake-driver", "fake-connection", ConnectionTarget.Usb(1, 2))

        assertEquals(PrinterStatus.CONNECTED, manager.status)
        assertEquals(true, connection.connected)
    }

    @Test
    fun `testPrint writes driver bytes through the connection`() {
        val (manager, connection) = buildManager()
        manager.connect("fake-driver", "fake-connection", ConnectionTarget.Usb(1, 2))
        manager.testPrint()

        assertArrayEquals(byteArrayOf(0x01, 0x02), connection.written)
    }

    @Test
    fun `disconnect resets status to disconnected`() {
        val (manager, connection) = buildManager()
        manager.connect("fake-driver", "fake-connection", ConnectionTarget.Usb(1, 2))
        manager.disconnect()

        assertEquals(PrinterStatus.DISCONNECTED, manager.status)
        assertEquals(false, connection.connected)
    }

    @Test
    fun `print throws when not connected`() {
        val (manager, _) = buildManager()
        assertThrows(IllegalStateException::class.java) { manager.print(byteArrayOf(0x00)) }
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd android && ./gradlew testDebugUnitTest --tests "com.ndtcore.pos.printer.manager.PrinterManagerTest"`
Expected: FAIL — `PrinterManager` unresolved reference.

- [ ] **Step 3: Implement `PrinterManager.kt`**

```kotlin
// android/app/src/main/java/com/ndtcore/pos/printer/manager/PrinterManager.kt
package com.ndtcore.pos.printer.manager

import com.ndtcore.pos.printer.connection.ConnectionTarget
import com.ndtcore.pos.printer.connection.PrinterConnection
import com.ndtcore.pos.printer.driver.PrinterDriver
import com.ndtcore.pos.printer.registry.ConnectionRegistry
import com.ndtcore.pos.printer.registry.DriverRegistry

enum class PrinterStatus { DISCONNECTED, CONNECTING, CONNECTED, ERROR }

class PrinterManager(
    private val driverRegistry: DriverRegistry,
    private val connectionRegistry: ConnectionRegistry,
) {
    private var currentDriver: PrinterDriver? = null
    private var currentConnection: PrinterConnection? = null

    var status: PrinterStatus = PrinterStatus.DISCONNECTED
        private set

    fun connect(driverType: String, connectionType: String, target: ConnectionTarget) {
        status = PrinterStatus.CONNECTING
        try {
            val driver = driverRegistry.resolve(driverType)
            val connection = connectionRegistry.resolve(connectionType)
            connection.connect(target)

            currentDriver = driver
            currentConnection = connection
            status = PrinterStatus.CONNECTED
        } catch (error: Exception) {
            status = PrinterStatus.ERROR
            throw error
        }
    }

    fun disconnect() {
        currentConnection?.disconnect()
        currentConnection = null
        currentDriver = null
        status = PrinterStatus.DISCONNECTED
    }

    fun print(data: ByteArray) {
        val connection = currentConnection
        if (connection == null || status != PrinterStatus.CONNECTED) {
            throw IllegalStateException("Chưa kết nối máy in.")
        }
        connection.write(data)
    }

    fun testPrint() {
        val driver = currentDriver ?: throw IllegalStateException("Chưa chọn driver máy in.")
        print(driver.buildTestPrintBytes())
    }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `cd android && ./gradlew testDebugUnitTest --tests "com.ndtcore.pos.printer.manager.PrinterManagerTest"`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/ndtcore/pos/printer/manager android/app/src/test/java/com/ndtcore/pos/printer/manager
git commit -m "feat(android): add PrinterManager orchestration layer"
```

---

## Task 20: UsbConnection (Kotlin, Android USB Host API)

**Files:**
- Create: `android/app/src/main/java/com/ndtcore/pos/printer/connection/UsbConnection.kt`

**Interfaces:**
- Consumes: `PrinterConnection`, `ConnectionTarget` (Task 15).
- Produces: `UsbConnection(context: Context)` — registered under key `"usb"` in Task 21.

This class depends on `android.hardware.usb.*` and `Context`, which real unit tests can't exercise meaningfully without a physical USB device attached — verification for this task is **manual, on a physical Android device** (see Task 24). No automated test file is created here; that is a deliberate, documented exception, not an oversight.

- [ ] **Step 1: Implement `UsbConnection.kt`**

```kotlin
// android/app/src/main/java/com/ndtcore/pos/printer/connection/UsbConnection.kt
package com.ndtcore.pos.printer.connection

import android.content.Context
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager

class UsbConnection(private val context: Context) : PrinterConnection {
    private var connection: UsbDeviceConnection? = null
    private var usbInterface: UsbInterface? = null
    private var outEndpoint: UsbEndpoint? = null

    override fun connect(target: ConnectionTarget) {
        require(target is ConnectionTarget.Usb) { "UsbConnection chỉ nhận ConnectionTarget.Usb." }

        val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
        val device = usbManager.deviceList.values.find {
            it.vendorId == target.vendorId && it.productId == target.productId
        } ?: throw IllegalStateException(
            "Không tìm thấy thiết bị USB vendorId=${target.vendorId} productId=${target.productId}.",
        )

        if (!usbManager.hasPermission(device)) {
            throw IllegalStateException("Chưa được cấp quyền truy cập thiết bị USB.")
        }

        val (iface, endpoint) = findBulkOutEndpoint(device)
            ?: throw IllegalStateException("Không tìm thấy cổng gửi dữ liệu (OUT endpoint) trên thiết bị USB này.")

        val deviceConnection = usbManager.openDevice(device)
            ?: throw IllegalStateException("Không mở được kết nối tới thiết bị USB.")
        deviceConnection.claimInterface(iface, true)

        connection = deviceConnection
        usbInterface = iface
        outEndpoint = endpoint
    }

    override fun disconnect() {
        usbInterface?.let { connection?.releaseInterface(it) }
        connection?.close()
        connection = null
        usbInterface = null
        outEndpoint = null
    }

    override fun write(data: ByteArray) {
        val deviceConnection = connection ?: throw IllegalStateException("Chưa kết nối máy in USB.")
        val endpoint = outEndpoint ?: throw IllegalStateException("Chưa kết nối máy in USB.")
        val result = deviceConnection.bulkTransfer(endpoint, data, data.size, 5000)
        if (result < 0) {
            throw IllegalStateException("Gửi lệnh in thất bại (bulkTransfer trả về $result).")
        }
    }

    override fun isConnected(): Boolean = connection != null

    private fun findBulkOutEndpoint(device: UsbDevice): Pair<UsbInterface, UsbEndpoint>? {
        for (i in 0 until device.interfaceCount) {
            val iface = device.getInterface(i)
            for (j in 0 until iface.endpointCount) {
                val endpoint = iface.getEndpoint(j)
                if (endpoint.direction == UsbConstants.USB_DIR_OUT) {
                    return iface to endpoint
                }
            }
        }
        return null
    }
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd android && ./gradlew compileDebugKotlin`
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 3: Commit**

```bash
git add android/app/src/main/java/com/ndtcore/pos/printer/connection/UsbConnection.kt
git commit -m "feat(android): add USB Host API connection (manual verification required)"
```

---

## Task 21: PrinterPlugin.kt — Capacitor plugin wiring

**Files:**
- Create: `android/app/src/main/java/com/ndtcore/pos/printer/PrinterPlugin.kt`
- Create: `android/app/src/main/java/com/ndtcore/pos/printer/driver/DriverDetector.kt`
- Create: `android/app/src/test/java/com/ndtcore/pos/printer/driver/DriverDetectorTest.kt`
- Create: `android/app/src/main/java/com/ndtcore/pos/printer/driver/VendorManagedDriver.kt`
- Modify: `android/app/src/main/java/com/ndtcore/pos/MainActivity.java` (or `.kt` — check what Capacitor's `cap add android` generated in Task 3 and match its language; convert to Kotlin if it's Java, since this task's registration snippet is Kotlin)

**Interfaces:**
- Consumes: `PrinterManager`, `PrinterStatus` (Task 19); `DriverRegistry`, `ConnectionRegistry` (Task 16); `GenericEscPosDriver` (Task 17); `UsbConnection` (Task 20); `LanConnection` (Task 18); `ConnectionTarget` (Task 15).
- Produces (this task): `DriverDetector.suggestDriver(vendorId): String`, `VendorManagedDriver` interface (`testPrint(): Unit`) — both are self-contained (no dependency on a concrete vendor driver yet) and get consumed starting in Task 22.
- Produces: the `Printer` native plugin, matching the exact method names/shapes in `src/native/printer-plugin/definitions.ts` (Task 4) — this is the contract boundary between TypeScript and Kotlin, verified manually in Task 24.

**Design note carried over from the spec (§4):** `generic-escpos` is orchestrated through `PrinterManager` (shared `Connection`), but `xprinter`/`epson` (Tasks 22–23) manage their own connection via vendor SDK and never touch `PrinterManager`/`ConnectionRegistry` at all. This task only wires the `generic-escpos` + USB/LAN path, because `XPrinterDriver`/`EpsonDriver` don't exist yet — **Task 22 modifies `PrinterPlugin.kt` again** to add the vendor-managed branch once `buildXPrinterDriver()` exists, and Task 23 extends that same branch for Epson. Writing the branch before its target functions exist would make this task's own build-verification step (Step 8) fail, so it's deliberately deferred.

- [ ] **Step 1: Implement `PrinterPlugin.kt`**

```kotlin
// android/app/src/main/java/com/ndtcore/pos/printer/PrinterPlugin.kt
package com.ndtcore.pos.printer

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.ndtcore.pos.printer.connection.ConnectionTarget
import com.ndtcore.pos.printer.connection.LanConnection
import com.ndtcore.pos.printer.connection.UsbConnection
import com.ndtcore.pos.printer.driver.DriverDetector
import com.ndtcore.pos.printer.driver.GenericEscPosDriver
import com.ndtcore.pos.printer.manager.PrinterManager
import com.ndtcore.pos.printer.registry.ConnectionRegistry
import com.ndtcore.pos.printer.registry.DriverRegistry

private const val ACTION_USB_PERMISSION = "com.ndtcore.pos.USB_PERMISSION"
private const val PREFS_NAME = "ndtcore_pos_printer_config"
private const val PREFS_KEY_CONFIG = "config"

// NOTE: Task 22 modifies this class to add vendor-managed driver branching
// (currentVendorDriver, buildVendorDriver()) once XPrinterDriver exists.

@CapacitorPlugin(name = "Printer")
class PrinterPlugin : Plugin() {
    private lateinit var manager: PrinterManager
    private var pendingConnectCall: PluginCall? = null

    override fun load() {
        val driverRegistry = DriverRegistry().apply {
            register("generic-escpos") { GenericEscPosDriver() }
        }
        val connectionRegistry = ConnectionRegistry().apply {
            register("usb") { UsbConnection(context) }
            register("lan") { LanConnection() }
        }
        manager = PrinterManager(driverRegistry, connectionRegistry)

        context.registerReceiver(usbPermissionReceiver, IntentFilter(ACTION_USB_PERMISSION))
    }

    private val usbPermissionReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            if (intent.action != ACTION_USB_PERMISSION) return
            val call = pendingConnectCall ?: return
            pendingConnectCall = null

            val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
            if (!granted) {
                call.reject("Người dùng từ chối quyền truy cập thiết bị USB.")
                return
            }
            finishConnect(call)
        }
    }

    @PluginMethod
    fun scanPrinters(call: PluginCall) {
        val connectionType = call.getString("connectionType")
        if (connectionType == null) {
            call.reject("Thiếu tham số connectionType.")
            return
        }

        val devices = JSArray()
        if (connectionType == "usb") {
            val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
            usbManager.deviceList.values.forEach { device: UsbDevice ->
                val json = JSObject()
                json.put("connectionType", "usb")
                json.put("vendorId", device.vendorId)
                json.put("productId", device.productId)
                json.put("productName", device.productName)
                json.put("serialNumber", null)
                json.put("suggestedDriver", DriverDetector.suggestDriver(device.vendorId))
                devices.put(json)
            }
        }

        val result = JSObject()
        result.put("devices", devices)
        call.resolve(result)
    }

    @PluginMethod
    fun connect(call: PluginCall) {
        val config = call.getObject("config")
        if (config == null) {
            call.reject("Thiếu tham số config.")
            return
        }
        val connectionType = config.getString("connectionType")
        val device = config.getJSObject("device")

        if (connectionType == "usb" && device != null) {
            val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
            val vendorId = device.getInteger("vendorId")
            val productId = device.getInteger("productId")
            val usbDevice = usbManager.deviceList.values.find {
                it.vendorId == vendorId && it.productId == productId
            }

            if (usbDevice != null && !usbManager.hasPermission(usbDevice)) {
                pendingConnectCall = call
                val permissionIntent = PendingIntent.getBroadcast(
                    context,
                    0,
                    Intent(ACTION_USB_PERMISSION),
                    PendingIntent.FLAG_MUTABLE,
                )
                usbManager.requestPermission(usbDevice, permissionIntent)
                return
            }
        }

        finishConnect(call)
    }

    private fun finishConnect(call: PluginCall) {
        val config = call.getObject("config")!!
        val driverType = config.getString("driver")!!
        val connectionType = config.getString("connectionType")!!
        val device = config.getJSObject("device")

        val target = when (connectionType) {
            "usb" -> ConnectionTarget.Usb(device!!.getInteger("vendorId")!!, device.getInteger("productId")!!)
            "lan" -> ConnectionTarget.Lan(device!!.getString("ip")!!, device.getInteger("port")!!)
            else -> {
                call.reject("connectionType \"$connectionType\" không được hỗ trợ trên Android.")
                return
            }
        }

        try {
            manager.connect(driverType, connectionType, target)
            val result = JSObject()
            result.put("config", config)
            call.resolve(result)
        } catch (error: Exception) {
            call.reject(error.message, error)
        }
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        manager.disconnect()
        call.resolve()
    }

    @PluginMethod
    fun print(call: PluginCall) {
        val dataArray = call.getArray("data")
        if (dataArray == null) {
            call.reject("Thiếu tham số data.")
            return
        }
        val bytes = ByteArray(dataArray.length()) { i -> (dataArray.get(i) as Int).toByte() }
        try {
            manager.print(bytes)
            call.resolve()
        } catch (error: Exception) {
            call.reject(error.message, error)
        }
    }

    @PluginMethod
    fun testPrint(call: PluginCall) {
        try {
            manager.testPrint()
            call.resolve()
        } catch (error: Exception) {
            call.reject(error.message, error)
        }
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val result = JSObject()
        result.put("status", manager.status.name.lowercase())
        call.resolve(result)
    }

    @PluginMethod
    fun saveConfig(call: PluginCall) {
        val config = call.getObject("config")
        if (config == null) {
            call.reject("Thiếu tham số config.")
            return
        }
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(PREFS_KEY_CONFIG, config.toString())
            .apply()
        call.resolve()
    }

    @PluginMethod
    fun loadConfig(call: PluginCall) {
        val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(PREFS_KEY_CONFIG, null)

        val result = JSObject()
        result.put("config", if (raw != null) JSObject(raw) else null)
        call.resolve(result)
    }
}
```

- [ ] **Step 4: Add `DriverDetector` (vendor-ID → driver suggestion, per spec §5)**

Pure lookup logic, fully unit-testable with no Android framework dependency.

```kotlin
// android/app/src/main/java/com/ndtcore/pos/printer/driver/DriverDetector.kt
package com.ndtcore.pos.printer.driver

/**
 * 0x04B8 is Epson's real USB-IF registered vendor ID (confirmed public information).
 * The Xprinter entry is a placeholder pending the real SDK/hardware VID (see Task 22's
 * verification note) — confirm the actual vendor ID via `lsusb` or Windows Device Manager
 * against the physical printer before relying on this for XPrinter auto-detection.
 */
private val KNOWN_VENDOR_IDS = mapOf(
    0x04B8 to "epson",
)

object DriverDetector {
    fun suggestDriver(vendorId: Int): String {
        return KNOWN_VENDOR_IDS[vendorId] ?: "generic-escpos"
    }
}
```

Test:

```kotlin
// android/app/src/test/java/com/ndtcore/pos/printer/driver/DriverDetectorTest.kt
package com.ndtcore.pos.printer.driver

import org.junit.Assert.assertEquals
import org.junit.Test

class DriverDetectorTest {
    @Test
    fun `suggests epson for Epson's registered USB vendor ID`() {
        assertEquals("epson", DriverDetector.suggestDriver(0x04B8))
    }

    @Test
    fun `falls back to generic-escpos for unknown vendor IDs`() {
        assertEquals("generic-escpos", DriverDetector.suggestDriver(0x9999))
    }
}
```

Run: `cd android && ./gradlew testDebugUnitTest --tests "com.ndtcore.pos.printer.driver.DriverDetectorTest"`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the `VendorManagedDriver` interface**

```kotlin
// android/app/src/main/java/com/ndtcore/pos/printer/driver/VendorManagedDriver.kt
package com.ndtcore.pos.printer.driver

/**
 * Implemented by drivers that own their connection via a vendor SDK (XPrinter, Epson) instead
 * of going through `PrinterConnection`/`ConnectionRegistry` — see spec §4 and Tasks 22–23.
 */
interface VendorManagedDriver {
    fun testPrint()
}
```

- [ ] **Step 6: Register the plugin in `MainActivity`**

If `android/app/src/main/java/com/ndtcore/pos/MainActivity.java` exists (Capacitor's default template), replace it with a Kotlin equivalent at `MainActivity.kt` and delete the `.java` file:

```kotlin
// android/app/src/main/java/com/ndtcore/pos/MainActivity.kt
package com.ndtcore.pos

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.ndtcore.pos.printer.PrinterPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(PrinterPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
```

- [ ] **Step 7: Add the USB permission broadcast to `AndroidManifest.xml` if needed**

Confirm `android/app/src/main/AndroidManifest.xml` has internet permission for LAN printing:

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

- [ ] **Step 8: Verify the project builds**

Run: `cd android && ./gradlew assembleDebug`
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 9: Commit**

```bash
git add android/app/src/main/java/com/ndtcore/pos android/app/src/test/java/com/ndtcore/pos android/app/src/main/AndroidManifest.xml
git commit -m "feat(android): wire up PrinterPlugin and register it in MainActivity"
```

---

## Task 22: XPrinterDriver (Kotlin, Android) — best-effort, flagged for verification

**Files:**
- Create: `android/app/src/main/java/com/ndtcore/pos/printer/driver/XPrinterDriver.kt`
- Modify: `android/app/src/main/java/com/ndtcore/pos/printer/PrinterPlugin.kt` (adds the vendor-managed driver branch — this is its first use, see Step 3)

**Interfaces:**
- Consumes: `VendorManagedDriver` (Task 21, Step 5); `ConnectionTarget` is NOT used here — this driver receives raw connect parameters (vendorId/productId or ip/port) via `JSObject` directly from `PrinterPlugin.buildVendorDriver()` (this task, Step 3), since it talks to the vendor SDK's own connection object, not `PrinterConnection`.
- Produces: `XPrinterDriver` (implements `VendorManagedDriver`) and the top-level factory function `buildXPrinterDriver(context, connectionType, device): VendorManagedDriver`, called from `PrinterPlugin.buildVendorDriver()` (added in Step 3 below).

**Read the Global Constraints risk note before starting this task.** There is no public Maven coordinate for Xprinter's official SDK (confirmed: `xprintertech.com`'s SDK page is only reachable by contacting Xprinter directly at `overseas@xprinter.net`, no npm/Maven package exists). The code below follows the `net.posprinter` (`POSConnect` / `POSPrinter` / `IDeviceConnection`) pattern, which is the one most consistently referenced across independent community documentation for Xprinter's Android POS SDK — but it has **not** been verified against the vendor's actual v3.2.0 package. Before running this against physical hardware:

1. Obtain the real SDK (contact `overseas@xprinter.net` or download from `xprintertech.com`).
2. Add it as `android/app/libs/xprinter-sdk.aar` and reference it in `android/app/build.gradle`: `implementation files('libs/xprinter-sdk.aar')`.
3. Compare its actual class/method names against the code below and correct any mismatch.

- [ ] **Step 1: Add the SDK dependency placeholder to `android/app/build.gradle`**

```groovy
dependencies {
    implementation files('libs/xprinter-sdk.aar')
}
```

Create the `android/app/libs/` directory if it doesn't exist. The `.aar` itself must be supplied by whoever obtains the SDK from Xprinter — it cannot be fabricated or downloaded automatically.

- [ ] **Step 2: Implement `XPrinterDriver.kt`**

```kotlin
// android/app/src/main/java/com/ndtcore/pos/printer/driver/XPrinterDriver.kt
package com.ndtcore.pos.printer.driver

import android.content.Context
import com.getcapacitor.JSObject
import net.posprinter.IDeviceConnection
import net.posprinter.POSConnect
import net.posprinter.POSPrinter

/**
 * Best-effort integration against the net.posprinter (POSConnect/POSPrinter) API pattern —
 * see Task 22 notes in the implementation plan for the verification steps required before
 * this runs against a real device. Owns its connection via the vendor SDK, so it never touches
 * `PrinterConnection`/`ConnectionRegistry` (spec §4).
 */
class XPrinterDriver(private val deviceConnection: IDeviceConnection) : VendorManagedDriver {
    override fun testPrint() {
        val printer = POSPrinter(deviceConnection)
        printer.initializePrinter()
        printer.printString("NDT Bubble Tea\n\n")
        printer.printString("Order #1001\n")
        printer.printString("Classic Milk Tea\n")
        printer.printString("Pearl\n")
        printer.printString("Sugar 100%\n")
        printer.printString("Ice Normal\n")
        printer.printString("-------------------------\n")
        printer.printString("TOTAL\n")
        printer.printString("\$8.50\n\n")
        printer.printString("Thank You\n\n\n\n")
        printer.cutHalfAndFeed(1)
    }
}

/**
 * Called from `PrinterPlugin.buildVendorDriver()` (Task 21). Only the USB connection type is
 * wired here since Xprinter USB printers are this project's actual hardware target — extend
 * with a `POSConnect.DEVICE_TYPE_ETHERNET` branch if/when LAN Xprinter models are needed.
 */
fun buildXPrinterDriver(context: Context, connectionType: String, device: JSObject): VendorManagedDriver {
    require(connectionType == "usb") { "XPrinterDriver hiện chỉ hỗ trợ kết nối USB." }
    val vendorId = device.getInteger("vendorId")
    val productId = device.getInteger("productId")
    // POSConnect.createDevice()'s exact signature is part of what Task 22's risk note flags
    // as unverified — confirm against the real SDK how it identifies which USB device to open
    // (this assumes it can take a Context + vendor/product filter; adjust once the SDK is in hand).
    val deviceConnection = POSConnect.createDevice(POSConnect.DEVICE_TYPE_USB)
    return XPrinterDriver(deviceConnection)
}
```

- [ ] **Step 3: Modify `PrinterPlugin.kt` to route `xprinter` through the vendor-managed path**

This is the first vendor-managed driver, so this step introduces the branching itself (Task 21 deliberately left it out — see that task's design note). Task 23 will extend this same branch with one more `when` arm for `epson`.

Add the import, field, and branching to the class from Task 21:

```kotlin
// Add to the import list:
import com.ndtcore.pos.printer.driver.VendorManagedDriver
import com.ndtcore.pos.printer.driver.buildXPrinterDriver

// Add alongside the other top-level constants:
private val VENDOR_MANAGED_DRIVER_TYPES = setOf("xprinter")
```

Add a field to `PrinterPlugin`:

```kotlin
private var currentVendorDriver: VendorManagedDriver? = null
```

Replace `finishConnect()` with:

```kotlin
private fun finishConnect(call: PluginCall) {
    val config = call.getObject("config")!!
    val driverType = config.getString("driver")!!
    val connectionType = config.getString("connectionType")!!
    val device = config.getJSObject("device")

    try {
        if (driverType in VENDOR_MANAGED_DRIVER_TYPES) {
            currentVendorDriver = buildVendorDriver(driverType, connectionType, device!!)
        } else {
            currentVendorDriver = null
            val target = when (connectionType) {
                "usb" -> ConnectionTarget.Usb(device!!.getInteger("vendorId")!!, device.getInteger("productId")!!)
                "lan" -> ConnectionTarget.Lan(device!!.getString("ip")!!, device.getInteger("port")!!)
                else -> throw IllegalArgumentException(
                    "connectionType \"$connectionType\" không được hỗ trợ trên Android.",
                )
            }
            manager.connect(driverType, connectionType, target)
        }

        val result = JSObject()
        result.put("config", config)
        call.resolve(result)
    } catch (error: Exception) {
        call.reject(error.message, error)
    }
}

private fun buildVendorDriver(driverType: String, connectionType: String, device: JSObject): VendorManagedDriver {
    return when (driverType) {
        "xprinter" -> buildXPrinterDriver(context, connectionType, device)
        else -> throw IllegalArgumentException("Driver \"$driverType\" không được hỗ trợ.")
    }
}
```

Replace `disconnect()`, `print()`, `testPrint()`, and `getStatus()` with:

```kotlin
@PluginMethod
fun disconnect(call: PluginCall) {
    if (currentVendorDriver != null) {
        currentVendorDriver = null
        call.resolve()
        return
    }
    manager.disconnect()
    call.resolve()
}

@PluginMethod
fun print(call: PluginCall) {
    if (currentVendorDriver != null) {
        call.reject("print() với raw bytes không được hỗ trợ cho driver vendor SDK (xprinter/epson).")
        return
    }
    val dataArray = call.getArray("data")
    if (dataArray == null) {
        call.reject("Thiếu tham số data.")
        return
    }
    val bytes = ByteArray(dataArray.length()) { i -> (dataArray.get(i) as Int).toByte() }
    try {
        manager.print(bytes)
        call.resolve()
    } catch (error: Exception) {
        call.reject(error.message, error)
    }
}

@PluginMethod
fun testPrint(call: PluginCall) {
    try {
        val vendorDriver = currentVendorDriver
        if (vendorDriver != null) {
            vendorDriver.testPrint()
        } else {
            manager.testPrint()
        }
        call.resolve()
    } catch (error: Exception) {
        call.reject(error.message, error)
    }
}

@PluginMethod
fun getStatus(call: PluginCall) {
    val status = if (currentVendorDriver != null) "connected" else manager.status.name.lowercase()
    val result = JSObject()
    result.put("status", status)
    call.resolve(result)
}
```

- [ ] **Step 4: Verify the project compiles once the real `.aar` is in place**

Run: `cd android && ./gradlew compileDebugKotlin`
Expected: `BUILD SUCCESSFUL` — this will fail with "unresolved reference: net" until a real `xprinter-sdk.aar` matching this package name is placed in `android/app/libs/`. That failure is expected and documents exactly where this task is blocked on the vendor SDK.

- [ ] **Step 5: Commit**

```bash
git add android/app/build.gradle android/app/src/main/java/com/ndtcore/pos/printer/driver/XPrinterDriver.kt android/app/src/main/java/com/ndtcore/pos/printer/PrinterPlugin.kt
git commit -m "feat(android): add XPrinterDriver (best-effort net.posprinter API, needs SDK verification)"
```

---

## Task 23: EpsonDriver (Kotlin, Android) — ePOS2 SDK

**Files:**
- Create: `android/app/src/main/java/com/ndtcore/pos/printer/driver/EpsonDriver.kt`
- Modify: `android/app/build.gradle` (add ePOS2 SDK dependency)
- Modify: `android/app/src/main/java/com/ndtcore/pos/printer/PrinterPlugin.kt` (extend the vendor-managed branch from Task 22 with `epson`)

**Interfaces:**
- Consumes: `VendorManagedDriver` (Task 21, Step 5).
- Produces: `EpsonDriver` (implements `VendorManagedDriver`) and the top-level factory function `buildEpsonDriver(context, connectionType, device): VendorManagedDriver`, called from `PrinterPlugin.buildVendorDriver()` (extended in Step 3 below — that method was introduced in Task 22).

Epson's ePOS2 SDK for Android is publicly documented (developer.epson.com) with a stable, well-known API — confidence here is high, unlike Task 22.

- [ ] **Step 1: Add the ePOS2 SDK dependency**

Download `ePOS2.aar` from Epson's official developer site (`https://download.epson-biz.com/modules/pos/index.php?page=prod&pcat=3&pid=58`) and place it at `android/app/libs/ePOS2.aar`, then add to `android/app/build.gradle`:

```groovy
dependencies {
    implementation files('libs/ePOS2.aar')
}
```

- [ ] **Step 2: Implement `EpsonDriver.kt`**

```kotlin
// android/app/src/main/java/com/ndtcore/pos/printer/driver/EpsonDriver.kt
package com.ndtcore.pos.printer.driver

import android.content.Context
import com.epson.epos2.printer.Printer
import com.getcapacitor.JSObject

/**
 * Owns its connection via the ePOS2 SDK, so it never touches `PrinterConnection`/
 * `ConnectionRegistry` (spec §4) — `Printer.sendData()` handles I/O internally.
 */
class EpsonDriver(private val context: Context, private val target: String) : VendorManagedDriver {
    override fun testPrint() {
        val printer = Printer(Printer.TM_T88, Printer.MODEL_ANK, context)
        printer.connect(target, Printer.PARAM_DEFAULT)
        printer.addTextAlign(Printer.ALIGN_CENTER)
        printer.addText("NDT Bubble Tea\n\n")
        printer.addTextAlign(Printer.ALIGN_LEFT)
        printer.addText("Order #1001\n")
        printer.addText("Classic Milk Tea\n")
        printer.addText("Pearl\n")
        printer.addText("Sugar 100%\n")
        printer.addText("Ice Normal\n")
        printer.addText("-------------------------\n")
        printer.addText("TOTAL\n")
        printer.addText("\$8.50\n\n")
        printer.addTextAlign(Printer.ALIGN_CENTER)
        printer.addText("Thank You\n\n\n")
        printer.addCut(Printer.CUT_FEED)
        printer.sendData(Printer.PARAM_DEFAULT)
        printer.disconnect()
    }
}

/** Called from `PrinterPlugin.buildVendorDriver()` — see Step 3 below. */
fun buildEpsonDriver(context: Context, connectionType: String, device: JSObject): VendorManagedDriver {
    val target = if (connectionType == "lan") {
        "TCP:${device.getString("ip")}"
    } else {
        "USB:"
    }
    return EpsonDriver(context, target)
}
```

- [ ] **Step 3: Modify `PrinterPlugin.kt` to add `epson` to the vendor-managed branch**

Task 22 introduced `VENDOR_MANAGED_DRIVER_TYPES` and `buildVendorDriver()`. Extend both:

```kotlin
// Change:
private val VENDOR_MANAGED_DRIVER_TYPES = setOf("xprinter")
// To:
private val VENDOR_MANAGED_DRIVER_TYPES = setOf("xprinter", "epson")
```

```kotlin
// Add the import:
import com.ndtcore.pos.printer.driver.buildEpsonDriver

// Change buildVendorDriver() to:
private fun buildVendorDriver(driverType: String, connectionType: String, device: JSObject): VendorManagedDriver {
    return when (driverType) {
        "xprinter" -> buildXPrinterDriver(context, connectionType, device)
        "epson" -> buildEpsonDriver(context, connectionType, device)
        else -> throw IllegalArgumentException("Driver \"$driverType\" không được hỗ trợ.")
    }
}
```

`disconnect()`/`print()`/`testPrint()`/`getStatus()` already branch on `currentVendorDriver` generically (added in Task 22) — they need no further changes for Epson.

- [ ] **Step 4: Verify the project compiles**

Run: `cd android && ./gradlew compileDebugKotlin`
Expected: `BUILD SUCCESSFUL` once `ePOS2.aar` is in place.

- [ ] **Step 5: Commit**

```bash
git add android/app/build.gradle android/app/src/main/java/com/ndtcore/pos/printer/driver/EpsonDriver.kt android/app/src/main/java/com/ndtcore/pos/printer/PrinterPlugin.kt
git commit -m "feat(android): add EpsonDriver using the ePOS2 SDK"
```

---

## Task 24: Manual verification checklist

**Files:** none — this task is a physical-device verification pass, not code.

Automated tests cover every piece of pure logic in this plan (registries, drivers' byte-building, `PrinterManager`/`PrinterWeb` orchestration, LAN socket I/O, UI components). The following cannot be verified without real hardware and must be checked by hand before calling Phase 1 done:

- [ ] **Step 1: Web + USB, on a Windows laptop with Chrome/Edge**

Connect a real thermal printer via USB, open the app, click Connect on Printer Settings, confirm the browser's WebUSB device picker appears, select the printer, confirm status turns "Connected", click "Print Test Bill", confirm a real bill prints matching the sample text in `docs/project.md`.

- [ ] **Step 2: Web + USB, opened via Chrome on an Android device (browser tab, not the installed app) with an OTG cable**

Same flow as Step 1, confirms WebUSB works through Android Chrome + OTG, not just desktop.

- [ ] **Step 3: Android app (installed APK) + USB**

Install the debug APK on a real Android device, connect the printer via USB, confirm the Android system USB-permission dialog appears (not a custom device list — Android grants access per-device, it doesn't reuse the WebUSB request-picker pattern), confirm connect + test print work.

- [ ] **Step 4: Android app + LAN**

Connect a printer to the same Wi-Fi network, enter its IP + port 9100 in the app, confirm connect + test print work over the real network.

- [ ] **Step 5: Android app + XPrinter driver**

Once the real Xprinter SDK (Task 22) is obtained and verified/corrected against actual API, confirm this driver connects and prints on real Xprinter hardware. This step blocks on the vendor SDK — track separately if it isn't ready when the rest of Phase 1 ships.

- [ ] **Step 6: Android app + Epson driver**

Confirm `EpsonDriver` connects and prints on real Epson hardware (TM-T88 series or compatible ePOS2 device).

- [ ] **Step 7: Auto-connect**

Turn on Auto Connect, close and reopen the app (both Web and Android), confirm it reconnects to the previously-used device without user interaction.

- [ ] **Step 8: Error paths**

Unplug the printer mid-session and click "Print Test Bill" — confirm a Vietnamese error toast appears and the app doesn't crash, on both Web and Android.
