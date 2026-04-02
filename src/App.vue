<script setup>
import { computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import Header from '@/components/Header.vue'
import TranslationOptions from '@/components/TranslationOptions.vue'
import ApplicationSettings from '@/components/ApplicationSettings.vue'
import BatchProgressCard from '@/components/BatchProgressCard.vue'
import api from '@/services/api'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Loader2, Download, RefreshCw, AlertCircle, CheckCircle2, Settings2, FileText, Server } from 'lucide-vue-next'

const VuePdfEmbed = defineAsyncComponent(() => import('vue-pdf-embed'))
const { locale, t } = useI18n()

const STORAGE_KEYS = {
  locale: 'pdf-babel.locale',
  preferences: 'pdf-babel.preferences',
  recentTranslations: 'pdf-babel.recentTranslations',
}

const PREFERENCE_KEYS = [
  'lang_in',
  'lang_out',
  'service',
  'no_dual',
  'no_mono',
  'pages',
  'qps',
  'pool_max_workers',
  'term_pool_max_workers',
  'watermark_output_mode',
  'max_pages_per_part',
  'ignore_cache',
  'custom_system_prompt',
  'skip_scanned_detection',
  'ocr_workaround',
  'auto_enable_ocr_workaround',
  'split_short_lines',
  'short_line_split_factor',
  'auto_extract_glossary',
  'save_auto_extracted_glossary',
  'only_include_translated_page',
  'skip_clean',
  'enhance_compatibility',
  'disable_rich_text_translate',
  'primary_font_family',
  'accent_color',
]

const DEFAULT_PREFERENCES = {
  lang_in: 'en',
  lang_out: 'zh',
  service: '',
  service_credentials: {},
  no_dual: false,
  no_mono: false,
  pages: '',
  qps: undefined,
  pool_max_workers: undefined,
  term_pool_max_workers: undefined,
  watermark_output_mode: 'no_watermark',
  max_pages_per_part: undefined,
  ignore_cache: false,
  custom_system_prompt: '',
  skip_scanned_detection: false,
  ocr_workaround: false,
  auto_enable_ocr_workaround: false,
  split_short_lines: false,
  short_line_split_factor: 0.8,
  auto_extract_glossary: true,
  save_auto_extracted_glossary: true,
  only_include_translated_page: false,
  skip_clean: false,
  enhance_compatibility: false,
  disable_rich_text_translate: false,
  primary_font_family: undefined,
  accent_color: 'black',
}

const config = ref(null)
const versionInfo = ref(null)
const showSettings = ref(false)
const pendingFiles = ref([])
const selectedFile = ref(null)
const selectedFilePreviewUrl = ref(null)
const isTranslating = ref(false)
const taskId = ref(null)
const taskStatus = ref(null)
const overallProgress = ref(null)
const currentStage = ref(null)
const stages = ref([])
const monoPdfUrl = ref(null)
const dualPdfUrl = ref(null)
const errorMessage = ref('')
const recentFiles = ref([])
const serviceStatus = ref('ready')
const healthInfo = ref({
  active_jobs: 0,
  queued_jobs: 0,
  total_jobs: 0,
})
const healthPollInterval = ref(null)

const batchQueue = ref([])
const currentBatchIndex = ref(-1)

const loadPreferences = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.preferences)
    return stored ? JSON.parse(stored) : {}
  } catch (error) {
    console.error('Failed to parse saved preferences:', error)
    return {}
  }
}

const savePreferences = (preferences) => {
  const sanitized = {}
  for (const key of PREFERENCE_KEYS) {
    const value = preferences[key]
    if (value !== undefined && value !== null && value !== '') {
      sanitized[key] = value
    }
    if (typeof value === 'boolean') {
      sanitized[key] = value
    }
  }
  localStorage.setItem(STORAGE_KEYS.preferences, JSON.stringify(sanitized))
}

const loadRecentFiles = () => {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.recentTranslations)
    return stored ? JSON.parse(stored) : []
  } catch (error) {
    console.error('Failed to parse recent files:', error)
    return []
  }
}

const saveRecentFiles = () => {
  localStorage.setItem(STORAGE_KEYS.recentTranslations, JSON.stringify(recentFiles.value.slice(0, 10)))
}

