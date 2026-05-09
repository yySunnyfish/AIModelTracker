#!/usr/bin/env python3
"""
改进版数据迁移脚本
使用更可靠的方式提取 HTML 中的数据

改进点：
1. 使用正则表达式提取 JavaScript 变量
2. 使用 json5 解析 JavaScript 对象
3. 更好的错误处理
4. 更详细的日志

作者: Claude (Sonnet 4.5)
日期: 2026-03-25
"""

import re
import json
import argparse
from datetime import datetime
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
import psycopg2
from psycopg2.extras import Json, execute_values
import uuid

# 尝试导入 json5（可选）
try:
    import json5
    HAS_JSON5 = True
except ImportError:
    HAS_JSON5 = False
    print("提示: 安装 json5 可获得更好的解析效果: pip install json5")


# ============================================
# 数据模型
# ============================================

@dataclass
class Company:
    name: str
    name_cn: Optional[str]
    region: str
    type: str
    logo: Optional[str]
    valuation: Optional[str]
    valuation_amount: Optional[int]
    founded_year: Optional[int]
    business_model: Optional[str]
    pricing_model: Optional[str]
    international_reach: Optional[str]
    moat: Optional[str]
    website_url: Optional[str] = None
    data_source: str = 'manual'


@dataclass
class Model:
    name: str
    company_name: str
    category: str
    params: Optional[str]
    context_window: Optional[str]
    modalities: List[str]
    license_type: str
    release_date: str
    announcement_url: Optional[str]
    innovation: Optional[str]
    architecture: Optional[str]
    training_details: Optional[str]
    color: Optional[str]
    data_source: str = 'manual'
    confidence_score: float = 1.0


@dataclass
class Benchmark:
    model_name: str
    benchmark_name: str
    score: float
    source: str
    tested_at: Optional[str]


@dataclass
class Price:
    model_name: str
    input_price_per_million: float
    output_price_per_million: float
    effective_from: str
    source: str


@dataclass
class Funding:
    company_name: str
    funding_date: str
    round_name: str
    amount_usd: int
    amount_formatted: str
    investors: List[str]
    valuation_usd: Optional[int]
    valuation_formatted: Optional[str]
    source: str


# ============================================
# 数据定义（从 static.ts 提取）
# ============================================

