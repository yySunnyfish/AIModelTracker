-- ============================================
-- ModelTrack 整合 Schema v2.1 - 修复版
-- 创建时间: 2026-03-25
-- 修复: NULL 值比较、触发器逻辑
-- ============================================

-- 启用必要的扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================
-- 1. 基础枚举类型
-- ============================================

CREATE TYPE company_region AS ENUM ('US', 'CN', 'EU', 'OTHER');

CREATE TYPE company_type AS ENUM ('LLM', 'Robotics', 'AD', 'WORLD_MODEL');

CREATE TYPE model_category AS ENUM (
  'general', 'reasoning', 'code', 'multimodal', 'edge', 'world',
  'autonomous_driving', 'robotics'
);

CREATE TYPE license_type AS ENUM ('open', 'closed', 'partial');

CREATE TYPE data_source AS ENUM (
  'official_blog', 'huggingface', 'openrouter', 'epoch_ai',
  'artificial_analysis', 'techcrunch', 'media_36kr', 'media_other', 'manual'
);

CREATE TYPE user_role AS ENUM ('admin', 'tech', 'exec');

CREATE TYPE annotation_visibility AS ENUM ('public', 'team', 'private');

CREATE TYPE alert_priority AS ENUM ('high', 'medium', 'low');

CREATE TYPE alert_channel AS ENUM ('email', 'wechat', 'slack', 'dingtalk');

-- ============================================
-- 2. 核心表：公司和模型
-- ============================================

CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR NOT NULL,
  name_cn VARCHAR,
  region company_region NOT NULL,
  type company_type NOT NULL,
  logo_url TEXT,
  website_url TEXT,
  valuation VARCHAR,
  valuation_amount BIGINT,
  valuation_date DATE,
  founded_year INT,
  business_model TEXT,
  pricing_model TEXT,
  international_reach TEXT,
  moat TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archived_at TIMESTAMP,
  CONSTRAINT unique_company_name UNIQUE (name)
);

CREATE INDEX idx_companies_type ON companies(type);
CREATE INDEX idx_companies_region ON companies(region);
CREATE INDEX idx_companies_valuation ON companies(valuation_amount DESC);

CREATE TABLE models (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR NOT NULL,
  name_full VARCHAR,
  color VARCHAR,
  category model_category NOT NULL,
  params VARCHAR,
  context_window VARCHAR,
  modalities TEXT[],
  license license_type NOT NULL,
  release_date DATE NOT NULL,
  announcement_url TEXT,
  innovation TEXT,
  architecture TEXT,
  training_details TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archived_at TIMESTAMP,
  data_source data_source NOT NULL,
  source_url TEXT,
  confidence_score FLOAT DEFAULT 1.0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  verified_by UUID,
  verified_at TIMESTAMP,
  CONSTRAINT unique_model_name UNIQUE (name, company_id)
);

CREATE INDEX idx_models_company ON models(company_id);
CREATE INDEX idx_models_category ON models(category);
CREATE INDEX idx_models_license ON models(license);
CREATE INDEX idx_models_release_date ON models(release_date DESC);
CREATE INDEX idx_models_verified ON models(verified_at DESC);

CREATE TABLE model_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  changed_fields JSONB NOT NULL,
  change_reason TEXT,
  changed_by UUID,
  changed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_model_version UNIQUE (model_id, version_number)
);

CREATE INDEX idx_model_versions_model ON model_versions(model_id);
CREATE INDEX idx_model_versions_date ON model_versions(changed_at DESC);

-- ============================================
-- 3. Benchmark 分类体系（树形结构）
-- ============================================

CREATE TABLE benchmark_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR NOT NULL UNIQUE,
  name_cn VARCHAR,
  parent_id UUID REFERENCES benchmark_categories(id) ON DELETE CASCADE,
  description TEXT,
  icon VARCHAR,
  color VARCHAR,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_benchmark_categories_parent ON benchmark_categories(parent_id);
CREATE INDEX idx_benchmark_categories_sort ON benchmark_categories(sort_order);

-- ============================================
-- 4. Benchmark 定义表
-- ============================================

