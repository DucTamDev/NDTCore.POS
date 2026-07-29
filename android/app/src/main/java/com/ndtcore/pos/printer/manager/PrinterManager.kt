package com.ndtcore.pos.printer.manager

import com.ndtcore.pos.printer.connection.ConnectionTarget
import com.ndtcore.pos.printer.connection.PrinterConnection
import com.ndtcore.pos.printer.driver.PrinterDriver
import com.ndtcore.pos.printer.registry.ConnectionRegistry
import com.ndtcore.pos.printer.registry.DriverRegistry

enum class PrinterStatus { DISCONNECTED, CONNECTING, CONNECTED, ERROR }

class PrinterManager(
    private val driverRegistry: DriverRegistry,
    private val connectionRegistry: ConnectionRegistry,
) {
    private var currentDriver: PrinterDriver? = null
    private var currentConnection: PrinterConnection? = null

    var status: PrinterStatus = PrinterStatus.DISCONNECTED
        private set

    fun connect(driverType: String, connectionType: String, target: ConnectionTarget) {
        status = PrinterStatus.CONNECTING
        try {
            val driver = driverRegistry.resolve(driverType)
            val connection = connectionRegistry.resolve(connectionType)
            connection.connect(target)

            currentDriver = driver
            currentConnection = connection
            status = PrinterStatus.CONNECTED
        } catch (error: Exception) {
            status = PrinterStatus.ERROR
            throw error
        }
    }

    fun disconnect() {
        currentConnection?.disconnect()
        currentConnection = null
        currentDriver = null
        status = PrinterStatus.DISCONNECTED
    }

    fun print(data: ByteArray) {
        val connection = currentConnection
        if (connection == null || status != PrinterStatus.CONNECTED) {
            throw IllegalStateException("Chưa kết nối máy in.")
        }
        connection.write(data)
    }

    fun testPrint() {
        val driver = currentDriver ?: throw IllegalStateException("Chưa chọn driver máy in.")
        print(driver.buildTestPrintBytes())
    }
}
