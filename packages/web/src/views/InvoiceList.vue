<template>
  <div class="invoice-list">
    <div class="card">
      <div class="card-header">
        <h2>Invoices</h2>
        <div class="header-actions">
          <button 
            v-if="hasLocalDrafts" 
            @click="validateAndCreateInvoices" 
            class="btn btn-primary btn-sm" 
            :disabled="isCreatingInVisma || isValidating"
          >
            <span v-if="isValidating">Validating...</span>
            <span v-else-if="isCreatingInVisma">Creating in Visma...</span>
            <span v-else>Create Invoices ({{ localDraftsCount }})</span>
          </button>
          <button 
            @click="bulkDeleteDrafts" 
            class="btn btn-danger btn-sm" 
            :disabled="isDeletingDrafts"
            title="Delete all draft invoices from Visma"
          >
            <span v-if="isDeletingDrafts">Deleting...</span>
            <span v-else>🗑️ Delete All Drafts</span>
          </button>
          <button 
            @click="clearLocalInvoices" 
            class="btn btn-warning btn-sm" 
            :disabled="isClearingLocal"
            title="Clear local invoice list from memory"
          >
            <span v-if="isClearingLocal">Clearing...</span>
            <span v-else>🧹 Clear Local</span>
          </button>
          <button @click="loadInvoices" class="btn btn-secondary btn-sm" :disabled="isLoading">
            <span v-if="isLoading">Loading...</span>
            <span v-else>Refresh</span>
          </button>
        </div>
      </div>

      <div v-if="isLoading && invoices.length === 0" class="spinner"></div>

      <div v-else-if="invoices.length === 0" class="empty-state">
        <p>No invoices found. Upload and process some files first.</p>
        <router-link to="/" class="btn">Upload Files</router-link>
      </div>

      <div v-else class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Reference</th>
              <th>Customer</th>
              <th>Amount</th>
              <th>Status</th>
              <th>Visma ID</th>
              <th>Created</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="invoice in invoices" :key="invoice.id">
              <td>{{ invoice.id }}</td>
              <td>{{ invoice.referanse || '-' }}</td>
              <td>{{ invoice.mottaker || '-' }}</td>
              <td>{{ formatAmount(invoice.total_cents, invoice.currency) }}</td>
              <td>
                <span :class="['status-badge', invoice.status]">
                  {{ invoice.status }}
                </span>
              </td>
              <td>
                <span v-if="invoice.visma_invoice_id" class="visma-id">
                  {{ invoice.visma_invoice_id }}
                </span>
                <span v-else class="text-muted">-</span>
              </td>
              <td>{{ formatDate(invoice.created_at) }}</td>
              <td>
                <div class="action-buttons">
                  <button
                    @click="viewInvoice(invoice.id)"
                    class="btn btn-sm btn-secondary"
                  >
                    View
                  </button>
                  <button
                    v-if="invoice.status === 'draft' && invoice.visma_invoice_id"
                    @click="sendInvoice(invoice.id)"
                    class="btn btn-sm btn-success"
                    :disabled="sendingInvoices.has(invoice.id)"
                  >
                    <span v-if="sendingInvoices.has(invoice.id)">Sending...</span>
                    <span v-else>Send</span>
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Invoice Details Modal -->
    <div v-if="selectedInvoice" class="modal-overlay" @click="closeModal">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>Invoice Details</h3>
          <button @click="closeModal" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <div class="invoice-details">
            <div class="detail-row">
              <strong>Local ID:</strong> {{ selectedInvoice.id }}
            </div>
            <div class="detail-row">
              <strong>Reference:</strong> {{ selectedInvoice.referanse || '-' }}
            </div>
            <div class="detail-row">
              <strong>Customer:</strong> {{ selectedInvoice.mottaker || '-' }}
            </div>
            <div class="detail-row">
              <strong>Amount:</strong> {{ formatAmount(selectedInvoice.total_cents, selectedInvoice.currency) }}
            </div>
            <div class="detail-row">
              <strong>Status:</strong> 
              <span :class="['status-badge', selectedInvoice.status]">
                {{ selectedInvoice.status }}
              </span>
            </div>
            <div class="detail-row">
              <strong>Visma Invoice ID:</strong> {{ selectedInvoice.visma_invoice_id || '-' }}
            </div>
            <div class="detail-row">
              <strong>Created:</strong> {{ formatDate(selectedInvoice.created_at) }}
            </div>
            <div class="detail-row">
              <strong>Source File:</strong> {{ selectedInvoice.filename || '-' }}
            </div>
            
            <div v-if="selectedInvoice.visma_details" class="visma-details">
              <h4>Visma Details</h4>
              <pre>{{ JSON.stringify(selectedInvoice.visma_details, null, 2) }}</pre>
            </div>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="closeModal" class="btn btn-secondary">Close</button>
          <button
            v-if="selectedInvoice.status === 'draft' && selectedInvoice.visma_invoice_id"
            @click="sendInvoice(selectedInvoice.id)"
            class="btn btn-success"
            :disabled="sendingInvoices.has(selectedInvoice.id)"
          >
            <span v-if="sendingInvoices.has(selectedInvoice.id)">Sending...</span>
            <span v-else>Send Invoice</span>
          </button>
        </div>
      </div>
    </div>

    <div v-if="error" class="alert alert-error">
      {{ error }}
    </div>

    <!-- Customer Info Modal (per-customer editable table) -->
    <div v-if="showCustomerModal" class="modal-overlay" @click="closeCustomerModal">
      <div class="modal-content customer-modal" @click.stop>
        <div class="modal-header">
          <h3>Customer Information Required</h3>
          <button @click="closeCustomerModal" class="close-btn">&times;</button>
        </div>
        <div class="modal-body">
          <p class="modal-description">
            Please fill missing data for customers that will be created in Visma. You can edit Address, City, Postal Code, Country, and Terms of Payment per customer.
          </p>
          <div class="table-responsive">
            <table class="table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Address</th>
                  <th>City</th>
                  <th>Postal Code</th>
                  <th>Country</th>
                  <th>Terms of Payment</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="name in customersNeedingInfo" :key="name">
                  <td>{{ name }}</td>
                  <td>
                    <input class="form-input" v-model="perCustomerOverrides[name].address" placeholder="e.g., Address" />
                  </td>
                  <td>
                    <input class="form-input" v-model="perCustomerOverrides[name].city" placeholder="e.g., Oslo" />
                  </td>
                  <td>
                    <input class="form-input" v-model="perCustomerOverrides[name].postalCode" placeholder="e.g., 0001" />
                  </td>
                  <td>
                    <select class="form-input" v-model="perCustomerOverrides[name].country">
                      <option value="NO">NO</option>
                      <option value="SE">SE</option>
                      <option value="DK">DK</option>
                      <option value="FI">FI</option>
                    </select>
                  </td>
                  <td>
                    <select class="form-input" v-model="perCustomerOverrides[name].termsOfPaymentId">
                      <option value="">None (use default)</option>
                      <option v-for="t in termsOptions" :key="t.Id" :value="t.Id">{{ t.Name }}</option>
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="closeCustomerModal" class="btn btn-secondary">Cancel</button>
          <button @click="proceedWithInvoiceCreation" class="btn btn-primary">
            Create Invoices ({{ customersNeedingInfo.length }})
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import axios from 'axios'

