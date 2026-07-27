import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { CalendarRange, Zap, Palette, Clock, ArrowRight } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const FEATURES = [
  {
    icon: Zap,
    title: "Paste & Go",
    desc: "Drop in your classes, activities, and deadlines — we handle the rest.",
  },
  {
    icon: Palette,
    title: "Color-Coded Blocks",
    desc: "Instantly see your week with category-coded time blocks.",
  },
  {
    icon: Clock,
    title: "Smart Scheduling",
    desc: "Conflicts detected. Study time allocated. Breaks built in automatically.",
  },
];

const STEPS = [
  "Paste your classes and activities",
  "Add assignments and deadlines",
  "Get a polished weekly schedule",
];

export default function LandingPage() {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border">
        <div className="flex items-center justify-between px-6 md:px-12 py-4 max-w-7xl mx-auto">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="h-8 w-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
              <CalendarRange className="h-4 w-4 text-primary" />
            </div>
            <span className="font-display text-lg font-bold tracking-tight">
              AutoPlanner
            </span>
          </Link>

          <div className="flex items-center gap-3">
            {user ? (
              <Link to="/dashboard">
                <Button size="sm">Dashboard</Button>
              </Link>
            ) : (
              <>
                <Link to="/login">
                  <Button variant="ghost" size="sm">Log in</Button>
                </Link>
                <Link to="/signup">
                  <Button size="sm">
                    Get Started
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 pt-20 md:pt-32 pb-24">
        <div className="max-w-2xl">
          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-extrabold leading-[1.05] tracking-tight animate-fade-slide-up">
            Stop juggling.
            <br />
            Start planning.
          </h1>

          <p className="mt-6 text-lg text-muted-foreground max-w-xl leading-relaxed">
            Paste in your classes, activities, and assignments — get a real
            schedule in seconds. No more spreadsheets, no more chaos.
          </p>

          <div className="mt-10">
            <Link to="/signup">
              <Button size="lg" className="text-base">
                Get Started — It's Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </Link>
          </div>
        </div>

        {/* Schedule preview */}
        <div className="mt-16 md:mt-20">
          <div className="bg-card border border-border rounded-xl p-4 md:p-6">
            {/* Mini schedule header */}
            <div className="flex items-center justify-between mb-4">
              <span className="font-display font-bold text-sm text-muted-foreground">
                WEEK OF {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }).toUpperCase()}
              </span>
              <div className="flex gap-1.5">
                {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d, i) => (
                  <span
                    key={d}
                    className={`text-[10px] font-bold w-14 text-center hidden sm:block ${i === 0 ? "text-primary" : "text-muted-foreground"}`}
                  >
                    {d}
                    {i === 0 && <span className="block h-0.5 w-3 bg-primary mx-auto mt-0.5 rounded-full" />}
                  </span>
                ))}
              </div>
            </div>
            {/* Schedule blocks */}
            <div className="grid grid-cols-5 gap-1.5 h-40 md:h-56">
              <div className="flex flex-col gap-1.5">
                <div className="rounded-md bg-primary/15 border border-primary/25 flex-[2] p-1.5">
                  <span className="text-[9px] md:text-[10px] font-medium text-primary">CS 301</span>
                </div>
                <div className="rounded-md bg-blue-500/15 border border-blue-500/25 flex-[1] p-1.5">
                  <span className="text-[9px] md:text-[10px] font-medium text-blue-400">Study</span>
                </div>
                <div className="rounded-md bg-violet-500/15 border border-violet-500/25 flex-[1.5] p-1.5">
                  <span className="text-[9px] md:text-[10px] font-medium text-violet-400">Club</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="rounded-md bg-green-500/15 border border-green-500/25 flex-[1.5] p-1.5">
                  <span className="text-[9px] md:text-[10px] font-medium text-green-400">MATH 210</span>
                </div>
                <div className="rounded-md bg-primary/15 border border-primary/25 flex-[2] p-1.5">
                  <span className="text-[9px] md:text-[10px] font-medium text-primary">CS 301</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="rounded-md bg-blue-500/15 border border-blue-500/25 flex-[1] p-1.5">
                  <span className="text-[9px] md:text-[10px] font-medium text-blue-400">Gym</span>
                </div>
                <div className="rounded-md bg-yellow-500/15 border border-yellow-500/25 flex-[2.5] p-1.5">
                  <span className="text-[9px] md:text-[10px] font-medium text-yellow-400">ENG 101</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="rounded-md bg-green-500/15 border border-green-500/25 flex-[1.5] p-1.5">
                  <span className="text-[9px] md:text-[10px] font-medium text-green-400">MATH 210</span>
                </div>
                <div className="rounded-md bg-violet-500/15 border border-violet-500/25 flex-[1] p-1.5">
                  <span className="text-[9px] md:text-[10px] font-medium text-violet-400">Lab</span>
                </div>
                <div className="rounded-md bg-primary/15 border border-primary/25 flex-[1.5] p-1.5">
                  <span className="text-[9px] md:text-[10px] font-medium text-primary">CS 301</span>
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <div className="rounded-md bg-yellow-500/15 border border-yellow-500/25 flex-[2] p-1.5">
                  <span className="text-[9px] md:text-[10px] font-medium text-yellow-400">ENG 101</span>
                </div>
                <div className="rounded-md bg-rose-500/15 border border-rose-500/25 flex-[1.5] p-1.5">
                  <span className="text-[9px] md:text-[10px] font-medium text-rose-400">Essay Due</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 pb-24">
        <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-12">
          Three steps. That&apos;s it.
        </h2>
        <div className="flex flex-col md:flex-row gap-4 max-w-2xl mx-auto">
          {STEPS.map((step, i) => (
            <div
              key={i}
              className="flex-1 bg-card border border-border rounded-xl p-5 flex items-start gap-4"
            >
              <span className="font-display font-bold text-sm text-primary flex-shrink-0 w-5">{i + 1}.</span>
              <p className="text-sm leading-relaxed text-muted-foreground">{step}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 pb-24">
        <h2 className="font-display text-2xl md:text-3xl font-bold text-center mb-12">
          Why students love it
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="bg-card border border-border rounded-xl p-6 hover:-translate-y-px transition-transform">
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center mb-5">
                <f.icon className="h-5 w-5 text-primary" />
              </div>
              <h3 className="font-display font-bold text-base mb-2">{f.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="max-w-7xl mx-auto px-6 md:px-12 pb-32">
        <div className="bg-card border border-border rounded-xl p-8 md:p-12 text-center">
          <h2 className="font-display text-2xl md:text-3xl font-bold mb-3">
            Ready to take control of your week?
          </h2>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Join thousands of students who ditched the chaos.
          </p>
          <Link to="/signup" className="inline-block">
            <Button size="lg" className="text-base">
              Get Started — It's Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border py-6 px-6 md:px-12">
        <div className="max-w-7xl mx-auto flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-primary" />
            <span className="font-display font-semibold text-foreground">AutoPlanner</span>
          </div>
          <span>&copy; {new Date().getFullYear()} AutoPlanner</span>
        </div>
      </footer>
    </div>
  );
}
