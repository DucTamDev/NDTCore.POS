package com.ndtcore.pos.printer.manager

import com.ndtcore.pos.printer.connection.ConnectionTarget
import com.ndtcore.pos.printer.connection.PrinterConnection
import com.ndtcore.pos.printer.driver.PrinterDriver
import com.ndtcore.pos.printer.registry.ConnectionRegistry
import com.ndtcore.pos.printer.registry.DriverRegistry

enum class PrinterStatus { DISCONNECTED, CONNECTING, CONNECTED, ERROR }

private data class PrinterSession(val driver: PrinterDriver, val connection: PrinterConnection)

class PrinterManager(
    private val driverRegistry: DriverRegistry,
    private val connectionRegistry: ConnectionRegistry,
) {
    private val sessions = mutableMapOf<String, PrinterSession>()

    fun connect(printerId: String, driverType: String, connectionType: String, target: ConnectionTarget) {
        try {
            // Reconnecting the same printerId (including retries) always tears down the
            // previous session first — this is the Task 19 resource-leak fix. A failed
            // disconnect on the stale connection must not block reconnecting.
            sessions.remove(printerId)?.connection?.disconnect()
        } catch (_: Exception) {
        }

        val driver = driverRegistry.resolve(driverType)
        val connection = connectionRegistry.resolve(connectionType)
        connection.connect(target)

        sessions[printerId] = PrinterSession(driver, connection)
    }

    fun disconnect(printerId: String) {
        sessions.remove(printerId)?.connection?.disconnect()
    }

    fun print(printerId: String, data: ByteArray) {
        val session = sessions[printerId] ?: throw IllegalStateException("Chưa kết nối máy in.")
        session.connection.write(data)
    }

    fun testPrint(printerId: String) {
        val session = sessions[printerId] ?: throw IllegalStateException("Chưa kết nối máy in.")
        print(printerId, session.driver.buildTestPrintBytes())
    }

    fun getStatus(printerId: String): PrinterStatus {
        return if (sessions.containsKey(printerId)) PrinterStatus.CONNECTED else PrinterStatus.DISCONNECTED
    }
}
