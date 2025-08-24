<template>
  <div class="visma-setup">
    <div class="card">
      <h2>Visma eAccounting Setup</h2>
      <p>Connect your Visma eAccounting account to enable invoice creation and management.</p>

      <div v-if="!vismaStore.isConnected" class="setup-section">
        <h3>Connect to Visma</h3>
        <p>You need to authenticate with Visma eAccounting to use this application.</p>
        
        <div v-if="vismaStore.error" class="alert alert-error">
          {{ vismaStore.error }}
        </div>

        <button 
          @click="connectToVisma" 
          class="btn btn-primary"
          :disabled="vismaStore.isLoading"
        >
          <span v-if="vismaStore.isLoading">Connecting...</span>
          <span v-else>Connect to Visma eAccounting</span>
        </button>

        <div class="oauth-info">
          <h4>What happens when you connect?</h4>
          <ul>
            <li>You'll be redirected to Visma's secure login page</li>
            <li>You'll grant permission for this app to access your eAccounting data</li>
            <li>You'll be redirected back to this application</li>
            <li>The app will be able to create customers, invoices, and attachments</li>
          </ul>
          
          <div class="troubleshooting">
            <h5>🔧 Troubleshooting Safari Issues:</h5>
            <ul>
              <li><strong>If Safari shows "Can't Find Server":</strong></li>
              <li>• Try using <strong>Chrome or Firefox</strong> instead</li>
              <li>• Check your internet connection</li>
              <li>• Try refreshing the page and clicking connect again</li>
              <li>• Make sure you're not using a VPN that blocks Visma domains</li>
            </ul>
          </div>
        </div>
      </div>

      <div v-else class="connected-section">
        <div class="alert alert-success">
          <h3>✅ Connected to Visma eAccounting</h3>
          <p v-if="vismaStore.companyName">
            Company: <strong>{{ vismaStore.companyName }}</strong>
          </p>
          <p>You can now upload files and create invoices.</p>
        </div>

        <div class="connection-actions">
          <button 
            @click="testConnection" 
            class="btn btn-secondary"
            :disabled="isTesting"
          >
            <span v-if="isTesting">Testing...</span>
            <span v-else>Test Connection</span>
          </button>

          <button 
            @click="disconnectFromVisma" 
            class="btn btn-danger"
            :disabled="vismaStore.isLoading"
          >
            <span v-if="vismaStore.isLoading">Disconnecting...</span>
            <span v-else>Disconnect</span>
          </button>
        </div>

        <div v-if="connectionTestResult" class="connection-test-result">
          <div :class="['alert', connectionTestResult.success ? 'alert-success' : 'alert-error']">
            {{ connectionTestResult.message }}
          </div>
        </div>
      </div>
    </div>

    <!-- Article Mapping Section -->
    <div class="card" v-if="vismaStore.isConnected">
      <h3>Article Mapping</h3>
      <p>Map your service types to specific articles in Visma eAccounting.</p>

      <div v-if="isLoadingArticles" class="spinner"></div>
      <div v-else-if="articles.length === 0" class="empty-state">
        <p>No articles found in your Visma account.</p>
      </div>
      <div v-else class="article-mapping-form">
        <div class="form-group">
          <label for="ok-article">Invoice Article (for all transport services)</label>
          <select id="ok-article" v-model="articleMapping.ok" class="form-control">
            <option disabled value="">Please select an article</option>
            <option v-for="article in articles" :key="article.Id" :value="article.Id">
              {{ article.Name }} ({{ article.Number }})
            </option>
          </select>
          <small class="form-text">This article will be used for all invoices created from OK entries.</small>
        </div>
        <div class="form-actions">
          <button @click="createTransportArticles" class="btn btn-success" :disabled="isCreatingArticles">
            <span v-if="isCreatingArticles">Creating Article...</span>
            <span v-else>Create Transport Article</span>
          </button>
          <button @click="saveArticleMapping" class="btn btn-primary">Save Mapping</button>
        </div>
      </div>
    </div>

    <!-- Configuration Section -->
    <div class="card">
      <h3>Configuration</h3>
      <p>Manage your application settings and pricing presets.</p>

      <div class="config-section">
        <h4>Local Visma App Credentials</h4>
        <p>Store your Visma Client ID and Client Secret locally (browser only).</p>
        <div class="form-row">
          <div class="form-group">
            <label>Client ID</label>
            <input v-model="vismaClientId" class="form-control" placeholder="your client id" />
          </div>
          <div class="form-group">
            <label>Client Secret</label>
            <input v-model="vismaClientSecret" class="form-control" placeholder="your client secret" />
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary btn-sm" @click="saveLocalVismaCreds">Save Credentials</button>
          <button class="btn btn-secondary btn-sm" @click="clearLocalVismaCreds">Clear</button>
        </div>
        <small class="form-text">Saved in your browser only. These are added to request headers.</small>
      </div>

      <div class="config-section">
        <h4>Pricing Presets</h4>
        <p>Configure pricing for different service types.</p>
        
        <div v-if="isLoadingPresets" class="spinner"></div>
        
        <div v-else-if="presets.length === 0" class="empty-state">
          <p>No pricing presets configured.</p>
        </div>

        <div v-else class="table-responsive">
          <table class="table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Article Name</th>
                <th>Unit Price</th>
                <th>Currency</th>
                <th>VAT Code</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="preset in presets" :key="preset.id">
                <td v-if="editingPreset?.id === preset.id">
                  <input v-model="editingPreset.code" class="form-control" />
                </td>
                <td v-else><code>{{ preset.code }}</code></td>
                
                <td v-if="editingPreset?.id === preset.id">
                  <input v-model="editingPreset.name" class="form-control" />
                </td>
                <td v-else>{{ preset.name }}</td>
                
                <td v-if="editingPreset?.id === preset.id">
                  <input v-model="editingPreset.article_name" class="form-control" />
                </td>
                <td v-else>{{ preset.article_name || preset.name }}</td>
                
                <td v-if="editingPreset?.id === preset.id">
                  <input v-model.number="editingPreset.unit_price_cents" type="number" class="form-control" />
                </td>
                <td v-else>{{ formatPrice(preset.unit_price_cents, preset.currency) }}</td>
                
                <td v-if="editingPreset?.id === preset.id">
                  <select v-model="editingPreset.currency" class="form-control">
                    <option value="NOK">NOK</option>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                  </select>
                </td>
                <td v-else>{{ preset.currency }}</td>
                
                <td v-if="editingPreset?.id === preset.id">
                  <input v-model="editingPreset.vat_code" class="form-control" />
                </td>
                <td v-else>{{ preset.vat_code }}%</td>
                
                <td>
                  <div v-if="editingPreset?.id === preset.id" class="btn-group">
                    <button @click="savePreset" class="btn btn-success btn-sm">Save</button>
                    <button @click="cancelEdit" class="btn btn-secondary btn-sm">Cancel</button>
                  </div>
                  <div v-else class="btn-group">
                    <button @click="startEdit(preset)" class="btn btn-secondary btn-sm">Edit</button>
                    <button @click="deletePreset(preset.id)" class="btn btn-danger btn-sm">Delete</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="preset-actions">
          <button @click="loadPresets" class="btn btn-secondary btn-sm">
            Refresh Presets
          </button>
          <button @click="startNewPreset" class="btn btn-success btn-sm">
            Add New Preset
          </button>
        </div>
        
        <!-- New Preset Form -->
        <div v-if="showNewPresetForm" class="new-preset-form">
          <h5>Add New Preset</h5>
          <div class="form-row">
            <div class="form-group">
              <label>Code</label>
              <input v-model="newPreset.code" class="form-control" placeholder="e.g., OK, EXPRESS" />
            </div>
            <div class="form-group">
              <label>Name</label>
              <input v-model="newPreset.name" class="form-control" placeholder="e.g., Standard Processing" />
            </div>
            <div class="form-group">
              <label>Article Name (appears on invoice)</label>
              <input v-model="newPreset.article_name" class="form-control" placeholder="e.g., Transport Service - Standard" />
            </div>
            <div class="form-group">
              <label>Unit Price (cents)</label>
              <input v-model.number="newPreset.unit_price_cents" type="number" class="form-control" placeholder="25000 = 250.00" />
            </div>
            <div class="form-group">
              <label>Currency</label>
              <select v-model="newPreset.currency" class="form-control">
                <option value="NOK">NOK</option>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
              </select>
            </div>
            <div class="form-group">
              <label>VAT Code (%)</label>
              <input v-model="newPreset.vat_code" class="form-control" placeholder="25" />
            </div>
          </div>
          <div class="form-actions">
            <button @click="createPreset" class="btn btn-success">Create Preset</button>
            <button @click="cancelNewPreset" class="btn btn-secondary">Cancel</button>
          </div>
        </div>
      </div>
    </div>

    <!-- OAuth Callback Handler -->
    <div v-if="isHandlingCallback" class="modal-overlay">
      <div class="modal-content">
        <div class="modal-body">
          <div class="text-center">
            <div class="spinner"></div>
            <h3>Connecting to Visma...</h3>
            <p>Please wait while we complete the authentication process.</p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useVismaStore } from '../stores/visma'
