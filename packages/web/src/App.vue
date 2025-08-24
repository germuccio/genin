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
            v-if="environment"
            :class="['env-badge', environment === 'production' ? 'env-production' : 'env-sandbox']"
            :title="`Running in ${environment} mode`"
          >
            {{ environment === 'production' ? '🔴 LIVE' : '🟡 TEST' }}
          </span>
          <span 
            :class="['status-badge', vismaStore.isConnected ? 'status-connected' : 'status-disconnected']"
            :title="vismaStore.isConnected ? 'Connected to Visma' : 'Not connected to Visma'"
          >
            <span class="status-dot"></span>
            {{ vismaStore.isConnected ? 'Connected' : 'Disconnected' }}
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
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useVismaStore } from './stores/visma'
import axios from 'axios'

const router = useRouter()
const vismaStore = useVismaStore()
const isAuthenticated = ref(true) // Assume authenticated since route guard handles this
const environment = ref('')

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

onMounted(async () => {
  vismaStore.checkConnection()
  
  // Get environment info
  try {
    const response = await axios.get('/api/auth/me')
    environment.value = response.data.environment
  } catch (error) {
    console.error('Failed to get environment info:', error)
  }
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

.status-connected {
  background: var(--success-light);
  color: var(--success);
  border: 1px solid var(--success);
}

.status-disconnected {
  background: var(--danger-light);
  color: var(--danger);
  border: 1px solid var(--danger);
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



