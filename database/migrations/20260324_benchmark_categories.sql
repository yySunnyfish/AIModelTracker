-- ============================================
-- Benchmark 分类体系设计
-- 创建时间: 2026-03-24
-- ============================================

-- ============================================
-- 1. Benchmark 分类表（树形结构）
-- ============================================

-- 移除旧的 enum 类型
DROP TYPE IF EXISTS benchmark_source CASCADE;

-- 创建新的分类表
CREATE TABLE benchmark_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR NOT NULL UNIQUE,
  name_cn VARCHAR, -- 中文名称
  parent_id UUID REFERENCES benchmark_categories(id) ON DELETE CASCADE,

  description TEXT,
  icon VARCHAR, -- UI 图标（如 'code', 'robot', 'car'）
  color VARCHAR, -- UI 颜色（如 '#185FA5'）

  sort_order INT DEFAULT 0, -- 排序权重

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 创建索引
CREATE INDEX idx_benchmark_categories_parent ON benchmark_categories(parent_id);
CREATE INDEX idx_benchmark_categories_sort ON benchmark_categories(sort_order);

-- 插入分类数据（三级结构）
INSERT INTO benchmark_categories (id, name, name_cn, description, icon, color, sort_order) VALUES

-- 第一级：三大类别
('cat-general', '通用能力', 'General Capabilities', '所有模型的通用能力测试', 'brain', '#185FA5', 1),
('cat-agent', 'Agent能力', 'Agent Capabilities', 'LLM 作为 Agent 的任务执行能力', 'agent', '#7C3AED', 2),
('cat-embodied', '具身和自动驾驶', 'Embodied AI & Autonomous Driving', '机器人和自动驾驶专用测试', 'robot', '#1D9E75', 3)

ON CONFLICT (id) DO NOTHING;

-- 第二级：通用能力子类
INSERT INTO benchmark_categories (id, name, name_cn, parent_id, description, icon, color, sort_order) VALUES
('cat-general-coding', '代码能力', 'Coding', 'cat-general', '代码生成、修复、优化能力', 'code', '#D97706', 1),
('cat-general-reasoning', '推理能力', 'Reasoning', 'cat-general', '逻辑推理、知识理解能力', 'brain', '#185FA5', 2),
('cat-general-knowledge', '知识理解', 'Knowledge', 'cat-general', '多领域知识理解能力', 'book', '#E85D24', 3),
('cat-general-preference', '人类偏好', 'Human Preference', 'cat-general', '人类偏好对齐测试', 'users', '#0891B2', 4)

ON CONFLICT (id) DO NOTHING;

-- 第二级：Agent 能力子类
INSERT INTO benchmark_categories (id, name, name_cn, parent_id, description, icon, color, sort_order) VALUES
('cat-agent-software', '软件工程', 'Software Engineering', 'cat-agent', '完整软件开发流程', 'laptop-code', '#7C3AED', 1),
('cat-agent-web', '网页交互', 'Web Interaction', 'cat-agent', '网页导航、信息提取', 'globe', '#E85D24', 2),
('cat-agent-tools', '工具调用', 'Tool Usage', 'cat-agent', 'API 调用、工具编排', 'tools', '#D97706', 3),
('cat-agent-planning', '任务规划', 'Task Planning', 'cat-agent', '多步骤任务规划', 'project-diagram', '#185FA5', 4)

ON CONFLICT (id) DO NOTHING;

-- 第二级：具身子类
INSERT INTO benchmark_categories (id, name, name_cn, parent_id, description, icon, color, sort_order) VALUES
('cat-embodied-robotics', '机器人', 'Robotics', 'cat-embodied', '人形机器人、机械臂', 'robot', '#1D9E75', 1),
('cat-embodied-av', '自动驾驶', 'Autonomous Driving', 'cat-embodied', 'L2-L4 自动驾驶', 'car', '#E24B4A', 2)

ON CONFLICT (id) DO NOTHING;

