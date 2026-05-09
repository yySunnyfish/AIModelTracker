#!/usr/bin/env python3
"""
Database initialization script — companies, benchmarks, models.
Idempotent: skips rows that already exist (matched by name).
"""
import json, os, sys, urllib.request, urllib.parse

SUPABASE_URL = "https://iufcjqzeeqatdzqopism.supabase.co"
SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1ZmNqcXplZXFhdGR6cW9waXNtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzE0OTIyNywiZXhwIjoyMDkyNzI1MjI3fQ.sPBcJhg9q-ZbZw0_Bdv38lmMsu7UAIDLK5CUtiMNIKg"

HEADERS = {
    "apikey": SERVICE_KEY,
    "Authorization": f"Bearer {SERVICE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "return=representation",
}

# ── helpers ────────────────────────────────────────────────────────────────────

def api(method, path, body=None, params=None):
    url = f"{SUPABASE_URL}/rest/v1/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(body).encode() if body is not None else None
    req  = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as r:
            text = r.read().decode()
            return json.loads(text) if text.strip() else []
    except urllib.error.HTTPError as e:
        err = e.read().decode()
        print(f"  !! {method} {path}: HTTP {e.code} — {err[:200]}")
        return None

def get_all(table, select="*", extra_params=None):
    params = {"select": select}
    if extra_params:
        params.update(extra_params)
    return api("GET", table, params=params) or []

def upsert_by_name(table, rows, name_key="name"):
    existing = {r[name_key] for r in get_all(table, select=name_key)}
    added, skipped = 0, 0
    for row in rows:
        if row[name_key] in existing:
            skipped += 1
            continue
        result = api("POST", table, body=row)
        if result is not None:
            added += 1
            print(f"    + {row[name_key]}")
        else:
            print(f"    ✗ FAILED: {row[name_key]}")
    return added, skipped

def patch_where(table, filter_param, body):
    return api("PATCH", table, body=body, params={filter_param[0]: filter_param[1]})

# ── 1. Companies ───────────────────────────────────────────────────────────────

NEW_COMPANIES = [
    # ─ LLM (not yet in DB) ─
    # (none required — all 10 LLM companies already exist)

    # ─ Embodied Robotics ─
    dict(name="NVIDIA",          region="US", type="Robotics", founded_year=1993,
         business_model="Hardware + Platform licensing",
         moat="GPU monopoly · Isaac robotics platform · GR00T foundation model"),
    dict(name="Figure AI",       region="US", type="Robotics", founded_year=2022,
         business_model="Humanoid robot sales + licensing",
         moat="BMW/OpenAI partnership · Helix VLA"),
    dict(name="1X Technologies", region="EU", type="Robotics", founded_year=2014,
         business_model="Robot-as-a-service",
         moat="NEO humanoid · data flywheel from EVE fleet"),
    dict(name="DYNA",            region="CN", type="Robotics",
         business_model="Embodied AI foundation model licensing",
         moat="General-purpose robot policy research"),
    dict(name="Tesla",           region="US", type="Robotics", founded_year=2003,
         business_model="Robot sales (Optimus) + manufacturing",
         moat="Vertical integration · FSD data · scale"),
    dict(name="银河通用",         name_cn="银河通用机器人", region="CN", type="Robotics", founded_year=2023,
         business_model="Humanoid robot sales + enterprise deployment",
         moat="Galbot G1 · logistics + industrial use cases"),
    dict(name="星海图",           name_cn="星海图智能科技", region="CN", type="Robotics", founded_year=2023,
         business_model="Embodied intelligence foundation model + robot platform",
         moat="Multimodal foundation model for embodied tasks"),
]

# ─ Fix existing ─
COMPANY_PATCHES = [
    # Baidu region correction
    (("name=eq.Baidu", ),  {"region": "CN"}),
    # Arena ELO unit is "percentage" but should be "score"
]

# ── 2. Benchmarks ──────────────────────────────────────────────────────────────

