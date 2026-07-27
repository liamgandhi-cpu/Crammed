import { Link } from "react-router-dom";
import { CalendarRange } from "lucide-react";

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle: string;
}

export function AuthLayout({ children, title, subtitle }: AuthLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <Link
          to="/"
          className="flex items-center gap-2.5 mb-10 justify-center group"
        >
          <div className="h-9 w-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center group-hover:bg-primary/20 transition-colors">
            <CalendarRange className="h-5 w-5 text-primary" />
          </div>
          <span className="font-display text-xl font-bold tracking-tight">
            AutoPlanner
          </span>
        </Link>

        {/* Card */}
        <div className="bg-card border border-border rounded-xl p-8">
          <div className="mb-6 text-center">
            <h1 className="font-display text-2xl font-bold mb-1">{title}</h1>
            <p className="text-muted-foreground text-sm">{subtitle}</p>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}
