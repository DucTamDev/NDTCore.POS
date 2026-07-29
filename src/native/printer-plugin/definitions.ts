export type PrinterConnectionType = 'usb' | 'lan' | 'bluetooth'

export type PrinterDriverType = 'generic-escpos' | 'xprinter' | 'epson' | 'star' | 'sunmi'

export type PrinterStatus = 'disconnected' | 'connecting' | 'connected' | 'error'

export interface UsbPrinterDevice {
  connectionType: 'usb'
  vendorId: number
  productId: number
  productName: string | null
  serialNumber: string | null
}

export interface LanPrinterDevice {
  connectionType: 'lan'
  ip: string
  port: number
}

export type PrinterDevice = UsbPrinterDevice | LanPrinterDevice

export interface PrinterConfig {
  id: string
  name: string
  driver: PrinterDriverType
  connectionType: PrinterConnectionType
  device: PrinterDevice | null
  autoConnect: boolean
}

export interface PrinterPlugin {
  scanPrinters(options: { connectionType: PrinterConnectionType }): Promise<{ devices: PrinterDevice[] }>
  connect(options: { printerId: string; config: PrinterConfig }): Promise<{ config: PrinterConfig }>
  disconnect(options: { printerId: string }): Promise<void>
  print(options: { printerId: string; data: number[] }): Promise<void>
  testPrint(options: { printerId: string }): Promise<void>
  getStatus(options: { printerId: string }): Promise<{ status: PrinterStatus }>
  savePrinters(options: { configs: PrinterConfig[] }): Promise<void>
  loadPrinters(): Promise<{ configs: PrinterConfig[] }>
}