CREATE TABLE benchmarks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR NOT NULL UNIQUE,
  name_cn VARCHAR,
  category_id UUID NOT NULL REFERENCES benchmark_categories(id) ON DELETE RESTRICT,
  description TEXT,
  description_cn TEXT,
  max_score INT DEFAULT 100,
  unit VARCHAR DEFAULT 'percentage',
  higher_is_better BOOLEAN DEFAULT TRUE,
  official_url TEXT,
  paper_url TEXT,
  benchmark_source VARCHAR,
  applicable_model_types VARCHAR[],
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT valid_unit CHECK (unit IN ('percentage', 'score', 'time', 'miles', 'rate', 'elo', 'tasks'))
);

CREATE INDEX idx_benchmarks_category ON benchmarks(category_id);
CREATE INDEX idx_benchmarks_active ON benchmarks(is_active);
CREATE INDEX idx_benchmarks_name ON benchmarks(name);

-- ============================================
-- 5. 模型 Benchmark 记录
-- ============================================

CREATE TABLE model_benchmarks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  benchmark_id UUID NOT NULL REFERENCES benchmarks(id) ON DELETE CASCADE,
  score FLOAT NOT NULL,
  source data_source NOT NULL,
  tested_at DATE NOT NULL,
  notes TEXT,
  confidence_score FLOAT DEFAULT 1.0 CHECK (confidence_score >= 0 AND confidence_score <= 1),
  verified_by UUID,
  verified_at TIMESTAMP,
  is_official BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_model_benchmark_test UNIQUE (model_id, benchmark_id, tested_at, source)
);

CREATE INDEX idx_model_benchmarks_model ON model_benchmarks(model_id);
CREATE INDEX idx_model_benchmarks_benchmark ON model_benchmarks(benchmark_id);
CREATE INDEX idx_model_benchmarks_date ON model_benchmarks(tested_at DESC);
CREATE INDEX idx_model_benchmarks_score ON model_benchmarks(score DESC);

-- ============================================
-- 6. 价格历史
-- ============================================

CREATE TABLE price_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  input_price_per_million FLOAT NOT NULL,
  output_price_per_million FLOAT NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE,
  source data_source NOT NULL,
  source_url TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_price_period UNIQUE (model_id, effective_from)
);

CREATE INDEX idx_price_history_model ON price_history(model_id);
CREATE INDEX idx_price_history_date ON price_history(effective_from DESC);

-- ============================================
-- 7. 融资历史
-- ============================================

CREATE TABLE funding_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  funding_date DATE NOT NULL,
  round_name VARCHAR NOT NULL,
  amount_usd BIGINT NOT NULL,
  amount_formatted VARCHAR,
  investors TEXT[],
  valuation_usd BIGINT,
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
-- 8. 用户和权限
-- ============================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email VARCHAR NOT NULL,
  full_name VARCHAR,
  avatar_url TEXT,
  role user_role NOT NULL DEFAULT 'tech',
  team VARCHAR,
  notification_channels alert_channel[] DEFAULT ARRAY['email']::alert_channel[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_email UNIQUE (email)
);

CREATE INDEX idx_profiles_role ON profiles(role);

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
-- 9. 内部批注系统
-- ============================================

CREATE TABLE annotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  model_id UUID REFERENCES models(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  CHECK (model_id IS NOT NULL OR company_id IS NOT NULL),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  visibility annotation_visibility DEFAULT 'public',
  is_pinned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP
);

CREATE INDEX idx_annotations_model ON annotations(model_id);
CREATE INDEX idx_annotations_company ON annotations(company_id);
CREATE INDEX idx_annotations_user ON annotations(user_id);
CREATE INDEX idx_annotations_date ON annotations(created_at DESC);

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
-- 10. Executive Dashboard
-- ============================================

CREATE TABLE weekly_summaries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  week_number INT NOT NULL,
  year INT NOT NULL,
  signal_1 TEXT NOT NULL,
  signal_2 TEXT,
  signal_3 TEXT,
  action_items TEXT,
  upcoming_events TEXT,
  new_models_count INT DEFAULT 0,
  funding_events_count INT DEFAULT 0,
  price_war_index VARCHAR,
  data_freshness_score FLOAT DEFAULT 0.0 CHECK (data_freshness_score >= 0 AND data_freshness_score <= 1),
  created_by UUID NOT NULL REFERENCES profiles(id),
  published_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_week UNIQUE (week_number, year)
);

