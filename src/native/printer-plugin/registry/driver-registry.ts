import type { PrinterDriverType } from '../definitions'
import type { PrinterDriver } from '../internal/types'

export class DriverRegistry {
  private readonly factories = new Map<PrinterDriverType, () => PrinterDriver>()

  register(type: PrinterDriverType, factory: () => PrinterDriver): void {
    this.factories.set(type, factory)
  }

  resolve(type: PrinterDriverType): PrinterDriver {
    const factory = this.factories.get(type)
    if (!factory) {
      throw new Error(`Driver "${type}" chưa được đăng ký.`)
    }
    return factory()
  }
}
