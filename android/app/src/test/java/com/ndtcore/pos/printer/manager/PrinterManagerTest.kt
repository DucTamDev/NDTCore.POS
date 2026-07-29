package com.ndtcore.pos.printer.manager

import com.ndtcore.pos.printer.connection.ConnectionTarget
import com.ndtcore.pos.printer.connection.PrinterConnection
import com.ndtcore.pos.printer.driver.PrinterDriver
import com.ndtcore.pos.printer.registry.ConnectionRegistry
import com.ndtcore.pos.printer.registry.DriverRegistry
import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

private class FakeDriver : PrinterDriver {
    override fun buildTestPrintBytes(): ByteArray = byteArrayOf(0x01, 0x02)
}

private class FakeConnection : PrinterConnection {
    var connected = false
    var written: ByteArray? = null

    override fun connect(target: ConnectionTarget) { connected = true }
    override fun disconnect() { connected = false }
    override fun write(data: ByteArray) { written = data }
    override fun isConnected(): Boolean = connected
}

class PrinterManagerTest {
    private fun buildManager(): Pair<PrinterManager, FakeConnection> {
        val connection = FakeConnection()
        val driverRegistry = DriverRegistry().apply { register("fake-driver") { FakeDriver() } }
        val connectionRegistry = ConnectionRegistry().apply { register("fake-connection") { connection } }
        return PrinterManager(driverRegistry, connectionRegistry) to connection
    }

    @Test
    fun `connect resolves driver and connection then sets status connected`() {
        val (manager, connection) = buildManager()
        manager.connect("fake-driver", "fake-connection", ConnectionTarget.Usb(1, 2))

        assertEquals(PrinterStatus.CONNECTED, manager.status)
        assertEquals(true, connection.connected)
    }

    @Test
    fun `testPrint writes driver bytes through the connection`() {
        val (manager, connection) = buildManager()
        manager.connect("fake-driver", "fake-connection", ConnectionTarget.Usb(1, 2))
        manager.testPrint()

        assertArrayEquals(byteArrayOf(0x01, 0x02), connection.written)
    }

    @Test
    fun `disconnect resets status to disconnected`() {
        val (manager, connection) = buildManager()
        manager.connect("fake-driver", "fake-connection", ConnectionTarget.Usb(1, 2))
        manager.disconnect()

        assertEquals(PrinterStatus.DISCONNECTED, manager.status)
        assertEquals(false, connection.connected)
    }

    @Test
    fun `print throws when not connected`() {
        val (manager, _) = buildManager()
        assertThrows(IllegalStateException::class.java) { manager.print(byteArrayOf(0x00)) }
    }
}