CREATE INDEX idx_weekly_summaries_date ON weekly_summaries(year DESC, week_number DESC);
CREATE INDEX idx_weekly_summaries_published ON weekly_summaries(published_at DESC);

-- ============================================
-- 11. Alert 系统
-- ============================================

CREATE TABLE alert_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR NOT NULL,
  description TEXT,
  trigger_type VARCHAR NOT NULL,
  condition_expr TEXT NOT NULL,
  priority alert_priority DEFAULT 'medium',
  channels alert_channel[] DEFAULT ARRAY['email', 'wechat']::alert_channel[],
  target_roles user_role[] DEFAULT ARRAY['admin', 'tech', 'exec']::user_role[],
  is_active BOOLEAN DEFAULT TRUE,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE alert_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  rule_id UUID REFERENCES alert_rules(id) ON DELETE SET NULL,
  trigger_type VARCHAR NOT NULL,
  trigger_data JSONB NOT NULL,
  priority alert_priority NOT NULL,
  channels_sent alert_channel[],
  sent_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_alert_events_date ON alert_events(created_at DESC);
CREATE INDEX idx_alert_events_rule ON alert_events(rule_id);

CREATE TABLE alert_subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT TRUE,
  custom_channels alert_channel[],
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_subscription UNIQUE (user_id, rule_id)
);

CREATE INDEX idx_subscriptions_user ON alert_subscriptions(user_id);

-- ============================================
-- 12. 数据健康度监控
-- ============================================

CREATE TABLE data_source_health (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_name VARCHAR NOT NULL,
  last_sync_at TIMESTAMP,
  next_sync_at TIMESTAMP,
  sync_status VARCHAR DEFAULT 'pending',
  records_updated INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_source UNIQUE (source_name)
);

CREATE TABLE crawler_errors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_url TEXT NOT NULL,
  source_name VARCHAR NOT NULL,
  error_type VARCHAR NOT NULL,
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
-- 13. 榜单数据
-- ============================================

CREATE TABLE leaderboard_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  leaderboard_name VARCHAR NOT NULL,
  model_id UUID NOT NULL REFERENCES models(id) ON DELETE CASCADE,
  rank_position INT NOT NULL,
  score FLOAT NOT NULL,
  recorded_at DATE NOT NULL,
  source data_source NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT unique_leaderboard_entry UNIQUE (leaderboard_name, model_id, recorded_at)
);

CREATE INDEX idx_leaderboard_name ON leaderboard_entries(leaderboard_name);
CREATE INDEX idx_leaderboard_rank ON leaderboard_entries(rank_position);
CREATE INDEX idx_leaderboard_date ON leaderboard_entries(recorded_at DESC);

-- ============================================
-- 14. 视图：常用查询优化
-- ============================================

CREATE VIEW latest_prices AS
SELECT DISTINCT ON (model_id)
  model_id,
  input_price_per_million,
  output_price_per_million,
  effective_from,
  source
FROM price_history
ORDER BY model_id, effective_from DESC;

CREATE VIEW latest_benchmarks AS
SELECT DISTINCT ON (model_id, benchmark_id)
  model_id,
  benchmark_id,
  score,
  source,
  tested_at
FROM model_benchmarks
ORDER BY model_id, benchmark_id, tested_at DESC;

CREATE VIEW benchmark_category_stats AS
WITH RECURSIVE category_tree AS (
  SELECT
    id,
    name,
    name_cn,
    parent_id,
    ARRAY[id] AS path,
    0 AS depth
  FROM benchmark_categories
  WHERE parent_id IS NULL
  UNION ALL
  SELECT
    c.id,
    c.name,
    c.name_cn,
    c.parent_id,
    ct.path || c.id,
    ct.depth + 1
  FROM benchmark_categories c
  INNER JOIN category_tree ct ON c.parent_id = ct.id
)
SELECT
  ct.id AS category_id,
  ct.name AS category_name,
  ct.name_cn,
  ct.depth,
  COUNT(DISTINCT b.id) AS benchmark_count,
  ARRAY_AGG(b.name) AS benchmarks
