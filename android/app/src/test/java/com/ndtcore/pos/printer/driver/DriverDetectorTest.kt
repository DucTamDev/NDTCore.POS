// android/app/src/test/java/com/ndtcore/pos/printer/driver/DriverDetectorTest.kt
package com.ndtcore.pos.printer.driver

import org.junit.Assert.assertEquals
import org.junit.Test

class DriverDetectorTest {
    @Test
    fun `suggests epson for Epson's registered USB vendor ID`() {
        assertEquals("epson", DriverDetector.suggestDriver(0x04B8))
    }

    @Test
    fun `falls back to generic-escpos for unknown vendor IDs`() {
        assertEquals("generic-escpos", DriverDetector.suggestDriver(0x9999))
    }
}
