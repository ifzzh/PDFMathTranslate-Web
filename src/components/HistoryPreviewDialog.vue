<script setup>
import { computed, defineAsyncComponent, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import api from '@/services/api'
import { cn } from '@/lib/utils'
import { buttonVariants, Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  Loader2,
  Minus,
  Plus,
} from 'lucide-vue-next'

const VuePdfEmbed = defineAsyncComponent(() => import('vue-pdf-embed'))

const props = defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  file: {
    type: Object,
    default: null,
  },
})

const emit = defineEmits(['update:open'])

const { t } = useI18n()

const scale = ref(1)
const currentPage = ref(1)
const pageCount = ref(1)
const pdfError = ref('')
const glossaryLoading = ref(false)
const glossaryError = ref('')
const glossaryHeaders = ref([])
const glossaryRows = ref([])

const isGlossary = computed(() => {
  const name = props.file?.filename || ''
  return props.file?.type === 'glossary' || name.toLowerCase().endsWith('.csv')
})

const previewDescription = computed(() => (
  isGlossary.value
    ? t('history.preview.glossaryDescription')
    : t('history.preview.pdfDescription')
))

const fileTypeLabel = computed(() => {
  const type = props.file?.type || 'original'
  const key = `history.fileTypes.${type}`
  const translated = t(key)
  return translated === key ? type : translated
})

const closeDialog = (open) => {
  emit('update:open', open)
}

const resetState = () => {
  scale.value = 1
  currentPage.value = 1
  pageCount.value = 1
  pdfError.value = ''
  glossaryError.value = ''
  glossaryHeaders.value = []
  glossaryRows.value = []
}

const formatSize = (bytes) => {
  if (!bytes) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1)
  const value = bytes / 1024 ** exponent
  return `${value >= 10 || exponent === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[exponent]}`
}

const normalizeError = (error) => {
  const detail = error?.response?.data?.detail
  if (typeof detail === 'string' && detail.trim()) {
    return detail
  }
  return error?.message || t('common.requestFailed')
}

const parseCsv = (text) => {
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]

    if (inQuotes) {
      if (character === '"') {
        if (text[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += character
      }
      continue
    }

    if (character === '"') {
      inQuotes = true
      continue
    }

    if (character === ',') {
      row.push(field)
      field = ''
      continue
    }

    if (character === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      continue
    }

    if (character !== '\r') {
      field += character
    }
  }

  row.push(field)
  rows.push(row)

  if (rows.length && rows[0].length) {
    rows[0][0] = rows[0][0].replace(/^\uFEFF/, '')
  }

  return rows.filter((item) => item.some((cell) => String(cell || '').trim()))
}

const buildGlossaryTable = (text) => {
  const parsedRows = parseCsv(text)

  if (!parsedRows.length) {
    return {
      headers: [],
      rows: [],
    }
  }

  const columnCount = Math.max(...parsedRows.map((row) => row.length))
  const normalizedRows = parsedRows.map((row) => (
    Array.from({ length: columnCount }, (_, index) => row[index] ?? '')
  ))

  const headers = normalizedRows[0].map((value, index) => value || t('history.preview.columnFallback', { index: index + 1 }))
  const rows = normalizedRows.slice(1)

  return { headers, rows }
}

const loadGlossary = async () => {
  if (!props.file?.file_id) {
    return
  }

  glossaryLoading.value = true
  glossaryError.value = ''

  try {
    const response = await api.fetchFileText(props.file.file_id)
    const { headers, rows } = buildGlossaryTable(String(response.data || ''))
    glossaryHeaders.value = headers
    glossaryRows.value = rows
  } catch (error) {
    glossaryError.value = normalizeError(error)
  } finally {
    glossaryLoading.value = false
  }
}

const handlePdfLoaded = (document) => {
  pageCount.value = document?.numPages || 1
  if (currentPage.value > pageCount.value) {
    currentPage.value = pageCount.value
  }
}

const handlePdfError = (error) => {
  pdfError.value = normalizeError(error)
}

const zoomIn = () => {
  scale.value = Math.min(scale.value + 0.1, 3)
}

const zoomOut = () => {
  scale.value = Math.max(scale.value - 0.1, 0.6)
}

const previousPage = () => {
  currentPage.value = Math.max(currentPage.value - 1, 1)
}

const nextPage = () => {
  currentPage.value = Math.min(currentPage.value + 1, pageCount.value)
}

watch(
  [() => props.open, () => props.file?.file_id],
  async ([isOpen]) => {
    resetState()

    if (!isOpen || !props.file || !isGlossary.value) {
      return
    }

    await loadGlossary()
  },
  { immediate: true }
)
</script>

