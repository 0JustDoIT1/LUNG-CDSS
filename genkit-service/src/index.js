import express from "express";
import jwt from "jsonwebtoken";
import { chatFlow } from "./flow.js";

const SECRET_KEY = process.env.DJANGO_SECRET_KEY || "";
const app = express();
app.use(express.json());

function verifyToken(req, res, next) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Bearer 토큰이 필요합니다" });
  }
  const token = header.slice("Bearer ".length);
  try {
    jwt.verify(token, SECRET_KEY, { algorithms: ["HS256"] });
  } catch (e) {
    return res.status(401).json({ error: "유효하지 않은 토큰입니다" });
  }
  req.rawToken = token; // MCP tool 호출 시 그대로 전달 (Django가 여기서 사용자 강제바인딩)
  next();
}

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.post("/ai/chat", verifyToken, async (req, res) => {
  const message = (req.body?.message || "").trim();
  if (!message) {
    return res.status(400).json({ error: "message는 필수입니다" });
  }

  try {
    const result = await chatFlow({ message, authToken: req.rawToken });
    res.json({ answer: result.answer });
  } catch (e) {
    console.error("chatFlow 실행 실패:", e);
    res.status(502).json({ error: "챗봇 응답 생성에 실패했습니다", detail: String(e) });
  }
});

const PORT = process.env.PORT || 8002;
app.listen(PORT, () => console.log(`genkit-service listening on :${PORT}`));
