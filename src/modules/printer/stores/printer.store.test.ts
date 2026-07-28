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
