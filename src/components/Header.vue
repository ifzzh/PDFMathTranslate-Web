<script setup>
import { useI18n } from 'vue-i18n'
import { cn } from '@/lib/utils'
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
  currentView: {
    type: String,
    default: 'workspace',
  },
  showSettings: {
    type: Boolean,
    default: false,
  },
  isTranslating: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['toggle-settings', 'change-language', 'go-home', 'set-view'])

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

const isActiveView = (view) => props.currentView === view
</script>

<template>
  <header class="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
    <div class="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
      <div class="flex flex-col gap-3 lg:flex-row lg:items-center">
        <div class="flex items-center gap-3">
          <button class="text-xl font-bold tracking-tight text-primary hover:opacity-80" @click="emit('go-home')">
            {{ t('app.title') }}
          </button>
          <span class="hidden rounded-full border px-2.5 py-1 text-xs text-muted-foreground md:inline-flex">
            {{ t('app.subtitle') }}
          </span>
        </div>

        <div class="inline-flex w-fit items-center gap-1 rounded-full border bg-muted/50 p-1">
          <button
            type="button"
            :class="cn(
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              isActiveView('workspace')
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/70 hover:text-foreground'
            )"
            @click="emit('set-view', 'workspace')"
          >
            {{ t('app.views.workspace') }}
          </button>
          <button
            type="button"
            :class="cn(
              'rounded-full px-3 py-1.5 text-sm font-medium transition-colors',
              isActiveView('history')
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:bg-background/70 hover:text-foreground'
            )"
            @click="emit('set-view', 'history')"
          >
            {{ t('app.views.history') }}
          </button>
        </div>
      </div>

      <div class="flex items-center gap-2 self-end lg:self-auto">
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
    </div>
  </header>
</template>