interface Invoice {
  id: number
  total_cents: number
  currency: string
  visma_invoice_id: string | null
  status: string
  created_at: string
  referanse: string | null
  mottaker: string | null
  filename: string | null
  visma_details?: any
}

const invoices = ref<Invoice[]>([])
const selectedInvoice = ref<Invoice | null>(null)
const isLoading = ref(false)
const error = ref('')
const sendingInvoices = ref(new Set<number>())
const isCreatingInVisma = ref(false)

const isValidating = ref(false)
const validationResult = ref<any>(null)
const isDeletingDrafts = ref(false)
const isClearingLocal = ref(false)
const termsOptions = ref<any[]>([])
const perCustomerOverrides = ref<Record<string, { address: string; city: string; postalCode: string; country: string; termsOfPaymentId?: string }>>({})
const showCustomerModal = ref(false)
const customerDefaults = ref({
  city: 'Oslo',
  postalCode: '0001', 
  address: 'Ukjent adresse',
  country: 'NO',
  skipPaymentTerms: true
})

// Computed properties for local drafts
const hasLocalDrafts = computed(() => {
  return invoices.value.some(invoice => !invoice.visma_invoice_id)
})

const localDraftsCount = computed(() => {
  return invoices.value.filter(invoice => !invoice.visma_invoice_id).length
})

