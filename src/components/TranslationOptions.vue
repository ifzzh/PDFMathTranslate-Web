<script setup>
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { ArrowRightLeft } from 'lucide-vue-next'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import FileSelector from '@/components/FileSelector.vue'

const { t } = useI18n()

const props = defineProps({
  config: {
    type: Object,
    default: () => ({ languages: [], services: [], defaults: {} }),
  },
  modelValue: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['update:modelValue', 'file-selected', 'files-selected'])

const model = computed({
  get: () => props.modelValue,
  set: (value) => emit('update:modelValue', value),
})

const languages = computed(() => props.config?.languages || [])
const services = computed(() => props.config?.services || [])

const selectedService = computed(() => {
  return services.value.find(item => item.value === model.value.service) || null
})

const currentFields = computed(() => selectedService.value?.fields || [])

watch(
  services,
  (items) => {
    if (!items.length || model.value.service) {
      return
    }
    model.value.service = props.config?.defaults?.service || items[0].value
  },
  { immediate: true }
)

watch(
  languages,
  (items) => {
    if (!items.length) {
      return
    }
    if (!model.value.lang_in) {
      model.value.lang_in = props.config?.defaults?.lang_in || items[0].value
    }
    if (!model.value.lang_out) {
      model.value.lang_out = props.config?.defaults?.lang_out || items[0].value
    }
  },
  { immediate: true }
)

watch(
  () => model.value.service,
  () => {
    model.value.service_credentials = {}
  }
)

const serviceLabel = computed(() => selectedService.value?.display || '')

const service = computed({
  get: () => model.value.service,
  set: (value) => {
    model.value.service = value
  },
})

const swapLanguages = () => {
  const currentIn = model.value.lang_in
  model.value.lang_in = model.value.lang_out
  model.value.lang_out = currentIn
}

const updateCredential = (name, value) => {
  if (!model.value.service_credentials) {
    model.value.service_credentials = {}
  }
  model.value.service_credentials[name] = value
}

const credentialValue = (name) => {
  return model.value.service_credentials?.[name] || ''
}

const languageLabel = (value) => {
  return languages.value.find(item => item.value === value)?.label || value
}
</script>

<template>
  <div class="space-y-6">
    <FileSelector @file-selected="emit('file-selected', $event)" @files-selected="emit('files-selected', $event)" />

    <div class="grid gap-4 md:grid-cols-[1fr_auto_1fr]">
      <div class="space-y-2">
        <Label>{{ t('translation.from') }}</Label>
        <Select :model-value="model.lang_in" @update:model-value="(value) => (model.lang_in = value)">
          <SelectTrigger>
            <SelectValue :placeholder="t('translation.selectLanguage')">
              <span v-if="model.lang_in">{{ languageLabel(model.lang_in) }}</span>
              <span v-else class="text-muted-foreground">{{ t('translation.selectLanguage') }}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="language in languages" :key="`from-${language.value}`" :value="language.value">
              {{ language.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div class="flex items-end justify-center">
        <Button variant="ghost" size="icon" class="mb-0.5 shrink-0" @click="swapLanguages" :title="t('translation.swapLanguages')">
          <ArrowRightLeft class="h-4 w-4" />
        </Button>
      </div>

      <div class="space-y-2">
        <Label>{{ t('translation.to') }}</Label>
        <Select :model-value="model.lang_out" @update:model-value="(value) => (model.lang_out = value)">
          <SelectTrigger>
            <SelectValue :placeholder="t('translation.selectLanguage')">
              <span v-if="model.lang_out">{{ languageLabel(model.lang_out) }}</span>
              <span v-else class="text-muted-foreground">{{ t('translation.selectLanguage') }}</span>
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem v-for="language in languages" :key="`to-${language.value}`" :value="language.value">
              {{ language.label }}
            </SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>

    <div class="space-y-2">
      <Label>{{ t('translation.service') }}</Label>
      <Select :model-value="service" @update:model-value="(value) => (service = value)">
        <SelectTrigger>
          <SelectValue :placeholder="t('translation.selectService')">
            <span v-if="service">{{ serviceLabel }}</span>
            <span v-else class="text-muted-foreground">{{ t('translation.selectService') }}</span>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="item in services" :key="item.value" :value="item.value">
            {{ item.display }}
          </SelectItem>
        </SelectContent>
      </Select>
    </div>

    <div v-if="currentFields.length > 0" class="grid gap-4 md:grid-cols-2">
      <div v-for="field in currentFields" :key="field.name" class="space-y-2">
        <Label :for="field.name">
          {{ field.label }}
          <span v-if="field.required" class="text-destructive">*</span>
        </Label>
        <Input
          :id="field.name"
          :type="field.secret ? 'password' : 'text'"
          :placeholder="field.placeholder || field.label"
          :model-value="credentialValue(field.name)"
          @update:model-value="(value) => updateCredential(field.name, value)"
        />
      </div>
    </div>
  </div>
</template>
