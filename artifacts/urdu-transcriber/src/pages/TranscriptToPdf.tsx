import { useState, useRef, useEffect } from "react";
import { Loader2, AlertCircle, FileDown, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

// ─── Types ───────────────────────────────────────────────────────────────────

type PdfStatus = "idle" | "sending" | "structuring" | "building" | "done" | "error";

interface Metadata {
  surah: string;
  para: string;
  lesson: string;
  ayaat: string;
  speaker: string;
  institute: string;
  topics: string;
}

interface GeminiResponse {
  cover_title: string;
  topics_summary: string[];
  sections: Section[];
  fawaid: string[];
  conclusion_dua: string;
}

interface Section {
  heading: string;
  blocks: Block[];
}

type Block =
  | { type: "body"; text: string }
  | { type: "quran"; arabic: string; ref: string; translation: string }
  | { type: "hadith"; arabic: string; ref: string; translation: string }
  | { type: "scholar"; name: string; text: string; arabic: string }
  | { type: "narrative"; label: string; text: string }
  | { type: "info"; label: string; text: string }
  | { type: "fiqh"; label: string; items: string[] }
  | { type: "caution"; label: string; text: string }
  | { type: "subheading"; text: string };

// ─── Constants ───────────────────────────────────────────────────────────────

const COVER_THEMES: [string, string][] = [
  ["#0a1f1a", "#0d3d30"],
  ["#080820", "#10205a"],
  ["#2a0a0a", "#6b1a20"],
  ["#1f1000", "#5a3208"],
  ["#1f0813", "#5c1230"],
  ["#0d141c", "#26384c"],
  ["#081a10", "#153524"],
];

const SYSTEM_PROMPT = `You are an Islamic tafseer lecture formatter. You will receive a raw Urdu speech-to-text transcript of a Quran tafseer lecture along with lesson metadata.

Your job: Clean up the transcript (fix speech-to-text errors, remove filler phrases, correct broken sentences without changing meaning) and structure the ENTIRE content into a JSON object matching the exact schema below. Do NOT summarize — include ALL points from the transcript in order.

Respond with valid JSON only. No markdown fences, no preamble, no explanation.

JSON SCHEMA:
{
  "cover_title": "short 2-line Urdu title describing the lesson's main themes",
  "topics_summary": ["short Urdu topic 1", "short Urdu topic 2"],
  "sections": [
    {
      "heading": "section heading in Urdu (main topic)",
      "blocks": [
        { "type": "body", "text": "explanation paragraph in clean Urdu" },
        { "type": "quran", "arabic": "Arabic ayah text with harakat", "ref": "Surah name: verse number (in Urdu)", "translation": "Urdu translation" },
        { "type": "hadith", "arabic": "Arabic hadith text", "ref": "source reference in Urdu", "translation": "Urdu translation" },
        { "type": "scholar", "name": "scholar name in Urdu", "text": "their statement in Urdu", "arabic": "optional Arabic text if present, else empty string" },
        { "type": "narrative", "label": "brief Urdu label", "text": "the story/incident in Urdu" },
        { "type": "info", "label": "brief Urdu label", "text": "the info in Urdu" },
        { "type": "fiqh", "label": "brief Urdu label", "items": ["item 1", "item 2"] },
        { "type": "caution", "label": "brief Urdu label", "text": "warning/caution text in Urdu" },
        { "type": "subheading", "text": "sub-heading text in Urdu" }
      ]
    }
  ],
  "fawaid": ["numbered benefit 1 in Urdu", "numbered benefit 2 in Urdu"],
  "conclusion_dua": "Arabic dua text if mentioned at end, else empty string"
}

RULES:
- Keep all Urdu text in proper Urdu script (Nastaliq-appropriate)
- Keep all Arabic text in proper Arabic script with harakat
- Do NOT translate Arabic to Urdu when the original is Arabic — preserve both
- Extract as many sections as exist in the transcript in the correct order
- Each section can have multiple blocks — use the block types that fit the content
- If the transcript mentions an ayah, always create a "quran" block with all 3 fields
- If the transcript mentions a hadith, always create a "hadith" block
- fiqh items and fawaid should be complete sentences, not fragments
- If a field's content doesn't exist, use empty string "" (never null)
- Response must be a single valid JSON object — no markdown, no code fences
- Never state a surah name that does not appear in the transcript. Use only the surah explicitly named in the source text. Do not infer or substitute surah names.`;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function escNl(s: string): string {
  return esc(s).replace(/\n/g, "<br>");
}

const URDU_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function toUrduNum(n: number): string {
  return String(n)
    .split("")
    .map((d) => URDU_DIGITS[+d] ?? d)
    .join("");
}
function parseUrduNum(s: string): number {
  const ascii = s.replace(/[۰-۹]/g, (d) =>
    String(d.charCodeAt(0) - 0x06f0),
  );
  return parseInt(ascii, 10) || 0;
}

function loadHtml2Pdf(): Promise<void> {
  return new Promise((resolve, reject) => {
    if ((window as any).html2pdf) { resolve(); return; }
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js";
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("html2pdf.js load nahi hua"));
    document.head.appendChild(s);
  });
}

