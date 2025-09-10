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
          <small class="form-text">You can select multiple PDF files. <strong>Total upload limit: 4MB</strong> (including Excel file)</small>
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
          <div class="size-warning" :class="{ 'size-exceeded': getTotalSize() > 4 * 1024 * 1024 }">
            <strong>Total size:</strong> {{ formatFileSize(getTotalSize()) }} 
            <span v-if="getTotalSize() > 4 * 1024 * 1024" class="text-danger">⚠️ Exceeds 4MB limit!</span>
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

// Robust error message extractor to avoid "[object Object]" in UI
const extractErrorMessage = (err: any): string => {
  try {
    if (!err) return 'Unknown error';
    if (typeof err === 'string') return err;
    // Axios error shape
    const data = err?.response?.data;
    if (typeof data === 'string') return data;
    if (data && typeof data === 'object') {
      if (typeof data.error === 'string') return data.error;
      if (data.error && typeof data.error === 'object') {
        const devMsg = data.error.DeveloperErrorMessage || data.error.message;
        if (typeof devMsg === 'string') return devMsg;
        try { return JSON.stringify(data.error); } catch {}
      }
      if (typeof data.details === 'string') return data.details;
      if (data.details && typeof data.details === 'object') {
        const detailMsg = data.details.message || data.details.error;
        if (typeof detailMsg === 'string') return detailMsg;
      }
      // As a last resort stringify data
      try { return JSON.stringify(data); } catch {}
    }
    if (typeof err.message === 'string') return err.message;
    try { return JSON.stringify(err); } catch {}
    return 'Unexpected error';
  } catch {
    return 'Unexpected error';
  }
}

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

