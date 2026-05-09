-- ============================================
-- ModelTrack 数据库 Schema 设计 v1.0
-- 创建时间: 2026-03-24
-- 设计原则: 数据版本管理 + 来源追溯 + 审计日志
-- ============================================

-- 启用必要的扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- 用于模糊搜索

-- ============================================
-- 1. 基础枚举类型
-- ============================================

-- 公司区域
CREATE TYPE company_region AS ENUM ('US', 'CN', 'EU', 'OTHER');

-- 公司类型
CREATE TYPE company_type AS ENUM ('LLM', 'Robotics', 'AD', 'WORLD_MODEL');

-- 模型类别
CREATE TYPE model_category AS ENUM (
  'general',      -- 通用
  'reasoning',    -- 推理
  'code',         -- 代码
  'multimodal',   -- 多模态
  'edge',         -- 端侧
  'world'         -- 世界模型
);

-- 许可证类型
CREATE TYPE license_type AS ENUM ('open', 'closed', 'partial');

-- 数据来源
CREATE TYPE data_source AS ENUM (
  'official_blog',     -- 官方博客
  'huggingface',       -- HuggingFace
  'openrouter',        -- OpenRouter
  'epoch_ai',          -- Epoch AI
  'artificial_analysis', -- Artificial Analysis
  'techcrunch',        -- TechCrunch
  'media_36kr',        -- 36Kr
  'media_other',       -- 其他媒体
  'manual'             -- 手动录入
);

-- Benchmark 来源
CREATE TYPE benchmark_source AS ENUM (
  'epoch_ai',
  'artificial_analysis',
  'pinchbench',
  'openrouter',
  'arena',
  'official',
  'other'
);

-- 用户角色
CREATE TYPE user_role AS ENUM ('admin', 'tech', 'exec');

-- 批注可见范围
CREATE TYPE annotation_visibility AS ENUM ('public', 'team', 'private');

-- Alert 优先级
CREATE TYPE alert_priority AS ENUM ('high', 'medium', 'low');

-- Alert 渠道
CREATE TYPE alert_channel AS ENUM ('email', 'wechat', 'slack', 'dingtalk');

-- ============================================
-- 2. 核心表：公司和模型
-- ============================================

-- 公司表
CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR NOT NULL,
  name_cn VARCHAR, -- 中文名称（如：智元机器人）
  region company_region NOT NULL,
  type company_type NOT NULL,
  logo_url TEXT,
  website_url TEXT,

  -- 估值和融资信息
  valuation VARCHAR, -- 如 "$39.5B"
  valuation_amount BIGINT, -- 数字化估值，单位：美元
  valuation_date DATE,
  founded_year INT,

  -- 商业信息
  business_model TEXT, -- 如 "Robot-as-a-service + licensing"
  pricing_model TEXT,
  international_reach TEXT, -- 如 "Global 180+ countries"
  moat TEXT, -- 核心壁垒描述

  -- 元数据
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archived_at TIMESTAMP, -- 归档时间（软删除）

  -- 约束
  CONSTRAINT unique_company_name UNIQUE (name)
);

CREATE INDEX idx_companies_type ON companies(type);
CREATE INDEX idx_companies_region ON companies(region);
CREATE INDEX idx_companies_valuation ON companies(valuation_amount DESC);

-- 模型表
CREATE TABLE models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- 基础信息
  name VARCHAR NOT NULL,
  name_full VARCHAR, -- 完整名称（如：Claude Opus 4.6）
  color VARCHAR, -- 品牌颜色（用于 UI 展示）
  category model_category NOT NULL,

  -- 技术参数
  params VARCHAR, -- 参数量（如：229B-A10B）
  context_window VARCHAR, -- 上下文窗口（如：1M）
  modalities TEXT[], -- 支持的模态（如：['Text', 'Vision', 'Code']）

  -- 许可证和定价
  license license_type NOT NULL,

  -- 发布信息
  release_date DATE NOT NULL,
  announcement_url TEXT, -- 官方发布链接

  -- 创新点
  innovation TEXT, -- 关键创新点描述
  architecture TEXT, -- 架构描述（如：MoE Transformer）
  training_details TEXT, -- 训练数据和方法

  -- 元数据
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archived_at TIMESTAMP,

  -- 数据质量
  data_source data_source NOT NULL,
  source_url TEXT,
  confidence_score FLOAT DEFAULT 1.0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  verified_by UUID, -- 信息官 ID（外键，稍后添加）
  verified_at TIMESTAMP,

  -- 约束
  CONSTRAINT unique_model_name UNIQUE (name, company_id)
);

