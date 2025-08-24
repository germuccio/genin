import { defineStore } from 'pinia'
import { ref } from 'vue'
import axios from 'axios'

export const useVismaStore = defineStore('visma', () => {
  const isConnected = ref(false)
  const isLoading = ref(false)
  const companyName = ref('')
  const error = ref('')

  const checkConnection = async () => {
    isLoading.value = true
    error.value = ''
    
    try {
      const response = await axios.get('/api/auth/visma/status')
      isConnected.value = response.data.connected
      companyName.value = response.data.company || ''
    } catch (err) {
      console.error('Failed to check Visma connection:', err)
      isConnected.value = false
      error.value = 'Failed to check connection status'
    } finally {
      isLoading.value = false
    }
  }

  const getAuthUrl = async () => {
    isLoading.value = true
    error.value = ''
    
    try {
      const response = await axios.get('/api/auth/visma/url')
      return response.data.auth_url
    } catch (err) {
      console.error('Failed to get auth URL:', err)
      error.value = 'Failed to get authorization URL'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const handleCallback = async (code: string, state?: string) => {
    isLoading.value = true
    error.value = ''
    
    try {
      const response = await axios.post('/api/auth/visma/callback', {
        code,
        state,
      })
      
      if (response.data.success) {
        isConnected.value = true
        companyName.value = response.data.company || ''
        return response.data
      } else {
        throw new Error('Authentication failed')
      }
    } catch (err: any) {
      console.error('Failed to complete authentication:', err)
      error.value = err.response?.data?.error || 'Authentication failed'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  const disconnect = async () => {
    isLoading.value = true
    error.value = ''
    
    try {
      await axios.delete('/api/auth/visma/disconnect')
      isConnected.value = false
      companyName.value = ''
    } catch (err) {
      console.error('Failed to disconnect:', err)
      error.value = 'Failed to disconnect'
      throw err
    } finally {
      isLoading.value = false
    }
  }

  return {
    isConnected,
    isLoading,
    companyName,
    error,
    checkConnection,
    getAuthUrl,
    handleCallback,
    disconnect,
  }
})



