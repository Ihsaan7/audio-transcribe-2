import type { VercelRequest, VercelResponse } from "@vercel/node";
import multer from "multer";

// This is the Vercel Serverless Function equivalent of
// `artifacts/api-server/src/routes/transcribe.ts` (the Express route used
// when this app runs on Replit). The two can't share a module because
// they're deployed as separate, independently-built services -- one is a
// long-running Express app, the other a single Vercel Node function with no
// dependency on the rest of the monorepo. If you change the Groq-forwarding
// logic here, mirror the change there too (and vice versa).

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB, above Groq's 25MB chunk limit
});

// Multer's middleware signature is (req, res, next) -- it only relies on
// Node's raw request/response primitives (headers, streaming body, etc.),
// which Vercel's Node.js runtime provides, so it works outside Express too.
// Vercel does not parse multipart/form-data bodies automatically, so `req`
// is still a readable stream when this runs.
function runMulterMiddleware(
  req: VercelRequest,
  res: VercelResponse,
): Promise<void> {
  return new Promise((resolve, reject) => {
    upload.single("file")(req as any, res as any, (err: unknown) => {
      if (err) reject(err);
      else resolve();
    });
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Transcription service is not configured." });
    return;
  }

  try {
    await runMulterMiddleware(req, res);
  } catch {
    res.status(400).json({ error: "Could not parse the uploaded file." });
    return;
  }

  const file = (req as any).file as
    | { buffer: Buffer; mimetype?: string; originalname?: string }
    | undefined;

  if (!file) {
    res.status(400).json({ error: "Missing audio file." });
    return;
  }

  try {
    const forwardForm = new FormData();
    forwardForm.append(
      "file",
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype || "audio/mp3" }),
      file.originalname || "audio.mp3",
    );
    forwardForm.append("model", "whisper-large-v3");
    forwardForm.append("language", "ur");
    forwardForm.append("response_format", "text");

    const groqRes = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",
      {
        method: "POST",
        headers: {
          Authorization: 'Bearer ' + apiKey,
        },
        body: forwardForm,
      },
    );

    if (!groqRes.ok) {
      const errorText = await groqRes.text();
      res
        .status(groqRes.status >= 400 && groqRes.status < 600 ? groqRes.status : 502)
        .json({ error: `Transcription failed: ${errorText}` });
      return;
    }

    const text = await groqRes.text();
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    res.status(200).send(text);
  } catch {
    res.status(502).json({ error: "Could not reach the transcription service." });
  }
}
