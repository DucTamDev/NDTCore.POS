import type { PrinterConnectionType } from '../definitions'
import type { PrinterConnection } from '../internal/types'

export class ConnectionRegistry {
  private readonly factories = new Map<PrinterConnectionType, () => PrinterConnection>()

  register(type: PrinterConnectionType, factory: () => PrinterConnection): void {
    this.factories.set(type, factory)
  }

  resolve(type: PrinterConnectionType): PrinterConnection {
    const factory = this.factories.get(type)
    if (!factory) {
      throw new Error(`Connection "${type}" chưa được đăng ký.`)
    }
    return factory()
  }
}