-- 第三级：机器人子类
INSERT INTO benchmark_categories (id, name, name_cn, parent_id, description, icon, color, sort_order) VALUES
('cat-robotics-manipulation', '操控能力', 'Manipulation', 'cat-embodied-robotics', '双臂操控、灵巧度', 'hand-paper', '#1D9E75', 1),
('cat-robotics-navigation', '导航能力', 'Navigation', 'cat-embodied-robotics', '环境导航、避障', 'map-marked-alt', '#185FA5', 2),
('cat-robotics-planning', '任务规划', 'Task Planning', 'cat-embodied-robotics', '复杂任务规划', 'tasks', '#7C3AED', 3),
('cat-robotics-generalization', '泛化能力', 'Generalization', 'cat-embodied-robotics', '跨本体泛化', 'random', '#D97706', 4),
('cat-robotics-realworld', '真实世界', 'Real-world', 'cat-embodied-robotics', '真实环境部署成功率', 'check-circle', '#E85D24', 5)

ON CONFLICT (id) DO NOTHING;

-- 第三级：自动驾驶子类
INSERT INTO benchmark_categories (id, name, name_cn, parent_id, description, icon, color, sort_order) VALUES
('cat-av-perception', '感知能力', 'Perception', 'cat-embodied-av', '环境感知、物体识别', 'eye', '#185FA5', 1),
('cat-av-planning', '规划能力', 'Planning', 'cat-embodied-av', '路径规划、决策', 'route', '#7C3AED', 2),
('cat-av-control', '控制能力', 'Control', 'cat-embodied-av', '车辆控制、稳定性', 'sliders-h', '#D97706', 3),
('cat-av-safety', '安全性', 'Safety', 'cat-embodied-av', '碰撞率、脱离率', 'shield-alt', '#E24B4A', 4),
('cat-av-simulation', '仿真测试', 'Simulation', 'cat-embodied-av', '闭环仿真成功率', 'vr-cardboard', '#0891B2', 5),
('cat-av-realworld', '真实世界', 'Real-world', 'cat-embodied-av', '实际道路测试', 'road', '#1D9E75', 6)

ON CONFLICT (id) DO NOTHING;

-- ============================================
-- 2. 更新 benchmarks 表
-- ============================================

-- 先备份旧数据
CREATE TABLE benchmarks_backup AS SELECT * FROM benchmarks;

-- 删除旧表
DROP TABLE IF EXISTS benchmarks CASCADE;

-- 创建新的 benchmarks 表
CREATE TABLE benchmarks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR NOT NULL UNIQUE,
  name_cn VARCHAR, -- 中文名称
  category_id UUID NOT NULL REFERENCES benchmark_categories(id) ON DELETE RESTRICT,

  -- Benchmark 描述
  description TEXT,
  description_cn TEXT,

  -- 评分相关
  max_score INT DEFAULT 100,
  unit VARCHAR DEFAULT 'percentage', -- percentage, score, time, miles, etc.
  higher_is_better BOOLEAN DEFAULT TRUE, -- 分数越高越好？

  -- Benchmark 来源和可信度
  official_url TEXT, -- 官方网站
  paper_url TEXT, -- 论文链接
  benchmark_source VARCHAR, -- 'official', 'community', 'research'

  -- 适用模型类型
  applicable_model_types VARCHAR[], -- ['LLM', 'Robotics', 'AV']

  -- 元数据
  is_active BOOLEAN DEFAULT TRUE, -- 是否还在维护
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  -- 约束
  CONSTRAINT valid_unit CHECK (unit IN ('percentage', 'score', 'time', 'miles', 'rate', 'elo', 'tasks'))
);

-- 创建索引
CREATE INDEX idx_benchmarks_category ON benchmarks(category_id);
CREATE INDEX idx_benchmarks_active ON benchmarks(is_active);
CREATE INDEX idx_benchmarks_name ON benchmarks(name);

-- ============================================
-- 3. 插入 Benchmark 数据（分类整理）
-- ============================================

-- ===== 通用能力 - 代码能力 =====
INSERT INTO benchmarks (name, name_cn, category_id, description, description_cn, unit, applicable_model_types, benchmark_source, official_url) VALUES

('SWE-bench', '软件工程基准', 'cat-general-coding',
 'Real-world software engineering tasks from GitHub issues',
 '来自 GitHub issue 的真实软件工程任务，测试代码生成和 bug 修复能力',
 'percentage', ARRAY['LLM'], 'official', 'https://www.swebench.com/'),

('HumanEval', '人类评估代码基准', 'cat-general-coding',
 'Hand-written programming problems for code generation',
 '手写编程问题，测试代码生成能力',
 'percentage', ARRAY['LLM'], 'research', 'https://github.com/openai/human-eval'),

