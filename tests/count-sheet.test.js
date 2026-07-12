// @vitest-environment jsdom
import { describe, it, expect } from 'vitest'
import { buildCountSheetHtml } from '../src/utils/countSheet.js'

const items = [
  { id: 1, name: 'طحين أبيض', unit: 'kg', quantity: '25.5', category: 'dry-goods', last_counted_at: '2026-07-01T00:00:00Z' },
  { id: 2, name: 'زيت زيتون', unit: 'L', quantity: '100', category: 'oils', last_counted_at: null },
  { id: 3, name: 'سكر', unit: 'kg', quantity: '12', category: 'dry-goods', last_counted_at: null },
]

describe('buildCountSheetHtml', () => {
  it('renders an RTL Arabic document with all items grouped by category', () => {
    const html = buildCountSheetHtml(items, { logoSrc: 'logo.png', date: new Date('2026-07-08') })
    expect(html).toContain('dir="rtl"')
    expect(html).toContain('طحين أبيض')
    expect(html).toContain('زيت زيتون')
    expect(html).toContain('dry-goods')
    expect(html).toContain('oils')
    // two category sections
    expect(html.match(/<section>/g)).toHaveLength(2)
    // grouped: dry-goods section holds both its items
    const dry = html.slice(html.indexOf('dry-goods'), html.indexOf('oils'))
    expect(dry).toContain('طحين أبيض')
    expect(dry).toContain('سكر')
  })

  it('marks never-counted items and reports their count in the header', () => {
    const html = buildCountSheetHtml(items, { logoSrc: 'logo.png' })
    expect(html.match(/class="uncounted"/g)).toHaveLength(2)
    expect(html).toContain('لم يُجرد بعد: 2')
    expect(html).toContain('لم يُجرد ✱')
  })

  it('includes unit, system stock, and blank count/threshold columns', () => {
    const html = buildCountSheetHtml(items, { logoSrc: 'logo.png' })
    expect(html).toContain('العدد الفعلي')
    expect(html).toContain('حد التنبيه')
    expect(html).toContain('>25.5<')
    expect(html).toContain('<td class="blank"></td>')
  })

  it('escapes HTML in item fields', () => {
    const html = buildCountSheetHtml([
      { id: 9, name: '<script>x</script>', unit: 'pcs', quantity: '1', category: 'a"b', last_counted_at: null },
    ], { logoSrc: 'logo.png' })
    expect(html).not.toContain('<script>x</script>')
    expect(html).toContain('&lt;script&gt;')
    expect(html).toContain('a&quot;b')
  })

  it('handles empty list without crashing', () => {
    const html = buildCountSheetHtml([], { logoSrc: 'logo.png' })
    expect(html).toContain('عدد الأصناف: 0')
    expect(html).not.toContain('<section>')
  })
})
