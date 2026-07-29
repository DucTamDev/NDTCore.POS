package com.ndtcore.pos.printer.connection

interface PrinterConnection {
    fun connect(target: ConnectionTarget)
    fun disconnect()
    fun write(data: ByteArray)
    fun isConnected(): Boolean
}