CREATE INDEX idx_models_company ON models(company_id);
CREATE INDEX idx_models_category ON models(category);
CREATE INDEX idx_models_license ON models(license);
CREATE INDEX idx_models_release_date ON models(release_date DESC);
CREATE INDEX idx_models_release_date_idx ON models (release_date);
CREATE INDEX idx_models_verified ON models(verified_at DESC);

-- ============================================
-- 3. 版本管理和变更追踪
-- ============================================

-- 模型版本历史（记录每次变更）
CREATE TABLE model_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  version_number INT NOT NULL,

  -- 变更详情
  changed_fields JSONB NOT NULL, -- 变更的字段和旧值
  -- 示例: {"context_window": {"old": "128K", "new": "200K"}}

  change_reason TEXT, -- 变更原因
  changed_by UUID, -- 操作人 ID（外键，稍后添加）
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT unique_model_version UNIQUE (model_id, version_number)
);

CREATE INDEX idx_model_versions_model ON model_versions(model_id);
CREATE INDEX idx_model_versions_date ON model_versions(changed_at DESC);

-- ============================================
-- 4. Benchmark 数据（支持历史追踪）
-- ============================================

-- Benchmark 定义表
CREATE TABLE benchmarks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR NOT NULL UNIQUE, -- 如：SWE-bench, MMLU
  description TEXT,
  max_score INT DEFAULT 100,
  unit VARCHAR DEFAULT 'percentage', -- percentage, score, time
  benchmark_type VARCHAR NOT NULL, -- coding, reasoning, multimodal, etc.

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 插入默认 benchmark 数据
INSERT INTO benchmarks (name, description, benchmark_type) VALUES
('SWE-bench', 'Software Engineering Benchmark - Code generation and bug fixing', 'coding'),
('MMLU', 'Massive Multitask Language Understanding - General knowledge', 'reasoning'),
('HumanEval', 'HumanEval - Code generation benchmark', 'coding'),
('MATH', 'Mathematical reasoning benchmark', 'reasoning'),
('Arena ELO', 'LM Arena human preference rating', 'general'),
('SWE-Pro', 'Software Engineering Professional benchmark', 'coding'),
('MLE-Bench', 'Machine Learning Engineering benchmark', 'coding'),
('Manipulation', 'Robotic manipulation success rate', 'robotics'),
('Navigation', 'Autonomous navigation success rate', 'robotics'),
('Planning', 'Task planning benchmark', 'robotics'),
('Generalization', 'Cross-embodiment generalization', 'robotics');

-- 模型 Benchmark 记录（支持历史追踪）
CREATE TABLE model_benchmarks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  benchmark_id UUID NOT NULL REFERENCES benchmarks(id) ON DELETE CASCADE,

  score FLOAT NOT NULL,
  source benchmark_source NOT NULL,
  tested_at DATE NOT NULL, -- 测试日期
  notes TEXT, -- 测试条件说明

  -- 数据质量
  confidence_score FLOAT DEFAULT 1.0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  verified_by UUID,
  verified_at TIMESTAMP,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- 约束：同一模型、同一 benchmark、同一测试日期、同一来源只能有一条记录
  CONSTRAINT unique_model_benchmark_test UNIQUE (model_id, benchmark_id, tested_at, source)
);

CREATE INDEX idx_model_benchmarks_model ON model_benchmarks(model_id);
CREATE INDEX idx_model_benchmarks_benchmark ON model_benchmarks(benchmark_id);
CREATE INDEX idx_model_benchmarks_date ON model_benchmarks(tested_at DESC);
CREATE INDEX idx_model_benchmarks_score ON model_benchmarks(score DESC);