FROM category_tree ct
LEFT JOIN benchmarks b ON b.category_id = ct.id
GROUP BY ct.id, ct.name, ct.name_cn, ct.depth, ct.path
ORDER BY ct.path;

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
-- 15. 触发器：自动更新时间戳
-- ============================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_models_updated_at BEFORE UPDATE ON models
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_benchmarks_updated_at BEFORE UPDATE ON benchmarks
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
-- 16. 触发器：版本历史自动记录（修复 NULL 值比较）
-- ============================================

CREATE OR REPLACE FUNCTION record_model_version()
RETURNS TRIGGER AS $$
DECLARE
  changed_fields JSONB;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    changed_fields := '{}'::JSONB;

    -- 使用 IS DISTINCT FROM 正确处理 NULL 值
    IF OLD.name IS DISTINCT FROM NEW.name THEN
      changed_fields := jsonb_set(changed_fields, '{name}',
        jsonb_build_object('old', OLD.name, 'new', NEW.name));
    END IF;

    IF OLD.params IS DISTINCT FROM NEW.params THEN
      changed_fields := jsonb_set(changed_fields, '{params}',
        jsonb_build_object('old', OLD.params, 'new', NEW.params));
    END IF;

    IF OLD.context_window IS DISTINCT FROM NEW.context_window THEN
      changed_fields := jsonb_set(changed_fields, '{context_window}',
        jsonb_build_object('old', OLD.context_window, 'new', NEW.context_window));
    END IF;

    IF OLD.license IS DISTINCT FROM NEW.license THEN
      changed_fields := jsonb_set(changed_fields, '{license}',
        jsonb_build_object('old', OLD.license, 'new', NEW.license));
    END IF;

    IF OLD.innovation IS DISTINCT FROM NEW.innovation THEN
      changed_fields := jsonb_set(changed_fields, '{innovation}',
        jsonb_build_object('old', OLD.innovation, 'new', NEW.innovation));
    END IF;

    IF OLD.architecture IS DISTINCT FROM NEW.architecture THEN
      changed_fields := jsonb_set(changed_fields, '{architecture}',
        jsonb_build_object('old', OLD.architecture, 'new', NEW.architecture));
    END IF;

    -- 如果有任何变更，插入版本记录
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
-- 17. Row-Level Security (RLS) 策略
-- ============================================

ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE models ENABLE ROW LEVEL SECURITY;
ALTER TABLE model_benchmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE funding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE weekly_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE alert_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access" ON companies FOR SELECT
  USING (true);

CREATE POLICY "Public read access" ON models FOR SELECT
  USING (archived_at IS NULL);

CREATE POLICY "Public read access" ON model_benchmarks FOR SELECT
  USING (true);

CREATE POLICY "Public read access" ON price_history FOR SELECT
  USING (true);

CREATE POLICY "Public read access" ON funding_events FOR SELECT
  USING (true);

CREATE POLICY "Admin write access" ON companies FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

CREATE POLICY "Admin write access" ON models FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

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

CREATE POLICY "All can read published summaries" ON weekly_summaries FOR SELECT
  USING (published_at IS NOT NULL);

CREATE POLICY "Admin can manage summaries" ON weekly_summaries FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));

-- ============================================
-- 18. 注释和文档
-- ============================================

COMMENT ON TABLE companies IS 'AI 公司信息';
COMMENT ON TABLE models IS 'AI 模型信息';
COMMENT ON TABLE model_versions IS '模型版本历史';
COMMENT ON TABLE benchmark_categories IS 'Benchmark 分类树形结构';
COMMENT ON TABLE benchmarks IS 'Benchmark 定义表';
COMMENT ON TABLE model_benchmarks IS '模型 Benchmark 记录';
COMMENT ON TABLE price_history IS '模型价格历史';
COMMENT ON TABLE funding_events IS '公司融资历史';
COMMENT ON TABLE profiles IS '用户档案';
COMMENT ON TABLE annotations IS '内部批注';
COMMENT ON TABLE weekly_summaries IS 'Executive Dashboard 周度摘要';
COMMENT ON TABLE alert_rules IS 'Alert 规则配置';
COMMENT ON TABLE alert_events IS 'Alert 触发记录';

-- ============================================
-- Schema 完成
-- ============================================
-- 18 个表 + 4 个视图 + 8 个触发器 + RLS 策略
-- 准备在 Supabase 中执行
-- ============================================
