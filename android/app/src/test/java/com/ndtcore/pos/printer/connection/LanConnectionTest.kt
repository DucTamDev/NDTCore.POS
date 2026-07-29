package com.ndtcore.pos.printer.connection

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.net.ServerSocket
import java.util.concurrent.CompletableFuture
import java.util.concurrent.TimeUnit

class LanConnectionTest {
    @Test
    fun `connect and write sends bytes to the target socket`() {
        val serverSocket = ServerSocket(0)
        val receivedBytes = CompletableFuture<ByteArray>()

        val serverThread = Thread {
            val clientSocket = serverSocket.accept()
            val buffer = ByteArray(4)
            val readCount = clientSocket.getInputStream().read(buffer)
            receivedBytes.complete(buffer.copyOfRange(0, readCount))
            clientSocket.close()
        }
        serverThread.start()

        val connection = LanConnection()
        connection.connect(ConnectionTarget.Lan("127.0.0.1", serverSocket.localPort))
        assertTrue(connection.isConnected())

        connection.write(byteArrayOf(0x1B, 0x40, 0x0A, 0x0A))
        connection.disconnect()

        assertArrayEquals(byteArrayOf(0x1B, 0x40, 0x0A, 0x0A), receivedBytes.get(2, TimeUnit.SECONDS))
        serverThread.join(2000)
        serverSocket.close()
    }

    @Test
    fun `write throws when not connected`() {
        val connection = LanConnection()
        val error = org.junit.Assert.assertThrows(IllegalStateException::class.java) {
            connection.write(byteArrayOf(0x00))
        }
        assertTrue(error.message!!.contains("Chưa kết nối"))
    }
}
