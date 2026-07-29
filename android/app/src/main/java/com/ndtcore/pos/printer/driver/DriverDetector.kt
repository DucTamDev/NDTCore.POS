// android/app/src/main/java/com/ndtcore/pos/printer/driver/DriverDetector.kt
package com.ndtcore.pos.printer.driver

private val KNOWN_VENDOR_IDS = mapOf(
    0x04B8 to "epson",
)

object DriverDetector {
    fun suggestDriver(vendorId: Int): String {
        return KNOWN_VENDOR_IDS[vendorId] ?: "generic-escpos"
    }
}
