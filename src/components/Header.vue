<script setup>
import { useI18n } from 'vue-i18n'
import { Button } from '@/components/ui/button'
import { Moon, Sun, Languages, Settings, X } from 'lucide-vue-next'
import { useColorMode } from '@vueuse/core'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const props = defineProps({
  showSettings: {
    type: Boolean,
    default: false,
  },
  isTranslating: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['toggle-settings', 'change-language', 'go-home'])

const { locale, t } = useI18n()
const colorMode = useColorMode({
  disableTransition: false,
})

const supportedLocales = [
  { code: 'en', native: 'English' },
  { code: 'zh', native: '简体中文' },
]

const toggleTheme = () => {
  colorMode.value = colorMode.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <header class="sticky top-0 z-50 flex items-center justify-between border-b bg-background/95 px-6 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
    <div class="flex items-center gap-3">
      <button class="text-xl font-bold tracking-tight text-primary hover:opacity-80" @click="emit('go-home')">
        {{ t('app.title') }}
      </button>
      <span class="hidden rounded-full border px-2.5 py-1 text-xs text-muted-foreground md:inline-flex">
        {{ t('app.subtitle') }}
      </span>
    </div>

    <div class="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger as-child>
          <Button variant="ghost" size="icon" :disabled="isTranslating">
            <Languages class="h-5 w-5" />
            <span class="sr-only">{{ t('language.select') }}</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            v-for="lang in supportedLocales"
            :key="lang.code"
            :class="{ 'bg-accent': locale === lang.code }"
            @click="emit('change-language', lang.code)"
          >
            {{ lang.native }}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Button variant="ghost" size="icon" @click="toggleTheme">
        <Sun v-if="colorMode === 'light'" class="h-5 w-5" />
        <Moon v-else class="h-5 w-5" />
        <span class="sr-only">{{ t('shortcuts.theme') }}</span>
      </Button>

      <Button variant="ghost" size="icon" :disabled="isTranslating" @click="emit('toggle-settings')">
        <Settings v-if="!showSettings" class="h-5 w-5" />
        <X v-else class="h-5 w-5" />
        <span class="sr-only">{{ showSettings ? t('common.close') : t('settings.title') }}</span>
      </Button>
    </div>
  </header>
</template>