const translationParams = reactive({
  ...DEFAULT_PREFERENCES,
  ...loadPreferences(),
  service_credentials: {},
})

const isBatchMode = computed(() => batchQueue.value.length > 0)
const completedBatchCount = computed(() => batchQueue.value.filter(task => ['completed', 'failed', 'cancelled'].includes(task.status)).length)
const isBatchComplete = computed(() => isBatchMode.value && batchQueue.value.length > 0 && batchQueue.value.every(task => ['completed', 'failed', 'cancelled'].includes(task.status)))
const isTranslationComplete = computed(() => taskStatus.value === 'completed')
const hasTerminalError = computed(() => ['failed', 'cancelled'].includes(taskStatus.value))
const canStartTranslation = computed(() => {
  return pendingFiles.value.length > 0 && !isTranslating.value && !!translationParams.service
})

watch(
  () => translationParams.accent_color,
  (color) => {
    if (color) {
      document.documentElement.setAttribute('data-accent', color)
    }
  },
  { immediate: true }
)

watch(
  translationParams,
  (value) => {
    savePreferences(value)
  },
  { deep: true }
)

watch(selectedFile, (file) => {
  if (selectedFilePreviewUrl.value) {
    URL.revokeObjectURL(selectedFilePreviewUrl.value)
    selectedFilePreviewUrl.value = null
  }
  if (file instanceof File) {
    selectedFilePreviewUrl.value = URL.createObjectURL(file)
  }
})

const resetTranslation = () => {
  isTranslating.value = false
  taskId.value = null
  taskStatus.value = null
  overallProgress.value = null
  currentStage.value = null
  stages.value = []
  monoPdfUrl.value = null
  dualPdfUrl.value = null
  errorMessage.value = ''
  batchQueue.value = []
  currentBatchIndex.value = -1
  serviceStatus.value = 'ready'
}

const clearPendingFiles = () => {
  pendingFiles.value = []
  selectedFile.value = null
}

const clearRecentFiles = () => {
  recentFiles.value = []
  saveRecentFiles()
}

const changeLanguage = (langCode) => {
  locale.value = langCode
  localStorage.setItem(STORAGE_KEYS.locale, langCode)
}

const applyConfigDefaults = () => {
  const defaults = config.value?.defaults || {}
  const services = config.value?.services || []
  if (!translationParams.service) {
    translationParams.service = defaults.service || services[0]?.value || ''
  }
  if (!translationParams.lang_in) {
    translationParams.lang_in = defaults.lang_in || 'en'
  }
  if (!translationParams.lang_out) {
    translationParams.lang_out = defaults.lang_out || 'zh'
  }

  const validServices = new Set(services.map(item => item.value))
  if (translationParams.service && !validServices.has(translationParams.service)) {
    translationParams.service = defaults.service || services[0]?.value || ''
    translationParams.service_credentials = {}
  }
}

const fetchConfig = async () => {
  const [configResponse, versionResponse] = await Promise.all([
    api.getConfig(),
    api.getVersion().catch(() => ({ data: {} })),
  ])
  config.value = configResponse.data
  versionInfo.value = versionResponse.data
  applyConfigDefaults()
}

const fetchHealthInfo = async () => {
  try {
    const response = await api.getHealth()
    healthInfo.value = response.data
    if (!isTranslating.value) {
      serviceStatus.value = 'ready'
    }
  } catch (error) {
    console.error('Failed to fetch health info:', error)
    healthInfo.value = {
      active_jobs: 0,
      queued_jobs: 0,
      total_jobs: 0,
    }
    if (!isTranslating.value) {
      serviceStatus.value = 'error'
    }
  }
}

const getSelectedService = () => {
  const service = config.value?.services?.find(item => item.value === translationParams.service)
  if (!service) {
    throw new Error(t('errors.serviceRequired'))
  }
  return service
}