-- ============================================
-- 5. 价格历史（追踪价格变化）
-- ============================================

CREATE TABLE price_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,

  input_price_per_million FLOAT NOT NULL, -- 输入价格（$/M tokens）
  output_price_per_million FLOAT NOT NULL, -- 输出价格（$/M tokens）

  effective_from DATE NOT NULL,
  effective_to DATE, -- NULL 表示当前有效价格

  source data_source NOT NULL,
  source_url TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT unique_price_period UNIQUE (model_id, effective_from)
);

CREATE INDEX idx_price_history_model ON price_history(model_id);
CREATE INDEX idx_price_history_date ON price_history(effective_from DESC);

-- ============================================
-- 6. 融资历史
-- ============================================

CREATE TABLE funding_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  funding_date DATE NOT NULL,
  round_name VARCHAR NOT NULL, -- 如：Series A, IPO, Series B
  amount_usd BIGINT NOT NULL, -- 金额（美元）
  amount_formatted VARCHAR, -- 格式化显示（如：$1.5B）

  investors TEXT[], -- 投资方列表
  valuation_usd BIGINT, -- 估值（美元）
  valuation_formatted VARCHAR,

  source data_source NOT NULL,
  source_url TEXT,
  notes TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT unique_funding_event UNIQUE (company_id, funding_date, round_name)
);

CREATE INDEX idx_funding_events_company ON funding_events(company_id);
CREATE INDEX idx_funding_events_date ON funding_events(funding_date DESC);
CREATE INDEX idx_funding_events_amount ON funding_events(amount_usd DESC);

-- ============================================
-- 7. 用户和权限
-- ============================================

-- 用户表（与 Supabase Auth 集成）
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR NOT NULL,
  full_name VARCHAR,
  avatar_url TEXT,
  role user_role NOT NULL DEFAULT 'tech',
  team VARCHAR, -- 部门/团队

  -- 通知设置
  notification_channels alert_channel[] DEFAULT ARRAY['email']::alert_channel[],

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT unique_email UNIQUE (email)
);

CREATE INDEX idx_profiles_role ON profiles(role);

-- 公司关注表（用户订阅特定公司）
CREATE TABLE company_watchlists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT unique_watchlist UNIQUE (user_id, company_id)
);

CREATE INDEX idx_watchlists_user ON company_watchlists(user_id);
CREATE INDEX idx_watchlists_company ON company_watchlists(company_id);

-- ============================================
-- 8. 内部批注系统
-- ============================================

CREATE TABLE annotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id UUID REFERENCES models(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,

  -- 至少关联一个（模型或公司）
  CHECK (model_id IS NOT NULL OR company_id IS NOT NULL),

  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  visibility annotation_visibility DEFAULT 'public',

  -- 置顶标记（仅信息官可用）
  is_pinned BOOLEAN DEFAULT FALSE,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP -- 软删除
);

CREATE INDEX idx_annotations_model ON annotations(model_id);
CREATE INDEX idx_annotations_company ON annotations(company_id);
CREATE INDEX idx_annotations_user ON annotations(user_id);
CREATE INDEX idx_annotations_date ON annotations(created_at DESC);

-- 批注提及（@同事）
CREATE TABLE annotation_mentions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  annotation_id UUID NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
  mentioned_user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT unique_mention UNIQUE (annotation_id, mentioned_user_id)
);

CREATE INDEX idx_mentions_annotation ON annotation_mentions(annotation_id);
CREATE INDEX idx_mentions_user ON annotation_mentions(mentioned_user_id);
CREATE INDEX idx_mentions_unread ON annotation_mentions(mentioned_user_id, is_read);

-- ============================================
-- 9. Executive Dashboard
-- ============================================

