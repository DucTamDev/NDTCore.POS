package com.ndtcore.pos.printer.registry

import com.ndtcore.pos.printer.connection.PrinterConnection

class ConnectionRegistry {
    private val factories = mutableMapOf<String, () -> PrinterConnection>()

    fun register(type: String, factory: () -> PrinterConnection) {
        factories[type] = factory
    }

    fun resolve(type: String): PrinterConnection {
        val factory = factories[type]
            ?: throw IllegalArgumentException("Connection \"$type\" chưa được đăng ký.")
        return factory()
    }
}
