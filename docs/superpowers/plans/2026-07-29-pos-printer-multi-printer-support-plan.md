# NDTCore.POS Phase 1 — Multi-Printer Support Retrofit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Retrofit the already-implemented single-printer infrastructure (TS + Android) to support multiple concurrent printer connections (e.g. a receipt printer and a kitchen printer connected at the same time), per [`docs/superpowers/specs/2026-07-29-pos-printer-multi-printer-support-design.md`](../specs/2026-07-29-pos-printer-multi-printer-support-design.md), which amends [`docs/superpowers/specs/2026-07-28-pos-printer-integration-phase1-design.md`](../specs/2026-07-28-pos-printer-integration-phase1-design.md).

**Architecture:** Replace every single-field "current driver/connection/status" in `PrinterManager` (TS and Kotlin) with a `Map<printerId, session>`. Every plugin method (`connect`, `disconnect`, `print`, `testPrint`, `getStatus`) gains a `printerId` parameter. `PrinterConfig` gains `id`/`name`. `saveConfig`/`loadConfig` (single object) become `savePrinters`/`loadPrinters` (array). The Pinia store moves from single `status`/`config` fields to `printers: PrinterConfig[]` + `statuses: Record<string, PrinterStatus>`. `DriverRegistry`/`ConnectionRegistry` and the presentational components (`ConnectionStatusChip`, `PrinterDeviceList`) are untouched — they were already per-instance/stateless.

**Tech Stack:** Vue 3 (Composition API), TypeScript strict, Vitest, Pinia, Vuetify 3, Kotlin + JUnit4.

## Relationship to the original Phase 1 plan

This plan amends [`docs/superpowers/plans/2026-07-28-pos-printer-integration-phase1.md`](2026-07-28-pos-printer-integration-phase1.md). Task numbers below refer to that original document.

| Original Task | Status |
|---|---|
| 1–3 (scaffolding) | Unaffected |
| 4 (`definitions.ts`) | **Superseded by Task 1 below** |
| 5 (registries), 6 (`GenericEscPosDriver`), 7 (`UsbConnection` web) | Unaffected — factories already create a fresh instance per session |
| 8 (`PrinterManager` TS) | **Superseded by Task 1 below** |
| 9 (`web.ts`/`index.ts`) | `web.ts` **superseded by Task 1 below**; `index.ts` unaffected |
| 10 (Pinia store/composable) | **Superseded by Task 2 below** |
| 11 (`ConnectionStatusChip`), 12 (`PrinterDeviceList`) | Unaffected — reused as-is, just rendered once per printer now |
| 13 (`PrinterSettingsView`) | **Superseded by Task 3 below** |
| 14 (`main.ts` auto-connect) | **Superseded by Task 2 below** (part of the same task, same file) |
| 15 (Android skeleton), 16 (Kotlin registries), 17 (`GenericEscPosDriver` Kotlin), 18 (`LanConnection`) | Unaffected |
| 19 (`PrinterManager` Kotlin) | **Superseded by Task 4 below** |
| 20 (`UsbConnection` Kotlin, Android USB Host API) | **Unaffected — not yet implemented. Implement it exactly as written in the original plan before starting Task 5 below** (Task 5 registers it in the connection registry). |
| 21 (`PrinterPlugin.kt` wiring) | **Not yet implemented. Superseded entirely by Task 5 below — do not use the original Task 21 code.** |
| 22–24 (XPrinter/Epson drivers, manual verification) | Out of scope for this plan. When reached, `XPrinterDriver`/`EpsonDriver` are vendor-managed (per spec §4) and will need their own `printerId`-keyed tracking inside `PrinterPlugin.kt` — design that when Task 22/23 is actually started. |

## Global Constraints

- Node version: `^20.19.0 || >=22.12.0`.
- Package manager: npm.
- TypeScript strict mode, no `any` anywhere.
- No comments explaining WHAT code does — only WHY, and only when non-obvious.
- All error messages shown to the user are in Vietnamese.
- `PrinterConfig.id`: UUID string generated once when a printer entry is created; immutable for the entry's lifetime, including across renames.
- `PrinterConfig.name`: user-editable display string, not unique-constrained.
- No artificial limit on the number of concurrent printers — only hardware (USB ports, etc.) limits it.
- The web `localStorage` key and the Android `SharedPreferences` key both change (`ndtcore_pos_printer_config` → `ndtcore_pos_printers`; SharedPreferences key `config` → `printers`) because the stored shape changes from a single object to an array. No migration/back-compat shim is written for the old key — Phase 1 has not shipped to any device yet, so there is no data to migrate.

---

## Task 1: `definitions.ts` + TS `PrinterManager` + `web.ts` — multi-session support

**Files:**
- Modify: `src/native/printer-plugin/definitions.ts`
- Modify: `src/native/printer-plugin/manager/printer-manager.ts`
- Modify: `src/native/printer-plugin/manager/printer-manager.test.ts`
- Modify: `src/native/printer-plugin/web.ts`
- Modify: `src/native/printer-plugin/web.test.ts`

