<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { RefreshCwIcon, SaveIcon, SendIcon } from 'lucide-vue-next'
import BaseButton from '@/components/common/BaseButton.vue'
import SettingSwitch from '@/components/common/SettingSwitch.vue'
import { DeliveryService } from '@/services'
import { useAlertStore } from '@/stores/alertStore'
import type {
  DeliveryNotificationConfig,
  DeliveryNotificationEvent,
  UpdateDeliveryNotificationConfig
} from '@/types/delivery'
import { getErrorMessage } from '@/utils/common'

type NotificationForm = Omit<
  DeliveryNotificationConfig,
  'email_to' | 'smtp_password' | 'webhook_secret' | 'smtp_password_set' | 'webhook_secret_set'
> & {
  email_to: string
  smtp_password: string
  webhook_secret: string
  clear_smtp_password: boolean
  clear_webhook_secret: boolean
}

const { t } = useI18n()
const alerts = useAlertStore()
const loading = ref(false)
const saving = ref(false)
const testing = ref<'email' | 'webhook' | null>(null)
const refreshingEvents = ref(false)
const events = ref<DeliveryNotificationEvent[]>([])
const savedConfig = ref<DeliveryNotificationConfig | null>(null)

// 敏感输入只存在组件内存中，保存和离开设置页后均不会写入全局配置或浏览器存储。
const form = reactive<NotificationForm>({
  email_enabled: false,
  smtp_host: '',
  smtp_port: 587,
  smtp_security: 'starttls',
  smtp_username: '',
  smtp_password: '',
  email_from: '',
  email_to: '',
  webhook_enabled: false,
  webhook_url: '',
  webhook_secret: '',
  clear_smtp_password: false,
  clear_webhook_secret: false
})
const inputClass =
  'w-full rounded-md border border-[rgb(var(--color-border))] bg-[rgb(var(--color-surface-input)/0.8)] px-3 py-2 text-sm text-[rgb(var(--color-text-strong))] outline-none transition focus:border-zinc-500 focus:ring-2 focus:ring-zinc-500'
const normalizedRecipients = computed(() =>
  form.email_to
    .split(/[,，\n]+/)
    .map((item) => item.trim())
    .filter(Boolean)
)
const snapshot = (config: DeliveryNotificationConfig) =>
  JSON.stringify({
    email_enabled: config.email_enabled,
    smtp_host: config.smtp_host,
    smtp_port: config.smtp_port,
    smtp_security: config.smtp_security,
    smtp_username: config.smtp_username,
    email_from: config.email_from,
    email_to: config.email_to,
    webhook_enabled: config.webhook_enabled,
    webhook_url: config.webhook_url
  })
const currentSnapshot = computed(() =>
  JSON.stringify({
    email_enabled: form.email_enabled,
    smtp_host: form.smtp_host,
    smtp_port: Number(form.smtp_port),
    smtp_security: form.smtp_security,
    smtp_username: form.smtp_username,
    email_from: form.email_from,
    email_to: normalizedRecipients.value,
    webhook_enabled: form.webhook_enabled,
    webhook_url: form.webhook_url
  })
)
// 仅在成功读取服务端配置后允许覆盖保存，加载失败时保留重试入口而不盲写未知配置。
const hasLoaded = computed(() => savedConfig.value !== null)
const isDirty = computed(
  () =>
    hasLoaded.value &&
    (currentSnapshot.value !== snapshot(savedConfig.value!) ||
      Boolean(
        form.smtp_password ||
        form.webhook_secret ||
        form.clear_smtp_password ||
        form.clear_webhook_secret
      ))
)
const canTestEmail = computed(
  () => !loading.value && !saving.value && !testing.value && !isDirty.value && form.email_enabled
)
const canTestWebhook = computed(
  () => !loading.value && !saving.value && !testing.value && !isDirty.value && form.webhook_enabled
)

