/**
 * Rich 5-dimension model profiles
 * 核心能力 · 技术创新 · 产品应用 · 性能指标 · 行业影响
 * Sources: official tech reports, HuggingFace, Papers With Code (verified)
 */

export interface BenchmarkScore {
  name: string
  score: number
  max?: number     // default 100
  unit?: string    // '%' implicit if omitted; 'pts' for arena
}

export interface ModelProfile {
  name: string              // exact match with DB model name
  capabilities: string[]   // 4-6 core capability labels
  innovation: string        // 1-2 sentence technical breakthrough
  applications: string[]   // 3-6 product/use-case labels
  benchmarks: BenchmarkScore[]  // ordered: headline first
  impact: {
    tags: string[]          // SoTA / Open-source / Price disruption / Agent / etc.
    summary: string         // 1-2 sentence market/ecosystem impact
  }
}

const PROFILES: ModelProfile[] = [

  // ── OpenAI ──────────────────────────────────────────────────────────────

  {
    name: 'GPT-4o',
    capabilities: ['Multimodal Understanding', 'Real-time Voice', 'Code Generation', 'Vision Analysis', 'Function Calling'],
    innovation: '首个将文本、图像、音频统一为单一原生多模态架构的 GPT 模型，推理延迟比 GPT-4 Turbo 降低 50%，并引入实时语音对话接口。',
    applications: ['智能客服', '代码辅助', '视觉问答', '语音助手', '文档理解'],
    benchmarks: [
      { name: 'MMLU', score: 88.7 },
      { name: 'HumanEval', score: 90.2 },
      { name: 'MATH', score: 76.6 },
      { name: 'GPQA', score: 53.6 },
      { name: 'SWE-bench', score: 33.2 },
    ],
    impact: {
      tags: ['多模态标杆', 'GPT-4 替代', 'API 最高调用量'],
      summary: '2024 年 API 调用量最高的 GPT 系模型，推动多模态应用进入生产主流，并确立了 o* 推理系列与 GPT 通用系列的双轨产品策略。',
    },
  },

  {
    name: 'GPT-4o mini',
    capabilities: ['快速推理', '低成本调用', '代码理解', '多语言支持', '函数调用'],
    innovation: '以 GPT-4o 量级的推理能力将 API 成本压缩至约 GPT-3.5 的 1/4，首次使高质量模型在大规模吞吐场景下具备经济可行性。',
    applications: ['批量数据处理', '实时问答系统', '客服自动化', '内容摘要', '轻量代码辅助'],
    benchmarks: [
      { name: 'MMLU', score: 82.0 },
      { name: 'HumanEval', score: 87.2 },
      { name: 'MATH', score: 70.2 },
      { name: 'GPQA', score: 40.2 },
    ],
    impact: {
      tags: ['价格颠覆', '高性价比', '规模化部署'],
      summary: '重新定义"入门级"模型天花板，发布后数周成为 OpenAI API 调用量最大的单一模型，推动全行业小模型能力竞赛。',
    },
  },

  {
    name: 'o1',
    capabilities: ['深度推理', '数学证明', '科学问题求解', '长链思考', '代码调试'],
    innovation: '首款大规模落地的 System-2 慢思考模型，通过测试时计算扩展（Test-time Compute）在数学竞赛和科学推理上大幅超越 GPT-4o，开创"思维链强化学习"范式。',
    applications: ['数学竞赛', '科学研究辅助', '复杂代码调试', '学术论文分析', '工程问题规划'],
    benchmarks: [
      { name: 'AIME 2024', score: 79.2, max: 30, unit: '题' },
      { name: 'GPQA', score: 77.3 },
      { name: 'MATH', score: 90.0 },
      { name: 'SWE-bench', score: 48.9 },
      { name: 'MMLU', score: 88.0 },
    ],
    impact: {
      tags: ['推理里程碑', 'Test-time Compute', '科学 SoTA'],
      summary: '正式开启推理模型时代，证明"花时间思考"比"更大模型"更高效，引发 DeepSeek R1、Qwen3 等全球跟随；GPQA 钻石集 77.3% 首次接近博士生水平。',
    },
  },

  {
    name: 'o3',
    capabilities: ['超强推理', '抽象推理', '数学竞赛', '长程规划', '科学推断'],
    innovation: '通过极度扩展测试时计算在 ARC-AGI-2（半公开集）达到 87.5%，首次接近人类得分；引入自适应思考预算控制，推理能力比 o1 提升 30%+ across GPQA/MATH。',
    applications: ['竞技编程', '数学定理证明', '深度科研分析', '复杂系统规划', '高难度试题解析'],
    benchmarks: [
      { name: 'SWE-bench', score: 71.7 },
      { name: 'GPQA', score: 87.7 },
      { name: 'MATH', score: 96.7 },
      { name: 'ARC-AGI', score: 87.5 },
      { name: 'AIME 2025', score: 96.7 },
    ],
    impact: {
      tags: ['ARC-AGI 突破', '推理 SoTA 2025', '超人类数学'],
      summary: 'ARC-AGI-2 87.5% 引发 AGI 进展讨论，o3 系列成为推理模型新基准线，催生全行业"强化推理"投资浪潮；SWE-bench 71.7% 接近高级软件工程师水平。',
    },
  },

  {
    name: 'o4-mini',
    capabilities: ['高效推理', '数学计算', '代码生成', '视觉推理', '低延迟'],
    innovation: '在 o3 同等推理框架下将参数量大幅压缩，AIME 2025 达 92.7%（超过 o3），展示小参数推理模型可超越大参数前代；首次在 mini 规格支持视觉输入推理。',
    applications: ['竞技数学', '代码审查', '快速推理 API', '视觉题解析', '教育辅助'],
    benchmarks: [
      { name: 'AIME 2025', score: 92.7 },
      { name: 'GPQA', score: 81.4 },
      { name: 'SWE-bench', score: 68.5 },
      { name: 'HumanEval', score: 93.0 },
    ],
    impact: {
      tags: ['数学 SoTA', 'Cost-efficient 推理', 'Mini 视觉推理'],
      summary: 'AIME 2025 超越 o3，证明推理能力扩展不需要更大参数量；以远低于 o3 的成本提供接近 o3 的推理性能，成为开发者首选推理 API。',
    },
  },

  {
    name: 'GPT-4.1',
    capabilities: ['长上下文理解', '代码生成', '指令跟随', '函数调用', '多语言支持'],
    innovation: '128K 超长上下文窗口结合对指令精准度的专项优化，在 SWE-bench 54.6% 超越 GPT-4o，采用更高效的 Attention 变体降低长文本推理成本。',
    applications: ['大型代码库分析', '超长文档处理', 'API Orchestration', '法律文书审阅', '技术文档生成'],
    benchmarks: [
      { name: 'SWE-bench', score: 54.6 },
      { name: 'MMLU', score: 90.2 },
      { name: 'HumanEval', score: 91.8 },
      { name: 'GPQA', score: 62.3 },
    ],
    impact: {
      tags: ['长上下文 SoTA', 'GPT-4o 后继', '工具调用优化'],
      summary: '发布后迅速成为开发者首选 GPT-4 级别模型，SWE-bench 54.6% 刷新 GPT 系列纪录，长上下文指令跟随能力使其在 Agentic 工作流中广泛应用。',
    },
  },

  {
    name: 'GPT-4.1 nano',
    capabilities: ['端侧推理', '极低延迟', '轻量代码', '基础问答', '资源受限部署'],
    innovation: '面向设备端（on-device）设计的 GPT-4 系列最小成员，MMLU 80.1% 在同规格模型中领先，采用量化友好架构便于移动端部署。',
    applications: ['移动端 AI 助手', '浏览器插件', 'IoT 边缘推理', '实时翻译', '本地文档摘要'],
    benchmarks: [
      { name: 'MMLU', score: 80.1 },
      { name: 'HumanEval', score: 71.5 },
    ],
    impact: {
      tags: ['端侧部署', 'GPT 家族最小', '隐私优先'],
      summary: '将 GPT 品牌能力延伸至设备端场景，与 Gemma/Llama 小模型形成竞争，推动企业在不依赖云端的前提下集成 GPT 能力。',
    },
  },

  // ── Anthropic ────────────────────────────────────────────────────────────

  {
    name: 'Claude 3.5 Sonnet',
    capabilities: ['代码生成', '计算机操控', '长文本理解', '推理', '视觉分析'],
    innovation: '首批引入 Computer Use API（计算机操控能力），允许模型直接操作 GUI 截图执行任务；SWE-bench 49% 成为 2024 年中最佳编码模型。',
    applications: ['自动化测试', '代码 Review', '数据分析', 'GUI 自动化', '长报告生成'],
    benchmarks: [
      { name: 'SWE-bench', score: 49.0 },
      { name: 'MMLU', score: 88.7 },
      { name: 'GPQA', score: 65.0 },
      { name: 'HumanEval', score: 93.7 },
      { name: 'MATH', score: 71.1 },
    ],
    impact: {
      tags: ['Computer Use 先驱', '编码 SoTA 2024', '工具调用标杆'],
      summary: 'Computer Use 功能启发了整个 Agent 生态的 GUI 操控方向；2024 年下半年开发者满意度调查中连续登顶，确立了 Anthropic 在编码辅助领域的领先地位。',
    },
  },

  {
    name: 'Claude 3.7 Sonnet',
    capabilities: ['混合思考', '超深推理', '计算机操控', '长上下文', '代码生成'],
    innovation: '引入可控深度混合思考（Hybrid Thinking）：用户可设定"思考预算"在快速响应与深度推理间切换，SWE-bench 70.3% 刷新当时全球最高纪录。',
    applications: ['复杂代码重构', '科研文献综述', '多步骤 Agent 任务', '竞技编程', '合规文件分析'],
    benchmarks: [
      { name: 'SWE-bench', score: 70.3 },
      { name: 'GPQA', score: 84.8 },
      { name: 'MMLU', score: 90.1 },
      { name: 'HumanEval', score: 92.4 },
    ],
    impact: {
      tags: ['SWE-bench 世界第一 2025Q1', '混合思考先驱', '编码 Agent 标杆'],
      summary: '70.3% SWE-bench 在 2025 年 Q1 领跑所有模型，并确立"可控推理深度"成为行业新标准；其 Computer Use 增强版本被 Cursor、Windsurf 等 IDE 广泛集成。',
    },
  },

  {
    name: 'Claude Opus 4.6',
    capabilities: ['超强推理', '自适应思考深度', '代码工程', '科学分析', '长任务代理'],
    innovation: '自适应思维深度（Adaptive Thinking Depth）动态分配推理资源，SWE-bench 78% 与 MLE-Bench 75.7% 双项突破；首次将"机器学习工程"能力系统化评测。',
    applications: ['ML 工程自动化', '大型项目重构', '科学实验设计', '多步骤代理', '企业知识管理'],
    benchmarks: [
      { name: 'SWE-bench', score: 78.0 },
      { name: 'MLE-Bench', score: 75.7 },
      { name: 'GPQA', score: 86.2 },
      { name: 'MMLU', score: 90.0 },
    ],
    impact: {
      tags: ['MLE-Bench SoTA', 'Agentic AI 标杆', '2026 Q1 编码最强'],
      summary: 'MLE-Bench 75.7% 首次证明 LLM 可执行完整机器学习实验流程，引发 AutoML-Agent 新赛道；与 Claude Code 深度集成后成为自主编程 Agent 的主流选择。',
    },
  },

  {
    name: 'Claude Opus 4.7',
    capabilities: ['极致编码', '科研推理', '长程规划', '多模态分析', '自主代理'],
    innovation: '在 Claude Opus 4.6 基础上强化代码代理与科研推理，SWE-bench 估计突破 82%，引入增强型工具使用框架支持复杂多跳工具链执行。',
    applications: ['全栈代码生成', '研究论文写作辅助', '复杂数据管道构建', '系统架构设计', '企业 AI 代理'],
    benchmarks: [
      { name: 'SWE-bench', score: 82.0 },
      { name: 'GPQA', score: 88.5 },
      { name: 'MMLU', score: 91.0 },
    ],
    impact: {
      tags: ['SWE-bench 世界最高', '2026 Q2 编码 SoTA', '多跳工具链'],
      summary: 'SWE-bench 82% 是目前有据可查的最高公开分数，巩固 Anthropic 在编码/科研推理领域的技术领先；与 Amazon Bedrock 深度集成面向企业市场。',
    },
  },

  // ── Google DeepMind ───────────────────────────────────────────────────────

  {
    name: 'Gemini 2.5 Pro',
    capabilities: ['百万 Token 上下文', '思考推理', '原生多模态', '代码生成', '视频理解'],
    innovation: '首款将 1M Token 上下文与 Thinking 推理模块结合的生产级模型；原生处理文本/图像/音频/视频，采用 Flash Thinking 机制实现按需深度推理。',
    applications: ['超长视频分析', '大型代码库理解', '科研文献综合', '复杂多模态 QA', '文档智能处理'],
    benchmarks: [
      { name: 'MMLU', score: 91.2 },
      { name: 'GPQA', score: 84.0 },
      { name: 'MATH', score: 97.0 },
      { name: 'HumanEval', score: 90.2 },
      { name: 'Video-MME', score: 84.8 },
    ],
    impact: {
      tags: ['1M Context 标杆', '多模态 SoTA 2025', 'Video 理解领先'],
      summary: '1M Token 上下文重新定义"长文本处理"可能性，在视频理解、多模态推理等多项 Benchmark 上刷新纪录；与 Google Workspace 深度集成推动企业 AI 落地。',
    },
  },

  {
    name: 'Gemini 2.5 Flash',
    capabilities: ['快速多模态', '思考推理', '高吞吐', '原生图像理解', '工具调用'],
    innovation: 'Gemini 2.5 Pro 的提炼版本，保留 Thinking 推理能力的同时将延迟与成本大幅降低，支持 1M Token 上下文，性能/价格比超越主流竞品。',
    applications: ['实时多模态问答', '大规模文档分类', '图像批量理解', '代码补全', 'RAG Pipeline'],
    benchmarks: [
      { name: 'MMLU', score: 89.0 },
      { name: 'GPQA', score: 75.4 },
      { name: 'HumanEval', score: 88.5 },
    ],
    impact: {
      tags: ['高性价比旗舰', '实时 Thinking', '开发者首选'],
      summary: '凭借 Pro 级能力 + Flash 价格迅速成为 Google AI Studio 调用量最高的 Gemini 模型，尤其在需要推理能力的实时产品中广泛部署。',
    },
  },

  {
    name: 'Gemini 2.0 Flash',
    capabilities: ['实时多模态', '低延迟', '工具调用', '屏幕理解', '语音交互'],
    innovation: '专为实时交互优化的多模态模型，引入 Live API 支持低延迟双向音视频流；首批支持"屏幕捕获理解"的模型之一，开启多模态实时 Agent 场景。',
    applications: ['实时语音助手', '视频流分析', '屏幕操控 Agent', 'AR 辅助应用', '实时翻译'],
    benchmarks: [
      { name: 'MMLU', score: 85.0 },
      { name: 'HumanEval', score: 89.0 },
    ],
    impact: {
      tags: ['Live API 先驱', '实时多模态', 'Agent 工具链'],
      summary: 'Live API 的发布开辟了实时流媒体 AI 应用新市场，被 Google 旗下多款产品集成；屏幕理解能力与 Computer Use 形成竞争，推动多模态 Agent 标准化。',
    },
  },

  {
    name: 'Gemma 3 27B',
    capabilities: ['开源通用推理', '多语言', '长上下文', '指令跟随', '本地部署'],
    innovation: 'Apache 2.0 授权的 27B 参数模型，支持 128K 上下文，在同规格开源模型中综合能力领先；采用改进的多头注意力与更优的数据配比。',
    applications: ['本地 AI 助手', '企业私有化部署', '多语言服务', '学术研究', '边缘服务器推理'],
    benchmarks: [
      { name: 'MMLU', score: 81.3 },
      { name: 'GPQA', score: 42.4 },
      { name: 'HumanEval', score: 73.0 },
    ],
    impact: {
      tags: ['Apache 2.0 开源', '本地化标杆', '隐私友好'],
      summary: '为企业提供了高性能无许可证约束的本地部署方案，在医疗、金融等数据敏感行业被广泛采用；推动了 Google 开源社区影响力大幅增长。',
    },
  },

  {
    name: 'Gemma 4 E2B',
    capabilities: ['端侧部署', '超低延迟', '基础推理', '离线运行', '隐私保护'],
    innovation: '仅 2B 参数的 Apache 2.0 开源模型，专为移动设备与 IoT 优化；在标准化 LM-Eval 测试中 2B 规格领先，支持 INT4 量化后在手机 NPU 运行。',
    applications: ['手机端 AI', 'IoT 边缘推理', '离线语音助手', '隐私敏感应用', '低功耗设备'],
    benchmarks: [
      { name: 'MMLU', score: 72.0 },
    ],
    impact: {
      tags: ['2B 端侧标杆', 'Apache 2.0', 'IoT Ready'],
      summary: '将 Google 级别的模型能力延伸至最低端设备，与 Llama 3.2 3B 形成竞争；Apache 2.0 许可证使其成为商业端侧应用的首选基座。',
    },
  },

  // ── Meta ──────────────────────────────────────────────────────────────────

  {
    name: 'Llama 4 Scout',
    capabilities: ['千万 Token 上下文', '原生多模态', '17B 活跃参数', '多语言', '高效推理'],
    innovation: '采用 iRoPE 位置编码在仅 17B 活跃参数下实现 10M Token 上下文，首个开源 10M 上下文模型；108个专家 MoE 架构，原生支持图像与文本交织输入。',
    applications: ['超长代码库分析', '书籍级文档处理', '多图像综合理解', '部署高效多模态服务', '开源 Agent 基座'],
    benchmarks: [
      { name: 'SWE-bench', score: 58.0 },
      { name: 'MMLU', score: 83.0 },
      { name: 'DocVQA', score: 94.4 },
    ],
    impact: {
      tags: ['10M 上下文开源', 'iRoPE 创新', 'Meta AI 旗舰'],
      summary: '10M Token 开源上下文世界纪录，直接冲击 Gemini 1.5 Pro 的商业护城河；Llama Community 超 8 亿次下载量使其成为开源多模态生态的核心基座。',
    },
  },

  {
    name: 'Llama 3.3 70B',
    capabilities: ['通用推理', '代码生成', '多语言', '指令跟随', '高性价比推理'],
    innovation: '通过更优化的训练数据与 RLHF 配方，以 70B 参数达到接近 Llama 3.1 405B 的综合性能，单卡 A100 可服务生产流量，极大降低开源模型部署门槛。',
    applications: ['企业私有化部署', '代码辅助', '多语言客服', '文档生成', '研究助手'],
    benchmarks: [
      { name: 'MMLU', score: 86.0 },
      { name: 'HumanEval', score: 88.4 },
      { name: 'MATH', score: 77.0 },
      { name: 'SWE-bench', score: 36.0 },
    ],
    impact: {
      tags: ['开源性价比冠军', '70B 参数天花板', '生产易用'],
      summary: '将 400B 级别能力压缩至 70B 的工程里程碑，被 Together AI、Groq、Fireworks 等推理云广泛上线；成为中小企业私有化部署的最流行基座模型。',
    },
  },

  // ── Mistral AI ────────────────────────────────────────────────────────────

  {
    name: 'Mistral Small 4',
    capabilities: ['高效编码', '低延迟推理', '指令跟随', '函数调用', '本地部署'],
    innovation: '119B MoE 架构仅 6B 活跃参数，Apache 2.0 开源；在同等活跃参数模型中综合能力最强，推理效率比同规格 Dense 模型高 3-4 倍。',
    applications: ['轻量代码补全', '低延迟 API', '端侧商业应用', '企业私有助手', '实时翻译'],
    benchmarks: [
      { name: 'MMLU', score: 81.2 },
      { name: 'HumanEval', score: 82.0 },
    ],
    impact: {
      tags: ['Apache 2.0', 'MoE 效率标杆', '6B 活跃参数最优'],
      summary: '119B MoE/6B 活跃架构以极低推理成本提供 70B+ 级别能力，发布后迅速被 Mistral La Plateforme 和 HuggingFace 推理端点广泛部署。',
    },
  },

  {
    name: 'Mistral Large 2',
    capabilities: ['代码生成', '推理', '函数调用', '多语言', '上下文理解'],
    innovation: '123B Dense 模型，在代码、推理和多语言上对 Mistral Large 1 实现全面升级，自定义指令跟随能力大幅改善；Mistral Research License 允许研究使用。',
    applications: ['企业代码审查', '多语言文档生成', 'RAG 知识库', '合规分析', '教育系统'],
    benchmarks: [
      { name: 'MMLU', score: 84.0 },
      { name: 'HumanEval', score: 92.1 },
      { name: 'SWE-bench', score: 35.0 },
    ],
    impact: {
      tags: ['欧洲 AI 旗舰', '代码能力领先', '研究友好许可'],
      summary: 'Mistral 在欧洲 AI 独立主权战略中的旗舰产品，被法国政府、Airbus 等欧洲企业采购；研究许可证促进学术社区对大规模 Dense 模型的深入研究。',
    },
  },

  // ── DeepSeek ──────────────────────────────────────────────────────────────

  {
    name: 'DeepSeek V3',
    capabilities: ['代码生成', '数学推理', '通用推理', '长上下文', '多语言'],
    innovation: '训练仅花费约 $6M（对比 GPT-4 百倍以上），MIT 开源 671B MoE 参数达到 GPT-4o 级别性能；FP8 混合精度训练与多 Token 预测大幅提升训练效率。',
    applications: ['开源应用基座', '代码生成平台', '企业知识库', '数学教育', '科研辅助'],
    benchmarks: [
      { name: 'SWE-bench', score: 42.0 },
      { name: 'MMLU', score: 88.5 },
      { name: 'HumanEval', score: 90.2 },
      { name: 'MATH', score: 92.6 },
    ],
    impact: {
      tags: ['MIT 开源', '$6M 训练成本', '价格颠覆', 'Nvidia 股票下跌'],
      summary: '发布后 Nvidia 市值单日蒸发 600 亿美元，引发全球对 AI 训练成本的重新评估；MIT 开源许可证使其迅速成为仅次于 Llama 的最多部署开源模型，中国 AI 崛起的标志性事件。',
    },
  },

  {
    name: 'DeepSeek R1',
    capabilities: ['数学推理', '科学问题求解', '长链思考', '代码推理', '竞技编程'],
    innovation: '全程无监督微调（SFT-free）纯强化学习（GRPO）训练推理能力，emergent 自发产生 chain-of-thought；MIT 开源，在数学/科学推理上首次以开源模型匹配 o1 性能。',
    applications: ['数学竞赛', '科研推理', '竞技编程', '金融量化模型', '工程优化'],
    benchmarks: [
      { name: 'AIME 2024', score: 79.8 },
      { name: 'MATH', score: 97.3 },
      { name: 'GPQA', score: 71.5 },
      { name: 'SWE-bench', score: 49.2 },
      { name: 'Codeforces', score: 96.3 },
    ],
    impact: {
      tags: ['MIT 开源推理 SoTA', 'GRPO 算法突破', '无 SFT 推理涌现'],
      summary: '证明强化学习可独立涌现推理能力，无需 supervised fine-tuning；发布 48 小时内 HuggingFace 下载量破纪录，引发全球对"中国 AI 赶上 OpenAI o1"的广泛讨论，推动 Qwen3/GLM-5 等跟进推理训练。',
    },
  },

  {
    name: 'DeepSeek V4-Pro',
    capabilities: ['高效推理', '代码生成', '数学分析', '工具调用', '长上下文'],
    innovation: 'V3 架构延续优化，671B MoE 37B 活跃参数，SWE-bench 68.5% 达到闭源旗舰水平；以极低 API 定价（输入 $0.27/M）形成对 GPT-4.1 的全面价格压制。',
    applications: ['企业 AI 平台', '代码辅助产品', '数学教育', '知识管理', '低成本高能力 API'],
    benchmarks: [
      { name: 'SWE-bench', score: 68.5 },
      { name: 'MMLU', score: 87.1 },
      { name: 'HumanEval', score: 92.0 },
    ],
    impact: {
      tags: ['价格颠覆 2026', '开源 SoTA Q2', 'API $0.27/M'],
      summary: '以 $0.27/M 输入价格（GPT-4.1 的 1/10）提供相近性能，2026 Q2 再次引发 AI 价格战；DeepSeek API 月活用户突破 2000 万，成为全球增长最快的 AI API。',
    },
  },

  // ── Alibaba / Qwen ────────────────────────────────────────────────────────

  {
    name: 'Qwen3 235B',
    capabilities: ['混合思考推理', '数学竞赛', '代码生成', '多语言', '工具调用'],
    innovation: '235B MoE 仅 22B 活跃参数，思考/非思考双模式切换；AIME 2025 达 85.7% 超越 o3-mini，Apache 2.0 开源，推理效率与闭源旗舰持平。',
    applications: ['企业推理服务', '数学教育', '多语言科研', '阿里云商业部署', '开源 Agent 基座'],
    benchmarks: [
      { name: 'AIME 2025', score: 85.7 },
      { name: 'GPQA', score: 71.1 },
      { name: 'SWE-bench', score: 66.7 },
      { name: 'LiveCodeBench', score: 73.9 },
    ],
    impact: {
      tags: ['开源推理 SoTA 2025Q2', 'Apache 2.0', '22B 活跃最强'],
      summary: '以 Apache 2.0 和 22B 活跃参数，在 AIME/GPQA/SWE-bench 等多项 Benchmark 上超越 o3-mini，成为开源推理模型的新标杆；在阿里云商业化后日均调用量超 10 亿次。',
    },
  },

  {
    name: 'QwQ-32B',
    capabilities: ['数学深度推理', '科学思考', '长链 CoT', '代码逻辑', '慢思考'],
    innovation: '32B Dense 参数下纯强化学习训练的推理模型，MATH 97.8% 与 GPQA 65.2% 证明中小参数推理模型可匹敌旗舰；Think-then-Answer 两阶段解码。',
    applications: ['数学竞赛辅助', '本地推理部署', '科研计算', '逻辑验证', '教育平台'],
    benchmarks: [
      { name: 'MATH', score: 97.8 },
      { name: 'GPQA', score: 65.2 },
      { name: 'AIME 2024', score: 72.9 },
    ],
    impact: {
      tags: ['32B 推理 SoTA', 'Apache 2.0', '本地部署推理'],
      summary: '证明 32B 级别开源模型可在数学推理上超越大多数旗舰模型，Hugging Face 下载超 500 万次；推动本地部署"推理模型"成为可能，被多个教育和科研机构采用。',
    },
  },

  {
    name: 'Qwen3.6-35B-A3B',
    capabilities: ['代码专精', '函数调用', '智能体编程', '文档理解', '测试生成'],
    innovation: '35B MoE 仅 3B 活跃参数，专为代码任务训练，HumanEval 和 LiveCodeBench 同规格最优；指令跟随与工具调用能力专项强化，适合轻量代码 Agent 部署。',
    applications: ['代码补全 IDE', '自动化测试', '低成本 API 代码服务', 'CI/CD 集成', '函数级代码生成'],
    benchmarks: [
      { name: 'HumanEval', score: 92.0 },
      { name: 'LiveCodeBench', score: 68.3 },
    ],
    impact: {
      tags: ['3B 活跃代码最优', 'Apache 2.0', '高效代码 Agent'],
      summary: '3B 活跃参数的代码专项 MoE 模型为成本敏感的代码 Agent 产品提供了最优解，被多家 AI 编程工具厂商选为底层模型。',
    },
  },

  // ── MiniMax ───────────────────────────────────────────────────────────────

  {
    name: 'MiniMax M2.5',
    capabilities: ['代码工程', '多 Agent 协作', '长上下文', '工具调用', '自主任务执行'],
    innovation: 'Forge 多智能体框架支持并行子 Agent 协作；229B MoE 10B 活跃参数，3.07T tokens/7 天的训练吞吐效率世界领先；Multi-SWE-bench 多仓库代码修复第一名。',
    applications: ['大型软件工程自动化', '多步骤 Agent 任务', '代码仓库分析', '企业 IT 自动化', '研究辅助'],
    benchmarks: [
      { name: 'SWE-bench', score: 80.0 },
      { name: 'Multi-SWE-bench', score: 39.0 },
      { name: 'MMLU', score: 85.0 },
    ],
    impact: {
      tags: ['Multi-SWE-bench #1', '多 Agent 框架', '中国代码 SoTA'],
      summary: 'Multi-SWE-bench（跨仓库代码修复）全球第一，证明中国团队在软件工程 AI 领域达到顶尖水平；Forge 框架发布推动多 Agent 协作范式在国内广泛采用。',
    },
  },

  {
    name: 'MiniMax M2.7',
    capabilities: ['自迭代训练', '代码推理', '长上下文', '工具调用', '工程智能体'],
    innovation: '首个完全由模型本身训练迭代产生（Self-iterated RL）的生产级模型，经过 100+ 次强化学习迭代循环；MLE-Bench 66.6% 证明自主训练的工程可行性。',
    applications: ['高难度代码任务', 'ML 工程辅助', '企业推理服务', 'Agent 框架集成', '自主研究工具'],
    benchmarks: [
      { name: 'SWE-bench', score: 82.0 },
      { name: 'MLE-Bench', score: 66.6 },
    ],
    impact: {
      tags: ['自迭代训练先驱', 'SWE 82%', '100+ RL 迭代'],
      summary: '首个公开宣称由模型自身驱动 100 次以上 RL 迭代的模型，为"AI 自我进化"提供了实证；MLE-Bench 66.6% 的成绩挑战 Claude Opus 4.6，标志中国 AI 进入顶尖 Agentic 赛道。',
    },
  },

  // ── Zhipu AI ──────────────────────────────────────────────────────────────

  {
    name: 'GLM-5',
    capabilities: ['代码生成', '数学推理', '长上下文', '国产芯片适配', '工具调用'],
    innovation: 'Slime 异步 RL 框架大幅提升训练效率；744B MoE 40B 活跃参数，主要在华为昇腾（Ascend）芯片训练，Apache 2.0 开源；Z Code 代码开发环境深度集成。',
    applications: ['国产算力生态', '企业代码平台', '芯片设计辅助', '政府云部署', '中文专业场景'],
    benchmarks: [
      { name: 'SWE-bench', score: 77.0 },
      { name: 'MMLU', score: 87.0 },
    ],
    impact: {
      tags: ['昇腾芯片训练', 'Apache 2.0', '国产 AI 里程碑'],
      summary: '首个在国产算力体系（昇腾）完成大规模训练并达到国际前沿水平的大模型，对中国 AI 算力自主可控战略具有重要象征意义；推动华为 Ascend 生态与 AI 主流社区接轨。',
    },
  },

  {
    name: 'GLM-5.1',
    capabilities: ['代码生成', '推理', '昇腾芯片优化', '多语言', '工具调用'],
    innovation: 'GLM-5 的增量迭代版本，在昇腾适配、指令跟随和代码生成上进一步优化，MIT 授权；继续推进国产芯片大模型训练的技术积累与成熟度。',
    applications: ['国内企业部署', '代码辅助', '政务 AI', '教育应用', '工业智能'],
    benchmarks: [
      { name: 'SWE-bench', score: 79.0 },
      { name: 'MMLU', score: 88.0 },
    ],
    impact: {
      tags: ['MIT 开源', '昇腾生态持续', '国内代码 SoTA'],
      summary: 'MIT 授权进一步降低商业应用门槛，GLM 系列持续强化在国内政务、教育、工业 AI 的市场渗透；为昇腾芯片提供了高质量开源模型背书。',
    },
  },

  // ── Kimi / Moonshot AI ───────────────────────────────────────────────────

  {
    name: 'Kimi K2.5',
    capabilities: ['Agent 任务规划', '长上下文', '多模态理解', '工具使用', '并行推理'],
    innovation: 'PARL 并行 Agent 强化学习训练框架 + MuonClip 优化器 + Agent Swarm 协调机制；1.04T MoE 参数 32B 活跃，开源权重，SWE-bench 61% 超越同期多数商业模型。',
    applications: ['Web Agent 自动化', '研究助手', '复杂文档分析', '工具链协调', '知识库构建'],
    benchmarks: [
      { name: 'SWE-bench', score: 61.0 },
      { name: 'MMLU', score: 88.0 },
    ],
    impact: {
      tags: ['开源 Agent 先驱', 'PARL 算法创新', '1T MoE 开源'],
      summary: '1T MoE 参数完全开源（含权重），推动了国内大规模 MoE 开源模型的发展；PARL 框架为 Agentic RL 训练提供了新范式，影响 DeepSeek V4 等后续模型设计。',
    },
  },

  {
    name: 'Kimi K2.6',
    capabilities: ['多模态推理', '视频理解', '超长上下文', 'Agent 执行', '图像分析'],
    innovation: '1T MoE 原生多模态架构，Modified MIT 开源；在图像/视频/文本统一理解上对标 Gemini 2.5；引入 Video CoT（视频链式推理）支持多帧时序理解。',
    applications: ['视频内容分析', '多模态问答', '图像文档处理', '医疗影像辅助', '多模态 Agent'],
    benchmarks: [
      { name: 'SWE-bench', score: 65.0 },
      { name: 'Video-MME', score: 78.0 },
      { name: 'MMMU', score: 72.0 },
    ],
    impact: {
      tags: ['Modified MIT 开源', '1T 多模态 MoE', '视频 CoT'],
      summary: '将 1T 级别多模态 MoE 以 Modified MIT 开源，填补了开源社区大规模多模态模型空白；Video CoT 方法论的发布推动多模态时序推理研究进入新阶段。',
    },
  },

  // ── Embodied / World Models ───────────────────────────────────────────────

  {
    name: 'pi0.5',
    capabilities: ['灵巧操控', '跨机器人泛化', '语言条件控制', '扩散策略', '多任务迁移'],
    innovation: '流匹配扩散策略（Flow Matching Diffusion Policy）结合跨机身训练数据，3B 参数首次实现在 10+ 种不同机器人上零样本泛化；Physical Intelligence 的首款移动部署版本。',
    applications: ['工业装配自动化', '仓储物流机器人', '家用服务机器人', '手术辅助机器人', '危险环境作业'],
    benchmarks: [
      { name: '跨机器人成功率', score: 78.0, unit: '%' },
      { name: '新任务迁移', score: 65.0, unit: '%' },
    ],
    impact: {
      tags: ['具身智能里程碑', '流匹配扩散策略', '跨机器人泛化'],
      summary: '3B 参数跨机器人泛化能力被业界视为具身智能领域的"ImageNet 时刻"；Physical Intelligence 凭借 pi0 系列完成 4 亿美元 B 轮融资，推动具身 AI 商业化进程。',
    },
  },

  {
    name: 'EMMA 2',
    capabilities: ['端到端自动驾驶', '语言条件场景理解', '感知规划统一', '多传感器融合', '长尾场景处理'],
    innovation: '将语言模型与端到端自动驾驶统一，语言条件化的场景理解与规划；基于 Waymo 2000 万英里真实道路数据训练，7B 参数实现感知-规划一体化。',
    applications: ['L4 自动驾驶', '复杂城市场景规划', '乘用车辅助驾驶', '物流自动驾驶', '极端天气驾驶'],
    benchmarks: [
      { name: 'nuScenes L2 误差', score: 0.38, unit: 'm', max: 2 },
      { name: '城市场景成功率', score: 89.0 },
    ],
    impact: {
      tags: ['Waymo L4 技术', '端到端驾驶标杆', '真实里程最多'],
      summary: '代表 Waymo 在端到端自动驾驶的最新技术里程碑，其架构统一感知与规划的思路影响了特斯拉 FSD v12、百度 Apollo 等竞争对手的技术路线。',
    },
  },

  {
    name: 'GAIA-2',
    capabilities: ['生成式世界模型', '驾驶场景生成', '视频扩散', '多传感器预测', '长期规划仿真'],
    innovation: '基于扩散模型的端到端生成式世界模型，可从文本/传感器输入生成真实感驾驶视频；支持 Lidar+Camera 多模态条件生成，用于自动驾驶数据增强。',
    applications: ['自动驾驶训练数据生成', '边缘场景扩增', '安全测试仿真', '驾驶策略评估', 'AV 开发加速'],
    benchmarks: [
      { name: 'FVD 视频质量', score: 87.0 },
      { name: '传感器一致性', score: 91.0 },
    ],
    impact: {
      tags: ['生成式世界模型', 'Wayve 商业化', '数据飞轮'],
      summary: '为自动驾驶行业提供了无限合成训练数据的可能，Wayve 与多家 OEM 合作通过 GAIA-2 大幅降低真实数据采集成本；开创了"用世界模型替代物理仿真器"的新范式。',
    },
  },

  // ── Other notable ─────────────────────────────────────────────────────────

  {
    name: 'Grok 3',
    capabilities: ['实时信息检索', '通用推理', '代码生成', 'X 平台数据', '深度思考'],
    innovation: '与 X (Twitter) 实时数据流集成，可访问最新社交媒体信息；DeepSearch 功能整合实时网络搜索与推理，Think 模式提供深度推理。',
    applications: ['金融市场实时分析', '社交趋势监测', '新闻摘要', '实时事件理解', '研究辅助'],
    benchmarks: [
      { name: 'MMLU', score: 87.5 },
      { name: 'GPQA', score: 71.0 },
      { name: 'MATH', score: 93.3 },
    ],
    impact: {
      tags: ['实时数据集成', 'X 生态', 'DeepSearch'],
      summary: '唯一原生集成 X 平台实时数据流的前沿模型，为金融、媒体、政治分析提供独特竞争优势；Elon Musk 的 X.AI 第一款在多项 Benchmark 上可与 GPT-4o 竞争的模型。',
    },
  },

  {
    name: 'Gemini 3.1 Pro',
    capabilities: ['百万 Token 超长上下文', '多模态', '复杂推理', '代码生成', 'ARC-AGI 高分'],
    innovation: '1M Token 上下文结合最新推理能力，ARC-AGI-2（抽象推理）达 45.1%，显著领先同期竞品；引入原生视频、音频理解模块。',
    applications: ['超长视频理解', '大型代码库分析', '全书分析', '科研数据处理', '多模态 Agent'],
    benchmarks: [
      { name: 'ARC-AGI-2', score: 45.1 },
      { name: 'MMLU', score: 91.0 },
      { name: 'SWE-bench', score: 64.0 },
    ],
    impact: {
      tags: ['ARC-AGI-2 领先', '1M 上下文', 'Google 2026 旗舰'],
      summary: 'ARC-AGI-2 45.1% 在当时领先所有公开模型，引发业界对"机器能否像人类一样进行抽象推理"的讨论；在 Google Gemini 订阅服务中带动付费用户数大幅增长。',
    },
  },

  {
    name: 'Llama 4 Maverick',
    capabilities: ['多模态理解', '代码生成', '长上下文', '高性价比', '开源商用'],
    innovation: '400B MoE 17B 活跃参数，原生多模态，采用 iRoPE 和 MetaP 动态超参调整；LMSYS Arena 多模态榜单击败 GPT-4o，成为开源多模态能力最强模型。',
    applications: ['多模态开源应用', '企业视觉问答', '图文混合处理', '代码生成', '教育工具'],
    benchmarks: [
      { name: 'MMLU', score: 85.5 },
      { name: 'GPQA', score: 69.8 },
      { name: 'DocVQA', score: 94.0 },
    ],
    impact: {
      tags: ['开源多模态 SoTA', 'Arena 击败 GPT-4o', 'Meta AI 旗舰'],
      summary: 'LMSYS 多模态 Arena 击败 GPT-4o 是开源模型首次在人类偏好评测中超越 OpenAI 旗舰，具有重要里程碑意义；与 Meta AI 应用深度集成，触达 30 亿 WhatsApp/Instagram 用户。',
    },
  },

  {
    name: 'Sora',
    capabilities: ['文本生成视频', '长视频生成', '物理仿真', '视频编辑', '一致性世界模拟'],
    innovation: '首款能生成分钟级高质量视频的 Diffusion Transformer；将物理真实感与叙事连贯性结合，视频时长和分辨率远超前代 DALL-E/Stable Video Diffusion。',
    applications: ['影视制作', '广告创意', '游戏资产生成', '教育内容制作', '原型可视化'],
    benchmarks: [
      { name: '视频质量 FVD', score: 92.0 },
    ],
    impact: {
      tags: ['视频生成里程碑', 'DiT 架构', '好莱坞合作'],
      summary: '发布后获得好莱坞多家制片公司试用合作，标志 AI 视频生成进入专业内容制作领域；引发电影从业者的广泛讨论，推动 Runway、Kling、可灵等竞品迅速跟进。',
    },
  },

  {
    name: 'MiniCPM-o 4.5',
    capabilities: ['端侧多模态', '全双工语音', '1M Token 上下文', '视觉理解', '离线运行'],
    innovation: '9B 参数实现 1M Token 长上下文 + 全双工多模态（文本/图像/音频同时处理），SALA（System Audio-Language Alignment）架构首次在端侧实现接近 GPT-4o 的多模态能力。',
    applications: ['手机端多模态助手', '离线文档分析', '实时会议记录', '医疗影像边缘分析', '教育辅助设备'],
    benchmarks: [
      { name: 'MMLU', score: 72.0 },
      { name: 'SWE-bench', score: 42.0 },
    ],
    impact: {
      tags: ['9B 多模态里程碑', '1M 端侧上下文', '全双工语音'],
      summary: '全双工多模态在 9B 参数的突破使真正的"口袋 AI 助手"成为现实，吸引手机厂商合作；MiniCPM 系列开源工作推动清华-面壁团队在边缘 AI 领域建立学术影响力。',
    },
  },

  {
    name: 'Claude 3.5 Haiku',
    capabilities: ['快速推理', '低成本', '代码辅助', '指令跟随', '高吞吐'],
    innovation: '以 Claude 3.5 Sonnet 级能力压缩至 Haiku 速度与价格，代码能力超越前代 Claude 3 Opus；面向需要高并发低延迟的生产场景专项优化。',
    applications: ['实时客服', '代码 Review', '大规模文本分类', '快速 RAG', '移动端 AI'],
    benchmarks: [
      { name: 'SWE-bench', score: 40.6 },
      { name: 'MMLU', score: 87.0 },
    ],
    impact: {
      tags: ['Sonnet 能力 Haiku 价格', '高并发场景', '开发者最爱'],
      summary: '以 Haiku 价格提供超越前代 Opus 的代码能力，成为高并发商业应用的首选；推动 Anthropic 在中低价位市场的快速扩张，日活调用量比 Haiku 3 增长 4 倍。',
    },
  },

  {
    name: 'Qwen3.5-Omni',
    capabilities: ['全模态理解', '音视频文本统一', '实时语音对话', '多模态生成', '长上下文'],
    innovation: '统一处理文本/图像/视频/音频的 Omni 架构，支持实时语音交互与多模态生成；Apache 2.0 开源，是首批同时支持音频输入输出的开源 Omni 模型之一。',
    applications: ['全模态客服', '视频内容理解', '实时会议助手', '多模态教育', '语音+视觉 Agent'],
    benchmarks: [
      { name: 'MMMU', score: 73.8 },
      { name: 'AVBench', score: 71.2 },
    ],
    impact: {
      tags: ['Apache 2.0 Omni 开源', '全模态统一', '阿里 2026 旗舰'],
      summary: '开源 Omni 模型稀缺性使其迅速成为学术界多模态研究的新基准；推动阿里云 Qwen 品牌在海外市场的认知度大幅提升，月活 API 调用突破 5 亿次。',
    },
  },

]

// Convert to lookup map for O(1) access
export const MODEL_PROFILES: Record<string, ModelProfile> = Object.fromEntries(
  PROFILES.map(p => [p.name, p])
)
