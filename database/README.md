# ModelTrack 数据库 Schema

完整的 AI 模型情报追踪系统数据库设计，支持数据版本管理、来源追溯和多角色权限控制。

## 📁 文件结构

```
/Users/yuyang/ModelTrack/database/
├── schema.sql                    # 完整的 SQL Schema（可直接执行）
├── SCHEMA_DOCUMENTATION.md       # 详细的 Schema 文档
└── README.md                     # 本文件
```

## 🚀 快速开始

### 前置要求

- PostgreSQL 14+ （推荐使用 Supabase）
- `uuid-ossp` 扩展（用于生成 UUID）
- `pg_trgm` 扩展（用于模糊搜索）

### 执行 Schema

#### 方法 1：使用 Supabase（推荐）

1. 创建 Supabase 项目
2. 进入 SQL Editor
3. 复制 `schema.sql` 的内容
4. 点击 Run

#### 方法 2：使用本地 PostgreSQL

```bash
# 连接到数据库
psql -U your_username -d your_database

# 执行 Schema 文件
\i schema.sql
```

### 验证安装

```sql
-- 检查表是否创建成功
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
ORDER BY table_name;

-- 应该看到 18 个核心表：
-- companies, models, model_versions, model_benchmarks, benchmarks,
-- price_history, funding_events, profiles, company_watchlists,
-- annotations, annotation_mentions, weekly_summaries,
-- alert_rules, alert_events, alert_subscriptions,
-- data_source_health, crawler_errors, leaderboard_entries

-- 检查预置数据
SELECT * FROM benchmarks;  -- 应该有 11 条记录
SELECT * FROM alert_rules; -- 应该有 4 条预置规则
```

## 📊 核心功能

### 1. 数据版本管理

所有核心表的变更都会自动记录版本历史：

```sql
-- 查询模型的变更历史
SELECT
  mv.changed_fields,
  mv.changed_at,
  p.full_name AS changed_by
FROM model_versions mv
JOIN profiles p ON mv.changed_by = p.id
WHERE mv.model_id = 'model-uuid'
ORDER BY mv.version_number DESC;
```

### 2. 数据源追溯

每条数据都有明确的来源和可信度评分：

```sql
-- 查询未验证的模型
SELECT name, data_source, source_url, confidence_score
FROM models
WHERE verified_at IS NULL
ORDER BY confidence_score;

-- 标记为已验证
UPDATE models
SET
  verified_by = 'admin-uuid',
  verified_at = CURRENT_TIMESTAMP,
  confidence_score = 1.0
WHERE id = 'model-uuid';
```

### 3. 历史趋势查询

支持查询 Benchmark 和价格的历史变化：

```sql
-- 查询 SWE-bench 排名变化
SELECT
  m.name,
  lb.tested_at,
  lb.score,
  RANK() OVER (PARTITION BY lb.tested_at ORDER BY lb.score DESC) AS rank
FROM latest_benchmarks lb
JOIN models m ON lb.model_id = m.id
WHERE lb.benchmark_id = (SELECT id FROM benchmarks WHERE name = 'SWE-bench')
ORDER BY m.name, lb.tested_at;

-- 查询价格下降趋势
SELECT
  m.name,
  ph.effective_from,
  ph.input_price_per_million,
  LAG(ph.input_price_per_million) OVER (PARTITION BY ph.model_id ORDER BY ph.effective_from) AS previous_price
FROM price_history ph
JOIN models m ON ph.model_id = m.id
WHERE ph.model_id = 'model-uuid'
ORDER BY ph.effective_from DESC;
```

### 4. Alert 规则引擎

支持自定义 Alert 规则：

```sql
-- 创建自定义 Alert
INSERT INTO alert_rules (
  name, trigger_type, condition_expr, priority, channels, target_roles
) VALUES (
  '关注模型价格变动',
  'price.changed',
  'model_id IN (SELECT model_id FROM user_watchlists WHERE user_id = current_user)',
  'medium',
  ARRAY['email'],
  ARRAY['tech']
);

-- 查询触发的 Alert
SELECT
  ae.trigger_type,
  ae.trigger_data,
  ae.priority,
  ae.sent_at
FROM alert_events ae
ORDER BY ae.created_at DESC
LIMIT 10;
```

### 5. Executive Dashboard

周度摘要和 KPI 聚合：

