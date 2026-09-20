/** 寄件接口独立于公开取件接口，避免误用下载权限或管理员凭证。 */
export interface DeliveryCode {
  // 列表不携带原文；历史缺失原文的码需在后台重设后启用。
  code?: string | null
  id: number
  name: string
  expires_at: string
  max_uploads: number
  used_count: number
  reserved_count: number
  remaining: number
  enabled: boolean
  deleted: boolean
  status: string
  created_at: string
  /** 管理侧备注与标签仅用于检索和识别，不影响寄件授权。 */
  note?: string
  tags?: string[]
}
/** 会话只维护寄件授权；上传限制和过期策略复用系统配置。 */
export interface DeliverySession {
  token: string
  name: string
  remaining: number
  expires_at: string
  expires_in: number
}
export interface CreateDeliveryCode {
  name: string
  code: string
  expires_at: string
  max_uploads: number
  note?: string
  tags?: string[]
}

/** 寄件管理列表的后端筛选参数，全部使用明确的 all 表示未筛选。 */
export interface DeliveryCodeFilters {
  keyword: string
  status: 'all' | 'active' | 'disabled' | 'expired' | 'exhausted'
  tag: string
  sort_by: 'created_at' | 'expires_at' | 'name' | 'used_count' | 'max_uploads'
  sort_order: 'asc' | 'desc'
}

/** 单条更新允许省略未改的口令，保证历史超长口令仍可保留。 */
export interface UpdateDeliveryCode extends Partial<Omit<CreateDeliveryCode, 'code'>> {
  code?: string
}

export interface DeliveryBatchRequest {
  ids: number[]
  action: 'enable' | 'disable' | 'delete' | 'update'
  expires_at?: string
  max_uploads?: number
}
export interface DeliveryList<T> {
  items: T[]
  total: number
}

/** 收件通知配置仅由管理员接口返回，敏感字段始终使用空字符串脱敏。 */
export interface DeliveryNotificationConfig {
  email_enabled: boolean
  smtp_host: string
  smtp_port: number
  smtp_security: 'starttls' | 'tls' | 'plain'
  smtp_username: string
  smtp_password: ''
  smtp_password_set: boolean
  email_from: string
  email_to: string[]
  webhook_enabled: boolean
  webhook_url: string
  webhook_secret: ''
  webhook_secret_set: boolean
}

/** 保存时允许输入新凭证或明确请求清除，空凭证表示保持服务端现有值。 */
export interface UpdateDeliveryNotificationConfig extends Omit<
  DeliveryNotificationConfig,
  'smtp_password' | 'webhook_secret' | 'smtp_password_set' | 'webhook_secret_set'
> {
  smtp_password: string
  webhook_secret: string
  clear_smtp_password?: boolean
  clear_webhook_secret?: boolean
}

/** 最近通知事件仅展示投递状态，避免在管理端泄漏消息内容。 */
export interface DeliveryNotificationEvent {
  id: number
  event_id: string
  channel: 'email' | 'webhook'
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled'
  attempts: number
  last_error: string
  created_at: string
  sent_at: string | null
  is_test: boolean
}
