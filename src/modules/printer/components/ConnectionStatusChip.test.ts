import { describe, it, expect } from 'vitest'
import { mountWithVuetify } from '@/test/mount-with-vuetify'
import ConnectionStatusChip from './ConnectionStatusChip.vue'

describe('ConnectionStatusChip', () => {
  it('renders "Connected" when status is connected', () => {
    const wrapper = mountWithVuetify(ConnectionStatusChip, { props: { status: 'connected' } })
    expect(wrapper.text()).toContain('Connected')
  })

  it('renders "Disconnected" when status is disconnected', () => {
    const wrapper = mountWithVuetify(ConnectionStatusChip, { props: { status: 'disconnected' } })
    expect(wrapper.text()).toContain('Disconnected')
  })

  it('renders "Error" when status is error', () => {
    const wrapper = mountWithVuetify(ConnectionStatusChip, { props: { status: 'error' } })
    expect(wrapper.text()).toContain('Error')
  })
})