**Interfaces:**
- Consumes: `DriverRegistry`, `ConnectionRegistry` (unchanged); `PrinterDriver`, `PrinterConnection` (unchanged); `UsbConnection`, `GenericEscPosDriver` (unchanged).
- Produces: `PrinterConfig` with `id`/`name`; `PrinterPlugin` with `printerId`-aware methods and `savePrinters`/`loadPrinters`; `PrinterManager` with `printerId`-aware methods — consumed by Task 2 (Pinia store) and, later, Task 5 (`PrinterPlugin.kt`'s TS-side contract mirror).

- [ ] **Step 1: Update `definitions.ts`**

```ts
// src/native/printer-plugin/definitions.ts
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

- [ ] **Step 2: Rewrite the failing test for `PrinterManager`**

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
  disconnectCallCount = 0

  async connectTo(_device: PrinterDevice): Promise<void> {
    this.connected = true
  }
  async disconnect(): Promise<void> {
    this.connected = false
    this.disconnectCallCount += 1
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

  const createdConnections: FakeConnection[] = []
  const connectionRegistry = new ConnectionRegistry()
  connectionRegistry.register('usb', () => {
    const connection = new FakeConnection()
    createdConnections.push(connection)
    return connection
  })

  return { manager: new PrinterManager(driverRegistry, connectionRegistry), createdConnections }
}

const baseConfig: PrinterConfig = {
  id: 'receipt-printer',
  name: 'Máy in Bill',
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
  it('connect() resolves driver + connection and sets that printerId to connected', async () => {
    const { manager } = buildManager()
    await manager.connect('receipt-printer', baseConfig)

    expect(manager.getStatus('receipt-printer')).toBe('connected')
  })

  it('reconnecting the same printerId disconnects the previous connection first (regression: Task 19 leak)', async () => {
    const { manager, createdConnections } = buildManager()
    await manager.connect('receipt-printer', baseConfig)
    await manager.connect('receipt-printer', baseConfig)

    expect(createdConnections[0].disconnectCallCount).toBe(1)
    expect(createdConnections).toHaveLength(2)
    expect(manager.getStatus('receipt-printer')).toBe('connected')
  })

  it('two different printerIds hold independent sessions', async () => {
    const { manager } = buildManager()
    await manager.connect('receipt-printer', baseConfig)
    await manager.connect('kitchen-printer', { ...baseConfig, id: 'kitchen-printer' })

    await manager.disconnect('receipt-printer')

    expect(manager.getStatus('receipt-printer')).toBe('disconnected')
    expect(manager.getStatus('kitchen-printer')).toBe('connected')
  })

  it('testPrint(printerId) writes that printer\'s driver bytes through its own connection', async () => {
    const { manager, createdConnections } = buildManager()
    await manager.connect('receipt-printer', baseConfig)
    await manager.testPrint('receipt-printer')

    expect(createdConnections[0].written).toEqual(new Uint8Array([0x01, 0x02]))
  })

  it('print() throws when the given printerId has no active session', async () => {
    const { manager } = buildManager()
    await expect(manager.print('unknown-printer', new Uint8Array([0x00]))).rejects.toThrow(
      'Chưa kết nối máy in.',
    )
  })

  it('connect() rejects and leaves no session when the driver is unregistered', async () => {
    const { manager } = buildManager()
    await expect(manager.connect('receipt-printer', { ...baseConfig, driver: 'epson' })).rejects.toThrow(
      'Driver "epson" chưa được đăng ký.',
    )
    expect(manager.getStatus('receipt-printer')).toBe('disconnected')
  })
})
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/native/printer-plugin/manager/printer-manager.test.ts`
Expected: FAIL — `connect`/`getStatus` etc. have the old single-argument signature.

- [ ] **Step 4: Rewrite `PrinterManager`**

```ts
// src/native/printer-plugin/manager/printer-manager.ts
import type { DriverRegistry } from '../registry/driver-registry'
import type { ConnectionRegistry } from '../registry/connection-registry'
import type { PrinterDriver, PrinterConnection } from '../internal/types'
import type { PrinterConfig, PrinterStatus, PrinterConnectionType, PrinterDevice } from '../definitions'
import type { UsbConnection } from '../connections/usb-connection'

interface PrinterSession {
  driver: PrinterDriver
  connection: PrinterConnection
}

export class PrinterManager {
  private sessions = new Map<string, PrinterSession>()

  constructor(
    private readonly driverRegistry: DriverRegistry,
    private readonly connectionRegistry: ConnectionRegistry,
  ) {}

  async scan(connectionType: PrinterConnectionType): Promise<PrinterDevice[]> {
    if (connectionType !== 'usb') return []
    const connection = this.connectionRegistry.resolve('usb') as UsbConnection
    return connection.listKnownDevices()
  }

  async connect(printerId: string, config: PrinterConfig): Promise<PrinterConfig> {
    // Reconnecting the same printerId (including retries) always tears down the
    // previous session first — this is the Task 19 resource-leak fix.
    const existing = this.sessions.get(printerId)
    if (existing) {
      await existing.connection.disconnect().catch(() => {})
      this.sessions.delete(printerId)
    }

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

    this.sessions.set(printerId, { driver, connection })

    return { ...config, device }
  }

  async disconnect(printerId: string): Promise<void> {
    const session = this.sessions.get(printerId)
    await session?.connection.disconnect()
    this.sessions.delete(printerId)
  }

  async print(printerId: string, data: Uint8Array): Promise<void> {
    const session = this.sessions.get(printerId)
    if (!session) {
      throw new Error('Chưa kết nối máy in.')
    }
    await session.connection.write(data)
  }

  async testPrint(printerId: string): Promise<void> {
    const session = this.sessions.get(printerId)
    if (!session) {
      throw new Error('Chưa kết nối máy in.')
    }
    await this.print(printerId, session.driver.buildTestPrintBytes())
  }

  getStatus(printerId: string): PrinterStatus {
    return this.sessions.has(printerId) ? 'connected' : 'disconnected'
  }
}
```

A failed `connect()` never stores a session, so `getStatus()` reports `'disconnected'` afterwards, not `'error'` — this differs from the original Task 8 behavior on purpose. `'connecting'`/`'error'` are now purely UI-facing states owned by the Pinia store (Task 2), not by the native session map.

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/native/printer-plugin/manager/printer-manager.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Rewrite the failing test for `web.ts`**

```ts
// src/native/printer-plugin/web.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { PrinterWeb } from './web'
import type { PrinterConfig } from './definitions'

describe('PrinterWeb config persistence', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loadPrinters() returns an empty array when nothing has been saved', async () => {
    const plugin = new PrinterWeb()
    const { configs } = await plugin.loadPrinters()
    expect(configs).toEqual([])
  })

  it('savePrinters() then loadPrinters() round-trips the full list', async () => {
    const plugin = new PrinterWeb()
    const configs: PrinterConfig[] = [
      {
        id: 'receipt-printer',
        name: 'Máy in Bill',
        driver: 'generic-escpos',
        connectionType: 'usb',
        device: null,
        autoConnect: true,
      },
      {
        id: 'kitchen-printer',
        name: 'Máy in Bếp',
        driver: 'generic-escpos',
        connectionType: 'usb',
        device: null,
        autoConnect: false,
      },
    ]

    await plugin.savePrinters({ configs })
    const { configs: loaded } = await plugin.loadPrinters()

    expect(loaded).toEqual(configs)
  })

  it('getStatus() returns disconnected for a printerId with no active session', async () => {
    const plugin = new PrinterWeb()
    const { status } = await plugin.getStatus({ printerId: 'receipt-printer' })
    expect(status).toBe('disconnected')
  })
})
```

- [ ] **Step 7: Run it to verify it fails**

Run: `npx vitest run src/native/printer-plugin/web.test.ts`
Expected: FAIL — `loadConfig`/`saveConfig` no longer exist on `PrinterWeb`.

- [ ] **Step 8: Rewrite `web.ts`**

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

const STORAGE_KEY = 'ndtcore_pos_printers'

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

  async connect(options: { printerId: string; config: PrinterConfig }) {
    const config = await manager.connect(options.printerId, options.config)
    return { config }
  }

  async disconnect(options: { printerId: string }) {
    await manager.disconnect(options.printerId)
  }

  async print(options: { printerId: string; data: number[] }) {
    await manager.print(options.printerId, new Uint8Array(options.data))
  }

  async testPrint(options: { printerId: string }) {
    await manager.testPrint(options.printerId)
  }

  async getStatus(options: { printerId: string }) {
    return { status: manager.getStatus(options.printerId) }
  }

  async savePrinters(options: { configs: PrinterConfig[] }) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options.configs))
  }

  async loadPrinters() {
    const raw = localStorage.getItem(STORAGE_KEY)
    return { configs: raw ? (JSON.parse(raw) as PrinterConfig[]) : [] }
  }
}
```

- [ ] **Step 9: Run it to verify it passes, then run the full suite and type-check**

Run: `npx vitest run src/native/printer-plugin/web.test.ts`
Expected: PASS (3 tests).

Run: `npm run type-check`
Expected: exit code 0 (Task 2/3 aren't done yet in this task, but nothing in this task references the store/view, so this must already be green before moving on).

- [ ] **Step 10: Commit**

```bash
git add src/native/printer-plugin/definitions.ts src/native/printer-plugin/manager/printer-manager.ts src/native/printer-plugin/manager/printer-manager.test.ts src/native/printer-plugin/web.ts src/native/printer-plugin/web.test.ts
git commit -m "feat: rework Printer plugin contract and TS PrinterManager for concurrent multi-printer sessions"
```

---

## Task 2: Pinia store, composable, and app bootstrap — printers list + per-printer status

**Files:**
- Modify: `src/modules/printer/stores/printer.store.ts`
- Modify: `src/modules/printer/stores/printer.store.test.ts`
- Modify: `src/modules/printer/composables/usePrinter.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `Printer` (Task 1) — `connect({printerId, config})`, `disconnect({printerId})`, `testPrint({printerId})`, `scanPrinters`, `savePrinters`, `loadPrinters`; `PrinterConfig`, `PrinterStatus`, `PrinterDevice`, `PrinterConnectionType` (Task 1).
- Produces: `usePrinterStore()` (state: `printers`, `statuses`, `errorMessages`, `knownDevices`; actions: `loadPrinters`, `addPrinter`, `removePrinter`, `renamePrinter`, `scan`, `connect(id)`, `disconnect(id)`, `testPrint(id)`, `autoConnectAll`) — consumed by `PrinterSettingsView.vue` (Task 3) and `main.ts` bootstrap.

