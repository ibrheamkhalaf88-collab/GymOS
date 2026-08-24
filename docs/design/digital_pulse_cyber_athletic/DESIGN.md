---
name: Digital Pulse Cyber-Athletic
colors:
  surface: '#111508'
  surface-dim: '#111508'
  surface-bright: '#373b2c'
  surface-container-lowest: '#0c0f04'
  surface-container-low: '#1a1d10'
  surface-container: '#1e2113'
  surface-container-high: '#282b1d'
  surface-container-highest: '#333627'
  on-surface: '#e2e4cf'
  on-surface-variant: '#c4c9ac'
  inverse-surface: '#e2e4cf'
  inverse-on-surface: '#2f3223'
  outline: '#8e9379'
  outline-variant: '#444933'
  surface-tint: '#abd600'
  primary: '#ffffff'
  on-primary: '#283500'
  primary-container: '#c3f400'
  on-primary-container: '#556d00'
  inverse-primary: '#506600'
  secondary: '#c7c6c6'
  on-secondary: '#303031'
  secondary-container: '#464747'
  on-secondary-container: '#b6b5b5'
  tertiary: '#ffffff'
  on-tertiary: '#20333d'
  tertiary-container: '#d1e5f3'
  on-tertiary-container: '#546773'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#c3f400'
  primary-fixed-dim: '#abd600'
  on-primary-fixed: '#161e00'
  on-primary-fixed-variant: '#3c4d00'
  secondary-fixed: '#e3e2e2'
  secondary-fixed-dim: '#c7c6c6'
  on-secondary-fixed: '#1b1c1c'
  on-secondary-fixed-variant: '#464747'
  tertiary-fixed: '#d1e5f3'
  tertiary-fixed-dim: '#b5c9d7'
  on-tertiary-fixed: '#091e28'
  on-tertiary-fixed-variant: '#364954'
  background: '#111508'
  on-background: '#e2e4cf'
  surface-variant: '#333627'
typography:
  display-xl:
    fontFamily: Space Grotesk
    fontSize: 48px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: -0.05em
  display-lg:
    fontFamily: Space Grotesk
    fontSize: 30px
    fontWeight: '700'
    lineHeight: '1'
    letterSpacing: -0.05em
  headline-sm:
    fontFamily: Space Grotesk
    fontSize: 18px
    fontWeight: '700'
    lineHeight: '1.2'
  body-md:
    fontFamily: Manrope
    fontSize: 14px
    fontWeight: '500'
    lineHeight: '1.4'
  label-caps:
    fontFamily: Manrope
    fontSize: 10px
    fontWeight: '600'
    lineHeight: '1'
    letterSpacing: 0.1em
  metric-mobile:
    fontFamily: Space Grotesk
    fontSize: 36px
    fontWeight: '700'
    lineHeight: '1'
rounded:
  sm: 0.5rem
  DEFAULT: 1rem
  md: 1.5rem
  lg: 2rem
  xl: 3rem
  full: 9999px
spacing:
  container-padding: 1rem
  stack-gap: 1rem
  element-gap-sm: 0.5rem
  nav-height: 64px
  tab-bar-height: 85px
---

## Brand & Style
The brand is high-energy, technical, and aggressive, designed for high-performance gym management. It targets gym owners and staff who need a real-time, data-heavy dashboard that feels like a mission control center. 

The design style is **High-Contrast / Bold** mixed with **Cyber-Brutalism**. It utilizes a dark, "ink-trap" aesthetic characterized by pure black backgrounds, neon accent colors, and thick borders. The interface emphasizes urgency and precision through the use of neon "glow" states and tight, uppercase typography. The emotional response is one of controlled intensity, efficiency, and technological superiority.

## Colors
The palette is rooted in a "midnight" environment to reduce eye strain in low-light environments (like gym floors) while providing maximum contrast for critical data.

- **Primary (Volt):** A high-visibility neon yellow-green (#ccff00) used for active status, primary metrics, and focus elements.
- **Secondary (Slate):** A neutral, technical gray (#737373) used for supporting information and less critical interface elements.
- **Tertiary (Frost):** A cool, muted steel blue (#9bafbc) used to categorize secondary data sets, machine health, or historical comparisons.
- **Alert (Neon Pink):** Used exclusively for system failures, expired memberships, and maintenance warnings. It carries a specific "neon-alert" glow to distinguish it from standard notifications.
- **Surface & Grid:** Surfaces use a deep charcoal (#171717) to separate from the pure black background. Borders are strictly defined by a dark gray (#333333), creating a technical, structural grid.

## Typography
The system uses a pairing of **Space Grotesk** for display/technical data and **Manrope** for body copy.

- **Technical Data:** Large metrics use Space Grotesk with "tabular-nums" to ensure vertical alignment in dashboards. Headline treatments are consistently uppercase with tight letter-spacing to evoke a sense of urgency.
- **Bilingual Support:** Arabic text (Tajawal) is integrated seamlessly, often placed directly below English labels at a slightly smaller scale (70-80% opacity) to provide context without cluttering the primary visual hierarchy.
- **Functional Labels:** Captions and labels use wide letter-spacing (tracking) and uppercase Manrope to maintain legibility at very small sizes.

## Layout & Spacing
The layout follows a **Fluid Grid** model optimized for mobile-first rapid viewing.

- **The 16px Rhythm:** A base spacing unit of 16px (1rem) governs the external container margins and the primary gaps between cards.
- **Component Internals:** Inner padding for cards is typically 16px, while tighter information clusters (like list items) use 8px or 12px.
- **Mobile Constraints:** The layout uses a 2-column grid for primary metrics on mobile, reflowing to a single column for detailed feeds or charts.
- **Safe Areas:** A fixed 85px bottom navigation bar and a 64px sticky header define the viewport boundaries.

## Elevation & Depth
Depth is created through **Tonal Layering** and **Luminescent Effects** rather than traditional shadows.

- **Luminescent Glows:** Active or critical elements use a `neon-shadow` (e.g., `0 0 12px rgba(204, 255, 0, 0.4)`). This simulates a light-emitting diode (LED) look.
- **Surface Stacking:** The background is #0A0A0A. Cards sit on this background at #171717. Interactive states (hover/active) lift to #262626.
- **Border Definition:** Because the surfaces are very dark, 1px solid borders (#333333) are required to define the edges of every component.

## Shapes
The shape language is "Pill-Modern" – utilizing very generous corner radii to significantly soften the aggressive color and technical typography.

- **Primary Cards:** 2rem (32px) corner radius for all dashboard widgets to create a distinct, fluid container style.
- **Buttons & Chips:** 1rem (16px) for interactive controls to maintain a distinct but softer "utility" feel.
- **Indicator Lights:** Status pips (active/alert) are always perfect circles with pulse animations.

## Components
- **Stat Cards:** Must contain a label (top), a metric (bottom-left), and a background icon (bottom-right) at 20% opacity. 
- **System Feed Items:** These are cards with a 2px left-accent border. The color of the border indicates the severity (Volt for info, Neon Pink for alert, Frost for secondary updates).
- **Navigation Bar:** Fixed bottom position, utilizing a 2-tier label system (English over Arabic) and Material Symbols at 24px.
- **Progress/Sparklines:** Line charts should use a vertical gradient fill (Primary color to transparent) with a "tension" of 0.3 for smooth, modern curves.
- **Interactive States:** Use a `scale(0.95)` transformation on active/touch-down for cards to provide tactile feedback.