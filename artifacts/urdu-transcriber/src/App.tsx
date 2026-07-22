import { useState } from 'react';
import { Toaster } from '@/components/ui/toaster';
import Home from '@/pages/Home';
import TranscriptToPdf from '@/pages/TranscriptToPdf';
import { ThemeProvider } from '@/components/theme-provider';
import { useTheme } from 'next-themes';
import { FileAudio, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Tab = 'transcriber' | 'pdf';

function AppContent() {
  const { theme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('transcriber');

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground selection:bg-primary/30">
      {/* Sticky shared header */}
      <header className="sticky top-0 z-20 bg-background/80 backdrop-blur-sm border-b border-muted">
        <div className="max-w-3xl mx-auto px-4 py-2.5 flex items-center gap-3">
          {/* Logo + title */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="bg-primary/20 p-1.5 rounded-lg text-primary">
              <FileAudio className="w-5 h-5" />
            </div>
            <span className="font-bold text-foreground text-sm hidden md:block">
              Urdu Lecture Transcriber
            </span>
          </div>

          {/* Tab bar */}
          <div className="flex-1 flex justify-center">
            <div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('transcriber')}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-all',
                  activeTab === 'transcriber'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                Transcriber
              </button>
              <button
                onClick={() => setActiveTab('pdf')}
                className={cn(
                  'px-3 py-1.5 rounded-md text-sm font-medium transition-all whitespace-nowrap',
                  activeTab === 'pdf'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <span className="hidden sm:inline">Transcript to </span>PDF
              </button>
            </div>
          </div>

          {/* Theme toggle */}
          <Button
            variant="outline"
            size="icon"
            className="shrink-0 rounded-full"
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            aria-label="Theme tabdeel karein"
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </Button>
        </div>
      </header>

      {/* Both pages mounted so state is preserved when switching tabs */}
      <div className={activeTab === 'transcriber' ? '' : 'hidden'}>
        <Home />
      </div>
      <div className={activeTab === 'pdf' ? '' : 'hidden'}>
        <TranscriptToPdf />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider storageKey="theme">
      <AppContent />
      <Toaster />
    </ThemeProvider>
  );
}
