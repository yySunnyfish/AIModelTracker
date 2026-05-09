# ModelTrack 数据库 Schema 设计文档

## 设计理念

### 核心原则

1. **数据版本管理优先** - 所有核心数据支持历史追踪
2. **来源追溯** - 每条数据都有明确的来源和可信度评分
3. **审计友好** - 记录谁在什么时候做了什么修改
4. **查询性能优化** - 索引和视图优化常用查询

---

## 核心表结构

### 1. 公司和模型（核心实体）

#### `companies` - 公司表
存储 AI 公司的基础信息、估值、商业模式等。

**关键字段**：
- `valuation_amount`: 数字化估值，便于排序和筛选
- `archived_at`: 软删除字段，支持归档不再活跃的公司

**索引策略**：
- 按类型、区域、估值建立索引，支持快速筛选

**示例数据**：
```sql
INSERT INTO companies (name, name_cn, region, type, valuation, valuation_amount)
VALUES
  ('MiniMax', NULL, 'CN', 'LLM', '~HK$2500B', 320000000000),
  ('Figure AI', NULL, 'US', 'Robotics', '$39.5B', 39500000000),
  ('AgiBot', '智元机器人', 'CN', 'Robotics', '¥50B', 7000000000);
```

#### `models` - 模型表
存储 AI 模型的技术参数、发布信息等。

**关键字段**：
- `params`: 参数量（如 "229B-A10B" 表示总参数 229B，激活参数 10B）
- `context_window`: 上下文窗口大小
- `data_source`: 数据来源枚举
- `confidence_score`: 可信度评分（0-1）
- `verified_by/verified_at`: 信息官验证信息

**数据质量保障**：
```sql
-- 查询未验证的模型
SELECT * FROM models WHERE verified_at IS NULL;

-- 查询可信度低于 0.8 的模型
SELECT * FROM models WHERE confidence_score < 0.8;
```

### 2. 版本管理（追踪变更）

#### `model_versions` - 模型版本历史
**设计目的**：记录模型的每次字段变更，支持历史查询。

**示例场景**：
```sql
-- 查询 Claude 的上下文窗口变更历史
SELECT
  mv.changed_fields->'context_window' AS context_change,
  mv.changed_at,
  m.name
FROM model_versions mv
JOIN models m ON mv.model_id = m.id
WHERE m.name LIKE 'Claude%'
  AND mv.changed_fields ? 'context_window'
ORDER BY mv.changed_at DESC;
```

**变更记录格式**：
```json
{
  "context_window": {
    "old": "128K",
    "new": "200K"
  },
  "params": {
    "old": "Undisclosed",
    "new": "~744B-A40B"
  }
}
```

### 3. Benchmark 数据（支持历史趋势）

#### `benchmarks` - Benchmark 定义表
存储各种基准测试的定义信息。

**预置数据**：
- SWE-bench（代码）
- MMLU（推理）
- HumanEval（代码）
- Arena ELO（通用）
- Manipulation/Navigation/Planning（机器人）

#### `model_benchmarks` - 模型 Benchmark 记录
**设计亮点**：
- 支持同一模型在不同测试日期的多条记录
- 记录来源和可信度
- 约束：`(model_id, benchmark_id, tested_at, source)` 唯一

**历史趋势查询**：
```sql
-- 查询 MiniMax M2.7 的 SWE-bench 历史趋势
SELECT
  tested_at,
  score,
  source
FROM model_benchmarks mb
JOIN models m ON mb.model_id = m.id
JOIN benchmarks b ON mb.benchmark_id = b.id
WHERE m.name = 'MiniMax M2.7'
  AND b.name = 'SWE-bench'
ORDER BY tested_at DESC;
```

**约束示例**：
```sql
-- 允许同一天不同来源的分数
INSERT INTO model_benchmarks VALUES (..., '2026-03-24', 'epoch_ai', 82.0);
INSERT INTO model_benchmarks VALUES (..., '2026-03-24', 'artificial_analysis', 81.5); -- OK

-- 不允许同一天同一来源重复
INSERT INTO model_benchmarks VALUES (..., '2026-03-24', 'epoch_ai', 83.0); -- 违反约束
```

