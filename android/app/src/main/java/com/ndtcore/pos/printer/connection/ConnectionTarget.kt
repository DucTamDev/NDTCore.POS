package com.ndtcore.pos.printer.connection

sealed class ConnectionTarget {
    data class Usb(val vendorId: Int, val productId: Int) : ConnectionTarget()
    data class Lan(val ip: String, val port: Int) : ConnectionTarget()
}
