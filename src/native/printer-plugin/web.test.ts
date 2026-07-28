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
