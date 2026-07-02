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
