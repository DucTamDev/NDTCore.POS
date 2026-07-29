package com.ndtcore.pos.printer.driver

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GenericEscPosDriverTest {
    @Test
    fun `buildTestPrintBytes starts with ESC init command`() {
        val bytes = GenericEscPosDriver().buildTestPrintBytes()
        assertArrayEquals(byteArrayOf(0x1B, 0x40), bytes.copyOfRange(0, 2))
    }

    @Test
    fun `buildTestPrintBytes ends with full cut command`() {
        val bytes = GenericEscPosDriver().buildTestPrintBytes()
        assertArrayEquals(byteArrayOf(0x1D, 0x56, 0x00), bytes.copyOfRange(bytes.size - 3, bytes.size))
    }

    @Test
    fun `buildTestPrintBytes contains the sample bill text`() {
        val text = String(GenericEscPosDriver().buildTestPrintBytes(), Charsets.US_ASCII)
        assertTrue(text.contains("NDT Bubble Tea"))
        assertTrue(text.contains("TOTAL"))
        assertTrue(text.contains("Thank You"))
    }
}