### 4. 价格历史（追踪价格战）

#### `price_history` - 价格历史表
**设计目的**：记录 API 价格随时间的变化，支持价格趋势分析。

**关键字段**：
- `effective_from`: 价格生效日期
- `effective_to`: 价格失效日期（NULL 表示当前有效）
- `input_price_per_million`: 输入价格（$/M tokens）
- `output_price_per_million`: 输出价格（$/M tokens）

**价格趋势查询**：
```sql
-- 查询 Claude Opus 4.6 的价格变化趋势
SELECT
  effective_from,
  input_price_per_million,
  output_price_per_million,
  effective_from - LAG(effective_from) OVER (ORDER BY effective_from) AS days_since_last_change
FROM price_history
WHERE model_id = (SELECT id FROM models WHERE name = 'Claude Opus 4.6')
ORDER BY effective_from DESC;
```

**视图：最新价格**：
```sql
SELECT * FROM latest_prices WHERE model_id = '...';
```

### 5. 融资历史

#### `funding_events` - 融资事件表
记录公司的融资历史，支持估值趋势分析。

**示例查询**：
```sql
-- 查询 2025 年融资超过 $500M 的公司
SELECT
  c.name,
  fe.round_name,
  fe.amount_formatted,
  fe.funding_date
FROM funding_events fe
JOIN companies c ON fe.company_id = c.id
WHERE fe.amount_usd > 500000000
  AND fe.funding_date >= '2025-01-01'
ORDER BY fe.amount_usd DESC;
```

### 6. 用户和权限

#### `profiles` - 用户档案
与 Supabase Auth 集成，存储用户角色和通知设置。

**角色权限**：
- `admin`（信息官）：全量管理权限
- `tech`（技术负责人）：读写批注 + 选型器
- `exec`（高管）：只读 Executive Dashboard + Company Analysis

#### `company_watchlists` - 公司关注表
用户可以订阅特定公司的更新。

**示例查询**：
```sql
-- 查询用户关注的公司列表
SELECT c.name, c.valuation, c.type
FROM company_watchlists cw
JOIN companies c ON cw.company_id = c.id
WHERE cw.user_id = 'user-uuid';
```

### 7. 内部批注系统

#### `annotations` - 批注表
绑定在模型或公司上的评论系统。

**关键字段**：
- `visibility`: 可见范围（public/team/private）
- `is_pinned`: 置顶标记（仅信息官可用）
- `deleted_at`: 软删除

**权限策略**：
```sql
-- 公共批注所有人可见
-- 团队批注仅团队成员可见（需补充团队表）
-- 私有批注仅作者和信息官可见
```

#### `annotation_mentions` - 批注提及
记录 @同事 功能。

**未读提及查询**：
```sql
SELECT
  m.id,
  a.content,
  p.full_name AS mentioned_by,
  m.created_at
FROM annotation_mentions m
JOIN annotations a ON m.annotation_id = a.id
JOIN profiles p ON a.user_id = p.id
WHERE m.mentioned_user_id = 'current-user-uuid'
  AND m.is_read = FALSE
ORDER BY m.created_at DESC;
```

### 8. Executive Dashboard

#### `weekly_summaries` - 周度摘要
**关键字段**：
- `signal_1/2/3`: 本周 3 条关键信号
- `action_items`: 建议行动项
- `upcoming_events`: 下周预期事件
- `published_at`: 发布时间（NULL 表示草稿）

**自动聚合 KPI**：
- `new_models_count`: 本月新模型数量
- `funding_events_count`: 本月融资事件数量
- `price_war_index`: 价格战指数（low/medium/high）
- `data_freshness_score`: 数据更新度评分

### 9. Alert 系统

#### `alert_rules` - Alert 规则配置
**预置规则**：
1. 新模型发布（高优先级）
2. 大额融资 > $500M（高优先级）
3. 价格变动 > 10%（中优先级）
4. 榜单排名变化 > 2 位（中优先级）

