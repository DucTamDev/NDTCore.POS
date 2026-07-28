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

const STORAGE_KEY = 'ndtcore_pos_printer_config'

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

  async connect(options: { config: PrinterConfig }) {
    const config = await manager.connect(options.config)
    return { config }
  }

  async disconnect() {
    await manager.disconnect()
  }

  async print(options: { data: number[] }) {
    await manager.print(new Uint8Array(options.data))
  }

  async testPrint() {
    await manager.testPrint()
  }

  async getStatus() {
    return { status: manager.getStatus() }
  }

  async saveConfig(options: { config: PrinterConfig }) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(options.config))
  }

  async loadConfig() {
    const raw = localStorage.getItem(STORAGE_KEY)
    return { config: raw ? (JSON.parse(raw) as PrinterConfig) : null }
  }
}
