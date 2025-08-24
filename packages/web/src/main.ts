import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createWebHistory } from 'vue-router'

import App from './App.vue'
import axios from 'axios'
import FileUpload from './views/FileUpload.vue'
import InvoiceList from './views/InvoiceList.vue'
import VismaSetup from './views/VismaSetup.vue'

import './assets/main.css'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: () => import('./views/Login.vue'),
    },
    {
      path: '/',
      name: 'home',
      component: FileUpload,
    },
    {
      path: '/invoices',
      name: 'invoices',
      component: InvoiceList,
    },
    {
      path: '/setup',
      name: 'setup',
      component: VismaSetup,
    },
  ],
})

// Route guard: require session for protected routes
router.beforeEach(async (to, _from, next) => {
  if (to.name === 'login') return next();
  try {
    await axios.get('/api/auth/me', { withCredentials: true })
    return next()
  } catch {
    return next({ name: 'login' })
  }
})

// Axios: send cookies and optional Visma headers from localStorage
axios.defaults.withCredentials = true
axios.interceptors.request.use((config) => {
  try {
    const clientId = localStorage.getItem('vismaClientId') || ''
    const clientSecret = localStorage.getItem('vismaClientSecret') || ''
    const accessToken = localStorage.getItem('vismaAccessToken') || ''
    if (clientId) (config.headers as any)['x-visma-client-id'] = clientId
    if (clientSecret) (config.headers as any)['x-visma-client-secret'] = clientSecret
    if (accessToken) (config.headers as any)['x-visma-access-token'] = accessToken
  } catch {}
  return config
})

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')



