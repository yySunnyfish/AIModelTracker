# Supabase 设置指南

本指南将帮助您设置 Supabase 数据库并获取必要的密钥。

## 第一步：创建 Supabase 项目

1. 访问 https://supabase.com/dashboard
2. 点击 "New Project"
3. 填写项目信息：
   - **Name**: `modeltrack`
   - **Database Password**: 生成一个强密码并保存
   - **Region**: 选择离您最近的区域（如 `Northeast Asia (Tokyo)`）
4. 点击 "Create new project"，等待约 2 分钟

## 第二步：获取 API 密钥

项目创建完成后：

1. 进入项目 Dashboard
2. 点击左侧菜单 "Settings" → "API"
3. 复制以下信息到 `.env.local`：

```
# 在 "Project URL" 部分
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxx.supabase.co

# 在 "Project API keys" 部分
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...（anon public key）
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...（service_role secret key）
```

## 第三步：获取数据库连接字符串

1. 在 "Settings" → "Database"
2. 找到 "Connection string" 部分
3. 选择 "URI" 格式
4. 复制连接字符串，将 `[YOUR-PASSWORD]` 替换为您在第一步设置的密码
5. 添加到 `.env.local`：

```
DATABASE_URL=postgresql://postgres.xxxxxx:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
```

## 第四步：生成 NextAuth 密钥

在终端运行：

```bash
openssl rand -base64 32
```

将输出的字符串添加到 `.env.local`：

```
NEXTAUTH_SECRET=生成的随机字符串
```

## 第五步：执行数据库 Schema

### 方法 A：通过 Supabase Dashboard（推荐）

1. 在 Supabase Dashboard，点击左侧 "SQL Editor"
2. 点击 "New query"
3. 复制 `/Users/yuyang/ModelTrack/database/schema.sql` 的全部内容
4. 粘贴到编辑器
5. 点击 "Run" 执行

### 方法 B：通过命令行

```bash
# 安装 Supabase CLI
npm install -g supabase

# 登录
supabase login

# 关联项目
cd /Users/yuyang/ModelTrack
supabase link --project-ref your-project-ref

# 执行 schema
supabase db push
```

## 第六步：验证数据库表

在 Supabase Dashboard：

1. 点击左侧 "Table Editor"
2. 确认以下表已创建：
   - ✅ companies
   - ✅ models
   - ✅ model_versions
   - ✅ benchmarks
   - ✅ benchmark_categories
   - ✅ model_benchmarks
   - ✅ price_history
   - ✅ funding_events
   - ✅ profiles
   - ✅ annotations
   - ✅ weekly_summaries
   - ✅ alert_rules
   - ✅ alert_events

## 第七步：配置认证（可选）

如果需要企业邮箱或 Google SSO：

1. "Authentication" → "Providers"
2. 启用 "Email" 或 "Google"
3. 配置回调 URL：`http://localhost:3000/api/auth/callback/google`

## 疑难解答

### 问题 1：连接被拒绝
- 检查 DATABASE_URL 中的密码是否正确
- 确认 IP 地址在 Supabase 的 "Allowed IPs" 白名单中（Settings → Database）

### 问题 2：RLS 策略阻止查询
- 在 SQL Editor 中运行：`ALTER TABLE models DISABLE ROW LEVEL SECURITY;`（临时禁用）
- 或确保您的用户有正确的权限

### 问题 3：Schema 执行失败
- 逐段执行 SQL，查看具体错误信息
- 检查是否有已存在的同名表（先 DROP TABLE IF EXISTS）

---

## 下一步

完成以上步骤后，请提供以下信息以便继续：

1. ✅ NEXT_PUBLIC_SUPABASE_URL
2. ✅ NEXT_PUBLIC_SUPABASE_ANON_KEY
3. ✅ SUPABASE_SERVICE_ROLE_KEY
4. ✅ DATABASE_URL
5. ✅ NEXTAUTH_SECRET

然后我们将运行数据导入脚本！