const isCustomerFormValid = computed(() => {
  return customerDefaults.value.city && 
         customerDefaults.value.postalCode && 
         customerDefaults.value.address && 
         customerDefaults.value.country
})

const customersNeedingInfo = computed(() => {
  const names = new Set<string>()
  invoices.value
    .filter(inv => !inv.visma_invoice_id)
    .forEach(inv => { if (inv.mottaker) names.add(inv.mottaker) })
  return Array.from(names)
})

const validateAndCreateInvoices = async () => {
  // Initialize per-customer overrides from defaults
  customersNeedingInfo.value.forEach(name => {
    if (!perCustomerOverrides.value[name]) {
      perCustomerOverrides.value[name] = {
        address: customerDefaults.value.address,
        city: customerDefaults.value.city,
        postalCode: customerDefaults.value.postalCode,
        country: customerDefaults.value.country,
        termsOfPaymentId: ''
      }
    }
  })
  // Load terms of payments for dropdown
  try {
    const resp = await axios.get('/api/visma/termsofpayments')
    termsOptions.value = resp.data?.items || []
  } catch (e) {
    termsOptions.value = []
  }
  showCustomerModal.value = true
}

const closeCustomerModal = () => {
  showCustomerModal.value = false
}

const proceedWithInvoiceCreation = async () => {
  if (!isCustomerFormValid.value) return
  
  showCustomerModal.value = false
  isValidating.value = true
  error.value = ''
  
  try {
    // First, validate all invoices
    const validationResponse = await axios.post('/api/invoices/validate-for-visma')
    validationResult.value = validationResponse.data
    
    if (!validationResponse.data.valid) {
      // Show validation errors
      const issues = validationResponse.data.invoices
        .filter((inv: any) => inv.status === 'invalid')
        .map((inv: any) => `${inv.referanse}: ${inv.issues.join(', ')}`)
        .join('\n')
      
      alert(`❌ Cannot create invoices due to validation errors:\n\n${issues}`)
      return
    }
    
    // Show confirmation dialog with validation results
    const { total_invoices, warnings } = validationResponse.data
    let confirmMessage = `Ready to create ${total_invoices} invoices in Visma eAccounting.`
    
    if (warnings.length > 0) {
      confirmMessage += `\n\n⚠️ Warnings:\n${warnings.join('\n')}`
    }
    
    confirmMessage += '\n\nDo you want to proceed?'
    
    if (!confirm(confirmMessage)) {
      return
    }
    
    // Proceed with invoice creation
    await createInvoicesInVisma()
    
  } catch (err: any) {
    console.error('Validation failed:', err)
    if (err.response?.status === 401) {
      error.value = 'Not authenticated with Visma. Please go to Setup and connect first.'
    } else {
      error.value = err.response?.data?.error || 'Validation failed'
    }
  } finally {
    isValidating.value = false
  }
}





