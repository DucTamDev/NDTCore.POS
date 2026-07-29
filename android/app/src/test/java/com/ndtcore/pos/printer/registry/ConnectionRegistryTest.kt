package com.ndtcore.pos.printer.registry

import com.ndtcore.pos.printer.connection.ConnectionTarget
import com.ndtcore.pos.printer.connection.PrinterConnection
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

private class FakeConnection : PrinterConnection {
    override fun connect(target: ConnectionTarget) {}
    override fun disconnect() {}
    override fun write(data: ByteArray) {}
    override fun isConnected(): Boolean = false
}

class ConnectionRegistryTest {
    @Test
    fun `resolve returns a registered connection`() {
        val registry = ConnectionRegistry()
        registry.register("usb") { FakeConnection() }

        assertTrue(registry.resolve("usb") is FakeConnection)
    }

    @Test
    fun `resolve throws a clear error when the type is not registered`() {
        val registry = ConnectionRegistry()
        val error = assertThrows(IllegalArgumentException::class.java) { registry.resolve("lan") }
        assertTrue(error.message!!.contains("lan"))
    }
}