- [ ] **Step 1: Rewrite the failing tests for the store**

```ts
// src/modules/printer/stores/printer.store.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/native/printer-plugin', () => ({
  Printer: {
    loadPrinters: vi.fn(),
    savePrinters: vi.fn(),
    scanPrinters: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    testPrint: vi.fn(),
  },
}))

import { Printer } from '@/native/printer-plugin'
import { usePrinterStore } from './printer.store'
import type { PrinterConfig } from '@/native/printer-plugin/definitions'

const receiptPrinter: PrinterConfig = {
  id: 'receipt-printer',
  name: 'Máy in Bill',
  driver: 'generic-escpos',
  connectionType: 'usb',
  device: null,
  autoConnect: true,
}

const kitchenPrinter: PrinterConfig = {
  id: 'kitchen-printer',
  name: 'Máy in Bếp',
  driver: 'generic-escpos',
  connectionType: 'usb',
  device: null,
  autoConnect: false,
}

describe('usePrinterStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    vi.stubGlobal('crypto', { randomUUID: vi.fn().mockReturnValue('generated-id') })
  })

  it('addPrinter() generates an id, appends the printer, and persists the full list', async () => {
    const store = usePrinterStore()
    await store.addPrinter({
      name: 'Máy in Bill',
      driver: 'generic-escpos',
      connectionType: 'usb',
      device: null,
      autoConnect: false,
    })

    expect(store.printers).toEqual([
      {
        id: 'generated-id',
        name: 'Máy in Bill',
        driver: 'generic-escpos',
        connectionType: 'usb',
        device: null,
        autoConnect: false,
      },
    ])
    expect(Printer.savePrinters).toHaveBeenCalledWith({ configs: store.printers })
  })

  it('connect(id) sets that printer\'s status to connected', async () => {
    const store = usePrinterStore()
    store.printers = [receiptPrinter]
    vi.mocked(Printer.connect).mockResolvedValue({ config: receiptPrinter })

    await store.connect('receipt-printer')

    expect(store.statuses['receipt-printer']).toBe('connected')
    expect(Printer.connect).toHaveBeenCalledWith({ printerId: 'receipt-printer', config: receiptPrinter })
  })

  it('connect(id) sets only that printer\'s status to error and rethrows when the plugin call rejects', async () => {
    const store = usePrinterStore()
    store.printers = [receiptPrinter, kitchenPrinter]
    store.statuses['kitchen-printer'] = 'connected'
    vi.mocked(Printer.connect).mockRejectedValue(new Error('boom'))

    await expect(store.connect('receipt-printer')).rejects.toThrow('boom')

    expect(store.statuses['receipt-printer']).toBe('error')
    expect(store.errorMessages['receipt-printer']).toBe('boom')
    expect(store.statuses['kitchen-printer']).toBe('connected')
  })

  it('removePrinter(id) disconnects a connected printer before removing it', async () => {
    const store = usePrinterStore()
    store.printers = [receiptPrinter]
    store.statuses['receipt-printer'] = 'connected'
    vi.mocked(Printer.disconnect).mockResolvedValue(undefined)

    await store.removePrinter('receipt-printer')

    expect(Printer.disconnect).toHaveBeenCalledWith({ printerId: 'receipt-printer' })
    expect(store.printers).toEqual([])
    expect(store.statuses['receipt-printer']).toBeUndefined()
  })

  it('autoConnectAll() connects only printers with autoConnect=true and does not throw when one fails', async () => {
    const store = usePrinterStore()
    store.printers = [receiptPrinter, kitchenPrinter]
    vi.mocked(Printer.connect).mockRejectedValue(new Error('no device'))

    await store.autoConnectAll()

    expect(Printer.connect).toHaveBeenCalledTimes(1)
    expect(Printer.connect).toHaveBeenCalledWith({ printerId: 'receipt-printer', config: receiptPrinter })
    expect(store.statuses['receipt-printer']).toBe('error')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modules/printer/stores/printer.store.test.ts`