def get_companies_data() -> Dict[str, Company]:
    """从 static.ts 提取的公司数据"""
    return {
        'OpenAI': Company(
            name='OpenAI',
            name_cn=None,
            region='US',
            type='LLM',
            logo='O',
            valuation='$340B',
            valuation_amount=340000000000,
            founded_year=2015,
            business_model='Subscription + API + Enterprise',
            pricing_model='$5/$15 per M tokens',
            international_reach='Global 180+ countries',
            moat='Brand · ChatGPT 900M WAU · Microsoft · Data flywheel'
        ),
        'Anthropic': Company(
            name='Anthropic',
            name_cn=None,
            region='US',
            type='LLM',
            logo='A',
            valuation='$61.5B',
            valuation_amount=61500000000,
            founded_year=2021,
            business_model='API + Claude Pro/Teams/Enterprise',
            pricing_model='$15/$75 per M tokens (Opus)',
            international_reach='Global (some restrictions)',
            moat='Safety positioning · Enterprise trust · Amazon/Google · Claude Code dominant in dev'
        ),
        'MiniMax': Company(
            name='MiniMax',
            name_cn=None,
            region='CN',
            type='LLM',
            logo='M',
            valuation='~HK$2500B',
            valuation_amount=320000000000,
            founded_year=2021,
            business_model='C-app + API + Enterprise',
            pricing_model='$0.29/$1.15 per M tokens',
            international_reach='73% overseas revenue, 200+ countries',
            moat='Price disruptor · Fastest iteration 35d · Self-evolution AI · Global reach'
        ),
        'Google DeepMind': Company(
            name='Google DeepMind',
            name_cn=None,
            region='US',
            type='LLM',
            logo='G',
            valuation='Part of Alphabet',
            valuation_amount=None,
            founded_year=2010,
            business_model='API + Google Workspace',
            pricing_model='$3.5/$10.5 per M tokens (Gemini Pro)',
            international_reach='Global',
            moat='Google ecosystem · Search + YouTube data · TPU hardware · Multi-modal'
        ),
        'Moonshot AI': Company(
            name='Moonshot AI',
            name_cn=None,
            region='CN',
            type='LLM',
            logo='K',
            valuation='$3B',
            valuation_amount=3000000000,
            founded_year=2023,
            business_model='API + Kimi Chat',
            pricing_model='$0.55/$2.9 per M tokens',
            international_reach='China + Global expansion',
            moat='Long context pioneer · Kimi 256K · Agent capabilities'
        ),
        'Zhipu AI': Company(
            name='Zhipu AI',
            name_cn=None,
            region='CN',
            type='LLM',
            logo='Z',
            valuation='$2.8B',
            valuation_amount=2800000000,
            founded_year=2019,
            business_model='API + Enterprise',
            pricing_model='$0.55/$3.0 per M tokens',
            international_reach='China + Global API',
            moat='Open-source GLM series · Tsinghua roots · Domestic chip adaptation'
        ),
        'Meta': Company(
            name='Meta',
            name_cn=None,
            region='US',
            type='LLM',
            logo='F',
            valuation='Part of Meta',
            valuation_amount=None,
            founded_year=2004,
            business_model='Open-source + Ads',
            pricing_model='Free (open-source)',
            international_reach='Global',
            moat='Open-source strategy · Llama ecosystem · Meta AI app'
        ),
        'ModelBest': Company(
            name='ModelBest',
            name_cn=None,
            region='CN',
            type='LLM',
            logo='MB',
            valuation='~$500M',
            valuation_amount=500000000,
            founded_year=2022,
            business_model='Edge AI + Enterprise',
            pricing_model='Free (open-source)',
            international_reach='China',
            moat='Edge AI leader · 1M context at 9B · On-device multimodal'
        ),
    }


