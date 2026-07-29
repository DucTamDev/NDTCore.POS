import { storeToRefs } from 'pinia'
import { usePrinterStore } from '../stores/printer.store'

export function usePrinter() {
  const store = usePrinterStore()
  const { printers, statuses, errorMessages, knownDevices } = storeToRefs(store)

  return {
    printers,
    statuses,
    errorMessages,
    knownDevices,
    loadPrinters: store.loadPrinters,
    addPrinter: store.addPrinter,
    removePrinter: store.removePrinter,
    renamePrinter: store.renamePrinter,
    scan: store.scan,
    connect: store.connect,
    disconnect: store.disconnect,
    testPrint: store.testPrint,
  }
}