('MBPP', '多数编程问题基准', 'cat-general-coding',
 'Mostly Basic Python Problems for code generation',
 '基础 Python 编程问题',
 'percentage', ARRAY['LLM'], 'community', 'https://github.com/google-research-datasets/mbpp'),

('CodeContests', '代码竞赛基准', 'cat-general-coding',
 'Competitive programming problems from Codeforces',
 '来自 Codeforces 的竞赛编程题目',
 'score', ARRAY['LLM'], 'research', 'https://github.com/google-deepmind/code_contests'),

('DS-1000', '数据科学基准', 'cat-general-coding',
 'Data science problems in Python',
 'Python 数据科学问题',
 'percentage', ARRAY['LLM'], 'research', 'https://github.com/xlang-ai/DS-1000');

-- ===== 通用能力 - 推理能力 =====
INSERT INTO benchmarks (name, name_cn, category_id, description, description_cn, unit, applicable_model_types, benchmark_source, official_url) VALUES

('MMLU', '大规模多任务语言理解', 'cat-general-reasoning',
 'Massive Multitask Language Understanding - 57 subjects',
 '57 个学科的大规模多任务语言理解测试',
 'percentage', ARRAY['LLM'], 'official', 'https://github.com/hendrycks/test'),

('MATH', '数学推理基准', 'cat-general-reasoning',
 'Mathematics Aptitude Test of Heuristics',
 '数学推理能力测试',
 'percentage', ARRAY['LLM'], 'research', 'https://github.com/hendrycks/math'),

('GSM8K', '小学数学基准', 'cat-general-reasoning',
 'Grade School Math 8K - Multi-step arithmetic reasoning',
 '8K 小学数学题，测试多步算术推理',
 'percentage', ARRAY['LLM'], 'community', 'https://github.com/openai/grade-school-math'),

('ARC-AGI', '抽象推理语料库', 'cat-general-reasoning',
 'Abstraction and Reasoning Corpus - AGI benchmark',
 '抽象推理语料库，测试 AGI 能力',
 'percentage', ARRAY['LLM'], 'official', 'https://github.com/fchollet/ARC-AGI'),

('GPQA', '研究生级别问题基准', 'cat-general-reasoning',
 'Graduate-Level Google-Proof Q&A',
 '研究生级别的专家级问题',
 'percentage', ARRAY['LLM'], 'research', 'https://github.com/idavidrein/gpqa'),

('BBH', 'Big-Bench Hard', 'cat-general-reasoning',
 '23 challenging BigBench tasks',
 '23 个具有挑战性的 BigBench 任务',
 'percentage', ARRAY['LLM'], 'research', 'https://github.com/suzgunmirac/BIG-Bench-Hard');

-- ===== 通用能力 - 知识理解 =====
INSERT INTO benchmarks (name, name_cn, category_id, description, description_cn, unit, applicable_model_types, benchmark_source, official_url) VALUES

('TriviaQA', '琐事问答基准', 'cat-general-knowledge',
 'Reading comprehension with trivia questions',
 '琐事问答的阅读理解测试',
 'percentage', ARRAY['LLM'], 'research', 'https://github.com/mandarjoshi90/triviaqa'),

('NaturalQuestions', '自然问题基准', 'cat-general-knowledge',
 'Natural questions from Google search',
 '来自 Google 搜索的真实问题',
 'percentage', ARRAY['LLM'], 'official', 'https://ai.google.com/research/NaturalQuestions'),

('Wikipedia', '维基百科知识', 'cat-general-knowledge',
 'Wikipedia-based knowledge questions',
 '基于维基百科的知识问答',
 'percentage', ARRAY['LLM'], 'community', NULL);

-- ===== 通用能力 - 人类偏好 =====
INSERT INTO benchmarks (name, name_cn, category_id, description, description_cn, unit, applicable_model_types, benchmark_source, official_url) VALUES

('Arena ELO', 'LM Arena 人类偏好评分', 'cat-general-preference',
 'LMSYS Chatbot Arena - Human preference rating',
 'LMSYS 聊天机器人竞技场，人类偏好评分',
 'elo', ARRAY['LLM'], 'community', 'https://chat.lmsys.org/'),

