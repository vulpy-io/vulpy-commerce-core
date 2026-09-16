# CSS-Only Product Visuals — Reference

## Clip-Path Shape Templates

### Jersey/Shirt (8-point)
```css
clip-path: polygon(20% 0%, 80% 0%, 100% 20%, 100% 70%, 80% 100%, 20% 100%, 0% 70%, 0% 20%);
```
Shape: shouldered top, straight sides, flat bottom with slight flare.

### Box/Package (8-point)
```css
clip-path: polygon(10% 0%, 90% 0%, 100% 10%, 100% 90%, 90% 100%, 10% 100%, 0% 90%, 0% 10%);
```
Shape: beveled corners, good for boxes, sneakers, or general merchandise.

### Badge/Shield (6-point)
```css
clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
```
Shape: pointed top, wide middle, pointed bottom.

### Bottle (10-point)
```css
clip-path: polygon(35% 0%, 65% 0%, 70% 10%, 72% 25%, 75% 30%, 80% 80%, 72% 100%, 28% 100%, 20% 80%, 25% 30%, 28% 25%, 30% 10%);
```
Shape: narrow neck, widening body, flat bottom.

## Emoji Cheatsheet for E-Commerce

### Categories
| Emoji | Meaning |
|-------|---------|
| ⚽ | Football / sports |
| 👟 | Sneakers / shoes |
| 👕 | Apparel / shirts |
| 🧢 | Headwear |
| 🎒 | Bags / backpacks |
| 🏀 | Basketball |
| ⚾ | Baseball |

### Status / Messaging
| Emoji | Meaning |
|-------|---------|
| 🔥 | Popular / trending |
| 🆕 | New arrival |
| ⚡ | Flash sale |
| 🏆 | Best seller |
| ⭐ | Top rated |
| ✅ | In stock |
| 🚚 | Free shipping |
| 💰 | Sale / discount |
| 🎁 | Gift / offer |

### Brand / Identity
| Emoji | Meaning |
|-------|---------|
| 👑 | Premium / luxury |
| 🛡️ | Guarantee / quality |
| 🔴🔵🟢🔵🟡 | Brand color markers |

## Club Color Gradients (Football Kits)

Standard club color hex values for realistic gradient fills:

| Club | Primary | Secondary | Used For |
|------|---------|-----------|----------|
| Arsenal | `#ef0107` | `#fff` | Home kit |
| Chelsea | `#034694` | `#fff` | Home; away: `#0a3b82` |
| Liverpool | `#c8102e` | `#fff` | Home kit |
| Man City | `#6cabdd` | `#1b2f68` | Home sky blue + navy trim |
| Man United | `#da291c` | `#ffe500` | Home kit |
| Tottenham | `#132257` | `#fff` | Home kit |
| Real Madrid | `#febe10` | `#00529f` | Home gold + blue |
| Barcelona | `#a50044` | `#004d98` | Home; away: `#a50044` + `#004d98` |
| Atlético Madrid | `#cb3524` | `#0b1d3a` | Home kit |
| Valencia | `#febe10` | `#ee3524` | Home kit |

## CSS Gradient Hero Background Patterns

### Stadium/dusk atmosphere
```css
background: linear-gradient(135deg, #0a0a1a 0%, #0d1a28 25%, #1a2a3a 45%, #3a2a1a 65%, #6b4a1a 80%, #8a6a1a 100%);
```

### Bright matchday
```css
background: linear-gradient(180deg, #f8f7f4 0%, #e8e5dd 100%);
```

### Green pitch accent
```css
background: radial-gradient(ellipse 120% 40% at 50% 100%, rgba(26, 107, 58, 0.15) 0%, transparent 70%);
```

## Decorative SVG Patterns

### Football pitch outline
```svg
<rect x="10%" y="10%" width="80%" height="80%" rx="8" stroke="currentColor" fill="none" opacity="0.2"/>
<rect x="10%" y="10%" width="15%" height="80%" rx="8" stroke="currentColor" fill="none" opacity="0.15"/>
<rect x="75%" y="10%" width="15%" height="80%" rx="8" stroke="currentColor" fill="none" opacity="0.15"/>
<line x1="50%" y1="10%" x2="50%" y2="90%" stroke="currentColor" opacity="0.15"/>
<circle cx="50%" cy="50%" r="10%" stroke="currentColor" fill="none" opacity="0.15"/>
```

### Diamond/geometric tiling
```svg
<path d="M0 400 L200 200 L400 400 L200 600 Z" fill="rgba(accent,0.03)" stroke="rgba(accent,0.06)"/>
<!-- Repeat with offset for tiling pattern -->
```

## Verifying No Images Used

Before delivering, always verify:
```bash
grep -c '<img' output-file.html    # should be 0
grep -c 'image_generate' output-file.html  # should be 0
grep -c 'src="http' output-file.html  # should be 0
```