import axios from 'axios'

interface Preset {
  id: number
  code: string
  name: string
  article_name?: string
  unit_price_cents: number
  currency: string
  vat_code: string
}

const router = useRouter()
const route = useRoute()
const vismaStore = useVismaStore()

const isHandlingCallback = ref(false)
const isTesting = ref(false)
const connectionTestResult = ref<{ success: boolean; message: string } | null>(null)
const presets = ref<Preset[]>([])
const isLoadingPresets = ref(false)
const editingPreset = ref<Preset | null>(null)
const showNewPresetForm = ref(false)
const newPreset = ref<Preset>({
  id: 0,
  code: '',
  name: '',
  article_name: '',
  unit_price_cents: 0,
  currency: 'NOK',
  vat_code: '25'
})

// Local Visma credentials (browser only)
const vismaClientId = ref('')
const vismaClientSecret = ref('')

const loadLocalVismaCreds = () => {
  vismaClientId.value = localStorage.getItem('vismaClientId') || ''
  vismaClientSecret.value = localStorage.getItem('vismaClientSecret') || ''
}

const saveLocalVismaCreds = () => {
  localStorage.setItem('vismaClientId', vismaClientId.value.trim())
  localStorage.setItem('vismaClientSecret', vismaClientSecret.value.trim())
  alert('Saved local Visma credentials')
}

