// android/app/src/main/java/com/ndtcore/pos/MainActivity.kt
package com.ndtcore.pos

import android.os.Bundle
import com.getcapacitor.BridgeActivity
import com.ndtcore.pos.printer.PrinterPlugin

class MainActivity : BridgeActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        registerPlugin(PrinterPlugin::class.java)
        super.onCreate(savedInstanceState)
    }
}
