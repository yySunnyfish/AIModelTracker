#!/usr/bin/env python3
"""
数据验证脚本
检查数据完整性、置信度评分和一致性

用法:
    python validate_data.py --db-url postgresql://user:pass@host:port/db
"""

import argparse
from datetime import datetime, timedelta
from typing import List, Dict, Any
import psycopg2
from psycopg2.extras import RealDictCursor


class DataValidator:
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.conn = None
        self.issues = []

    def connect(self):
        """连接数据库"""
        self.conn = psycopg2.connect(self.db_url)

    def close(self):
        """关闭连接"""
        if self.conn:
            self.conn.close()

    def validate_all(self):
        """运行所有验证检查"""
        print("=" * 60)
        print("ModelTrack 数据验证")
        print("=" * 60)
        print()

        self.connect()

        checks = [
            ("数据完整性", self.check_data_integrity),
            ("数据新鲜度", self.check_data_freshness),
            ("数据一致性", self.check_data_consistency),
            ("置信度评分", self.check_confidence_scores),
            ("外键完整性", self.check_foreign_keys),
            ("Benchmark 覆盖率", self.check_benchmark_coverage),
            ("价格覆盖率", self.check_price_coverage),
            ("公司关联", self.check_company_models),
        ]

        for name, check_func in checks:
            print(f"\n🔍 检查: {name}")
            print("-" * 60)
            check_func()

        self.close()

        # 打印摘要
        self.print_summary()

    def check_data_integrity(self):
        """检查数据完整性"""
        cursor = self.conn.cursor(cursor_factory=RealDictCursor)

        # 检查模型数量
        cursor.execute("SELECT COUNT(*) as count FROM models WHERE archived_at IS NULL")
        models_count = cursor.fetchone()['count']
        print(f"  ✅ 活跃模型数量: {models_count}")

        if models_count < 100:
            self.add_issue("数据完整性", f"活跃模型数量少于 100: {models_count}", "warning")

        # 检查公司数量
        cursor.execute("SELECT COUNT(*) as count FROM companies")
        companies_count = cursor.fetchone()['count']
        print(f"  ✅ 公司数量: {companies_count}")

        if companies_count < 30:
            self.add_issue("数据完整性", f"公司数量少于 30: {companies_count}", "warning")

        # 检查 Benchmark 记录
        cursor.execute("SELECT COUNT(*) as count FROM model_benchmarks")
        benchmarks_count = cursor.fetchone()['count']
        print(f"  ✅ Benchmark 记录: {benchmarks_count}")

        # 检查价格记录
        cursor.execute("SELECT COUNT(*) as count FROM price_history")
        prices_count = cursor.fetchone()['count']
        print(f"  ✅ 价格记录: {prices_count}")

        cursor.close()

    def check_data_freshness(self):
        """检查数据新鲜度"""
        cursor = self.conn.cursor(cursor_factory=RealDictCursor)

        # 检查最近更新的模型
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM models
            WHERE updated_at > CURRENT_TIMESTAMP - INTERVAL '7 days'
        """)
        recent_updates = cursor.fetchone()['count']
        print(f"  ✅ 最近 7 天更新的模型: {recent_updates}")

        if recent_updates < 5:
            self.add_issue("数据新鲜度", f"最近 7 天更新少于 5 个: {recent_updates}", "warning")

        # 检查 Benchmark 新鲜度
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM model_benchmarks
            WHERE tested_at > CURRENT_DATE - INTERVAL '30 days'
        """)
        recent_benchmarks = cursor.fetchone()['count']
        print(f"  ✅ 最近 30 天的 Benchmark: {recent_benchmarks}")

        if recent_benchmarks < 20:
            self.add_issue("数据新鲜度", f"最近 30 天 Benchmark 少于 20: {recent_benchmarks}", "warning")

        # 检查价格新鲜度
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM price_history
            WHERE effective_from > CURRENT_DATE - INTERVAL '30 days'
        """)
        recent_prices = cursor.fetchone()['count']
        print(f"  ✅ 最近 30 天的价格更新: {recent_prices}")

        cursor.close()

    def check_data_consistency(self):
        """检查数据一致性"""
        cursor = self.conn.cursor(cursor_factory=RealDictCursor)

        # 检查模型没有关联公司
        cursor.execute("""
            SELECT m.name as model_name
            FROM models m
            LEFT JOIN companies c ON m.company_id = c.id
            WHERE c.id IS NULL
            LIMIT 10
        """)
        orphan_models = cursor.fetchall()
        if orphan_models:
            print(f"  ⚠️  发现 {len(orphan_models)} 个模型没有关联公司")
            for model in orphan_models[:5]:
                print(f"    - {model['model_name']}")
            self.add_issue("数据一致性", f"{len(orphan_models)} 个模型没有关联公司", "error")
        else:
            print("  ✅ 所有模型都有关联公司")

        # 检查 Benchmark 分数范围
        cursor.execute("""
            SELECT mb.id, m.name as model_name, b.name as benchmark_name, mb.score
            FROM model_benchmarks mb
            JOIN models m ON mb.model_id = m.id
            JOIN benchmarks b ON mb.benchmark_id = b.id
            WHERE mb.score < 0 OR mb.score > b.max_score
            LIMIT 10
        """)
        invalid_scores = cursor.fetchall()
        if invalid_scores:
            print(f"  ⚠️  发现 {len(invalid_scores)} 个无效 Benchmark 分数")
            for score in invalid_scores[:5]:
                print(f"    - {score['model_name']}: {score['benchmark_name']} = {score['score']}")
            self.add_issue("数据一致性", f"{len(invalid_scores)} 个无效 Benchmark 分数", "error")
        else:
            print("  ✅ 所有 Benchmark 分数在有效范围内")

        # 检查价格合理性
        cursor.execute("""
            SELECT m.name as model_name, ph.input_price_per_million, ph.output_price_per_million
            FROM price_history ph
            JOIN models m ON ph.model_id = m.id
            WHERE ph.input_price_per_million < 0 OR ph.output_price_per_million < 0
               OR ph.input_price_per_million > 100 OR ph.output_price_per_million > 500
            LIMIT 10
        """)
        invalid_prices = cursor.fetchall()
        if invalid_prices:
            print(f"  ⚠️  发现 {len(invalid_prices)} 个异常价格")
            for price in invalid_prices[:5]:
                print(f"    - {price['model_name']}: ${price['input_price_per_million']}/${price['output_price_per_million']}")
            self.add_issue("数据一致性", f"{len(invalid_prices)} 个异常价格", "warning")
        else:
            print("  ✅ 所有价格在合理范围内")

        cursor.close()

    def check_confidence_scores(self):
        """检查置信度评分"""
        cursor = self.conn.cursor(cursor_factory=RealDictCursor)

        # 检查未验证的模型
        cursor.execute("""
            SELECT name, data_source, confidence_score
            FROM models
            WHERE verified_at IS NULL
            ORDER BY confidence_score DESC
            LIMIT 10
        """)
        unverified_models = cursor.fetchall()
        print(f"  ⚠️  未验证的模型: {len(unverified_models)} 个")
        for model in unverified_models[:5]:
            print(f"    - {model['name']}: 置信度 {model['confidence_score']}")

        # 计算平均置信度
        cursor.execute("SELECT AVG(confidence_score) as avg FROM models")
        avg_confidence = cursor.fetchone()['avg']
        print(f"  ✅ 平均置信度: {avg_confidence:.2f}")

        if avg_confidence < 0.8:
            self.add_issue("置信度评分", f"平均置信度低于 0.8: {avg_confidence:.2f}", "warning")

        # 检查 Benchmark 置信度
        cursor.execute("SELECT AVG(confidence_score) as avg FROM model_benchmarks")
        benchmark_avg_confidence = cursor.fetchone()['avg']
        print(f"  ✅ Benchmark 平均置信度: {benchmark_avg_confidence:.2f}")

        cursor.close()

    def check_foreign_keys(self):
        """检查外键完整性"""
        cursor = self.conn.cursor(cursor_factory=RealDictCursor)

        # 检查 model_benchmarks 外键
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM model_benchmarks mb
            LEFT JOIN models m ON mb.model_id = m.id
            WHERE m.id IS NULL
        """)
        orphan_benchmarks = cursor.fetchone()['count']
        if orphan_benchmarks > 0:
            self.add_issue("外键完整性", f"{orphan_benchmarks} 个 Benchmark 记录没有关联模型", "error")
        else:
            print("  ✅ 所有 Benchmark 外键完整")

        # 检查 price_history 外键
        cursor.execute("""
            SELECT COUNT(*) as count
            FROM price_history ph
            LEFT JOIN models m ON ph.model_id = m.id
            WHERE m.id IS NULL
        """)
        orphan_prices = cursor.fetchone()['count']
        if orphan_prices > 0:
            self.add_issue("外键完整性", f"{orphan_prices} 个价格记录没有关联模型", "error")
        else:
            print("  ✅ 所有价格外键完整")

        cursor.close()

    def check_benchmark_coverage(self):
        """检查 Benchmark 覆盖率"""
        cursor = self.conn.cursor(cursor_factory=RealDictCursor)

        # 检查有 Benchmark 的模型比例
        cursor.execute("""
            SELECT
                COUNT(DISTINCT m.id) as models_with_benchmarks,
                (SELECT COUNT(*) FROM models WHERE archived_at IS NULL) as total_models
            FROM models m
            INNER JOIN model_benchmarks mb ON m.id = mb.model_id
            WHERE m.archived_at IS NULL
        """)
        result = cursor.fetchone()
        coverage = (result['models_with_benchmarks'] / result['total_models'] * 100) if result['total_models'] > 0 else 0
        print(f"  ✅ Benchmark 覆盖率: {coverage:.1f}% ({result['models_with_benchmarks']}/{result['total_models']})")

        if coverage < 80:
            self.add_issue("Benchmark 覆盖率", f"Benchmark 覆盖率低于 80%: {coverage:.1f}%", "warning")

        # 检查哪些 Benchmark 最常用
        cursor.execute("""
            SELECT b.name, COUNT(*) as count
            FROM model_benchmarks mb
            JOIN benchmarks b ON mb.benchmark_id = b.id
            GROUP BY b.name
            ORDER BY count DESC
            LIMIT 5
        """)
        top_benchmarks = cursor.fetchall()
        print("  📊 最常用的 Benchmark:")
        for bench in top_benchmarks:
            print(f"    - {bench['name']}: {bench['count']} 次")

        cursor.close()

    def check_price_coverage(self):
        """检查价格覆盖率"""
        cursor = self.conn.cursor(cursor_factory=RealDictCursor)

        # 检查闭源模型的价格覆盖率
        cursor.execute("""
            SELECT
                COUNT(DISTINCT m.id) as models_with_prices,
                (SELECT COUNT(*) FROM models WHERE license = 'closed' AND archived_at IS NULL) as total_closed_models
            FROM models m
            INNER JOIN price_history ph ON m.id = ph.model_id
            WHERE m.license = 'closed' AND m.archived_at IS NULL
        """)
        result = cursor.fetchone()
        coverage = (result['models_with_prices'] / result['total_closed_models'] * 100) if result['total_closed_models'] > 0 else 0
        print(f"  ✅ 闭源模型价格覆盖率: {coverage:.1f}% ({result['models_with_prices']}/{result['total_closed_models']})")

        if coverage < 90:
            self.add_issue("价格覆盖率", f"闭源模型价格覆盖率低于 90%: {coverage:.1f}%", "warning")

        cursor.close()

    def check_company_models(self):
        """检查公司与模型的关联"""
        cursor = self.conn.cursor(cursor_factory=RealDictCursor)

        # 检查没有模型的公司
        cursor.execute("""
            SELECT c.name
            FROM companies c
            LEFT JOIN models m ON c.id = m.company_id
            WHERE m.id IS NULL
        """)
        companies_without_models = cursor.fetchall()
        if companies_without_models:
            print(f"  ⚠️  发现 {len(companies_without_models)} 家公司没有模型:")
            for company in companies_without_models[:5]:
                print(f"    - {company['name']}")
            self.add_issue("公司关联", f"{len(companies_without_models)} 家公司没有模型", "warning")
        else:
            print("  ✅ 所有公司都有关联模型")

        # 检查模型数量最多的公司
        cursor.execute("""
            SELECT c.name, COUNT(m.id) as model_count
            FROM companies c
            INNER JOIN models m ON c.id = m.company_id
            GROUP BY c.id, c.name
            ORDER BY model_count DESC
            LIMIT 5
        """)
        top_companies = cursor.fetchall()
        print("  📊 模型数量最多的公司:")
        for company in top_companies:
            print(f"    - {company['name']}: {company['model_count']} 个模型")

        cursor.close()

    def add_issue(self, category: str, message: str, severity: str):
        """添加问题"""
        self.issues.append({
            'category': category,
            'message': message,
            'severity': severity
        })

    def print_summary(self):
        """打印摘要"""
        print("\n" + "=" * 60)
        print("验证摘要")
        print("=" * 60)

        if not self.issues:
            print("\n✅ 所有检查通过！数据质量良好。")
            return

        errors = [i for i in self.issues if i['severity'] == 'error']
        warnings = [i for i in self.issues if i['severity'] == 'warning']

        print(f"\n❌ 发现 {len(errors)} 个错误")
        print(f"⚠️  发现 {len(warnings)} 个警告")

        if errors:
            print("\n错误详情:")
            for i, issue in enumerate(errors, 1):
                print(f"{i}. [{issue['category']}] {issue['message']}")

        if warnings:
            print("\n警告详情:")
            for i, issue in enumerate(warnings, 1):
                print(f"{i}. [{issue['category']}] {issue['message']}")

        print("\n建议:")
        if errors:
            print("  - 优先修复错误，这些问题可能导致系统功能异常")
        if warnings:
            print("  - 警告可以稍后处理，但会影响数据质量")


def main():
    parser = argparse.ArgumentParser(description='ModelTrack 数据验证脚本')
    parser.add_argument('--db-url', required=True, help='PostgreSQL 数据库连接字符串')

    args = parser.parse_args()

    validator = DataValidator(args.db_url)
    validator.validate_all()


if __name__ == '__main__':
    main()