function applyConfig(config: DeliveryNotificationConfig) {
  savedConfig.value = config
  Object.assign(form, {
    email_enabled: config.email_enabled,
    smtp_host: config.smtp_host,
    smtp_port: config.smtp_port,
    smtp_security: config.smtp_security,
    smtp_username: config.smtp_username,
    smtp_password: '',
    email_from: config.email_from,
    email_to: config.email_to.join(', '),
    webhook_enabled: config.webhook_enabled,
    webhook_url: config.webhook_url,
    webhook_secret: '',
    clear_smtp_password: false,
    clear_webhook_secret: false
  })
}
function report(error: unknown, fallback: string) {
  alerts.showAlert(getErrorMessage(error, fallback), 'error')
}
async function loadConfig() {
  loading.value = true
  try {
    applyConfig(await DeliveryService.getNotificationConfig())
  } catch (error) {
    report(error, t('delivery.notifications.loadFailed'))
  } finally {
    loading.value = false
  }
}
async function refreshEvents() {
  refreshingEvents.value = true
  try {
    events.value = (await DeliveryService.listNotificationEvents()).items.slice(0, 20)
  } catch (error) {
    report(error, t('delivery.notifications.eventsFailed'))
  } finally {
    refreshingEvents.value = false
  }
}
async function save() {
  if (saving.value || loading.value) return
  saving.value = true
  try {
    // 空字符串由服务端解释为保持原有凭证，前端永不读取脱敏凭证的原文。
    const data: UpdateDeliveryNotificationConfig = {
      email_enabled: form.email_enabled,
      smtp_host: form.smtp_host.trim(),
      smtp_port: Number(form.smtp_port),
      smtp_security: form.smtp_security,
      smtp_username: form.smtp_username.trim(),
      smtp_password: form.smtp_password,
      email_from: form.email_from.trim(),
      email_to: normalizedRecipients.value,
      webhook_enabled: form.webhook_enabled,
      webhook_url: form.webhook_url.trim(),
      webhook_secret: form.webhook_secret,
      clear_smtp_password: form.clear_smtp_password,
      clear_webhook_secret: form.clear_webhook_secret
    }
    applyConfig(await DeliveryService.updateNotificationConfig(data))
    alerts.showAlert(t('delivery.notifications.saved'), 'success')
  } catch (error) {
    report(error, t('delivery.notifications.saveFailed'))
  } finally {
    saving.value = false
  }
}
async function testChannel(channel: 'email' | 'webhook') {
  if (
    (channel === 'email' && !canTestEmail.value) ||
    (channel === 'webhook' && !canTestWebhook.value)
  )
    return
  testing.value = channel
  try {
    const result = await DeliveryService.testNotification(channel)
    alerts.showAlert(result.message || t('delivery.notifications.testQueued'), 'success')
    await refreshEvents()
  } catch (error) {
    report(error, t('delivery.notifications.testFailed'))
  } finally {
    testing.value = null
  }
}
function eventStatusClass(status: DeliveryNotificationEvent['status']) {
  return status === 'sent'
    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
    : status === 'failed'
      ? 'bg-red-500/10 text-red-700 dark:text-red-300'
      : status === 'cancelled'
        ? 'bg-zinc-500/10 text-zinc-600 dark:text-zinc-300'
        : 'bg-amber-500/10 text-amber-700 dark:text-amber-300'
}
onMounted(() => {
  void Promise.all([loadConfig(), refreshEvents()])
})
</script>