const clearLocalVismaCreds = () => {
  localStorage.removeItem('vismaClientId')
  localStorage.removeItem('vismaClientSecret')
  loadLocalVismaCreds()
  alert('Cleared local Visma credentials')
}

const articles = ref<any[]>([]);
const isLoadingArticles = ref(false);
const isCreatingArticles = ref(false);
const articleMapping = ref({
  ok: ''
});

const loadArticles = async () => {
  if (!vismaStore.isConnected) return;
  isLoadingArticles.value = true;
  try {
    const response = await axios.get('/api/articles');
    articles.value = response.data;
  } catch (error) {
    console.error('Failed to load articles:', error);
  } finally {
    isLoadingArticles.value = false;
  }
};

const saveArticleMapping = () => {
  localStorage.setItem('articleMapping', JSON.stringify(articleMapping.value));
  alert('Article mapping saved!');
};

const loadArticleMapping = () => {
  const savedMapping = localStorage.getItem('articleMapping');
  if (savedMapping) {
    articleMapping.value = JSON.parse(savedMapping);
  }
};

const createTransportArticles = async () => {
  if (!confirm('This will create a new transport service article in your Visma account based on your preset. Continue?')) {
    return;
  }

  isCreatingArticles.value = true;
  try {
    const response = await axios.post('/api/articles/create-transport-articles');
    
    if (response.data.success) {
      // Auto-select the newly created article
      articleMapping.value.ok = response.data.articles.ok;
      
      // Save the mapping
      localStorage.setItem('articleMapping', JSON.stringify(articleMapping.value));
      
      // Refresh the articles list to show the new one
      await loadArticles();
      
      alert('Transport service article created and mapped successfully!');
    }
  } catch (error: any) {
    console.error('Failed to create transport article:', error);
    alert('Failed to create transport article. Please check the console for details.');
  } finally {
    isCreatingArticles.value = false;
  }
};

