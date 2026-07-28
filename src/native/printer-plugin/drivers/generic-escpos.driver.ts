import type { PrinterDriver } from '../internal/types'

const ESC = 0x1b
const GS = 0x1d

const TEST_BILL_LINES = [
  'NDT Bubble Tea',
  '',
  'Order #1001',
  'Classic Milk Tea',
  'Pearl',
  'Sugar 100%',
  'Ice Normal',
  '-------------------------',
  'TOTAL',
  '$8.50',
  '',
  'Thank You',
  '',
  '',
  '',
]

export class GenericEscPosDriver implements PrinterDriver {
  buildTestPrintBytes(): Uint8Array {
    const bytes: number[] = [ESC, 0x40] // ESC @ — initialize

    for (const line of TEST_BILL_LINES) {
      bytes.push(...Array.from(new TextEncoder().encode(line)), 0x0a)
    }

    bytes.push(GS, 0x56, 0x00) // GS V 0 — full cut

    return new Uint8Array(bytes)
  }
}
