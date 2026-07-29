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

  it('does not resurrect printer state when connect() completes after removePrinter() is called', async () => {
    const store = usePrinterStore()
    store.printers = [receiptPrinter]

    let resolvePrinterConnect: ((value: { config: PrinterConfig }) => void) | null = null
    let rejectPrinterConnect: ((reason?: any) => void) | null = null

    vi.mocked(Printer.connect).mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          resolvePrinterConnect = resolve
          rejectPrinterConnect = reject
        })
    )
    vi.mocked(Printer.disconnect).mockResolvedValue(undefined)

    // Start connect but don't await
    const connectPromise = store.connect('receipt-printer')

    // Remove printer while connect is still pending
    await store.removePrinter('receipt-printer')

    // Verify disconnect was called
    expect(Printer.disconnect).toHaveBeenCalledWith({ printerId: 'receipt-printer' })

    // Verify printer is gone from list and state is clean
    expect(store.printers).toEqual([])
    expect(store.statuses['receipt-printer']).toBeUndefined()

    // Now resolve the pending connect
    resolvePrinterConnect!({ config: receiptPrinter })

    // Let connect complete
    await connectPromise.catch(() => {})

    // Verify printer state remains gone (not resurrected)
    expect(store.printers).toEqual([])
    expect(store.statuses['receipt-printer']).toBeUndefined()
    expect(store.errorMessages['receipt-printer']).toBeUndefined()
  })

  it('tears down the native session Printer.connect() just created when removePrinter() already ran during the in-flight connect()', async () => {
    const store = usePrinterStore()
    store.printers = [receiptPrinter]

    let resolvePrinterConnect: ((value: { config: PrinterConfig }) => void) | null = null

    vi.mocked(Printer.connect).mockImplementation(
      () =>
        new Promise((resolve) => {
          resolvePrinterConnect = resolve
        })
    )
    vi.mocked(Printer.disconnect).mockResolvedValue(undefined)

    const connectPromise = store.connect('receipt-printer')

    // removePrinter() finds no session yet (Printer.connect hasn't resolved), so its own
    // Printer.disconnect() call is a no-op on the native side — but it still clears store state.
    await store.removePrinter('receipt-printer')
    expect(Printer.disconnect).toHaveBeenCalledTimes(1)

    // Printer.connect() now resolves — the native session is created AFTER removal.
    resolvePrinterConnect!({ config: receiptPrinter })
    await connectPromise

    // connect()'s success-path guard must detect the printer is gone and tear down the
    // just-created session itself — a second disconnect() call for the same id.
    expect(Printer.disconnect).toHaveBeenCalledTimes(2)
    expect(Printer.disconnect).toHaveBeenNthCalledWith(2, { printerId: 'receipt-printer' })
  })
})