const connectToVisma = async () => {
  try {
    const authUrl = await vismaStore.getAuthUrl()
    window.location.href = authUrl
  } catch (error) {
    console.error('Failed to get auth URL:', error)
  }
}

const disconnectFromVisma = async () => {
  if (!confirm('Are you sure you want to disconnect from Visma? You will need to re-authenticate to use the application.')) {
    return
  }

  try {
    await vismaStore.disconnect()
    connectionTestResult.value = null
  } catch (error) {
    console.error('Failed to disconnect:', error)
  }
}

const testConnection = async () => {
  isTesting.value = true
  connectionTestResult.value = null

  try {
    const response = await axios.get('/api/auth/visma/status')
    
    if (response.data.connected) {
      connectionTestResult.value = {
        success: true,
        message: 'Connection test successful! API is working correctly.'
      }
    } else {
      connectionTestResult.value = {
        success: false,
        message: 'Connection test failed. Please try reconnecting.'
      }
    }
  } catch (error) {
    connectionTestResult.value = {
      success: false,
      message: 'Connection test failed. Please check your connection and try again.'
    }
  } finally {
    isTesting.value = false
  }
}

const loadPresets = async () => {
  isLoadingPresets.value = true
  
  try {
    const response = await axios.get('/api/invoices/presets')
    presets.value = response.data
  } catch (error) {
    console.error('Failed to load presets:', error)
  } finally {
    isLoadingPresets.value = false
  }
}

const startEdit = (preset: Preset) => {
  editingPreset.value = { ...preset }
}

const cancelEdit = () => {
  editingPreset.value = null
}

const savePreset = async () => {
  if (!editingPreset.value) return
  
  try {
    const response = await axios.put(`/api/invoices/presets/${editingPreset.value.id}`, editingPreset.value)
    
    // Update the preset in the list
    const index = presets.value.findIndex(p => p.id === editingPreset.value!.id)
    if (index !== -1) {
      presets.value[index] = response.data
    }
    
    editingPreset.value = null
    console.log('Preset updated successfully')
  } catch (error) {
    console.error('Failed to update preset:', error)
    alert('Failed to update preset. Please try again.')
  }
}

const deletePreset = async (presetId: number) => {
  if (!confirm('Are you sure you want to delete this preset?')) return
  
  try {
    await axios.delete(`/api/invoices/presets/${presetId}`)
    
    // Remove from local list
    presets.value = presets.value.filter(p => p.id !== presetId)
    console.log('Preset deleted successfully')
  } catch (error) {
    console.error('Failed to delete preset:', error)
    alert('Failed to delete preset. Please try again.')
  }
}

const startNewPreset = () => {
  showNewPresetForm.value = true
  newPreset.value = {
    id: 0,
    code: '',
    name: '',
    article_name: '',
    unit_price_cents: 0,
    currency: 'NOK',
    vat_code: '25'
  }
}

const cancelNewPreset = () => {
  showNewPresetForm.value = false
}

const createPreset = async () => {
  if (!newPreset.value.code || !newPreset.value.name || !newPreset.value.unit_price_cents) {
    alert('Please fill in all required fields (Code, Name, Unit Price)')
    return
  }
  
  try {
    const response = await axios.post('/api/invoices/presets', newPreset.value)
    
    // Add to local list
    presets.value.push(response.data)
    
    showNewPresetForm.value = false
    console.log('Preset created successfully')
  } catch (error) {
    console.error('Failed to create preset:', error)
    alert('Failed to create preset. Please try again.')
  }
}

const formatPrice = (cents: number, currency: string) => {
  const amount = cents / 100
  return new Intl.NumberFormat('nb-NO', {
    style: 'currency',
    currency: currency || 'NOK',
  }).format(amount)
}