('AlpacaEval', '羊驼评估基准', 'cat-general-preference',
 'AlpacaEval - Automatic evaluation of LLMs',
 'LLM 自动评估基准',
 'percentage', ARRAY['LLM'], 'community', 'https://github.com/tatsu-lab/alpaca_eval'),

('MT-Bench', '多轮对话基准', 'cat-general-preference',
 'Multi-turn conversation benchmark',
 '多轮对话能力测试',
 'score', ARRAY['LLM'], 'research', 'https://github.com/lm-sys/FastChat');

-- ===== Agent 能力 - 软件工程 =====
INSERT INTO benchmarks (name, name_cn, category_id, description, description_cn, unit, applicable_model_types, benchmark_source, official_url) VALUES

('SWE-Pro', '软件工程代理基准', 'cat-agent-software',
 'Software Engineering Professional benchmark',
 '专业软件工程基准，测试完整开发流程',
 'percentage', ARRAY['LLM'], 'community', NULL),

('MLE-Bench', '机器学习工程基准', 'cat-agent-software',
 'Machine Learning Engineering benchmark',
 '机器学习工程能力测试',
 'percentage', ARRAY['LLM'], 'research', NULL),

('DevBench', '开发基准', 'cat-agent-software',
 'Full-stack development tasks',
 '全栈开发任务测试',
 'tasks', ARRAY['LLM'], 'research', NULL),

('GitBench', 'Git 操作基准', 'cat-agent-software',
 'Git operations and version control',
 'Git 操作和版本控制能力',
 'tasks', ARRAY['LLM'], 'community', NULL);

-- ===== Agent 能力 - 网页交互 =====
INSERT INTO benchmarks (name, name_cn, category_id, description, description_cn, unit, applicable_model_types, benchmark_source, official_url) VALUES

('WebShop', '网页购物基准', 'cat-agent-web',
 'Web navigation and shopping tasks',
 '网页导航和购物任务',
 'tasks', ARRAY['LLM'], 'research', 'https://webshop-pithub.github.io/'),

('WebArena', '网页竞技场', 'cat-agent-web',
 'Real-world web interaction benchmark',
 '真实网页交互基准',
 'tasks', ARRAY['LLM'], 'research', 'https://webarena.dev/'),

('Mind2Web', '思维到网页', 'cat-agent-web',
 'Turn instructions into web actions',
 '将指令转换为网页操作',
 'percentage', ARRAY['LLM'], 'research', 'https://osu-nlp-group.github.io/Mind2Web/');

-- ===== Agent 能力 - 工具调用 =====
INSERT INTO benchmarks (name, name_cn, category_id, description, description_cn, unit, applicable_model_types, benchmark_source, official_url) VALUES

('ToolBench', '工具基准', 'cat-agent-tools',
 'Tool learning and API usage',
 '工具学习和 API 调用能力',
 'percentage', ARRAY['LLM'], 'research', 'https://github.com/OpenBMB/ToolBench'),

('API-Bank', 'API 银行', 'cat-agent-tools',
 'API calling and orchestration',
 'API 调用和编排能力',
 'tasks', ARRAY['LLM'], 'research', 'https://api-bank.com/'),

('ToolAlpaca', '工具羊驼', 'cat-agent-tools',
 'Generalizable tool use',
 '通用工具使用能力',
 'percentage', ARRAY['LLM'], 'community', NULL);

-- ===== Agent 能力 - 任务规划 =====
INSERT INTO benchmarks (name, name_cn, category_id, description, description_cn, unit, applicable_model_types, benchmark_source, official_url) VALUES

('AgentBench', '代理基准', 'cat-agent-planning',
 'Multi-task agent benchmark',
 '多任务 Agent 基准',
 'score', ARRAY['LLM'], 'research', 'https://github.com/THUDM/AgentBench'),

('AgentInstruct', '代理指令', 'cat-agent-planning',
 'Instruction following for agents',
 'Agent 指令遵循能力',
 'percentage', ARRAY['LLM'], 'community', NULL),

('PlanBench', '规划基准', 'cat-agent-planning',
 'Multi-step planning tasks',
 '多步骤规划任务',
 'tasks', ARRAY['LLM'], 'research', NULL);