const buildSourcePayload = () => {
  const service = getSelectedService()
  const source = {
    mode: service.source_mode,
    channel_id: service.channel_id,
  }

  if (service.source_mode === 'custom') {
    const credentials = {}
    for (const field of service.fields || []) {
      const value = translationParams.service_credentials?.[field.name]
      if (field.required && !value) {
        throw new Error(t('errors.missingServiceField', { field: field.label }))
      }
      if (value) {
        credentials[field.name] = value
      }
    }
    source.credentials = credentials
  }

  return source
}

const buildOptionsPayload = () => {
  const options = {
    lang_in: translationParams.lang_in,
    lang_out: translationParams.lang_out,
    no_dual: translationParams.no_dual,
    no_mono: translationParams.no_mono,
    pages: translationParams.pages || undefined,
    qps: translationParams.qps,
    pool_max_workers: translationParams.pool_max_workers,
    term_pool_max_workers: translationParams.term_pool_max_workers,
    watermark_output_mode: translationParams.watermark_output_mode || undefined,
    max_pages_per_part: translationParams.max_pages_per_part,
    ignore_cache: translationParams.ignore_cache,
    custom_system_prompt: translationParams.custom_system_prompt || undefined,
    skip_scanned_detection: translationParams.skip_scanned_detection,
    ocr_workaround: translationParams.ocr_workaround,
    auto_enable_ocr_workaround: translationParams.auto_enable_ocr_workaround,
    split_short_lines: translationParams.split_short_lines,
    short_line_split_factor: translationParams.split_short_lines ? translationParams.short_line_split_factor : undefined,
    auto_extract_glossary: translationParams.auto_extract_glossary,
    save_auto_extracted_glossary: translationParams.save_auto_extracted_glossary,
    only_include_translated_page: translationParams.only_include_translated_page,
    skip_clean: translationParams.skip_clean,
    enhance_compatibility: translationParams.enhance_compatibility,
    disable_rich_text_translate: translationParams.disable_rich_text_translate,
    primary_font_family: translationParams.primary_font_family || undefined,
  }

  return Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined && value !== '')
  )
}

const setResultUrls = (jobId, files) => {
  const fileTypes = new Set((files || []).map(item => item.type))
  monoPdfUrl.value = fileTypes.has('mono') ? `/v1/translate/${jobId}/download/mono` : null
  dualPdfUrl.value = fileTypes.has('dual') ? `/v1/translate/${jobId}/download/dual` : null
}

const pushRecentFile = (jobId, fileName, files) => {
  const entry = {
    taskId: jobId,
    filename: fileName,
    langIn: translationParams.lang_in,
    langOut: translationParams.lang_out,
    hasMonoPdf: files.some(item => item.type === 'mono'),
    hasDualPdf: files.some(item => item.type === 'dual'),
    updatedAt: new Date().toISOString(),
  }

  recentFiles.value = [
    entry,
    ...recentFiles.value.filter(item => item.taskId !== jobId),
  ].slice(0, 10)
  saveRecentFiles()
}

const triggerDownload = (blob, fileName) => {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.URL.revokeObjectURL(url)
}

const downloadMono = async () => {
  if (!taskId.value || !monoPdfUrl.value) {
    return
  }
  const response = await api.downloadTaskMono(taskId.value)
  triggerDownload(response.data, `${(selectedFile.value?.name || 'translated').replace(/\.pdf$/i, '')}.mono.pdf`)
}

const downloadDual = async () => {
  if (!taskId.value || !dualPdfUrl.value) {
    return
  }
  const response = await api.downloadTaskDual(taskId.value)
  triggerDownload(response.data, `${(selectedFile.value?.name || 'translated').replace(/\.pdf$/i, '')}.dual.pdf`)
}

const downloadRecentMono = async (recentTaskId, filename) => {
  const response = await api.downloadTaskMono(recentTaskId)
  triggerDownload(response.data, `${filename.replace(/\.pdf$/i, '')}.mono.pdf`)
}

const downloadRecentDual = async (recentTaskId, filename) => {
  const response = await api.downloadTaskDual(recentTaskId)
  triggerDownload(response.data, `${filename.replace(/\.pdf$/i, '')}.dual.pdf`)
}

