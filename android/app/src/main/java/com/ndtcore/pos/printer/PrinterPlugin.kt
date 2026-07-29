// android/app/src/main/java/com/ndtcore/pos/printer/PrinterPlugin.kt
package com.ndtcore.pos.printer

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbManager
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.ndtcore.pos.printer.connection.ConnectionTarget
import com.ndtcore.pos.printer.connection.LanConnection
import com.ndtcore.pos.printer.connection.UsbConnection
import com.ndtcore.pos.printer.driver.DriverDetector
import com.ndtcore.pos.printer.driver.GenericEscPosDriver
import com.ndtcore.pos.printer.manager.PrinterManager
import com.ndtcore.pos.printer.registry.ConnectionRegistry
import com.ndtcore.pos.printer.registry.DriverRegistry

private const val ACTION_USB_PERMISSION = "com.ndtcore.pos.USB_PERMISSION"
private const val PREFS_NAME = "ndtcore_pos_printer_config"
private const val PREFS_KEY_PRINTERS = "printers"

private data class PendingUsbPermission(val printerId: String, val call: PluginCall)

@CapacitorPlugin(name = "Printer")
class PrinterPlugin : Plugin() {
    private lateinit var manager: PrinterManager

    // Android shows one USB permission dialog at a time, so a single pending slot is
    // sufficient for Phase 1. If a second connect() targeting a different not-yet-authorized
    // USB device arrives while one is pending, it overwrites this slot (known limitation —
    // callers should authorize new USB printers one at a time).
    private var pendingUsbPermission: PendingUsbPermission? = null

    override fun load() {
        val driverRegistry = DriverRegistry().apply {
            register("generic-escpos") { GenericEscPosDriver() }
        }
        val connectionRegistry = ConnectionRegistry().apply {
            register("usb") { UsbConnection(context) }
            register("lan") { LanConnection() }
        }
        manager = PrinterManager(driverRegistry, connectionRegistry)

        context.registerReceiver(usbPermissionReceiver, IntentFilter(ACTION_USB_PERMISSION))
    }

    private val usbPermissionReceiver = object : BroadcastReceiver() {
        override fun onReceive(ctx: Context, intent: Intent) {
            if (intent.action != ACTION_USB_PERMISSION) return
            val pending = pendingUsbPermission ?: return
            pendingUsbPermission = null

            val granted = intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED, false)
            if (!granted) {
                pending.call.reject("Người dùng từ chối quyền truy cập thiết bị USB.")
                return
            }
            finishConnect(pending.printerId, pending.call.getObject("config")!!, pending.call)
        }
    }

    @PluginMethod
    fun scanPrinters(call: PluginCall) {
        val connectionType = call.getString("connectionType")
        if (connectionType == null) {
            call.reject("Thiếu tham số connectionType.")
            return
        }

        val devices = JSArray()
        if (connectionType == "usb") {
            val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
            usbManager.deviceList.values.forEach { device: UsbDevice ->
                val json = JSObject()
                json.put("connectionType", "usb")
                json.put("vendorId", device.vendorId)
                json.put("productId", device.productId)
                json.put("productName", device.productName)
                json.put("serialNumber", null)
                json.put("suggestedDriver", DriverDetector.suggestDriver(device.vendorId))
                devices.put(json)
            }
        }

        val result = JSObject()
        result.put("devices", devices)
        call.resolve(result)
    }

    @PluginMethod
    fun connect(call: PluginCall) {
        val printerId = call.getString("printerId")
        val config = call.getObject("config")
        if (printerId == null || config == null) {
            call.reject("Thiếu tham số printerId hoặc config.")
            return
        }
        val connectionType = config.getString("connectionType")
        val device = config.getJSObject("device")

        if (connectionType == "usb" && device != null) {
            val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
            val vendorId = device.getInteger("vendorId")
            val productId = device.getInteger("productId")
            val usbDevice = usbManager.deviceList.values.find {
                it.vendorId == vendorId && it.productId == productId
            }

            if (usbDevice != null && !usbManager.hasPermission(usbDevice)) {
                pendingUsbPermission = PendingUsbPermission(printerId, call)
                val permissionIntent = PendingIntent.getBroadcast(
                    context,
                    0,
                    Intent(ACTION_USB_PERMISSION),
                    PendingIntent.FLAG_MUTABLE,
                )
                usbManager.requestPermission(usbDevice, permissionIntent)
                return
            }
        }

        finishConnect(printerId, config, call)
    }

    private fun finishConnect(printerId: String, config: JSObject, call: PluginCall) {
        val driverType = config.getString("driver")!!
        val connectionType = config.getString("connectionType")!!
        val device = config.getJSObject("device")

        val target = when (connectionType) {
            "usb" -> ConnectionTarget.Usb(device!!.getInteger("vendorId")!!, device.getInteger("productId")!!)
            "lan" -> ConnectionTarget.Lan(device!!.getString("ip")!!, device.getInteger("port")!!)
            else -> {
                call.reject("connectionType \"$connectionType\" không được hỗ trợ trên Android.")
                return
            }
        }

        try {
            manager.connect(printerId, driverType, connectionType, target)
            val result = JSObject()
            result.put("config", config)
            call.resolve(result)
        } catch (error: Exception) {
            call.reject(error.message, error)
        }
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        val printerId = call.getString("printerId")
        if (printerId == null) {
            call.reject("Thiếu tham số printerId.")
            return
        }
        manager.disconnect(printerId)
        call.resolve()
    }

    @PluginMethod
    fun print(call: PluginCall) {
        val printerId = call.getString("printerId")
        val dataArray = call.getArray("data")
        if (printerId == null || dataArray == null) {
            call.reject("Thiếu tham số printerId hoặc data.")
            return
        }
        val bytes = ByteArray(dataArray.length()) { i -> (dataArray.get(i) as Int).toByte() }
        try {
            manager.print(printerId, bytes)
            call.resolve()
        } catch (error: Exception) {
            call.reject(error.message, error)
        }
    }

    @PluginMethod
    fun testPrint(call: PluginCall) {
        val printerId = call.getString("printerId")
        if (printerId == null) {
            call.reject("Thiếu tham số printerId.")
            return
        }
        try {
            manager.testPrint(printerId)
            call.resolve()
        } catch (error: Exception) {
            call.reject(error.message, error)
        }
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val printerId = call.getString("printerId")
        if (printerId == null) {
            call.reject("Thiếu tham số printerId.")
            return
        }
        val result = JSObject()
        result.put("status", manager.getStatus(printerId).name.lowercase())
        call.resolve(result)
    }

    @PluginMethod
    fun savePrinters(call: PluginCall) {
        val configs = call.getArray("configs")
        if (configs == null) {
            call.reject("Thiếu tham số configs.")
            return
        }
        context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(PREFS_KEY_PRINTERS, configs.toString())
            .apply()
        call.resolve()
    }

    @PluginMethod
    fun loadPrinters(call: PluginCall) {
        val raw = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)
            .getString(PREFS_KEY_PRINTERS, null)

        val result = JSObject()
        result.put("configs", if (raw != null) JSArray(raw) else JSArray())
        call.resolve(result)
    }
}
