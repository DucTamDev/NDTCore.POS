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
