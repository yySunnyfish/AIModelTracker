# Supabase 创建完整指南（图文版）

## 方法一：网页创建（推荐，最简单）⭐

### 步骤 1：注册 Supabase 账号

1. 访问 **https://supabase.com**
2. 点击右上角 **"Start your project"**
3. 选择登录方式：
   - 使用 GitHub 账号（推荐）
   - 使用 Google 账号
   - 使用邮箱注册

![注册页面](https://supabase.com/docs/assets/images/sign-up-296211a0a56e2a3f4b8e5a2c2f3b1c2d.png)

### 步骤 2：创建组织（Organization）

登录后，会提示创建组织：

1. 填写 **Organization name**: `Personal` 或 `MyCompany`
2. 选择 **Plan**: **Free**（免费版足够开发使用）
3. 点击 **"Create organization"**

### 步骤 3：创建项目（Project）

组织创建后，会自动跳转到项目创建页面：

1. **Project name**: 填写 `modeltrack`
2. **Database Password**:
   - 点击 **"Generate a random password"**
   - ⚠️ **重要**：复制并保存这个密码！后续连接数据库需要
3. **Region**: 选择离您最近的区域
   - 🌏 中国用户推荐：`Northeast Asia (Tokyo)`
4. **Plan**: 选择 **Free**
5. 点击 **"Create new project"**

⏱️ 等待约 **2-3 分钟**，项目创建中...

### 步骤 4：获取 API 密钥

项目创建完成后：

1. 在左侧菜单点击 **"Settings"** ⚙️
2. 点击 **"API"**
3. 复制以下信息：

```
Project URL: https://xxxxxxxxxxxxx.supabase.co
anon public: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...（很长的字符串）
service_role: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...（很长的字符串）
```

⚠️ **重要提示**：
- `anon public` 可以公开，`service_role` 必须保密！
- 将这些密钥保存到安全的地方

### 步骤 5：获取数据库连接字符串

1. 仍在 **"Settings"** 页面
2. 点击左侧 **"Database"**
3. 向下滚动到 **"Connection string"** 部分
4. 选择 **"URI"** 标签
5. 复制连接字符串：

```
postgresql://postgres.xxxxxxxxxxxxx:[YOUR-PASSWORD]@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
```

6. 将 `[YOUR-PASSWORD]` 替换为步骤 3 中保存的数据库密码

最终格式：
```
postgresql://postgres.abcdefghijk:YourActualPassword@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres
```

### 步骤 6：执行数据库 Schema

1. 在 Supabase Dashboard 左侧菜单点击 **"SQL Editor"**
2. 点击右上角 **"New query"**
3. 打开本地文件：`/Users/yuyang/ModelTrack/database/schema.sql`
4. 复制**全部内容**（约 600 行 SQL）
5. 粘贴到 SQL Editor
6. 点击右下角 **"Run"** 或按 `Cmd+Enter` / `Ctrl+Enter`

✅ 看到绿色提示 "Success. No rows returned" 即成功

### 步骤 7：验证表创建

在左侧菜单点击 **"Table Editor"**，确认以下表已创建：

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

---

## 方法二：CLI 创建（适合自动化）

### 前置要求

安装 Supabase CLI：

```bash
# macOS
brew install supabase/tap/supabase

# Windows (Scoop)
scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
scoop install supabase

# Linux
go install github.com/supabase/supabase/cmd/supabase@latest

# 或使用 npm
npm install -g supabase
```

### 执行自动化脚本

```bash
cd /Users/yuyang/ModelTrack
chmod +x scripts/setup_supabase.sh
./scripts/setup_supabase.sh
```

脚本会自动：
1. ✅ 检查 CLI 安装
2. ✅ 登录 Supabase
3. ✅ 创建项目
4. ✅ 执行 Schema
5. ✅ 生成配置文件模板

---

## 免费版限制

Supabase 免费版包含：

| 资源 | 限制 |
|------|------|
| 数据库存储 | 500 MB |
| 文件存储 | 1 GB |
| 带宽 | 5 GB/月 |
| 并发连接 | 60 |
| 项目数量 | 2 个活跃项目 |
| 项目暂停 | 7 天无活动暂停（可手动唤醒）|

对于 ModelTrack 开发阶段，免费版完全够用！

---

## 常见问题

### Q1: 忘记数据库密码怎么办？

**A**: 在 Settings → Database → "Reset database password" 可以重置

### Q2: 项目被暂停了怎么办？

**A**: 访问项目 Dashboard，点击 "Restore" 即可唤醒

### Q3: 如何删除项目？

**A**: Settings → General → "Delete project"（⚠️ 不可恢复）

### Q4: Region 选错了怎么办？

**A**: 区域无法修改，需要删除项目重新创建

### Q5: Schema 执行报错怎么办？

**A**:
1. 检查是否有已存在的同名表
2. 尝试分段执行 SQL
3. 查看错误信息，通常是语法或权限问题

---

## 下一步

完成 Supabase 创建后，请提供以下信息：

1. ✅ `NEXT_PUBLIC_SUPABASE_URL`（Project URL）
2. ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY`（anon public）
3. ✅ `SUPABASE_SERVICE_ROLE_KEY`（service_role）
4. ✅ `DATABASE_URL`（替换密码后的连接字符串）

我会帮您：
1. 更新 `.env.local` 配置
2. 导入初始数据
3. 验证数据库连接

准备好后，告诉我您的进度！🚀