const handleOAuthCallback = async () => {
  const code = route.query.code as string
  const state = route.query.state as string

  if (code) {
    isHandlingCallback.value = true
    
    try {
      await vismaStore.handleCallback(code, state)
      
      // Remove query parameters from URL
      router.replace({ name: 'setup' })
      
      connectionTestResult.value = {
        success: true,
        message: 'Successfully connected to Visma eAccounting!'
      }
    } catch (error) {
      console.error('OAuth callback failed:', error)
      connectionTestResult.value = {
        success: false,
        message: 'Failed to complete authentication. Please try again.'
      }
    } finally {
      isHandlingCallback.value = false
    }
  }
}

onMounted(async () => {
  // Handle OAuth callback if present (old flow)
  if (route.query.code) {
    handleOAuthCallback()
    return
  }

  // Handle successful authentication from backend redirect
  if (route.query.auth === 'success') {
    console.log('✅ Authentication successful! Checking connection status...')
    
    // Clear the URL parameters
    router.replace({ name: 'setup' })
    
    // Check connection status to update the UI
    await vismaStore.checkConnection()
    
    if (vismaStore.isConnected) {
      loadPresets();
      loadArticles();
      loadArticleMapping();
    }
    return
  }

  // Handle authentication errors
  if (route.query.error) {
    const error = route.query.error as string
    console.error('❌ Authentication error:', error)
    
    // Clear the URL parameters
    router.replace({ name: 'setup' })
    
    connectionTestResult.value = {
      success: false,
      message: `Authentication failed: ${error}`
    }
    return
  }

  // Check initial connection status
  await vismaStore.checkConnection()
  
  // Load presets if connected
  if (vismaStore.isConnected) {
    loadPresets()
  }

  // Load local Visma client credentials
  loadLocalVismaCreds()
})
</script>

<style scoped>
.setup-section,
.connected-section,
.config-section {
  margin-bottom: 2rem;
}

.oauth-info {
  margin-top: 1.5rem;
  padding: 1rem;
  background-color: #f8f9fa;
  border-radius: 4px;
}

.oauth-info h4 {
  margin-top: 0;
  color: #495057;
}

.oauth-info ul {
  margin-bottom: 0;
}

.oauth-info li {
  margin-bottom: 0.5rem;
}

.connected-section .alert {
  margin-bottom: 1.5rem;
}

.connection-actions {
  display: flex;
  gap: 1rem;
  margin-bottom: 1rem;
}

.connection-test-result {
  margin-top: 1rem;
}

.config-section h4 {
  color: #495057;
  margin-bottom: 0.5rem;
}

.empty-state {
  text-align: center;
  padding: 2rem 1rem;
  color: #6c757d;
  font-style: italic;
}

code {
  background-color: #f8f9fa;
  padding: 0.2rem 0.4rem;
  border-radius: 3px;
  font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
  font-size: 0.875rem;
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 8px;
  padding: 2rem;
  max-width: 400px;
  width: 90%;
}

.modal-body {
  text-align: center;
}

.text-center {
  text-align: center;
}

@media (max-width: 768px) {
  .connection-actions {
    flex-direction: column;
  }
}

/* Preset Management Styles */
.preset-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

.new-preset-form {
  margin-top: 1.5rem;
  padding: 1.5rem;
  background-color: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #dee2e6;
}

.new-preset-form h5 {
  margin-top: 0;
  margin-bottom: 1rem;
  color: #495057;
}

.form-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1rem;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group label {
  font-weight: 500;
  margin-bottom: 0.25rem;
  color: #495057;
}

.form-control {
  padding: 0.375rem 0.75rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 0.875rem;
}

.form-control:focus {
  outline: none;
  border-color: #80bdff;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}

.form-actions {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
}

.btn-group {
  display: flex;
  gap: 0.25rem;
}

.btn-sm {
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
}

.table td input,
.table td select {
  width: 100%;
  padding: 0.25rem 0.5rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 0.875rem;
}

.article-mapping-form {
  display: grid;
  gap: 1.5rem;
  margin-top: 1rem;
}

.form-text {
  color: #6c757d;
  font-size: 0.875rem;
  margin-top: 0.25rem;
}
</style>