```sql
-- 创建本周摘要（草稿）
INSERT INTO weekly_summaries (
  week_number, year, signal_1, signal_2, signal_3, action_items, created_by
) VALUES (
  EXTRACT(WEEK FROM CURRENT_DATE),
  EXTRACT(YEAR FROM CURRENT_DATE),
  'MiniMax M2.7 发布：首个参与自身训练的商用模型',
  'Anthropic 企业市场份额升至 40%，首次超越 OpenAI',
  'Wayve 完成 $1.2B D 轮融资',
  '技术团队评估 MiniMax M2.7 替代方案',
  'admin-uuid'
);

-- 发布摘要
UPDATE weekly_summaries
SET published_at = CURRENT_TIMESTAMP
WHERE week_number = 12 AND year = 2026;

-- 查询 KPI 数据
SELECT * FROM data_health_stats;
```

### 6. 内部批注系统

支持 @提及 和权限控制：

```sql
-- 创建批注
INSERT INTO annotations (model_id, user_id, content, visibility)
VALUES (
  'model-uuid',
  'user-uuid',
  'M2.7 自我进化训练这个点很特殊，建议评估 coding benchmark。@tech-lead',
  'public'
);

-- 查询未读的 @提及
SELECT
  a.content,
  m.name AS model_name,
  p.full_name AS mentioned_by,
  am.created_at
FROM annotation_mentions am
JOIN annotations a ON am.annotation_id = a.id
JOIN profiles p ON a.user_id = p.id
LEFT JOIN models m ON a.model_id = m.id
WHERE am.mentioned_user_id = 'current-user-uuid'
  AND am.is_read = FALSE;
```

## 🗂️ 表关系图

```
companies
  ├─ models
  │   ├─ model_versions (追踪变更)
  │   ├─ model_benchmarks (历史 Benchmark)
  │   ├─ price_history (历史价格)
  │   └─ annotations (批注)
  ├─ funding_events (融资历史)
  └─ company_watchlists (用户订阅)

profiles (用户档案)
  ├─ company_watchlists
  ├─ annotations
  │   └─ annotation_mentions (@提及)
  ├─ alert_subscriptions (Alert 订阅)
  └─ weekly_summaries (创建摘要)

alert_rules (Alert 规则)
  ├─ alert_events (触发记录)
  └─ alert_subscriptions

benchmarks (Benchmark 定义)
  └─ model_benchmarks

leaderboard_entries (榜单数据)

data_source_health (数据源健康度)
crawler_errors (爬虫错误日志)
```

## 📝 常用查询示例

### 价格计算器查询

```sql
-- 查询价格最低的 Top-5 代码模型
SELECT
  m.name,
  c.name AS company,
  lp.input_price_per_million AS input_price,
  lp.output_price_per_million AS output_price,
  mb.score AS swe_bench_score
FROM models m
JOIN companies c ON m.company_id = c.id
JOIN latest_prices lp ON m.id = lp.model_id
LEFT JOIN latest_benchmarks mb ON m.id = mb.model_id AND mb.benchmark_name = 'SWE-bench'
WHERE m.category = 'code'
  AND lp.input_price_per_million > 0
ORDER BY lp.input_price_per_million ASC
LIMIT 5;
```

### 基座选型器查询

```sql
-- 根据条件筛选模型（示例：代码能力强、开源、价格 < $1/M）
SELECT
  m.name,
  c.name AS company,
  m.license,
  lp.input_price_per_million,
  mb.score AS swe_bench_score
FROM models m
JOIN companies c ON m.company_id = c.id
JOIN latest_prices lp ON m.id = lp.model_id
JOIN latest_benchmarks mb ON m.id = mb.model_id AND mb.benchmark_name = 'SWE-bench'
WHERE m.category IN ('code', 'general')
  AND m.license IN ('open', 'partial')
  AND lp.input_price_per_million < 1.0
  AND mb.score > 75
ORDER BY mb.score DESC;
```

### 公司分析查询

```sql
-- 查询某公司的完整信息
SELECT
  c.name,
  c.valuation,
  c.business_model,
  c.moat,
  json_agg(
    json_build_object(
      'name', m.name,
      'category', m.category,
      'release_date', m.release_date
    )
  ) AS models,
  (
    SELECT json_agg(
      json_build_object(
        'round', round_name,
        'amount', amount_formatted,
        'date', funding_date
      )
    )
    FROM funding_events
    WHERE company_id = c.id
    ORDER BY funding_date DESC
  ) AS funding_history
FROM companies c
LEFT JOIN models m ON c.id = m.company_id
WHERE c.name = 'MiniMax'
GROUP BY c.id;
```

### Leaderboard 查询

```sql
-- 查询某榜单的最新排名
SELECT
  m.name,
  c.name AS company,
  le.rank_position,
  le.score,
  le.recorded_at
FROM leaderboard_entries le
JOIN models m ON le.model_id = m.id
JOIN companies c ON m.company_id = c.id
WHERE le.leaderboard_name = 'epoch_ai'
  AND le.recorded_at = (SELECT MAX(recorded_at) FROM leaderboard_entries WHERE leaderboard_name = 'epoch_ai')
ORDER BY le.rank_position
LIMIT 10;
```

