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
