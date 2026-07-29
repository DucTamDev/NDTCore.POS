// android/app/src/main/java/com/ndtcore/pos/printer/connection/UsbConnection.kt
package com.ndtcore.pos.printer.connection

import android.content.Context
import android.hardware.usb.UsbConstants
import android.hardware.usb.UsbDevice
import android.hardware.usb.UsbDeviceConnection
import android.hardware.usb.UsbEndpoint
import android.hardware.usb.UsbInterface
import android.hardware.usb.UsbManager

class UsbConnection(private val context: Context) : PrinterConnection {
    private var connection: UsbDeviceConnection? = null
    private var usbInterface: UsbInterface? = null
    private var outEndpoint: UsbEndpoint? = null

    override fun connect(target: ConnectionTarget) {
        require(target is ConnectionTarget.Usb) { "UsbConnection chỉ nhận ConnectionTarget.Usb." }

        val usbManager = context.getSystemService(Context.USB_SERVICE) as UsbManager
        // Two identical-model printers share the same vendorId/productId, so a serial-number
        // match (when the target has one) must win over the vendorId+productId fallback —
        // otherwise the map iterator could bind either physical device to either printerId.
        val device = (target.serialNumber?.let { serial ->
            usbManager.deviceList.values.find { it.serialNumber == serial }
        }) ?: usbManager.deviceList.values.find {
            it.vendorId == target.vendorId && it.productId == target.productId
        } ?: throw IllegalStateException(
            "Không tìm thấy thiết bị USB vendorId=${target.vendorId} productId=${target.productId}.",
        )

        if (!usbManager.hasPermission(device)) {
            throw IllegalStateException("Chưa được cấp quyền truy cập thiết bị USB.")
        }

        val (iface, endpoint) = findBulkOutEndpoint(device)
            ?: throw IllegalStateException("Không tìm thấy cổng gửi dữ liệu (OUT endpoint) trên thiết bị USB này.")

        val deviceConnection = usbManager.openDevice(device)
            ?: throw IllegalStateException("Không mở được kết nối tới thiết bị USB.")
        deviceConnection.claimInterface(iface, true)

        connection = deviceConnection
        usbInterface = iface
        outEndpoint = endpoint
    }

    override fun disconnect() {
        usbInterface?.let { connection?.releaseInterface(it) }
        connection?.close()
        connection = null
        usbInterface = null
        outEndpoint = null
    }

    override fun write(data: ByteArray) {
        val deviceConnection = connection ?: throw IllegalStateException("Chưa kết nối máy in USB.")
        val endpoint = outEndpoint ?: throw IllegalStateException("Chưa kết nối máy in USB.")
        val result = deviceConnection.bulkTransfer(endpoint, data, data.size, 5000)
        if (result < 0) {
            throw IllegalStateException("Gửi lệnh in thất bại (bulkTransfer trả về $result).")
        }
    }

    override fun isConnected(): Boolean = connection != null

    private fun findBulkOutEndpoint(device: UsbDevice): Pair<UsbInterface, UsbEndpoint>? {
        for (i in 0 until device.interfaceCount) {
            val iface = device.getInterface(i)
            for (j in 0 until iface.endpointCount) {
                val endpoint = iface.getEndpoint(j)
                if (endpoint.direction == UsbConstants.USB_DIR_OUT) {
                    return iface to endpoint
                }
            }
        }
        return null
    }
}
