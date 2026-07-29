import { WebPlugin } from '@capacitor/core'
import type {
  PrinterPlugin as PrinterPluginInterface,
  PrinterConfig,
  PrinterConnectionType,
} from './definitions'
import { DriverRegistry } from './registry/driver-registry'
import { ConnectionRegistry } from './registry/connection-registry'
import { GenericEscPosDriver } from './drivers/generic-escpos.driver'
import { UsbConnection } from './connections/usb-connection'
import { PrinterManager } from './manager/printer-manager'

const STORAGE_KEY = 'ndtcore_pos_printers'

const driverRegistry = new DriverRegistry()
driverRegistry.register('generic-escpos', () => new GenericEscPosDriver())

const connectionRegistry = new ConnectionRegistry()
connectionRegistry.register('usb', () => new UsbConnection())

const manager = new PrinterManager(driverRegistry, connectionRegistry)

export class PrinterWeb extends WebPlugin implements PrinterPluginInterface {
  async scanPrinters(options: { connectionType: PrinterConnectionType }) {
    const devices = await manager.scan(options.connectionType)
    return { devices }
  }

  async connect(options: { printerId: string; config: PrinterConfig }) {
    const config = await manager.connect(options.printerId, options.config)
    return { config }
  }

  async disconnect(options: { printerId: string }) {
    await manager.disconnect(options.printerId)
  }

  async print(options: { printerId: string; data: number[] }) {
    await manager.print(options.printerId, new Uint8Array(options.data))
  }

  async testPrint(options: { printerId: string }) {
    await manager.testPrint(options.printerId)
  }

  async getStatus(options: { printerId: string }) {
    return { status: manager.getStatus(options.printerId) }
  }

  async savePrinters(options: { configs: PrinterConfig[] }) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options.configs))
  }

  async loadPrinters() {
    const raw = localStorage.getItem(STORAGE_KEY)
    return { configs: raw ? (JSON.parse(raw) as PrinterConfig[]) : [] }
  }
}