-- 周度摘要
CREATE TABLE weekly_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  week_number INT NOT NULL, -- 如：12（第 12 周）
  year INT NOT NULL,

  -- 关键信号
  signal_1 TEXT NOT NULL,
  signal_2 TEXT,
  signal_3 TEXT,

  -- 建议行动项
  action_items TEXT,

  -- 下周预期事件
  upcoming_events TEXT,

  -- KPI 数据（自动聚合）
  new_models_count INT DEFAULT 0,
  funding_events_count INT DEFAULT 0,
  price_war_index VARCHAR, -- 'low', 'medium', 'high'
  data_freshness_score FLOAT DEFAULT 0.0 CHECK (data_freshness_score >= 0 AND data_freshness_score <= 1),

  created_by UUID NOT NULL REFERENCES profiles(id),
  published_at TIMESTAMP, -- NULL 表示草稿

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT unique_week UNIQUE (week_number, year)
);

CREATE INDEX idx_weekly_summaries_date ON weekly_summaries(year DESC, week_number DESC);
CREATE INDEX idx_weekly_summaries_published ON weekly_summaries(published_at DESC);

-- ============================================
-- 10. Alert 系统
-- ============================================

-- Alert 规则配置
CREATE TABLE alert_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR NOT NULL,
  description TEXT,

  -- 触发条件
  trigger_type VARCHAR NOT NULL, -- 'model.created', 'company.funding', 'price.changed', 'benchmark.changed'
  condition_expr TEXT NOT NULL, -- 条件表达式（如：amount > 500000000）
  priority alert_priority DEFAULT 'medium',

  -- 推送渠道
  channels alert_channel[] DEFAULT ARRAY['email', 'wechat']::alert_channel[],

  -- 目标受众
  target_roles user_role[] DEFAULT ARRAY['admin', 'tech', 'exec']::user_role[],

  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id),

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Alert 触发记录
CREATE TABLE alert_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id UUID REFERENCES alert_rules(id) ON DELETE SET NULL,

  -- 触发数据
  trigger_type VARCHAR NOT NULL,
  trigger_data JSONB NOT NULL, -- 触发时的完整数据
  priority alert_priority NOT NULL,

  -- 推送状态
  channels_sent alert_channel[],
  sent_at TIMESTAMP,
  error_message TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alert_events_date ON alert_events(created_at DESC);
CREATE INDEX idx_alert_events_rule ON alert_events(rule_id);

-- 用户订阅的 Alert
CREATE TABLE alert_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,

  is_enabled BOOLEAN DEFAULT TRUE,
  custom_channels alert_channel[], -- 用户自定义推送渠道（NULL 表示使用规则默认渠道）

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT unique_subscription UNIQUE (user_id, rule_id)
);

CREATE INDEX idx_subscriptions_user ON alert_subscriptions(user_id);

-- ============================================
-- 11. 数据健康度监控
-- ============================================

-- 数据源健康度
CREATE TABLE data_source_health (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_name VARCHAR NOT NULL, -- 如：HuggingFace, OpenRouter, Official

  last_sync_at TIMESTAMP,
  next_sync_at TIMESTAMP,
  sync_status VARCHAR DEFAULT 'pending', -- 'pending', 'running', 'success', 'failed'
  records_updated INT DEFAULT 0,
  error_message TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT unique_source UNIQUE (source_name)
);

-- 爬虫错误日志
CREATE TABLE crawler_errors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_url TEXT NOT NULL,
  source_name VARCHAR NOT NULL,

  error_type VARCHAR NOT NULL, -- 'rate_limit', 'blocked', 'parse_error', 'network_error'
  error_message TEXT,

  retry_count INT DEFAULT 0,
  last_retry_at TIMESTAMP,

  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMP,
  review_notes TEXT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_crawler_errors_source ON crawler_errors(source_name);
CREATE INDEX idx_crawler_errors_reviewed ON crawler_errors(reviewed_at);

-- ============================================
-- 12. 榜单数据（用于 Leaderboard）
-- ============================================

CREATE TABLE leaderboard_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  leaderboard_name VARCHAR NOT NULL, -- 'epoch_ai', 'artificial_analysis', etc.
  model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,

  rank_position INT NOT NULL,
  score FLOAT NOT NULL,

  recorded_at DATE NOT NULL, -- 记录日期（支持历史追踪）

  source benchmark_source NOT NULL,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT unique_leaderboard_entry UNIQUE (leaderboard_name, model_id, recorded_at)
);

