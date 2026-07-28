import { createRouter, createWebHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    {
      path: '/',
      redirect: '/printer-settings',
    },
    {
      path: '/printer-settings',
      name: 'printer-settings',
      component: () => import('@/modules/printer/views/PrinterSettingsView.vue'),
    },
  ],
})
