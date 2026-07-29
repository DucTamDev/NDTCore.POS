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
  await printerStore.loadPrinters()
  await printerStore.autoConnectAll()

  app.mount('#app')
}

bootstrap()
