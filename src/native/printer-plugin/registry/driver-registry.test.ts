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