const createInvoicesInVisma = async () => {
  isCreatingInVisma.value = true
  error.value = ''
  
  const savedMapping = localStorage.getItem('articleMapping');
  if (!savedMapping) {
    alert('Article mapping is not configured. Please go to Setup and map articles.');
    isCreatingInVisma.value = false;
    return;
  }
  const articleMapping = JSON.parse(savedMapping);

  try {
    // Check if we have an import_id from recent upload (Vercel workflow)
    const lastUpload = localStorage.getItem('lastUploadResult')
    let import_id = null
    if (lastUpload) {
      try {
        const uploadData = JSON.parse(lastUpload)
        import_id = uploadData.data?.import_id
      } catch (e) {
        console.warn('Could not parse upload result:', e)
      }
    }

    const requestData = {
      customerDefaults: customerDefaults.value,
      customerOverrides: perCustomerOverrides.value,
      articleMapping: articleMapping,
      ...(import_id && { import_id }) // Include import_id if available (Vercel)
    }

    const response = await axios.post('/api/invoices/create-in-visma', requestData)
    
    if (response.data.success) {
      // Handle both local and Vercel API response formats
      const created = response.data.created || response.data.summary?.successful || 0
      const errors = response.data.errors || response.data.summary?.errors || []
      const failed = response.data.summary?.failed || 0
      
      if (created > 0) {
        alert(`✅ Successfully created ${created} invoices in Visma eAccounting!`)
        // Refresh the invoice list to show updated Visma IDs
        await loadInvoices()
      }
      
      if (errors.length > 0 || failed > 0) {
        console.warn('Some invoices failed:', errors)
        const failedCount = failed || errors.length
        alert(`⚠️ Created ${created} invoices, but ${failedCount} failed. Check console for details.`)
      }
      
      // Handle Vercel-specific response format
      if (response.data.note) {
        console.info('Note:', response.data.note)
      }
    }
  } catch (err: any) {
    console.error('Failed to create invoices in Visma:', err)
    if (err.response?.status === 401) {
      error.value = 'Not authenticated with Visma. Please go to Setup and connect first.'
    } else {
      error.value = err.response?.data?.error || 'Failed to create invoices in Visma'
    }
  } finally {
    isCreatingInVisma.value = false
  }
}

const loadInvoices = async () => {
  isLoading.value = true
  error.value = ''
  
  try {
    const response = await axios.get('/api/invoices')
    // Ensure we always have an array, handle both local and Vercel API formats
    if (response.data.invoices) {
      // Vercel format with import data
      invoices.value = response.data.invoices
    } else if (Array.isArray(response.data)) {
      // Local format - direct array
      invoices.value = response.data
    } else {
      // Fallback to empty array
      invoices.value = []
    }
  } catch (err: any) {
    console.error('Failed to load invoices:', err)
    error.value = err.response?.data?.error || 'Failed to load invoices'
    // Ensure invoices is always an array even on error
    invoices.value = []
  } finally {
    isLoading.value = false
  }
}

const viewInvoice = async (invoiceId: number) => {
  try {
    const response = await axios.get(`/api/invoices/${invoiceId}`)
    selectedInvoice.value = response.data
  } catch (err: any) {
    console.error('Failed to load invoice details:', err)
    error.value = err.response?.data?.error || 'Failed to load invoice details'
  }
}

const sendInvoice = async (invoiceId: number) => {
  if (!confirm('Are you sure you want to send this invoice? This action cannot be undone.')) {
    return
  }

  sendingInvoices.value.add(invoiceId)
  error.value = ''
  
  try {
    await axios.post(`/api/invoices/${invoiceId}/send`)
    
    // Update local invoice status
    const invoice = invoices.value.find(inv => inv.id === invoiceId)
    if (invoice) {
      invoice.status = 'sent'
    }
    
    // Update selected invoice if it's the same one
    if (selectedInvoice.value && selectedInvoice.value.id === invoiceId) {
      selectedInvoice.value.status = 'sent'
    }
    
    alert('Invoice sent successfully!')
  } catch (err: any) {
    console.error('Failed to send invoice:', err)
    error.value = err.response?.data?.error || 'Failed to send invoice'
  } finally {
    sendingInvoices.value.delete(invoiceId)
  }
}

const bulkDeleteDrafts = async () => {
  if (!confirm('⚠️ This will DELETE ALL draft invoices from Visma. This action cannot be undone. Are you sure?')) {
    return
  }

  isDeletingDrafts.value = true
  error.value = ''
  
  try {
    const response = await axios.delete('/api/visma/invoices/bulk-delete-drafts')
    
    if (response.data.success) {
      const { deleted, errors } = response.data
      
      if (deleted > 0) {
        alert(`✅ Successfully deleted ${deleted} draft invoices from Visma!`)
        // Refresh the invoice list
        await loadInvoices()
      }
      
      if (errors && errors.length > 0) {
        console.warn('Some deletions failed:', errors)
        alert(`⚠️ Deleted ${deleted} invoices, but ${errors.length} failed. Check console for details.`)
      }
      
      if (deleted === 0) {
        alert('ℹ️ No draft invoices found to delete.')
      }
    }
  } catch (err: any) {
    console.error('Failed to bulk delete drafts:', err)
    if (err.response?.status === 401) {
      error.value = 'Not authenticated with Visma. Please go to Setup and connect first.'
    } else {
      error.value = err.response?.data?.error || 'Failed to delete draft invoices'
    }
  } finally {
    isDeletingDrafts.value = false
  }
}

