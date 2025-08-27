<template>
  <div class="file-upload">
    <div class="card">
      <h2>Upload Files</h2>
      <p>Upload an Excel file with transport data and optional PDF declarations.</p>
      
      <form @submit.prevent="handleUpload" class="upload-form">
        <div class="form-group">
          <label for="excel-file" class="form-label">Excel File *</label>
          <input
            id="excel-file"
            ref="excelInput"
            type="file"
            accept=".xlsx,.xls"
            @change="handleExcelSelect"
            class="form-control"
            required
          />
          <small class="form-text">Supported formats: .xlsx, .xls</small>
        </div>

        <div class="form-group">
          <label for="pdf-files" class="form-label">PDF Declarations (Optional)</label>
          <input
            id="pdf-files"
            ref="pdfInput"
            type="file"
            accept=".pdf"
            multiple
            @change="handlePdfSelect"
            class="form-control"
          />
          <small class="form-text">You can select multiple PDF files</small>
        </div>

        <div v-if="selectedFiles.excel" class="selected-files">
          <h4>Selected Files:</h4>
          <div class="file-item">
            <strong>Excel:</strong> {{ selectedFiles.excel.name }} ({{ formatFileSize(selectedFiles.excel.size) }})
          </div>
          <div v-if="selectedFiles.pdfs.length > 0">
            <strong>PDFs:</strong>
            <ul>
              <li v-for="pdf in selectedFiles.pdfs" :key="pdf.name">
                {{ pdf.name }} ({{ formatFileSize(pdf.size) }})
              </li>
            </ul>
          </div>
        </div>

        <button 
          type="submit" 
          class="btn btn-primary"
          :disabled="!selectedFiles.excel || isUploading"
        >
          <span v-if="isUploading">Uploading...</span>
          <span v-else>Upload Files</span>
        </button>
      </form>

      <div v-if="isUploading" class="spinner"></div>

      <div v-if="uploadResult" class="upload-result">
        <div v-if="uploadResult.errors.length === 0" class="alert alert-success">
          <h4>Upload Successful!</h4>
          <p>
            Processed {{ uploadResult.valid_rows }} out of {{ uploadResult.total_rows }} rows.
            <br>
            Import ID: {{ uploadResult.import_id }}
          </p>
          <button 
            @click="generateInvoicesDirect" 
            class="btn btn-primary btn-sm"
            :disabled="isGenerating"
          >
            <span v-if="isGenerating">Generating…</span>
            <span v-else>Generate Invoices</span>
          </button>
          
          <!-- Progress Bar -->
          <div v-if="generationProgress" class="progress-container">
            <div class="progress-bar">
              <div 
                class="progress-fill" 
                :style="{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }"
              ></div>
            </div>
            <p class="progress-text">{{ generationProgress.message }} ({{ generationProgress.current }}/{{ generationProgress.total }})</p>
          </div>
        </div>

        <div v-else class="alert alert-warning">
          <h4>Upload Completed with Errors</h4>
          <p>
            Processed {{ uploadResult.valid_rows }} out of {{ uploadResult.total_rows }} rows.
            {{ uploadResult.errors.length }} errors found:
          </p>
          <ul>
            <li v-for="error in uploadResult.errors.slice(0, 10)" :key="error">
              {{ error }}
            </li>
            <li v-if="uploadResult.errors.length > 10">
              ... and {{ uploadResult.errors.length - 10 }} more errors
            </li>
          </ul>
          <button 
            v-if="uploadResult.valid_rows > 0"
            @click="generateInvoicesDirect" 
            class="btn btn-primary btn-sm"
            :disabled="isGenerating"
          >
            <span v-if="isGenerating">Generating…</span>
            <span v-else>Generate Invoices</span>
          </button>
          
          <!-- Progress Bar -->
          <div v-if="generationProgress" class="progress-container">
            <div class="progress-bar">
              <div 
                class="progress-fill" 
                :style="{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }"
              ></div>
            </div>
            <p class="progress-text">{{ generationProgress.message }} ({{ generationProgress.current }}/{{ generationProgress.total }})</p>
          </div>
        </div>
      </div>

      <div v-if="error" class="alert alert-error">
        {{ error }}
      </div>
    </div>

    <!-- Recent Imports -->
    <div v-if="recentImports.length > 0" class="card">
      <h3>Recent Imports</h3>
      <div class="table-responsive">
        <table class="table">
          <thead>
            <tr>
              <th>Import ID</th>
              <th>Filename</th>
              <th>Status</th>
              <th>Rows</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="importItem in recentImports" :key="importItem.id">
              <td>{{ importItem.id }}</td>
              <td>{{ importItem.filename }}</td>
              <td>
                <span :class="['status-badge', importItem.status]">
                  {{ importItem.status }}
                </span>
              </td>
              <td>{{ importItem.total_rows || 0 }}</td>
              <td>{{ formatDate(importItem.created_at) }}</td>
              <td>
                <button 
                  @click="processSpecificImport(importItem.id)"
                  class="btn btn-sm btn-success"
                  :disabled="importItem.status !== 'completed'"
                >
                  Process
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import axios from 'axios'