NEW_BENCHMARKS = [
    # ── LLM: coding ──
    dict(name="LiveCodeBench",
         description="Real-time coding benchmark using new contest problems (contamination-free)",
         max_score=100, unit="percentage", benchmark_type="coding"),
    dict(name="BigCodeBench",
         description="Diverse programming tasks covering real-world library usage",
         max_score=100, unit="percentage", benchmark_type="coding"),
    dict(name="MBPP",
         description="Mostly Basic Python Programming — 500 crowd-sourced problems",
         max_score=100, unit="percentage", benchmark_type="coding"),
    dict(name="BFCL",
         description="Berkeley Function-Calling Leaderboard — tool use / function calling accuracy",
         max_score=100, unit="percentage", benchmark_type="coding"),

    # ── LLM: reasoning ──
    dict(name="BBH",
         description="BIG-Bench Hard — 23 challenging tasks requiring chain-of-thought reasoning",
         max_score=100, unit="percentage", benchmark_type="reasoning"),
    dict(name="GSM8K",
         description="Grade School Math — 8500 diverse math word problems",
         max_score=100, unit="percentage", benchmark_type="reasoning"),
    dict(name="DROP",
         description="Discrete Reasoning Over Paragraphs — F1 score on reading comprehension",
         max_score=100, unit="percentage", benchmark_type="reasoning"),
    dict(name="HellaSwag",
         description="Commonsense NLI — sentence completion with grounded commonsense",
         max_score=100, unit="percentage", benchmark_type="reasoning"),

    # ── LLM: general / alignment ──
    dict(name="MT-Bench",
         description="Multi-turn conversation quality judged by GPT-4 (1–10 scale)",
         max_score=10, unit="score", benchmark_type="general"),
    dict(name="IFEval",
         description="Instruction Following Evaluation — strict/prompt accuracy on verifiable instructions",
         max_score=100, unit="percentage", benchmark_type="general"),

    # ── LLM: multimodal ──
    dict(name="MMMU",
         description="Massive Multi-discipline Multimodal Understanding — college-level questions",
         max_score=100, unit="percentage", benchmark_type="multimodal"),
    dict(name="MMBench",
         description="Comprehensive multimodal evaluation across perception and cognition",
         max_score=100, unit="percentage", benchmark_type="multimodal"),
    dict(name="DocVQA",
         description="Document Visual Question Answering — understanding scanned documents",
         max_score=100, unit="percentage", benchmark_type="multimodal"),

    # ── Robotics: manipulation ──
    dict(name="LIBERO",
         description="Knowledge transfer benchmark for robot manipulation — 4 task suites (130 tasks)",
         max_score=100, unit="percentage", benchmark_type="robotics"),
    dict(name="ManiSkill",
         description="SAPIEN-based diverse tabletop manipulation benchmark (rigid + articulated)",
         max_score=100, unit="percentage", benchmark_type="robotics"),
    dict(name="RLBench",
         description="100 diverse robot manipulation tasks in CoppeliaSim",
         max_score=100, unit="percentage", benchmark_type="robotics"),
    dict(name="BiGym",
         description="Bimanual dexterous manipulation benchmark in simulation",
         max_score=100, unit="percentage", benchmark_type="robotics"),
    dict(name="SimplerEnv",
         description="Sim-to-real transfer evaluation aligned with BridgeData V2 and Google RT setups",
         max_score=100, unit="percentage", benchmark_type="robotics"),
    dict(name="Open-X Embodiment",
         description="Cross-embodiment generalization across 22 robot types (Google RT-X benchmark)",
         max_score=100, unit="percentage", benchmark_type="robotics"),
    dict(name="DROID Eval",
         description="In-the-wild robot manipulation evaluation using DROID dataset scenarios",
         max_score=100, unit="percentage", benchmark_type="robotics"),

    # ── Robotics: loco-manipulation / whole-body ──
    dict(name="HumanoidBench",
         description="Humanoid whole-body control benchmark — 27 tasks (locomotion + manipulation)",
         max_score=100, unit="percentage", benchmark_type="robotics"),
]

