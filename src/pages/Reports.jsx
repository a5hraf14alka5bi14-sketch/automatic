import React, { useState, useEffect } from 'react'
import { apiFetch } from '../utils/api.js'
import { useCurrency } from '../utils/currency.js'
import { downloadCSV, downloadPDF } from '../components/reports/exportUtils.js'
import HeatmapTab from '../components/reports/HeatmapTab.jsx'
import TrendsTab from '../components/reports/TrendsTab.jsx'
import MatrixTab from '../components/reports/MatrixTab.jsx'
import ForecastTab from '../components/reports/ForecastTab.jsx'
import OverviewTab from '../components/reports/OverviewTab.jsx'
import ProfitabilityTab from '../components/reports/ProfitabilityTab.jsx'
import MenuTab from '../components/reports/MenuTab.jsx'
import InventoryTab from '../components/reports/InventoryTab.jsx'
import StaffTab from '../components/reports/StaffTab.jsx'

// ── Main Component ────────────────────────────────────────────────────────────
export default function Reports() {
  const { fmt } = useCurrency()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('today')
  const [activeTab, setActiveTab] = useState('overview')
  const [exporting, setExporting] = useState(false)
  const [staffData, setStaffData] = useState(null)
  const [staffLoading, setStaffLoading] = useState(false)
  const [matrixData, setMatrixData] = useState(null)
  const [matrixLoading, setMatrixLoading] = useState(false)
  const [forecastData, setForecastData] = useState(null)
  const [forecastLoading, setForecastLoading] = useState(false)

  useEffect(() => {
    setLoading(true)
    apiFetch(`/api/reports?period=${period}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [period])

  useEffect(() => {
    if (activeTab !== 'staff') return
    setStaffLoading(true)
    apiFetch(`/api/reports/staff?period=${period}`)
      .then(r => r.json())
      .then(d => { setStaffData(Array.isArray(d) ? d : []); setStaffLoading(false) })
      .catch(() => setStaffLoading(false))
  }, [activeTab, period])

  useEffect(() => {
    if (activeTab !== 'matrix') return
    setMatrixLoading(true)
    apiFetch(`/api/reports/menu-matrix?period=${period}`)
      .then(r => r.json())
      .then(d => { setMatrixData(d); setMatrixLoading(false) })
      .catch(() => setMatrixLoading(false))
  }, [activeTab, period])

  useEffect(() => {
    if (activeTab !== 'forecast') return
    setForecastLoading(true)
    apiFetch('/api/reports/forecast')
      .then(r => r.json())
      .then(d => { setForecastData(d); setForecastLoading(false) })
      .catch(() => setForecastLoading(false))
  }, [activeTab])

  const handleExport = async () => {
    setExporting(true)
    try { downloadCSV(period) } finally {
      setTimeout(() => setExporting(false), 1500)
    }
  }

  const periods = [{ id: 'today', label: 'Today' }, { id: 'week', label: '7 Days' }, { id: 'month', label: 'This Month' }]
  const tabs = [
    { id: 'overview',       label: '📊 Overview' },
    { id: 'profitability',  label: '💰 Profitability' },
    { id: 'menu',           label: '🍽️ Menu' },
    { id: 'matrix',         label: '⭐ Matrix' },
    { id: 'forecast',       label: '🔮 Forecast' },
    { id: 'heatmap',        label: '📅 Heatmap' },
    { id: 'trends',         label: '📈 Trends' },
    { id: 'inventory',      label: '⚠️ Stock' },
    { id: 'staff',          label: '👤 Staff' },
  ]

  return (
    <div className="p-6 min-h-screen">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports & Analytics</h1>
          <p className="text-slate-400 text-sm mt-0.5">Business performance overview</p>
        </div>
        <div className="flex items-center gap-2">
          {periods.map(p => (
            <button key={p.id} onClick={() => setPeriod(p.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${period === p.id ? 'bg-orange-500 text-white' : 'bg-slate-900 border border-slate-700 text-slate-400 hover:text-white'}`}>
              {p.label}
            </button>
          ))}
          <button onClick={handleExport} disabled={exporting}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors">
            {exporting ? '⏳' : '⬇'} CSV
          </button>
          <button
            onClick={() => { if (data) downloadPDF(data, period, fmt).catch(() => {}) }}
            disabled={!data || loading}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors">
            📄 PDF
          </button>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 mb-6 w-fit overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === t.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-5 animate-pulse h-28" />)}
        </div>
      ) : !data ? (
        <div className="text-center py-16 text-slate-500">Failed to load reports</div>
      ) : (
        <>
          {activeTab === 'overview' && <OverviewTab data={data} fmt={fmt} />}

          {activeTab === 'profitability' && <ProfitabilityTab data={data} fmt={fmt} />}

          {activeTab === 'menu' && <MenuTab data={data} fmt={fmt} />}

          {activeTab === 'matrix'   && <MatrixTab   matrixData={matrixData}     fmt={fmt} loading={matrixLoading} />}
          {activeTab === 'forecast' && <ForecastTab forecastData={forecastData}  fmt={fmt} loading={forecastLoading} />}
          {activeTab === 'heatmap' && <HeatmapTab heatmap={data.heatmap} />}
          {activeTab === 'trends'  && <TrendsTab  trend={data.trend} fmt={fmt} />}

          {activeTab === 'inventory' && <InventoryTab data={data} />}

          {activeTab === 'staff' && (
            <StaffTab staffData={staffData} staffLoading={staffLoading} period={period} periods={periods} fmt={fmt} />
          )}
        </>
      )}
    </div>
  )
}