## 🔐 权限模型

### RLS 策略概览

| 表 | 读权限 | 写权限 |
|----|--------|--------|
| companies | 所有人 | 仅管理员 |
| models | 所有人（未归档） | 仅管理员 |
| model_benchmarks | 所有人 | 仅管理员 |
| price_history | 所有人 | 仅管理员 |
| funding_events | 所有人 | 仅管理员 |
| annotations | 公共/团队/私有 | 作者 + 管理员 |
| weekly_summaries | 已发布 → 所有人 | 仅管理员 |
| alert_rules | 所有人 | 仅管理员 |
| alert_subscriptions | 所有人 | 自己 |

### 角色权限矩阵

| 角色 | 模型数据 | Executive Dashboard | 批注 | Alert | 公司关注 |
|------|----------|---------------------|------|-------|---------|
| admin（信息官） | 读写 | 读写 | 读写 + 置顶 | 配置规则 | 读写 |
| tech（技术负责人） | 只读 | 只读（已发布） | 读写 | 订阅 | 读写 |
| exec（高管） | 只读 | 只读（已发布） | 只读（公共） | 订阅 | 只读 |

## 📈 性能优化

### 索引策略

已创建的索引：

1. **外键索引**：所有 `*_id` 字段
2. **常用查询字段**：`category`, `license`, `release_date`, `region`, `type`
3. **排序字段**：`valuation_amount`, `score`, `created_at`, `tested_at`
4. **复合索引**：根据实际查询模式调整

### 分区建议

当数据量增长到百万级时，考虑对以下表进行分区：

```sql
-- 按 tested_at 年份分区
CREATE TABLE model_benchmarks_2026 PARTITION OF model_benchmarks
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');

-- 按 effective_from 年份分区
CREATE TABLE price_history_2026 PARTITION OF price_history
  FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
```

### 缓存策略

建议使用 Redis 缓存以下数据：

| 数据 | 缓存时间 | 缓存键 |
|------|----------|--------|
| latest_prices | 1 小时 | `prices:latest` |
| latest_benchmarks | 1 小时 | `benchmarks:latest` |
| data_health_stats | 15 分钟 | `stats:health` |
| Executive Dashboard 摘要 | 到下次发布 | `summary:week:{week_number}` |

## 🔧 数据迁移

### 从 modeltrack_v3.html 迁移

详见 `SCHEMA_DOCUMENTATION.md` 中的"迁移和数据初始化"章节。

### 数据验证脚本

```sql
-- 检查数据完整性
DO $$
DECLARE
  model_count INT;
  benchmark_count INT;
  price_count INT;
BEGIN
  SELECT COUNT(*) INTO model_count FROM models WHERE archived_at IS NULL;
  SELECT COUNT(*) INTO benchmark_count FROM model_benchmarks;
  SELECT COUNT(*) INTO price_count FROM price_history;

  RAISE NOTICE 'Models: %', model_count;
  RAISE NOTICE 'Benchmarks: %', benchmark_count;
  RAISE NOTICE 'Prices: %', price_count;

  IF model_count < 100 THEN
    RAISE EXCEPTION 'Expected at least 100 models, found %', model_count;
  END IF;
END $$;
```

## 📚 相关文档

- [Schema 详细文档](./SCHEMA_DOCUMENTATION.md) - 每个表的详细说明和查询示例
- [API 设计文档](../docs/API_DESIGN.md) - Next.js API Routes 设计（待创建）
- [爬虫设计文档](../docs/CRAWLER_DESIGN.md) - Python 爬虫实现细节（待创建）

## 🤝 贡献指南

### Schema 变更流程

1. 创建新的迁移文件：`migrations/YYYYMMDD_description.sql`
2. 在开发环境测试
3. 更新 `SCHEMA_DOCUMENTATION.md`
4. 提交 Pull Request

### 迁移文件命名规范

```
migrations/
├── 20260324_initial_schema.sql           # 初始 Schema
├── 20260325_add_team_support.sql         # 添加团队表
├── 20260326_add_export_history.sql       # 添加导出记录
└── ...
```

## 📝 更新日志

### v1.0 (2026-03-24)
- ✅ 初始 Schema 设计
- ✅ 18 个核心表
- ✅ 数据版本管理
- ✅ 来源追溯
- ✅ RLS 权限控制
- ✅ 预置 Benchmark 数据
- ✅ 预置 Alert 规则

## 📧 联系方式

如有问题，请联系：
- Schema 设计：Claude (Sonnet 4.5)
- 项目负责人：[您的名字]

---

**最后更新**: 2026-03-24
**版本**: v1.0
**数据库兼容性**: PostgreSQL 14+, Supabase
