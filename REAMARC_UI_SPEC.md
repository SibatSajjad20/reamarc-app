# Reamarc UI Specification: Strict Neutral Metadata + Semantic-Only Status

> [!CAUTION]
> ### CRITICAL AGENT DIRECTIVE — READ BEFORE GENERATING UI CODE
> **All AI agents, coding assistants, and human engineers MUST strictly adhere to this specification when designing, refactoring, or generating React/Tailwind components in the Reamarc codebase.**
> 
> - **NEVER** introduce arbitrary, saturated background colors (purple, orange, green, blue, pink, cyan) for entity categories, departments, roles, task types, or metadata tags.
> - **COLOR IS RESERVED EXCLUSIVELY FOR OPERATIONAL STATE AND METRICS.**
> - **DO NOT** create ad-hoc, inline badge styling. Always import and reuse the centralized badge utilities in [`src/utils/badgeStyles.ts`](file:///c:/Users/coco/Desktop/cagent/src/utils/badgeStyles.ts) and components in [`src/components/ui/WorkspaceBadges.tsx`](file:///c:/Users/coco/Desktop/cagent/src/components/ui/WorkspaceBadges.tsx).
> - **ENFORCE HIGH DATA DENSITY.** Enterprise tables and data grids must be compact. Never use loose consumer-style padding (such as `py-6+` or bloated row heights).

---

## 1. The Color Golden Rule

### Philosophy: Contrast Architecture Over "Fruit Salad" UI
In standard consumer applications, designers frequently assign arbitrary pastel or rainbow colors to categorize metadata (e.g. *Creative = Purple*, *Marketing = Orange*, *Tech = Blue*, *HR = Pink*). 

In enterprise command centers like **Reamarc**, this pattern creates catastrophic visual noise ("fruit salad UI"):
1. When everything is colorful, **nothing stands out**.
2. Critical operational alerts (overtime spikes, late punch strikes, failed tasks, emergency account health) are drowned out by loud category chips.
3. Users experience cognitive fatigue trying to decipher whether a color indicates an alarm or merely an organizational department.

### The Rule
> **Color conveys operational state, health, urgency, and actionability. Neutral tones convey structure and taxonomy.**

| Category Type | Permitted Palette | Rationale |
| :--- | :--- | :--- |
| **Organizational Metadata** (Departments, Roles, Task Types, Group Tags) | **Strict Neutral (Slate / Zinc)** | Structure should recede into the canvas so data and metrics take priority. |
| **Operational State** (Present, Late, Absent, Missed, Error, Pending) | **Semantic Palette (Emerald, Amber, Rose, Blue, Indigo, Purple)** | Draws immediate focus to status, anomalies, and necessary actions. |
| **Operational Health & Priority** (Good, Moderate, Emergency; High, Medium, Low) | **Semantic Palette (Emerald, Amber, Rose)** | Quantifies operational risk and priority hierarchy. |
| **External Platforms** (Meta, Google, TikTok, LinkedIn) | **Platform Brand Identity** | Brand recognition requires specific platform marks/hues. |
| **Tenant Workspaces** (Brand Accent) | **Dynamic Hex Hues (Isolated Accents)** | Preserves client brand identity without contaminating systemic status signals. |

---

## 2. Badge Standardization & Metadata Tags

All department, role, and task-type chips across the entire application MUST share the exact same neutral styling defined in [`src/utils/badgeStyles.ts`](file:///c:/Users/coco/Desktop/cagent/src/utils/badgeStyles.ts).

### The Universal Neutral Badge Class
```ts
export const NEUTRAL_METADATA_BADGE_CLASS =
  'inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700';
```

### Standard Helper Functions
Always import from `@/utils/badgeStyles` (or `src/utils/badgeStyles.ts`):

```tsx
import { 
  getDeptBadgeClass, 
  getRoleBadgeClass, 
  getTaskTypeBadgeClass, 
  getRoleLabel, 
  getInitials 
} from '@/utils/badgeStyles';

// 1. Department Tag
<span className={getDeptBadgeClass(user.department)}>
  {user.department}
</span>

// 2. Role Tag
<span className={getRoleBadgeClass(user.role)}>
  {getRoleLabel(user.role)}
</span>

// 3. Task Type Tag (e.g., Scheduled vs Runtime)
<span className={getTaskTypeBadgeClass(task.type)}>
  {task.type}
</span>
```

### Sizing and Geometry Rules
- **Padding:** `px-2 py-0.5` (compact, inline).
- **Border Radius:** `rounded-md` (or `rounded-lg` for avatars/cards; never pill/full for metadata unless it has an operational status dot).
- **Font Size & Weight:** `text-xs font-medium` (12px on 14px root).
- **No Outer Wrappers:** Never wrap `getDeptBadgeClass` inside an additional `<span>` with duplicate padding or border classes.

---

## 3. Semantic Status Mapping

Semantic statuses are mapped to specific Tailwind palettes. Do not invent alternative color tokens.

### Palette Matrix

```
┌────────────────────────────────────────────────────────────────────────┐
│                        SEMANTIC STATUS PALETTE                         │
├──────────────┬──────────┬───────────────────────┬──────────────────────┤
│ Status Type  │ Palette  │ Primary Background    │ Text / Dark Text     │
├──────────────┼──────────┼───────────────────────┼──────────────────────┤
│ Success      │ Emerald  │ bg-emerald-50         │ text-emerald-700     │
│              │          │ dark:bg-emerald-950/40│ dark:text-emerald-300│
├──────────────┼──────────┼───────────────────────┼──────────────────────┤
│ Warning      │ Amber    │ bg-amber-50           │ text-amber-700       │
│              │          │ dark:bg-amber-950/40  │ dark:text-amber-300  │
├──────────────┼──────────┼───────────────────────┼──────────────────────┤
│ Danger       │ Rose     │ bg-rose-50            │ text-rose-700        │
│              │          │ dark:bg-rose-950/40   │ dark:text-rose-300   │
├──────────────┼──────────┼───────────────────────┼──────────────────────┤
│ Remote/WFH   │ Indigo   │ bg-indigo-50          │ text-indigo-700      │
│              │          │ dark:bg-indigo-950/40 │ dark:text-indigo-300 │
├──────────────┼──────────┼───────────────────────┼──────────────────────┤
│ Partial/Short│ Purple   │ bg-purple-50          │ text-purple-700      │
│              │          │ dark:bg-purple-950/40 │ dark:text-purple-300 │
├──────────────┼──────────┼───────────────────────┼──────────────────────┤
│ Info/Holiday │ Blue     │ bg-blue-50            │ text-blue-700        │
│              │          │ dark:bg-blue-950/40   │ dark:text-blue-300   │
├──────────────┼──────────┼───────────────────────┼──────────────────────┤
│ Inert/Off    │ Zinc     │ bg-zinc-100           │ text-zinc-600        │
│              │          │ dark:bg-zinc-800      │ dark:text-zinc-400   │
└──────────────┴──────────┴───────────────────────┴──────────────────────┘
```

### 1. Success (Emerald)
- **Class:** `bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800`
- **Dot/Icon:** `bg-emerald-500` / `text-emerald-600 dark:text-emerald-400`
- **Operational States:**
  - `present`, `active`, `completed`, `on_time`
  - Health: `good`, `Excellent`
  - Positive Overtime / Net Variance: `text-emerald-600 dark:text-emerald-400`

### 2. Warning & Pending (Amber)
- **Class:** `bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800`
- **Dot/Icon:** `bg-amber-500` / `text-amber-600 dark:text-amber-400`
- **Operational States:**
  - `late`, `leaves`, `casual_leave`, `sick_leave`, `annual_leave`, `unpaid_leave`
  - Priority: `medium`, `Moderate`
  - Status: `pending_approval`, `grace_period`

### 3. Danger, Critical & Breaches (Rose)
- **Class:** `bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800`
- **Dot/Icon:** `bg-rose-500` / `text-rose-600 dark:text-rose-400`
- **Operational States:**
  - `absent`, `missed_punch`, `rejected`, `overdue`
  - Health: `critical`, `Emergency` (add `animate-pulse`)
  - Priority: `high`, `High Priority`
  - Undertime / Strikes / Penalties: `text-rose-600 dark:text-rose-400`

### 4. Operational Adjustments & Calendars
- **Remote Work (WFH — Indigo):**
  - `bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800`
- **Partial Leave (Short Leave — Purple):**
  - `bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800`
- **Calendar & System Info (Public Holiday — Blue):**
  - `bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800`
- **Off-Duty / Non-Working (Sunday Off, Scheduled Off — Zinc):**
  - `bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border border-zinc-200 dark:border-zinc-700`

### 5. Reusable Workspace Status Components
Always prefer existing shared components in [`src/components/ui/WorkspaceBadges.tsx`](file:///c:/Users/coco/Desktop/cagent/src/components/ui/WorkspaceBadges.tsx):

```tsx
import { HealthBadge, PriorityBadge } from '@/components/ui/WorkspaceBadges';

// Health: 'good' | 'warning' | 'critical' | 'Emergency' | 'Moderate' | 'Excellent'
<HealthBadge health={workspace.health} />

// Priority: 'high' | 'medium' | 'low'
<PriorityBadge priority={workspace.priority} showSuffix={true} />
```

---

## 4. Typography & Numeric Precision

### Font Stack Hierarchy
Configured in `src/index.css` with `@fontsource` bundles imported in `src/main.tsx`:

| Purpose | CSS Variable / Token | Font Families | Weights Loaded |
| :--- | :--- | :--- | :--- |
| **Primary Sans / Body** | `--font-sans` (`font-sans`) | `'Inter', 'Plus Jakarta Sans', system-ui, sans-serif` | 400, 500, 600, 700 |
| **Display / Section Headers** | `--font-display` | `'Plus Jakarta Sans', 'Inter', system-ui, sans-serif` | 500, 600, 700 |
| **Monospace / Code** | `--font-mono` (`font-mono`) | `'JetBrains Mono', 'Fira Code', monospace` | 400, 500 |
| **Numeric & Tabular Data** | `.font-numeric` | `'Inter', 'Plus Jakarta Sans'` with `tabular-nums` | Inherited |

### Root Scaling
- `html { font-size: 14px; }`
- Because the root is `14px`:
  - `text-xs` = `12px` (Primary table data, metadata tags, subtitles)
  - `text-sm` = `14px` (Form inputs, card titles, table headers, buttons)
  - `text-base` = `16px` (View titles, summary numbers)
  - `text-lg` / `text-xl` = `18px` - `20px` (High-level metric statistics)

### Numeric & Tabular Alignment Rule
For all times, timestamps, currencies, hour counts, percentages, and metrics:
- **ALWAYS** apply the `.font-numeric` class or `tabular-nums` so numbers align strictly across table columns without jitter.
```tsx
<span className="font-numeric text-zinc-800 dark:text-zinc-200">
  09:30 AM
</span>
```
- Note: Avoid raw `font-mono` in dense attendance/financial views if the zero dot/slash causes visual clutter. `.font-numeric` uses tabular Inter for clean, legible open zeros.

---

## 5. Enterprise High-Density Table Architecture

### The Anti-Bloat Rule
> **Enterprise screens must present actionable data at high density. Tables must NEVER use loose consumer padding (e.g. `py-6`, `py-8`). Keep rows compact, scannable, and vertically tight.**

### Standard Padding Tolerances
- **Headers (`<th>`):** `py-2.5 px-3` to `py-3 px-4`
- **Standard Data Cells (`<td>`):** `py-2.5 px-3` to `py-3 px-4`
- **Dense/Compact Tables (`<td>`):** `py-2 px-2.5`
- **Max Multi-line Avatar Cells (`<td>`):** `py-3.5 px-4`

### Standard Enterprise Table Blueprint
When generating tables, copy and adapt this structural pattern:

```tsx
<div className="w-full overflow-hidden rounded-2xl border border-zinc-200 dark:border-zinc-800/90 bg-white dark:bg-[#11131a] shadow-xs">
  {/* Horizontal scroll container */}
  <div className="overflow-x-auto">
    <table className="w-full text-left text-xs border-collapse">
      {/* Table Head */}
      <thead>
        <tr className="bg-zinc-50 dark:bg-[#161822] text-zinc-600 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800 font-bold uppercase tracking-wider text-[11px]">
          <th className="py-3 px-4">#</th>
          <th className="py-3 px-4">Employee</th>
          <th className="py-3 px-4">Role</th>
          <th className="py-3 px-4">Department</th>
          <th className="py-3 px-4">Effective Time</th>
          <th className="py-3 px-4">Status</th>
          <th className="py-3 px-4 text-right">Actions</th>
        </tr>
      </thead>

      {/* Table Body */}
      <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800/60 font-medium">
        {isLoading ? (
          // Skeleton loading state
          Array.from({ length: 8 }).map((_, i) => (
            <tr key={`skeleton-${i}`} className="animate-pulse">
              <td className="py-3 px-4"><div className="h-3 w-4 bg-zinc-200 dark:bg-zinc-800 rounded" /></td>
              <td className="py-3 px-4"><div className="h-4 w-28 bg-zinc-200 dark:bg-zinc-800 rounded" /></td>
              <td className="py-3 px-4"><div className="h-5 w-20 bg-zinc-200 dark:bg-zinc-800 rounded-md" /></td>
              <td className="py-3 px-4"><div className="h-5 w-24 bg-zinc-200 dark:bg-zinc-800 rounded-md" /></td>
              <td className="py-3 px-4"><div className="h-4 w-16 bg-zinc-200 dark:bg-zinc-800 rounded" /></td>
              <td className="py-3 px-4"><div className="h-5 w-16 bg-zinc-200 dark:bg-zinc-800 rounded-full" /></td>
              <td className="py-3 px-4 text-right"><div className="h-6 w-14 bg-zinc-200 dark:bg-zinc-800 rounded ml-auto" /></td>
            </tr>
          ))
        ) : rows.length === 0 ? (
          // Clean Empty State
          <tr>
            <td colSpan={7} className="py-16 text-center text-zinc-400 dark:text-zinc-500">
              <p className="text-sm font-semibold">No records found</p>
              <p className="text-xs mt-1">Try adjusting your filters or date range.</p>
            </td>
          </tr>
        ) : (
          // Data rows with hover transitions
          rows.map((row, idx) => (
            <tr 
              key={row.id}
              className="hover:bg-zinc-50/80 dark:hover:bg-zinc-800/30 transition-colors"
            >
              <td className="py-3 px-4 text-zinc-400 font-numeric">{idx + 1}</td>
              <td className="py-3 px-4 font-bold text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                {row.name}
              </td>
              <td className="py-3 px-4 whitespace-nowrap">
                <span className={getRoleBadgeClass(row.role)}>
                  {getRoleLabel(row.role)}
                </span>
              </td>
              <td className="py-3 px-4 whitespace-nowrap">
                <span className={getDeptBadgeClass(row.department)}>
                  {row.department}
                </span>
              </td>
              <td className="py-3 px-4 font-numeric font-semibold text-zinc-800 dark:text-zinc-200 whitespace-nowrap">
                {row.effectiveTime}
              </td>
              <td className="py-3 px-4 whitespace-nowrap">
                {/* Semantic status with dot */}
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                  Present
                </span>
              </td>
              <td className="py-3 px-4 text-right whitespace-nowrap">
                <button className="px-2.5 py-1 text-xs font-semibold rounded-lg bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 transition-colors">
                  Details
                </button>
              </td>
            </tr>
          ))
        )}
      </tbody>
    </table>
  </div>
</div>
```

---

## 6. Pre-Flight Agent Checklist

Before completing any task modifying or introducing UI elements, verify:

- [ ] **Are all Department, Role, and Task Type badges strictly neutral Slate/Zinc?**
- [ ] **Are there zero hardcoded colorful category mappings (e.g. `dept === 'Creative' ? 'bg-purple-100' : ...`)?**
- [ ] **Are operational statuses using the exact Semantic Mapping (Emerald, Amber, Rose, Blue, Indigo, Purple)?**
- [ ] **Are numeric values, timestamps, and variances styled with `.font-numeric` or `tabular-nums`?**
- [ ] **Do all tables enforce compact data density (`py-2.5` - `py-3` cells, no `py-6+` bloated rows)?**
- [ ] **Are shared badge components (`WorkspaceBadges.tsx` and `badgeStyles.ts`) imported rather than duplicated?**
- [ ] **Does the code compile cleanly with `npm run lint` and `npm run build`?**