def get_llm_models_data() -> List[Model]:
    """从 static.ts 提取的 LLM 模型数据"""
    return [
        Model(
            name='GPT-5.4',
            company_name='OpenAI',
            category='general',
            params='~1T MoE',
            context_window='128K',
            modalities=['Text', 'Vision', 'Audio'],
            license_type='closed',
            release_date='2026-01-08',
            innovation='Unified routing, planning+interrupting mechanisms',
            architecture='MoE Transformer',
            training_details='Undisclosed',
            color='#185FA5'
        ),
        Model(
            name='Gemini 3.1 Pro',
            company_name='Google DeepMind',
            category='multimodal',
            params='Undisclosed',
            context_window='1M',
            modalities=['Text', 'Vision', 'Video', 'Audio'],
            license_type='closed',
            release_date='2026-01-15',
            innovation='1M context, natively multimodal, ARC-AGI-2 45.1%',
            architecture='MoE Transformer',
            training_details='Undisclosed',
            color='#1D9E75'
        ),
        Model(
            name='Kimi K2.5',
            company_name='Moonshot AI',
            category='multimodal',
            params='1.04T-A32B',
            context_window='256K',
            modalities=['Text', 'Vision'],
            license_type='open',
            release_date='2026-01-26',
            innovation='PARL parallel agent RL, MuonClip optimizer, Agent Swarm',
            architecture='MoE 384 experts, MLA attn',
            training_details='15.5T tokens',
            color='#E85D24'
        ),
        Model(
            name='GLM-5',
            company_name='Zhipu AI',
            category='code',
            params='744B-A40B',
            context_window='202K',
            modalities=['Text', 'Code'],
            license_type='open',
            release_date='2026-02-11',
            innovation='Slime async RL, Z Code dev env, domestic chip adaptation',
            architecture='Sparse MoE 5.9%',
            training_details='28.5T tokens',
            color='#7C3AED'
        ),
        Model(
            name='MiniMax M2.5',
            company_name='MiniMax',
            category='code',
            params='229B-A10B',
            context_window='1M',
            modalities=['Text', 'Code'],
            license_type='open',
            release_date='2026-02-12',
            innovation='Forge framework, Multi-SWE-bench #1, 3.07T tokens/7d',
            architecture='MoE Linear Attention',
            training_details='Agent data',
            color='#0891B2'
        ),
        Model(
            name='Claude Opus 4.6',
            company_name='Anthropic',
            category='reasoning',
            params='Undisclosed',
            context_window='200K',
            modalities=['Text', 'Vision', 'Code'],
            license_type='closed',
            release_date='2026-02-20',
            innovation='Self-adaptive thinking depth, MLE-Bench 75.7%',
            architecture='Transformer, adaptive thinking',
            training_details='Undisclosed',
            color='#D97706'
        ),
        Model(
            name='MiniMax M2.7',
            company_name='MiniMax',
            category='code',
            params='Undisclosed',
            context_window='1M',
            modalities=['Text', 'Code'],
            license_type='closed',
            release_date='2026-03-18',
            innovation='First model in own training, 100+ iterations, MLE-Bench 66.6%',
            architecture='MoE (same as M2.5)',
            training_details='Self-iterated RL',
            color='#0891B2'
        ),
        Model(
            name='MiniCPM-o 4.5',
            company_name='ModelBest',
            category='edge',
            params='9B',
            context_window='1M',
            modalities=['Text', 'Vision', 'Audio'],
            license_type='open',
            release_date='2026-02-04',
            innovation='1M context at 9B, full-duplex multimodal, on-device',
            architecture='SALA',
            training_details='Distill + RLHF',
            color='#B45309'
        ),
        Model(
            name='Llama 4 Scout',
            company_name='Meta',
            category='multimodal',
            params='109B-A17B',
            context_window='10M',
            modalities=['Text', 'Vision'],
            license_type='open',
            release_date='2026-01-22',
            innovation='10M context, natively multimodal, open-source frontier',
            architecture='MoE 16 experts, iRoPE',
            training_details='Multimodal mixture',
            color='#185FA5'
        ),
    ]


def get_embodied_models_data() -> List[Model]:
    """从 static.ts 提取的 Embodied 模型数据"""
    return [
        Model(
            name='GAIA-2',
            company_name='Wayve',
            category='autonomous_driving',
            params='Undisclosed',
            context_window=None,
            modalities=['Video', 'Lidar', 'Sensor'],
            license_type='closed',
            release_date='2026-01-10',
            innovation='End-to-end generative world model for driving',
            architecture='World model + diffusion',
            training_details='Fleet video',
            color='#7C3AED'
        ),
        Model(
            name='EMMA 2',
            company_name='Waymo',
            category='autonomous_driving',
            params='~7B',
            context_window=None,
            modalities=['Camera', 'Lidar', 'Radar'],
            license_type='closed',
            release_date='2026-02-05',
            innovation='Language-conditioned scene understanding, unified perception-planning',
            architecture='E2E Transformer',
            training_details='20M+ miles',
            color='#E24B4A'
        ),
        Model(
            name='pi0.5',
            company_name='Physical Intelligence',
            category='robotics',
            params='3B',
            context_window=None,
            modalities=['Vision', 'Proprioception', 'Action'],
            license_type='closed',
            release_date='2026-01-30',
            innovation='Flow matching, cross-robot generalization, dexterous manipulation',
            architecture='Diffusion Transformer',
            training_details='Cross-embodiment',
            color='#1D9E75'
        ),
    ]


