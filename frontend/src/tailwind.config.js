/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },

        /* Text hierarchy. Four steps, not two — the old palette had only
           `foreground` and `muted-foreground`, which is why every app screen
           flattened into one grey. Measured contrast on hsl(220 20% 4%):
           ink-1 18.5:1, ink-2 11.5:1, ink-3 7.1:1, ink-4 4.9:1 — all four
           clear AA for body text at any size. See index.css for why ink-4
           sits at 51% lightness rather than the 48% first chosen. */
        ink: {
          1: "hsl(var(--ink-1))",
          2: "hsl(var(--ink-2))",
          3: "hsl(var(--ink-3))",
          4: "hsl(var(--ink-4))",
        },

        /* Categorical accents. These replace the ~15 loose hex literals that
           were scattered through TodayPage/GradesPage (#60a5fa, #f43f5e,
           #a855f7, #38bdf8, …) — a set nobody chose, that drifted per file.
           All sit at 62–68% lightness so each clears 7:1 on the page ground
           and they read as one family rather than raw Tailwind defaults. */
        cat: {
          class: "hsl(var(--cat-class))",
          study: "hsl(var(--cat-study))",
          free: "hsl(var(--cat-free))",
          due: "hsl(var(--cat-due))",
          week: "hsl(var(--cat-week))",
          warn: "hsl(var(--cat-warn))",
        },

        /* Explicit surface planes, so a component can name the plane it sits
           on instead of guessing between bg-card / bg-muted / bg-secondary. */
        surface: {
          1: "hsl(var(--surface-1))",
          2: "hsl(var(--surface-2))",
          3: "hsl(var(--surface-3))",
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      fontFamily: {
        sans: ['"DM Sans"', "system-ui", "sans-serif"],
        display: ['"Bricolage Grotesque"', "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      fontSize: {
        /* Editorial display scale. Big, deliberate jumps — the old pages
           topped out at text-3xl and used it for three consecutive section
           headings, which is what made the rhythm read as a template.
           Bricolage Grotesque is an optical-size variable face, so it holds
           up at these sizes with tight tracking. */
        "display-1": ["clamp(3rem, 9vw, 6.5rem)", { lineHeight: "0.9", letterSpacing: "-0.045em", fontWeight: "800" }],
        "display-2": ["clamp(2.25rem, 6vw, 4rem)", { lineHeight: "0.95", letterSpacing: "-0.035em", fontWeight: "800" }],
        "display-3": ["clamp(1.75rem, 4vw, 2.75rem)", { lineHeight: "1.02", letterSpacing: "-0.025em", fontWeight: "700" }],
        "display-4": ["clamp(1.25rem, 2.4vw, 1.625rem)", { lineHeight: "1.15", letterSpacing: "-0.015em", fontWeight: "700" }],

        /* Metadata. `kicker` is the uppercase eyebrow that does the labelling
           work section headings used to duplicate. `micro` is the floor —
           nothing in the app should go below it, which the old 9px and 10px
           spans did routinely. */
        kicker: ["0.6875rem", { lineHeight: "1", letterSpacing: "0.16em", fontWeight: "600" }],
        micro: ["0.75rem", { lineHeight: "1.4", letterSpacing: "0.01em" }],
      },
      maxWidth: {
        /* Measure caps. Editorial layout lives or dies on line length;
           these keep prose in the 45–75 character band. */
        measure: "68ch",
        "measure-tight": "48ch",
      },
      boxShadow: {
        /* Dark-UI elevation. On hsl(220 20% 4%) a plain drop shadow is
           black-on-black and reads as nothing, so each level pairs a
           two-layer shadow with a 1px inset top highlight that implies a
           light source above the surface. Pair with the --surface-* tints
           in index.css: higher planes get lighter, not just darker-shadowed. */
        "elev-1": "0 1px 2px rgba(0,0,0,.55), inset 0 1px 0 rgba(255,255,255,.04)",
        "elev-2": "0 2px 4px rgba(0,0,0,.5), 0 6px 16px rgba(0,0,0,.4), inset 0 1px 0 rgba(255,255,255,.06)",
        "elev-3": "0 4px 8px rgba(0,0,0,.5), 0 14px 34px rgba(0,0,0,.5), inset 0 1px 0 rgba(255,255,255,.07)",
        "elev-4": "0 10px 20px rgba(0,0,0,.55), 0 30px 70px rgba(0,0,0,.62), inset 0 1px 0 rgba(255,255,255,.09)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-in-right": {
          "0%": { opacity: "0", transform: "translateX(20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        progress: {
          "0%": { transform: "translateX(-100%)" },
          "50%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.6s ease-out forwards",
        "fade-in": "fade-in 0.5s ease-out forwards",
        "slide-in-right": "slide-in-right 0.5s ease-out forwards",
        progress: "progress 1.8s ease-in-out infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
