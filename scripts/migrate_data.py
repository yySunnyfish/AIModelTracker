#!/usr/bin/env python3
"""
ModelTrack 数据迁移脚本
从 modeltrack_v3.html 提取数据并导入到 PostgreSQL

用法:
    python migrate_data.py --html-file modeltrack_v3.html --db-url postgresql://user:pass@host:port/db

作者: Claude (Sonnet 4.5)
日期: 2026-03-24
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


# ============================================
# 数据模型
# ============================================

@dataclass
class Company:
    name: str
    name_cn: Optional[str]
    region: str  # US/CN/EU/OTHER
    type: str    # LLM/Robotics/AD/WORLD_MODEL
    logo: Optional[str]
    valuation: Optional[str]
    valuation_amount: Optional[int]
    founded_year: Optional[int]
    business_model: Optional[str]
    pricing_model: Optional[str]
    international_reach: Optional[str]
    moat: Optional[str]
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


@dataclass
class Leaderboard:
    leaderboard_name: str
    model_name: str
    rank_position: int
    score: float
    recorded_at: str
    source: str


# ============================================
# HTML 解析器
# ============================================

class HTMLParser:
    def __init__(self, html_content: str):
        self.html = html_content
        self.companies: Dict[str, Company] = {}
        self.models: List[Model] = []
        self.benchmarks: List[Benchmark] = []
        self.prices: List[Price] = []
        self.fundings: List[Funding] = []
        self.leaderboards: List[Leaderboard] = []

    def parse_all(self):
        """解析所有数据"""
        print("开始解析 HTML...")
        self._parse_llm_models()
        self._parse_embodied_models()
        self._parse_companies()
        self._parse_leaderboards()
        print(f"解析完成: {len(self.companies)} 公司, {len(self.models)} 模型")

    def _parse_llm_models(self):
        """解析 LLM 模型数据"""
        # 提取 LLM 数组
        llm_pattern = r'const LLM=\[([\s\S]*?)\];'
        match = re.search(llm_pattern, self.html)
        if not match:
            print("警告: 未找到 LLM 数据")
            return

        llm_js = match.group(1)

        # 解析每个模型对象
        model_pattern = r'\{id:\'([^\']+)\',name:\'([^\']+)\',co:\'([^\']+)\',clr:\'([^\']+)\',params:\'([^\']+)\',ctx:\'([^\']+)\',swe:(\d+),mmlu:(\d+),pi:([0-9.]+),po:([0-9.]+),lic:\'([^\']+)\',modal:\'([^\']+)\',date:\'([^\']+)\',cat:\'([^\']+)\',arch:\'([^\']+)\',training:\'([^\']+)\',innov:\'([^\']+)\'\}'

        for match in re.finditer(model_pattern, llm_js):
            try:
                model = Model(
                    name=match.group(2),
                    company_name=match.group(3),
                    category=self._map_category(match.group(14)),
                    params=match.group(5) if match.group(5) != 'Undisclosed' else None,
                    context_window=match.group(6) if match.group(6) != '—' else None,
                    modalities=match.group(12).split(' '),
                    license_type='open' if match.group(11) == 'open' else 'closed',
                    release_date=match.group(13),
                    announcement_url=None,
                    innovation=match.group(17),
                    architecture=match.group(15),
                    training_details=match.group(16),
                    color=match.group(4),
                    data_source='manual'
                )
                self.models.append(model)

                # 添加价格
                input_price = float(match.group(9))
                output_price = float(match.group(10))
                if input_price > 0:
                    self.prices.append(Price(
                        model_name=model.name,
                        input_price_per_million=input_price,
                        output_price_per_million=output_price,
                        effective_from=model.release_date,
                        source='manual'
                    ))

                # 添加 benchmark
                swe_score = int(match.group(7))
                if swe_score > 0:
                    self.benchmarks.append(Benchmark(
                        model_name=model.name,
                        benchmark_name='SWE-bench',
                        score=float(swe_score),
                        source='manual',
                        tested_at=model.release_date
                    ))

                mmlu_score = int(match.group(8))
                if mmlu_score > 0:
                    self.benchmarks.append(Benchmark(
                        model_name=model.name,
                        benchmark_name='MMLU',
                        score=float(mmlu_score),
                        source='manual',
                        tested_at=model.release_date
                    ))

            except Exception as e:
                print(f"警告: 解析模型失败 - {match.group(2)}: {e}")

    def _parse_embodied_models(self):
        """解析 Embodied 模型数据"""
        # 提取 EMB 数组
        emb_pattern = r'const EMB=\[([\s\S]*?)\];'
        match = re.search(emb_pattern, self.html)
        if not match:
            print("警告: 未找到 EMB 数据")
            return

        emb_js = match.group(1)

        # 解析每个模型对象
        model_pattern = r'\{id:\'([^\']+)\',name:\'([^\']+)\',co:\'([^\']+)\',clr:\'([^\']+)\',params:\'([^\']+)\',ctx:\'([^\']+)\',swe:(\d+),mmlu:(\d+),pi:([0-9.]+),po:([0-9.]+),lic:\'([^\']+)\',modal:\'([^\']+)\',date:\'([^\']+)\',cat:\'([^\']+)\',arch:\'([^\']+)\',training:\'([^\']+)\',innov:\'([^\']+)\'\}'

        for match in re.finditer(model_pattern, emb_js):
            try:
                category = self._map_embodied_category(match.group(14))
                model = Model(
                    name=match.group(2),
                    company_name=match.group(3),
                    category=category,
                    params=match.group(5) if match.group(5) != 'Undisclosed' else None,
                    context_window=None,
                    modalities=match.group(12).split(' '),
                    license_type='open' if match.group(11) == 'open' else 'closed',
                    release_date=match.group(13),
                    announcement_url=None,
                    innovation=match.group(17),
                    architecture=match.group(15),
                    training_details=match.group(16),
                    color=match.group(4),
                    data_source='manual'
                )
                self.models.append(model)

            except Exception as e:
                print(f"警告: 解析 Embodied 模型失败 - {match.group(2)}: {e}")

    def _parse_companies(self):
        """解析公司数据"""
        # 提取 COS 数组
        cos_pattern = r'const COS=\[([\s\S]*?)\];'
        match = re.search(cos_pattern, self.html)
        if not match:
            print("警告: 未找到公司数据")
            return

        cos_js = match.group(1)

        # 解析每个公司对象（简化版，实际需要更复杂的解析）
        company_names = {
            'OpenAI': Company(name='OpenAI', name_cn=None, region='US', type='LLM', logo='O',
                            valuation='$340B', valuation_amount=340000000000, founded_year=2015,
                            business_model='Subscription + API + Enterprise',
                            pricing_model='$5/$15 per M tokens',
                            international_reach='Global 180+ countries',
                            moat='Brand · ChatGPT 900M WAU · Microsoft · Data flywheel'),
            'Anthropic': Company(name='Anthropic', name_cn=None, region='US', type='LLM', logo='A',
                               valuation='$61.5B', valuation_amount=61500000000, founded_year=2021,
                               business_model='API + Claude Pro/Teams/Enterprise',
                               pricing_model='$15/$75 per M tokens (Opus)',
                               international_reach='Global (some restrictions)',
                               moat='Safety positioning · Enterprise trust · Amazon/Google · Claude Code dominant in dev'),
            'MiniMax': Company(name='MiniMax', name_cn=None, region='CN', type='LLM', logo='M',
                             valuation='~HK$2500B', valuation_amount=320000000000, founded_year=2021,
                             business_model='C-app + API + Enterprise',
                             pricing_model='$0.29/$1.15 per M tokens',
                             international_reach='73% overseas revenue, 200+ countries',
                             moat='Price disruptor · Fastest iteration 35d · Self-evolution AI · Global reach'),
            # ... 添加更多公司
        }

        self.companies = company_names

        # 解析融资信息
        funding_pattern = r'fund:\[\{yr:\'(\d+)\',round:\'([^\']+)\',amt:(\d+)\}'
        for match in re.finditer(funding_pattern, cos_js):
            try:
                year = match.group(1)
                round_name = match.group(2)
                amount = int(match.group(3)) * 1000000  # 转换为美元

                # 尝试匹配公司名（需要改进解析逻辑）
                # 这里简化处理，实际需要完整的 JavaScript 对象解析
            except Exception as e:
                print(f"警告: 解析融资信息失败: {e}")

    def _parse_leaderboards(self):
        """解析榜单数据"""
        # 提取 LB 对象
        lb_pattern = r'const LB=\{[\s\S]*?\};'
        match = re.search(lb_pattern, self.html)
        if not match:
            print("警告: 未找到榜单数据")
            return

        # 解析每个榜单（简化版）
        # 实际需要解析 JavaScript 对象
        pass

    def _map_category(self, cat: str) -> str:
        """映射模型类别"""
        mapping = {
            'general': 'general',
            'reasoning': 'reasoning',
            'code': 'code',
            'multimodal': 'multimodal',
            'edge': 'edge'
        }
        return mapping.get(cat, 'general')

    def _map_embodied_category(self, cat: str) -> str:
        """映射 Embodied 类别"""
        mapping = {
            'ad': 'autonomous_driving',
            'robotics': 'robotics',
            'world': 'world_model'
        }
        return mapping.get(cat, 'robotics')


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
        print("数据库连接成功")

    def close(self):
        """关闭连接"""
        if self.conn:
            self.conn.close()

    def import_all(self, parser: HTMLParser):
        """导入所有数据"""
        try:
            self.connect()

            # 1. 导入公司
            company_id_map = self._import_companies(parser.companies)

            # 2. 导入模型
            model_id_map = self._import_models(parser.models, company_id_map)

            # 3. 导入 Benchmark
            self._import_benchmarks(parser.benchmarks, model_id_map)

            # 4. 导入价格
            self._import_prices(parser.prices, model_id_map)

            # 5. 导入融资
            self._import_fundings(parser.fundings, company_id_map)

            # 6. 导入榜单
            self._import_leaderboards(parser.leaderboards, model_id_map)

            self.conn.commit()
            print("✅ 所有数据导入成功")

        except Exception as e:
            self.conn.rollback()
            print(f"❌ 导入失败: {e}")
            raise
        finally:
            self.close()

    def _import_companies(self, companies: Dict[str, Company]) -> Dict[str, str]:
        """导入公司数据，返回名称到 ID 的映射"""
        print(f"导入 {len(companies)} 家公司...")

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
                print(f"  公司已存在: {name}")
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
        print(f"导入 {len(models)} 个模型...")

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
                print(f"  模型已存在: {model.name}")
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
                print(f"  ✅ 插入模型: {model.name}")

        cursor.close()
        return model_id_map

    def _import_benchmarks(self, benchmarks: List[Benchmark], model_id_map: Dict[str, str]):
        """导入 Benchmark 数据"""
        print(f"导入 {len(benchmarks)} 条 Benchmark 记录...")

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
                WHERE model_id = %s AND benchmark_id = %s AND tested_at = %s AND source = %s
            """, (model_id, benchmark_id, benchmark.tested_at, benchmark.source))

            if cursor.fetchone():
                print(f"  Benchmark 已存在: {benchmark.model_name} - {benchmark.benchmark_name}")
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
        print(f"导入 {len(prices)} 条价格记录...")

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
                print(f"  价格已存在: {price.model_name}")
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

    def _import_fundings(self, fundings: List[Funding], company_id_map: Dict[str, str]):
        """导入融资数据"""
        print(f"导入 {len(fundings)} 条融资记录...")

        cursor = self.conn.cursor()

        for funding in fundings:
            if funding.company_name not in company_id_map:
                print(f"  ⚠️  公司不存在: {funding.company_name}")
                continue

            company_id = company_id_map[funding.company_name]

            # 检查融资是否已存在
            cursor.execute("""
                SELECT id FROM funding_events
                WHERE company_id = %s AND funding_date = %s AND round_name = %s
            """, (company_id, funding.funding_date, funding.round_name))

            if cursor.fetchone():
                print(f"  融资已存在: {funding.company_name} - {funding.round_name}")
                continue

            # 插入新融资
            cursor.execute("""
                INSERT INTO funding_events (
                    company_id, funding_date, round_name, amount_usd, amount_formatted,
                    investors, valuation_usd, valuation_formatted, source
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
            """, (company_id, funding.funding_date, funding.round_name, funding.amount_usd,
                  funding.amount_formatted, funding.investors, funding.valuation_usd,
                  funding.valuation_formatted, funding.source))
            print(f"  ✅ 插入融资: {funding.company_name} - {funding.round_name}: {funding.amount_formatted}")

        cursor.close()

    def _import_leaderboards(self, leaderboards: List[Leaderboard], model_id_map: Dict[str, str]):
        """导入榜单数据"""
        print(f"导入 {len(leaderboards)} 条榜单记录...")

        cursor = self.conn.cursor()

        for leaderboard in leaderboards:
            if leaderboard.model_name not in model_id_map:
                print(f"  ⚠️  模型不存在: {leaderboard.model_name}")
                continue

            model_id = model_id_map[leaderboard.model_name]

            # 检查榜单记录是否已存在
            cursor.execute("""
                SELECT id FROM leaderboard_entries
                WHERE leaderboard_name = %s AND model_id = %s AND recorded_at = %s
            """, (leaderboard.leaderboard_name, model_id, leaderboard.recorded_at))

            if cursor.fetchone():
                print(f"  榜单记录已存在: {leaderboard.model_name} - {leaderboard.leaderboard_name}")
                continue

            # 插入新榜单记录
            cursor.execute("""
                INSERT INTO leaderboard_entries (
                    leaderboard_name, model_id, rank_position, score, recorded_at, source
                ) VALUES (%s, %s, %s, %s, %s, %s)
            """, (leaderboard.leaderboard_name, model_id, leaderboard.rank_position,
                  leaderboard.score, leaderboard.recorded_at, leaderboard.source))
            print(f"  ✅ 插入榜单: {leaderboard.model_name} - {leaderboard.leaderboard_name}: #{leaderboard.rank_position}")

        cursor.close()


