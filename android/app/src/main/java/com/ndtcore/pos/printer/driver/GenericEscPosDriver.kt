package com.ndtcore.pos.printer.driver

import java.io.ByteArrayOutputStream

class GenericEscPosDriver : PrinterDriver {
    override fun buildTestPrintBytes(): ByteArray {
        val lines = listOf(
            "NDT Bubble Tea",
            "",
            "Order #1001",
            "Classic Milk Tea",
            "Pearl",
            "Sugar 100%",
            "Ice Normal",
            "-------------------------",
            "TOTAL",
            "\$8.50",
            "",
            "Thank You",
            "",
            "",
            "",
        )

        val output = ByteArrayOutputStream()
        output.write(byteArrayOf(0x1B, 0x40)) // ESC @ — initialize
        for (line in lines) {
            output.write(line.toByteArray(Charsets.US_ASCII))
            output.write(0x0A)
        }
        output.write(byteArrayOf(0x1D, 0x56, 0x00)) // GS V 0 — full cut

        return output.toByteArray()
    }
}
