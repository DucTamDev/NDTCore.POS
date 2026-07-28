import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { mount, type ComponentMountingOptions } from '@vue/test-utils'
import type { Component } from 'vue'

const vuetify = createVuetify({ components, directives })

export function mountWithVuetify<T extends Component>(
  component: T,
  options: ComponentMountingOptions<T> = {},
) {
  return mount(component, {
    ...options,
    global: {
      ...options.global,
      plugins: [vuetify, ...(options.global?.plugins ?? [])],
    },
  })
}