// ─── PDF CSS ─────────────────────────────────────────────────────────────────

function buildPdfCss(scope = ""): string {
  const root = scope || "body";
  const p = scope ? `${scope} ` : "";
  return `
${root} {
  direction:rtl; background:#fdf6e3; color:#2c1a0e;
  font-family:'Noto Nastaliq Urdu',serif; font-size:15.5px; line-height:2.3;
}
${p}* { box-sizing:border-box; margin:0; padding:0; }
${p}.page { width:210mm; min-height:297mm; padding:18mm 16mm 16mm 16mm; page-break-after:always; position:relative; overflow:hidden; }
${p}.cover-page {
  display:flex; flex-direction:column; align-items:center; justify-content:center;
  text-align:center; padding:24mm 20mm; color:#fff;
}
${p}.cover-border { position:absolute; inset:18px; border:1.5px solid rgba(255,255,255,0.25); border-radius:4px; pointer-events:none; }
${p}.bismillah { font-family:'Amiri',serif; font-size:34px; color:#e8c875; margin-bottom:14px; }
${p}.cover-institute { font-size:15px; color:rgba(255,255,255,0.85); margin:6px 0; }
${p}.cover-course { font-size:13px; color:rgba(255,255,255,0.65); letter-spacing:0.03em; margin-bottom:18px; }
${p}.cover-para-badge { display:inline-block; background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.35); border-radius:20px; padding:4px 18px; font-size:14px; margin-bottom:16px; }
${p}.cover-lesson-label { font-size:14px; color:rgba(255,255,255,0.65); margin-bottom:4px; }
${p}.cover-lesson-num { font-family:'Amiri',serif; font-size:80px; line-height:1; color:#fff; font-weight:700; margin-bottom:8px; }
${p}.cover-ayaat { font-size:15px; color:rgba(255,255,255,0.75); margin-bottom:20px; }
${p}.cover-divider { width:60px; height:2px; background:rgba(255,255,255,0.35); margin:12px auto; border-radius:1px; }
${p}.cover-title { font-size:22px; font-weight:700; line-height:1.7; margin:10px 0 12px; }
${p}.cover-surah { font-size:26px; font-weight:700; margin-bottom:18px; color:#e8c875; }
${p}.cover-topics { list-style:none; text-align:right; font-size:14px; color:rgba(255,255,255,0.8); line-height:2; margin-bottom:24px; padding:0; }
${p}.cover-topics li::before { content:"• "; color:rgba(255,255,255,0.5); }
${p}.cover-speaker { margin-top:auto; text-align:center; font-size:15px; color:rgba(255,255,255,0.9); padding-bottom:2mm; }

${p}.content-header { border-bottom:2px solid #0d6b4a; padding-bottom:8px; margin-bottom:20px; display:flex; justify-content:space-between; align-items:center; font-size:13px; color:#555; }
${p}.content-header-left { font-weight:600; color:#2c1a0e; }
${p}.content-header-badge { background:#e8f5e9; border:1px solid #81c784; border-radius:12px; padding:2px 12px; font-size:12px; color:#2e7d32; }

${p}.section-wrapper { page-break-inside:avoid; margin-bottom:20px; }
${p}.section-heading { background:linear-gradient(to left,#d0f0e0,#b0e8d0,#d0f0e0); border-right:5px solid #0d6b4a; font-size:18.5px; font-weight:bold; padding:10px 16px; text-align:center; margin:0 0 10px; }

${p}.blk { padding:14px 16px; margin:14px 0; border-radius:5px; }
${p}.blk-body { font-size:15.5px; line-height:2.6; text-align:justify; }
${p}.blk-quran { background:linear-gradient(135deg,#e8f5e9,#c8e6c9); border:2px solid #81c784; border-right:6px solid #4caf50; }
${p}.blk-hadith { background:linear-gradient(135deg,#ede7f6,#d1c4e9); border:2px solid #9575cd; border-right:6px solid #7c4dff; }
${p}.blk-scholar { background:linear-gradient(135deg,#fff8e1,#ffecb3); border:2px solid #ffca28; border-right:6px solid #ff8f00; }
${p}.blk-narrative { background:linear-gradient(135deg,#fff3e0,#ffe0b2); border:2px solid #ffb74d; border-right:6px solid #e65100; }
${p}.blk-info { background:linear-gradient(135deg,#e0f7fa,#b2ebf2); border:2px solid #4dd0e1; border-right:6px solid #0097a7; }
${p}.blk-fiqh { background:linear-gradient(135deg,#f3e5f5,#e1bee7); border:2px solid #ce93d8; border-right:6px solid #8e24aa; }
${p}.blk-caution { background:linear-gradient(135deg,#fce4ec,#f8bbd9); border:2px solid #f48fb1; border-right:6px solid #c2185b; }
${p}.blk-subheading { font-weight:bold; font-size:16px; padding:8px 12px; border-right:4px solid #0d6b4a; margin:10px 0; }

${p}.ar { font-family:'Amiri',serif; font-size:20px; text-align:center; direction:rtl; margin:8px 0; line-height:1.9; }
${p}.ar-ref { font-style:italic; font-size:13px; text-align:center; color:#666; margin:4px 0 6px; }
${p}.blk-label { font-weight:bold; font-size:14px; margin-bottom:8px; color:#333; }
${p}.scholar-name { font-weight:bold; font-size:15px; margin-bottom:8px; color:#5d4037; }
${p}.fiqh-list { list-style:none; }
${p}.fiqh-list li { padding:5px 0; border-bottom:1px dotted #d1a8e0; }
${p}.fiqh-list li:last-child { border-bottom:none; }

${p}.fawaid-section { page-break-before:always; padding:18mm 16mm 16mm; }
${p}.fawaid-box { background:linear-gradient(135deg,#e3f2fd,#bbdefb); border:2px solid #64b5f6; border-right:6px solid #1565c0; padding:20px; border-radius:6px; margin-bottom:24px; }
${p}.fawaid-heading { font-size:20px; font-weight:bold; margin-bottom:16px; text-align:center; color:#0d47a1; }
${p}.fawaid-list { list-style:none; }
${p}.fawaid-list li { padding:7px 0; border-bottom:1px solid rgba(0,0,0,0.1); display:flex; gap:12px; align-items:baseline; line-height:2; }
${p}.fawaid-list li:last-child { border-bottom:none; }
${p}.fawaid-num { font-family:'Amiri',serif; font-size:20px; color:#1565c0; font-weight:bold; min-width:28px; flex-shrink:0; }

${p}.conclusion-box { padding:24px; border-radius:6px; text-align:center; }
${p}.conclusion-label { font-size:16px; font-weight:bold; color:rgba(255,255,255,0.8); margin-bottom:12px; }
${p}.conclusion-dua { font-family:'Amiri',serif; font-size:22px; line-height:2.2; direction:rtl; color:#fff; }
  `;
}