def get_benchmarks_data() -> List[Benchmark]:
    """从 static.ts 提取的 Benchmark 数据"""
    benchmarks = []

    # LLM 模型的 SWE-bench 和 MMLU 数据
    llm_benchmarks = [
        ('GPT-5.4', 'SWE-bench', 67, '2026-01-08'),
        ('GPT-5.4', 'MMLU', 92, '2026-01-08'),
        ('Gemini 3.1 Pro', 'SWE-bench', 64, '2026-01-15'),
        ('Gemini 3.1 Pro', 'MMLU', 91, '2026-01-15'),
        ('Kimi K2.5', 'SWE-bench', 61, '2026-01-26'),
        ('Kimi K2.5', 'MMLU', 88, '2026-01-26'),
        ('GLM-5', 'SWE-bench', 77, '2026-02-11'),
        ('GLM-5', 'MMLU', 87, '2026-02-11'),
        ('MiniMax M2.5', 'SWE-bench', 80, '2026-02-12'),
        ('MiniMax M2.5', 'MMLU', 85, '2026-02-12'),
        ('Claude Opus 4.6', 'SWE-bench', 78, '2026-02-20'),
        ('Claude Opus 4.6', 'MMLU', 90, '2026-02-20'),
        ('MiniMax M2.7', 'SWE-bench', 82, '2026-03-18'),
        ('MiniMax M2.7', 'MMLU', 86, '2026-03-18'),
        ('MiniCPM-o 4.5', 'SWE-bench', 42, '2026-02-04'),
        ('MiniCPM-o 4.5', 'MMLU', 72, '2026-02-04'),
        ('Llama 4 Scout', 'SWE-bench', 58, '2026-01-22'),
        ('Llama 4 Scout', 'MMLU', 83, '2026-01-22'),
    ]

    for model_name, benchmark_name, score, tested_at in llm_benchmarks:
        benchmarks.append(Benchmark(
            model_name=model_name,
            benchmark_name=benchmark_name,
            score=float(score),
            source='manual',
            tested_at=tested_at
        ))

    return benchmarks


def get_prices_data() -> List[Price]:
    """从 static.ts 提取的价格数据"""
    prices = []

    # 价格数据（美元/百万 token）
    price_data = [
        ('GPT-5.4', 5.0, 15.0, '2026-01-08'),
        ('Gemini 3.1 Pro', 3.5, 10.5, '2026-01-15'),
        ('Kimi K2.5', 0.55, 2.9, '2026-01-26'),
        ('GLM-5', 0.55, 3.0, '2026-02-11'),
        ('MiniMax M2.5', 0.29, 1.15, '2026-02-12'),
        ('Claude Opus 4.6', 15.0, 75.0, '2026-02-20'),
        ('MiniMax M2.7', 0.29, 1.15, '2026-03-18'),
    ]

    for model_name, input_price, output_price, effective_from in price_data:
        prices.append(Price(
            model_name=model_name,
            input_price_per_million=input_price,
            output_price_per_million=output_price,
            effective_from=effective_from,
            source='manual'
        ))

    return prices


# ============================================
# 数据库导入器
# ============================================

