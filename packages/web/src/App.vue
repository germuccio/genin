<template>
  <div id="app">
    <div class="nav-container">
      <nav class="nav">
        <router-link to="/" class="nav-brand">
          📄 Genin
        </router-link>
        
        <ul class="nav-links">
          <li><router-link to="/" class="nav-link">📤 Upload</router-link></li>
          <li><router-link to="/invoices" class="nav-link">📋 Invoices</router-link></li>
          <li><router-link to="/setup" class="nav-link">⚙️ Setup</router-link></li>
        </ul>
        
        <div class="nav-status">
          <span 
            :class="['status-badge', vismaStatusClass]"
            :title="`Visma API Mode: ${apiMode}`"
          >
            <span class="status-dot"></span>
            {{ vismaStatusText }}
          </span>
          <button v-if="isAuthenticated" @click="logout" class="btn btn-sm btn-secondary">
            🚪 Logout
          </button>
        </div>
      </nav>
    </div>

    <main class="main-content">
      <router-view />
    </main>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'
import { useVismaStore } from './stores/visma'

const router = useRouter()
const user = ref<{ username: string } | null>(null)
const isAuthenticated = ref(false)
const vismaStore = useVismaStore()
const apiMode = ref('TEST'); // Default to TEST

const vismaStatusClass = computed(() => {
  if (apiMode.value === 'LIVE' && vismaStore.isConnected) return 'status-live';
  return vismaStore.isConnected ? 'status-connected' : 'status-disconnected';
});

const vismaStatusText = computed(() => {
    let statusText = vismaStore.isConnected ? 'CONNECTED' : 'DISCONNECTED';
    return `${apiMode.value} | ${statusText}`;
});

const logout = async () => {
  try {
    await axios.post('/api/auth/logout')
    router.push({ name: 'login' })
  } catch (error) {
    console.error('Logout failed:', error)
    // Force redirect anyway
    router.push({ name: 'login' })
  }
}

const checkAuth = async () => {
  try {
    const response = await axios.get('/api/auth/me')
    user.value = response.data
    isAuthenticated.value = true
  } catch (error) {
    isAuthenticated.value = false
    if (router.currentRoute.value.meta.requiresAuth) {
      router.push({ name: 'login' })
    }
  }
}

const checkVismaStatus = async () => {
  try {
    const response = await axios.get('/api/auth/visma/status')
    vismaStore.isConnected = response.data.connected
    apiMode.value = response.data.apiMode || 'TEST';
  } catch (error) {
    console.error('Failed to check Visma status on load:', error)
    vismaStore.isConnected = false
  }
}

onMounted(async () => {
  await checkAuth()
  await checkVismaStatus()
})
</script>

<style scoped>
.nav-status {
  display: flex;
  align-items: center;
  gap: var(--space-md);
}

.status-badge,
.env-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-xs) var(--space-sm);
  border-radius: var(--radius-lg);
  font-size: 0.75rem;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.status-live {
  background: var(--danger-light);
  color: var(--danger);
  border: 1px solid var(--danger);
}

.status-connected {
  background: var(--success-light);
  color: var(--success);
  border: 1px solid var(--success);
}

.status-disconnected {
  background: var(--warning-light);
  color: var(--warning);
  border: 1px solid var(--warning);
}

.status-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.env-production {
  background: var(--danger-light);
  color: var(--danger);
  border: 1px solid var(--danger);
}

.env-sandbox {
  background: var(--warning-light);
  color: var(--warning);
  border: 1px solid var(--warning);
}

@media (max-width: 768px) {
  .nav-status {
    flex-direction: column;
    gap: var(--space-sm);
  }
  
  .status-badge {
    font-size: 0.625rem;
  }
}
</style>