# Also patch Arena ELO unit
BENCHMARK_PATCHES = [
    (("name=eq.Arena%20ELO",), {"unit": "score", "description": "LMSYS Chatbot Arena ELO rating — human preference ranking"}),
]

# ── 3. Models ──────────────────────────────────────────────────────────────────

# Will be populated after companies are fetched (need company_id)
EMBODIED_MODELS_DEF = [
    # Physical Intelligence — pi0 is MISSING from DB
    dict(company="Physical Intelligence", name="pi0",
         params="3B", context_window=None, license="closed",
         release_date="2024-10-31", category="world",
         architecture="Vision-Language-Action (VLA) — PaliGemma 3B backbone",
         innovation="First cross-embodiment generalist robot policy; pre-trains on diverse data then fine-tunes per robot via flow matching",
         modalities=["vision","text"]),

    # NVIDIA
    dict(company="NVIDIA", name="GR00T N1",
         params="Undisclosed", context_window=None, license="closed",
         release_date="2024-03-18", category="world",
         architecture="Dual-system VLA: fast reactive policy (System 1) + slow deliberative reasoning (System 2)",
         innovation="First open-platform humanoid foundation model; supports 38+ robot embodiments via Isaac Lab sim-to-real",
         modalities=["vision","text"]),
    dict(company="NVIDIA", name="GR00T N1.5",
         params="Undisclosed", context_window=None, license="closed",
         release_date="2025-05-19", category="world",
         architecture="Improved dual-system VLA with enhanced dexterous manipulation",
         innovation="Enhanced dexterity via synthetic data pipeline with Isaac GR00T Mimic; improved tool-use and bimanual tasks",
         modalities=["vision","text"]),

    # Figure AI
    dict(company="Figure AI", name="Helix",
         params="Undisclosed", context_window=None, license="closed",
         release_date="2025-01-16", category="world",
         architecture="VLA — vision-language-action model integrating OpenAI VLM backbone",
         innovation="Bimanual whole-body control enabling simultaneous two-hand manipulation on Figure 02; semantic scene understanding → direct motor commands",
         modalities=["vision","text"]),

    # 1X Technologies
    dict(company="1X Technologies", name="World Model",
         params="Undisclosed", context_window=None, license="closed",
         release_date="2024-10-28", category="world",
         architecture="Video-conditioned world model for humanoid motion prediction",
         innovation="Generates coherent future-frame predictions of robot actions purely from video — trained entirely on real NEO robot data with no simulation",
         modalities=["vision"]),

    # Tesla
    dict(company="Tesla", name="Optimus Gen 2",
         params="Undisclosed", context_window=None, license="closed",
         release_date="2024-01-15", category="world",
         architecture="End-to-end neural network integrating Tesla FSD computer + custom AI inference chip",
         innovation="30% faster walk speed, 22-DOF hands enabling egg handling; trained on Tesla Dojo using FSD-style imitation learning",
         modalities=["vision","text"]),

    # Google DeepMind — robotics models
    dict(company="Google DeepMind", name="RT-2",
         params="55B", context_window=None, license="closed",
         release_date="2023-07-28", category="world",
         architecture="Vision-Language-Action model based on PaLI-X / PaLM-E; outputs robot actions as text tokens",
         innovation="First VLA to directly co-fine-tune web-scale VLM for robot control; emergent chain-of-thought reasoning for novel objects",
         modalities=["vision","text"]),
    dict(company="Google DeepMind", name="Gemini Robotics",
         params="Undisclosed", context_window=None, license="closed",
         release_date="2025-03-12", category="world",
         architecture="VLA built on Gemini 2.0 multimodal backbone with robot action head",
         innovation="State-of-the-art dexterous manipulation; supports origami, tool repair, bimanual tasks; 3× improvement over RT-2 on LIBERO",
         modalities=["vision","text"]),

    # 银河通用 (Galbot)
    dict(company="银河通用", name="Galbot G1",
         params="Undisclosed", context_window=None, license="closed",
         release_date="2024-09-01", category="world",
         architecture="Hierarchical policy: task planning LLM + low-level visuomotor policy",
         innovation="First Chinese humanoid to commercialize in logistics warehouses; whole-body loco-manipulation combining locomotion and arm control",
         modalities=["vision","text"]),

    # 星海图
    dict(company="星海图", name="AgiBot World Model",
         params="Undisclosed", context_window=None, license="closed",
         release_date="2025-02-01", category="world",
         architecture="Multimodal foundation model for embodied tasks with cross-embodiment transfer",
         innovation="Trained on AgiBot World dataset (1M+ episodes); supports language-conditioned manipulation across household and industrial environments",
         modalities=["vision","text"]),
]

