# Supabase 设置检查清单 ✅

请按照以下步骤逐项完成，每完成一项打勾 ✅

## 📋 步骤清单

### 1️⃣ 创建账号和组织
- [ ] 访问 https://supabase.com
- [ ] 使用 GitHub/Google 登录或注册
- [ ] 创建组织（Name: `Personal`, Plan: `Free`）

### 2️⃣ 创建项目
- [ ] Project name: `modeltrack`
- [ ] Database Password: 点击 "Generate a random password"
- [ ] **⚠️ 保存数据库密码**: __________________________
- [ ] Region: `Northeast Asia (Tokyo)`
- [ ] Plan: `Free`
- [ ] 点击 "Create new project"
- [ ] 等待 2-3 分钟项目创建

### 3️⃣ 获取 API 密钥
导航到 Settings → API，复制以下内容：

- [ ] **Project URL**:
  ```
  https://_________________________________.supabase.co
  ```

- [ ] **anon public key** (以 eyJ 开头):
  ```
  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.__________________________________________
  ```

- [ ] **service_role secret key** (以 eyJ 开头):
  ```
  eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.__________________________________________
  ```

### 4️⃣ 获取数据库连接字符串
导航到 Settings → Database → Connection string → URI：

- [ ] 复制连接字符串:
  ```
  postgresql://postgres._____________________:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
  ```

- [ ] 替换 `[YOUR-PASSWORD]` 为步骤 2 保存的密码:
  ```
  postgresql://postgres._____________________:________________________________@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
  ```

### 5️⃣ 执行数据库 Schema
导航到 SQL Editor：

- [ ] 打开 `/Users/yuyang/ModelTrack/database/schema.sql`
- [ ] 复制全部内容（约 600 行）
- [ ] 在 SQL Editor 中粘贴
- [ ] 点击 "Run" 或按 Cmd+Enter
- [ ] 看到绿色提示 "Success. No rows returned"

### 6️⃣ 验证表创建
导航到 Table Editor，确认以下表存在：

- [ ] companies
- [ ] models
- [ ] model_versions
- [ ] benchmarks
- [ ] benchmark_categories
- [ ] model_benchmarks
- [ ] price_history
- [ ] funding_events
- [ ] profiles
- [ ] annotations
- [ ] weekly_summaries
- [ ] alert_rules
- [ ] alert_events

### 7️⃣ 生成 NextAuth Secret
在终端运行：

```bash
openssl rand -base64 32
```

- [ ] 复制输出:
  ```
  ________________________________________
  ```

---

## 📝 信息汇总

完成所有步骤后，您应该有以下 5 个值：

### 环境变量配置

```bash
# 1. Supabase Project URL
NEXT_PUBLIC_SUPABASE_URL=https://_________________________________.supabase.co

# 2. Supabase Anon Key (Public)
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# 3. Supabase Service Role Key (Secret!)
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# 4. Database Connection String
DATABASE_URL=postgresql://postgres._____________________:_________________@...

# 5. NextAuth Secret
NEXTAUTH_SECRET=_________________________
NEXTAUTH_URL=http://localhost:3000
```

---

## ✅ 完成确认

所有步骤完成后，请提供上述 5 个值（可以复制整个配置块），我会：

1. ✅ 更新 `.env.local` 文件
2. ✅ 测试数据库连接
3. ✅ 运行数据导入脚本
4. ✅ 验证数据完整性
5. ✅ 继续前端开发

---

## 🆘 遇到问题？

### 问题 1: 项目创建卡住了
**解决**: 刷新页面，检查是否已创建（Dashboard 左上角下拉菜单）

### 问题 2: Schema 执行报错
**解决**:
- 确保复制了完整的 SQL（从 `-- 启用扩展` 开始到最后一行）
- 检查是否有红色错误提示
- 尝试分段执行（先执行表创建，再执行触发器）

### 问题 3: 找不到某个菜单
**解决**: 左侧菜单图标说明：
- 🏠 Home（首页）
- 📊 Table Editor（表编辑器）
- 🔧 Settings（设置）
- 💻 SQL Editor（SQL 编辑器）

---

**准备就绪后，将 5 个配置值发送给我，格式如下：**

```
URL: https://xxxxx.supabase.co
ANON_KEY: eyJhbGci...
SERVICE_KEY: eyJhbGci...
DATABASE_URL: postgresql://postgres.xxxxx:password@...
NEXTAUTH_SECRET: xxxxx
```

我在等您！🎯