<template>
  <Dialog :open="open" @update:open="closeDialog">
    <DialogContent class="max-w-6xl gap-0 overflow-hidden p-0">
      <div class="border-b px-6 py-5">
        <DialogHeader class="gap-4 text-left">
          <div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div class="min-w-0 space-y-3">
              <div class="flex items-start gap-3">
                <div class="rounded-full border bg-muted p-2.5">
                  <BookOpen v-if="isGlossary" class="h-5 w-5 text-amber-600" />
                  <FileText v-else class="h-5 w-5 text-primary" />
                </div>
                <div class="min-w-0">
                  <DialogTitle class="truncate pr-8 text-xl">
                    {{ file?.filename || '—' }}
                  </DialogTitle>
                  <DialogDescription>
                    {{ previewDescription }}
                  </DialogDescription>
                </div>
              </div>

              <div class="flex flex-wrap gap-2">
                <Badge variant="outline">{{ fileTypeLabel }}</Badge>
                <Badge variant="secondary">{{ formatSize(file?.size || 0) }}</Badge>
                <Badge v-if="!isGlossary" variant="outline">
                  {{ t('history.preview.pageLabel', { current: currentPage, total: pageCount }) }}
                </Badge>
              </div>
            </div>

            <div class="flex flex-wrap items-center gap-2 pr-8">
              <template v-if="!isGlossary">
                <div class="flex items-center gap-1 rounded-md border bg-muted/40 p-1">
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    :disabled="currentPage <= 1"
                    @click="previousPage"
                  >
                    <ChevronLeft class="h-4 w-4" />
                    <span class="sr-only">{{ t('history.preview.previousPage') }}</span>
                  </Button>
                  <span class="min-w-[6.5rem] text-center text-xs font-medium text-muted-foreground">
                    {{ t('history.preview.pageLabel', { current: currentPage, total: pageCount }) }}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    :disabled="currentPage >= pageCount"
                    @click="nextPage"
                  >
                    <ChevronRight class="h-4 w-4" />
                    <span class="sr-only">{{ t('history.preview.nextPage') }}</span>
                  </Button>
                </div>

                <div class="flex items-center gap-1 rounded-md border bg-muted/40 p-1">
                  <Button variant="ghost" size="icon-sm" :disabled="scale <= 0.6" @click="zoomOut">
                    <Minus class="h-4 w-4" />
                    <span class="sr-only">{{ t('history.preview.zoomOut') }}</span>
                  </Button>
                  <span class="min-w-[4rem] text-center text-xs font-medium text-muted-foreground">
                    {{ Math.round(scale * 100) }}%
                  </span>
                  <Button variant="ghost" size="icon-sm" :disabled="scale >= 3" @click="zoomIn">
                    <Plus class="h-4 w-4" />
                    <span class="sr-only">{{ t('history.preview.zoomIn') }}</span>
                  </Button>
                </div>
              </template>

              <a
                v-if="file?.url"
                :href="file.url"
                :download="file.filename"
                :class="cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'gap-2')"
              >
                <Download class="h-4 w-4" />
                {{ t('history.actions.download') }}
              </a>
            </div>
          </div>
        </DialogHeader>
      </div>

      <div class="bg-muted/20">
        <div v-if="isGlossary" class="h-[70vh]">
          <div v-if="glossaryLoading" class="flex h-full flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <Loader2 class="h-5 w-5 animate-spin" />
            <span>{{ t('history.preview.loadingGlossary') }}</span>
          </div>

          <div
            v-else-if="glossaryError"
            class="mx-6 my-6 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          >
            {{ t('history.preview.glossaryFailed') }}: {{ glossaryError }}
          </div>

          <div
            v-else-if="!glossaryHeaders.length || !glossaryRows.length"
            class="flex h-full items-center justify-center text-sm text-muted-foreground"
          >
            {{ t('history.preview.noGlossaryData') }}
          </div>

          <ScrollArea v-else class="h-[70vh]">
            <div class="min-w-full p-6">
              <div class="overflow-hidden rounded-2xl border bg-background">
                <table class="min-w-full border-collapse text-sm">
                  <thead class="bg-muted/60">
                    <tr>
                      <th
                        v-for="(header, index) in glossaryHeaders"
                        :key="`${header}-${index}`"
                        class="border-b px-4 py-3 text-left font-medium text-foreground"
                      >
                        {{ header }}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr
                      v-for="(row, rowIndex) in glossaryRows"
                      :key="`row-${rowIndex}`"
                      class="odd:bg-background even:bg-muted/20"
                    >
                      <td
                        v-for="(cell, cellIndex) in row"
                        :key="`cell-${rowIndex}-${cellIndex}`"
                        class="border-t px-4 py-3 align-top text-muted-foreground"
                      >
                        {{ cell || '—' }}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </ScrollArea>
        </div>

        <div v-else class="h-[70vh] overflow-auto p-6">
          <div
            v-if="pdfError"
            class="mx-auto max-w-2xl rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive"
          >
            {{ pdfError }}
          </div>

          <div v-else class="mx-auto flex w-fit justify-center rounded-2xl border bg-background p-4 shadow-sm">
            <VuePdfEmbed
              v-if="file?.url"
              :page="currentPage"
              :scale="scale"
              :source="file.url"
              class="mx-auto"
              @loaded="handlePdfLoaded"
              @loading-failed="handlePdfError"
              @rendering-failed="handlePdfError"
            />
          </div>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>

<style scoped>
:global(.dark) :deep(.vue-pdf-embed) {
  filter: brightness(0.82);
}
</style>