CREATE INDEX idx_leaderboard_name ON leaderboard_entries(leaderboard_name);
CREATE INDEX idx_leaderboard_rank ON leaderboard_entries(rank_position);
CREATE INDEX idx_leaderboard_date ON leaderboard_entries(recorded_at DESC);

-- ============================================
-- 13. 视图：常用查询优化
-- ============================================

-- 最新价格视图
CREATE VIEW latest_prices AS
SELECT DISTINCT ON (model_id)
  model_id,
  input_price_per_million,
  output_price_per_million,
  effective_from,
  source
FROM price_history
ORDER BY model_id, effective_from DESC;

-- 最新 Benchmark 视图
CREATE VIEW latest_benchmarks AS
SELECT DISTINCT ON (model_id, benchmark_id)
  model_id,
  benchmark_id,
  score,
  source,
  tested_at
FROM model_benchmarks
ORDER BY model_id, benchmark_id, tested_at DESC;

-- 数据健康度统计视图
CREATE VIEW data_health_stats AS
SELECT
  'models' AS table_name,
  COUNT(*) AS total_records,
  COUNT(*) FILTER (WHERE verified_at IS NOT NULL) AS verified_records,
  COUNT(*) FILTER (WHERE updated_at > CURRENT_TIMESTAMP - INTERVAL '7 days') AS updated_last_week,
  ROUND(AVG(confidence_score)::numeric, 2) AS avg_confidence
FROM models

UNION ALL

SELECT
  'benchmarks' AS table_name,
  COUNT(*) AS total_records,
  COUNT(*) FILTER (WHERE verified_at IS NOT NULL) AS verified_records,
  COUNT(*) FILTER (WHERE tested_at > CURRENT_DATE - INTERVAL '30 days') AS updated_last_month,
  ROUND(AVG(confidence_score)::numeric, 2) AS avg_confidence
FROM model_benchmarks;

-- ============================================
-- 14. 触发器：自动更新时间戳
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 为所有需要的表添加触发器
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_models_updated_at BEFORE UPDATE ON models
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_annotations_updated_at BEFORE UPDATE ON annotations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_weekly_summaries_updated_at BEFORE UPDATE ON weekly_summaries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_alert_rules_updated_at BEFORE UPDATE ON alert_rules
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 15. 触发器：版本历史自动记录
-- ============================================

CREATE OR REPLACE FUNCTION record_model_version()
RETURNS TRIGGER AS $$
DECLARE
  old_values JSONB;
  new_values JSONB;
  changed_fields JSONB;
