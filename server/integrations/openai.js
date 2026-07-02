import { pool } from '../db.js'

export async function getOpenAIKey() {
  const row = await pool.query("SELECT value FROM settings WHERE key='openai_api_key'")
  return row.rows[0]?.value || process.env.OPENAI_API_KEY || ''
}

export async function testOpenAIConnection() {
  const key = await getOpenAIKey()
  if (!key) throw new Error('OpenAI API key not configured')
  const res = await fetch('https://api.openai.com/v1/models', {
    headers: { Authorization: `Bearer ${key}` }
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `OpenAI API error ${res.status}`)
  }
  const data = await res.json()
  const gptModels = (data.data || [])
    .filter(m => m.id.startsWith('gpt'))
    .map(m => m.id)
    .slice(0, 5)
  return { models_available: data.data?.length || 0, gpt_models: gptModels }
}

export async function generateDailySummary(kpis) {
  const fmt = v => Number(v || 0).toFixed(3)
  const prompt = `You are an AI analyst for Automatic Restaurant, a Lebanese restaurant in Oman (currency: OMR).

Today's performance:
- Revenue: OMR ${fmt(kpis.revenue)} | Orders: ${kpis.totalOrders || 0} | Avg Order: OMR ${fmt(kpis.avgOrderValue)}
- Gross Profit: OMR ${fmt(kpis.grossProfit)} (margin: ${kpis.grossMargin || 0}%)
- Food Cost: OMR ${fmt(kpis.totalFoodCost)} | Customers Served: ${kpis.customersServed || 0}
${kpis.topItems?.length ? `- Best Seller: ${kpis.topItems[0].name} (${kpis.topItems[0].qty} sold)` : ''}
${kpis.lowStock?.length ? `- Low Stock Alert: ${kpis.lowStock.map(i => i.name).join(', ')}` : ''}

Write a 3-sentence executive summary: (1) overall performance, (2) top highlight or concern, (3) one specific recommendation. Be concise and data-driven.`

  const response = await openAIChat(
    [{ role: 'user', content: prompt }],
    'gpt-4o-mini'
  )
  return response.choices[0]?.message?.content?.trim() || ''
}

export async function openAIChat(messages, model = 'gpt-4o-mini') {
  const key = await getOpenAIKey()
  if (!key) throw new Error('OpenAI API key not configured')
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model, messages, max_tokens: 500 })
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error?.message || `OpenAI API error ${res.status}`)
  }
  return res.json()
}

export async function generateExecutiveInsights(data) {
  const fmt = v => Number(v || 0).toFixed(3)
  const trendDir = data.trendSlope > 0 ? 'growing' : data.trendSlope < 0 ? 'declining' : 'flat'

  const prompt = `You are an AI business analyst for Automatic Restaurant, a Lebanese restaurant in Oman (currency: OMR).

CURRENT PERIOD PERFORMANCE:
- Revenue: OMR ${fmt(data.revenue)} | Orders: ${data.totalOrders || 0} | Avg Order: OMR ${fmt(data.avgOrderValue)}
- Gross Profit: OMR ${fmt(data.grossProfit)} (${data.grossMargin || 0}% margin) | Food Cost: OMR ${fmt(data.totalFoodCost)}
- Customers Served: ${data.customersServed || 0}
${data.topItems?.length ? `- Best Seller: ${data.topItems[0].name} (${data.topItems[0].qty} sold)` : ''}
${data.lowStock?.length ? `- ⚠️ Low Stock: ${data.lowStock.slice(0,3).map(i => i.name).join(', ')}` : '- ✅ All stock levels healthy'}

REVENUE TREND (90 days):
- Trend: ${trendDir} (${data.trendSlope > 0 ? '+' : ''}${Number(data.trendSlope||0).toFixed(4)} OMR/day)
- Weekly growth: ${data.weeklyGrowthPct > 0 ? '+' : ''}${data.weeklyGrowthPct || 0}%
- 30-day forecast: OMR ${fmt(data.forecast30Total)} | Avg daily: OMR ${fmt(data.avgDailyRevenue)}

MENU ENGINEERING (this month):
- ⭐ Stars: ${data.stars || 0} | 🐴 Plowhorses: ${data.plowhorses || 0} | ❓ Puzzles: ${data.puzzles || 0} | 🐕 Dogs: ${data.dogs || 0}

Respond ONLY with valid JSON, no markdown fences:
{
  "headline": "12-word max status summary with a key metric",
  "performance": "2-3 sentences on current performance with specific OMR numbers",
  "opportunities": "2 specific actionable opportunities based on the data above",
  "risks": "1-2 specific risks or warnings with numbers where possible",
  "recommendation": "Single most important action to take today with expected impact"
}`

  const response = await openAIChat([{ role: 'user', content: prompt }], 'gpt-4o-mini')
  const raw = response.choices[0]?.message?.content?.trim() || '{}'
  try {
    const start = raw.indexOf('{')
    const end   = raw.lastIndexOf('}') + 1
    return JSON.parse(start >= 0 ? raw.slice(start, end) : raw)
  } catch {
    return { headline: 'Analysis complete', performance: raw, opportunities: '', risks: '', recommendation: '' }
  }
}