**规则配置示例**：
```sql
-- 自定义 Alert 规则
INSERT INTO alert_rules (
  name, trigger_type, condition_expr, priority, channels
) VALUES (
  '关注公司融资',
  'company.funding',
  'company_id IN (SELECT company_id FROM company_watchlists WHERE user_id = current_user)',
  'high',
  ARRAY['email', 'wechat']
);
```

#### `alert_events` - Alert 触发记录
记录每次 Alert 的触发和推送状态。

**查询未推送的 Alert**：
```sql
SELECT * FROM alert_events
WHERE sent_at IS NULL
ORDER BY created_at;
```

### 10. 数据健康度监控

#### `data_source_health` - 数据源健康度
记录每个数据源的同步状态。

**关键字段**：
- `last_sync_at`: 最后同步时间
- `sync_status`: 同步状态（pending/running/success/failed）
- `records_updated`: 更新的记录数

#### `crawler_errors` - 爬虫错误日志
记录爬虫失败情况，供信息官审核。

**查询未审核的错误**：
```sql
SELECT * FROM crawler_errors
WHERE reviewed_at IS NULL
ORDER BY created_at DESC;
```

---

## 视图

### `latest_prices` - 最新价格视图
自动获取每个模型的当前有效价格。

**使用示例**：
```sql
SELECT
  m.name,
  lp.input_price_per_million,
  lp.output_price_per_million
FROM models m
JOIN latest_prices lp ON m.id = lp.model_id
WHERE m.category = 'code'
ORDER BY lp.input_price_per_million;
```

### `latest_benchmarks` - 最新 Benchmark 视图
自动获取每个模型的最新 Benchmark 分数。

**使用示例**：
```sql
SELECT
  m.name,
  lb.score AS swe_bench_score,
  b.name AS benchmark_name
FROM models m
JOIN latest_benchmarks lb ON m.id = lb.model_id
JOIN benchmarks b ON lb.benchmark_id = b.id
WHERE b.name = 'SWE-bench'
ORDER BY lb.score DESC
LIMIT 10;
```

### `data_health_stats` - 数据健康度统计
聚合各表的数据质量指标。

**查询示例**：
```sql
SELECT * FROM data_health_stats;
-- 输出：
-- table_name   | total_records | verified_records | updated_last_week | avg_confidence
-- models       | 247           | 198              | 12                | 0.89
-- benchmarks   | 1235          | 1100             | 85                | 0.92
```

---

## 触发器

### 1. 自动更新 `updated_at`
为所有需要的表添加 `updated_at` 自动更新触发器。

**受影响的表**：
- companies
- models
- profiles
- annotations
- weekly_summaries
- alert_rules

### 2. 模型版本自动记录
当 `models` 表发生 UPDATE 时，自动记录变更到 `model_versions` 表。

**监控的字段**：
- name
- params
- context_window
- license

**示例**：
```sql
-- 更新模型的上下文窗口
UPDATE models
SET context_window = '200K', verified_by = 'admin-uuid'
WHERE name = 'Claude Opus 4.6';

-- 自动插入版本记录
SELECT * FROM model_versions WHERE model_id = '...';
-- 输出：
-- version_number | changed_fields                                | changed_at
-- 2              | {"context_window": {"old": "128K", "new": "200K"}} | 2026-03-24 10:30:00
```

---

## Row-Level Security (RLS)

### 策略概览

#### 公共读策略
```sql
-- 所有用户可读公司信息
CREATE POLICY "Public read access" ON companies FOR SELECT
  USING (true);

-- 只读未归档的模型
CREATE POLICY "Public read access" ON models FOR SELECT
  USING (archived_at IS NULL);
```

#### 管理员写策略
```sql
-- 只有管理员（信息官）可以修改核心数据
CREATE POLICY "Admin write access" ON models FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));
```

#### 批注权限策略
```sql
-- 用户可以创建批注
CREATE POLICY "Users can create annotations" ON annotations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 用户可以读公共批注或自己的批注
CREATE POLICY "Users can read public annotations" ON annotations FOR SELECT
  USING (
    visibility = 'public' OR
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- 用户只能修改自己的批注
CREATE POLICY "Users can update own annotations" ON annotations FOR UPDATE
  USING (user_id = auth.uid());
```

