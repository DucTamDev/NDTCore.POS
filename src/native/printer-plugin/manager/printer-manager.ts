import type { DriverRegistry } from '../registry/driver-registry'
import type { ConnectionRegistry } from '../registry/connection-registry'
import type { PrinterDriver, PrinterConnection } from '../internal/types'
import type { PrinterConfig, PrinterStatus, PrinterConnectionType, PrinterDevice } from '../definitions'
import type { UsbConnection } from '../connections/usb-connection'

interface PrinterSession {
  driver: PrinterDriver
  connection: PrinterConnection
}

export class PrinterManager {
  private sessions = new Map<string, PrinterSession>()

  constructor(
    private readonly driverRegistry: DriverRegistry,
    private readonly connectionRegistry: ConnectionRegistry,
  ) {}

  async scan(connectionType: PrinterConnectionType): Promise<PrinterDevice[]> {
    if (connectionType !== 'usb') return []
    const connection = this.connectionRegistry.resolve('usb') as UsbConnection
    return connection.listKnownDevices()
  }

  async connect(printerId: string, config: PrinterConfig): Promise<PrinterConfig> {
    // Reconnecting the same printerId (including retries) always tears down the
    // previous session first — this is the Task 19 resource-leak fix.
    const existing = this.sessions.get(printerId)
    if (existing) {
      await existing.connection.disconnect().catch(() => {})
      this.sessions.delete(printerId)
    }

    const driver = this.driverRegistry.resolve(config.driver)
    const connection = this.connectionRegistry.resolve(config.connectionType)

    let device = config.device
    if (!device) {
      if (config.connectionType !== 'usb') {
        throw new Error(
          `Không thể tự chọn thiết bị cho connection type "${config.connectionType}" trên Web.`,
        )
      }
      device = await (connection as UsbConnection).pickDevice()
    }

    await connection.connectTo(device)

    this.sessions.set(printerId, { driver, connection })

    return { ...config, device }
  }

  async disconnect(printerId: string): Promise<void> {
    // Delete from the map before awaiting disconnect() — a rejecting disconnect() (e.g. the
    // USB device was physically unplugged) must not leave the session stuck as 'connected'
    // forever. Matches the Kotlin PrinterManager's `sessions.remove(printerId)?...disconnect()`
    // ordering.
    const session = this.sessions.get(printerId)
    this.sessions.delete(printerId)
    await session?.connection.disconnect()
  }

  async print(printerId: string, data: Uint8Array): Promise<void> {
    const session = this.sessions.get(printerId)
    if (!session) {
      throw new Error('Chưa kết nối máy in.')
    }
    await session.connection.write(data)
  }

  async testPrint(printerId: string): Promise<void> {
    const session = this.sessions.get(printerId)
    if (!session) {
      throw new Error('Chưa kết nối máy in.')
    }
    await this.print(printerId, session.driver.buildTestPrintBytes())
  }

  getStatus(printerId: string): PrinterStatus {
    return this.sessions.has(printerId) ? 'connected' : 'disconnected'
  }
}
