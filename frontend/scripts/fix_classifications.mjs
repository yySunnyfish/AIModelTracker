#!/usr/bin/env node
/**
 * 校正所有模型的 license + category（基于技术报告/代码库交叉验证）
 * license: 'open' | 'closed' | 'partial'
 * category: 'general' | 'reasoning' | 'code' | 'multimodal' | 'edge' | 'world'
 *
 * edge  = 端侧/小参数，适合本地部署（≤15B 或活跃参数小）
 * world = 具身智能 / 世界模型
 */

const SUPABASE_URL  = 'https://iufcjqzeeqatdzqopism.supabase.co'
const SERVICE_KEY   = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml1ZmNqcXplZXFhdGR6cW9waXNtIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzE0OTIyNywiZXhwIjoyMDkyNzI1MjI3fQ.sPBcJhg9q-ZbZw0_Bdv38lmMsu7UAIDLK5CUtiMNIKg'

// name → { license, category }
// 来源：官方 GitHub / HuggingFace license 字段 + 技术报告
const CLASSIFICATIONS = [
  // ── OpenAI (all closed) ──────────────────────────────────────────
  { name: 'GPT-4o',         license: 'closed', category: 'multimodal' },
  { name: 'GPT-4o mini',    license: 'closed', category: 'general'    },
  { name: 'o1-mini',        license: 'closed', category: 'reasoning'  },
  { name: 'o1-pro',         license: 'closed', category: 'reasoning'  },
  { name: 'o1',             license: 'closed', category: 'reasoning'  },
  { name: 'o3-mini',        license: 'closed', category: 'reasoning'  },
  { name: 'GPT-4.5',        license: 'closed', category: 'general'    },
  { name: 'GPT-4.1',        license: 'closed', category: 'general'    },
  { name: 'GPT-4.1 mini',   license: 'closed', category: 'general'    },
  { name: 'GPT-4.1 nano',   license: 'closed', category: 'edge'       }, // on-device target
  { name: 'o3',             license: 'closed', category: 'reasoning'  },
  { name: 'o4-mini',        license: 'closed', category: 'reasoning'  },
  { name: 'Sora',           license: 'closed', category: 'multimodal' },
  { name: 'GPT-5.4',        license: 'closed', category: 'general'    },

  // ── Anthropic (all closed) ───────────────────────────────────────
  { name: 'Claude 3 Haiku',    license: 'closed', category: 'general'   },
  { name: 'Claude 3 Sonnet',   license: 'closed', category: 'general'   },
  { name: 'Claude 3 Opus',     license: 'closed', category: 'general'   },
  { name: 'Claude 3.5 Sonnet', license: 'closed', category: 'general'   },
  { name: 'Claude 3.5 Haiku',  license: 'closed', category: 'general'   },
  { name: 'Claude 3.7 Sonnet', license: 'closed', category: 'reasoning' },
  { name: 'Claude Opus 4.6',   license: 'closed', category: 'reasoning' },
  { name: 'Claude Opus 4.7',   license: 'closed', category: 'reasoning' },

  // ── Google DeepMind ──────────────────────────────────────────────
  // Gemini = closed；Gemma = open (Apache 2.0)
  { name: 'Gemini 1.5 Pro',       license: 'closed', category: 'multimodal' },
  { name: 'Gemini 1.5 Flash',     license: 'closed', category: 'multimodal' },
  { name: 'Gemma 2 9B',           license: 'open',   category: 'edge'       }, // 9B Apache 2.0
  { name: 'Gemma 2 27B',          license: 'open',   category: 'general'    },
  { name: 'Gemini 2.0 Flash',     license: 'closed', category: 'multimodal' },
  { name: 'Gemini 2.0 Flash Lite',license: 'closed', category: 'multimodal' },
  { name: 'Gemma 3 12B',          license: 'open',   category: 'edge'       }, // 12B Apache 2.0
  { name: 'Gemma 3 27B',          license: 'open',   category: 'general'    },
  { name: 'Gemini 2.5 Pro',       license: 'closed', category: 'reasoning'  },
  { name: 'Gemini 2.5 Flash',     license: 'closed', category: 'multimodal' },
  { name: 'Veo 3',                license: 'closed', category: 'multimodal' },
  { name: 'Gemini 3.1 Pro',       license: 'closed', category: 'general'    },
  { name: 'Gemma 4 E2B',          license: 'open',   category: 'edge'       }, // 2B Apache 2.0
  { name: 'Gemma 4 27B',          license: 'open',   category: 'multimodal' },

  // ── Meta (all open, Llama license / MIT) ────────────────────────
  { name: 'Llama 3.1 70B',        license: 'open', category: 'general'    },
  { name: 'Llama 3.1 405B',       license: 'open', category: 'general'    },
  { name: 'Llama 3.2 3B',         license: 'open', category: 'edge'       }, // 3B on-device
  { name: 'Llama 3.2 11B Vision', license: 'open', category: 'edge'       }, // 11B edge vision
  { name: 'Llama 3.2 90B Vision', license: 'open', category: 'multimodal' },
  { name: 'Llama 3.3 70B',        license: 'open', category: 'general'    },
  { name: 'Llama 4 Scout',        license: 'open', category: 'multimodal' },
  { name: 'Llama 4 Maverick',     license: 'open', category: 'multimodal' },

  // ── Mistral AI ───────────────────────────────────────────────────
  // Apache 2.0: Mixtral 8x22B, Nemo, Pixtral 12B, Small 3.1/3.2/4
  // Mistral Research: Large 2
  // Codestral license (non-commercial): Codestral 2501
  // API-only: Medium 3
  { name: 'Mixtral 8x22B',     license: 'open',    category: 'general' },
  { name: 'Mistral Nemo',      license: 'open',    category: 'edge'    }, // 12B Apache 2.0
  { name: 'Pixtral 12B',       license: 'open',    category: 'edge'    }, // 12B Apache 2.0
  { name: 'Mistral Large 2',   license: 'partial', category: 'general' }, // Mistral Research License
  { name: 'Codestral 2501',    license: 'partial', category: 'code'    }, // Codestral non-commercial
  { name: 'Mistral Small 3.1', license: 'open',    category: 'edge'    }, // 24B Apache 2.0, 6B active
  { name: 'Mistral Small 3.2', license: 'open',    category: 'edge'    }, // 24B Apache 2.0
  { name: 'Mistral Medium 3',  license: 'partial', category: 'general' }, // API-only
  { name: 'Mistral Small 4',   license: 'open',    category: 'edge'    }, // 119B MoE, 6B active, Apache 2.0

  // ── DeepSeek (MIT / DeepSeek open license) ──────────────────────
  { name: 'DeepSeek V2.5',    license: 'open', category: 'general'   },
  { name: 'DeepSeek V3',      license: 'open', category: 'general'   }, // MIT
  { name: 'DeepSeek R1',      license: 'open', category: 'reasoning' }, // MIT
  { name: 'DeepSeek V3-0324', license: 'open', category: 'general'   }, // MIT
  { name: 'DeepSeek V4-Pro',  license: 'open', category: 'general'   },
  { name: 'DeepSeek V4-Flash',license: 'open', category: 'general'   },

  // ── Alibaba / Qwen (Apache 2.0 for open weights) ─────────────────
  { name: 'Qwen2.5 72B',       license: 'open',   category: 'general'    },
  { name: 'Qwen2.5-Coder 32B', license: 'open',   category: 'code'       },
  { name: 'Qwen2.5-VL 72B',    license: 'open',   category: 'multimodal' },
  { name: 'QwQ-32B',           license: 'open',   category: 'reasoning'  },
  { name: 'Qwen3 32B',         license: 'open',   category: 'reasoning'  },
  { name: 'Qwen3 72B',         license: 'open',   category: 'reasoning'  },
  { name: 'Qwen3 235B',        license: 'open',   category: 'reasoning'  },
  { name: 'Qwen3 30B A3B',     license: 'open',   category: 'edge'       }, // 3B active params
  { name: 'Qwen3.5-Omni',      license: 'open',   category: 'multimodal' },
  { name: 'Qwen3.6-35B-A3B',   license: 'open',   category: 'code'       },
  { name: 'Qwen3.6-27B',       license: 'open',   category: 'code'       },
  { name: 'Qwen3.6-Plus',      license: 'closed', category: 'code'       }, // hosted API-only
  { name: 'Qwen3.6-Max',       license: 'closed', category: 'code'       }, // hosted API-only

  // ── MiniMax ──────────────────────────────────────────────────────
  { name: 'MiniMax-Text-01', license: 'open',   category: 'general' }, // Apache 2.0
  { name: 'MiniMax M2.5',    license: 'open',   category: 'general' }, // Apache 2.0
  { name: 'MiniMax M2.7',    license: 'closed', category: 'general' }, // API-only

  // ── Zhipu AI ─────────────────────────────────────────────────────
  { name: 'GLM-4-Plus',  license: 'closed', category: 'general'    }, // API-only
  { name: 'GLM-4V-Plus', license: 'closed', category: 'multimodal' }, // API-only
  { name: 'GLM-5',       license: 'open',   category: 'general'    }, // Apache 2.0
  { name: 'GLM-5.1',     license: 'open',   category: 'general'    }, // MIT, Ascend-trained

  // ── Kimi / Moonshot AI ───────────────────────────────────────────
  { name: 'Kimi k1.5',  license: 'closed', category: 'reasoning' },
  { name: 'Kimi K2.5',  license: 'open',   category: 'general'   }, // open weights
  { name: 'Kimi K2.6',  license: 'open',   category: 'multimodal'}, // Modified MIT, 1T MoE

  // ── Cohere ───────────────────────────────────────────────────────
  { name: 'Command R+', license: 'partial', category: 'general' }, // CC-BY-NC
  { name: 'Command A',  license: 'closed',  category: 'general' },

  // ── Amazon ───────────────────────────────────────────────────────
  { name: 'Nova Pro',  license: 'closed', category: 'multimodal' },
  { name: 'Nova Lite', license: 'closed', category: 'multimodal' },

  // ── xAI ──────────────────────────────────────────────────────────
  { name: 'Grok 3',      license: 'closed', category: 'general'   },
  { name: 'Grok 3 Mini', license: 'closed', category: 'reasoning' },

  // ── Others ───────────────────────────────────────────────────────
  { name: 'Yi-Lightning',   license: 'closed', category: 'general'    },
  { name: 'ERNIE 4.5',      license: 'closed', category: 'general'    },
  { name: 'MiniCPM-o 4.5',  license: 'open',   category: 'edge'       }, // 9B, on-device

  // ── Embodied / World models (Physical Intelligence & others) ──────
  { name: 'pi0.5',   license: 'closed', category: 'world' }, // Physical Intelligence
  { name: 'EMMA 2',  license: 'closed', category: 'world' }, // Waymo
  { name: 'GAIA-2',  license: 'closed', category: 'world' },
]

const headers = {
  'apikey': SERVICE_KEY,
  'Authorization': `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'return=minimal',
}

async function updateModel(name, license, category) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/models?name=eq.${encodeURIComponent(name)}`,
    { method: 'PATCH', headers, body: JSON.stringify({ license, category }) }
  )
  return res.status
}

async function main() {
  console.log(`\n校正 ${CLASSIFICATIONS.length} 个模型的 license + category\n`)
  let ok = 0, miss = 0

  for (const { name, license, category } of CLASSIFICATIONS) {
    const status = await updateModel(name, license, category)
    if (status === 204) {
      console.log(`  ✓  ${name.padEnd(28)} ${license.padEnd(8)} ${category}`)
      ok++
    } else {
      console.log(`  ✗  ${name.padEnd(28)} HTTP ${status}`)
      miss++
    }
  }

  console.log(`\n═══════════════════`)
  console.log(`✓ Updated: ${ok}`)
  console.log(`✗ Missed:  ${miss}`)
}

main().catch(console.error)