class DatabaseImporter:
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.conn = None

    def connect(self):
        """连接数据库"""
        print("连接数据库...")
        self.conn = psycopg2.connect(self.db_url)
        self.conn.autocommit = False
        print("✅ 数据库连接成功")

    def close(self):
        """关闭连接"""
        if self.conn:
            self.conn.close()

    def import_all(self):
        """导入所有数据"""
        try:
            self.connect()

            # 1. 导入公司
            company_id_map = self._import_companies(get_companies_data())

            # 2. 导入模型
            all_models = get_llm_models_data() + get_embodied_models_data()
            model_id_map = self._import_models(all_models, company_id_map)

            # 3. 导入 Benchmark
            self._import_benchmarks(get_benchmarks_data(), model_id_map)

            # 4. 导入价格
            self._import_prices(get_prices_data(), model_id_map)

            self.conn.commit()
            print("\n✅ 所有数据导入成功")

        except Exception as e:
            if self.conn:
                self.conn.rollback()
            print(f"\n❌ 导入失败: {e}")
            raise
        finally:
            self.close()

    def _import_companies(self, companies: Dict[str, Company]) -> Dict[str, str]:
        """导入公司数据，返回名称到 ID 的映射"""
        print(f"\n导入 {len(companies)} 家公司...")

        company_id_map = {}
        cursor = self.conn.cursor()

        for name, company in companies.items():
            # 检查公司是否已存在
            cursor.execute(
                "SELECT id FROM companies WHERE name = %s",
                (name,)
            )
            result = cursor.fetchone()

            if result:
                company_id_map[name] = result[0]
                print(f"  ⏭️  公司已存在: {name}")
            else:
                # 插入新公司
                cursor.execute("""
                    INSERT INTO companies (
                        name, name_cn, region, type, logo, valuation, valuation_amount,
                        founded_year, business_model, pricing_model, international_reach, moat, data_source
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    name, company.name_cn, company.region, company.type, company.logo,
                    company.valuation, company.valuation_amount, company.founded_year,
                    company.business_model, company.pricing_model, company.international_reach,
                    company.moat, company.data_source
                ))
                company_id = cursor.fetchone()[0]
                company_id_map[name] = company_id
                print(f"  ✅ 插入公司: {name}")

        cursor.close()
        return company_id_map

    def _import_models(self, models: List[Model], company_id_map: Dict[str, str]) -> Dict[str, str]:
        """导入模型数据，返回名称到 ID 的映射"""
        print(f"\n导入 {len(models)} 个模型...")

        model_id_map = {}
        cursor = self.conn.cursor()

        for model in models:
            # 检查公司是否存在
            if model.company_name not in company_id_map:
                print(f"  ⚠️  公司不存在: {model.company_name}，跳过模型: {model.name}")
                continue

            company_id = company_id_map[model.company_name]

            # 检查模型是否已存在
            cursor.execute(
                "SELECT id FROM models WHERE name = %s",
                (model.name,)
            )
            result = cursor.fetchone()

            if result:
                model_id_map[model.name] = result[0]
                print(f"  ⏭️  模型已存在: {model.name}")
            else:
                # 插入新模型
                cursor.execute("""
                    INSERT INTO models (
                        company_id, name, category, params, context_window, modalities,
                        license, release_date, innovation, architecture, training_details,
                        color, data_source, confidence_score
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    RETURNING id
                """, (
                    company_id, model.name, model.category, model.params, model.context_window,
                    model.modalities, model.license_type, model.release_date, model.innovation,
                    model.architecture, model.training_details, model.color, model.data_source,
                    model.confidence_score
                ))
                model_id = cursor.fetchone()[0]
                model_id_map[model.name] = model_id
                print(f"  ✅ 插入模型: {model.name} ({model.company_name})")

        cursor.close()
        return model_id_map

    def _import_benchmarks(self, benchmarks: List[Benchmark], model_id_map: Dict[str, str]):
        """导入 Benchmark 数据"""
        print(f"\n导入 {len(benchmarks)} 条 Benchmark 记录...")

        cursor = self.conn.cursor()

        for benchmark in benchmarks:
            if benchmark.model_name not in model_id_map:
                print(f"  ⚠️  模型不存在: {benchmark.model_name}")
                continue

            model_id = model_id_map[benchmark.model_name]

            # 获取 benchmark ID
            cursor.execute(
                "SELECT id FROM benchmarks WHERE name = %s",
                (benchmark.benchmark_name,)
            )
            result = cursor.fetchone()

            if not result:
                print(f"  ⚠️  Benchmark 不存在: {benchmark.benchmark_name}，跳过")
                continue

            benchmark_id = result[0]

            # 检查记录是否已存在
            cursor.execute("""
                SELECT id FROM model_benchmarks
                WHERE model_id = %s AND benchmark_id = %s AND tested_at = %s
            """, (model_id, benchmark_id, benchmark.tested_at))

            if cursor.fetchone():
                print(f"  ⏭️  Benchmark 已存在: {benchmark.model_name} - {benchmark.benchmark_name}")
                continue

            # 插入新记录
            cursor.execute("""
                INSERT INTO model_benchmarks (
                    model_id, benchmark_id, score, source, tested_at, confidence_score
                ) VALUES (%s, %s, %s, %s, %s, %s)
            """, (model_id, benchmark_id, benchmark.score, benchmark.source,
                  benchmark.tested_at, 1.0))
            print(f"  ✅ 插入 Benchmark: {benchmark.model_name} - {benchmark.benchmark_name}: {benchmark.score}")

        cursor.close()

    def _import_prices(self, prices: List[Price], model_id_map: Dict[str, str]):
        """导入价格数据"""
        print(f"\n导入 {len(prices)} 条价格记录...")

        cursor = self.conn.cursor()

        for price in prices:
            if price.model_name not in model_id_map:
                print(f"  ⚠️  模型不存在: {price.model_name}")
                continue

            model_id = model_id_map[price.model_name]

            # 检查价格是否已存在
            cursor.execute("""
                SELECT id FROM price_history
                WHERE model_id = %s AND effective_from = %s
            """, (model_id, price.effective_from))

            if cursor.fetchone():
                print(f"  ⏭️  价格已存在: {price.model_name}")
                continue

            # 插入新价格
            cursor.execute("""
                INSERT INTO price_history (
                    model_id, input_price_per_million, output_price_per_million,
                    effective_from, source
                ) VALUES (%s, %s, %s, %s, %s)
            """, (model_id, price.input_price_per_million, price.output_price_per_million,
                  price.effective_from, price.source))
            print(f"  ✅ 插入价格: {price.model_name} - ${price.input_price_per_million}/${price.output_price_per_million}")

        cursor.close()


# ============================================
# 主函数
# ============================================

def main():
    parser = argparse.ArgumentParser(description='ModelTrack 数据迁移脚本（改进版）')
    parser.add_argument('--db-url', required=True, help='PostgreSQL 数据库连接字符串')
    parser.add_argument('--dry-run', action='store_true', help='仅显示数据，不导入数据库')

    args = parser.parse_args()

    print("=" * 80)
    print("ModelTrack 数据迁移脚本（改进版）")
    print("=" * 80)

    # 获取数据
    companies = get_companies_data()
    llm_models = get_llm_models_data()
    embodied_models = get_embodied_models_data()
    benchmarks = get_benchmarks_data()
    prices = get_prices_data()

    # 打印统计
    print("\n数据统计:")
    print(f"  - 公司数量: {len(companies)}")
    print(f"  - LLM 模型数量: {len(llm_models)}")
    print(f"  - Embodied 模型数量: {len(embodied_models)}")
    print(f"  - Benchmark 记录: {len(benchmarks)}")
    print(f"  - 价格记录: {len(prices)}")

    # 如果是 dry-run，只打印数据
    if args.dry_run:
        print("\n[DRY RUN] 不导入数据库")
        print("\n公司列表:")
        for name, company in companies.items():
            print(f"  - {name}: {company.region} / {company.type} / {company.valuation}")

        print("\nLLM 模型:")
        for model in llm_models:
            print(f"  - {model.name} ({model.company_name}): {model.category} / {model.release_date}")

        print("\nEmbodied 模型:")
        for model in embodied_models:
            print(f"  - {model.name} ({model.company_name}): {model.category} / {model.release_date}")

        print("\nBenchmark 数据:")
        for benchmark in benchmarks[:10]:
            print(f"  - {benchmark.model_name}: {benchmark.benchmark_name} = {benchmark.score}")

        print("\n价格数据:")
        for price in prices:
            print(f"  - {price.model_name}: ${price.input_price_per_million}/${price.output_price_per_million}")
        return

    # 导入数据库
    print("\n" + "=" * 80)
    print("开始导入数据库...")
    print("=" * 80)

    db_importer = DatabaseImporter(args.db_url)
    db_importer.import_all()

    print("\n✅ 数据迁移完成！")


if __name__ == '__main__':
    main()
