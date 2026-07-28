<!-- src/modules/printer/views/PrinterSettingsView.vue -->
<template>
  <v-container>
    <v-card>
      <v-card-title>Cấu hình máy in</v-card-title>
      <v-card-text>
        <v-select
          v-model="connectionType"
          label="Connection Type"
          :items="[{ title: 'USB', value: 'usb' }]"
          item-title="title"
          item-value="value"
        />
        <v-select
          v-model="driver"
          label="Driver"
          :items="[{ title: 'Generic ESC/POS', value: 'generic-escpos' }]"
          item-title="title"
          item-value="value"
        />
        <v-switch v-model="autoConnect" label="Auto Connect" />

        <PrinterDeviceList :devices="knownDevices" @scan="onScan" @select="onSelectDevice" />

        <ConnectionStatusChip :status="status" />
      </v-card-text>
      <v-card-actions>
        <v-btn
          data-test="connect-button"
          color="primary"
          :loading="status === 'connecting'"
          @click="onConnect"
        >
          Connect
        </v-btn>
        <v-btn
          data-test="test-print-button"
          :disabled="status !== 'connected'"
          @click="onTestPrint"
        >
          Print Test Bill
        </v-btn>
      </v-card-actions>
    </v-card>

    <v-snackbar v-model="showError" color="error" data-test="error-snackbar">
      {{ errorMessage }}
    </v-snackbar>
  </v-container>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { usePrinter } from '../composables/usePrinter'
import ConnectionStatusChip from '../components/ConnectionStatusChip.vue'
import PrinterDeviceList from '../components/PrinterDeviceList.vue'
import type {
  PrinterConnectionType,
  PrinterDriverType,
  PrinterDevice,
} from '@/native/printer-plugin/definitions'

const { status, knownDevices, connect, scan, testPrint } = usePrinter()

const connectionType = ref<PrinterConnectionType>('usb')
const driver = ref<PrinterDriverType>('generic-escpos')
const autoConnect = ref(false)
const selectedDevice = ref<PrinterDevice | null>(null)
const showError = ref(false)
const errorMessage = ref('')

function showErrorMessage(error: unknown) {
  errorMessage.value = error instanceof Error ? error.message : 'Đã có lỗi xảy ra.'
  showError.value = true
}

async function onScan() {
  try {
    await scan(connectionType.value)
  } catch (error) {
    showErrorMessage(error)
  }
}

function onSelectDevice(device: PrinterDevice) {
  selectedDevice.value = device
}

async function onConnect() {
  try {
    await connect({
      driver: driver.value,
      connectionType: connectionType.value,
      device: selectedDevice.value,
      autoConnect: autoConnect.value,
    })
  } catch (error) {
    showErrorMessage(error)
  }
}

async function onTestPrint() {
  try {
    await testPrint()
  } catch (error) {
    showErrorMessage(error)
  }
}
</script>
