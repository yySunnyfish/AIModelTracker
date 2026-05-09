# ModelTrack API 设计文档

## 目录
1. [架构概览](#架构概览)
2. [认证与权限](#认证与权限)
3. [API 规范](#api-规范)
4. [核心接口](#核心接口)
5. [错误处理](#错误处理)
6. [部署建议](#部署建议)

---

## 架构概览

### 技术栈
```
前端：Next.js 15 + TypeScript + Tailwind CSS
后端：Next.js API Routes (App Router)
数据库：Supabase PostgreSQL
认证：Supabase Auth (NextAuth.js 集成)
推送：Resend (邮件) + 企业微信 Webhook
```

### 架构原则

1. **BFF 模式**：前端通过 API Routes 访问数据库，不直接连接 Supabase
2. **JWT 校验**：前端通过 Supabase Auth 登录，API 校验 JWT
3. **RLS 增强**：数据库层 Row-Level Security + API 层权限校验（双重保障）
4. **爬虫特权**：爬虫通过 Supabase Admin SDK 写入，绕过 RLS

### 目录结构
```
app/
├── api/
│   ├── auth/
│   │   └── [...nextauth]/route.ts    # NextAuth 认证
│   ├── models/
│   │   ├── route.ts                  # GET /api/models, POST /api/models
│   │   └── [id]/
│   │       └── route.ts              # GET/PATCH/DELETE /api/models/:id
│   ├── companies/
│   │   └── route.ts                  # 公司接口
│   ├── benchmarks/
│   │   ├── route.ts                  # Benchmark 查询
│   │   └── [id]/
│   │       └── history/
│   │           └── route.ts          # 历史 trend
│   ├── price-calculator/
│   │   └── route.ts                  # 价格计算器
│   ├── selector/
│   │   └── route.ts                  # 基座选型器
│   ├── annotations/
│   │   ├── route.ts                  # 批注 CRUD
│   │   └── [id]/
│   │       ├── route.ts
│   │       └── mentions/
│   │           └── route.ts          # @提及
│   ├── executive/
│   │   ├── weekly/
│   │   │   └── route.ts              # 周度摘要
│   │   └── signals/
│   │       └── route.ts              # 信号聚合
│   ├── alerts/
│   │   ├── rules/
│   │   │   └── route.ts              # Alert 规则配置
│   │   ├── events/
│   │   │   └── route.ts              # Alert 事件
│   │   └── subscriptions/
│   │       └── route.ts              # 用户订阅
│   └── health/
│       └── route.ts                  # 健康检查
├── (auth)/
│   └── login/
│       └── page.tsx                  # 登录页
├── (dashboard)/
│   ├── page.tsx                      # 首页（根据角色跳转）
│   ├── models/
│   │   └── page.tsx                  # Timeline 视图
│   ├── companies/
│   │   └── [id]/
│   │       └── page.tsx              # 公司详情
│   └── admin/
│       └── page.tsx                  # 信息官后台
└── middleware.ts                     # 权限校验
```

---

## 认证与权限

### 1. 认证流程

#### 登录
```typescript
// POST /api/auth/login
Request:
{
  "email": "user@example.com",
  "password": "password123"
}

Response:
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "role": "admin"
  },
  "session": {
    "access_token": "eyJ...",
    "refresh_token": "eyJ...",
    "expires_at": 1234567890
  }
}
```

#### 刷新 Token
```typescript
// POST /api/auth/refresh
Request:
{
  "refresh_token": "eyJ..."
}

Response:
{
  "access_token": "eyJ...",
  "expires_at": 1234567890
}
```

### 2. 权限校验中间件

```typescript
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyJWT } from '@/lib/auth'

export async function middleware(request: NextRequest) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')

  if (!token) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
  }

  try {
    const user = await verifyJWT(token)
    request.headers.set('x-user-id', user.id)
    request.headers.set('x-user-role', user.role)
    return NextResponse.next()
  } catch (error) {
    return NextResponse.json(
      { error: 'Invalid token' },
      { status: 401 }
    )
  }
}

export const config = {
  matcher: [
    '/api/models/:path*',
    '/api/companies/:path*',
    '/api/annotations/:path*',
    '/api/executive/:path*',
    '/api/admin/:path*'
  ]
}
```

### 3. 角色权限矩阵

| 接口 | admin（信息官） | tech（技术负责人） | exec（高管） |
|------|----------------|-------------------|-------------|
| GET /api/models | ✅ | ✅ | ✅ |
| POST /api/models | ✅ | ❌ | ❌ |
| PATCH /api/models/:id | ✅ | ❌ | ❌ |
| DELETE /api/models/:id | ✅ | ❌ | ❌ |
| GET /api/annotations | ✅ | ✅ | ✅（仅公共） |
| POST /api/annotations | ✅ | ✅ | ❌ |
| PATCH /api/annotations/:id | ✅ | ✅（作者） | ❌ |
| GET /api/executive/weekly | ✅ | ✅ | ✅（已发布） |
| POST /api/executive/weekly | ✅ | ❌ | ❌ |
| GET /api/admin/* | ✅ | ❌ | ❌ |
| POST /api/alerts/rules | ✅ | ❌ | ❌ |
| POST /api/alerts/subscriptions | ✅ | ✅ | ✅ |

---

## API 规范

### 请求格式

#### 分页
```typescript
GET /api/models?page=1&page_size=20&sort=release_date&order=desc

Response:
{
  "data": [...],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 247,
    "total_pages": 13
  }
}
```

#### 筛选
```typescript
GET /api/models?category=code&license=open&min_swe_score=75

Query Parameters:
- category: string (general|code|reasoning|multimodal|edge)
- license: string (open|closed|partial)
- min_swe_score: number
- max_price: number
- company_id: uuid
- release_date_from: ISO date
- release_date_to: ISO date
```

#### 字段选择
```typescript
GET /api/models?fields=id,name,company,price

Response:
{
  "data": [
    {
      "id": "uuid",
      "name": "MiniMax M2.7",
      "company": {...},
      "price": {...}
    }
  ]
}
```

### 响应格式

#### 成功响应
```typescript
{
  "data": {...},
  "meta": {
    "timestamp": "2026-03-24T10:30:00Z",
    "request_id": "req_abc123"
  }
}
```

#### 错误响应
```typescript
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid model name",
    "details": [
      {
        "field": "name",
        "message": "Name is required"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-03-24T10:30:00Z",
    "request_id": "req_abc123"
  }
}
```

---

## 核心接口

### 1. 模型接口

#### GET /api/models
查询模型列表（支持筛选、分页）

**请求**：
```typescript
GET /api/models
  ?category=code
  &license=open
  &min_swe_score=75
  &max_price=1.0
  &page=1
  &page_size=20
  &sort=release_date
  &order=desc
  &fields=id,name,company,benchmarks,price
```

**响应**：
```typescript
{
  "data": [
    {
      "id": "uuid",
      "name": "MiniMax M2.7",
      "company": {
        "id": "uuid",
        "name": "MiniMax",
        "region": "CN"
      },
      "category": "code",
      "params": "Undisclosed",
      "context_window": "1M",
      "license": "closed",
      "release_date": "2026-03-18",
      "benchmarks": [
        {
          "name": "SWE-bench",
          "score": 82,
          "source": "official",
          "tested_at": "2026-03-18"
        },
        {
          "name": "MMLU",
          "score": 86,
          "source": "epoch_ai",
          "tested_at": "2026-03-20"
        }
      ],
      "price": {
        "input_price_per_million": 0.29,
        "output_price_per_million": 1.15,
        "effective_from": "2026-03-18"
      },
      "data_source": "official_blog",
      "source_url": "https://minimax.ai/blog/m2.7",
      "verified_at": "2026-03-19T10:30:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "page_size": 20,
    "total": 247,
    "total_pages": 13
  }
}
```

#### GET /api/models/:id
查询单个模型详情

**响应**：
```typescript
{
  "data": {
    "id": "uuid",
    "name": "MiniMax M2.7",
    "company": {
      "id": "uuid",
      "name": "MiniMax",
      "region": "CN",
      "type": "LLM"
    },
    "category": "code",
    "params": "Undisclosed",
    "context_window": "1M",
    "modalities": ["Text", "Code"],
    "license": "closed",
    "release_date": "2026-03-18",
    "innovation": "First model in own training, 100+ iterations",
    "architecture": "MoE (same as M2.5)",
    "benchmarks": [
      {
        "benchmark_id": "uuid",
        "name": "SWE-bench",
        "category": "General > Coding",
        "score": 82,
        "source": "official",
        "tested_at": "2026-03-18",
        "confidence_score": 1.0
      }
    ],
    "price_history": [
      {
        "input_price_per_million": 0.29,
        "output_price_per_million": 1.15,
        "effective_from": "2026-03-18",
        "source": "official_blog"
      }
    ],
    "versions": [
      {
        "version_number": 1,
        "changed_fields": {
          "context_window": {
            "old": "128K",
            "new": "1M"
          }
        },
        "changed_at": "2026-03-20T10:30:00Z"
      }
    ],
    "annotations_count": 3,
    "created_at": "2026-03-18T08:00:00Z",
    "updated_at": "2026-03-20T10:30:00Z"
  }
}
```

#### POST /api/models
创建模型（仅管理员）

**请求**：
```typescript
{
  "name": "Test Model",
  "company_id": "uuid",
  "category": "code",
  "params": "100B",
  "context_window": "128K",
  "license": "open",
  "release_date": "2026-03-24",
  "data_source": "official_blog",
  "source_url": "https://example.com/blog",
  "confidence_score": 0.9
}
```

**响应**：
```typescript
{
  "data": {
    "id": "uuid",
    "name": "Test Model",
    ...
  }
}
```

#### PATCH /api/models/:id
更新模型（仅管理员）

**请求**：
```typescript
{
  "context_window": "200K",
  "verified_by": "admin-uuid",
  "verified_at": "2026-03-24T10:30:00Z"
}
```

**响应**：
```typescript
{
  "data": {
    "id": "uuid",
    "context_window": "200K",
    "updated_at": "2026-03-24T10:30:00Z"
  },
  "meta": {
    "version_created": true,
    "version_number": 2
  }
}
```

#### DELETE /api/models/:id
归档模型（仅管理员，软删除）

**响应**：
```typescript
{
  "data": {
    "id": "uuid",
    "archived_at": "2026-03-24T10:30:00Z"
  }
}
```

### 2. 公司接口

#### GET /api/companies
查询公司列表

**请求**：
```typescript
GET /api/companies?type=LLM&region=CN&sort=valuation&order=desc
```

**响应**：
```typescript
{
  "data": [
    {
      "id": "uuid",
      "name": "MiniMax",
      "region": "CN",
      "type": "LLM",
      "valuation": "~HK$2500B",
      "valuation_amount": 320000000000,
      "models_count": 6,
      "latest_model": "MiniMax M2.7",
      "latest_release": "2026-03-18"
    }
  ],
  "pagination": {...}
}
```

#### GET /api/companies/:id
查询公司详情

**响应**：
```typescript
{
  "data": {
    "id": "uuid",
    "name": "MiniMax",
    "region": "CN",
    "type": "LLM",
    "valuation": "~HK$2500B",
    "business_model": "C-app + API + Enterprise",
    "moat": "Price disruptor · Fastest iteration",
    "models": [
      {
        "id": "uuid",
        "name": "MiniMax M2.7",
        "category": "code",
        "release_date": "2026-03-18"
      }
    ],
    "funding_history": [
      {
        "round_name": "IPO",
        "amount_formatted": "$700M",
        "funding_date": "2026-01-15"
      }
    ],
    "benchmarks_avg": {
      "SWE-bench": 81,
      "MMLU": 85.5
    }
  }
}
```

### 3. Benchmark 接口

#### GET /api/benchmarks
查询 Benchmark 列表（支持分类筛选）

**请求**：
```typescript
GET /api/benchmarks?category=cat-general-coding&is_active=true
```

**响应**：
```typescript
{
  "data": [
    {
      "id": "uuid",
      "name": "SWE-bench",
      "name_cn": "软件工程基准",
      "category": {
        "id": "cat-general-coding",
        "name": "代码能力",
        "parent": {
          "id": "cat-general",
          "name": "通用能力"
        }
      },
      "description": "Real-world software engineering tasks",
      "max_score": 100,
      "unit": "percentage",
      "higher_is_better": true,
      "applicable_model_types": ["LLM"],
      "official_url": "https://www.swebench.com/"
    }
  ]
}
```

#### GET /api/benchmarks/:id/history
查询 Benchmark 历史趋势

**请求**：
```typescript
GET /api/benchmarks/:id/history?model_id=uuid&from=2025-01-01&to=2026-03-24
```

**响应**：
```typescript
{
  "data": {
    "benchmark_name": "SWE-bench",
    "model_name": "MiniMax M2.7",
    "history": [
      {
        "tested_at": "2026-03-18",
        "score": 82,
        "source": "official"
      },
      {
        "tested_at": "2026-03-10",
        "score": 79,
        "source": "epoch_ai"
      }
    ],
    "trend": "up", // up, down, stable
    "change": 3
  }
}
```

### 4. 价格计算器接口

#### POST /api/price-calculator
计算多模型价格对比

**请求**：
```typescript
{
  "input_tokens_per_month": 50, // 单位：Million
  "output_tokens_per_month": 20,
  "model_ids": [
    "uuid1",
    "uuid2",
    "uuid3"
  ],
  "scenarios": ["code_generation", "document_processing", "agent_tasks"]
}
```

**响应**：
```typescript
{
  "data": {
    "input_tokens": 50000000, // 转换为实际 token 数
    "output_tokens": 20000000,
    "results": [
      {
        "model_id": "uuid1",
        "model_name": "MiniMax M2.7",
        "monthly_cost": 33.5,
        "annual_cost": 402,
        "swe_bench_score": 82,
        "savings_vs_max": {
          "monthly": 1416.5,
          "annual": 16998
        },
        "performance_gap": -2, // 与最贵模型的性能差距
        "is_best_value": true
      },
      {
        "model_id": "uuid2",
        "model_name": "Claude Opus 4.6",
        "monthly_cost": 1450,
        "annual_cost": 17400,
        "swe_bench_score": 84,
        "savings_vs_max": {
          "monthly": 0,
          "annual": 0
        },
        "performance_gap": 0,
        "is_best_value": false
      }
    ],
    "recommendation": {
      "best_value": "MiniMax M2.7",
      "best_performance": "Claude Opus 4.6",
      "reason": "MiniMax M2.7 提供最佳性价比，每年节省 $16,998，SWE-bench 差距仅 2pp"
    }
  }
}
```

### 5. 基座选型器接口

#### POST /api/selector
根据需求推荐模型

**请求**：
```typescript
{
  "task_type": "code_generation", // code_generation, long_context, multimodal, agent
  "deployment": "api", // api, local
  "license_requirement": "commercial_acceptable", // mit_apache, commercial_acceptable, weights_only
  "monthly_budget": 500, // USD
  "min_swe_score": 70,
  "min_context_window": "128K",
  "priorities": {
    "performance": 0.4, // 0-1 权重
    "cost": 0.3,
    "deployment_flexibility": 0.2,
    "compliance": 0.1
  }
}
```

**响应**：
```typescript
{
  "data": {
    "recommendations": [
      {
        "rank": 1,
        "model_id": "uuid",
        "model_name": "MiniMax M2.7",
        "total_score": 95,
        "score_breakdown": {
          "performance": {
            "score": 40,
            "weight": 0.4,
            "details": "SWE-bench: 82%, MMLU: 86%"
          },
          "cost": {
            "score": 35,
            "weight": 0.3,
            "details": "$0.29/$1.15 per M tokens, 8% of Claude price"
          },
          "deployment_flexibility": {
            "score": 20,
            "weight": 0.2,
            "details": "API only, 1M context"
          },
          "compliance": {
            "score": 0,
            "weight": 0.1,
            "details": "Closed source, may require compliance review"
          }
        },
        "reasons": [
          "代码能力强 SWE 82%",
          "价格极低",
          "API 即用"
        ],
        "warnings": [
          "闭源，合规审查需确认"
        ]
      }
    ],
    "algorithm_version": "1.0",
    "weights_configured_by": "admin-uuid",
    "last_updated": "2026-03-24T10:30:00Z"
  }
}
```

#### GET /api/selector/weights
获取当前权重配置（管理员可修改）

**响应**：
```typescript
{
  "data": {
    "weights": {
      "performance": 0.4,
      "cost": 0.3,
      "deployment_flexibility": 0.2,
      "compliance": 0.1
    },
    "task_type_weights": {
      "code_generation": {
        "swe_score": 0.6,
        "human_eval": 0.3,
        "mmlu": 0.1
      },
      "long_context": {
        "context_score": 0.7,
        "retrieval_score": 0.3
      }
    },
    "last_updated": "2026-03-24T10:30:00Z",
    "updated_by": "admin-uuid"
  }
}
```

### 6. 批注接口

#### GET /api/annotations
查询批注列表

**请求**：
```typescript
GET /api/annotations?model_id=uuid&visibility=public&sort=created_at&order=desc
```

**响应**：
```typescript
{
  "data": [
    {
      "id": "uuid",
      "model": {
        "id": "uuid",
        "name": "MiniMax M2.7"
      },
      "user": {
        "id": "uuid",
        "full_name": "张三",
        "role": "tech"
      },
      "content": "M2.7 自我进化训练这个点很特殊，国内第一个。",
      "visibility": "public",
      "is_pinned": false,
      "mentions": [
        {
          "id": "uuid",
          "user": {
            "id": "uuid",
            "full_name": "李四"
          },
          "is_read": false
        }
      ],
      "created_at": "2026-03-18T10:22:00Z",
      "updated_at": "2026-03-18T10:22:00Z"
    }
  ],
  "pagination": {...}
}
```

#### POST /api/annotations
创建批注

**请求**：
```typescript
{
  "model_id": "uuid",
  "content": "建议这周做个 coding benchmark 内测。@tech-lead",
  "visibility": "public",
  "mentioned_user_ids": ["tech-lead-uuid"]
}
```

**响应**：
```typescript
{
  "data": {
    "id": "uuid",
    "model_id": "uuid",
    "content": "建议这周做个 coding benchmark 内测。@tech-lead",
    "visibility": "public",
    "created_at": "2026-03-24T10:30:00Z"
  },
  "meta": {
    "mentions_created": 1,
    "notifications_sent": 1
  }
}
```

### 7. Executive Dashboard 接口

#### GET /api/executive/weekly/current
获取本周摘要（高管视图）

**响应**：
```typescript
{
  "data": {
    "week_number": 12,
    "year": 2026,
    "period": "2026-03-17 ~ 2026-03-24",
    "signals": [
      {
        "priority": "high",
        "icon": "!",
        "title": "MiniMax M2.7 发布",
        "content": "首个参与自身训练的商用模型，编程能力超越 Claude，价格仍为后者的 2%。",
        "action_required": "技术团队应本周内完成 coding benchmark 对比测试"
      },
      {
        "priority": "high",
        "icon": "↑",
        "title": "Anthropic 市场份额升至 40%",
        "content": "首次超越 OpenAI（27%），B2B 优先路线持续验证。",
        "action_required": null
      },
      {
        "priority": "medium",
        "icon": "$",
        "title": "Wayve 完成 $1.2B D 轮",
        "content": "估值 $8.6B，中国以外的 E2E 自动驾驶头部格局基本确立。",
        "action_required": "研究 Uber 合作模式对我们 AV 业务的参考意义"
      }
    ],
    "action_items": "技术团队评估 MiniMax M2.7 替代方案；战略团队研究 Wayve-Uber 合作模式",
    "upcoming_events": "DeepSeek V4 传言 4 月发布 · 腾讯混元 HY 3.0 预计 4 月上线",
    "kpis": {
      "new_models_count": 4,
      "funding_events_count": 2,
      "funding_total": "$1.6B",
      "price_war_index": "high",
      "data_freshness_score": 0.98
    },
    "published_at": "2026-03-24T09:00:00Z",
    "published_by": {
      "id": "admin-uuid",
      "full_name": "信息官"
    }
  }
}
```

#### POST /api/executive/weekly
创建周度摘要（仅管理员）

**请求**：
```typescript
{
  "week_number": 12,
  "year": 2026,
  "signal_1": "MiniMax M2.7 发布...",
  "signal_2": "Anthropic 市场份额升至 40%...",
  "signal_3": "Wayve 完成 $1.2B D 轮...",
  "action_items": "技术团队评估...",
  "upcoming_events": "DeepSeek V4 传言..."
}
```

#### PATCH /api/executive/weekly/:id/publish
发布周度摘要（仅管理员）

**响应**：
```typescript
{
  "data": {
    "id": "uuid",
    "published_at": "2026-03-24T09:00:00Z"
  },
  "meta": {
    "notifications_sent": 15, // 发送给订阅的高管
    "channels": ["email", "wechat"]
  }
}
```

### 8. Alert 接口

#### GET /api/alerts/rules
获取 Alert 规则列表

**响应**：
```typescript
{
  "data": [
    {
      "id": "uuid",
      "name": "新模型发布",
      "description": "当有新模型发布时触发",
      "trigger_type": "model.created",
      "condition_expr": "true",
      "priority": "high",
      "channels": ["email", "wechat"],
      "target_roles": ["admin", "tech", "exec"],
      "is_active": true,
      "subscriptions_count": 45
    }
  ]
}
```

#### POST /api/alerts/rules
创建 Alert 规则（仅管理员）

**请求**：
```typescript
{
  "name": "关注模型价格变动",
  "description": "关注的模型价格变动超过 10% 时触发",
  "trigger_type": "price.changed",
  "condition_expr": "abs(change_percent) > 10 AND model_id IN (SELECT model_id FROM company_watchlists WHERE user_id = current_user)",
  "priority": "medium",
  "channels": ["email"],
  "target_roles": ["admin", "tech"]
}
```

#### POST /api/alerts/subscriptions
订阅 Alert

**请求**：
```typescript
{
  "rule_id": "uuid",
  "custom_channels": ["email", "wechat"] // 可选，覆盖默认渠道
}
```

#### GET /api/alerts/events
获取 Alert 事件历史

**请求**：
```typescript
GET /api/alerts/events?priority=high&from=2026-03-01&to=2026-03-24&page=1&page_size=20
```

**响应**：
```typescript
{
  "data": [
    {
      "id": "uuid",
      "rule_name": "新模型发布",
      "trigger_type": "model.created",
      "trigger_data": {
        "model_id": "uuid",
        "model_name": "MiniMax M2.7",
        "company_name": "MiniMax",
        "release_date": "2026-03-18"
      },
      "priority": "high",
      "channels_sent": ["email", "wechat"],
      "sent_at": "2026-03-18T09:14:00Z",
      "created_at": "2026-03-18T09:14:00Z"
    }
  ],
  "pagination": {...}
}
```

### 9. 数据健康度接口（管理员专用）

#### GET /api/admin/health
获取数据健康度报告

**响应**：
```typescript
{
  "data": {
    "models": {
      "total": 247,
      "verified": 198,
      "verified_percent": 80.16,
      "updated_last_week": 12,
      "avg_confidence": 0.89
    },
    "benchmarks": {
      "total": 1235,
      "verified": 1100,
      "verified_percent": 89.07,
      "updated_last_month": 85,
      "avg_confidence": 0.92
    },
    "data_sources": [
      {
        "source_name": "Official Blogs",
        "last_sync_at": "2026-03-24T08:00:00Z",
        "sync_status": "success",
        "records_updated": 5
      },
      {
        "source_name": "HuggingFace",
        "last_sync_at": "2026-03-23T22:00:00Z",
        "sync_status": "success",
        "records_updated": 12
      },
      {
        "source_name": "OpenRouter",
        "last_sync_at": "2026-03-23T06:00:00Z",
        "sync_status": "failed",
        "error_message": "Rate limit exceeded"
      }
    ],
    "crawler_errors": [
      {
        "source_url": "https://example.com/model",
        "error_type": "parse_error",
        "error_message": "Failed to extract benchmark data",
        "retry_count": 3,
        "created_at": "2026-03-24T10:00:00Z"
      }
    ]
  }
}
```

#### GET /api/admin/review-queue
获取待审核队列

**响应**：
```typescript
{
  "data": [
    {
      "id": "uuid",
      "type": "model_price_change",
      "source": "阿里云官网",
      "source_url": "https://aliyun.com/pricing",
      "data": {
        "model_name": "Qwen 3.5",
        "old_price": { "input": 0.5, "output": 2.0 },
        "new_price": { "input": 0.7, "output": 2.5 },
        "change_percent": 30
      },
      "confidence_score": 0.85,
      "created_at": "2026-03-24T10:00:00Z"
    }
  ],
  "pagination": {...}
}
```

---

## 错误处理

### 错误码规范

```typescript
enum ErrorCode {
  // 认证错误 (1xxx)
  UNAUTHORIZED = 1001,
  INVALID_TOKEN = 1002,
  TOKEN_EXPIRED = 1003,
  INSUFFICIENT_PERMISSIONS = 1004,

  // 验证错误 (2xxx)
  VALIDATION_ERROR = 2001,
  MISSING_FIELD = 2002,
  INVALID_FORMAT = 2003,
  VALUE_OUT_OF_RANGE = 2004,

  // 资源错误 (3xxx)
  RESOURCE_NOT_FOUND = 3001,
  RESOURCE_ALREADY_EXISTS = 3002,
  RESOURCE_DELETED = 3003,

  // 业务错误 (4xxx)
  DUPLICATE_MODEL_NAME = 4001,
  INVALID_BENCHMARK_SCORE = 4002,
  PRICE_NEGATIVE = 4003,

  // 系统错误 (5xxx)
  INTERNAL_ERROR = 5001,
  DATABASE_ERROR = 5002,
  EXTERNAL_API_ERROR = 5003
}
```

### 错误响应示例

```typescript
// 验证错误
{
  "error": {
    "code": 2001,
    "message": "Validation failed",
    "details": [
      {
        "field": "name",
        "message": "Model name is required"
      },
      {
        "field": "swe_bench_score",
        "message": "SWE-bench score must be between 0 and 100"
      }
    ]
  },
  "meta": {
    "timestamp": "2026-03-24T10:30:00Z",
    "request_id": "req_abc123"
  }
}

// 权限错误
{
  "error": {
    "code": 1004,
    "message": "Insufficient permissions",
    "details": "You need admin role to create models"
  },
  "meta": {
    "timestamp": "2026-03-24T10:30:00Z",
    "request_id": "req_abc123"
  }
}
```

---

## 部署建议

### 1. 环境变量

```bash
# .env.local
DATABASE_URL="postgresql://..."
SUPABASE_URL="https://xxx.supabase.co"
SUPABASE_ANON_KEY="eyJ..."
SUPABASE_SERVICE_ROLE_KEY="eyJ..." # 爬虫专用

# NextAuth
NEXTAUTH_SECRET="xxx"
NEXTAUTH_URL="https://modeltrack.com"

# 推送服务
RESEND_API_KEY="re_xxx"
WECHAT_WEBHOOK_URL="https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx"

# 爬虫
CRAWLER_SECRET="xxx" # 爬虫调用 API 的密钥
```

### 2. API 限流

```typescript
// middleware.ts
import rateLimit from 'express-rate-limit'

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 分钟
  max: 100, // 限制 100 请求
  message: {
    error: {
      code: 429,
      message: 'Too many requests, please try again later'
    }
  }
})

export const config = {
  matcher: '/api/:path*',
}

export default limiter
```

### 3. 缓存策略

```typescript
// lib/cache.ts
import { Redis } from 'ioredis'

const redis = new Redis(process.env.REDIS_URL)

export async function getCached<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttl: number = 3600 // 默认 1 小时
): Promise<T> {
  const cached = await redis.get(key)
  if (cached) {
    return JSON.parse(cached)
  }

  const data = await fetcher()
  await redis.setex(key, ttl, JSON.stringify(data))
  return data
}

// 使用示例
export async function GET(request: Request) {
  const models = await getCached(
    'models:latest',
    () => db.query('SELECT * FROM models WHERE archived_at IS NULL'),
    3600 // 1 小时
  )
  return Response.json({ data: models })
}
```

### 4. 日志

```typescript
// lib/logger.ts
import pino from 'pino'

export const logger = pino({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
})

// 使用示例
logger.info({ model_id: 'uuid', user_id: 'uuid' }, 'Model created')
logger.error({ error: err, request_id: 'req_abc' }, 'Failed to create model')
```

---

## 版本历史

- **v1.0** (2026-03-24): 初始 API 设计
- 作者：Claude (Sonnet 4.5)
- 基于 ModelTrack 系统设计分析报告

---

**下一步**：实现 Next.js API Routes
