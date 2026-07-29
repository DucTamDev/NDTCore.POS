package com.ndtcore.pos.printer.registry

import com.ndtcore.pos.printer.driver.PrinterDriver

class DriverRegistry {
    private val factories = mutableMapOf<String, () -> PrinterDriver>()

    fun register(type: String, factory: () -> PrinterDriver) {
        factories[type] = factory
    }

    fun resolve(type: String): PrinterDriver {
        val factory = factories[type]
            ?: throw IllegalArgumentException("Driver \"$type\" chưa được đăng ký.")
        return factory()
    }
}