#### Executive Dashboard 策略
```sql
-- 所有人可以读已发布的摘要
CREATE POLICY "All can read published summaries" ON weekly_summaries FOR SELECT
  USING (published_at IS NOT NULL);

-- 只有管理员可以管理摘要
CREATE POLICY "Admin can manage summaries" ON weekly_summaries FOR ALL
  USING (EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ));
```

---

## 常用查询示例

### 1. 查询模型的完整信息（含最新价格和 Benchmark）
```sql
SELECT
  m.name,
  c.name AS company,
  m.category,
  m.params,
  m.context_window,
  m.license,
  lp.input_price_per_million,
  lp.output_price_per_million,
  jsonb_object_agg(b.name, mb.score) AS benchmarks
FROM models m
JOIN companies c ON m.company_id = c.id
LEFT JOIN latest_prices lp ON m.id = lp.model_id
LEFT JOIN latest_benchmarks mb ON m.id = mb.model_id
LEFT JOIN benchmarks b ON mb.benchmark_id = b.id
WHERE m.name = 'MiniMax M2.7'
GROUP BY m.id, c.name, lp.input_price_per_million, lp.output_price_per_million;
```

### 2. 查询价格最低的 Top-5 代码模型
```sql
SELECT
  m.name,
  lp.input_price_per_million AS input_price,
  lp.output_price_per_million AS output_price,
  mb.score AS swe_bench_score
FROM models m
JOIN latest_prices lp ON m.id = lp.model_id
LEFT JOIN latest_benchmarks mb ON m.id = mb.model_id AND mb.benchmark_name = 'SWE-bench'
WHERE m.category = 'code'
  AND lp.input_price_per_million > 0
ORDER BY lp.input_price_per_million ASC
LIMIT 5;
```

### 3. 查询本月新增模型
```sql
SELECT
  m.name,
  c.name AS company,
  m.release_date,
  m.category
FROM models m
JOIN companies c ON m.company_id = c.id
WHERE m.release_date >= DATE_TRUNC('month', CURRENT_DATE)
ORDER BY m.release_date DESC;
```

### 4. 查询某公司的融资历史
```sql
SELECT
  funding_date,
  round_name,
  amount_formatted,
  valuation_formatted,
  investors
FROM funding_events
WHERE company_id = (SELECT id FROM companies WHERE name = 'Figure AI')
ORDER BY funding_date DESC;
```

### 5. 查询数据健康度报告
```sql
SELECT
  'models' AS metric,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE verified_at IS NOT NULL) AS verified,
  COUNT(*) FILTER (WHERE updated_at > CURRENT_TIMESTAMP - INTERVAL '7 days') AS updated_last_week,
  ROUND(AVG(confidence_score)::numeric, 2) AS avg_confidence
FROM models

UNION ALL

SELECT
  'benchmarks' AS metric,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE verified_at IS NOT NULL) AS verified,
  COUNT(*) FILTER (WHERE tested_at > CURRENT_DATE - INTERVAL '30 days') AS updated_last_month,
  ROUND(AVG(confidence_score)::numeric, 2) AS avg_confidence
FROM model_benchmarks;
```

### 6. 查询某用户未读的 @提及
```sql
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
  AND am.is_read = FALSE
ORDER BY am.created_at DESC;
```

---

## 性能优化建议

### 1. 索引策略
已创建的索引：
- 外键字段索引（所有 `*_id` 字段）
- 常用查询字段索引（`category`, `license`, `release_date`）
- 排序字段索引（`valuation_amount`, `score`, `created_at`）
- 复合索引（根据实际查询模式调整）

### 2. 分区建议
如果数据量增长到百万级，考虑对以下表进行分区：
- `model_benchmarks` - 按 `tested_at` 年份分区
- `price_history` - 按 `effective_from` 年份分区
- `annotation_mentions` - 按 `created_at` 月份分区

