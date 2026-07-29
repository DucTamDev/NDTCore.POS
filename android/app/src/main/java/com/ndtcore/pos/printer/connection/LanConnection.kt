package com.ndtcore.pos.printer.connection

import java.io.OutputStream
import java.net.Socket

class LanConnection : PrinterConnection {
    private var socket: Socket? = null
    private var outputStream: OutputStream? = null

    override fun connect(target: ConnectionTarget) {
        require(target is ConnectionTarget.Lan) { "LanConnection chỉ nhận ConnectionTarget.Lan." }
        val newSocket = Socket(target.ip, target.port)
        socket = newSocket
        outputStream = newSocket.getOutputStream()
    }

    override fun disconnect() {
        socket?.close()
        socket = null
        outputStream = null
    }

    override fun write(data: ByteArray) {
        val stream = outputStream ?: throw IllegalStateException("Chưa kết nối máy in qua LAN.")
        stream.write(data)
        stream.flush()
    }

    override fun isConnected(): Boolean = socket?.isConnected == true
}
