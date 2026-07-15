import { useState, useRef, useEffect } from "react";
import { Upload, FileAudio, Check, Copy, Download, Play, Key, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Card, CardContent } from "@/components/ui/card";
import { getAudioDuration, processAndTranscribe } from "@/lib/audioPipeline";
import { useToast } from "@/components/ui/use-toast";

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [estimatedChunks, setEstimatedChunks] = useState<number | null>(null);
  const [duration, setDuration] = useState<number | null>(null);
  
  const [status, setStatus] = useState<"idle" | "processing" | "done" | "error">("idle");
  const [progressMsg, setProgressMsg] = useState("");
  const [progressPercent, setProgressPercent] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  useEffect(() => {
    const stored = localStorage.getItem("groq_api_key");
    if (stored) setApiKey(stored);
  }, []);

  const handleKeyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setApiKey(e.target.value);
    localStorage.setItem("groq_api_key", e.target.value);
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const handleFile = async (selectedFile: File) => {
    if (!selectedFile) return;
    const allowed = ["audio/ogg", "audio/mpeg", "audio/mp3", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/webm", "audio/aac", "audio/opus"];
    const ext = selectedFile.name.split('.').pop()?.toLowerCase();
    const allowedExts = ['ogg', 'mp3', 'm4a', 'wav', 'opus', 'aac'];
    
    if (!allowed.includes(selectedFile.type) && !allowedExts.includes(ext || '')) {
      toast({
        title: "File type support nahi karta",
        description: "Barae meherbani .mp3, .wav, .m4a, ya .ogg upload karein.",
        variant: "destructive"
      });
      return;
    }
    
    setFile(selectedFile);
    setEstimatedChunks(null);
    setDuration(null);
    setStatus("idle");
    setTranscript("");
    
    const d = await getAudioDuration(selectedFile);
    setDuration(d);
    if (d > 0) {
      setEstimatedChunks(Math.ceil(d / 600)); // 10 min chunks
    } else {
      setEstimatedChunks(1);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFile(e.dataTransfer.files[0]);
    }
  };

  const startTranscription = async () => {
    if (!apiKey) {
      toast({
        title: "API Key zaruri hai",
        description: "Shuru karne se pehle apni Groq API key darj karein.",
        variant: "destructive"
      });
      return;
    }
    if (!file) return;

    setStatus("processing");
    setErrorMsg("");
    setTranscript("");
    setProgressPercent(0);

    let failed = false;

    await processAndTranscribe(
      file,
      apiKey,
      (msg, pct) => {
        setProgressMsg(msg);
        setProgressPercent(pct);
      },
      (currentTranscript) => {
        setTranscript(currentTranscript);
      },
      (err) => {
        failed = true;
        setStatus("error");
        setErrorMsg(err);
      }
    );

    if (!failed) {
      setStatus("done");
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(transcript);
    toast({
      title: "Copy ho gaya!",
      description: "Transcript clipboard mein mehfooz kar li gayi hai.",
    });
  };

  const downloadTxt = () => {
    const baseName = file?.name.replace(/\.[^/.]+$/, "") || "audio";
    const filename = `${baseName}_transcript.txt`;
    const blob = new Blob([transcript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const formatSize = (bytes: number) => {
    return (bytes / (1024 * 1024)).toFixed(2) + " MB";
  };
  
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}m ${s}s`;
  };

  return (
    <div className="min-h-[100dvh] w-full bg-background text-foreground selection:bg-primary/30">
      <div className="max-w-3xl mx-auto px-4 py-12 flex flex-col gap-8">
        
        <header className="flex flex-col gap-3">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-white flex items-center gap-3">
            <div className="bg-primary/20 p-2 rounded-lg text-primary">
              <FileAudio className="w-8 h-8" />
            </div>
            Urdu Lecture Transcriber
          </h1>
          <p className="text-muted-foreground text-lg leading-relaxed">
            Lambe audio bayanaat aur lectures ko baghair kisi rukaawat ke transcribe karein. Yeh app directly aapke browser mein chalti hai, isliye file ka size koi masla nahi.
          </p>
        </header>

        {/* Step 1: API Key */}
        <Card className="border-muted bg-card/50 overflow-hidden">
          <div className="bg-muted/30 border-b border-muted px-6 py-3 flex items-center gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">1</span>
            <h2 className="font-semibold text-white">Groq API Key</h2>
          </div>
          <CardContent className="p-6">
            <div className="relative max-w-md">
              <Key className="absolute left-3 top-2.5 h-5 w-5 text-muted-foreground" />
              <Input 
                type="password" 
                placeholder="gsk_..." 
                className="pl-10 font-mono"
                value={apiKey}
                onChange={handleKeyChange}
              />
            </div>
            <p className="text-sm text-muted-foreground mt-3">
              Yeh key sirf aapke browser (localStorage) mein mehfooz rehti hai aur directly Groq ke servers se baat karti hai.
            </p>
          </CardContent>
        </Card>

        {/* Step 2: Audio Upload */}
        <Card className={`border-muted bg-card/50 overflow-hidden transition-colors ${!apiKey ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="bg-muted/30 border-b border-muted px-6 py-3 flex items-center gap-3">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">2</span>
            <h2 className="font-semibold text-white">Audio File Muntekhib Karein</h2>
          </div>
          <CardContent className="p-6">
            {!file ? (
              <div 
                className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center gap-4 text-center cursor-pointer transition-colors ${
                  isDragging ? 'border-primary bg-primary/5' : 'border-muted-foreground/30 hover:border-primary/50 hover:bg-muted/20'
                }`}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <div className="bg-muted p-4 rounded-full">
                  <Upload className="w-8 h-8 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-base font-medium text-white mb-1">Click karein ya file yahan drag karein</p>
                  <p className="text-sm text-muted-foreground">.mp3, .ogg, .m4a, .wav (size ki koi limit nahi)</p>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  className="hidden" 
                  accept="audio/*,.m4a,.opus"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between bg-muted/40 rounded-lg p-4 border border-muted">
                  <div className="flex items-center gap-4">
                    <div className="bg-primary/20 text-primary p-3 rounded-md">
                      <FileAudio className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="font-medium text-white truncate max-w-[200px] sm:max-w-xs">{file.name}</p>
                      <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5">
                        <span>{formatSize(file.size)}</span>
                        {duration !== null && (
                          <>
                            <span className="w-1 h-1 bg-muted-foreground rounded-full"></span>
                            <span>{formatTime(duration)}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <Button variant="ghost" size="sm" onClick={() => setFile(null)}>Tabdeel karein</Button>
                </div>
                
                {estimatedChunks !== null && (
                  <div className="text-sm text-muted-foreground flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-primary" />
                    Yeh file takreeban <strong className="text-white">{estimatedChunks} hisson</strong> mein taqseem ho kar process hogi, taake browser hang na ho.
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Step 3: Action */}
        <div className={`transition-opacity ${!file ? 'opacity-50 pointer-events-none' : ''}`}>
          <div className="flex flex-col items-center justify-center gap-4 py-4">
            {status === "idle" && (
              <Button size="lg" className="w-full md:w-auto md:min-w-[240px] text-lg h-14 rounded-xl" onClick={startTranscription}>
                <Play className="w-5 h-5 mr-2" />
                Transcription Shuru Karein
              </Button>
            )}

            {status === "processing" && (
              <div className="w-full max-w-md flex flex-col gap-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-primary animate-pulse flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {progressMsg}
                  </span>
                  <span className="text-muted-foreground">{Math.round(progressPercent)}%</span>
                </div>
                <Progress value={progressPercent} className="h-2" />
              </div>
            )}

            {status === "error" && (
              <div className="w-full bg-destructive/10 border border-destructive/20 text-destructive-foreground p-4 rounded-lg flex flex-col gap-2 text-sm">
                <strong className="flex items-center gap-2"><AlertCircle className="w-4 h-4"/> Error aa gaya</strong>
                <p>{errorMsg}</p>
                <Button variant="outline" size="sm" className="w-fit mt-2" onClick={startTranscription}>
                  Dobara Koshish Karein
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Step 4: Output */}
        {(transcript || status === "processing") && (
           <Card className="border-muted bg-card/50 overflow-hidden shadow-lg border-t-2 border-t-primary">
            <div className="bg-muted/30 border-b border-muted px-6 py-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">4</span>
                <h2 className="font-semibold text-white">Nateeja (Transcript)</h2>
              </div>
              
              {status === "done" && (
                <div className="flex items-center gap-2">
                  <Button variant="secondary" size="sm" onClick={copyToClipboard}>
                    <Copy className="w-4 h-4 mr-2" /> Copy
                  </Button>
                  <Button variant="default" size="sm" onClick={downloadTxt}>
                    <Download className="w-4 h-4 mr-2" /> Download .txt
                  </Button>
                </div>
              )}
            </div>
            <CardContent className="p-0">
              <div className="relative">
                <Textarea 
                  readOnly
                  value={transcript}
                  placeholder="Transcript yahan namoodar hogi..."
                  className="min-h-[400px] w-full resize-y rounded-none border-0 bg-transparent p-6 text-lg md:text-xl leading-relaxed focus-visible:ring-0 font-urdu"
                  dir="rtl"
                />
                {status === "processing" && (
                  <div className="absolute inset-0 bg-background/50 flex flex-col items-center justify-center backdrop-blur-[2px] transition-opacity">
                     {!transcript && (
                        <div className="flex flex-col items-center gap-4">
                          <Loader2 className="w-8 h-8 animate-spin text-primary" />
                          <p className="text-muted-foreground font-medium">Pehla hissa tayyar ho raha hai...</p>
                        </div>
                     )}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}
        
      </div>
    </div>
  );
}
