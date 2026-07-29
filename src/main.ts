import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
import { vuetify } from './plugins/vuetify'
import { usePrinterStore } from './modules/printer/stores/printer.store'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.use(vuetify)

async function bootstrap() {
  const printerStore = usePrinterStore()
  try {
    await printerStore.loadPrinters()
  } catch {
    // Corrupt/unreadable printer storage must not block app startup — printers list stays
    // empty, user can re-add from Printer Settings.
  }

  app.mount('#app')
  // autoConnectAll() already swallows individual connect failures via Promise.allSettled, so
  // firing it after mount without awaiting is safe. Awaiting it before mount would block the
  // splash screen on every auto-connect attempt — an unreachable LAN printer can hold the OS
  // socket-connect timeout (60+ seconds) before the app ever appears.
  void printerStore.autoConnectAll()
}

bootstrap()
