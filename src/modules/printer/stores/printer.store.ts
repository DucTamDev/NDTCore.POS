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
    printers: [] as PrinterConfig[],
    statuses: {} as Record<string, PrinterStatus>,
    errorMessages: {} as Record<string, string | null>,
    knownDevices: [] as PrinterDevice[],
  }),
  actions: {
    async loadPrinters(): Promise<void> {
      const { configs } = await Printer.loadPrinters()
      this.printers = configs
    },

    async addPrinter(input: Omit<PrinterConfig, 'id'>): Promise<void> {
      const printer: PrinterConfig = { ...input, id: crypto.randomUUID() }
      this.printers.push(printer)
      await Printer.savePrinters({ configs: this.printers })
    },

    async removePrinter(id: string): Promise<void> {
      await this.disconnect(id).catch(() => {})
      this.printers = this.printers.filter((printer) => printer.id !== id)
      delete this.statuses[id]
      delete this.errorMessages[id]
      await Printer.savePrinters({ configs: this.printers })
    },

    async renamePrinter(id: string, name: string): Promise<void> {
      const printer = this.printers.find((p) => p.id === id)
      if (!printer) return
      printer.name = name
      await Printer.savePrinters({ configs: this.printers })
    },

    async scan(connectionType: PrinterConnectionType): Promise<PrinterDevice[]> {
      const { devices } = await Printer.scanPrinters({ connectionType })
      this.knownDevices = devices
      return devices
    },

    async connect(id: string): Promise<void> {
      const printer = this.printers.find((p) => p.id === id)
      if (!printer) {
        throw new Error(`Không tìm thấy cấu hình máy in với id "${id}".`)
      }

      this.statuses[id] = 'connecting'
      this.errorMessages[id] = null
      try {
        const result = await Printer.connect({ printerId: id, config: printer })
        if (!this.printers.some((p) => p.id === id)) {
          // removePrinter() ran while connect() was in flight — it called Printer.disconnect()
          // before this native session existed (a no-op then), so the session that JUST got
          // created above is otherwise orphaned (an open USBDevice with a claimed interface that
          // nothing can ever call disconnect() on again). Tear it down immediately.
          await Printer.disconnect({ printerId: id }).catch(() => {})
          return
        }
        Object.assign(printer, result.config)
        this.statuses[id] = 'connected'
        await Printer.savePrinters({ configs: this.printers })
      } catch (error) {
        if (!this.printers.some((p) => p.id === id)) throw error
        this.statuses[id] = 'error'
        this.errorMessages[id] = error instanceof Error ? error.message : 'Đã có lỗi xảy ra.'
        throw error
      }
    },

    async disconnect(id: string): Promise<void> {
      await Printer.disconnect({ printerId: id })
      this.statuses[id] = 'disconnected'
    },

    async testPrint(id: string): Promise<void> {
      await Printer.testPrint({ printerId: id })
    },

    async autoConnectAll(): Promise<void> {
      const autoConnectPrinters = this.printers.filter((printer) => printer.autoConnect)
      await Promise.allSettled(autoConnectPrinters.map((printer) => this.connect(printer.id)))
    },
  },
})
