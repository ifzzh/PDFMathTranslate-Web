<script setup>
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const { t } = useI18n()

const props = defineProps({
  modelValue: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['update:modelValue'])

const model = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const numberField = (name) => computed({
  get: () => model.value[name] ?? '',
  set: (value) => {
    if (value === '' || value === null || value === undefined) {
      model.value[name] = undefined
      return
    }
    model.value[name] = Number(value)
  },
})

const qps = numberField('qps')
const poolMaxWorkers = numberField('pool_max_workers')
const termPoolMaxWorkers = numberField('term_pool_max_workers')
const maxPagesPerPart = numberField('max_pages_per_part')
const shortLineSplitFactor = computed({
  get: () => model.value.short_line_split_factor ?? 0.8,
  set: (value) => {
    if (value === '' || value === null || value === undefined) {
      model.value.short_line_split_factor = undefined
      return
    }
    model.value.short_line_split_factor = Number(value)
  },
})

const resetSettings = () => {
  localStorage.removeItem('pdf-babel.preferences')
  localStorage.removeItem('pdf-babel.recentTranslations')
  window.location.reload()
}
</script>

<template>
  <div class="space-y-6">
    <Accordion type="single" collapsible class="w-full" default-value="output">
      <AccordionItem value="output">
        <AccordionTrigger>{{ t('settings.outputPreference') }}</AccordionTrigger>
        <AccordionContent class="space-y-4 pt-2">
          <div class="grid gap-4 md:grid-cols-2">
            <div class="flex items-center justify-between rounded-lg border p-4">
              <div class="space-y-1">
                <Label for="output-dual">{{ t('settings.bilingual') }}</Label>
                <p class="text-xs text-muted-foreground">{{ t('settings.bilingualDescription') }}</p>
              </div>
              <Switch
                id="output-dual"
                :model-value="!model.no_dual"
                @update:model-value="(value) => { model.no_dual = !value; if (!value) model.no_mono = false }"
              />
            </div>

            <div class="flex items-center justify-between rounded-lg border p-4">
              <div class="space-y-1">
                <Label for="output-mono">{{ t('settings.monoOnly') }}</Label>
                <p class="text-xs text-muted-foreground">{{ t('settings.monoOnlyDescription') }}</p>
              </div>
              <Switch
                id="output-mono"
                :model-value="!model.no_mono"
                @update:model-value="(value) => { model.no_mono = !value; if (!value) model.no_dual = false }"
              />
            </div>
          </div>

          <div class="flex items-center justify-between">
            <Label for="watermark-output-mode">{{ t('settings.watermarkOutputMode') }}</Label>
            <Select :model-value="model.watermark_output_mode || 'no_watermark'" @update:model-value="(value) => (model.watermark_output_mode = value)">
              <SelectTrigger class="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no_watermark">{{ t('settings.noWatermark') }}</SelectItem>
                <SelectItem value="watermarked">{{ t('settings.watermarked') }}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div class="flex items-center justify-between">
            <Label for="only-include-translated-page">{{ t('settings.onlyIncludeTranslatedPage') }}</Label>
            <Switch id="only-include-translated-page" v-model="model.only_include_translated_page" />
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="pdf">
        <AccordionTrigger>{{ t('settings.pdfProcessing') }}</AccordionTrigger>
        <AccordionContent class="space-y-4 pt-2">
          <div class="space-y-2">
            <Label for="pages">{{ t('settings.pages') }}</Label>
            <Input id="pages" v-model="model.pages" :placeholder="t('settings.pagesPlaceholder')" />
          </div>

          <div class="space-y-2">
            <Label for="max-pages-per-part">{{ t('settings.maxPagesPerPart') }}</Label>
            <Input
              id="max-pages-per-part"
              v-model="maxPagesPerPart"
              type="number"
              :placeholder="t('settings.maxPagesPerPartPlaceholder')"
            />
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="text">
        <AccordionTrigger>{{ t('settings.translationOptions') }}</AccordionTrigger>
        <AccordionContent class="space-y-4 pt-2">
          <div class="flex items-center justify-between">
            <Label for="ignore-cache">{{ t('settings.ignoreCache') }}</Label>
            <Switch id="ignore-cache" v-model="model.ignore_cache" />
          </div>

          <div class="flex items-center justify-between">
            <Label for="skip-clean">{{ t('settings.skipClean') }}</Label>
            <Switch id="skip-clean" v-model="model.skip_clean" />
          </div>

          <div class="flex items-center justify-between">
            <Label for="enhance-compatibility">{{ t('settings.enhanceCompatibility') }}</Label>
            <Switch id="enhance-compatibility" v-model="model.enhance_compatibility" />
          </div>

          <div class="flex items-center justify-between">
            <Label for="disable-rich-text-translate">{{ t('settings.disableRichTextTranslate') }}</Label>
            <Switch id="disable-rich-text-translate" v-model="model.disable_rich_text_translate" />
          </div>

          <div class="space-y-2">
            <Label for="custom-system-prompt">{{ t('settings.customSystemPrompt') }}</Label>
            <Input
              id="custom-system-prompt"
              v-model="model.custom_system_prompt"
              :placeholder="t('settings.customSystemPromptPlaceholder')"
            />
          </div>

          <div class="space-y-2">
            <Label for="primary-font-family">{{ t('settings.primaryFontFamily') }}</Label>
            <Select :model-value="model.primary_font_family || ''" @update:model-value="(value) => (model.primary_font_family = value || undefined)">
              <SelectTrigger id="primary-font-family">
                <SelectValue :placeholder="t('settings.primaryFontFamilyPlaceholder')" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="serif">{{ t('settings.primaryFontFamilySerif') }}</SelectItem>
                <SelectItem value="sans-serif">{{ t('settings.primaryFontFamilySans') }}</SelectItem>
                <SelectItem value="script">{{ t('settings.primaryFontFamilyScript') }}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="performance">
        <AccordionTrigger>{{ t('settings.rateLimiting') }}</AccordionTrigger>
        <AccordionContent class="space-y-4 pt-2">
          <div class="space-y-2">
            <Label for="qps">{{ t('settings.qps') }}</Label>
            <Input id="qps" v-model="qps" type="number" :placeholder="t('settings.qpsPlaceholder')" />
          </div>

          <div class="space-y-2">
            <Label for="pool-max-workers">{{ t('settings.poolMaxWorkers') }}</Label>
            <Input
              id="pool-max-workers"
              v-model="poolMaxWorkers"
              type="number"
              :placeholder="t('settings.poolMaxWorkersPlaceholder')"
            />
          </div>

          <div class="space-y-2">
            <Label for="term-pool-max-workers">{{ t('settings.termPoolMaxWorkers') }}</Label>
            <Input
              id="term-pool-max-workers"
              v-model="termPoolMaxWorkers"
              type="number"
              :placeholder="t('settings.termPoolMaxWorkersPlaceholder')"
            />
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="layout">
        <AccordionTrigger>{{ t('settings.advanced') }}</AccordionTrigger>
        <AccordionContent class="space-y-4 pt-2">
          <div class="flex items-center justify-between">
            <Label for="split-short-lines">{{ t('settings.splitShortLines') }}</Label>
            <Switch id="split-short-lines" v-model="model.split_short_lines" />
          </div>

          <div class="space-y-2">
            <Label for="short-line-split-factor">{{ t('settings.shortLineSplitFactor') }}</Label>
            <Input
              id="short-line-split-factor"
              v-model="shortLineSplitFactor"
              type="number"
              step="0.1"
              :placeholder="t('settings.shortLineSplitFactorPlaceholder')"
            />
          </div>

          <div class="flex items-center justify-between">
            <Label for="skip-scanned-detection">{{ t('settings.skipScannedDetection') }}</Label>
            <Switch id="skip-scanned-detection" v-model="model.skip_scanned_detection" />
          </div>

          <div class="flex items-center justify-between">
            <Label for="ocr-workaround">{{ t('settings.ocrWorkaround') }}</Label>
            <Switch id="ocr-workaround" v-model="model.ocr_workaround" />
          </div>

          <div class="flex items-center justify-between">
            <Label for="auto-enable-ocr-workaround">{{ t('settings.autoEnableOcrWorkaround') }}</Label>
            <Switch id="auto-enable-ocr-workaround" v-model="model.auto_enable_ocr_workaround" />
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="glossary">
        <AccordionTrigger>{{ t('settings.glossary') }}</AccordionTrigger>
        <AccordionContent class="space-y-4 pt-2">
          <div class="flex items-center justify-between">
            <Label for="auto-extract-glossary">{{ t('settings.autoExtractGlossary') }}</Label>
            <Switch id="auto-extract-glossary" v-model="model.auto_extract_glossary" />
          </div>

          <div class="flex items-center justify-between">
            <Label for="save-auto-extracted-glossary">{{ t('settings.saveAutoExtractedGlossary') }}</Label>
            <Switch id="save-auto-extracted-glossary" v-model="model.save_auto_extracted_glossary" />
          </div>
        </AccordionContent>
      </AccordionItem>

      <AccordionItem value="appearance">
        <AccordionTrigger>{{ t('settings.appearance') }}</AccordionTrigger>
        <AccordionContent class="space-y-4 pt-2">
          <Label>{{ t('settings.accentColor') }}</Label>
          <div class="grid grid-cols-5 gap-3">
            <div
              v-for="color in ['black', 'sky', 'lime', 'orange', 'pink']"
              :key="color"
              class="border-2 rounded-lg p-3 cursor-pointer flex flex-col items-center gap-2 hover:bg-accent transition-all"
              :class="{ 'border-primary ring-2 ring-primary/20': model.accent_color === color, 'border-border': model.accent_color !== color }"
              @click="model.accent_color = color"
            >
              <div
                class="w-8 h-8 rounded-full"
                :class="{
                  'bg-black dark:bg-white': color === 'black',
                  'bg-sky-800': color === 'sky',
                  'bg-lime-800': color === 'lime',
                  'bg-orange-800': color === 'orange',
                  'bg-pink-800': color === 'pink'
                }"
              />
              <span class="text-xs font-medium">{{ t(`settings.accentColors.${color}`) }}</span>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>

    <div class="pt-2">
      <Button variant="destructive" class="w-full" @click="resetSettings">
        {{ t('settings.resetSettings') }}
      </Button>
    </div>
  </div>
</template>