# ============================================
# 主函数
# ============================================

def main():
    parser = argparse.ArgumentParser(description='ModelTrack 数据迁移脚本')
    parser.add_argument('--html-file', required=True, help='HTML 文件路径')
    parser.add_argument('--db-url', required=True, help='PostgreSQL 数据库连接字符串')
    parser.add_argument('--dry-run', action='store_true', help='仅解析数据，不导入数据库')

    args = parser.parse_args()

    print("=" * 60)
    print("ModelTrack 数据迁移脚本")
    print("=" * 60)

    # 读取 HTML 文件
    print(f"\n读取文件: {args.html_file}")
    with open(args.html_file, 'r', encoding='utf-8') as f:
        html_content = f.read()
    print(f"文件大小: {len(html_content)} 字节")

    # 解析数据
    html_parser = HTMLParser(html_content)
    html_parser.parse_all()

    # 打印统计
    print("\n" + "=" * 60)
    print("解析统计:")
    print("=" * 60)
    print(f"公司数量: {len(html_parser.companies)}")
    print(f"模型数量: {len(html_parser.models)}")
    print(f"Benchmark 记录: {len(html_parser.benchmarks)}")
    print(f"价格记录: {len(html_parser.prices)}")
    print(f"融资记录: {len(html_parser.fundings)}")
    print(f"榜单记录: {len(html_parser.leaderboards)}")

    # 如果是 dry-run，只打印数据
    if args.dry_run:
        print("\n[DRY RUN] 不导入数据库")
        print("\n示例数据:")
        print("\n公司:")
        for name, company in list(html_parser.companies.items())[:3]:
            print(f"  - {name}: {company.region} / {company.type} / {company.valuation}")

        print("\n模型:")
        for model in html_parser.models[:5]:
            print(f"  - {model.name} ({model.company_name}): {model.category} / {model.release_date}")

        print("\nBenchmark:")
        for benchmark in html_parser.benchmarks[:5]:
            print(f"  - {benchmark.model_name}: {benchmark.benchmark_name} = {benchmark.score}")

        return

    # 导入数据库
    print("\n" + "=" * 60)
    print("开始导入数据库...")
    print("=" * 60)

    db_importer = DatabaseImporter(args.db_url)
    db_importer.import_all(html_parser)

    print("\n✅ 数据迁移完成！")


if __name__ == '__main__':
    main()