Expected: FAIL — `addPrinter`/`removePrinter`/`autoConnectAll` don't exist yet.

- [ ] **Step 3: Rewrite `printer.store.ts`**

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
    printers: [] as PrinterConfig[],
    statuses: {} as Record<string, PrinterStatus>,
    errorMessages: {} as Record<string, string | null>,
    knownDevices: [] as PrinterDevice[],
  }),
  actions: {
    async loadPrinters(): Promise<void> {
      const { configs } = await Printer.loadPrinters()
      this.printers = configs
    },

    async addPrinter(input: Omit<PrinterConfig, 'id'>): Promise<void> {
      const printer: PrinterConfig = { ...input, id: crypto.randomUUID() }
      this.printers.push(printer)
      await Printer.savePrinters({ configs: this.printers })
    },

    async removePrinter(id: string): Promise<void> {
      if (this.statuses[id] === 'connected') {
        await this.disconnect(id)
      }
      this.printers = this.printers.filter((printer) => printer.id !== id)
      delete this.statuses[id]
      delete this.errorMessages[id]
      await Printer.savePrinters({ configs: this.printers })
    },

    async renamePrinter(id: string, name: string): Promise<void> {
      const printer = this.printers.find((p) => p.id === id)
      if (!printer) return
      printer.name = name
      await Printer.savePrinters({ configs: this.printers })
    },

    async scan(connectionType: PrinterConnectionType): Promise<PrinterDevice[]> {
      const { devices } = await Printer.scanPrinters({ connectionType })
      this.knownDevices = devices
      return devices
    },

    async connect(id: string): Promise<void> {
      const printer = this.printers.find((p) => p.id === id)
      if (!printer) {
        throw new Error(`Không tìm thấy cấu hình máy in với id "${id}".`)
      }

      this.statuses[id] = 'connecting'
      this.errorMessages[id] = null
      try {
        const result = await Printer.connect({ printerId: id, config: printer })
        Object.assign(printer, result.config)
        this.statuses[id] = 'connected'
        await Printer.savePrinters({ configs: this.printers })
      } catch (error) {
        this.statuses[id] = 'error'
        this.errorMessages[id] = error instanceof Error ? error.message : 'Đã có lỗi xảy ra.'
        throw error
      }
    },

    async disconnect(id: string): Promise<void> {
      await Printer.disconnect({ printerId: id })
      this.statuses[id] = 'disconnected'
    },

    async testPrint(id: string): Promise<void> {
      await Printer.testPrint({ printerId: id })
    },

    async autoConnectAll(): Promise<void> {
      const autoConnectPrinters = this.printers.filter((printer) => printer.autoConnect)
      await Promise.allSettled(autoConnectPrinters.map((printer) => this.connect(printer.id)))
    },
  },
})
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/modules/printer/stores/printer.store.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Rewrite the composable**

```ts
// src/modules/printer/composables/usePrinter.ts
import { storeToRefs } from 'pinia'
import { usePrinterStore } from '../stores/printer.store'

export function usePrinter() {
  const store = usePrinterStore()
  const { printers, statuses, errorMessages, knownDevices } = storeToRefs(store)

  return {
    printers,
    statuses,
    errorMessages,
    knownDevices,
    loadPrinters: store.loadPrinters,
    addPrinter: store.addPrinter,
    removePrinter: store.removePrinter,
    renamePrinter: store.renamePrinter,
    scan: store.scan,
    connect: store.connect,
    disconnect: store.disconnect,
    testPrint: store.testPrint,
  }
}
```

- [ ] **Step 6: Update `main.ts` bootstrap**

```ts
// src/main.ts
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
  await printerStore.loadPrinters()
  await printerStore.autoConnectAll()

  app.mount('#app')
}

bootstrap()
```

`autoConnectAll()` already swallows individual failures via `Promise.allSettled`, so no try/catch is needed here (unlike the single-printer version).

- [ ] **Step 7: Verify type-check passes**

Run: `npm run type-check`
Expected: fails on `src/modules/printer/views/PrinterSettingsView.vue` and its test, which still reference the old single-printer API — that's expected until Task 3. Confirm the failures are confined to those two files only.

- [ ] **Step 8: Commit**

