import { storeToRefs } from 'pinia'
import { usePrinterStore } from '../stores/printer.store'

export function usePrinter() {
  const store = usePrinterStore()
  const { status, config, knownDevices } = storeToRefs(store)

  return {
    status,
    config,
    knownDevices,
    loadConfig: store.loadConfig,
    scan: store.scan,
    connect: store.connect,
    disconnect: store.disconnect,
    testPrint: store.testPrint,
  }
}
