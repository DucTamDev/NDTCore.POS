// android/app/src/main/java/com/ndtcore/pos/printer/driver/VendorManagedDriver.kt
package com.ndtcore.pos.printer.driver

/**
 * Implemented by drivers that own their connection via a vendor SDK (XPrinter, Epson) instead
 * of going through `PrinterConnection`/`ConnectionRegistry` — see the original design spec §4
 * and original plan Tasks 22–23 (out of scope here; those tasks will need their own
 * printerId-keyed tracking inside PrinterPlugin.kt when implemented).
 */
interface VendorManagedDriver {
    fun testPrint()
}
