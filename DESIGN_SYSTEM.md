# Talaria Design System

A unified design system for consistent styling across all Talaria applications.

---

## 🎨 Color Palette

### Primary Colors

| Name | Hex | HSL | Usage |
|------|-----|-----|-------|
| **Background Dark** | `#030014` | `240 100% 4%` | Main page background |
| **Background Alt** | `#0a0a1a` | `240 33% 7%` | Card/modal backgrounds |
| **Background Card** | `#08080f` | `240 30% 5%` | Dropdown/popover backgrounds |

### Accent Colors

| Name | Hex | RGB | Usage |
|------|-----|-----|-------|
| **Blue Primary** | `#3b82f6` | `59, 130, 246` | Primary buttons, links |
| **Blue Dark** | `#1e3a8a` | `30, 58, 138` | Gradients, hover states |
| **Indigo** | `#6366f1` | `99, 102, 241` | Sparkles, accents |
| **Cyan** | `#06b6d4` | `6, 182, 212` | Secondary accents |
| **Purple** | `#8b5cf6` | `139, 92, 246` | Gradient orbs, highlights |

### Gradient Definitions

```css
/* Primary Button Gradient */
background: linear-gradient(to right, #1e3a8a, #3b82f6);

/* Hero Button Gradient */
background: linear-gradient(to right, #000000, #1e3a8a, #2563eb);

/* Accent Gradient (Blue to Cyan) */
background: linear-gradient(to right, #3b82f6, #6366f1, #06b6d4);

/* Purple Gradient (Mentorship) */
background: linear-gradient(to right, #000000, #581c87, #9333ea);

/* Cyan Gradient (Backtest) */
background: linear-gradient(to right, #000000, #164e63, #0891b2);
```

### Text Colors

| Name | Class | Usage |
|------|-------|-------|
| **Primary Text** | `text-white` | Headings, important text |
| **Secondary Text** | `text-white/70` | Labels, descriptions |
| **Muted Text** | `text-white/50` | Placeholders, hints |
| **Disabled Text** | `text-white/40` | Disabled states |
| **Link Text** | `text-blue-400` | Links, interactive text |

---

## 🔤 Typography

### Font Family

```css
font-family: var(--font-zain), system-ui, sans-serif;
```

**Zain Font Weights:**
- `200` - Extra Light
- `300` - Light  
- `400` - Regular
- `700` - Bold
- `800` - Extra Bold
- `900` - Black

### Font Sizes

| Name | Size | Usage |
|------|------|-------|
| **Hero Title** | `text-4xl md:text-6xl lg:text-7xl` | Main page titles |
| **Section Title** | `text-2xl md:text-3xl` | Section headings |
| **Card Title** | `text-xl` | Card headings |
| **Body Large** | `text-lg` | Important body text |
| **Body** | `text-base` | Regular body text |
| **Small** | `text-sm` | Labels, captions |
| **Extra Small** | `text-xs` | Badges, hints |

---

## 📦 Components

### Buttons

**Primary Button:**
```jsx
<button className="rounded-full px-8 py-6 text-white bg-gradient-to-r from-black via-blue-900 to-blue-600 hover:from-black hover:via-blue-800 hover:to-blue-500 shadow-[0_0_0_1px_rgba(59,130,246,0.25),0_18px_45px_rgba(37,99,235,0.25)] hover:shadow-[0_0_0_1px_rgba(59,130,246,0.4),0_22px_55px_rgba(37,99,235,0.32)] transition-all">
  Button Text
</button>
```

**Ghost Button:**
```jsx
<button className="rounded-full border border-white/10 bg-white/5 text-white hover:bg-white/10 px-4 py-2">
  Ghost Button
</button>
```

**Form Submit Button:**
```jsx
<button className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 rounded-lg font-medium hover:from-blue-500 hover:to-indigo-500 transition-all shadow-lg shadow-blue-500/25">
  Submit
</button>
```

### Input Fields

```jsx
<input className="w-full px-4 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all" />
```

### Cards

```jsx
<div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
  {/* Card content */}
</div>
```

### Modals

```jsx
<div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
  <div className="bg-[#0a0a1a]/95 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl max-w-md w-full">
    {/* Modal content */}
  </div>
</div>
```

---

## 🌟 Effects

### Shadows

```css
/* Card Shadow */
box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);

/* Button Glow (Blue) */
box-shadow: 0 0 0 1px rgba(59, 130, 246, 0.25), 0 18px 45px rgba(37, 99, 235, 0.25);

/* Button Glow (Purple) */
box-shadow: 0 0 0 1px rgba(147, 51, 234, 0.25), 0 18px 45px rgba(126, 34, 206, 0.25);
```

### Backdrop Blur

```css
backdrop-filter: blur(12px); /* backdrop-blur-xl */
backdrop-filter: blur(8px);  /* backdrop-blur-lg */
backdrop-filter: blur(4px);  /* backdrop-blur-sm */
```

### Gradient Orbs (Background)

```jsx
{/* Purple Orb */}
<div className="absolute w-96 h-96 rounded-full opacity-20 blur-3xl"
  style={{ background: 'radial-gradient(circle, #8b5cf6 0%, transparent 70%)' }}
/>

{/* Cyan Orb */}
<div className="absolute w-80 h-80 rounded-full opacity-15 blur-3xl"
  style={{ background: 'radial-gradient(circle, #06b6d4 0%, transparent 70%)' }}
/>
```

### Grid Pattern Overlay

```jsx
<div className="absolute inset-0 opacity-[0.02]"
  style={{
    backgroundImage: `
      linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
    `,
    backgroundSize: '50px 50px'
  }}
/>
```

---

## 🎬 Animations

### Fade In Up

```css
@keyframes fade-in-up {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in-up {
  animation: fade-in-up 0.6s ease-out forwards;
}
```

### Float

```css
@keyframes float {
  0%, 100% { transform: translateY(0px); }
  50% { transform: translateY(-20px); }
}
```

### Shake (Error)

```css
@keyframes shakeX {
  0%, 100% { transform: translateX(0); }
  20%, 60% { transform: translateX(-10px); }
  40%, 80% { transform: translateX(10px); }
}
```

---

## 📐 Spacing

| Name | Value | Usage |
|------|-------|-------|
| **Page Padding** | `px-4 md:px-6` | Page horizontal padding |
| **Card Padding** | `p-6 md:p-8` | Card internal padding |
| **Section Gap** | `gap-6 md:gap-8` | Between sections |
| **Form Gap** | `space-y-4` | Between form fields |

---

## 📱 Responsive Breakpoints

| Breakpoint | Width | Usage |
|------------|-------|-------|
| `sm` | 640px | Mobile landscape |
| `md` | 768px | Tablet |
| `lg` | 1024px | Desktop |
| `xl` | 1280px | Large desktop |
| `2xl` | 1536px | Extra large |

---

## ✅ Usage Examples

### Page Layout

```jsx
<div className="min-h-screen bg-[#030014] text-white overflow-hidden">
  {/* Background Effects */}
  <div className="fixed inset-0 pointer-events-none">
    {/* Gradient orbs */}
  </div>
  
  {/* Content */}
  <div className="relative z-10">
    {/* Page content */}
  </div>
</div>
```

### Form Card

```jsx
<div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl max-w-md mx-auto">
  <h1 className="text-2xl font-bold text-white mb-2">Title</h1>
  <p className="text-white/60 text-sm mb-6">Description</p>
  
  <form className="space-y-4">
    {/* Form fields */}
  </form>
</div>
```

---

*Document created: 2026-02-11*
*Version: 1.0*
