import React, { useState, useEffect } from 'react'
import { apiFetch } from '../utils/api.js'
import { useCurrency } from '../utils/currency.js'
import { useToast } from '../context/ToastContext.jsx'
import { useLiveEvents, useDebouncedCallback } from '../utils/useLiveEvents.js'
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
import VoidsTab from '../components/reports/VoidsTab.jsx'
import VatTab from '../components/reports/VatTab.jsx'
import ChannelsTab from '../components/reports/ChannelsTab.jsx'

// ── Main Component ────────────────────────────────────────────────────────────
export default function Reports() {
  const { fmt } = useCurrency()
  const showToast = useToast()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod] = useState('today')
  const [branchId, setBranchId] = useState('')
  const [branches, setBranches] = useState([])
  const [activeTab, setActiveTab] = useState('overview')
  const [exporting, setExporting] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [staffData, setStaffData] = useState(null)
  const [staffLoading, setStaffLoading] = useState(false)
  const [matrixData, setMatrixData] = useState(null)
  const [matrixLoading, setMatrixLoading] = useState(false)
  const [forecastData, setForecastData] = useState(null)
  const [forecastLoading, setForecastLoading] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  // Live refresh: order activity re-pulls the current report (silently — no
  // loading spinner flash) so numbers stay in sync with POS/Kitchen.
  const liveRefresh = useDebouncedCallback(() => setRefreshTick(t => t + 1), 2000)
  useLiveEvents(liveRefresh, ['order_created', 'order_updated', 'inventory_updated', 'factory_reset'])

  // Load branches once for filter dropdown
  useEffect(() => {
    apiFetch('/api/branches').then(r => r.json()).then(d => {
      if (Array.isArray(d)) setBranches(d)
    }).catch(() => {})
  }, [])

  const lastPeriodRef = React.useRef(null)
  useEffect(() => {
    // Show the spinner on first load and on manual period changes;
    // stay silent for background live-refresh ticks.
    if (lastPeriodRef.current !== period) { setLoading(true); lastPeriodRef.current = period }
    const qs = branchId ? `period=${period}&branch_id=${branchId}` : `period=${period}`
    apiFetch(`/api/reports?${qs}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false) })
      .catch(() => setLoading(false))
  }, [period, branchId, refreshTick])

  useEffect(() => {
    if (activeTab !== 'staff') return
    setStaffLoading(true)
    const qs = branchId ? `period=${period}&branch_id=${branchId}` : `period=${period}`
    apiFetch(`/api/reports/staff?${qs}`)
      .then(r => r.json())
      .then(d => { setStaffData(Array.isArray(d) ? d : []); setStaffLoading(false) })
      .catch(() => setStaffLoading(false))
  }, [activeTab, period, branchId])

  useEffect(() => {
    if (activeTab !== 'matrix') return
    setMatrixLoading(true)
    const qs = branchId ? `period=${period}&branch_id=${branchId}` : `period=${period}`
    apiFetch(`/api/reports/menu-matrix?${qs}`)
      .then(r => r.json())
      .then(d => { setMatrixData(d); setMatrixLoading(false) })
      .catch(() => setMatrixLoading(false))
  }, [activeTab, period, branchId])

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

  // jsPDF is lazy-loaded inside downloadPDF; show a spinner during the one-time
  // chunk load and surface any failure instead of silently swallowing it.
  const handlePDF = async () => {
    if (!data) return
    setPdfLoading(true)
    try {
      await downloadPDF(data, period, fmt)
    } catch (e) {
      showToast('PDF export failed: ' + (e.message || 'unknown error'), 'error')
    } finally {
      setPdfLoading(false)
    }
  }

  const periods = [
    { id: 'today',        label: 'Today / اليوم' },
    { id: 'yesterday',    label: 'Yesterday / أمس' },
    { id: 'week',         label: 'Last 7 Days' },
    { id: 'last_week',    label: 'Last Week' },
    { id: 'month',        label: 'This Month' },
    { id: 'last_month',   label: 'Last Month' },
    { id: 'this_quarter', label: 'This Quarter' },
    { id: 'last_quarter', label: 'Last Quarter' },
    { id: 'this_year',    label: 'This Year' },
    { id: 'last_year',    label: 'Last Year' },
  ]
  const tabs = [
    { id: 'overview',       label: '📊 Overview' },
    { id: 'channels',       label: '📡 Channels' },
    { id: 'profitability',  label: '💰 Profitability' },
    { id: 'menu',           label: '🍽️ Menu' },
    { id: 'matrix',         label: '⭐ Matrix' },
    { id: 'forecast',       label: '🔮 Forecast' },
    { id: 'heatmap',        label: '📅 Heatmap' },
    { id: 'trends',         label: '📈 Trends' },
    { id: 'inventory',      label: '⚠️ Stock' },
    { id: 'staff',          label: '👤 Staff' },
    { id: 'voids',          label: '🚫 Voids' },
    { id: 'vat',            label: '🧾 VAT' },
  ]

  return (
    <div className="p-4 sm:p-6 min-h-screen">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Reports & Analytics</h1>
          <p className="text-slate-400 text-sm mt-0.5">Business performance overview</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-slate-200 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500"
            aria-label="Select report period"
          >
            {periods.map(p => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          {branches.length > 1 && (
            <select
              value={branchId}
              onChange={e => setBranchId(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-slate-300 text-sm rounded-lg px-3 py-2 focus:outline-none focus:border-orange-500"
              aria-label="Filter by branch"
            >
              <option value="">All branches</option>
              {branches.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          )}
          <button onClick={handleExport} disabled={exporting}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors">
            {exporting ? '⏳' : '⬇'} CSV
          </button>
          <button
            onClick={handlePDF}
            disabled={!data || loading || pdfLoading}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 border border-slate-700 text-slate-300 text-sm font-medium rounded-lg transition-colors">
            {pdfLoading ? '⏳' : '📄'} PDF
          </button>
        </div>
      </div>

      <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 mb-6 w-full sm:w-fit max-w-full overflow-x-auto">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${activeTab === t.id ? 'bg-slate-700 text-white' : 'text-slate-400 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-5 animate-pulse h-28" />)}
        </div>
      ) : !data ? (
        <div className="text-center py-16 text-slate-500">Failed to load reports</div>
      ) : (
        <>
          {activeTab === 'overview' && <OverviewTab data={data} fmt={fmt} />}

          {activeTab === 'channels' && <ChannelsTab data={data} fmt={fmt} />}

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

          {activeTab === 'voids' && <VoidsTab period={period} fmt={fmt} />}

          {activeTab === 'vat' && <VatTab period={period} fmt={fmt} />}
        </>
      )}
    </div>
  )
}