const updateStatusState = (data, task = null) => {
  const percent = data.progress?.total
    ? Math.round((data.progress.current / data.progress.total) * 100)
    : data.progress?.percent ?? 0
  const status = data.status

  if (task) {
    task.status = status
    task.progress = percent
    task.error = data.error || ''
    overallProgress.value = percent
    currentStage.value = data.current_stage || null
    stages.value = data.stages || []
  } else {
    taskStatus.value = status
    overallProgress.value = percent
    currentStage.value = data.current_stage || null
    stages.value = data.stages || []
    errorMessage.value = data.error || ''
  }

  return { percent, status }
}

const finalizeSingleTask = (data) => {
  isTranslating.value = false
  serviceStatus.value = 'ready'
  taskStatus.value = data.status
  overallProgress.value = data.status === 'completed' ? 100 : overallProgress.value
  setResultUrls(taskId.value, data.files || [])
  if (data.status === 'completed') {
    pushRecentFile(taskId.value, selectedFile.value?.name || 'translated.pdf', data.files || [])
  }
}

const processNextTask = async () => {
  if (currentBatchIndex.value >= batchQueue.value.length) {
    isTranslating.value = false
    serviceStatus.value = 'ready'
    overallProgress.value = null
    currentStage.value = null
    stages.value = []
    return
  }

  const task = batchQueue.value[currentBatchIndex.value]
  task.status = 'running'
  selectedFile.value = task.file
  overallProgress.value = 0
  stages.value = []
  currentStage.value = null
  await startTranslation(task)
}

const pollStatus = async (task = null) => {
  const currentTaskId = task ? task.taskId : taskId.value
  if (!currentTaskId) {
    return
  }

  try {
    const response = await api.getStatus(currentTaskId)
    const { status } = updateStatusState(response.data, task)

    if (task) {
      if (status === 'completed') {
        task.monoPdfUrl = response.data.files.some(item => item.type === 'mono') ? `/v1/translate/${currentTaskId}/download/mono` : null
        task.dualPdfUrl = response.data.files.some(item => item.type === 'dual') ? `/v1/translate/${currentTaskId}/download/dual` : null
        pushRecentFile(currentTaskId, task.file.name, response.data.files || [])
        currentBatchIndex.value += 1
        setTimeout(processNextTask, 300)
        return
      }

      if (status === 'failed' || status === 'cancelled') {
        currentBatchIndex.value += 1
        setTimeout(processNextTask, 300)
        return
      }
    } else {
      overallProgress.value = response.data.progress?.percent ?? response.data.progress?.current ?? overallProgress.value
      currentStage.value = response.data.current_stage || null
      stages.value = response.data.stages || []
      taskStatus.value = status

      if (status === 'completed' || status === 'failed' || status === 'cancelled') {
        finalizeSingleTask(response.data)
        return
      }
    }

    setTimeout(() => pollStatus(task), 1000)
  } catch (error) {
    console.error('Status poll failed:', error)
    if (task) {
      task.status = 'failed'
      task.error = error.message
      currentBatchIndex.value += 1
      setTimeout(processNextTask, 300)
      return
    }

    isTranslating.value = false
    serviceStatus.value = 'error'
    taskStatus.value = 'failed'
    errorMessage.value = error.message
  }
}

const startTranslation = async (task = null) => {
  try {
    const fileToUpload = task ? task.file : selectedFile.value
    if (!fileToUpload) {
      throw new Error(t('errors.fileRequired'))
    }

    const response = await api.translate({
      file: fileToUpload,
      options: JSON.stringify(buildOptionsPayload()),
      source: JSON.stringify(buildSourcePayload()),
    })

    if (task) {
      task.taskId = response.data.id
      task.status = response.data.status
      pollStatus(task)
      return
    }

    taskId.value = response.data.id
    taskStatus.value = response.data.status
    pollStatus()
  } catch (error) {
    console.error('Translation failed:', error)
    if (task) {
      task.status = 'failed'
      task.error = error.message
      currentBatchIndex.value += 1
      setTimeout(processNextTask, 300)
      return
    }

    isTranslating.value = false
    taskStatus.value = 'failed'
    serviceStatus.value = 'error'
    errorMessage.value = error.message
  }
}

