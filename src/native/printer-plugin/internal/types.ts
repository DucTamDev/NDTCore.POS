import type { PrinterDevice } from '../definitions'

export interface PrinterDriver {
  buildTestPrintBytes(): Uint8Array
}

export interface PrinterConnection {
  connectTo(device: PrinterDevice): Promise<void>
  disconnect(): Promise<void>
  write(data: Uint8Array): Promise<void>
  isConnected(): boolean
}
