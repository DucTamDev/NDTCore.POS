import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestingPinia } from '@pinia/testing'
import { mountWithVuetify } from '@/test/mount-with-vuetify'
import PrinterSettingsView from './PrinterSettingsView.vue'
import { usePrinterStore } from '../stores/printer.store'
import type { PrinterConfig } from '@/native/printer-plugin/definitions'

const receiptPrinter: PrinterConfig = {
  id: 'receipt-printer',
  name: 'Máy in Bill',
  driver: 'generic-escpos',
  connectionType: 'usb',
  device: null,
  autoConnect: false,
}

const kitchenPrinter: PrinterConfig = {
  id: 'kitchen-printer',
  name: 'Máy in Bếp',
  driver: 'generic-escpos',
  connectionType: 'usb',
  device: null,
  autoConnect: false,
}

function mountView(initialState: Record<string, unknown> = {}) {
  return mountWithVuetify(PrinterSettingsView, {
    global: {
      plugins: [
        createTestingPinia({
          createSpy: vi.fn,
          stubActions: true,
          initialState: {
            printer: {
              printers: [],
              statuses: {},
              errorMessages: {},
              knownDevices: [],
              ...initialState,
            },
          },
        }),
      ],
    },
  })
}

describe('PrinterSettingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders one card per printer with its name', () => {
    const wrapper = mountView({ printers: [receiptPrinter] })
    expect(wrapper.find('[data-test="printer-card-receipt-printer"]').exists()).toBe(true)
  })

  it('disables "Print Test Bill" for a printer that is not connected', () => {
    const wrapper = mountView({ printers: [receiptPrinter], statuses: { 'receipt-printer': 'disconnected' } })
    const button = wrapper.find('[data-test="test-print-button-receipt-printer"]')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('calls store.connect(id) with that printer\'s id when its Connect button is clicked', async () => {
    const wrapper = mountView({ printers: [receiptPrinter] })
    const store = usePrinterStore()

    await wrapper.find('[data-test="connect-button-receipt-printer"]').trigger('click')

    expect(store.connect).toHaveBeenCalledWith('receipt-printer')
  })

  it('calls store.testPrint(id) when "Print Test Bill" is clicked while that printer is connected', async () => {
    const wrapper = mountView({ printers: [receiptPrinter], statuses: { 'receipt-printer': 'connected' } })
    const store = usePrinterStore()

    await wrapper.find('[data-test="test-print-button-receipt-printer"]').trigger('click')

    expect(store.testPrint).toHaveBeenCalledWith('receipt-printer')
  })

  it('calls store.addPrinter() with the entered form values when "Thêm máy in" is clicked', async () => {
    const wrapper = mountView()
    const store = usePrinterStore()

    await wrapper.find('[data-test="new-printer-name"] input').setValue('Máy in Bếp')
    await wrapper.find('[data-test="add-printer-button"]').trigger('click')

    expect(store.addPrinter).toHaveBeenCalledWith({
      name: 'Máy in Bếp',
      driver: 'generic-escpos',
      connectionType: 'usb',
      device: null,
      autoConnect: false,
    })
  })

  it('shows the error message in a snackbar when connect() rejects', async () => {
    const wrapper = mountView({ printers: [receiptPrinter] })
    const store = usePrinterStore()
    vi.mocked(store.connect).mockRejectedValue(new Error('Chưa kết nối máy in USB.'))

    await wrapper.find('[data-test="connect-button-receipt-printer"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Chưa kết nối máy in USB.')
  })

  it('calls store.disconnect(id) with that printer\'s id when its Disconnect button is clicked', async () => {
    const wrapper = mountView({ printers: [receiptPrinter, kitchenPrinter] })
    const store = usePrinterStore()

    await wrapper.find('[data-test="disconnect-button-receipt-printer"]').trigger('click')

    expect(store.disconnect).toHaveBeenCalledWith('receipt-printer')
    expect(store.disconnect).not.toHaveBeenCalledWith('kitchen-printer')
  })

  it('calls store.removePrinter(id) with that printer\'s id when its Remove button is clicked', async () => {
    const wrapper = mountView({ printers: [receiptPrinter, kitchenPrinter] })
    const store = usePrinterStore()

    await wrapper.find('[data-test="remove-button-receipt-printer"]').trigger('click')

    expect(store.removePrinter).toHaveBeenCalledWith('receipt-printer')
    expect(store.removePrinter).not.toHaveBeenCalledWith('kitchen-printer')
  })

  it('calls store.renamePrinter(id, name) with that printer\'s id when its name field changes', async () => {
    const wrapper = mountView({ printers: [receiptPrinter, kitchenPrinter] })
    const store = usePrinterStore()

    const input = wrapper.find('[data-test="printer-name-receipt-printer"] input')
    await input.setValue('Máy in Bill Mới')
    await input.trigger('change')

    expect(store.renamePrinter).toHaveBeenCalledWith('receipt-printer', 'Máy in Bill Mới')
    expect(store.renamePrinter).not.toHaveBeenCalledWith('kitchen-printer', 'Máy in Bill Mới')
  })
})
