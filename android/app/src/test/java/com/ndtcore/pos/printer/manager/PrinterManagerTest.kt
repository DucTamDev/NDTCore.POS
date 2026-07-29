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
    var disconnectCallCount = 0

    override fun connect(target: ConnectionTarget) { connected = true }
    override fun disconnect() {
        connected = false
        disconnectCallCount += 1
    }
    override fun write(data: ByteArray) { written = data }
    override fun isConnected(): Boolean = connected
}

class PrinterManagerTest {
    private fun buildManager(): Pair<PrinterManager, MutableList<FakeConnection>> {
        val createdConnections = mutableListOf<FakeConnection>()
        val driverRegistry = DriverRegistry().apply { register("fake-driver") { FakeDriver() } }
        val connectionRegistry = ConnectionRegistry().apply {
            register("fake-connection") {
                val connection = FakeConnection()
                createdConnections.add(connection)
                connection
            }
        }
        return PrinterManager(driverRegistry, connectionRegistry) to createdConnections
    }

    @Test
    fun `connect resolves driver and connection then sets status connected for that printerId`() {
        val (manager, _) = buildManager()
        manager.connect("receipt-printer", "fake-driver", "fake-connection", ConnectionTarget.Usb(1, 2))

        assertEquals(PrinterStatus.CONNECTED, manager.getStatus("receipt-printer"))
    }

    @Test
    fun `reconnecting the same printerId disconnects the previous connection first (regression- Task 19 leak)`() {
        val (manager, connections) = buildManager()
        manager.connect("receipt-printer", "fake-driver", "fake-connection", ConnectionTarget.Usb(1, 2))
        manager.connect("receipt-printer", "fake-driver", "fake-connection", ConnectionTarget.Usb(1, 2))

        assertEquals(1, connections[0].disconnectCallCount)
        assertEquals(2, connections.size)
        assertEquals(PrinterStatus.CONNECTED, manager.getStatus("receipt-printer"))
    }

    @Test
    fun `two different printerIds hold independent sessions`() {
        val (manager, _) = buildManager()
        manager.connect("receipt-printer", "fake-driver", "fake-connection", ConnectionTarget.Usb(1, 2))
        manager.connect("kitchen-printer", "fake-driver", "fake-connection", ConnectionTarget.Usb(3, 4))

        manager.disconnect("receipt-printer")

        assertEquals(PrinterStatus.DISCONNECTED, manager.getStatus("receipt-printer"))
        assertEquals(PrinterStatus.CONNECTED, manager.getStatus("kitchen-printer"))
    }

    @Test
    fun `testPrint writes that printer's driver bytes through its own connection`() {
        val (manager, connections) = buildManager()
        manager.connect("receipt-printer", "fake-driver", "fake-connection", ConnectionTarget.Usb(1, 2))
        manager.testPrint("receipt-printer")

        assertArrayEquals(byteArrayOf(0x01, 0x02), connections[0].written)
    }

    @Test
    fun `print throws when the given printerId has no active session`() {
        val (manager, _) = buildManager()
        assertThrows(IllegalStateException::class.java) { manager.print("unknown-printer", byteArrayOf(0x00)) }
    }

    @Test
    fun `connect throws and leaves no session when the driver is unregistered`() {
        val (manager, _) = buildManager()
        assertThrows(IllegalArgumentException::class.java) {
            manager.connect("receipt-printer", "unregistered-driver", "fake-connection", ConnectionTarget.Usb(1, 2))
        }
        assertEquals(PrinterStatus.DISCONNECTED, manager.getStatus("receipt-printer"))
    }
}
