<template>
  <v-chip :color="color">{{ label }}</v-chip>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import type { PrinterStatus } from '@/native/printer-plugin/definitions'

const props = defineProps<{ status: PrinterStatus }>()

const color = computed(() => {
  switch (props.status) {
    case 'connected':
      return 'success'
    case 'connecting':
      return 'warning'
    case 'error':
      return 'error'
    default:
      return 'grey'
  }
})

const label = computed(() => {
  switch (props.status) {
    case 'connected':
      return 'Connected'
    case 'connecting':
      return 'Connecting'
    case 'error':
      return 'Error'
    default:
      return 'Disconnected'
  }
})
</script>
