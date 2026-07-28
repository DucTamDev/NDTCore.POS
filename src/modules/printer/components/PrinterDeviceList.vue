<!-- src/modules/printer/components/PrinterDeviceList.vue -->
<template>
  <div>
    <v-btn data-test="scan-button" variant="tonal" @click="emit('scan')">Scan</v-btn>
    <v-list>
      <v-list-item
        v-for="(device, index) in props.devices"
        :key="deviceKey(device)"
        :data-test="`device-row-${index}`"
        :title="deviceLabel(device)"
        @click="emit('select', device)"
      />
    </v-list>
  </div>
</template>

<script setup lang="ts">
import type { PrinterDevice } from '@/native/printer-plugin/definitions'

const props = defineProps<{ devices: PrinterDevice[] }>()
const emit = defineEmits<{ scan: []; select: [device: PrinterDevice] }>()

function deviceLabel(device: PrinterDevice): string {
  if (device.connectionType === 'usb') {
    return device.productName ?? 'Unknown USB Printer'
  }
  return `${device.ip}:${device.port}`
}

function deviceKey(device: PrinterDevice): string {
  if (device.connectionType === 'usb') {
    return `usb-${device.vendorId}-${device.productId}-${device.serialNumber ?? ''}`
  }
  return `lan-${device.ip}-${device.port}`
}
</script>
