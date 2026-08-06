import express from "express";
import jwt from "jsonwebtoken";
import { chatFlow } from "./flow.js";
import { runWithAuthToken } from "./authContext.js";
import { closeMcpClient } from "./mcpClient.js";

const SECRET_KEY = process.env.DJANGO_SECRET_KEY || "";
const MAX_MESSAGE_LENGTH = 2000;
const app = express();
app.use(express.json());

function authError(res, message) {
  return res.status(401).json({ error: { code: "UNAUTHORIZED", message } });
}

function verifyToken(req, res, next) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return authError(res, "Bearer 토큰이 필요합니다.");
  }
  const token = header.slice("Bearer ".length);
  try {
    jwt.verify(token, SECRET_KEY, { algorithms: ["HS256"] });
  } catch {
    return authError(res, "유효하지 않은 토큰입니다.");
  }
  req.rawToken = token;
  next();
}

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.post("/ai/chat", verifyToken, async (req, res) => {
  const message = typeof req.body?.message === "string" ? req.body.message.trim() : "";
  if (!message || message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({
      error: {
        code: "INVALID_MESSAGE",
        message: `message는 1자 이상 ${MAX_MESSAGE_LENGTH}자 이하여야 합니다.`,
      },
    });
  }

  try {
    const result = await runWithAuthToken(req.rawToken, () => chatFlow({ message }));
    return res.json({ answer: result.answer });
  } catch {
    console.error("chatFlow 실행 실패");
    return res.status(502).json({
      error: {
        code: "CHATBOT_UPSTREAM_ERROR",
        message: "답변을 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.",
      },
    });
  }
});

const PORT = process.env.PORT || 8002;
const httpServer = app.listen(PORT, () => console.log(`genkit-service listening on :${PORT}`));

async function shutdown() {
  await closeMcpClient();
  httpServer.close(() => process.exit(0));
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
