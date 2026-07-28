import { defineStore } from 'pinia'
import { Printer } from '@/native/printer-plugin'
import type {
  PrinterConfig,
  PrinterStatus,
  PrinterDevice,
  PrinterConnectionType,
} from '@/native/printer-plugin/definitions'

export const usePrinterStore = defineStore('printer', {
  state: () => ({
    status: 'disconnected' as PrinterStatus,
    config: null as PrinterConfig | null,
    knownDevices: [] as PrinterDevice[],
  }),
  actions: {
    async loadConfig(): Promise<void> {
      const { config } = await Printer.loadConfig()
      this.config = config
    },

    async scan(connectionType: PrinterConnectionType): Promise<PrinterDevice[]> {
      const { devices } = await Printer.scanPrinters({ connectionType })
      this.knownDevices = devices
      return devices
    },

    async connect(config: PrinterConfig): Promise<void> {
      this.status = 'connecting'
      try {
        const result = await Printer.connect({ config })
        this.config = result.config
        this.status = 'connected'
        await Printer.saveConfig({ config: result.config })
      } catch (error) {
        this.status = 'error'
        throw error
      }
    },

    async disconnect(): Promise<void> {
      await Printer.disconnect()
      this.status = 'disconnected'
    },

    async testPrint(): Promise<void> {
      await Printer.testPrint()
    },
  },
})