```bash
git add src/modules/printer/stores/printer.store.ts src/modules/printer/stores/printer.store.test.ts src/modules/printer/composables/usePrinter.ts src/main.ts
git commit -m "feat: rework Pinia printer store and bootstrap for multiple concurrent printers"
```

---

## Task 3: `PrinterSettingsView.vue` — printer list UI

**Files:**
- Modify: `src/modules/printer/views/PrinterSettingsView.vue`
- Modify: `src/modules/printer/views/PrinterSettingsView.test.ts`

**Interfaces:**
- Consumes: `usePrinter()` (Task 2); `ConnectionStatusChip` (unchanged); `PrinterDeviceList` (unchanged); `PrinterConnectionType`, `PrinterDriverType`, `PrinterDevice` (Task 1).

- [ ] **Step 1: Rewrite the failing test**

```ts
// src/modules/printer/views/PrinterSettingsView.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestingPinia } from '@pinia/testing'
import { mountWithVuetify } from '@/test/mount-with-vuetify'
import PrinterSettingsView from './PrinterSettingsView.vue'
import { usePrinterStore } from '../stores/printer.store'
import type { PrinterConfig } from '@/native/printer-plugin/definitions'

const receiptPrinter: PrinterConfig = {
  id: 'receipt-printer',
  name: 'Máy in Bill',
  driver: 'generic-escpos',
  connectionType: 'usb',
  device: null,
  autoConnect: false,
}

function mountView(initialState: Record<string, unknown> = {}) {
  return mountWithVuetify(PrinterSettingsView, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          stubActions: true,
          initialState: {
            printer: {
              printers: [],
              statuses: {},
              errorMessages: {},
              knownDevices: [],
              ...initialState,
            },
          },
        }),
      ],
    },
  })
}

describe('PrinterSettingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders one card per printer with its name', () => {
    const wrapper = mountView({ printers: [receiptPrinter] })
    expect(wrapper.find('[data-test="printer-card-receipt-printer"]').exists()).toBe(true)
  })

  it('disables "Print Test Bill" for a printer that is not connected', () => {
    const wrapper = mountView({ printers: [receiptPrinter], statuses: { 'receipt-printer': 'disconnected' } })
    const button = wrapper.find('[data-test="test-print-button-receipt-printer"]')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('calls store.connect(id) with that printer\'s id when its Connect button is clicked', async () => {
    const wrapper = mountView({ printers: [receiptPrinter] })
    const store = usePrinterStore()

    await wrapper.find('[data-test="connect-button-receipt-printer"]').trigger('click')

    expect(store.connect).toHaveBeenCalledWith('receipt-printer')
  })

  it('calls store.testPrint(id) when "Print Test Bill" is clicked while that printer is connected', async () => {
    const wrapper = mountView({ printers: [receiptPrinter], statuses: { 'receipt-printer': 'connected' } })
    const store = usePrinterStore()

    await wrapper.find('[data-test="test-print-button-receipt-printer"]').trigger('click')

    expect(store.testPrint).toHaveBeenCalledWith('receipt-printer')
  })

  it('calls store.addPrinter() with the entered form values when "Thêm máy in" is clicked', async () => {
    const wrapper = mountView()
    const store = usePrinterStore()

    await wrapper.find('[data-test="new-printer-name"] input').setValue('Máy in Bếp')
    await wrapper.find('[data-test="add-printer-button"]').trigger('click')

    expect(store.addPrinter).toHaveBeenCalledWith({
      name: 'Máy in Bếp',
      driver: 'generic-escpos',
      connectionType: 'usb',
      device: null,
      autoConnect: false,
    })
  })

  it('shows the error message in a snackbar when connect() rejects', async () => {
    const wrapper = mountView({ printers: [receiptPrinter] })
    const store = usePrinterStore()
    vi.mocked(store.connect).mockRejectedValue(new Error('Chưa kết nối máy in USB.'))

    await wrapper.find('[data-test="connect-button-receipt-printer"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Chưa kết nối máy in USB.')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/modules/printer/views/PrinterSettingsView.test.ts`
Expected: FAIL — the old view has no per-printer `data-test` attributes and no add-printer form.

- [ ] **Step 3: Rewrite the view**