interface SelectedFiles {
  excel: File | null
  pdfs: File[]
}

interface UploadResult {
  import_id: number
  filename: string
  status: string
  total_rows: number
  valid_rows: number
  errors: string[]
  pdf_files: Array<{
    originalName: string
    size: number
    hasText: boolean
  }>
  _vercel_import_data?: {
    invoices: any[]
    timestamp: string
    filename: string
    total_count: number
  }
}

interface ImportItem {
  id: number
  filename: string
  status: string
  total_rows: number
  created_at: string
}

const selectedFiles = ref<SelectedFiles>({
  excel: null,
  pdfs: []
})

const isUploading = ref(false)
const uploadResult = ref<UploadResult | null>(null)
const error = ref('')
const recentImports = ref<ImportItem[]>([])
const isGenerating = ref(false)
const generationProgress = ref<{ current: number; total: number; message: string } | null>(null)

// Load persisted upload result on component mount
const loadPersistedUploadResult = () => {
  try {
    const saved = localStorage.getItem('lastUploadResult')
    if (saved) {
      const parsedResult = JSON.parse(saved)
      // Only restore if it's recent (within last hour)
      const oneHourAgo = Date.now() - (60 * 60 * 1000)
      if (parsedResult.timestamp && parsedResult.timestamp > oneHourAgo) {
        uploadResult.value = parsedResult.data
        console.log('✅ Restored upload result from localStorage')
      } else {
        // Clean up old data
        localStorage.removeItem('lastUploadResult')
      }
    }
  } catch (err) {
    console.warn('Failed to load persisted upload result:', err)
    localStorage.removeItem('lastUploadResult')
  }
}

// Save upload result to localStorage
const saveUploadResult = (result: UploadResult) => {
  try {
    const toSave = {
      data: result,
      timestamp: Date.now()
    }
    localStorage.setItem('lastUploadResult', JSON.stringify(toSave))
  } catch (err) {
    console.warn('Failed to save upload result:', err)
  }
}

const excelInput = ref<HTMLInputElement>()
const pdfInput = ref<HTMLInputElement>()

const handleExcelSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  selectedFiles.value.excel = target.files?.[0] || null
  uploadResult.value = null
  error.value = ''
  // Clear persisted upload result when selecting new file
  localStorage.removeItem('lastUploadResult')
}

const handlePdfSelect = (event: Event) => {
  const target = event.target as HTMLInputElement
  selectedFiles.value.pdfs = Array.from(target.files || [])
}

const handleUpload = async () => {
  if (!selectedFiles.value.excel) return

  isUploading.value = true
  error.value = ''
  uploadResult.value = null

  try {
    const formData = new FormData()
    formData.append('excel', selectedFiles.value.excel)
    
    selectedFiles.value.pdfs.forEach((pdf, index) => {
      formData.append('pdf', pdf)
    })

    const response = await axios.post('/api/upload/files', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    })

    // Defensively handle the response to prevent crashes
    const resultData = response.data;
    if (resultData && typeof resultData === 'object') {
      // Ensure the 'errors' property is always an array, even if the API omits it
      resultData.errors = resultData.errors || [];
      uploadResult.value = resultData;
      saveUploadResult(resultData);
    } else {
      // Handle cases where the response is not a valid object
      throw new Error('Received an invalid response from the server.');
    }
    
    // Reset form
    selectedFiles.value = { excel: null, pdfs: [] }
    if (excelInput.value) excelInput.value.value = ''
    if (pdfInput.value) pdfInput.value.value = ''
    
    // Refresh recent imports
    await loadRecentImports()
  } catch (err: any) {
    console.error('Upload failed:', err)
    error.value = err.response?.data?.error || 'Upload failed'
  } finally {
    isUploading.value = false
  }
}