<template>
  <section class="theme-panel mt-6 space-y-6 rounded-2xl border p-6 backdrop-blur-xl">
    <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h3 class="theme-text-strong text-lg font-medium">
          {{ t('delivery.notifications.title') }}
        </h3>
        <p class="theme-text-muted mt-1 text-sm">{{ t('delivery.notifications.subtitle') }}</p>
      </div>
      <span class="theme-text-muted text-xs">{{
        isDirty ? t('delivery.notifications.unsaved') : t('delivery.notifications.savedState')
      }}</span>
    </div>
    <p
      class="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-sm leading-6 text-amber-800 dark:text-amber-200"
    >
      {{ t('delivery.notifications.privacyNotice') }}
    </p>
    <!-- 保存期间冻结配置表单，避免异步响应覆盖用户刚输入的内容。 -->
    <fieldset :disabled="saving" class="contents">
      <div class="grid gap-6 xl:grid-cols-2">
        <div class="space-y-4 rounded-xl border border-[rgb(var(--color-border))] p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 class="theme-text-strong font-medium">
                {{ t('delivery.notifications.emailTitle') }}
              </h4>
              <p class="theme-text-muted mt-1 text-xs">
                {{ t('delivery.notifications.emailHint') }}
              </p>
            </div>
            <SettingSwitch
              :label="t('delivery.notifications.emailEnabled')"
              :model-value="form.email_enabled ? 1 : 0"
              :enabled-text="t('common.enabled')"
              :disabled-text="t('common.disabled')"
              @toggle="form.email_enabled = !form.email_enabled"
            />
          </div>
          <template v-if="form.email_enabled">
            <label class="block text-sm"
              ><span class="theme-text mb-1 block">{{ t('delivery.notifications.smtpHost') }}</span
              ><input v-model="form.smtp_host" :class="inputClass" autocomplete="off"
            /></label>
            <div class="grid gap-4 sm:grid-cols-2">
              <label class="block text-sm"
                ><span class="theme-text mb-1 block">{{
                  t('delivery.notifications.smtpPort')
                }}</span
                ><input
                  v-model.number="form.smtp_port"
                  type="number"
                  min="1"
                  max="65535"
                  :class="inputClass" /></label
              ><label class="block text-sm"
                ><span class="theme-text mb-1 block">{{
                  t('delivery.notifications.smtpSecurity')
                }}</span
                ><select v-model="form.smtp_security" :class="inputClass">
                  <option value="starttls">STARTTLS</option>
                  <option value="tls">TLS</option>
                  <option value="plain">{{ t('delivery.notifications.plain') }}</option>
                </select></label
              >
            </div>
            <p class="theme-text-muted text-xs leading-5">
              {{ t('delivery.notifications.smtpSecurityHint') }}
            </p>
            <label class="block text-sm"
              ><span class="theme-text mb-1 block">{{
                t('delivery.notifications.smtpUsername')
              }}</span
              ><input v-model="form.smtp_username" :class="inputClass" autocomplete="off"
            /></label>
            <label class="block text-sm"
              ><span class="theme-text mb-1 block">{{
                t('delivery.notifications.smtpPassword')
              }}</span
              ><input
                v-model="form.smtp_password"
                type="password"
                :class="inputClass"
                autocomplete="new-password"
                :placeholder="
                  savedConfig?.smtp_password_set
                    ? t('delivery.notifications.secretSet')
                    : t('delivery.notifications.secretUnset')
                "
            /></label>
            <label
              v-if="savedConfig?.smtp_password_set"
              class="theme-text-muted flex items-center gap-2 text-xs"
              ><input v-model="form.clear_smtp_password" type="checkbox" class="h-4 w-4" />{{
                t('delivery.notifications.clearSmtpPassword')
              }}</label
            >
            <label class="block text-sm"
              ><span class="theme-text mb-1 block">{{ t('delivery.notifications.emailFrom') }}</span
              ><input v-model="form.email_from" type="email" :class="inputClass"
            /></label>
            <label class="block text-sm"
              ><span class="theme-text mb-1 block">{{ t('delivery.notifications.emailTo') }}</span
              ><textarea
                v-model="form.email_to"
                rows="2"
                :class="inputClass"
                :placeholder="t('delivery.notifications.emailToHint')"
              />
            </label>
            <BaseButton
              :loading="testing === 'email'"
              :disabled="!canTestEmail"
              variant="secondary"
              @click="testChannel('email')"
              ><template #icon><SendIcon class="mr-2 h-4 w-4 shrink-0" /></template
              >{{ t('delivery.notifications.testEmail') }}</BaseButton
            >
          </template>
        </div>
        <div class="space-y-4 rounded-xl border border-[rgb(var(--color-border))] p-4">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h4 class="theme-text-strong font-medium">
                {{ t('delivery.notifications.webhookTitle') }}
              </h4>
              <p class="theme-text-muted mt-1 text-xs">
                {{ t('delivery.notifications.webhookHint') }}
              </p>
            </div>
            <SettingSwitch
              :label="t('delivery.notifications.webhookEnabled')"
              :model-value="form.webhook_enabled ? 1 : 0"
              :enabled-text="t('common.enabled')"
              :disabled-text="t('common.disabled')"
              @toggle="form.webhook_enabled = !form.webhook_enabled"
            />
          </div>
          <template v-if="form.webhook_enabled">
            <label class="block text-sm"
              ><span class="theme-text mb-1 block">{{
                t('delivery.notifications.webhookUrl')
              }}</span
              ><input
                v-model="form.webhook_url"
                type="url"
                :class="inputClass"
                placeholder="https://example.com/notifications"
            /></label>
            <label class="block text-sm"
              ><span class="theme-text mb-1 block">{{
                t('delivery.notifications.webhookSecret')
              }}</span
              ><input
                v-model="form.webhook_secret"
                type="password"
                :class="inputClass"
                autocomplete="new-password"
                :placeholder="
                  savedConfig?.webhook_secret_set
                    ? t('delivery.notifications.secretSet')
                    : t('delivery.notifications.secretUnset')
                "
            /></label>
            <label
              v-if="savedConfig?.webhook_secret_set"
              class="theme-text-muted flex items-center gap-2 text-xs"
              ><input v-model="form.clear_webhook_secret" type="checkbox" class="h-4 w-4" />{{
                t('delivery.notifications.clearWebhookSecret')
              }}</label
            >
            <p class="theme-text-muted text-xs leading-5">
              {{ t('delivery.notifications.webhookFormat') }}
            </p>
            <BaseButton
              :loading="testing === 'webhook'"
              :disabled="!canTestWebhook"
              variant="secondary"
              @click="testChannel('webhook')"
              ><template #icon><SendIcon class="mr-2 h-4 w-4 shrink-0" /></template
              >{{ t('delivery.notifications.testWebhook') }}</BaseButton
            >
          </template>
        </div>
      </div>
      <div
        class="flex flex-wrap items-center gap-3 border-t border-[rgb(var(--color-border))] pt-5"
      >
        <BaseButton :loading="saving" :disabled="loading || !hasLoaded || !isDirty" @click="save"
          ><template #icon><SaveIcon class="mr-2 h-4 w-4 shrink-0" /></template
          >{{ t('delivery.notifications.save') }}</BaseButton
        ><BaseButton variant="secondary" :loading="loading" :disabled="loading" @click="loadConfig"
          ><template #icon><RefreshCwIcon class="mr-2 h-4 w-4 shrink-0" /></template
          >{{ t('delivery.notifications.reload') }}</BaseButton
        ><span class="theme-text-muted text-xs">{{ t('delivery.notifications.testHint') }}</span>
      </div>
    </fieldset>
    <div class="border-t border-[rgb(var(--color-border))] pt-5">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 class="theme-text-strong font-medium">
            {{ t('delivery.notifications.eventsTitle') }}
          </h4>
          <p class="theme-text-muted mt-1 text-xs">{{ t('delivery.notifications.eventsHint') }}</p>
        </div>
        <BaseButton size="sm" variant="outline" :loading="refreshingEvents" @click="refreshEvents"
          ><template #icon><RefreshCwIcon class="mr-2 h-4 w-4 shrink-0" /></template
          >{{ t('delivery.notifications.refreshEvents') }}</BaseButton
        >
      </div>
      <div v-if="events.length" class="mt-4 overflow-x-auto">
        <table class="w-full min-w-[640px] text-left text-sm">
          <thead class="theme-text-muted border-b border-[rgb(var(--color-border))] text-xs">
            <tr>
              <th class="px-2 py-2">{{ t('delivery.notifications.channel') }}</th>
              <th class="px-2 py-2">{{ t('delivery.notifications.status') }}</th>
              <th class="px-2 py-2">{{ t('delivery.notifications.attempts') }}</th>
              <th class="px-2 py-2">{{ t('delivery.notifications.time') }}</th>
              <th class="px-2 py-2">{{ t('delivery.notifications.error') }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="event in events"
              :key="event.id"
              class="border-b border-[rgb(var(--color-border))] last:border-0"
            >
              <td class="px-2 py-3">
                {{ t(`delivery.notifications.channels.${event.channel}`)
                }}<span v-if="event.is_test" class="theme-text-muted ml-1 text-xs">{{
                  t('delivery.notifications.testTag')
                }}</span>
              </td>
              <td class="px-2 py-3">
                <span
                  class="rounded-full px-2 py-1 text-xs"
                  :class="eventStatusClass(event.status)"
                  >{{ t(`delivery.notifications.statuses.${event.status}`) }}</span
                >
              </td>
              <td class="px-2 py-3">{{ event.attempts }}/3</td>
              <td class="px-2 py-3 whitespace-nowrap">
                {{ new Date(event.sent_at || event.created_at).toLocaleString() }}
              </td>
              <td class="theme-text-muted max-w-xs truncate px-2 py-3" :title="event.last_error">
                {{ event.last_error || '—' }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else class="theme-text-muted mt-4 text-sm">{{ t('delivery.notifications.noEvents') }}</p>
    </div>
  </section>
</template>