```vue
<!-- src/modules/printer/views/PrinterSettingsView.vue -->
<template>
  <v-container>
    <v-card class="mb-4">
      <v-card-title>Thêm máy in</v-card-title>
      <v-card-text>
        <v-text-field v-model="newPrinterName" label="Tên máy in" data-test="new-printer-name" />
        <v-select
          v-model="newPrinterConnectionType"
          label="Connection Type"
          :items="[{ title: 'USB', value: 'usb' }]"
          item-title="title"
          item-value="value"
        />
        <v-select
          v-model="newPrinterDriver"
          label="Driver"
          :items="[{ title: 'Generic ESC/POS', value: 'generic-escpos' }]"
          item-title="title"
          item-value="value"
        />
        <v-switch v-model="newPrinterAutoConnect" label="Auto Connect" />

        <PrinterDeviceList :devices="knownDevices" @scan="onScan" @select="onSelectNewDevice" />
      </v-card-text>
      <v-card-actions>
        <v-btn
          data-test="add-printer-button"
          color="primary"
          :disabled="!newPrinterName"
          @click="onAddPrinter"
        >
          Thêm máy in
        </v-btn>
      </v-card-actions>
    </v-card>

    <v-card
      v-for="printer in printers"
      :key="printer.id"
      class="mb-4"
      :data-test="`printer-card-${printer.id}`"
    >
      <v-card-title>
        <v-text-field
          :model-value="printer.name"
          density="compact"
          hide-details
          :data-test="`printer-name-${printer.id}`"
          @change="(event: Event) => onRename(printer.id, (event.target as HTMLInputElement).value)"
        />
      </v-card-title>
      <v-card-text>
        <ConnectionStatusChip :status="statuses[printer.id] ?? 'disconnected'" />
      </v-card-text>
      <v-card-actions>
        <v-btn
          :data-test="`connect-button-${printer.id}`"
          color="primary"
          :loading="statuses[printer.id] === 'connecting'"
          @click="onConnect(printer.id)"
        >
          Connect
        </v-btn>
        <v-btn :data-test="`disconnect-button-${printer.id}`" @click="onDisconnect(printer.id)">
          Disconnect
        </v-btn>
        <v-btn
          :data-test="`test-print-button-${printer.id}`"
          :disabled="statuses[printer.id] !== 'connected'"
          @click="onTestPrint(printer.id)"
        >
          Print Test Bill
        </v-btn>
        <v-btn :data-test="`remove-button-${printer.id}`" color="error" @click="onRemove(printer.id)">
          Xoá
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

const {
  printers,
  statuses,
  knownDevices,
  addPrinter,
  renamePrinter,
  removePrinter,
  connect,
  disconnect,
  scan,
  testPrint,
} = usePrinter()

const newPrinterName = ref('')
const newPrinterConnectionType = ref<PrinterConnectionType>('usb')
const newPrinterDriver = ref<PrinterDriverType>('generic-escpos')
const newPrinterAutoConnect = ref(false)
const newPrinterDevice = ref<PrinterDevice | null>(null)
const showError = ref(false)
const errorMessage = ref('')

function showErrorMessage(error: unknown) {
  errorMessage.value = error instanceof Error ? error.message : 'Đã có lỗi xảy ra.'
  showError.value = true
}

async function onScan() {
  try {
    await scan(newPrinterConnectionType.value)
  } catch (error) {
    showErrorMessage(error)
  }
}

function onSelectNewDevice(device: PrinterDevice) {
  newPrinterDevice.value = device
}

async function onAddPrinter() {
  try {
    await addPrinter({
      name: newPrinterName.value,
      driver: newPrinterDriver.value,
      connectionType: newPrinterConnectionType.value,
      device: newPrinterDevice.value,
      autoConnect: newPrinterAutoConnect.value,
    })
    newPrinterName.value = ''
    newPrinterDevice.value = null
  } catch (error) {
    showErrorMessage(error)
  }
}

async function onRename(id: string, name: string) {
  try {
    await renamePrinter(id, name)
  } catch (error) {
    showErrorMessage(error)
  }
}

async function onConnect(id: string) {
  try {
    await connect(id)
  } catch (error) {
    showErrorMessage(error)
  }
}

async function onDisconnect(id: string) {
  try {
    await disconnect(id)
  } catch (error) {
    showErrorMessage(error)
  }
}

async function onTestPrint(id: string) {
  try {
    await testPrint(id)
  } catch (error) {
    showErrorMessage(error)
  }
}

async function onRemove(id: string) {
  try {
    await removePrinter(id)
  } catch (error) {
    showErrorMessage(error)
  }
}
</script>
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/modules/printer/views/PrinterSettingsView.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Run the full test suite and type-check**

Run: `npm run test:unit -- --run`
Expected: all tests pass.

Run: `npm run type-check`
Expected: exit code 0.

- [ ] **Step 6: Commit**

```bash
git add src/modules/printer/views/PrinterSettingsView.vue src/modules/printer/views/PrinterSettingsView.test.ts
git commit -m "feat: rework PrinterSettingsView as a per-printer list with add/rename/remove"
```

---

## Task 4: Kotlin `PrinterManager` — multi-session support

**Files:**
- Modify: `android/app/src/main/java/com/ndtcore/pos/printer/manager/PrinterManager.kt`
- Modify: `android/app/src/test/java/com/ndtcore/pos/printer/manager/PrinterManagerTest.kt`

**Interfaces:**
- Consumes: `DriverRegistry`, `ConnectionRegistry` (unchanged); `PrinterDriver`, `PrinterConnection`, `ConnectionTarget` (unchanged).
- Produces: `PrinterManager` (`connect(printerId, driverType, connectionType, target)`, `disconnect(printerId)`, `print(printerId, data)`, `testPrint(printerId)`, `getStatus(printerId): PrinterStatus`) — consumed by `PrinterPlugin.kt` (Task 5).

- [ ] **Step 1: Rewrite the failing tests**

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
    var disconnectCallCount = 0

    override fun connect(target: ConnectionTarget) { connected = true }
    override fun disconnect() {
        connected = false
        disconnectCallCount += 1
    }
    override fun write(data: ByteArray) { written = data }
    override fun isConnected(): Boolean = connected
}

class PrinterManagerTest {
    private fun buildManager(): Pair<PrinterManager, MutableList<FakeConnection>> {
        val createdConnections = mutableListOf<FakeConnection>()
        val driverRegistry = DriverRegistry().apply { register("fake-driver") { FakeDriver() } }
        val connectionRegistry = ConnectionRegistry().apply {
            register("fake-connection") {
                val connection = FakeConnection()
                createdConnections.add(connection)
                connection
            }
        }
        return PrinterManager(driverRegistry, connectionRegistry) to createdConnections
    }

    @Test
    fun `connect resolves driver and connection then sets status connected for that printerId`() {
        val (manager, _) = buildManager()
        manager.connect("receipt-printer", "fake-driver", "fake-connection", ConnectionTarget.Usb(1, 2))

        assertEquals(PrinterStatus.CONNECTED, manager.getStatus("receipt-printer"))
    }

    @Test
    fun `reconnecting the same printerId disconnects the previous connection first (regression- Task 19 leak)`() {
        val (manager, connections) = buildManager()
        manager.connect("receipt-printer", "fake-driver", "fake-connection", ConnectionTarget.Usb(1, 2))
        manager.connect("receipt-printer", "fake-driver", "fake-connection", ConnectionTarget.Usb(1, 2))

        assertEquals(1, connections[0].disconnectCallCount)
        assertEquals(2, connections.size)
        assertEquals(PrinterStatus.CONNECTED, manager.getStatus("receipt-printer"))
    }

    @Test
    fun `two different printerIds hold independent sessions`() {
        val (manager, _) = buildManager()
        manager.connect("receipt-printer", "fake-driver", "fake-connection", ConnectionTarget.Usb(1, 2))
        manager.connect("kitchen-printer", "fake-driver", "fake-connection", ConnectionTarget.Usb(3, 4))

        manager.disconnect("receipt-printer")

        assertEquals(PrinterStatus.DISCONNECTED, manager.getStatus("receipt-printer"))
        assertEquals(PrinterStatus.CONNECTED, manager.getStatus("kitchen-printer"))
    }

    @Test
    fun `testPrint writes that printer's driver bytes through its own connection`() {
        val (manager, connections) = buildManager()
        manager.connect("receipt-printer", "fake-driver", "fake-connection", ConnectionTarget.Usb(1, 2))
        manager.testPrint("receipt-printer")

        assertArrayEquals(byteArrayOf(0x01, 0x02), connections[0].written)
    }

    @Test
    fun `print throws when the given printerId has no active session`() {
        val (manager, _) = buildManager()
        assertThrows(IllegalStateException::class.java) { manager.print("unknown-printer", byteArrayOf(0x00)) }
    }

    @Test
    fun `connect throws and leaves no session when the driver is unregistered`() {
        val (manager, _) = buildManager()
        assertThrows(IllegalArgumentException::class.java) {
            manager.connect("receipt-printer", "unregistered-driver", "fake-connection", ConnectionTarget.Usb(1, 2))
        }
        assertEquals(PrinterStatus.DISCONNECTED, manager.getStatus("receipt-printer"))
    }
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd android && ./gradlew testDebugUnitTest --tests "com.ndtcore.pos.printer.manager.PrinterManagerTest"`
Expected: FAIL — `connect`/`getStatus` etc. have the old single-argument signature.

- [ ] **Step 3: Rewrite `PrinterManager.kt`**

```kotlin
// android/app/src/main/java/com/ndtcore/pos/printer/manager/PrinterManager.kt
package com.ndtcore.pos.printer.manager

