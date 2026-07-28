import type { PrinterConnection } from '../internal/types'
import type { PrinterDevice, UsbPrinterDevice } from '../definitions'

const CHUNK_SIZE = 4096

function isUsbDevice(device: PrinterDevice): device is UsbPrinterDevice {
  return device.connectionType === 'usb'
}

function findBulkOutEndpoint(
  device: USBDevice,
): { interfaceNumber: number; endpointNumber: number } | null {
  const configuration = device.configuration
  if (!configuration) return null

  for (const iface of configuration.interfaces) {
    const outEndpoint = iface.alternate.endpoints.find((e) => e.direction === 'out')
    if (outEndpoint) {
      return { interfaceNumber: iface.interfaceNumber, endpointNumber: outEndpoint.endpointNumber }
    }
  }
  return null
}

function toUsbPrinterDevice(device: USBDevice): UsbPrinterDevice {
  return {
    connectionType: 'usb',
    vendorId: device.vendorId,
    productId: device.productId,
    productName: device.productName ?? null,
    serialNumber: device.serialNumber ?? null,
  }
}

export class UsbConnection implements PrinterConnection {
  private device: USBDevice | null = null
  private outEndpointNumber: number | null = null

  async pickDevice(): Promise<UsbPrinterDevice> {
    if (!('usb' in navigator)) {
      throw new Error('Trình duyệt không hỗ trợ WebUSB.')
    }
    const device = await navigator.usb.requestDevice({ filters: [] })
    return toUsbPrinterDevice(device)
  }

  async listKnownDevices(): Promise<UsbPrinterDevice[]> {
    if (!('usb' in navigator)) return []
    const devices = await navigator.usb.getDevices()
    return devices.map(toUsbPrinterDevice)
  }

  async connectTo(target: PrinterDevice): Promise<void> {
    if (!isUsbDevice(target)) {
      throw new Error('UsbConnection chỉ nhận thiết bị USB.')
    }
    if (!('usb' in navigator)) {
      throw new Error('Trình duyệt không hỗ trợ WebUSB.')
    }

    const known = await navigator.usb.getDevices()
    const match =
      (target.serialNumber && known.find((d) => d.serialNumber === target.serialNumber)) ||
      known.find((d) => d.vendorId === target.vendorId && d.productId === target.productId)

    const device =
      match ??
      (await navigator.usb.requestDevice({
        filters: [{ vendorId: target.vendorId, productId: target.productId }],
      }))

    await device.open()
    if (!device.configuration) {
      const configurationValue = device.configurations[0]?.configurationValue
      if (configurationValue === undefined) {
        throw new Error('Thiết bị USB không có configuration khả dụng.')
      }
      await device.selectConfiguration(configurationValue)
    }

    const endpoint = findBulkOutEndpoint(device)
    if (!endpoint) {
      throw new Error('Không tìm thấy cổng gửi dữ liệu (OUT endpoint) trên thiết bị USB này.')
    }
    await device.claimInterface(endpoint.interfaceNumber)

    this.device = device
    this.outEndpointNumber = endpoint.endpointNumber
  }

  async disconnect(): Promise<void> {
    if (this.device) {
      await this.device.close()
    }
    this.device = null
    this.outEndpointNumber = null
  }

  async write(data: Uint8Array): Promise<void> {
    if (!this.device || this.outEndpointNumber === null) {
      throw new Error('Chưa kết nối máy in USB.')
    }
    for (let offset = 0; offset < data.length; offset += CHUNK_SIZE) {
      const chunk = data.slice(offset, offset + CHUNK_SIZE)
      const result = await this.device.transferOut(this.outEndpointNumber, chunk)
      if (result.status !== 'ok') {
        throw new Error(`Gửi lệnh in thất bại: ${result.status}`)
      }
    }
  }

  isConnected(): boolean {
    return this.device !== null
  }
}