const startPendingTranslations = async () => {
  if (!canStartTranslation.value) {
    return
  }

  resetTranslation()
  await nextTick()

  if (pendingFiles.value.length > 1) {
    batchQueue.value = pendingFiles.value.map((file, index) => ({
      id: `${Date.now()}-${index}`,
      file,
      taskId: null,
      status: 'pending',
      progress: 0,
      error: '',
      monoPdfUrl: null,
      dualPdfUrl: null,
    }))
    isTranslating.value = true
    serviceStatus.value = 'busy'
    currentBatchIndex.value = 0
    await processNextTask()
    return
  }

  selectedFile.value = pendingFiles.value[0]
  isTranslating.value = true
  serviceStatus.value = 'busy'
  await startTranslation()
}

const stopTranslation = async () => {
  if (!taskId.value) {
    return
  }
  await api.cancelTranslation(taskId.value)
  taskStatus.value = 'cancelling'
}

const retryBatch = async () => {
  const retryTargets = batchQueue.value.filter(task => ['failed', 'cancelled'].includes(task.status))
  if (!retryTargets.length) {
    return
  }
  for (const task of retryTargets) {
    task.status = 'pending'
    task.progress = 0
    task.error = ''
    task.taskId = null
  }
  isTranslating.value = true
  serviceStatus.value = 'busy'
  currentBatchIndex.value = batchQueue.value.findIndex(task => task.status === 'pending')
  await processNextTask()
}

const handleFilesSelected = (files) => {
  pendingFiles.value = Array.isArray(files) ? files : [files]
  selectedFile.value = pendingFiles.value[0] || null
}

const statusTone = computed(() => {
  if (serviceStatus.value === 'error') return 'destructive'
  if (serviceStatus.value === 'busy') return 'secondary'
  return 'outline'
})

onMounted(async () => {
  const savedLocale = localStorage.getItem(STORAGE_KEYS.locale)
  if (savedLocale) {
    locale.value = savedLocale
  }

  recentFiles.value = loadRecentFiles()

  try {
    await fetchConfig()
    serviceStatus.value = 'ready'
  } catch (error) {
    console.error('Failed to load config:', error)
    serviceStatus.value = 'error'
    errorMessage.value = error.message
  }

  await fetchHealthInfo()
  healthPollInterval.value = setInterval(fetchHealthInfo, 10000)
})

onUnmounted(() => {
  if (healthPollInterval.value) {
    clearInterval(healthPollInterval.value)
  }
  if (selectedFilePreviewUrl.value) {
    URL.revokeObjectURL(selectedFilePreviewUrl.value)
  }
})
</script>