// ─── HTML builder ─────────────────────────────────────────────────────────────

function renderBlock(block: Block): string {
  switch (block.type) {
    case "body":
      return `<p class="blk blk-body">${escNl(block.text)}</p>`;
    case "quran":
      return `<div class="blk blk-quran">
        ${block.arabic ? `<div class="ar">${esc(block.arabic)}</div>` : ""}
        ${block.ref ? `<div class="ar-ref">${esc(block.ref)}</div>` : ""}
        ${block.translation ? `<div style="text-align:center;font-size:15px;margin-top:6px;">${escNl(block.translation)}</div>` : ""}
      </div>`;
    case "hadith":
      return `<div class="blk blk-hadith">
        ${block.arabic ? `<div class="ar">${esc(block.arabic)}</div>` : ""}
        ${block.ref ? `<div class="ar-ref">${esc(block.ref)}</div>` : ""}
        ${block.translation ? `<div style="text-align:center;font-size:15px;margin-top:6px;">${escNl(block.translation)}</div>` : ""}
      </div>`;
    case "scholar":
      return `<div class="blk blk-scholar">
        <div class="scholar-name">${esc(block.name)}</div>
        ${block.arabic ? `<div class="ar">${esc(block.arabic)}</div>` : ""}
        <div>${escNl(block.text)}</div>
      </div>`;
    case "narrative":
      return `<div class="blk blk-narrative">
        <div class="blk-label">${esc(block.label)}</div>
        <div>${escNl(block.text)}</div>
      </div>`;
    case "info":
      return `<div class="blk blk-info">
        <div class="blk-label">${esc(block.label)}</div>
        <div>${escNl(block.text)}</div>
      </div>`;
    case "fiqh":
      return `<div class="blk blk-fiqh">
        <div class="blk-label">${esc(block.label)}</div>
        <ul class="fiqh-list">${block.items.map((it) => `<li>${esc(it)}</li>`).join("")}</ul>
      </div>`;
    case "caution":
      return `<div class="blk blk-caution">
        <div class="blk-label">${esc(block.label)}</div>
        <div>${escNl(block.text)}</div>
      </div>`;
    case "subheading":
      return `<div class="blk-subheading">${esc(block.text)}</div>`;
    default:
      return "";
  }
}

