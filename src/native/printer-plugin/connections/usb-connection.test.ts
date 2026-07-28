import { describe, it, expect, vi, beforeEach } from 'vitest'
import { UsbConnection } from './usb-connection'
import type { UsbPrinterDevice } from '../definitions'

function createFakeUsbDevice(overrides: Record<string, unknown> = {}) {
  return {
    vendorId: 0x0483,
    productId: 0x5743,
    productName: 'Fake Printer',
    serialNumber: 'SN123',
    configuration: {
      interfaces: [
        {
          interfaceNumber: 0,
          alternate: { endpoints: [{ direction: 'out', endpointNumber: 1 }] },
        },
      ],
    },
    configurations: [{ configurationValue: 1 }],
    open: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    selectConfiguration: vi.fn().mockResolvedValue(undefined),
    claimInterface: vi.fn().mockResolvedValue(undefined),
    transferOut: vi.fn().mockResolvedValue({ status: 'ok' }),
    ...overrides,
  } as unknown as USBDevice
}

const targetDevice: UsbPrinterDevice = {
  connectionType: 'usb',
  vendorId: 0x0483,
  productId: 0x5743,
  productName: 'Fake Printer',
  serialNumber: 'SN123',
}

describe('UsbConnection', () => {
  beforeEach(() => {
    vi.stubGlobal('navigator', {
      usb: {
        getDevices: vi.fn().mockResolvedValue([]),
        requestDevice: vi.fn(),
      },
    })
  })

  it('connectTo opens the device, selects a configuration, and claims the interface', async () => {
    const fakeDevice = createFakeUsbDevice()
    vi.mocked(navigator.usb.getDevices).mockResolvedValue([fakeDevice])

    const connection = new UsbConnection()
    await connection.connectTo(targetDevice)

    expect(fakeDevice.open).toHaveBeenCalled()
    expect(fakeDevice.claimInterface).toHaveBeenCalledWith(0)
    expect(connection.isConnected()).toBe(true)
  })

  it('write() sends data through transferOut on the claimed OUT endpoint', async () => {
    const fakeDevice = createFakeUsbDevice()
    vi.mocked(navigator.usb.getDevices).mockResolvedValue([fakeDevice])

    const connection = new UsbConnection()
    await connection.connectTo(targetDevice)
    await connection.write(new Uint8Array([0x1b, 0x40]))

    expect(fakeDevice.transferOut).toHaveBeenCalledWith(1, new Uint8Array([0x1b, 0x40]))
  })

  it('write() throws a clear error when not connected', async () => {
    const connection = new UsbConnection()
    await expect(connection.write(new Uint8Array([0x00]))).rejects.toThrow(
      'Chưa kết nối máy in USB.',
    )
  })

  it('connectTo throws when given a non-USB device', async () => {
    const connection = new UsbConnection()
    await expect(
      connection.connectTo({ connectionType: 'lan', ip: '192.168.1.50', port: 9100 }),
    ).rejects.toThrow('UsbConnection chỉ nhận thiết bị USB.')
  })
})