import com.ndtcore.pos.printer.connection.ConnectionTarget
import com.ndtcore.pos.printer.connection.PrinterConnection
import com.ndtcore.pos.printer.driver.PrinterDriver
import com.ndtcore.pos.printer.registry.ConnectionRegistry
import com.ndtcore.pos.printer.registry.DriverRegistry

enum class PrinterStatus { DISCONNECTED, CONNECTING, CONNECTED, ERROR }

private data class PrinterSession(val driver: PrinterDriver, val connection: PrinterConnection)

class PrinterManager(
    private val driverRegistry: DriverRegistry,
    private val connectionRegistry: ConnectionRegistry,
) {
    private val sessions = mutableMapOf<String, PrinterSession>()

    fun connect(printerId: String, driverType: String, connectionType: String, target: ConnectionTarget) {
        try {
            // Reconnecting the same printerId (including retries) always tears down the
            // previous session first — this is the Task 19 resource-leak fix. A failed
            // disconnect on the stale connection must not block reconnecting.
            sessions.remove(printerId)?.connection?.disconnect()
        } catch (_: Exception) {
        }

        val driver = driverRegistry.resolve(driverType)
        val connection = connectionRegistry.resolve(connectionType)
        connection.connect(target)

        sessions[printerId] = PrinterSession(driver, connection)
    }

    fun disconnect(printerId: String) {
        sessions.remove(printerId)?.connection?.disconnect()
    }

    fun print(printerId: String, data: ByteArray) {
        val session = sessions[printerId] ?: throw IllegalStateException("Chưa kết nối máy in.")
        session.connection.write(data)
    }

    fun testPrint(printerId: String) {
        val session = sessions[printerId] ?: throw IllegalStateException("Chưa kết nối máy in.")
        print(printerId, session.driver.buildTestPrintBytes())
    }

    fun getStatus(printerId: String): PrinterStatus {
        return if (sessions.containsKey(printerId)) PrinterStatus.CONNECTED else PrinterStatus.DISCONNECTED
    }
}
```

Same behavior change as Task 1: a failed `connect()` leaves no session, so `getStatus()` reports `DISCONNECTED`, not `ERROR`. `PrinterStatus.CONNECTING`/`ERROR` remain in the enum only because `PrinterPlugin.kt` (Task 5) reuses this type name for the value it returns to TS — the manager itself never produces those two values.

- [ ] **Step 4: Run it to verify it passes**

Run: `cd android && ./gradlew testDebugUnitTest --tests "com.ndtcore.pos.printer.manager.PrinterManagerTest"`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add android/app/src/main/java/com/ndtcore/pos/printer/manager/PrinterManager.kt android/app/src/test/java/com/ndtcore/pos/printer/manager/PrinterManagerTest.kt
git commit -m "feat(android): rework PrinterManager for concurrent multi-printer sessions"
```

---

## Task 5: `PrinterPlugin.kt` — Capacitor plugin wiring (supersedes original Task 21)

**Files:**
- Create: `android/app/src/main/java/com/ndtcore/pos/printer/PrinterPlugin.kt`
- Create: `android/app/src/main/java/com/ndtcore/pos/printer/driver/DriverDetector.kt`
- Create: `android/app/src/test/java/com/ndtcore/pos/printer/driver/DriverDetectorTest.kt`
- Create: `android/app/src/main/java/com/ndtcore/pos/printer/driver/VendorManagedDriver.kt`
- Modify: `android/app/src/main/java/com/ndtcore/pos/MainActivity.java` (or `.kt` — check what Capacitor's `cap add android` generated in Task 3 of the original plan and match its language; convert to Kotlin if it's Java)