function buildPdfBody(data: GeminiResponse, meta: Metadata, coverGradient: string): string {
  const topicsList = (
    data.topics_summary?.length
      ? data.topics_summary
      : meta.topics.split("\n").filter(Boolean)
  )
    .slice(0, 12)
    .map((t) => `<li>${esc(t)}</li>`)
    .join("");

  const headerBadge = [meta.para, `سبق ${esc(meta.lesson)}`].filter(Boolean).join(" — ");
  const headerLeft = [esc(meta.surah), esc(meta.para)].filter(Boolean).join(" — ");

  const sectionsHtml = (data.sections ?? [])
    .map(
      (sec) => `
      <div class="section-wrapper">
        <div class="section-heading">${esc(sec.heading)}</div>
        ${(sec.blocks ?? []).map(renderBlock).join("")}
      </div>`,
    )
    .join("");

  const fawaidItems = (data.fawaid ?? [])
    .map(
      (item, i) =>
        `<li><span class="fawaid-num">${toUrduNum(i + 1)}</span><span>${esc(item)}</span></li>`,
    )
    .join("");

  const conclusionHtml =
    data.conclusion_dua
      ? `<div class="conclusion-box" style="background:${coverGradient}">
          <div class="conclusion-label">اختتامی دعا</div>
          <div class="conclusion-dua">${esc(data.conclusion_dua)}</div>
        </div>`
      : "";

  return `
    <!-- Cover -->
    <div class="page cover-page" style="background:${coverGradient}">
      <div class="cover-border"></div>
      <div class="bismillah">بِسْمِ اللَّهِ الرَّحْمَنِ الرَّحِيمِ</div>
      <div class="cover-institute">${esc(meta.institute)}</div>
      <div class="cover-course">درسِ تفسیرِ قرآنِ کریم</div>
      ${meta.para ? `<div class="cover-para-badge">${esc(meta.para)}</div>` : ""}
      <div class="cover-lesson-label">سبق نمبر</div>
      <div class="cover-lesson-num">${esc(meta.lesson)}</div>
      ${meta.ayaat ? `<div class="cover-ayaat">آیات: ${esc(meta.ayaat)}</div>` : ""}
      <div class="cover-divider"></div>
      <div class="cover-title">${escNl(data.cover_title ?? "")}</div>
      <div class="cover-surah">${esc(meta.surah)}</div>
      ${topicsList ? `<ul class="cover-topics">${topicsList}</ul>` : ""}
      <div class="cover-speaker">${esc(meta.speaker)}</div>
    </div>

    <!-- Content sections -->
    <div style="padding:18mm 16mm 16mm;">
      <div class="content-header">
        <span class="content-header-left">${headerLeft}</span>
        <span class="content-header-badge">${headerBadge}</span>
      </div>
      ${sectionsHtml}
    </div>

    <!-- Fawaid -->
    <div class="fawaid-section">
      <div class="fawaid-box">
        <div class="fawaid-heading">فوائد و مستنبطات</div>
        <ul class="fawaid-list">${fawaidItems}</ul>
      </div>
      ${conclusionHtml}
    </div>
  `;
}