const clearLocalInvoices = async () => {
  if (!confirm('This will clear all local invoices from the application memory. Continue?')) {
    return
  }

  isClearingLocal.value = true
  error.value = ''
  
  try {
    const response = await axios.delete('/api/invoices/clear-local')
    
    if (response.data.success) {
      const { cleared } = response.data
      alert(`✅ Cleared ${cleared} local invoices from memory!`)
      // Refresh the invoice list to show empty state
      await loadInvoices()
    }
  } catch (err: any) {
    console.error('Failed to clear local invoices:', err)
    error.value = err.response?.data?.error || 'Failed to clear local invoices'
  } finally {
    isClearingLocal.value = false
  }
}

const closeModal = () => {
  selectedInvoice.value = null
}

const formatAmount = (cents: number, currency: string) => {
  const amount = cents / 100
  return new Intl.NumberFormat('nb-NO', {
    style: 'currency',
    currency: currency || 'NOK',
  }).format(amount)
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString('nb-NO')
}

onMounted(() => {
  loadInvoices()
})
</script>

<style scoped>
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.card-header h2 {
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 0.5rem;
  align-items: center;
}

.empty-state {
  text-align: center;
  padding: 3rem 1rem;
  color: #6c757d;
}

.status-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.status-badge.draft {
  background-color: #ffc107;
  color: #212529;
}

.status-badge.sent {
  background-color: #17a2b8;
  color: white;
}

.status-badge.paid {
  background-color: #28a745;
  color: white;
}

.status-badge.cancelled {
  background-color: #dc3545;
  color: white;
}

.visma-id {
  font-family: monospace;
  font-size: 0.875rem;
  background-color: #f8f9fa;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
}

.text-muted {
  color: #6c757d;
}

.action-buttons {
  display: flex;
  gap: 0.5rem;
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
  max-width: 600px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #dee2e6;
}

.modal-header h3 {
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #6c757d;
}

.close-btn:hover {
  color: #343a40;
}

.modal-body {
  padding: 1.5rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid #dee2e6;
}

.invoice-details .detail-row {
  display: flex;
  padding: 0.5rem 0;
  border-bottom: 1px solid #f8f9fa;
}

.invoice-details .detail-row strong {
  min-width: 150px;
  margin-right: 1rem;
}

.visma-details {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid #dee2e6;
}

.visma-details pre {
  background-color: #f8f9fa;
  padding: 1rem;
  border-radius: 4px;
  overflow-x: auto;
  font-size: 0.875rem;
}

/* Customer Modal Styles */
.customer-modal {
  max-width: 500px;
  width: 90%;
}

.modal-description {
  margin-bottom: 1.5rem;
  color: #6c757d;
  line-height: 1.5;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 600;
  color: #343a40;
}

.form-input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ced4da;
  border-radius: 4px;
  font-size: 1rem;
  transition: border-color 0.15s ease-in-out, box-shadow 0.15s ease-in-out;
}

.form-input:focus {
  outline: 0;
  border-color: #007bff;
  box-shadow: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
}

.checkbox-group {
  display: flex;
  align-items: center;
  padding: 1rem;
  background-color: #f8f9fa;
  border-radius: 4px;
  border: 1px solid #e9ecef;
}

.checkbox-group label {
  display: flex;
  align-items: center;
  margin-bottom: 0;
  font-weight: normal;
  cursor: pointer;
}

.checkbox-group input[type="checkbox"] {
  margin-right: 0.5rem;
  width: auto;
}

@media (max-width: 768px) {
  .action-buttons {
    flex-direction: column;
  }
  
  .modal-content, .customer-modal {
    width: 95%;
    margin: 1rem;
  }
  
  .invoice-details .detail-row {
    flex-direction: column;
  }
  
  .invoice-details .detail-row strong {
    min-width: auto;
    margin-right: 0;
    margin-bottom: 0.25rem;
  }
}
</style>

