import { loadLameJS } from "./lamejs";

// At 64kbps mono the encoder produces ~8KB/sec (~480KB/min), so a 20 minute
// chunk is ~9.6MB -- comfortably under Groq's 25MB per-file limit with a
// large safety margin. Files at or under this length are sent as a single
// chunk instead of being split unnecessarily.
const MAX_CHUNK_DURATION_SEC = 20 * 60;

/**
 * Picks a chunk duration based on the total audio length: short files are
 * sent as one chunk, longer files are split into ~20 minute chunks so fewer,
 * larger requests are made instead of many small ones, while staying safely
 * under Groq's size limit.
 */
export function getChunkDurationSec(totalDurationSec: number): number {
  if (totalDurationSec <= MAX_CHUNK_DURATION_SEC) {
    return totalDurationSec;
  }
  return MAX_CHUNK_DURATION_SEC;
}

export function getEstimatedChunkCount(totalDurationSec: number): number {
  if (totalDurationSec <= 0) return 1;
  const chunkDuration = getChunkDurationSec(totalDurationSec);
  return Math.max(1, Math.ceil(totalDurationSec / chunkDuration));
}

export async function processAndTranscribe(
  file: File,
  onProgress: (message: string, percent: number) => void,
  onComplete: (transcript: string) => void,
  onError: (error: string) => void
) {
  try {
    onProgress("Audio file load ho rahi hai...", 2);
    const arrayBuffer = await file.arrayBuffer();

    onProgress("Audio decode ho rahi hai, thoda intezar karein...", 5);
    let audioContext: AudioContext;
    try {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    } catch(e) {
      audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }

    let audioBuffer: AudioBuffer;
    try {
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    } catch (err) {
      throw new Error("Audio decode nahi ho saki. Yeh format support nahi karta ya file corrupt hai.");
    }

    onProgress("Audio process aur downsample ho rahi hai...", 10);
    const offlineCtx = new OfflineAudioContext(1, audioBuffer.duration * 16000, 16000);
    const source = offlineCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineCtx.destination);
    source.start();
    
    const renderedBuffer = await offlineCtx.startRendering();
    const channelData = renderedBuffer.getChannelData(0); 
    
    const int16Data = new Int16Array(channelData.length);
    for (let i = 0; i < channelData.length; i++) {
      const s = Math.max(-1, Math.min(1, channelData[i]));
      int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    onProgress("MP3 encoder load ho raha hai...", 15);
    const lamejs = await loadLameJS();

    const chunks: Blob[] = [];
    const SAMPLE_RATE = 16000;
    const CHUNK_DURATION_SEC = getChunkDurationSec(audioBuffer.duration);
    const SAMPLES_PER_CHUNK = SAMPLE_RATE * CHUNK_DURATION_SEC;
    const totalChunks = Math.ceil(int16Data.length / SAMPLES_PER_CHUNK);
    
    for (let c = 0; c < totalChunks; c++) {
      onProgress(`Hissa ${c + 1} / ${totalChunks} MP3 mein convert ho raha hai...`, 15 + (c/totalChunks)*20);
      
      const mp3encoder = new lamejs.Mp3Encoder(1, SAMPLE_RATE, 64);
      const chunkStart = c * SAMPLES_PER_CHUNK;
      const chunkEnd = Math.min(chunkStart + SAMPLES_PER_CHUNK, int16Data.length);
      const chunkData = int16Data.subarray(chunkStart, chunkEnd);
      
      const mp3Data = [];
      const sampleBlockSize = 1152; 
      let blockCount = 0;
      for (let i = 0; i < chunkData.length; i += sampleBlockSize) {
        const sampleChunk = chunkData.subarray(i, i + sampleBlockSize);
        const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
        if (mp3buf.length > 0) {
          mp3Data.push(new Int8Array(mp3buf));
        }
        blockCount++;
        // Yield to event loop occasionally to keep UI responsive
        if (blockCount % 500 === 0) {
          await new Promise(r => setTimeout(r, 0));
        }
      }
      const mp3buf = mp3encoder.flush();
      if (mp3buf.length > 0) {
        mp3Data.push(new Int8Array(mp3buf));
      }
      
      chunks.push(new Blob(mp3Data, { type: 'audio/mp3' }));
    }

    let finalTranscript = "";
    
    for (let i = 0; i < chunks.length; i++) {
      const percent = 35 + (i/chunks.length)*65;
      onProgress(`Hissa ${i + 1} / ${chunks.length} transcribing...`, percent);
      
      const chunkBlob = chunks[i];
      let chunkText = "";
      let attempts = 0;
      let success = false;
      
      while (attempts < 3 && !success) {
        try {
          if (attempts > 0) {
             onProgress(`Hissa ${i + 1} dobara koshish ki ja rahi hai (${attempts}/2)...`, percent);
          }
          
          const formData = new FormData();
          formData.append("file", chunkBlob, "audio.mp3");
          
          const res = await fetch("/api/transcribe", {
            method: "POST",
            body: formData
          });
          
          if (!res.ok) {
            const errorText = await res.text();
            throw new Error(`API Error: ${res.status} - ${errorText}`);
          }
          
          chunkText = await res.text();
          success = true;
        } catch (err) {
          attempts++;
          if (attempts >= 3) {
            chunkText = "[Yeh hissa transcribe nahi ho saka. Error aaya.]";
          } else {
            await new Promise(r => setTimeout(r, 2000 * attempts));
          }
        }
      }
      
      if (finalTranscript !== "") {
        finalTranscript += "\n\n";
      }
      finalTranscript += `--- حصہ ${i + 1} ---\n${chunkText.trim()}`;
      onComplete(finalTranscript);
    }
    
    onProgress("Mukammal ho gaya!", 100);

  } catch (err: any) {
    onError(err.message || "Ek namaloom error pesh aaya.");
  }
}

export function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const url = URL.createObjectURL(file);
    audio.addEventListener("loadedmetadata", () => {
      resolve(audio.duration);
      URL.revokeObjectURL(url);
    });
    audio.addEventListener("error", () => {
      resolve(0);
      URL.revokeObjectURL(url);
    });
    audio.src = url;
  });
}
