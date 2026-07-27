import { useState } from "react";
import { Music, X, ChevronDown } from "lucide-react";

const PLAYLISTS = [
  { label: "Lofi Girl",   id: "jfKfPfyJRdk" },
  { label: "Chillhop",    id: "5yx6BWlEVcY" },
  { label: "Night Lofi",  id: "rUxyKA_-grg" },
  { label: "Jazz & Lofi", id: "NEkHJS95ao4" },
];

interface Props {
  onClose: () => void;
}

export default function MusicPlayer({ onClose }: Props) {
  const [current, setCurrent] = useState(0);
  const [minimized, setMinimized] = useState(false);

  return (
    <div className="fixed bottom-20 right-4 lg:bottom-6 z-50 flex flex-col items-end gap-2">
      {minimized ? (
        <button
          onClick={() => setMinimized(false)}
          className="h-11 w-11 rounded-full bg-card border border-border flex items-center justify-center text-primary shadow-lg hover:scale-105 transition-transform"
          title="Show music player"
        >
          <Music className="h-4 w-4" />
        </button>
      ) : (
        <div className="bg-card border border-border rounded-xl w-72 overflow-hidden animate-fade-slide-up shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
            <div className="flex items-center gap-2">
              <Music className="h-3.5 w-3.5 text-primary" />
              <span className="text-xs font-semibold">Study Music</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMinimized(true)}
                className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
                title="Minimize"
              >
                <ChevronDown className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={onClose}
                className="h-5 w-5 flex items-center justify-center rounded text-muted-foreground hover:text-foreground"
                title="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Playlist tabs */}
          <div className="flex gap-1 px-3 py-2 overflow-x-auto">
            {PLAYLISTS.map((p, i) => (
              <button
                key={p.id}
                onClick={() => setCurrent(i)}
                className={`text-[10px] font-medium px-2 py-1 rounded-md whitespace-nowrap transition-colors ${
                  current === i
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/50 text-muted-foreground hover:text-foreground"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* YouTube embed */}
          <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
            <iframe
              key={PLAYLISTS[current].id}
              src={`https://www.youtube.com/embed/${PLAYLISTS[current].id}?rel=0`}
              title={PLAYLISTS[current].label}
              allow="autoplay; encrypted-media"
              allowFullScreen
              className="absolute inset-0 w-full h-full"
            />
          </div>
        </div>
      )}
    </div>
  );
}