### 3. 缓存策略
建议使用 Redis 缓存以下数据：
- `latest_prices` 视图（缓存 1 小时）
- `latest_benchmarks` 视图（缓存 1 小时）
- `data_health_stats` 视图（缓存 15 分钟）
- Executive Dashboard 摘要（缓存到下次发布）

---

## 迁移和数据初始化

### 1. 从 modeltrack_v3.html 迁移数据

**步骤**：
1. 提取静态数据为 JSON
2. 编写迁移脚本插入数据库
3. 验证数据完整性

**示例迁移脚本**（Python）：
```python
import json
import psycopg2
from datetime import datetime

# 连接数据库
conn = psycopg2.connect("postgresql://...")
cur = conn.cursor()

# 读取 HTML 中的 LLM 数据
with open('modeltrack_v3.html', 'r') as f:
    # 提取 LLM 数组（需要解析 HTML 或手动提取）
    llm_data = [...]  # 从 JavaScript 中提取

# 插入公司数据
for model in llm_data:
    cur.execute("""
        INSERT INTO companies (name, region, type, valuation)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (name) DO UPDATE SET valuation = EXCLUDED.valuation
    """, (model['co'], model['region'], 'LLM', model.get('valuation')))

    # 插入模型数据
    cur.execute("""
        INSERT INTO models (company_id, name, category, params, context_window, license, release_date, data_source)
        VALUES (
            (SELECT id FROM companies WHERE name = %s),
            %s, %s, %s, %s, %s, %s, 'manual'
        )
    """, (
        model['co'],
        model['name'],
        model['cat'],
        model['params'],
        model['ctx'],
        model['lic'],
        datetime.strptime(model['date'], '%Y-%m-%d').date()
    ))

    # 插入 Benchmark 数据
    model_id = cur.fetchone()[0]
    cur.execute("""
        INSERT INTO model_benchmarks (model_id, benchmark_id, score, source, tested_at)
        VALUES (
            %s,
            (SELECT id FROM benchmarks WHERE name = 'SWE-bench'),
            %s,
            'official',
            %s
        )
    """, (model_id, model['swe'], datetime.now().date()))

conn.commit()
cur.close()
conn.close()
```

### 2. 初始数据验证

**验证清单**：
```sql
-- 检查模型数量
SELECT COUNT(*) FROM models WHERE archived_at IS NULL;

-- 检查 Benchmark 覆盖率
SELECT
  COUNT(DISTINCT model_id) AS models_with_benchmarks,
  (SELECT COUNT(*) FROM models WHERE archived_at IS NULL) AS total_models,
  ROUND(COUNT(DISTINCT model_id)::numeric / (SELECT COUNT(*) FROM models WHERE archived_at IS NULL) * 100, 2) AS coverage_percent
FROM model_benchmarks;

-- 检查价格覆盖率
SELECT
  COUNT(DISTINCT model_id) AS models_with_prices,
  (SELECT COUNT(*) FROM models WHERE archived_at IS NULL AND license = 'closed') AS closed_models,
  ROUND(COUNT(DISTINCT model_id)::numeric / (SELECT COUNT(*) FROM models WHERE archived_at IS NULL AND license = 'closed') * 100, 2) AS price_coverage_percent
FROM price_history;

-- 检查数据来源分布
SELECT data_source, COUNT(*)
FROM models
GROUP BY data_source
ORDER BY COUNT(*) DESC;
```

---

## 后续扩展建议

### 1. 多语言支持
添加 `models_i18n` 和 `companies_i18n` 表，支持中英文切换。

### 2. 团队管理
添加 `teams` 表，支持团队级别的批注可见性和 Alert 订阅。

### 3. API 调用统计
添加 `api_usage` 表，记录用户对价格计算器、选型器的调用次数。

### 4. 导出记录
添加 `exports` 表，记录 PDF 导出历史，支持审计。

### 5. 自动化任务
添加 `scheduled_tasks` 表，管理爬虫任务、Alert 触发等定时任务。

---

**文档版本**: v1.0
**最后更新**: 2026-03-24
**作者**: Claude (Sonnet 4.5)