BEGIN
  -- 只在 UPDATE 时触发
  IF TG_OP = 'UPDATE' THEN
    old_values := to_jsonb(OLD);
    new_values := to_jsonb(NEW);

    -- 找出变更的字段
    changed_fields := '{}'::JSONB;

    -- 检查每个字段
    IF OLD.name != NEW.name THEN
      changed_fields := jsonb_set(changed_fields, '{name}', jsonb_build_object('old', OLD.name, 'new', NEW.name));
    END IF;

    IF OLD.params != NEW.params THEN
      changed_fields := jsonb_set(changed_fields, '{params}', jsonb_build_object('old', OLD.params, 'new', NEW.params));
    END IF;

    IF OLD.context_window != NEW.context_window THEN
      changed_fields := jsonb_set(changed_fields, '{context_window}', jsonb_build_object('old', OLD.context_window, 'new', NEW.context_window));
    END IF;

    IF OLD.license != NEW.license THEN
      changed_fields := jsonb_set(changed_fields, '{license}', jsonb_build_object('old', OLD.license, 'new', NEW.license));
    END IF;

    -- 如果有变更，插入版本记录
    IF changed_fields != '{}'::JSONB THEN
      INSERT INTO model_versions (model_id, version_number, changed_fields, changed_by)
      VALUES (
        NEW.id,
        COALESCE(
          (SELECT MAX(version_number) + 1 FROM model_versions WHERE model_id = NEW.id),
          1
        ),
        changed_fields,
        NEW.verified_by
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER record_model_version_trigger AFTER UPDATE ON models
    FOR EACH ROW EXECUTE FUNCTION record_model_version();

-- ============================================
-- 16. Row-Level Security (RLS) 策略
-- ============================================

-- 启用 RLS
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE models ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE funding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;

-- 公共读策略（所有用户可读）
CREATE POLICY "Public read access" ON companies FOR SELECT
  USING (true);

CREATE POLICY "Public read access" ON models FOR SELECT
  USING (archived_at IS NULL); -- 只读未归档的模型

CREATE POLICY "Public read access" ON model_benchmarks FOR SELECT
  USING (true);

CREATE POLICY "Public read access" ON price_history FOR SELECT
  USING (true);

CREATE POLICY "Public read access" ON funding_events FOR SELECT
  USING (true);

-- 管理员写策略
CREATE POLICY "Admin write access" ON companies FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Admin write access" ON models FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- 批注策略
CREATE POLICY "Users can create annotations" ON annotations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read public annotations" ON annotations FOR SELECT
  USING (
    visibility = 'public' OR
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Users can update own annotations" ON annotations FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Executive Dashboard 策略
CREATE POLICY "All can read published summaries" ON weekly_summaries FOR SELECT
  USING (published_at IS NOT NULL);

CREATE POLICY "Admin can manage summaries" ON weekly_summaries FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- ============================================
-- 17. 注释和文档
-- ============================================

COMMENT ON TABLE companies IS 'AI 公司信息，包含基础信息、估值、商业模式等';
COMMENT ON TABLE models IS 'AI 模型信息，包含技术参数、许可证、发布日期等';
COMMENT ON TABLE model_versions IS '模型版本历史，记录每次字段变更';
COMMENT ON TABLE model_benchmarks IS '模型 Benchmark 数据，支持历史追踪';
COMMENT ON TABLE price_history IS '模型价格历史，追踪 API 价格变化';
COMMENT ON TABLE funding_events IS '公司融资历史';
COMMENT ON TABLE profiles IS '用户档案，与 Supabase Auth 集成';
COMMENT ON TABLE annotations IS '内部批注，绑定在模型或公司上的评论';
COMMENT ON TABLE weekly_summaries IS 'Executive Dashboard 周度摘要';
COMMENT ON TABLE alert_rules IS 'Alert 规则配置';
COMMENT ON TABLE alert_events IS 'Alert 触发记录';

-- ============================================
-- 18. 初始化数据
-- ============================================

-- 插入默认 Alert 规则
INSERT INTO alert_rules (name, description, trigger_type, condition_expr, priority, channels, target_roles) VALUES
('新模型发布', '当有新模型发布时触发', 'model.created', 'true', 'high', ARRAY['email', 'wechat']::alert_channel[], ARRAY['admin', 'tech', 'exec']::user_role[]),
('大额融资', '融资金额超过 $500M 时触发', 'company.funding', 'amount > 500000000', 'high', ARRAY['email', 'wechat']::alert_channel[], ARRAY['admin', 'exec']::user_role[]),
('价格变动', 'API 价格变动超过 10% 时触发', 'price.changed', 'abs(change_percent) > 10', 'medium', ARRAY['email']::alert_channel[], ARRAY['admin', 'tech']::user_role[]),
('榜单排名变化', '榜单排名变化超过 2 位时触发', 'benchmark.changed', 'rank_change > 2', 'medium', ARRAY['email']::alert_channel[], ARRAY['admin', 'tech']::user_role[]);

-- ============================================
-- Schema 设计完成
-- ============================================
-- 总计 18 个核心表 + 3 个视图 + 7 个触发器 + RLS 策略
-- 支持的功能：
-- 1. 数据版本管理和变更追踪
-- 2. 数据源追溯和可信度评分
-- 3. 历史价格和 Benchmark 追踪
-- 4. 多角色权限控制
-- 5. Alert 规则引擎
-- 6. Executive Dashboard
-- 7. 内部批注和@提及
-- 8. 数据健康度监控
-- ============================================
