import { defineCatalog } from '@json-render/core'
import { schema } from '@json-render/react/schema'
import { z } from 'zod'

const record = z.record(z.string(), z.unknown())
const rows = z.array(record)

const mapping = z
  .object({
    x: z.string().optional(),
    y: z.string().optional(),
    label: z.string().optional(),
    value: z.string().optional(),
    series: z.string().optional()
  })
  .optional()

const presentation = z
  .object({
    color_scheme: z.string().optional(),
    show_legend: z.boolean().optional(),
    show_tooltip: z.boolean().optional()
  })
  .passthrough()
  .optional()

const query = z
  .object({
    sql: z.string().optional(),
    explanation: z.string().optional()
  })
  .optional()

export const renderCatalog = defineCatalog(schema, {
  components: {
    Dashboard: {
      props: z.object({
        title: z.string(),
        subtitle: z.string().optional()
      }),
      description: 'Top-level dashboard canvas with optional title.'
    },
    Report: {
      props: z.object({
        title: z.string(),
        subtitle: z.string().optional(),
        generated_at: z.string().optional()
      }),
      description: 'Top-level printable report document.'
    },
    Section: {
      props: z.object({
        title: z.string().optional(),
        description: z.string().optional()
      }),
      description: 'Report or dashboard section.'
    },
    Grid: {
      props: z.object({
        columns: z.number().int().min(1).max(4).default(2)
      }),
      description: 'Responsive grid container for cards and charts.'
    },
    Card: {
      props: z.object({
        title: z.string().optional(),
        description: z.string().optional()
      }),
      description: 'Generic dashboard/report card container.'
    },
    Metric: {
      props: z.object({
        artifact_id: z.string().optional(),
        title: z.string(),
        data: rows,
        mapping,
        insight: z.string().optional(),
        query
      }),
      description: 'Single KPI metric card from tabular data.'
    },
    EChart: {
      props: z.object({
        artifact_id: z.string().optional(),
        title: z.string(),
        chart_type: z.enum(['line', 'bar', 'pie']),
        data: rows,
        mapping,
        presentation,
        insight: z.string().optional(),
        query
      }),
      description: 'Apache ECharts visualization rendered from data rows.'
    },
    DataTable: {
      props: z.object({
        artifact_id: z.string().optional(),
        title: z.string(),
        data: rows,
        mapping,
        insight: z.string().optional(),
        query
      }),
      description: 'Scrollable data table for reports and dashboards.'
    },
    Insight: {
      props: z.object({
        text: z.string()
      }),
      description: 'Short analytical insight.'
    },
    MarkdownText: {
      props: z.object({
        content: z.string()
      }),
      description: 'Markdown text block.'
    },
    Divider: {
      props: z.object({}),
      description: 'Horizontal divider.'
    },
    PageBreak: {
      props: z.object({}),
      description: 'Print-only page break.'
    }
  },
  actions: {}
})
