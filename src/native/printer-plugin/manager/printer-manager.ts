import type { DriverRegistry } from '../registry/driver-registry'
import type { ConnectionRegistry } from '../registry/connection-registry'
import type { PrinterDriver, PrinterConnection } from '../internal/types'
import type { PrinterConfig, PrinterStatus, PrinterConnectionType, PrinterDevice } from '../definitions'
import type { UsbConnection } from '../connections/usb-connection'

export class PrinterManager {
  private currentDriver: PrinterDriver | null = null
  private currentConnection: PrinterConnection | null = null
  private status: PrinterStatus = 'disconnected'

  constructor(
    private readonly driverRegistry: DriverRegistry,
    private readonly connectionRegistry: ConnectionRegistry,
  ) {}

  async scan(connectionType: PrinterConnectionType): Promise<PrinterDevice[]> {
    if (connectionType !== 'usb') return []
    const connection = this.connectionRegistry.resolve('usb') as UsbConnection
    return connection.listKnownDevices()
  }

  async connect(config: PrinterConfig): Promise<PrinterConfig> {
    this.status = 'connecting'
    try {
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

      this.currentDriver = driver
      this.currentConnection = connection
      this.status = 'connected'

      return { ...config, device }
    } catch (error) {
      this.status = 'error'
      throw error
    }
  }

  async disconnect(): Promise<void> {
    await this.currentConnection?.disconnect()
    this.currentConnection = null
    this.currentDriver = null
    this.status = 'disconnected'
  }

  async print(data: Uint8Array): Promise<void> {
    if (!this.currentConnection || this.status !== 'connected') {
      throw new Error('Chưa kết nối máy in.')
    }
    await this.currentConnection.write(data)
  }

  async testPrint(): Promise<void> {
    if (!this.currentDriver) {
      throw new Error('Chưa chọn driver máy in.')
    }
    await this.print(this.currentDriver.buildTestPrintBytes())
  }

  getStatus(): PrinterStatus {
    return this.status
  }
}
