// 数据库类型定义

// Supabase generic type stub — replace with `supabase gen types typescript` output for full type safety
export type Database = {
  public: {
    Tables: Record<string, { Row: Record<string, unknown>; Insert: Record<string, unknown>; Update: Record<string, unknown> }>
    Views: Record<string, { Row: Record<string, unknown> }>
    Functions: Record<string, unknown>
    Enums: Record<string, string[]>
  }
}

export type CompanyRegion = 'US' | 'CN' | 'EU' | 'OTHER'
export type CompanyType = 'LLM' | 'Robotics' | 'AD' | 'WORLD_MODEL'
export type ModelCategory = 'general' | 'reasoning' | 'code' | 'multimodal' | 'edge' | 'autonomous_driving' | 'robotics' | 'world_model'
export type LicenseType = 'open' | 'closed' | 'partial'
export type UserRole = 'admin' | 'tech' | 'exec'
export type AnnotationVisibility = 'public' | 'team' | 'private'
export type AlertPriority = 'high' | 'medium' | 'low'
export type AlertChannel = 'email' | 'wechat' | 'slack' | 'dingtalk'

export interface Company {
  id: string
  name: string
  name_cn?: string
  region: CompanyRegion
  type: CompanyType
  logo?: string
  website_url?: string
  valuation?: string
  valuation_amount?: number
  valuation_date?: string
  founded_year?: number
  business_model?: string
  pricing_model?: string
  international_reach?: string
  moat?: string
  created_at: string
  updated_at: string
  archived_at?: string
}

export interface Model {
  id: string
  company_id: string
  company?: Company
  name: string
  name_full?: string
  color?: string
  category: ModelCategory
  params?: string
  context_window?: string
  modalities: string[]
  license: LicenseType
  release_date: string
  announcement_url?: string
  innovation?: string
  architecture?: string
  training_details?: string
  created_at: string
  updated_at: string
  archived_at?: string
  data_source: string
  source_url?: string
  confidence_score: number
  verified_by?: string
  verified_at?: string
  benchmarks?: ModelBenchmark[]
  price?: PriceHistory
}

export interface Benchmark {
  id: string
  name: string
  name_cn?: string
  category_id: string
  category?: BenchmarkCategory
  description?: string
  description_cn?: string
  max_score: number
  unit: string
  higher_is_better: boolean
  official_url?: string
  paper_url?: string
  benchmark_source?: string
  applicable_model_types: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface BenchmarkCategory {
  id: string
  name: string
  name_cn?: string
  parent_id?: string
  parent?: BenchmarkCategory
  description?: string
  icon?: string
  color?: string
  sort_order: number
  created_at: string
}

export interface ModelBenchmark {
  id: string
  model_id: string
  model?: Model
  benchmark_id: string
  benchmark?: Benchmark
  score: number
  source: string
  tested_at: string
  notes?: string
  confidence_score: number
  verified_by?: string
  verified_at?: string
  created_at: string
}

export interface PriceHistory {
  id: string
  model_id: string
  model?: Model
  input_price_per_million: number
  output_price_per_million: number
  effective_from: string
  effective_to?: string
  source: string
  source_url?: string
  created_at: string
}

export interface FundingEvent {
  id: string
  company_id: string
  company?: Company
  funding_date: string
  round_name: string
  amount_usd: number
  amount_formatted: string
  investors?: string[]
  valuation_usd?: number
  valuation_formatted?: string
  source: string
  source_url?: string
  notes?: string
  created_at: string
}

export interface Profile {
  id: string
  email: string
  full_name?: string
  avatar_url?: string
  role: UserRole
  team?: string
  notification_channels: AlertChannel[]
  created_at: string
  updated_at: string
}

export interface Annotation {
  id: string
  model_id?: string
  model?: Model
  company_id?: string
  company?: Company
  user_id: string
  user?: Profile
  content: string
  visibility: AnnotationVisibility
  is_pinned: boolean
  created_at: string
  updated_at: string
  deleted_at?: string
  mentions?: AnnotationMention[]
}

export interface AnnotationMention {
  id: string
  annotation_id: string
  annotation?: Annotation
  mentioned_user_id: string
  mentioned_user?: Profile
  is_read: boolean
  created_at: string
}

export interface WeeklySummary {
  id: string
  week_number: number
  year: number
  signal_1: string
  signal_2?: string
  signal_3?: string
  action_items?: string
  upcoming_events?: string
  new_models_count: number
  funding_events_count: number
  price_war_index?: string
  data_freshness_score: number
  created_by: string
  created_by_user?: Profile
  published_at?: string
  created_at: string
  updated_at: string
}

export interface AlertRule {
  id: string
  name: string
  description?: string
  trigger_type: string
  condition_expr: string
  priority: AlertPriority
  channels: AlertChannel[]
  target_roles: UserRole[]
  is_active: boolean
  created_by?: string
  created_at: string
  updated_at: string
}

export interface AlertEvent {
  id: string
  rule_id?: string
  rule?: AlertRule
  trigger_type: string
  trigger_data: Record<string, any>
  priority: AlertPriority
  channels_sent?: AlertChannel[]
  sent_at?: string
  error_message?: string
  created_at: string
}

// API 响应类型
export interface ApiResponse<T> {
  data: T
  meta?: {
    timestamp: string
    request_id?: string
  }
}

export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    page_size: number
    total: number
    total_pages: number
  }
}

export interface ApiError {
  error: {
    code: number
    message: string
    details?: Array<{
      field: string
      message: string
    }>
  }
  meta: {
    timestamp: string
    request_id?: string
  }
}

// 前端组件 Props 类型
export interface TimelineNode {
  id: string
  name: string
  company: string
  params?: string
  date: string
  license: LicenseType
  color: string
  category: ModelCategory
}

export interface PriceCalculatorInput {
  input_tokens_per_month: number
  output_tokens_per_month: number
  model_ids: string[]
  scenarios?: string[]
}

export interface PriceCalculatorResult {
  model_id: string
  model_name: string
  monthly_cost: number
  annual_cost: number
  swe_bench_score: number
  savings_vs_max: {
    monthly: number
    annual: number
  }
  performance_gap: number
  is_best_value: boolean
}

export interface SelectorInput {
  task_type: 'code_generation' | 'long_context' | 'multimodal' | 'agent'
  deployment: 'api' | 'local'
  license_requirement: 'mit_apache' | 'commercial_acceptable' | 'weights_only'
  monthly_budget: number
  min_swe_score?: number
  min_context_window?: string
  priorities: {
    performance: number
    cost: number
    deployment_flexibility: number
    compliance: number
  }
}

export interface SelectorRecommendation {
  rank: number
  model_id: string
  model_name: string
  total_score: number
  score_breakdown: {
    performance: { score: number; weight: number; details: string }
    cost: { score: number; weight: number; details: string }
    deployment_flexibility: { score: number; weight: number; details: string }
    compliance: { score: number; weight: number; details: string }
  }
  reasons: string[]
  warnings: string[]
}
