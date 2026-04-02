<script setup>
import { computed, onUnmounted, reactive, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '@/services/api'
import HistoryPreviewDialog from '@/components/HistoryPreviewDialog.vue'
import { cn } from '@/lib/utils'
import { buttonVariants, Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  BookOpen,
  Clock3,
  Download,
  Eye,
  FileText,
  FolderOpen,
  History,
  Loader2,
  Pencil,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-vue-next'

const props = defineProps({
  active: {
    type: Boolean,
    default: false,
  },
})

const { t, locale } = useI18n()

const jobs = ref([])
const jobsLoading = ref(false)
const refreshing = ref(false)
const jobsError = ref('')
const searchQuery = ref('')
const selectedJobId = ref('')
const selectedJob = ref(null)
const selectedJobFiles = ref([])
const detailLoading = ref(false)
const detailError = ref('')
const selectedJobIds = ref([])
const previewFile = ref(null)
const renameDialogOpen = ref(false)
const renameSubmitting = ref(false)
const renameError = ref('')
const renameSuggestions = ref(null)
const renameUsingSuggestions = ref(false)
const deleteDialogOpen = ref(false)
const deleteSubmitting = ref(false)
const deleteError = ref('')
const deleteMode = ref('single')
const deleteTargetIds = ref([])
const notice = ref({
  tone: 'default',
  message: '',
})

const renameForm = reactive({
  displayName: '',
  folderName: '',
  originalFilename: '',
})

let detailRequestId = 0
let pollTimer = null

const selectedJobSummary = computed(() => {
  if (selectedJob.value?.job_id === selectedJobId.value) {
    return selectedJob.value
  }
  return jobs.value.find((job) => job.job_id === selectedJobId.value) || null
})

const hasLoadedSelectedJob = computed(() => selectedJob.value?.job_id === selectedJobId.value)
const canRenameSelected = computed(() => (
  ['finished', 'failed', 'canceled'].includes(selectedJobSummary.value?.status)
))

const filteredJobs = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()

  if (!query) {
    return jobs.value
  }

  return jobs.value.filter((job) => {
    const haystack = [
      job.display_name,
      job.folder_name,
      job.job_id,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    return haystack.includes(query)
  })
})

const allVisibleSelected = computed(() => (
  filteredJobs.value.length > 0
  && filteredJobs.value.every((job) => selectedJobIds.value.includes(job.job_id))
))

const originalFiles = computed(() => (
  selectedJobFiles.value.filter((file) => file.type === 'original')
))

const resultFiles = computed(() => (
  selectedJobFiles.value.filter((file) => file.type !== 'original')
))

const formatter = computed(() => new Intl.DateTimeFormat(
  locale.value === 'zh' ? 'zh-CN' : 'en-US',
  {
    dateStyle: 'medium',
    timeStyle: 'short',
  }
))

const jobTitle = (job) => (
  job?.display_name || job?.original_filename || job?.folder_name || job?.job_id || 'Untitled'
)

const formatDate = (value) => {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return formatter.value.format(date)
}

const formatSize = (bytes) => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`
}

const statusLabel = (status) => {
  const key = `history.status.${status}`
  const translated = t(key)
  return translated === key ? status : translated
}

const statusBadgeClass = (status) => ({
  queued: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
  running: 'border-primary/30 bg-primary/10 text-primary',
  finished: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  failed: 'border-destructive/30 bg-destructive/10 text-destructive',
  canceled: 'border-border bg-muted text-muted-foreground',
}[status] || 'border-border bg-muted text-muted-foreground')

const fileTypeLabel = (type) => {
  const key = `history.fileTypes.${type}`
  const translated = t(key)
  return translated === key ? type : translated
}

const noticeClass = computed(() => {
  if (notice.value.tone === 'destructive') {
    return 'border-destructive/30 bg-destructive/10 text-destructive'
  }
  return 'border-primary/20 bg-primary/5 text-foreground'
})

const isSelected = (jobId) => selectedJobIds.value.includes(jobId)

const normalizeError = (error) => {
  const detail = error?.response?.data?.detail

  if (typeof detail === 'string' && detail.trim()) {
    if (detail === 'rename_not_allowed') {
      return t('history.rename.renameNotAllowed')
    }
    return detail
  }

  if (typeof detail === 'object' && detail?.error === 'name_conflict') {
    return t('history.rename.conflict')
  }

  return error?.message || t('common.requestFailed')
}

const setNotice = (message, tone = 'default') => {
  notice.value = {
    message,
    tone,
  }
}

const ensureSelectedJobVisible = () => {
  if (!filteredJobs.value.length) {
    selectedJobId.value = ''
    return
  }

  const visibleIds = new Set(filteredJobs.value.map((job) => job.job_id))
  if (!selectedJobId.value || !visibleIds.has(selectedJobId.value)) {
    selectedJobId.value = filteredJobs.value[0].job_id
  }
}

const loadJobsPage = async ({ silent = false } = {}) => {
  if (!silent) {
    jobsLoading.value = true
  }

  jobsError.value = ''

  try {
    const loadedJobs = []
    let offset = 0
    let total = 0

    do {
      const response = await api.fetchJobs({
        limit: 100,
        offset,
      })
      const pageItems = response.data?.items || []
      total = response.data?.total ?? pageItems.length
      loadedJobs.push(...pageItems)

      if (!pageItems.length) {
        break
      }

      offset += pageItems.length
    } while (offset < total)

    jobs.value = loadedJobs
    const validIds = new Set(loadedJobs.map((job) => job.job_id))
    selectedJobIds.value = selectedJobIds.value.filter((jobId) => validIds.has(jobId))
    ensureSelectedJobVisible()
  } catch (error) {
    jobsError.value = normalizeError(error)
  } finally {
    jobsLoading.value = false
  }
}

const loadSelectedJob = async (jobId, { silent = false } = {}) => {
  if (!jobId) {
    selectedJob.value = null
    selectedJobFiles.value = []
    detailError.value = ''
    return
  }

  const currentRequestId = detailRequestId + 1
  detailRequestId = currentRequestId

  if (!silent) {
    detailLoading.value = true
    selectedJob.value = null
    selectedJobFiles.value = []
  }

  detailError.value = ''

  try {
    const [jobResponse, filesResponse] = await Promise.all([
      api.fetchJob(jobId),
      api.fetchJobFiles(jobId),
    ])

    if (detailRequestId !== currentRequestId) {
      return
    }

    selectedJob.value = jobResponse.data
    selectedJobFiles.value = filesResponse.data || []
  } catch (error) {
    if (detailRequestId !== currentRequestId) {
      return
    }

    detailError.value = normalizeError(error)
  } finally {
    if (detailRequestId === currentRequestId) {
      detailLoading.value = false
    }
  }
}

const refreshHistory = async ({ silent = false } = {}) => {
  if (refreshing.value) {
    return
  }

  refreshing.value = true
  const previousSelectedId = selectedJobId.value

  try {
    await loadJobsPage({ silent })

    if (selectedJobId.value && selectedJobId.value === previousSelectedId) {
      await loadSelectedJob(selectedJobId.value, { silent: true })
    }
  } finally {
    refreshing.value = false
  }
}

const toggleSelection = (jobId) => {
  if (selectedJobIds.value.includes(jobId)) {
    selectedJobIds.value = selectedJobIds.value.filter((value) => value !== jobId)
    return
  }

  selectedJobIds.value = [...selectedJobIds.value, jobId]
}

const toggleAllVisible = () => {
  const visibleIds = filteredJobs.value.map((job) => job.job_id)

  if (!visibleIds.length) {
    return
  }

  if (allVisibleSelected.value) {
    selectedJobIds.value = selectedJobIds.value.filter((jobId) => !visibleIds.includes(jobId))
    return
  }

  selectedJobIds.value = Array.from(new Set([...selectedJobIds.value, ...visibleIds]))
}

const openPreview = (file) => {
  previewFile.value = file
}

const closePreview = (open) => {
  if (!open) {
    previewFile.value = null
  }
}

const closeRenameDialog = (open = false) => {
  renameDialogOpen.value = open
  if (!open) {
    renameError.value = ''
    renameSuggestions.value = null
    renameUsingSuggestions.value = false
  }
}

const openRenameDialog = () => {
  if (!hasLoadedSelectedJob.value) {
    return
  }

  renameForm.displayName = selectedJob.value.display_name || jobTitle(selectedJob.value)
  renameForm.folderName = selectedJob.value.folder_name || ''
  renameForm.originalFilename = selectedJob.value.original_filename || ''
  renameError.value = ''
  renameSuggestions.value = null
  renameUsingSuggestions.value = false
  renameDialogOpen.value = true
}

const applyRenameSuggestions = () => {
  if (!renameSuggestions.value) {
    return
  }

  if (renameSuggestions.value.folderName) {
    renameForm.folderName = renameSuggestions.value.folderName
  }
  if (renameSuggestions.value.originalFilename) {
    renameForm.originalFilename = renameSuggestions.value.originalFilename
  }

  renameUsingSuggestions.value = true
  renameError.value = ''
}

const submitRename = async () => {
  if (!selectedJobId.value) {
    return
  }

  renameSubmitting.value = true
  renameError.value = ''

  try {
    const payload = {
      display_name: renameForm.displayName.trim() || undefined,
      folder_name: renameForm.folderName.trim() || undefined,
      original_filename: renameForm.originalFilename.trim() || undefined,
      confirm: renameUsingSuggestions.value,
    }

    await api.renameJob(selectedJobId.value, payload)
    closeRenameDialog(false)
    setNotice(t('history.rename.success'))
    await refreshHistory({ silent: true })
    await loadSelectedJob(selectedJobId.value)
  } catch (error) {
    const detail = error?.response?.data?.detail

    if (error?.response?.status === 409 && typeof detail === 'object') {
      renameSuggestions.value = {
        folderName: detail.suggested_folder_name || '',
        originalFilename: detail.suggested_original_filename || '',
      }
      renameUsingSuggestions.value = false
      renameError.value = t('history.rename.conflict')
      return
    }

    renameError.value = normalizeError(error)
  } finally {
    renameSubmitting.value = false
  }
}

const closeDeleteDialog = (open = false) => {
  deleteDialogOpen.value = open
  if (!open) {
    deleteError.value = ''
    deleteMode.value = 'single'
    deleteTargetIds.value = []
  }
}

const openDeleteDialog = (mode = 'single') => {
  deleteMode.value = mode
  deleteError.value = ''
  deleteTargetIds.value = mode === 'batch' ? [...selectedJobIds.value] : [selectedJobId.value]

  if (!deleteTargetIds.value.filter(Boolean).length) {
    return
  }

  deleteDialogOpen.value = true
}

const submitDelete = async () => {
  const jobIds = deleteTargetIds.value.filter(Boolean)
  if (!jobIds.length) {
    return
  }

  deleteSubmitting.value = true
  deleteError.value = ''

  try {
    if (deleteMode.value === 'batch') {
      const response = await api.deleteJobs({
        job_ids: jobIds,
        confirm: true,
      })
      const deletedCount = response.data?.deleted?.length || 0
      const skippedCount = response.data?.skipped?.length || 0

      if (skippedCount > 0) {
        setNotice(t('history.delete.partial', {
          deleted: deletedCount,
          skipped: skippedCount,
        }))
      } else {
        setNotice(t('history.delete.successBatch', { count: deletedCount }))
      }
    } else {
      const response = await api.deleteJob(jobIds[0], true)
      if (response.data?.status === 'canceling') {
        setNotice(t('history.delete.canceling'))
      } else {
        setNotice(t('history.delete.successSingle'))
      }
    }

    closeDeleteDialog(false)
    await refreshHistory({ silent: true })
  } catch (error) {
    deleteError.value = normalizeError(error)
  } finally {
    deleteSubmitting.value = false
  }
}

const startPolling = () => {
  if (pollTimer) {
    clearInterval(pollTimer)
  }

  if (!props.active) {
    pollTimer = null
    return
  }

  pollTimer = setInterval(() => {
    refreshHistory({ silent: true })
  }, 10000)
}

watch(
  filteredJobs,
  () => {
    ensureSelectedJobVisible()
  },
  { immediate: true }
)

watch(
  selectedJobId,
  (jobId) => {
    loadSelectedJob(jobId)
  },
  { immediate: true }
)

watch(
  () => props.active,
  async (isActive) => {
    if (isActive) {
      await refreshHistory({ silent: jobs.value.length > 0 })
    }
    startPolling()
  },
  { immediate: true }
)

onUnmounted(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
  }
})
</script>

<template>
  <div class="space-y-6">
    <Card class="border-dashed">
      <CardHeader class="gap-4">
        <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div class="space-y-2">
            <div class="flex items-center gap-3">
              <div class="rounded-full border bg-muted p-2.5">
                <History class="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle class="text-2xl">{{ t('history.title') }}</CardTitle>
                <CardDescription>{{ t('history.description') }}</CardDescription>
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              class="gap-2"
              :disabled="refreshing"
              @click="refreshHistory()"
            >
              <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': refreshing }" />
              {{ t('history.refresh') }}
            </Button>
          </div>
        </div>

        <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div class="relative w-full lg:max-w-md">
            <Search class="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              v-model="searchQuery"
              class="pl-9"
              :placeholder="t('history.searchPlaceholder')"
            />
          </div>

          <div class="flex flex-wrap items-center gap-2">
            <span v-if="selectedJobIds.length" class="text-sm text-muted-foreground">
              {{ t('history.selectedCount', { count: selectedJobIds.length }) }}
            </span>
            <Button
              variant="outline"
              size="sm"
              :disabled="!filteredJobs.length"
              @click="toggleAllVisible"
            >
              {{ allVisibleSelected ? t('history.actions.clearSelection') : t('history.actions.selectAll') }}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              :disabled="!selectedJobIds.length"
              class="gap-2"
              @click="openDeleteDialog('batch')"
            >
              <Trash2 class="h-4 w-4" />
              {{ t('history.actions.deleteSelected') }}
            </Button>
          </div>
        </div>
      </CardHeader>
    </Card>

    <div
      v-if="notice.message"
      :class="cn('rounded-xl border px-4 py-3 text-sm', noticeClass)"
    >
      {{ notice.message }}
    </div>

    <div class="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <Card class="overflow-hidden">
        <CardHeader class="border-b">
          <CardTitle>{{ t('history.listTitle') }}</CardTitle>
          <CardDescription>
            {{ jobs.length ? `${filteredJobs.length} / ${jobs.length}` : t('history.listDescription') }}
          </CardDescription>
        </CardHeader>

        <CardContent class="p-0">
          <div v-if="jobsLoading" class="flex min-h-[24rem] items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 class="h-5 w-5 animate-spin" />
            <span>{{ t('common.loading') }}</span>
          </div>

          <div
            v-else-if="jobsError"
            class="m-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          >
            {{ jobsError }}
          </div>

          <div
            v-else-if="!jobs.length"
            class="flex min-h-[24rem] items-center justify-center px-6 text-center text-sm text-muted-foreground"
          >
            {{ t('history.empty') }}
          </div>

          <div
            v-else-if="!filteredJobs.length"
            class="flex min-h-[24rem] items-center justify-center px-6 text-center text-sm text-muted-foreground"
          >
            {{ t('history.noMatches') }}
          </div>

          <ScrollArea v-else class="h-[32rem] xl:h-[44rem]">
            <div class="space-y-3 p-4">
              <article
                v-for="job in filteredJobs"
                :key="job.job_id"
                class="cursor-pointer rounded-2xl border p-4 transition-colors hover:border-primary/30 hover:bg-muted/30"
                :class="{
                  'border-primary bg-primary/5 shadow-sm': selectedJobId === job.job_id,
                }"
                @click="selectedJobId = job.job_id"
              >
                <div class="flex gap-3">
                  <div class="pt-1" @click.stop>
                    <input
                      type="checkbox"
                      class="h-4 w-4 rounded border-input text-primary focus:ring-ring"
                      :checked="isSelected(job.job_id)"
                      @change="toggleSelection(job.job_id)"
                    >
                  </div>

                  <div class="min-w-0 flex-1 space-y-3">
                    <div class="flex flex-wrap items-center gap-2">
                      <p class="truncate font-medium" :title="jobTitle(job)">
                        {{ jobTitle(job) }}
                      </p>
                      <Badge variant="outline" :class="statusBadgeClass(job.status)">
                        {{ statusLabel(job.status) }}
                      </Badge>
                    </div>

                    <div class="grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
                      <div class="flex items-center gap-2">
                        <Clock3 class="h-3.5 w-3.5" />
                        <span>{{ formatDate(job.created_at) }}</span>
                      </div>
                      <div class="font-mono text-[11px]">
                        {{ job.job_id }}
                      </div>
                    </div>

                    <div class="flex flex-wrap gap-2 text-xs">
                      <Badge v-if="job.has_mono" variant="secondary">{{ t('history.fileTypes.mono') }}</Badge>
                      <Badge v-if="job.has_dual" variant="secondary">{{ t('history.fileTypes.dual') }}</Badge>
                      <Badge v-if="job.has_glossary" variant="secondary">{{ t('history.fileTypes.glossary') }}</Badge>
                    </div>
                  </div>
                </div>
              </article>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      <Card class="overflow-hidden">
        <CardHeader class="border-b">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="space-y-2">
              <CardTitle>{{ t('history.detailTitle') }}</CardTitle>
              <CardDescription>
                <template v-if="selectedJobSummary">
                  {{ jobTitle(selectedJobSummary) }}
                </template>
                <template v-else>
                  {{ t('history.detailEmpty') }}
                </template>
              </CardDescription>
            </div>

            <div class="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                class="gap-2"
                :disabled="!selectedJobId"
                @click="selectedJobId && loadSelectedJob(selectedJobId)"
              >
                <RefreshCw class="h-4 w-4" />
                {{ t('history.refresh') }}
              </Button>
              <Button
                variant="outline"
                size="sm"
                class="gap-2"
                :disabled="!hasLoadedSelectedJob || !canRenameSelected || detailLoading"
                @click="openRenameDialog"
              >
                <Pencil class="h-4 w-4" />
                {{ t('history.actions.rename') }}
              </Button>
              <Button
                variant="destructive"
                size="sm"
                class="gap-2"
                :disabled="!selectedJobId"
                @click="openDeleteDialog('single')"
              >
                <Trash2 class="h-4 w-4" />
                {{ t('history.actions.delete') }}
              </Button>
            </div>
          </div>
        </CardHeader>

        <CardContent class="p-0">
          <div
            v-if="!selectedJobId"
            class="flex min-h-[24rem] items-center justify-center px-6 text-center text-sm text-muted-foreground"
          >
            {{ t('history.detailEmpty') }}
          </div>

          <div v-else-if="detailLoading" class="flex min-h-[24rem] items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 class="h-5 w-5 animate-spin" />
            <span>{{ t('history.detailLoading') }}</span>
          </div>

          <div
            v-else-if="detailError"
            class="m-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          >
            {{ detailError }}
          </div>

          <ScrollArea v-else class="h-[32rem] xl:h-[44rem]">
            <div class="space-y-6 p-6">
              <div class="space-y-4 rounded-2xl border bg-muted/20 p-5">
                <div class="flex flex-wrap items-start gap-3">
                  <div class="flex-1 space-y-2">
                    <div class="flex flex-wrap items-center gap-2">
                      <h3 class="text-xl font-semibold">
                        {{ jobTitle(selectedJobSummary) }}
                      </h3>
                      <Badge variant="outline" :class="statusBadgeClass(selectedJobSummary?.status)">
                        {{ statusLabel(selectedJobSummary?.status) }}
                      </Badge>
                    </div>
                    <p class="font-mono text-xs text-muted-foreground">
                      {{ selectedJobSummary?.job_id }}
                    </p>
                  </div>
                </div>

                <div class="grid gap-3 text-sm md:grid-cols-2">
                  <div class="rounded-xl border bg-background p-4">
                    <p class="text-xs uppercase tracking-wide text-muted-foreground">{{ t('history.details.createdAt') }}</p>
                    <p class="mt-2 font-medium">{{ formatDate(selectedJobSummary?.created_at) }}</p>
                  </div>
                  <div class="rounded-xl border bg-background p-4">
                    <p class="text-xs uppercase tracking-wide text-muted-foreground">{{ t('history.details.renamedAt') }}</p>
                    <p class="mt-2 font-medium">{{ formatDate(selectedJobSummary?.renamed_at) }}</p>
                  </div>
                  <div class="rounded-xl border bg-background p-4">
                    <p class="text-xs uppercase tracking-wide text-muted-foreground">{{ t('history.details.folderName') }}</p>
                    <p class="mt-2 font-medium break-all">{{ selectedJobSummary?.folder_name || '—' }}</p>
                  </div>
                  <div class="rounded-xl border bg-background p-4">
                    <p class="text-xs uppercase tracking-wide text-muted-foreground">{{ t('history.details.originalFilename') }}</p>
                    <p class="mt-2 font-medium break-all">{{ selectedJobSummary?.original_filename || '—' }}</p>
                  </div>
                </div>

                <p v-if="!canRenameSelected" class="text-sm text-muted-foreground">
                  {{ t('history.rename.renameNotAllowed') }}
                </p>
              </div>

              <section class="space-y-4">
                <div class="flex items-center gap-2">
                  <FileText class="h-4 w-4 text-primary" />
                  <h4 class="font-medium">{{ t('history.files.original') }}</h4>
                </div>

                <div v-if="originalFiles.length" class="grid gap-4">
                  <article
                    v-for="file in originalFiles"
                    :key="file.file_id"
                    class="rounded-2xl border p-4"
                  >
                    <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div class="min-w-0 space-y-2">
                        <div class="flex items-center gap-3">
                          <div class="rounded-full border bg-muted p-2">
                            <FileText class="h-4 w-4 text-primary" />
                          </div>
                          <div class="min-w-0">
                            <p class="truncate font-medium" :title="file.filename">{{ file.filename }}</p>
                            <p class="text-sm text-muted-foreground">
                              {{ fileTypeLabel(file.type) }} · {{ formatSize(file.size) }}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div class="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" class="gap-2" @click="openPreview(file)">
                          <Eye class="h-4 w-4" />
                          {{ t('history.actions.preview') }}
                        </Button>
                        <a
                          :href="file.url"
                          :download="file.filename"
                          :class="cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-2')"
                        >
                          <Download class="h-4 w-4" />
                          {{ t('history.actions.download') }}
                        </a>
                      </div>
                    </div>
                  </article>
                </div>

                <div
                  v-else
                  class="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground"
                >
                  {{ t('history.files.none') }}
                </div>
              </section>

              <section class="space-y-4">
                <div class="flex items-center gap-2">
                  <FolderOpen class="h-4 w-4 text-primary" />
                  <h4 class="font-medium">{{ t('history.files.results') }}</h4>
                </div>

                <div v-if="resultFiles.length" class="grid gap-4 md:grid-cols-2">
                  <article
                    v-for="file in resultFiles"
                    :key="file.file_id"
                    class="rounded-2xl border p-4"
                  >
                    <div class="flex flex-col gap-4">
                      <div class="flex items-start gap-3">
                        <div class="rounded-full border bg-muted p-2">
                          <BookOpen v-if="file.type === 'glossary'" class="h-4 w-4 text-amber-600" />
                          <FileText v-else class="h-4 w-4 text-primary" />
                        </div>
                        <div class="min-w-0">
                          <p class="truncate font-medium" :title="file.filename">{{ file.filename }}</p>
                          <p class="text-sm text-muted-foreground">
                            {{ fileTypeLabel(file.type) }} · {{ formatSize(file.size) }}
                          </p>
                        </div>
                      </div>

                      <div class="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" class="gap-2" @click="openPreview(file)">
                          <Eye class="h-4 w-4" />
                          {{ t('history.actions.preview') }}
                        </Button>
                        <a
                          :href="file.url"
                          :download="file.filename"
                          :class="cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-2')"
                        >
                          <Download class="h-4 w-4" />
                          {{ t('history.actions.download') }}
                        </a>
                      </div>
                    </div>
                  </article>
                </div>

                <div
                  v-else
                  class="rounded-2xl border border-dashed p-6 text-sm text-muted-foreground"
                >
                  {{
                    ['queued', 'running'].includes(selectedJobSummary?.status)
                      ? t('history.files.pending')
                      : t('history.files.none')
                  }}
                </div>
              </section>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>

    <HistoryPreviewDialog
      :open="Boolean(previewFile)"
      :file="previewFile"
      @update:open="closePreview"
    />

    <Dialog :open="renameDialogOpen" @update:open="closeRenameDialog">
      <DialogContent class="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{{ t('history.rename.title') }}</DialogTitle>
          <DialogDescription>{{ t('history.rename.description') }}</DialogDescription>
        </DialogHeader>

        <div class="space-y-4">
          <div class="space-y-2">
            <label class="text-sm font-medium" for="rename-display-name">
              {{ t('history.rename.displayName') }}
            </label>
            <Input id="rename-display-name" v-model="renameForm.displayName" />
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium" for="rename-folder-name">
              {{ t('history.rename.folderName') }}
            </label>
            <Input id="rename-folder-name" v-model="renameForm.folderName" />
          </div>

          <div class="space-y-2">
            <label class="text-sm font-medium" for="rename-original-filename">
              {{ t('history.rename.originalFilename') }}
            </label>
            <Input id="rename-original-filename" v-model="renameForm.originalFilename" />
          </div>

          <div
            v-if="renameError"
            class="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          >
            <p>{{ renameError }}</p>
            <div v-if="renameSuggestions" class="mt-3 space-y-2 text-sm">
              <p>
                <strong>{{ t('history.rename.folderName') }}:</strong>
                {{ renameSuggestions.folderName || '—' }}
              </p>
              <p>
                <strong>{{ t('history.rename.originalFilename') }}:</strong>
                {{ renameSuggestions.originalFilename || '—' }}
              </p>
              <Button variant="outline" size="sm" @click="applyRenameSuggestions">
                {{ t('history.rename.useSuggestions') }}
              </Button>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" :disabled="renameSubmitting" @click="closeRenameDialog(false)">
            {{ t('common.cancel') }}
          </Button>
          <Button :disabled="renameSubmitting" @click="submitRename">
            <Loader2 v-if="renameSubmitting" class="h-4 w-4 animate-spin" />
            {{ t('common.save') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>

    <Dialog :open="deleteDialogOpen" @update:open="closeDeleteDialog">
      <DialogContent class="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{{ t('history.delete.title') }}</DialogTitle>
          <DialogDescription>
            {{
              deleteMode === 'batch'
                ? t('history.delete.descriptionBatch', { count: deleteTargetIds.length })
                : t('history.delete.descriptionSingle', { name: jobTitle(selectedJobSummary) })
            }}
          </DialogDescription>
        </DialogHeader>

        <div
          v-if="deleteError"
          class="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
        >
          {{ deleteError }}
        </div>

        <DialogFooter>
          <Button variant="outline" :disabled="deleteSubmitting" @click="closeDeleteDialog(false)">
            {{ t('common.cancel') }}
          </Button>
          <Button variant="destructive" :disabled="deleteSubmitting" @click="submitDelete">
            <Loader2 v-if="deleteSubmitting" class="h-4 w-4 animate-spin" />
            {{ t('common.delete') }}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  </div>
</template>
