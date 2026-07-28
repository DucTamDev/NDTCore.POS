import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { mount, type ComponentMountingOptions } from '@vue/test-utils'
import type { Component } from 'vue'

// `attach: true` disables Vuetify's real DOM teleport for VOverlay-based
// components (v-snackbar, v-dialog, v-menu, v-tooltip, ...), so their content
// renders in place under the wrapper root instead of being moved to
// `document.body`. Without this, jsdom-mounted overlay content is invisible
// to `wrapper.text()` / `wrapper.find()`, which only look at the wrapper's
// own DOM subtree — a real Teleport moves nodes outside of it entirely.
const vuetify = createVuetify({
  components,
  directives,
  defaults: { global: { attach: true } },
})

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
