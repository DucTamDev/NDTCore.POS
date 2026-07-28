import { describe, it, expect } from 'vitest'
import { mountWithVuetify } from '@/test/mount-with-vuetify'
import PrinterDeviceList from './PrinterDeviceList.vue'
import type { UsbPrinterDevice } from '@/native/printer-plugin/definitions'

const devices: UsbPrinterDevice[] = [
  { connectionType: 'usb', vendorId: 1155, productId: 22339, productName: 'XP-Q80I', serialNumber: null },
]

describe('PrinterDeviceList', () => {
  it('renders one row per known device', () => {
    const wrapper = mountWithVuetify(PrinterDeviceList, { props: { devices } })
    expect(wrapper.text()).toContain('XP-Q80I')
  })

  it('shows a fallback label when productName is null', () => {
    const wrapper = mountWithVuetify(PrinterDeviceList, {
      props: { devices: [{ ...devices[0], productName: null }] },
    })
    expect(wrapper.text()).toContain('Unknown USB Printer')
  })

  it('emits "select" with the chosen device when a row is clicked', async () => {
    const wrapper = mountWithVuetify(PrinterDeviceList, { props: { devices } })
    await wrapper.find('[data-test="device-row-0"]').trigger('click')

    expect(wrapper.emitted('select')?.[0]).toEqual([devices[0]])
  })

  it('emits "scan" when the scan button is clicked', async () => {
    const wrapper = mountWithVuetify(PrinterDeviceList, { props: { devices: [] } })
    await wrapper.find('[data-test="scan-button"]').trigger('click')

    expect(wrapper.emitted('scan')).toHaveLength(1)
  })
})