-- ===== 具身 - 机器人 - 操控能力 =====
INSERT INTO benchmarks (name, name_cn, category_id, description, description_cn, unit, applicable_model_types, benchmark_source, official_url) VALUES

('Manipulation', '操控成功率', 'cat-robotics-manipulation',
 'Robotic manipulation success rate',
 '机器人操控任务成功率',
 'percentage', ARRAY['Robotics'], 'community', NULL),

('Dexterity', '灵巧度', 'cat-robotics-manipulation',
 'Bimanual dexterity score',
 '双臂灵巧度评分',
 'score', ARRAY['Robotics'], 'research', NULL),

('GraspNet', '抓取基准', 'cat-robotics-manipulation',
 'Object grasping benchmark',
 '物体抓取基准测试',
 'percentage', ARRAY['Robotics'], 'research', NULL);

-- ===== 具身 - 机器人 - 导航能力 =====
INSERT INTO benchmarks (name, name_cn, category_id, description, description_cn, unit, applicable_model_types, benchmark_source, official_url) VALUES

('Navigation', '导航成功率', 'cat-robotics-navigation',
 'Autonomous navigation success rate',
 '自主导航成功率',
 'percentage', ARRAY['Robotics'], 'community', NULL),

('PointNav', '点导航', 'cat-robotics-navigation',
 'Point-to-point navigation',
 '点到点导航测试',
 'percentage', ARRAY['Robotics'], 'research', NULL),

('ObjectNav', '物体导航', 'cat-robotics-navigation',
 'Object goal navigation',
 '目标物体导航',
 'percentage', ARRAY['Robotics'], 'research', NULL),

('Habitat', 'Habitat 导航', 'cat-robotics-navigation',
 'Habitat simulation benchmark',
 'Habitat 仿真导航基准',
 'percentage', ARRAY['Robotics'], 'research', 'https://aihabitat.org/');

-- ===== 具身 - 机器人 - 任务规划 =====
INSERT INTO benchmarks (name, name_cn, category_id, description, description_cn, unit, applicable_model_types, benchmark_source, official_url) VALUES

('Planning', '任务规划成功率', 'cat-robotics-planning',
 'Task planning success rate',
 '任务规划成功率',
 'percentage', ARRAY['Robotics'], 'community', NULL),

('LongHorizon', '长视野规划', 'cat-robotics-planning',
 'Long-horizon task planning',
 '长视野任务规划',
 'tasks', ARRAY['Robotics'], 'research', NULL),

('BehaviorBench', '行为基准', 'cat-robotics-planning',
 'Behavior cloning benchmark',
 '行为克隆基准',
 'percentage', ARRAY['Robotics'], 'community', NULL);

-- ===== 具身 - 机器人 - 泛化能力 =====
INSERT INTO benchmarks (name, name_cn, category_id, description, description_cn, unit, applicable_model_types, benchmark_source, official_url) VALUES

('Generalization', '泛化成功率', 'cat-robotics-generalization',
 'Cross-embodiment generalization',
 '跨本体泛化能力',
 'percentage', ARRAY['Robotics'], 'community', NULL),

('CrossBody', '跨本体', 'cat-robotics-generalization',
 'Cross-robot transfer success',
 '跨机器人迁移成功率',
 'percentage', ARRAY['Robotics'], 'research', NULL),

('Sim2Real', '仿真到真实', 'cat-robotics-generalization',
 'Simulation-to-real transfer rate',
 '仿真到真实世界迁移率',
 'percentage', ARRAY['Robotics'], 'research', NULL);

-- ===== 具身 - 机器人 - 真实世界 =====
INSERT INTO benchmarks (name, name_cn, category_id, description, description_cn, unit, applicable_model_types, benchmark_source, official_url) VALUES

('RealWorld-Robotics', '真实世界机器人', 'cat-robotics-realworld',
 'Real-world deployment success rate',
 '真实世界部署成功率',
 'percentage', ARRAY['Robotics'], 'community', NULL),

('FactoryDeploy', '工厂部署', 'cat-robotics-realworld',
 'Factory floor deployment success',
 '工厂产线部署成功率',
 'rate', ARRAY['Robotics'], 'vendor', NULL),

('UnitsShipped', '出货量', 'cat-robotics-realworld',
 'Commercial units shipped',
 '商业出货量',
 'tasks', ARRAY['Robotics'], 'vendor', NULL);