<template>
  <div class="min-h-screen bg-background text-foreground">
    <Header
      :show-settings="showSettings"
      :is-translating="isTranslating"
      @toggle-settings="showSettings = !showSettings"
      @change-language="changeLanguage"
      @go-home="showSettings = false"
    />

    <main class="px-6 py-8">
      <Transition name="fade" mode="out-in">
        <div v-if="!showSettings" key="home" class="mx-auto max-w-5xl space-y-8">
          <Card class="border-dashed">
            <CardHeader class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div class="space-y-2">
                <CardTitle class="text-2xl">{{ t('translation.options') }}</CardTitle>
                <CardDescription>{{ t('translation.optionsDescription') }}</CardDescription>
              </div>
              <div class="flex items-center gap-3">
                <Badge :variant="statusTone" class="gap-2 px-3 py-1">
                  <Server class="h-3.5 w-3.5" />
                  {{ t(`service.status.${serviceStatus}`) }}
                </Badge>
                <Button variant="outline" size="sm" class="gap-2" @click="showSettings = true">
                  <Settings2 class="h-4 w-4" />
                  {{ t('settings.title') }}
                </Button>
              </div>
            </CardHeader>
            <CardContent class="space-y-6">
              <TranslationOptions
                :model-value="translationParams"
                :config="config"
                @update:model-value="(value) => Object.assign(translationParams, value)"
                @file-selected="handleFilesSelected"
                @files-selected="handleFilesSelected"
              />

              <div class="flex flex-col gap-3 border-t pt-6 md:flex-row md:items-center md:justify-between">
                <div class="text-sm text-muted-foreground">
                  <span v-if="pendingFiles.length === 0">{{ t('translation.readyHint') }}</span>
                  <span v-else>{{ t('translation.filesReady', { count: pendingFiles.length }) }}</span>
                </div>
                <div class="flex gap-3">
                  <Button variant="outline" @click="clearPendingFiles">
                    {{ t('translation.clearSelection') }}
                  </Button>
                  <Button :disabled="!canStartTranslation" class="gap-2" @click="startPendingTranslations">
                    <FileText class="h-4 w-4" />
                    {{ t('translation.startTranslation') }}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <BatchProgressCard
            v-if="isBatchMode"
            :tasks="batchQueue"
            :current-index="currentBatchIndex"
            :completed-count="completedBatchCount"
            :total-count="batchQueue.length"
            :is-batch-complete="isBatchComplete"
            @reset="resetTranslation"
            @retry="retryBatch"
          />

          <Card v-if="isTranslating || hasTerminalError" class="overflow-hidden">
            <CardHeader class="space-y-3">
              <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                  <Loader2 v-if="isTranslating" class="h-5 w-5 animate-spin" />
                  <AlertCircle v-else-if="taskStatus === 'failed'" class="h-5 w-5 text-destructive" />
                  <AlertCircle v-else class="h-5 w-5 text-amber-500" />
                  <CardTitle>
                    <span v-if="isTranslating">{{ t('translation.processing') }}</span>
                    <span v-else-if="taskStatus === 'failed'">{{ t('translation.failed') }}</span>
                    <span v-else>{{ t('translation.cancelled') }}</span>
                  </CardTitle>
                </div>
                <Button v-if="isTranslating && !isBatchMode" variant="destructive" size="sm" @click="stopTranslation">
                  {{ t('translation.cancel') }}
                </Button>
              </div>
              <CardDescription>
                {{ t('translation.progressSummary', { percent: overallProgress ?? 0, stage: currentStage || t('translation.preparing') }) }}
              </CardDescription>
            </CardHeader>
            <CardContent class="space-y-5">
              <div class="h-3 overflow-hidden rounded-full bg-muted">
                <div class="h-full rounded-full bg-primary transition-all duration-300" :style="{ width: `${overallProgress ?? 0}%` }" />
              </div>

              <div v-if="stages.length" class="flex flex-wrap gap-2">
                <div
                  v-for="stage in stages"
                  :key="stage.name"
                  class="rounded-full border px-3 py-1 text-sm"
                  :class="{
                    'border-primary bg-primary/10 text-primary': stage.status === 'running',
                    'border-emerald-500 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400': stage.status === 'completed',
                    'border-border text-muted-foreground': stage.status === 'pending'
                  }"
                >
                  {{ stage.name }}
                </div>
              </div>

              <div v-if="selectedFilePreviewUrl && !isBatchMode" class="rounded-lg border p-4">
                <VuePdfEmbed :source="selectedFilePreviewUrl" class="w-full" />
              </div>

              <div v-if="errorMessage" class="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
                {{ errorMessage }}
              </div>

              <div v-if="hasTerminalError" class="flex justify-end">
                <Button variant="outline" class="gap-2" @click="resetTranslation">
                  <RefreshCw class="h-4 w-4" />
                  {{ t('translation.startNew') }}
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card v-if="isTranslationComplete && !isBatchMode">
            <CardHeader>
              <div class="flex items-center gap-3">
                <CheckCircle2 class="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <CardTitle>{{ t('translation.result') }}</CardTitle>
              </div>
              <CardDescription>{{ t('translation.resultDescription') }}</CardDescription>
            </CardHeader>
            <CardContent class="space-y-6">
              <div class="flex flex-wrap gap-3">
                <Button v-if="monoPdfUrl" class="gap-2" @click="downloadMono">
                  <Download class="h-4 w-4" />
                  {{ t('translation.downloadMono') }}
                </Button>
                <Button v-if="dualPdfUrl" variant="outline" class="gap-2" @click="downloadDual">
                  <Download class="h-4 w-4" />
                  {{ t('translation.downloadDual') }}
                </Button>
                <Button variant="secondary" class="gap-2" @click="resetTranslation">
                  <RefreshCw class="h-4 w-4" />
                  {{ t('translation.restart') }}
                </Button>
              </div>

              <div v-if="monoPdfUrl" class="rounded-lg border p-4">
                <VuePdfEmbed :source="monoPdfUrl" class="w-full" />
              </div>
            </CardContent>
          </Card>

          <Card v-if="recentFiles.length > 0">
            <CardHeader class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div class="space-y-1">
                <CardTitle>{{ t('recentFiles.title') }}</CardTitle>
                <CardDescription>{{ t('recentFiles.description') }}</CardDescription>
              </div>
              <Button variant="ghost" size="sm" @click="clearRecentFiles">
                {{ t('recentFiles.clear') }}
              </Button>
            </CardHeader>
            <CardContent>
              <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                <div v-for="file in recentFiles" :key="file.taskId" class="rounded-xl border p-4">
                  <div class="space-y-1">
                    <p class="truncate font-medium" :title="file.filename">{{ file.filename }}</p>
                    <p class="text-sm text-muted-foreground">{{ file.langIn }} → {{ file.langOut }}</p>
                  </div>
                  <div class="mt-4 flex gap-2">
                    <Button v-if="file.hasMonoPdf" size="sm" class="gap-2" @click="downloadRecentMono(file.taskId, file.filename)">
                      <Download class="h-3.5 w-3.5" />
                      {{ t('recentFiles.mono') }}
                    </Button>
                    <Button v-if="file.hasDualPdf" size="sm" variant="outline" class="gap-2" @click="downloadRecentDual(file.taskId, file.filename)">
                      <Download class="h-3.5 w-3.5" />
                      {{ t('recentFiles.dual') }}
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>{{ t('service.summaryTitle') }}</CardTitle>
              <CardDescription>{{ t('service.summaryDescription') }}</CardDescription>
            </CardHeader>
            <CardContent class="grid gap-4 md:grid-cols-3">
              <div class="rounded-xl border p-4">
                <p class="text-sm text-muted-foreground">{{ t('service.activeTasks') }}</p>
                <p class="mt-2 text-2xl font-semibold">{{ healthInfo.active_jobs || 0 }}</p>
              </div>
              <div class="rounded-xl border p-4">
                <p class="text-sm text-muted-foreground">{{ t('service.pendingTasks') }}</p>
                <p class="mt-2 text-2xl font-semibold">{{ healthInfo.queued_jobs || 0 }}</p>
              </div>
              <div class="rounded-xl border p-4">
                <p class="text-sm text-muted-foreground">{{ t('service.totalTasks') }}</p>
                <p class="mt-2 text-2xl font-semibold">{{ healthInfo.total_jobs || 0 }}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div v-else key="settings" class="mx-auto max-w-3xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>{{ t('settings.title') }}</CardTitle>
              <CardDescription>{{ t('settings.description') }}</CardDescription>
            </CardHeader>
            <CardContent>
              <ApplicationSettings :model-value="translationParams" @update:model-value="(value) => Object.assign(translationParams, value)" />
            </CardContent>
          </Card>

          <Card v-if="versionInfo">
            <CardHeader>
              <CardTitle>{{ t('settings.runtimeInfo') }}</CardTitle>
            </CardHeader>
            <CardContent class="grid gap-3 text-sm md:grid-cols-2">
              <div class="rounded-lg border p-3">
                <p class="text-muted-foreground">{{ t('settings.backendRuntime') }}</p>
                <p class="mt-1 font-medium">{{ versionInfo.backend || 'BabelDOC' }}</p>
              </div>
              <div class="rounded-lg border p-3">
                <p class="text-muted-foreground">{{ t('settings.babeldocVersion') }}</p>
                <p class="mt-1 font-medium">{{ versionInfo.babeldoc_version || 'unknown' }}</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </Transition>
    </main>
  </div>
</template>

<style scoped>
:global(.dark) :deep(.vue-pdf-embed) {
  filter: brightness(0.78);
}

:deep(.vue-pdf-embed > div:not(:first-child)),
:deep(.vue-pdf-embed canvas:not(:first-of-type)) {
  display: none;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