// Save upload result to localStorage (lightweight version to prevent quota issues)
const saveUploadResult = (result: UploadResult) => {
  try {
    // Create a lightweight version without base64 content to prevent quota issues
    const lightweightResult = {
      ...result,
      _vercel_import_data: result._vercel_import_data ? {
        ...result._vercel_import_data,
        pdfs: (result._vercel_import_data as any)?.pdfs ? 
          (result._vercel_import_data as any).pdfs.map((pdf: any) => ({
            filename: pdf.filename,
            size: pdf.size,
            mimetype: pdf.mimetype,
            index: pdf.index
            // Deliberately exclude 'content' to save space
          })) : []
      } : undefined
    }
    
    const toSave = {
      data: lightweightResult,
      timestamp: Date.now()
    }
    localStorage.setItem('lastUploadResult', JSON.stringify(toSave))
  } catch (err) {
    console.warn('Failed to save upload result:', err)
    // If still too large, save only essential data
    try {
      const minimal = {
        data: {
          import_id: result.import_id,
          filename: result.filename,
          status: result.status,
          total_rows: result.total_rows,
          valid_rows: result.valid_rows,
          errors: result.errors || []
        },
        timestamp: Date.now()
      }
      localStorage.setItem('lastUploadResult', JSON.stringify(minimal))
    } catch (minimalErr) {
      console.warn('Failed to save even minimal upload result:', minimalErr)
    }
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
    const excelFile = selectedFiles.value.excel
    const pdfFiles = selectedFiles.value.pdfs

    const MAX_REQUEST_BYTES = Math.floor(3.5 * 1024 * 1024) // ~3.5MB per request to stay under Vercel's limit
    const MULTIPART_OVERHEAD = 100 * 1024 // 100KB safety margin for multipart boundaries/headers

    // Split PDFs into batches under the limit. First batch must reserve space for the Excel file
    const batches: File[][] = []
    let currentBatch: File[] = []
    let currentBatchBytes = 0
    let firstBatchCapacity = MAX_REQUEST_BYTES - excelFile.size - MULTIPART_OVERHEAD
    if (firstBatchCapacity < 0) {
      // Excel alone exceeds our threshold; send Excel only in first batch
      firstBatchCapacity = 0
    }

    pdfFiles.forEach((pdf, idx) => {
      const pdfSize = pdf.size
      const limit = batches.length === 0 ? firstBatchCapacity : (MAX_REQUEST_BYTES - MULTIPART_OVERHEAD)
      if (currentBatchBytes + pdfSize > limit && currentBatch.length > 0) {
        batches.push(currentBatch)
        currentBatch = []
        currentBatchBytes = 0
      }
      // If single file larger than remaining capacity, start new batch (it will be sole file in that batch)
      if (pdfSize > (batches.length === 0 ? firstBatchCapacity : (MAX_REQUEST_BYTES - MULTIPART_OVERHEAD)) && currentBatch.length === 0) {
        // Force push as its own batch; backend has per-file 10MB limit
        batches.push([pdf])
      } else {
        currentBatch.push(pdf)
        currentBatchBytes += pdfSize
      }
    })
    if (currentBatch.length > 0) batches.push(currentBatch)

    console.log(`📦 Prepared ${batches.length} upload batch(es)`)

    // 1) Send first batch with Excel + first PDFs chunk (may be empty)
    const firstForm = new FormData()
    firstForm.append('excel', excelFile)
    ;(batches[0] || []).forEach(pdf => firstForm.append('pdf', pdf))
    const firstResp = await axios.post('/api/upload/files', firstForm, { headers: { 'Content-Type': 'multipart/form-data' } })
    const firstData = firstResp.data
    if (!firstData || typeof firstData !== 'object') {
      throw new Error('Received an invalid response from the server (initial batch).')
    }
    firstData.errors = firstData.errors || []
    uploadResult.value = firstData
    saveUploadResult(firstData)

    const importId = firstData.import_id
    if (!importId) throw new Error('Server did not return import_id')

    // Prepare lightweight import_data without base64 content for chunk requests
    const importDataLite = {
      invoices: firstData?._vercel_import_data?.invoices || [],
      pdfs: (firstData?._vercel_import_data?.pdfs || []).map((p: any) => ({ filename: p.filename, size: p.size, mimetype: p.mimetype, index: p.index })),
      timestamp: firstData?._vercel_import_data?.timestamp,
      filename: firstData?._vercel_import_data?.filename,
      total_count: firstData?._vercel_import_data?.total_count
    }

    // 2) Send remaining PDF batches with import_id and import_data, and pass content map
    for (let i = 1; i < batches.length; i++) {
      const form = new FormData()
      form.append('import_id', importId)
      try { form.append('import_data', JSON.stringify(importDataLite)) } catch {}
      batches[i].forEach(pdf => form.append('pdf', pdf))
      console.log(`📤 Uploading PDF chunk ${i}/${batches.length - 1} with ${batches[i].length} file(s) ...`)
      const resp = await axios.post('/api/upload/files', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      const data = resp.data
      if (data && typeof data === 'object') {
        data.errors = data.errors || []
        uploadResult.value = data // keep latest snapshot (has merged pdfs)
        saveUploadResult(data)
        // Store latest content map for immediate next step usage
        try { localStorage.setItem('pdfContentMap', JSON.stringify(data.pdf_content_map || {})) } catch {}
      }
    }

    // Reset form
    selectedFiles.value = { excel: null, pdfs: [] }
    if (excelInput.value) excelInput.value.value = ''
    if (pdfInput.value) pdfInput.value.value = ''

    await loadRecentImports()
  } catch (err: any) {
    console.error('Upload failed:', err)
    const msg = extractErrorMessage(err) || 'Upload failed'
    error.value = msg
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
    console.log('🔍 DEBUG: processResp.data.processed_invoices:', processResp.data.processed_invoices)
    console.log('🔍 DEBUG: uploadResult.value?._vercel_import_data:', uploadResult.value?._vercel_import_data)

    generationProgress.value = { current: 3, total: 4, message: 'Creating invoices in Visma...' }
    const requestPayload = {
      import_id: uploadResult.value?.import_id,
      articleMapping,
      customerDefaults,
      customerOverrides,
      // Pass processed invoices for Vercel stateless environment
      processed_invoices: processResp.data.processed_invoices,
      // Pass import data as fallback for Vercel stateless environment (only if available)
      ...(uploadResult.value?._vercel_import_data && { import_data: uploadResult.value._vercel_import_data }),
      // Pass any cached pdf content map from the last chunk upload (best-effort)
      ...(localStorage.getItem('pdfContentMap') ? { pdf_content_map: (() => { try { return JSON.parse(localStorage.getItem('pdfContentMap') || '{}') } catch { return {} } })() } : {})
    }
    console.log('🔍 DEBUG: Full request payload:', requestPayload)
    
    const directResp = await axios.post('/api/visma/invoices/create-direct', requestPayload)

    generationProgress.value = { current: 4, total: 4, message: 'Completed!' }
    console.log('✅ Direct invoice creation completed:', directResp.data)
    
    // If there are remaining invoices, persist processing_info for the Invoices page
    const remaining = directResp.data?.summary?.remaining || 0
    if (remaining > 0 && directResp.data?.processing_info) {
      try { localStorage.setItem('processingInfo', JSON.stringify(directResp.data.processing_info)) } catch {}
    }
    
    // Show success message only when all are completed; avoid blocking alert mid-run
    if (remaining === 0) {
      alert(`✅ Success! Created ${directResp.data.summary.successful} invoice drafts directly with PDF attachments. ${directResp.data.summary.failed} failed.`)
    } else {
      console.info(`✅ Created ${directResp.data.summary.successful}. ${directResp.data.summary.failed} failed. ${remaining} remaining… auto-continuing on Invoices page.`)
    }
    
    // Clear the upload result state in memory; keep persisted data until completion
    uploadResult.value = null
    if (remaining === 0) {
      localStorage.removeItem('lastUploadResult')
    }
    
    // If remaining, navigate user to invoices list to continue
    if (remaining > 0) {
      try { (window as any).location.href = '/invoices' } catch {}
    }
    
    // Refresh recent imports to show updated status
    await loadRecentImports()
  } catch (err: any) {
    console.error('❌ Direct invoice generation failed:', err)
    const errorMsg = extractErrorMessage(err) || 'Direct invoice generation failed'
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
      import_id: importId,
      // Pass import data for Vercel stateless environment
      import_data: uploadResult.value?._vercel_import_data
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
      customerOverrides,
      // Pass processed invoices for Vercel stateless environment
      processed_invoices: processResp.data.processed_invoices,
      // Note: processSpecificImport doesn't have access to uploadResult, so we can't pass import_data
      // This will work with the backend fallback logic
    })

    alert(`✅ Success! Created ${directResp.data.summary.successful} invoice drafts directly with PDF attachments. ${directResp.data.summary.failed} failed.`)
    
    // Clear any persisted upload result since processing is complete
    uploadResult.value = null
    localStorage.removeItem('lastUploadResult')
    
    await loadRecentImports()
  } catch (err: any) {
    console.error('Processing failed:', err)
    error.value = extractErrorMessage(err) || 'Processing failed'
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

const getTotalSize = () => {
  const excelSize = selectedFiles.value.excel?.size || 0
  const pdfSize = selectedFiles.value.pdfs.reduce((sum, pdf) => sum + pdf.size, 0)
  return excelSize + pdfSize
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

.size-warning {
  margin-top: 0.5rem;
  padding: 0.5rem;
  background-color: #f8f9fa;
  border-radius: 4px;
  font-size: 0.875rem;
}

.size-warning.size-exceeded {
  background-color: #fff3cd;
  border: 1px solid #ffeaa7;
  color: #856404;
}

.text-danger {
  color: #dc3545;
  font-weight: bold;
}
</style>



