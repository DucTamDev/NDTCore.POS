import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createTestingPinia } from '@pinia/testing'
import { mountWithVuetify } from '@/test/mount-with-vuetify'
import PrinterSettingsView from './PrinterSettingsView.vue'
import { usePrinterStore } from '../stores/printer.store'

describe('PrinterSettingsView', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('disables "Print Test Bill" when not connected', () => {
    const wrapper = mountWithVuetify(PrinterSettingsView, {
      global: { plugins: [createTestingPinia({ createSpy: vi.fn })] },
    })
    const button = wrapper.find('[data-test="test-print-button"]')
    expect(button.attributes('disabled')).toBeDefined()
  })

  it('calls store.connect() with the selected driver/connectionType when Connect is clicked', async () => {
    const wrapper = mountWithVuetify(PrinterSettingsView, {
      global: { plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: true })] },
    })
    const store = usePrinterStore()

    await wrapper.find('[data-test="connect-button"]').trigger('click')

    expect(store.connect).toHaveBeenCalledWith({
      driver: 'generic-escpos',
      connectionType: 'usb',
      device: null,
      autoConnect: false,
    })
  })

  it('calls store.testPrint() when "Print Test Bill" is clicked while connected', async () => {
    const wrapper = mountWithVuetify(PrinterSettingsView, {
      global: {
        plugins: [
          createTestingPinia({
            createSpy: vi.fn,
            stubActions: true,
            initialState: { printer: { status: 'connected', config: null, knownDevices: [] } },
          }),
        ],
      },
    })
    const store = usePrinterStore()

    await wrapper.find('[data-test="test-print-button"]').trigger('click')

    expect(store.testPrint).toHaveBeenCalled()
  })

  it('shows the error message in a snackbar when connect() rejects', async () => {
    const wrapper = mountWithVuetify(PrinterSettingsView, {
      global: { plugins: [createTestingPinia({ createSpy: vi.fn, stubActions: true })] },
    })
    const store = usePrinterStore()
    vi.mocked(store.connect).mockRejectedValue(new Error('Chưa kết nối máy in USB.'))

    await wrapper.find('[data-test="connect-button"]').trigger('click')
    await wrapper.vm.$nextTick()

    expect(wrapper.text()).toContain('Chưa kết nối máy in USB.')
  })
})
