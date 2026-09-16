# Megamenu Component

## Contents

- [Overview](#overview)
- [When to Use Megamenu](#when-to-use-megamenu)
- [Content Organization](#content-organization)
- [Layout Patterns](#layout-patterns)
- [Trigger Behavior](#trigger-behavior)
- [Mobile Alternative](#mobile-alternative)
- [Checklist](#checklist)

## Overview

Megamenu is a large, full-width dropdown navigation showing multiple columns of categories, links, and promotional content. Opens from navbar trigger items (e.g., "Shop", "Men", "Women").

**Assumed knowledge**: AI agents know how to build dropdown menus with hover/click triggers. This focuses on ecommerce megamenu patterns.

**Key requirements:**
- Full-width display (spans viewport)
- Multiple columns for categories
- Positioned directly below navbar
- Optional promotional images
- Mobile alternative (hamburger menu, not megamenu)

## When to Use Megamenu

**Use megamenu when:**
- Large product catalog (10+ top-level categories)
- Deep hierarchy (parent → child → grandchild levels)
- Want to showcase featured products/campaigns
- Multiple segments (Men, Women, Kids, etc.)
- Visual storytelling needed

**Use simple dropdown when:**
- Small catalog (<10 categories)
- Flat category structure (1-2 levels)
- Text-only navigation sufficient
- Minimalist design preference

**Common megamenu triggers:**
- "Shop" (all categories)
- "Men", "Women", "Kids" (segmented)
- "New Arrivals" (curated)
- "Sale" (promotional)

## Content Organization

**Backend Integration (CRITICAL):**

Fetch categories dynamically from ecommerce backend - never hardcode categories. Categories change frequently (new products, seasonal updates, inventory changes). Fetch from API on component mount or during SSR.

**Column structure (3-5 columns recommended):**

**Column 1-3: Category columns**
- Parent category header (bold, non-clickable or clickable to "View All")
- Child categories below (clickable links)
- 5-10 links per column maximum
- Group related subcategories

**Example:**

```plaintext
Electronics (header)
  Laptops
  Desktops
  Monitors
  Accessories
  View All Electronics
```

**Column 4-5: Promotional/Featured**
- Product image card (1-2 featured products)
- Campaign banner ("Summer Sale", "New Arrivals")
- "Shop the Look" curated sets
- Seasonal promotions

**Content limits:**

- Max 5 columns (avoid overcrowding)
- Max 10 links per column
- 1-2 promotional images maximum
- Keep height reasonable (<600px)

## Layout Patterns

### ⚠️ CRITICAL: Megamenu Positioning (Common Mistake)

**Common positioning errors that MUST be avoided:**

❌ **Mistake 1: Navbar doesn't have `position: relative`**
- Without positioning context on navbar, megamenu won't position correctly
- Megamenu will position relative to document body instead of navbar

❌ **Mistake 2: Megamenu positioned relative to trigger button**
- Causes megamenu to appear offset, not aligned to left edge
- Megamenu won't span full width of navbar
- Different trigger positions cause inconsistent megamenu placement

❌ **Mistake 3: Megamenu doesn't span full width**
- Using `width: auto` or no width constraint
- Missing `left: 0` and `right: 0` properties
- Results in narrow dropdown instead of full-width panel

---

**REQUIRED positioning pattern:**

**Visual structure:**
```
┌─────────────────────────────────────────────────┐
│ NAVBAR (position: relative)                     │
│  [Logo]  [Shop ▼]  [Men]  [Women]  [Cart]      │
└─────────────────────────────────────────────────┘
  ┌───────────────────────────────────────────────┐
  │ MEGAMENU (absolute, left: 0, full width)      │
  │ ┌─────────────────────────────────────────┐   │
  │ │ Container (centered content)            │   │
  │ │ [Col1]  [Col2]  [Col3]  [Promo]        │   │
  │ └─────────────────────────────────────────┘   │
  └───────────────────────────────────────────────┘
```

**Required structure:**

1. **Navbar container**
   - MUST have `position: relative`
   - Creates positioning context for megamenu
   - Contains both trigger button and megamenu dropdown

2. **Megamenu dropdown**
   - MUST have `position: absolute`
   - MUST have `left: 0` (aligns to left edge of navbar)
   - MUST have `right: 0` OR `width: 100%` (spans full navbar width)
   - MUST have `top: 100%` (positioned directly below navbar)
   - Should have appropriate `z-index` (above content, below modals)

3. **Content wrapper (inside megamenu)**
   - Use constrained width container (e.g., `max-width`, `container`)
   - Center content with `margin: 0 auto`
   - Contains grid/columns for megamenu content

**Why this pattern is mandatory:**
- Navbar `position: relative` creates positioning context
- Megamenu `absolute` + `left: 0` + full width ensures consistent, full-width layout
- Positioning relative to navbar (not trigger) prevents offset issues
- Inner container centers content while maintaining full-width background

---

### Other Layout Considerations

- Positioned below navbar (no gap)
- White/light background, boxed padding
- Shadow or border for depth
- High z-index (above page content, below modals)

**Column layout:**
- Equal-width columns or flexible grid
- Adequate spacing (24-32px between columns)
- Left-aligned text in category columns
- Right column(s) for promotional content
- Responsive: Stack columns on tablet if needed

**Promotional images:**
- Right-aligned (1-2 columns)
- Aspect ratio: 2:3 or square
- Product images or lifestyle photography
- Clickable to product/category page
- Include caption or CTA ("Shop Now")

## Trigger Behavior

**Desktop hover (recommended):**
- Megamenu opens on trigger hover
- **CRITICAL: Megamenu MUST stay open while hovering over the dropdown content**
- Stays open while hovering trigger OR dropdown area
- Closes only when mouse leaves both trigger and dropdown areas
- Debounce close (200-300ms delay) to prevent accidental closure
- Smooth fade-in/out transition (200-300ms)

**Why this is critical:**
- If dropdown closes when moving from trigger to content, users can't access links
- Frustrating UX - users can't interact with megamenu items
- Common mistake: Only listening for hover on trigger, not on dropdown

**Desktop click (alternative):**
- Click trigger to toggle open/close
- Click outside to close
- Better for touch-enabled laptops
- Less accidental openings

**Hover flickering prevention:**
- No gap between navbar and dropdown
- Dropdown should slightly overlap navbar
- Debounce close delay prevents flickering

## Mobile Alternative

**Do NOT use megamenu on mobile:**
- Too large for mobile screens
- Hard to navigate multi-column layout
- Poor touch experience

**Mobile alternative (hamburger menu):**
- Hamburger icon opens slide-in drawer
- Vertical accordion for categories
- Parent category expands to show children
- Simple, scrollable list
- See navbar.md for mobile navigation patterns

**Breakpoint:**
- Megamenu: Desktop only (>1024px)
- Hamburger: Tablet and mobile (<1024px)

## Checklist

**Essential features:**
- [ ] Triggered from navbar items ("Shop", segments)
- [ ] **CRITICAL: Navbar container has `position: relative` (creates positioning context)**
- [ ] **CRITICAL: Megamenu has `position: absolute` with `left: 0` (NOT positioned relative to trigger button)**
- [ ] **CRITICAL: Megamenu spans full width (`right: 0` or `w-full`, NOT just `w-auto`)**
- [ ] **CRITICAL: Megamenu positioned at `top: 100%` or `top-full` (directly below navbar)**
- [ ] Full-width dropdown below navbar, spans entire navbar width
- [ ] 3-5 columns for organization
- [ ] Category hierarchy (parent → children links)
- [ ] Optional promotional images (1-2)
- [ ] **CRITICAL: Megamenu stays open when hovering over dropdown content (not just trigger)**
- [ ] Hover trigger with debounced close (200-300ms)
- [ ] Smooth fade-in/out transition
- [ ] No flickering (no gap between navbar and dropdown)
- [ ] Mobile: Use hamburger menu, NOT megamenu
- [ ] Keyboard accessible (Tab through links, Escape closes)
- [ ] `role="navigation"` on dropdown panel
- [ ] ARIA labels on trigger buttons
- [ ] Screen reader friendly (announce expand/collapse)
- [ ] Max 10 links per column
- [ ] Max 5 columns total
- [ ] Fetched dynamically from backend (don't hardcode categories)
