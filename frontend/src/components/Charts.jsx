import { useEffect, useRef } from 'react'
import { createChart, CrosshairMode } from 'lightweight-charts'

const UP = '#22c55e'
const DOWN = '#ef4444'
const GRID = 'rgba(255,255,255,0.04)'
const TEXT = '#94a3b8'

/**
 * Candlestick chart with optional EMA overlays and horizontal S/R lines.
 * Data: [{ time, open, high, low, close }] (UNIX seconds, UTC).
 */
export function CandleChart({ candles = [], overlays = [], levels = [], height = 420, showLegend = true }) {
  const holder = useRef(null)
  const chartRef = useRef(null)
  const candleRef = useRef(null)
  const overlayRefs = useRef([])
  const levelRefs = useRef([])

  useEffect(() => {
    if (!holder.current) return
    const chart = createChart(holder.current, {
      height,
      layout: {
        background: { color: 'transparent' },
        textColor: TEXT,
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: 11,
      },
      grid: { vertLines: { color: GRID }, horzLines: { color: GRID } },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.06)' },
      timeScale: { borderColor: 'rgba(255,255,255,0.06)', timeVisible: true, secondsVisible: false },
      localization: {
        timeFormatter: (t) => new Date(t * 1000).toLocaleString(undefined, { month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
      },
    })
    const series = chart.addCandlestickSeries({
      upColor: UP,
      downColor: DOWN,
      borderUpColor: UP,
      borderDownColor: DOWN,
      wickUpColor: UP,
      wickDownColor: DOWN,
      priceLineVisible: true,
    })
    chartRef.current = chart
    candleRef.current = series

    const ro = new ResizeObserver(() => {
      if (holder.current) chart.applyOptions({ width: holder.current.clientWidth })
    })
    ro.observe(holder.current)
    chart.applyOptions({ width: holder.current.clientWidth })

    return () => {
      ro.disconnect()
      chart.remove()
      chartRef.current = null
      candleRef.current = null
    }
  }, [height])

  useEffect(() => {
    if (!candleRef.current || !candles.length) return
    candleRef.current.setData(
      candles.map((c) => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })),
    )
    chartRef.current?.timeScale().fitContent()
  }, [candles])

  useEffect(() => {
    const chart = chartRef.current
    if (!chart) return
    overlayRefs.current.forEach((s) => chart.removeSeries(s))
    overlayRefs.current = overlays
      .filter((o) => o.data?.length)
      .map((o) => {
        const s = chart.addLineSeries({
          color: o.color,
          lineWidth: o.width || 1,
          priceLineVisible: false,
          lastValueVisible: false,
          crosshairMarkerVisible: false,
        })
        s.setData(o.data.map((d) => ({ time: d.time, value: d.value })))
        return s
      })
    return () => {
      overlayRefs.current.forEach((s) => chart.removeSeries(s))
      overlayRefs.current = []
    }
  }, [overlays])

  useEffect(() => {
    const series = candleRef.current
    if (!series) return
    levelRefs.current.forEach((p) => series.removePriceLine(p))
    levelRefs.current = levels
      .filter((l) => l.price)
      .map((l) =>
        series.createPriceLine({
          price: l.price,
          color: l.color || 'rgba(148,163,184,0.6)',
          lineWidth: 1,
          lineStyle: 2,
          axisLabelVisible: true,
          title: l.label,
        }),
      )
    return () => {
      levelRefs.current.forEach((p) => series.removePriceLine(p))
      levelRefs.current = []
    }
  }, [levels])

  return (
    <div className="relative">
      <div ref={holder} className="w-full" />
      {showLegend && overlays.length > 0 && (
        <div className="absolute left-2 top-2 flex gap-3 text-[11px] font-medium">
          {overlays.map((o) => (
            <span key={o.label} style={{ color: o.color }}>
              {o.label}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** Compact sparkline rendered as inline SVG (no chart library needed). */
export function Sparkline({ data = [], width = 120, height = 36, positive = true }) {
  if (!data || data.length < 2) return <div className="h-9 w-[120px]" />
  const min = Math.min(...data)
  const max = Math.max(...data)
  const span = max - min || 1
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width
    const y = height - ((v - min) / span) * (height - 4) - 2
    return `${x.toFixed(2)},${y.toFixed(2)}`
  })
  const color = positive ? UP : DOWN
  const id = `g${Math.random().toString(36).slice(2, 8)}`
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={`0,${height} ${pts.join(' ')} ${width},${height}`} fill={`url(#${id})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}
