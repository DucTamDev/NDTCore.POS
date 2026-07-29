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
