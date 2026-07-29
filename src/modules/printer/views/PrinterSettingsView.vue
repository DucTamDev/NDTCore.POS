<template>
  <v-container>
    <v-card class="mb-4">
      <v-card-title>Thêm máy in</v-card-title>
      <v-card-text>
        <v-text-field v-model="newPrinterName" label="Tên máy in" data-test="new-printer-name" />
        <v-select
          v-model="newPrinterConnectionType"
          label="Connection Type"
          :items="[{ title: 'USB', value: 'usb' }]"
          item-title="title"
          item-value="value"
        />
        <v-select
          v-model="newPrinterDriver"
          label="Driver"
          :items="[{ title: 'Generic ESC/POS', value: 'generic-escpos' }]"
          item-title="title"
          item-value="value"
        />
        <v-switch v-model="newPrinterAutoConnect" label="Auto Connect" />

        <PrinterDeviceList :devices="knownDevices" @scan="onScan" @select="onSelectNewDevice" />
      </v-card-text>
      <v-card-actions>
        <v-btn
          data-test="add-printer-button"
          color="primary"
          :disabled="!newPrinterName"
          @click="onAddPrinter"
        >
          Thêm máy in
        </v-btn>
      </v-card-actions>
    </v-card>

    <v-card
      v-for="printer in printers"
      :key="printer.id"
      class="mb-4"
      :data-test="`printer-card-${printer.id}`"
    >
      <v-card-title>
        <v-text-field
          :model-value="printer.name"
          density="compact"
          hide-details
          :data-test="`printer-name-${printer.id}`"
          @change="(event: Event) => onRename(printer.id, (event.target as HTMLInputElement).value)"
        />
      </v-card-title>
      <v-card-text>
        <ConnectionStatusChip :status="statuses[printer.id] ?? 'disconnected'" />
      </v-card-text>
      <v-card-actions>
        <v-btn
          :data-test="`connect-button-${printer.id}`"
          color="primary"
          :loading="statuses[printer.id] === 'connecting'"
          @click="onConnect(printer.id)"
        >
          Connect
        </v-btn>
        <v-btn :data-test="`disconnect-button-${printer.id}`" @click="onDisconnect(printer.id)">
          Disconnect
        </v-btn>
        <v-btn
          :data-test="`test-print-button-${printer.id}`"
          :disabled="statuses[printer.id] !== 'connected'"
          @click="onTestPrint(printer.id)"
        >
          Print Test Bill
        </v-btn>
        <v-btn :data-test="`remove-button-${printer.id}`" color="error" @click="onRemove(printer.id)">
          Xoá
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

const {
  printers,
  statuses,
  knownDevices,
  addPrinter,
  renamePrinter,
  removePrinter,
  connect,
  disconnect,
  scan,
  testPrint,
} = usePrinter()

const newPrinterName = ref('')
const newPrinterConnectionType = ref<PrinterConnectionType>('usb')
const newPrinterDriver = ref<PrinterDriverType>('generic-escpos')
const newPrinterAutoConnect = ref(false)
const newPrinterDevice = ref<PrinterDevice | null>(null)
const showError = ref(false)
const errorMessage = ref('')

function showErrorMessage(error: unknown) {
  errorMessage.value = error instanceof Error ? error.message : 'Đã có lỗi xảy ra.'
  showError.value = true
}

async function onScan() {
  try {
    await scan(newPrinterConnectionType.value)
  } catch (error) {
    showErrorMessage(error)
  }
}

function onSelectNewDevice(device: PrinterDevice) {
  newPrinterDevice.value = device
}

async function onAddPrinter() {
  try {
    await addPrinter({
      name: newPrinterName.value,
      driver: newPrinterDriver.value,
      connectionType: newPrinterConnectionType.value,
      device: newPrinterDevice.value,
      autoConnect: newPrinterAutoConnect.value,
    })
    newPrinterName.value = ''
    newPrinterDevice.value = null
  } catch (error) {
    showErrorMessage(error)
  }
}

async function onRename(id: string, name: string) {
  try {
    await renamePrinter(id, name)
  } catch (error) {
    showErrorMessage(error)
  }
}

async function onConnect(id: string) {
  try {
    await connect(id)
  } catch (error) {
    showErrorMessage(error)
  }
}

async function onDisconnect(id: string) {
  try {
    await disconnect(id)
  } catch (error) {
    showErrorMessage(error)
  }
}

async function onTestPrint(id: string) {
  try {
    await testPrint(id)
  } catch (error) {
    showErrorMessage(error)
  }
}

async function onRemove(id: string) {
  try {
    await removePrinter(id)
  } catch (error) {
    showErrorMessage(error)
  }
}
</script>