**Interfaces:**
- Consumes: `PrinterManager`, `PrinterStatus` (Task 4); `DriverRegistry`, `ConnectionRegistry` (unchanged); `GenericEscPosDriver` (unchanged); `UsbConnection` (original plan's Task 20 — **implement that task, unmodified, before this one**); `LanConnection` (unchanged); `ConnectionTarget` (unchanged).
- Produces: the `Printer` native plugin, matching the exact `printerId`-aware method shapes in `src/native/printer-plugin/definitions.ts` (Task 1) — verified manually later (original plan's Task 24).

**Design note:** as in the original Task 21, `generic-escpos` is orchestrated through `PrinterManager`; `xprinter`/`epson` (original Tasks 22–23, out of scope here) will manage their own connection via vendor SDK and never touch `PrinterManager`. This task only wires the `generic-escpos` + USB/LAN path.

This class depends on `Context`/`UsbManager`/Capacitor's `Plugin` base and cannot be exercised by a local JUnit test — verification is the build check in Step 8, plus manual testing later (original plan's Task 24). `DriverDetector` is pure logic and does get a real unit test (Step 2).

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
private const val PREFS_KEY_PRINTERS = "printers"

private data class PendingUsbPermission(val printerId: String, val call: PluginCall)

@CapacitorPlugin(name = "Printer")
class PrinterPlugin : Plugin() {
    private lateinit var manager: PrinterManager

    // Android shows one USB permission dialog at a time, so a single pending slot is
    // sufficient for Phase 1. If a second connect() targeting a different not-yet-authorized
    // USB device arrives while one is pending, it overwrites this slot (known limitation —
    // callers should authorize new USB printers one at a time).
    private var pendingUsbPermission: PendingUsbPermission? = null

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
            val pending = pendingUsbPermission ?: return
            pendingUsbPermission = null

            val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
            if (!granted) {
                pending.call.reject("Người dùng từ chối quyền truy cập thiết bị USB.")
                return
            }
            finishConnect(pending.printerId, pending.call.getObject("config")!!, pending.call)
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
        val printerId = call.getString("printerId")
        val config = call.getObject("config")
        if (printerId == null || config == null) {
            call.reject("Thiếu tham số printerId hoặc config.")
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
                pendingUsbPermission = PendingUsbPermission(printerId, call)
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

        finishConnect(printerId, config, call)
    }

    private fun finishConnect(printerId: String, config: JSObject, call: PluginCall) {
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
            manager.connect(printerId, driverType, connectionType, target)
            val result = JSObject()
            result.put("config", config)
            call.resolve(result)
        } catch (error: Exception) {
            call.reject(error.message, error)
        }
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        val printerId = call.getString("printerId")
        if (printerId == null) {
            call.reject("Thiếu tham số printerId.")
            return
        }
        manager.disconnect(printerId)
        call.resolve()
    }

    @PluginMethod
    fun print(call: PluginCall) {
        val printerId = call.getString("printerId")
        val dataArray = call.getArray("data")
        if (printerId == null || dataArray == null) {
            call.reject("Thiếu tham số printerId hoặc data.")
            return
        }
        val bytes = ByteArray(dataArray.length()) { i -> (dataArray.get(i) as Int).toByte() }
        try {
            manager.print(printerId, bytes)
            call.resolve()
        } catch (error: Exception) {
            call.reject(error.message, error)
        }
    }

    @PluginMethod
    fun testPrint(call: PluginCall) {
        val printerId = call.getString("printerId")
        if (printerId == null) {
            call.reject("Thiếu tham số printerId.")
            return
        }
        try {
            manager.testPrint(printerId)
            call.resolve()
        } catch (error: Exception) {
            call.reject(error.message, error)
        }
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val printerId = call.getString("printerId")
        if (printerId == null) {
            call.reject("Thiếu tham số printerId.")
            return
        }
        val result = JSObject()
        result.put("status", manager.getStatus(printerId).name.lowercase())
        call.resolve(result)
    }

    @PluginMethod
    fun savePrinters(call: PluginCall) {
        val configs = call.getArray("configs")
        if (configs == null) {
            call.reject("Thiếu tham số configs.")
            return
        }
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(PREFS_KEY_PRINTERS, configs.toString())
            .apply()
        call.resolve()
    }

    @PluginMethod
    fun loadPrinters(call: PluginCall) {
        val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(PREFS_KEY_PRINTERS, null)

        val result = JSObject()
        result.put("configs", if (raw != null) JSArray(raw) else JSArray())
        call.resolve(result)
    }
}
```

- [ ] **Step 2: Add `DriverDetector` (vendor-ID → driver suggestion, per original spec §5) and its test**

```kotlin
// android/app/src/main/java/com/ndtcore/pos/printer/driver/DriverDetector.kt
package com.ndtcore.pos.printer.driver

private val KNOWN_VENDOR_IDS = mapOf(
    0x04B8 to "epson",
)

object DriverDetector {
    fun suggestDriver(vendorId: Int): String {
        return KNOWN_VENDOR_IDS[vendorId] ?: "generic-escpos"
    }
}
```

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

- [ ] **Step 3: Add the `VendorManagedDriver` interface**

```kotlin
// android/app/src/main/java/com/ndtcore/pos/printer/driver/VendorManagedDriver.kt
package com.ndtcore.pos.printer.driver

/**
 * Implemented by drivers that own their connection via a vendor SDK (XPrinter, Epson) instead
 * of going through `PrinterConnection`/`ConnectionRegistry` — see the original design spec §4
 * and original plan Tasks 22–23 (out of scope here; those tasks will need their own
 * printerId-keyed tracking inside PrinterPlugin.kt when implemented).
 */
interface VendorManagedDriver {
    fun testPrint()
}
```

- [ ] **Step 4: Register the plugin in `MainActivity`**

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

- [ ] **Step 5: Confirm `AndroidManifest.xml` has internet permission for LAN printing**

```xml
<uses-permission android:name="android.permission.INTERNET" />
```

- [ ] **Step 6: Verify the project builds**

Run: `cd android && ./gradlew assembleDebug`
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 7: Commit**

```bash
git add android/app/src/main/java/com/ndtcore/pos android/app/src/test/java/com/ndtcore/pos android/app/src/main/AndroidManifest.xml
git commit -m "feat(android): wire up printerId-aware PrinterPlugin and register it in MainActivity"
```
