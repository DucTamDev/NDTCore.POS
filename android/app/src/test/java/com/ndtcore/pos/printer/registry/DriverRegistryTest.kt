package com.ndtcore.pos.printer.registry

import com.ndtcore.pos.printer.driver.PrinterDriver
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test

private class FakeDriver : PrinterDriver {
    override fun buildTestPrintBytes(): ByteArray = byteArrayOf(0x01)
}

class DriverRegistryTest {
    @Test
    fun `resolve returns a registered driver`() {
        val registry = DriverRegistry()
        registry.register("generic-escpos") { FakeDriver() }

        assertTrue(registry.resolve("generic-escpos") is FakeDriver)
    }

    @Test
    fun `resolve throws a clear error when the type is not registered`() {
        val registry = DriverRegistry()
        val error = assertThrows(IllegalArgumentException::class.java) { registry.resolve("epson") }
        assertTrue(error.message!!.contains("epson"))
    }
}
