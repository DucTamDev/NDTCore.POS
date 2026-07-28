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
  driver: PrinterDriverType
  connectionType: PrinterConnectionType
  device: PrinterDevice | null
  autoConnect: boolean
}

export interface PrinterPlugin {
  scanPrinters(options: { connectionType: PrinterConnectionType }): Promise<{ devices: PrinterDevice[] }>
  connect(options: { config: PrinterConfig }): Promise<{ config: PrinterConfig }>
  disconnect(): Promise<void>
  print(options: { data: number[] }): Promise<void>
  testPrint(): Promise<void>
  getStatus(): Promise<{ status: PrinterStatus }>
  saveConfig(options: { config: PrinterConfig }): Promise<void>
  loadConfig(): Promise<{ config: PrinterConfig | null }>
}