# ── main ───────────────────────────────────────────────────────────────────────

def main():
    print("\n━━━ Step 1: Add companies ━━━")
    added, skipped = upsert_by_name("companies", NEW_COMPANIES)
    print(f"  → {added} added, {skipped} already existed")

    # Patch Baidu region
    print("\n━━━ Step 1b: Patch Baidu region → CN ━━━")
    r = patch_where("companies", ("name=eq.Baidu", None), {"region": "CN"})
    print("  → done")

    print("\n━━━ Step 2: Add benchmarks ━━━")
    added, skipped = upsert_by_name("benchmarks", NEW_BENCHMARKS)
    print(f"  → {added} added, {skipped} already existed")

    # Patch Arena ELO unit
    print("\n━━━ Step 2b: Patch Arena ELO unit → score ━━━")
    api("PATCH", "benchmarks", body={"unit": "score",
        "description": "LMSYS Chatbot Arena ELO rating — human preference ranking (range ~900–1400)"},
        params={"name": "eq.Arena ELO"})
    print("  → done")

    print("\n━━━ Step 3: Add embodied models ━━━")
    # Build company name→id map
    companies = get_all("companies", select="id,name")
    cmap = {c["name"]: c["id"] for c in companies}

    existing_model_names = {m["name"] for m in get_all("models", select="name")}
    added_count = 0

    for m in EMBODIED_MODELS_DEF:
        if m["name"] in existing_model_names:
            print(f"  ~ skip (exists): {m['name']}")
            continue
        company_id = cmap.get(m["company"])
        if not company_id:
            print(f"  ✗ company not found: {m['company']} — skipping {m['name']}")
            continue

        payload = {
            "company_id":    company_id,
            "name":          m["name"],
            "category":      m["category"],
            "license":       m["license"],
            "release_date":  m["release_date"],
            "params":        m.get("params"),
            "context_window":m.get("context_window"),
            "modalities":    m.get("modalities", ["vision","text"]),
            "architecture":  m.get("architecture"),
            "innovation":    m.get("innovation"),
            "data_source":   "manual",
            "confidence_score": 0.9,
        }
        result = api("POST", "models", body=payload)
        if result:
            print(f"  + {m['name']} ({m['company']})")
            added_count += 1
        else:
            print(f"  ✗ FAILED: {m['name']}")

    print(f"  → {added_count} models added")

    print("\n━━━ Verification ━━━")
    companies = get_all("companies", select="name,region,type")
    robotics_cos = [c for c in companies if c["type"] == "Robotics"]
    llm_cos      = [c for c in companies if c["type"] == "LLM"]
    print(f"  LLM companies:      {len(llm_cos)}")
    print(f"  Robotics companies: {len(robotics_cos)}")
    print(f"  Robotics: {[c['name'] for c in robotics_cos]}")

    benchmarks = get_all("benchmarks", select="name,benchmark_type")
    by_type = {}
    for b in benchmarks:
        by_type.setdefault(b["benchmark_type"], []).append(b["name"])
    print("\n  Benchmarks by type:")
    for t, names in sorted(by_type.items()):
        print(f"    {t:12s}: {len(names):2d} — {', '.join(sorted(names))}")

    world_models = api("GET", "models", params={"category": "eq.world", "select": "name", "archived_at": "is.null"})
    print(f"\n  World/embodied models: {len(world_models or [])} — {[m['name'] for m in (world_models or [])]}")

if __name__ == "__main__":
    main()