const generateInvoicesDirect = async () => {
  if (!uploadResult.value) return
  isGenerating.value = true
  generationProgress.value = { current: 0, total: 0, message: 'Starting...' }
  
  try {
    // 1) Create draft invoices in memory from uploaded Excel
    generationProgress.value = { current: 1, total: 4, message: 'Processing Excel data...' }
    const processResp = await axios.post('/api/invoices/process-import', {
      import_id: uploadResult.value.import_id,
      // Pass import data for Vercel stateless environment
      import_data: (uploadResult.value as any)?._vercel_import_data
    })

    // 2) Create invoice drafts directly in Visma with PDF attachments
    generationProgress.value = { current: 2, total: 4, message: 'Loading configuration...' }
    const articleMapping = (() => {
      try { return JSON.parse(localStorage.getItem('articleMapping') || '{}') } catch { return {} }
    })()
    const customerDefaults = (() => {
      const fallback = { city: 'Oslo', postalCode: '0001', address: 'Ukjent adresse', country: 'NO', skipPaymentTerms: true }
      try { return { ...fallback, ...(JSON.parse(localStorage.getItem('customerDefaults') || '{}')) } } catch { return fallback }
    })()
    const customerOverrides = (() => {
      try { return JSON.parse(localStorage.getItem('customerOverrides') || '{}') } catch { return {} }
    })()

    console.log('Creating invoices directly with config:', { articleMapping, customerDefaults, customerOverrides })

    generationProgress.value = { current: 3, total: 4, message: 'Creating invoices in Visma...' }
    const directResp = await axios.post('/api/visma/invoices/create-direct', {
      import_id: uploadResult.value.import_id,
      articleMapping,
      customerDefaults,
      customerOverrides
    })

    generationProgress.value = { current: 4, total: 4, message: 'Completed!' }
    console.log('✅ Direct invoice creation completed:', directResp.data)
    
    // Show success message
    alert(`✅ Success! Created ${directResp.data.summary.successful} invoice drafts directly with PDF attachments. ${directResp.data.summary.failed} failed.`)
    
    // Clear the upload result since invoices have been generated
    uploadResult.value = null
    localStorage.removeItem('lastUploadResult')
    
    // Refresh recent imports to show updated status
    await loadRecentImports()
  } catch (err: any) {
    console.error('❌ Direct invoice generation failed:', err)
    const errorMsg = err.response?.data?.error || err.message || 'Direct invoice generation failed'
    alert(`❌ Error: ${errorMsg}`)
  } finally {
    isGenerating.value = false
    generationProgress.value = null
  }
}



const processSpecificImport = async (importId: number) => {
  try {
    // 1) Create draft invoices in memory from uploaded Excel
    const processResp = await axios.post('/api/invoices/process-import', {
      import_id: importId
      // Note: processSpecificImport doesn't have access to original import data
      // This will only work if the data is still in global storage (local server)
    })

    // 2) Create invoice drafts directly in Visma with PDF attachments
    const articleMapping = (() => {
      try { return JSON.parse(localStorage.getItem('articleMapping') || '{}') } catch { return {} }
    })()
    const customerDefaults = (() => {
      const fallback = { city: 'Oslo', postalCode: '0001', address: 'Ukjent adresse', country: 'NO', skipPaymentTerms: true }
      try { return { ...fallback, ...(JSON.parse(localStorage.getItem('customerDefaults') || '{}')) } } catch { return fallback }
    })()
    const customerOverrides = (() => {
      try { return JSON.parse(localStorage.getItem('customerOverrides') || '{}') } catch { return {} }
    })()

    const directResp = await axios.post('/api/visma/invoices/create-direct', {
      import_id: importId,
      articleMapping,
      customerDefaults,
      customerOverrides
    })

    alert(`✅ Success! Created ${directResp.data.summary.successful} invoice drafts directly with PDF attachments. ${directResp.data.summary.failed} failed.`)
    
    // Clear any persisted upload result since processing is complete
    uploadResult.value = null
    localStorage.removeItem('lastUploadResult')
    
    await loadRecentImports()
  } catch (err: any) {
    console.error('Processing failed:', err)
    error.value = err.response?.data?.error || 'Processing failed'
  }
}



const loadRecentImports = async () => {
  try {
    // This would need to be implemented in the API
    // const response = await axios.get('/api/upload/imports')
    // recentImports.value = response.data
  } catch (err) {
    console.warn('Failed to load recent imports:', err)
  }
}

const formatFileSize = (bytes: number) => {
  if (bytes === 0) return '0 Bytes'
  const k = 1024
  const sizes = ['Bytes', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}

const formatDate = (dateString: string) => {
  return new Date(dateString).toLocaleString()
}

onMounted(() => {
  loadPersistedUploadResult()
  loadRecentImports()
})
</script>

<style scoped>
.upload-form {
  margin-bottom: 2rem;
}

.form-text {
  color: #6c757d;
  font-size: 0.875rem;
  margin-top: 0.25rem;
}

.selected-files {
  background-color: #f8f9fa;
  padding: 1rem;
  border-radius: 4px;
  margin: 1rem 0;
}

.file-item {
  margin-bottom: 0.5rem;
}

.upload-result {
  margin-top: 2rem;
}

.status-badge {
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
}

.status-badge.pending {
  background-color: #ffc107;
  color: #212529;
}

.status-badge.processing {
  background-color: #17a2b8;
  color: white;
}

.status-badge.completed {
  background-color: #28a745;
  color: white;
}

.status-badge.failed {
  background-color: #dc3545;
  color: white;
}

/* Progress Bar Styles */
.progress-container {
  margin-top: 1rem;
}

.progress-bar {
  width: 100%;
  height: 20px;
  background-color: #e9ecef;
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 0.5rem;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #007bff, #0056b3);
  transition: width 0.3s ease;
  border-radius: 10px;
}

.progress-text {
  font-size: 0.875rem;
  color: #495057;
  margin: 0;
  text-align: center;
}
</style>



