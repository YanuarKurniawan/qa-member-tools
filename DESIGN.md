# Design

Visual system for QA Member Tools, captured from the existing codebase.

## Color

### Strategy

Restrained. Tinted neutrals with a single blue accent used for primary actions and active states only.

### Palette

| Role | Value | Usage |
|------|-------|-------|
| **Primary** | `blue-600` (#2563eb) | Buttons, active sidebar link, accent icons, focus rings |
| **Primary hover** | `blue-700` (#1d4ed8) | Button hover states |
| **Primary light** | `blue-50` / `blue-100` | Icon backgrounds, active tool indicator |
| **Surface** | `white` (#fff) | Cards, form inputs, panels |
| **Body** | `gray-50` (#f9fafb) | Page background |
| **Border** | `gray-200` (#e5e7eb) | Card borders, dividers |
| **Border subtle** | `gray-100` (#f3f4f6) | Inner dividers, table row separators |
| **Ink** | `gray-900` (#111827) | Headings, primary text |
| **Ink secondary** | `gray-700` (#374151) | Labels, form text, table cells |
| **Muted** | `gray-500` (#6b7280) | Descriptions, secondary text, chevrons |
| **Sidebar** | `#0f172a` (slate-900) | Sidebar background |
| **Sidebar hover** | `#1e293b` (slate-800) | Sidebar link hover |
| **Sidebar text** | `slate-300` (#cbd5e1) | Sidebar link text |
| **Sidebar muted** | `slate-500` (#64748b) | Sidebar section headers |

### Dark panels (code/log output)

| Role | Value | Usage |
|------|-------|-------|
| Surface | `slate-900` (#0f172a) | Panel background |
| Border | `slate-700` (#334155) | Panel borders, dividers |
| Header text | `slate-300` (#cbd5e1) | Uppercase panel labels |
| Body text | `slate-300` (#cbd5e1) | Default log/code text |
| Gutter | `slate-600` (#475569) | Line numbers |

### Semantic colors

| State | Background | Border | Text |
|-------|-----------|--------|------|
| Success | `green-50` | `green-200` | `green-800` |
| Error | `red-50` | `red-200` | `red-800` |
| Warning | `amber-50` | `amber-200` | `amber-800` / `amber-900` |
| Info | `blue-50` | `blue-200` | `blue-800` |

### Convention

- **Light surfaces** use the `gray-*` scale.
- **Dark panels** (LogViewer, code viewers, schema output) use the `slate-*` scale.
- Do not mix gray and slate within the same surface context.

## Typography

### Stack

System font stack via Tailwind defaults (`font-sans`). Mono code via `font-mono` (Tailwind default monospace stack).

### Scale

| Element | Size | Weight | Color |
|---------|------|--------|-------|
| Page heading (h1) | `text-2xl` (1.5rem) | `font-bold` (700) | `gray-900` |
| Section heading (h2) | `text-lg` (1.125rem) | `font-semibold` (600) | `gray-800` |
| Tool name (h3) | `text-base` (1rem) | `font-semibold` (600) | `gray-900` |
| Body text | `text-sm` (0.875rem) | `font-normal` (400) | `gray-700` |
| Description | `text-sm` (0.875rem) | `font-normal` (400) | `gray-500` |
| Label | `text-sm` (0.875rem) | `font-medium` (500) | `gray-700` |
| Small / metadata | `text-xs` (0.75rem) | varies | `gray-500` |
| Panel header | `text-xs` (0.75rem) | `font-semibold` (600) | `slate-300`, uppercase, tracked |
| Mono code | `text-xs` / `text-sm` | `font-normal` (400) | `slate-300` or semantic |
| Sidebar brand | `text-base` (1rem) | `font-bold` (700) | `white` |
| Sidebar link | `text-sm` (0.875rem) | `font-medium` (500) | `slate-300` / `white` |

### Rules

- `text-wrap: balance` on h1-h3 (set globally in `index.css`).
- `text-wrap: pretty` on paragraphs (set globally in `index.css`).
- One font family throughout (system sans). Mono only for code/log panels.

## Spacing

Tailwind default spacing scale. Key values used:

- **Page padding:** `p-5` mobile, `p-8` desktop
- **Card padding:** `p-5`
- **Section gap:** `mb-8` between dashboard sections, `mb-6` between page header and content
- **Card gap:** `gap-4` in grids
- **Form field gap:** `gap-4` in grid
- **Accordion item gap:** `space-y-3`
- **Inner padding:** `px-4 py-2` for panel headers, `px-5 py-4` for accordion triggers

## Components

### Cards

- Border: `border border-gray-200`
- Radius: `rounded-xl`
- Background: `bg-white`
- Shadow: `shadow-sm` on interactive cards only (category links, tool accordion)
- No nested cards.

### Buttons

| Variant | Classes |
|---------|---------|
| Primary | `bg-blue-600 text-white hover:bg-blue-700 shadow-sm` |
| Destructive | `bg-red-600 text-white hover:bg-red-700` |
| Secondary | `border border-gray-300 bg-white text-gray-700 hover:bg-gray-50` |
| All | `rounded-lg px-4-5 py-2-2.5 text-sm font-semibold` + focus ring |

### Form inputs

- `rounded-lg border border-gray-300 px-3 py-2.5 text-sm shadow-sm`
- Focus: `focus:border-blue-500 focus:ring-1 focus:ring-blue-500`

### Focus indicators

- All interactive elements use `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500`
- Light backgrounds: `focus-visible:ring-offset-2`
- Dark surfaces (sidebar): `focus-visible:ring-blue-400` (no offset)

### Dark panels

Shared pattern for LogViewer, AnnotatedJsonView, SchemaOutput:
- `bg-slate-900 border border-slate-700 rounded-lg overflow-hidden`
- Header: `border-b border-slate-700 px-4 py-2` with uppercase `text-xs font-semibold text-slate-300`
- Body: `font-mono text-xs leading-relaxed` with max-height scroll

### Alert banners

Consistent pattern: `rounded-lg border p-4 text-sm` with icon + text.
- Success: `border-green-200 bg-green-50 text-green-800`
- Error: `border-red-200 bg-red-50 text-red-800`
- Warning: `border-amber-200 bg-amber-50 text-amber-800`

## Layout

- App shell: sidebar (256px, collapsible at `lg`) + scrollable main content
- Max content width: `max-w-6xl` centered
- Mobile: hamburger menu with overlay + backdrop blur
- Grids: `sm:grid-cols-2 lg:grid-cols-3` for cards, `sm:grid-cols-2` for form fields

## Motion

- Accordion expand: `transition-[grid-template-rows] duration-200 ease-out` via CSS grid
- Hover/focus transitions: `transition-colors` (Tailwind default ~150ms)
- Loading: `animate-spin` on Loader2 icon
- Reduced motion: global `@media (prefers-reduced-motion: reduce)` kills all durations

## Icons

- Library: `lucide-react`
- Sizes: 12px (inline metadata), 14px (log entries, badges), 16px (buttons), 18px (sidebar links, tool icons), 20px (sidebar brand, hamburger), 22px (page header icons), 24px (upload zone)
- Category icons are mapped in `categoryMeta.js` (Users, Shield, TicketCheck, FlaskConical, Database, Cog)
