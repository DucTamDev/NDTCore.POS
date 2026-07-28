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
