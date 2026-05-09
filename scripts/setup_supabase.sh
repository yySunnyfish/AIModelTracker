#!/bin/bash
# Supabase 自动化设置脚本
#
# 此脚本将：
# 1. 检查 Supabase CLI 是否安装
# 2. 登录 Supabase
# 3. 创建新项目
# 4. 执行数据库 Schema
# 5. 获取 API 密钥并写入 .env.local

set -e

PROJECT_NAME="modeltrack"
REGION="ap-northeast-1"  # Tokyo，可根据需要修改

echo "================================================"
echo "Supabase 项目设置脚本"
echo "================================================"
echo ""

# 检查 Supabase CLI
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI 未安装"
    echo ""
    echo "请选择安装方式："
    echo ""
    echo "macOS (Homebrew):"
    echo "  brew install supabase/tap/supabase"
    echo ""
    echo "Windows (Scoop):"
    echo "  scoop bucket add supabase https://github.com/supabase/scoop-bucket.git"
    echo "  scoop install supabase"
    echo ""
    echo "Linux (Go):"
    echo "  go install github.com/supabase/supabase/cmd/supabase@latest"
    echo ""
    echo "或访问 https://supabase.com/docs/guides/cli 查看更多安装方式"
    exit 1
fi

echo "✅ Supabase CLI 已安装"
echo ""

# 检查是否已登录
echo "检查登录状态..."
if ! supabase projects list &> /dev/null; then
    echo ""
    echo "需要登录 Supabase，将打开浏览器..."
    supabase login
fi

echo "✅ 已登录 Supabase"
echo ""

# 创建项目
echo "================================================"
echo "创建新项目: $PROJECT_NAME"
echo "================================================"
echo ""
echo "注意：创建项目需要几分钟时间，请耐心等待..."
echo ""

# 使用 Supabase CLI 创建项目
supabase projects create "$PROJECT_NAME" --region "$REGION"

echo ""
echo "✅ 项目创建成功"
echo ""

# 获取项目信息
echo "================================================"
echo "获取项目配置信息"
echo "================================================"
echo ""

PROJECT_ID=$(supabase projects list | grep "$PROJECT_NAME" | awk '{print $1}')
PROJECT_URL="https://${PROJECT_ID}.supabase.co"

echo "项目 ID: $PROJECT_ID"
echo "项目 URL: $PROJECT_URL"
echo ""

# 执行数据库 Schema
echo "================================================"
echo "执行数据库 Schema"
echo "================================================"
echo ""
echo "正在推送 schema.sql 到数据库..."
echo ""

cd "$(dirname "$0")/../database"
supabase db push

echo ""
echo "✅ 数据库 Schema 执行成功"
echo ""

# 获取 API 密钥
echo "================================================"
echo "获取 API 密钥"
echo "================================================"
echo ""
echo "请访问以下 URL 获取 API 密钥："
echo ""
echo "项目 URL: $PROJECT_URL"
echo ""
echo "步骤："
echo "1. 打开上述 URL"
echo "2. 点击左侧菜单 'Settings' → 'API'"
echo "3. 复制以下信息："
echo "   - Project URL"
echo "   - anon public key"
echo "   - service_role secret key"
echo ""
echo "4. 点击左侧菜单 'Settings' → 'Database'"
echo "5. 在 'Connection string' 部分选择 'URI'"
echo "6. 复制连接字符串，将 [YOUR-PASSWORD] 替换为您设置的数据库密码"
echo ""

# 生成 NextAuth Secret
echo "================================================"
echo "生成 NextAuth Secret"
echo "================================================"
echo ""
NEXTAUTH_SECRET=$(openssl rand -base64 32)
echo "已生成 NEXTAUTH_SECRET: $NEXTAUTH_SECRET"
echo ""

# 写入 .env.local
ENV_FILE="../frontend/.env.local"
echo "================================================"
echo "配置环境变量"
echo "================================================"
echo ""
echo "请手动编辑 $ENV_FILE 文件，填入以下内容："
echo ""
cat << EOF
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=$PROJECT_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=<从 Dashboard 复制>
SUPABASE_SERVICE_ROLE_KEY=<从 Dashboard 复制>

# Database Connection
DATABASE_URL=<从 Dashboard 复制并替换密码>

# NextAuth
NEXTAUTH_SECRET=$NEXTAUTH_SECRET
NEXTAUTH_URL=http://localhost:3000
EOF

echo ""
echo "================================================"
echo "✅ 设置完成！"
echo "================================================"
echo ""
echo "下一步："
echo "1. 访问 $PROJECT_URL 获取 API 密钥"
echo "2. 编辑 frontend/.env.local 填入密钥"
echo "3. 运行数据导入脚本："
echo "   cd scripts"
echo "   python migrate_data_improved.py --db-url \$DATABASE_URL"
echo ""
