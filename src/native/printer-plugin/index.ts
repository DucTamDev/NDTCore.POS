import { registerPlugin } from '@capacitor/core'
import type { PrinterPlugin } from './definitions'

export const Printer = registerPlugin<PrinterPlugin>('Printer', {
  web: () => import('./web').then((m) => new m.PrinterWeb()),
})

export * from './definitions'
