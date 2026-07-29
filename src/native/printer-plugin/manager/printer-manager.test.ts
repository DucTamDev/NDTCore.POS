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
