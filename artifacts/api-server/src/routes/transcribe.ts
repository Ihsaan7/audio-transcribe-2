import { Router, type IRouter, type Request, type Response } from "express";
import * as multer from "multer";
import { logger } from "../lib/logger";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB, above Groq's 25MB chunk limit
});

const router: IRouter = Router();

router.post(
  "/transcribe",
  upload.single("file"),
  async (req: Request, res: Response): Promise<void> => {
    const apiKey = process.env["GROQ_API_KEY"];
    if (!apiKey) {
      logger.error("GROQ_API_KEY is not configured on the server");
      res.status(500).json({ error: "Transcription service is not configured." });
      return;
    }

    const file = req.file;
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
            Authorization: `Bearer ${apiKey}`,
          },
          body: forwardForm,
        },
      );

      if (!groqRes.ok) {
        const errorText = await groqRes.text();
        req.log.warn(
          { status: groqRes.status, errorText },
          "Groq transcription request failed",
        );
        res
          .status(groqRes.status >= 400 && groqRes.status < 600 ? groqRes.status : 502)
          .json({ error: `Transcription failed: ${errorText}` });
        return;
      }

      const text = await groqRes.text();
      res.type("text/plain").send(text);
    } catch (err) {
      req.log.error({ err }, "Error proxying transcription request to Groq");
      res.status(502).json({ error: "Could not reach the transcription service." });
    }
  },
);

export default router;