function buildFullHtml(data: GeminiResponse, meta: Metadata, gradient: string): string {
  return `<!DOCTYPE html>
<html dir="rtl" lang="ur">
<head>
<meta charset="UTF-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu:wght@400;700&family=Amiri:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
<style>${buildPdfCss()}</style>
</head>
<body>
${buildPdfBody(data, meta, gradient)}
</body>
</html>`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function TranscriptToPdf() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem("gemini_api_key") ?? "");
  const [model, setModel] = useState(() => localStorage.getItem("gemini_model") ?? "");
  const [availableModels, setAvailableModels] = useState<{ value: string; label: string }[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [modelsError, setModelsError] = useState("");
  const [meta, setMeta] = useState<Metadata>({
    surah: "سورۃ البقرہ",
    para: "تیسرا پارہ",
    lesson: "۱",
    ayaat: "",
    speaker: "مفتی فیض الرحمٰن سید",
    institute: "مرکز الفیصل اسلامک انسٹیٹیوٹ (رجسٹرڈ)",
    topics: "",
  });
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState<PdfStatus>("idle");
  const [statusMsg, setStatusMsg] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [rawError, setRawError] = useState("");
  const [generatedHtml, setGeneratedHtml] = useState("");

  const previewIframeRef = useRef<HTMLIFrameElement>(null);

  // Persist API key + model to localStorage
  useEffect(() => {
    if (apiKey) localStorage.setItem("gemini_api_key", apiKey);
  }, [apiKey]);
  useEffect(() => {
    if (model) localStorage.setItem("gemini_model", model);
  }, [model]);

  // Fetch available generateContent models whenever the API key changes
  useEffect(() => {
    if (!apiKey.trim()) { setAvailableModels([]); setModelsError(""); return; }
    const controller = new AbortController();
    (async () => {
      setModelsLoading(true);
      setModelsError("");
      try {
        const url = new URL("https://generativelanguage.googleapis.com/v1beta/models");
        url.searchParams.set("key", apiKey.trim());
        url.searchParams.set("pageSize", "100");
        const res = await fetch(url.toString(), { signal: controller.signal });
        if (!res.ok) { setModelsError("Models load nahi ho sake — API key check karein"); setModelsLoading(false); return; }
        const data = await res.json() as { models?: { name: string; displayName: string; supportedGenerationMethods?: string[] }[] };
        const flash = (data.models ?? [])
          .filter(m => (m.supportedGenerationMethods ?? []).includes("generateContent") && m.name.includes("flash"))
          .map(m => ({ value: m.name.replace("models/", ""), label: m.displayName ?? m.name.replace("models/", "") }))
          .sort((a, b) => b.value.localeCompare(a.value));
        setAvailableModels(flash);
        // Auto-select: saved model if still available, else first in list
        setModel(prev => {
          const saved = localStorage.getItem("gemini_model") ?? "";
          const stillAvailable = flash.some(m => m.value === saved);
          return (stillAvailable ? saved : flash[0]?.value) ?? prev;
        });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setModelsError("Models load nahi ho sake");
      } finally {
        setModelsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [apiKey]);

  // Push generated HTML into the iframe via ref (avoids srcdoc React re-render issues)
  useEffect(() => {
    if (previewIframeRef.current && generatedHtml) {
      previewIframeRef.current.srcdoc = generatedHtml;
    }
  }, [generatedHtml]);

  function setMf(field: keyof Metadata, value: string) {
    setMeta((m) => ({ ...m, [field]: value }));
  }

  async function generate() {
    if (!apiKey.trim()) {
      setStatus("error");
      setErrorMsg("Pehle Gemini API key enter karein.");
      return;
    }
    if (!transcript.trim()) {
      setStatus("error");
      setErrorMsg("Transcript khali hai.");
      return;
    }

    setStatus("sending");
    setStatusMsg("Gemini ko bhaij raha hai...");
    setErrorMsg("");
    setRawError("");
    setGeneratedHtml("");

    const userMsg = `LESSON METADATA:
- Surah: ${meta.surah}
- Para: ${meta.para}
- Lesson: ${meta.lesson}
- Ayaat: ${meta.ayaat}
- Speaker: ${meta.speaker}
- Institute: ${meta.institute}
- Provided topics list: ${meta.topics}

TRANSCRIPT:
${transcript}`;

    let rawText = "";
    try {
      const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`);
      url.searchParams.set("key", apiKey.trim());

      const res = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ role: "user", parts: [{ text: userMsg }] }],
          generationConfig: {
            responseMimeType: "application/json",
            maxOutputTokens: 65536,   // ensure full transcript is covered, not just part 1
          },
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg: string = errData?.error?.message ?? res.statusText;
        const status = res.status;
        // 404 → model name wrong or retired
        if (status === 404) {
          throw new Error(`Model unavailable or retired — check the model name in the dropdown. Google error: ${msg}`);
        }
        // 429 with limit:0 → model retired / project has zero quota
        if (status === 429 && msg.includes("limit: 0")) {
          throw new Error(`Model unavailable or retired — check the model name in the dropdown. Google error: ${msg}`);
        }
        throw new Error(`Gemini error ${status}: ${msg}`);
      }

      const json = await res.json();
      rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";

      setStatus("structuring");
      setStatusMsg("Content structure kar raha hai...");
    } catch (err) {
      if ((err as Error).message?.includes("fetch")) {
        setStatus("error");
        setErrorMsg("Network problem — internet connection check karein");
      } else {
        setStatus("error");
        setErrorMsg((err as Error).message || "Koi error aa gaya");
      }
      return;
    }

    // Parse JSON
    let parsed: GeminiResponse;
    try {
      // Strip optional markdown code-fence wrapper
      const stripped = rawText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```\s*$/i, "")
        .trim();

      // Extract the first balanced {...} block — Gemini sometimes appends
      // stray text or duplicate fragments after the closing brace.
      const extractJson = (s: string): string => {
        const start = s.indexOf("{");
        if (start === -1) return s;
        let depth = 0;
        let inStr = false;
        let escape = false;
        for (let i = start; i < s.length; i++) {
          const ch = s[i];
          if (escape) { escape = false; continue; }
          if (ch === "\\" && inStr) { escape = true; continue; }
          if (ch === '"') { inStr = !inStr; continue; }
          if (inStr) continue;
          if (ch === "{") depth++;
          else if (ch === "}") { depth--; if (depth === 0) return s.slice(start, i + 1); }
        }
        return s; // fallback: return as-is and let JSON.parse surface the real error
      };

      parsed = JSON.parse(extractJson(stripped)) as GeminiResponse;
    } catch {
      setStatus("error");
      setErrorMsg("Gemini ne invalid response bheja — dobara try karein");
      setRawError(rawText);
      return;
    }

    // Build HTML
    setStatusMsg("PDF bana raha hai...");
    const lessonNum = parseUrduNum(meta.lesson);
    const [from, to] = COVER_THEMES[lessonNum % COVER_THEMES.length];
    const gradient = `linear-gradient(135deg, ${from}, ${to})`;

    const html = buildFullHtml(parsed, meta, gradient);
    setGeneratedHtml(html);
    setStatus("done");
    setStatusMsg("Tayaar! ✓");
  }

  async function downloadPdf() {
    if (!generatedHtml) return;

    setStatus("building");
    setStatusMsg("PDF bana raha hai...");

    const CONTAINER_ID = "pdf-dl-container";
    let container: HTMLDivElement | null = null;

    try {
      await loadHtml2Pdf();

      // Parse the self-contained HTML to extract body content + fonts link
      const parser = new DOMParser();
      const doc = parser.parseFromString(generatedHtml, "text/html");

      // Inject Google Fonts into main doc so html2canvas can find them
      doc.querySelectorAll('link[rel="stylesheet"]').forEach((el) => {
        const href = (el as HTMLLinkElement).href;
        if (!document.querySelector(`link[href="${href}"]`)) {
          const link = document.createElement("link");
          link.rel = "stylesheet";
          link.href = href;
          document.head.appendChild(link);
        }
      });

      // Inject scoped PDF styles (scoped to container ID, won't leak into main app)
      const styleId = "pdf-dl-styles";
      if (!document.getElementById(styleId)) {
        const style = document.createElement("style");
        style.id = styleId;
        style.textContent = buildPdfCss(`#${CONTAINER_ID}`);
        document.head.appendChild(style);
      }

      // Create render container — position:fixed so html2canvas sees real layout;
      // z-index:-9999 keeps it behind the UI; opacity stays at 1 so canvas renders correctly
      container = document.createElement("div");
      container.id = CONTAINER_ID;
      container.style.cssText =
        "position:fixed;top:0;left:0;width:794px;z-index:-9999;pointer-events:none;";
      container.innerHTML = doc.body.innerHTML;
      document.body.appendChild(container);

      // Wait for fonts to download
      await new Promise((r) => setTimeout(r, 2500));
      await document.fonts.ready;

      const surahShort = meta.surah.split(" ")[0] ?? "Surah";
      const filename = `Sabaq_${meta.lesson}_${surahShort}.pdf`;

      await (window as any)
        .html2pdf()
        .set({
          margin: 0,
          filename,
          image: { type: "jpeg", quality: 0.95 },
          html2canvas: {
            scale: 2,
            useCORS: true,
            letterRendering: true,
            logging: false,
          },
          jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
          pagebreak: { mode: ["css", "legacy"] },
        })
        .from(container)
        .save();

      setStatus("done");
      setStatusMsg("PDF download ho gaya ✓");
    } catch (err) {
      setStatus("error");
      setErrorMsg(`PDF download mein masla: ${(err as Error).message}`);
    } finally {
      if (container && document.body.contains(container)) {
        document.body.removeChild(container);
      }
    }
  }

  const isLoading = status === "sending" || status === "structuring" || status === "building";

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-6">

      {/* API Key */}
      <Card className="border-muted bg-card/50">
        <div className="bg-muted/30 border-b border-muted px-6 py-3 flex items-center gap-3">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">1</span>
          <h2 className="font-semibold text-foreground">Gemini API Key</h2>
        </div>
        <CardContent className="p-6 flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">API Key</Label>
            <Input
              type="password"
              placeholder="AIza..."
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Google AI Studio se banayein —{" "}
              <a
                href="https://aistudio.google.com/apikey"
                target="_blank"
                rel="noreferrer"
                className="underline text-primary"
              >
                aistudio.google.com/apikey
              </a>
              . Har project ka alag quota hota hai — agar limit aaye to naya project banayein aur us project mein nayi key generate karein.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              Model
              {modelsLoading && <span className="ml-2 text-muted-foreground/60">— load ho raha hai...</span>}
              {!modelsLoading && availableModels.length > 0 && (
                <span className="ml-2 text-green-500">— {availableModels.length} models mile</span>
              )}
            </Label>
            {modelsError && (
              <p className="text-xs text-destructive">{modelsError}</p>
            )}
            {availableModels.length > 0 ? (
              <select
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus:outline-none focus:ring-1 focus:ring-ring text-foreground"
              >
                {availableModels.map((m) => (
                  <option key={m.value} value={m.value}>{m.label}</option>
                ))}
              </select>
            ) : (
              <div className="flex h-9 w-full items-center rounded-md border border-input bg-muted/30 px-3 text-sm text-muted-foreground">
                {apiKey.trim() ? (modelsLoading ? "Models fetch ho rahe hain..." : "Koi model nahi mila") : "Pehle API key enter karein"}
              </div>
            )}
            <p className="text-xs text-muted-foreground leading-relaxed">
              Yeh list aapki key se real-time fetch hoti hai — sirf woh models dikhte hain jo aapke account mein kaam karte hain.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Metadata */}
      <Card className="border-muted bg-card/50">
        <div className="bg-muted/30 border-b border-muted px-6 py-3 flex items-center gap-3">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">2</span>
          <h2 className="font-semibold text-foreground">Sabaq ki Maloomat (Cover ke liye)</h2>
        </div>
        <CardContent className="p-6 flex flex-col gap-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {(
              [
                { label: "Surah", field: "surah" },
                { label: "Para (Urdu mein)", field: "para" },
                { label: "Sabaq Nambur", field: "lesson" },
                { label: "Ayaat Range", field: "ayaat" },
                { label: "Ustaad ka naam", field: "speaker" },
              ] as { label: string; field: keyof Metadata }[]
            ).map(({ label, field }) => (
              <div key={field} className="flex flex-col gap-1.5">
                <Label className="text-xs text-muted-foreground">{label}</Label>
                <Input
                  dir="rtl"
                  className="font-urdu text-right"
                  value={meta[field]}
                  onChange={(e) => setMf(field, e.target.value)}
                />
              </div>
            ))}
            <div className="flex flex-col gap-1.5 col-span-2 sm:col-span-3">
              <Label className="text-xs text-muted-foreground">Institute ka naam</Label>
              <Input
                dir="rtl"
                className="font-urdu text-right"
                value={meta.institute}
                onChange={(e) => setMf("institute", e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs text-muted-foreground">
              Mauzoaat (Topics) — ek topic per line
            </Label>
            <Textarea
              dir="rtl"
              className="font-urdu text-right min-h-[90px] resize-y"
              placeholder={"• پہلا موضوع\n• دوسرا موضوع"}
              value={meta.topics}
              onChange={(e) => setMf("topics", e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Transcript */}
      <Card className="border-muted bg-card/50">
        <div className="bg-muted/30 border-b border-muted px-6 py-3 flex items-center gap-3">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">3</span>
          <h2 className="font-semibold text-foreground">Transcript paste karein</h2>
        </div>
        <CardContent className="p-0">
          <Textarea
            dir="rtl"
            className="font-urdu min-h-[260px] w-full resize-y rounded-none border-0 bg-transparent p-6 text-lg leading-relaxed focus-visible:ring-0 text-right"
            placeholder="یہاں transcript paste کریں..."
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
          />
        </CardContent>
      </Card>

      {/* Generate button */}
      <Button
        size="lg"
        className="w-full h-14 text-lg rounded-xl"
        onClick={generate}
        disabled={isLoading}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            {statusMsg}
          </>
        ) : (
          <>
            <Sparkles className="w-5 h-5 mr-2" />
            PDF Generate Karein
          </>
        )}
      </Button>

      {/* Status */}
      {status === "done" && !errorMsg && (
        <div className="flex items-center gap-2 text-primary font-medium">
          <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs">✓</span>
          {statusMsg}
        </div>
      )}

      {/* Error */}
      {status === "error" && (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive-foreground p-4 rounded-lg flex flex-col gap-2 text-sm">
          <strong className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" /> Error
          </strong>
          <p>{errorMsg}</p>
          {rawError && (
            <div className="mt-2">
              <p className="text-xs text-muted-foreground mb-1">Gemini raw response (debugging ke liye):</p>
              <div className="max-h-48 overflow-y-auto bg-muted/30 rounded p-3 text-xs font-mono whitespace-pre-wrap break-all">
                {rawError}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preview + Download */}
      {generatedHtml && (
        <Card className="border-muted bg-card/50 overflow-hidden shadow-lg border-t-2 border-t-primary">
          <div className="bg-muted/30 border-b border-muted px-6 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="flex items-center justify-center w-6 h-6 rounded-full bg-primary text-primary-foreground text-sm font-medium">4</span>
              <h2 className="font-semibold text-foreground">Preview</h2>
            </div>
            <Button
              variant="default"
              size="sm"
              onClick={downloadPdf}
              disabled={status === "building"}
            >
              {status === "building" ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Bana raha hai...</>
              ) : (
                <><FileDown className="w-4 h-4 mr-2" /> PDF Download Karein</>
              )}
            </Button>
          </div>
          <CardContent className="p-0">
            <iframe
              ref={previewIframeRef}
              title="PDF Preview"
              className="w-full border-0 bg-white"
              style={{ height: "680px" }}
            />
          </CardContent>
        </Card>
      )}

    </div>
  );
}
