<template>
  <div class="login-container">
    <div class="login-card">
      <div class="card-header">
        <div class="login-icon">🔐</div>
        <h2>Welcome to Genin</h2>
        <p>Enter the shared password to access your invoice processing dashboard.</p>
      </div>
      
      <div class="card-body">
        <div v-if="error" class="alert alert-error">{{ error }}</div>

        <form @submit.prevent="login">
          <div class="form-group">
            <label for="password">Password</label>
            <input 
              id="password"
              v-model="password" 
              type="password" 
              class="form-control" 
              placeholder="Enter shared password"
              required
              autocomplete="current-password"
            />
          </div>
          
          <button type="submit" class="btn btn-primary btn-lg" :disabled="isLoading">
            <span v-if="isLoading">🔄 Signing in...</span>
            <span v-else>🚀 Sign in</span>
          </button>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import axios from 'axios'

const router = useRouter()
const password = ref('')
const isLoading = ref(false)
const error = ref('')

const login = async () => {
  isLoading.value = true
  error.value = ''
  try {
    await axios.post('/api/auth/login', { password: password.value }, { withCredentials: true })
    router.replace({ name: 'setup' })
  } catch (err: any) {
    error.value = err?.response?.data?.error || 'Login failed'
  } finally {
    isLoading.value = false
  }
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-xl);
  background: var(--surface-alt);
}

.login-card {
  width: 100%;
  max-width: 420px;
  background: var(--surface);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  overflow: hidden;
  border: 1px solid var(--border);
}

.card-header {
  text-align: center;
  padding: var(--space-2xl) var(--space-xl) var(--space-xl);
  background: var(--surface);
  border-bottom: 1px solid var(--border-light);
}

.login-icon {
  font-size: 3rem;
  margin-bottom: var(--space-md);
}

.card-header h2 {
  margin: 0 0 var(--space-sm) 0;
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--text);
}

.card-header p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.card-body {
  padding: var(--space-2xl);
}

.form-group {
  margin-bottom: var(--space-xl);
}

.btn {
  width: 100%;
  justify-content: center;
}

@media (max-width: 480px) {
  .login-container {
    padding: var(--space-md);
  }
  
  .card-header,
  .card-body {
    padding: var(--space-xl);
  }
}
</style>