-- ===== 具身 - 自动驾驶 - 感知能力 =====
INSERT INTO benchmarks (name, name_cn, category_id, description, description_cn, unit, applicable_model_types, benchmark_source, official_url) VALUES

('Perception-Accuracy', '感知准确率', 'cat-av-perception',
 'Environment perception accuracy',
 '环境感知准确率',
 'percentage', ARRAY['AV'], 'community', NULL),

('ObjectDetection', '物体检测', 'cat-av-perception',
 'Object detection mAP',
 '物体检测 mAP',
 'percentage', ARRAY['AV'], 'research', NULL),

('LaneDetection', '车道检测', 'cat-av-perception',
 'Lane detection accuracy',
 '车道检测准确率',
 'percentage', ARRAY['AV'], 'research', NULL),

('NuScenes', 'nuScenes 检测', 'cat-av-perception',
 'NuScenes detection benchmark',
 'nuScenes 检测基准',
 'score', ARRAY['AV'], 'official', 'https://www.nuscenes.org/');

-- ===== 具身 - 自动驾驶 - 规划能力 =====
INSERT INTO benchmarks (name, name_cn, category_id, description, description_cn, unit, applicable_model_types, benchmark_source, official_url) VALUES

('Planning-Accuracy', '规划准确率', 'cat-av-planning',
 'Path planning accuracy',
 '路径规划准确率',
 'percentage', ARRAY['AV'], 'community', NULL),

('MotionPrediction', '运动预测', 'cat-av-planning',
 'Motion prediction accuracy',
 '运动预测准确率',
 'percentage', ARRAY['AV'], 'research', NULL),

('RouteEfficiency', '路径效率', 'cat-av-planning',
 'Route efficiency score',
 '路径效率评分',
 'score', ARRAY['AV'], 'community', NULL);

-- ===== 具身 - 自动驾驶 - 控制能力 =====
INSERT INTO benchmarks (name, name_cn, category_id, description, description_cn, unit, applicable_model_types, benchmark_source, official_url) VALUES

('Control-Precision', '控制精度', 'cat-av-control',
 'Vehicle control precision',
 '车辆控制精度',
 'percentage', ARRAY['AV'], 'community', NULL),

('Stability', '稳定性', 'cat-av-control',
 'Driving stability score',
 '驾驶稳定性评分',
 'score', ARRAY['AV'], 'community', NULL),

('Comfort', '舒适性', 'cat-av-control',
 'Ride comfort score',
 '乘坐舒适性评分',
 'score', ARRAY['AV'], 'community', NULL);

-- ===== 具身 - 自动驾驶 - 安全性 =====
INSERT INTO benchmarks (name, name_cn, category_id, description, description_cn, unit, applicable_model_types, benchmark_source, official_url) VALUES

('Collision-Rate', '碰撞率', 'cat-av-safety',
 'Collision rate per million miles',
 '每百万英里碰撞率',
 'rate', ARRAY['AV'], 'vendor', NULL),

('Disengagement-Rate', '脱离率', 'cat-av-safety',
 'Disengagements per 1,000 miles',
 '每千英里脱离次数',
 'rate', ARRAY['AV'], 'vendor', NULL),

('L4-Miles', 'L4 里程', 'cat-av-safety',
 'L4 autonomous miles driven',
 'L4 自动驾驶里程',
 'miles', ARRAY['AV'], 'vendor', NULL),

('Safety-Events', '安全事件', 'cat-av-safety',
 'Safety-critical events count',
 '安全关键事件数量',
 'tasks', ARRAY['AV'], 'vendor', NULL);

-- ===== 具身 - 自动驾驶 - 仿真测试 =====
INSERT INTO benchmarks (name, name_cn, category_id, description, description_cn, unit, applicable_model_types, benchmark_source, official_url) VALUES

('ClosedLoop-Sim', '闭环仿真', 'cat-av-simulation',
 'Closed-loop simulation success rate',
 '闭环仿真成功率',
 'percentage', ARRAY['AV'], 'community', NULL),

('CARLA', 'CARLA 仿真', 'cat-av-simulation',
 'CARLA simulation benchmark',
 'CARLA 仿真基准',
 'percentage', ARRAY['AV'], 'research', 'https://carla.org/'),

