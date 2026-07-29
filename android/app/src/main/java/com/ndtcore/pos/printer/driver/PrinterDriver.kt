package com.ndtcore.pos.printer.driver

interface PrinterDriver {
    fun buildTestPrintBytes(): ByteArray
}