('Waymo-Open', 'Waymo 开放数据集', 'cat-av-simulation',
 'Waymo Open Dataset benchmark',
 'Waymo 开放数据集基准',
 'score', ARRAY['AV'], 'official', 'https://waymo.com/open/');

-- ===== 具身 - 自动驾驶 - 真实世界 =====
INSERT INTO benchmarks (name, name_cn, category_id, description, description_cn, unit, applicable_model_types, benchmark_source, official_url) VALUES

('RealWorld-AV', '真实世界自动驾驶', 'cat-av-realworld',
 'Real-world autonomous driving success',
 '真实世界自动驾驶成功率',
 'percentage', ARRAY['AV'], 'vendor', NULL),

('Commercial-Rides', '商业乘坐', 'cat-av-realworld',
 'Commercial robotaxi rides',
 '商业 robotaxi 乘坐次数',
 'tasks', ARRAY['AV'], 'vendor', NULL),

('Geofence-Coverage', '地理围栏覆盖', 'cat-av-realworld',
 'Operational geofence area size',
 '运营地理围栏面积',
 'miles', ARRAY['AV'], 'vendor', NULL);

-- ============================================
-- 4. 更新 model_benchmarks 表
-- ============================================

-- 添加新字段
ALTER TABLE model_benchmarks
ADD COLUMN IF NOT EXISTS is_official BOOLEAN DEFAULT FALSE, -- 是否官方发布
ADD COLUMN IF NOT EXISTS notes TEXT; -- 测试条件说明

-- 更新注释
COMMENT ON TABLE benchmarks IS 'Benchmark 定义表，包含 3 大类 50+ 子类';
COMMENT ON TABLE benchmark_categories IS 'Benchmark 分类树形结构';
COMMENT ON TABLE model_benchmarks IS '模型 Benchmark 记录，支持历史追踪和来源验证';

-- ============================================
-- 5. 创建视图：分类统计
-- ============================================

CREATE VIEW benchmark_category_stats AS
WITH RECURSIVE category_tree AS (
  -- 根节点
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

  -- 子节点
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

-- ============================================
-- 6. 查询示例
-- ============================================

-- 查询所有顶级分类及其 benchmark 数量
SELECT
  name AS category,
  name_cn,
  benchmark_count,
  depth
FROM benchmark_category_stats
WHERE depth = 0
ORDER BY sort_order;

-- 查询"通用能力 - 代码能力"下的所有 benchmark
SELECT
  b.name,
  b.description,
  b.unit,
  b.benchmark_source
FROM benchmarks b
JOIN benchmark_categories bc ON b.category_id = bc.id
WHERE bc.id = 'cat-general-coding'
ORDER BY b.name;

-- 查询某个模型的所有代码能力 benchmark
SELECT
  bc.name AS category,
  b.name AS benchmark,
  mb.score,
  mb.source,
  mb.tested_at
FROM model_benchmarks mb
JOIN benchmarks b ON mb.benchmark_id = b.id
JOIN benchmark_categories bc ON b.category_id = bc.id
WHERE mb.model_id = 'model-uuid'
  AND bc.parent_id = 'cat-general-coding' -- 或使用 bc.id IN (SELECT id FROM benchmark_categories WHERE parent_id = 'cat-general-coding')
ORDER BY mb.tested_at DESC;

-- 查询某个机器人的所有 benchmark（按子类分组）
SELECT
  bc_parent.name_cn AS 大类,
  bc_child.name_cn AS 子类,
  b.name_cn AS benchmark,
  mb.score,
  mb.unit
FROM model_benchmarks mb
JOIN benchmarks b ON mb.benchmark_id = b.id
JOIN benchmark_categories bc_child ON b.category_id = bc_child.id
JOIN benchmark_categories bc_parent ON bc_child.parent_id = bc_parent.id
WHERE mb.model_id = 'robot-model-uuid'
  AND bc_parent.parent_id = 'cat-embodied-robotics'
ORDER BY bc_parent.sort_order, bc_child.sort_order;

-- ============================================
-- 完成
-- ============================================
-- 总计：
-- - 3 个顶级分类
-- - 12 个二级分类
-- - 11 个三级分类（机器人 5 个，自动驾驶 6 个）
-- - 60+ 个 benchmark 定义
-- ============================================
