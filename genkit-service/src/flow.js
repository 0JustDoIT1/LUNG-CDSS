/**
 * 챗봇 오케스트레이션의 실제 두뇌.
 *   - Gemini(googleAI 플러그인)가 질문을 보고 어떤 tool을 쓸지 스스로 판단한다
 *     (여기가 이전 FastAPI 키워드매칭 버전과의 핵심 차이 — 규칙이 아니라
 *      LLM이 tool-calling으로 판단함)
 *   - 개인데이터 tool 3개는 MCP 서버(mcpServer.js)에 정의되어 있고, 여기서는
 *     MCP 클라이언트로 접속해서 그 tool들을 Genkit에 등록만 한다
 *   - 일반지식 tool은 FAISS 검색(realtime-service의 /internal/rag/search)을
 *     호출하는 Genkit 네이티브 tool로 별도 정의
 */

import { genkit, z } from "genkit";
import { googleAI } from "@genkit-ai/google-genai";
import { Client as McpClient } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import axios from "axios";

const RAG_SEARCH_URL =
  process.env.RAG_SEARCH_URL || "http://realtime:8001/internal/rag/search";

const ai = genkit({
  plugins: [googleAI()],
  model: googleAI.model("gemini-2.0-flash"),
});

// ── MCP 클라이언트 연결 (개인데이터 tool 3개) ────────────────────────

let mcpClient = null;

async function connectMcp() {
  if (mcpClient) return mcpClient;

  const transport = new StdioClientTransport({
    command: "node",
    args: ["src/mcpServer.js"],
    env: { ...process.env },
  });

  mcpClient = new McpClient({ name: "genkit-service", version: "1.0.0" });
  await mcpClient.connect(transport);
  return mcpClient;
}

function wrapMcpToolAsGenkitTool(name, description) {
  return ai.defineTool(
    {
      name,
      description,
      inputSchema: z.object({ authToken: z.string().describe("현재 로그인한 환자의 JWT") }),
      outputSchema: z.string(),
    },
    async ({ authToken }) => {
      const client = await connectMcp();
      const result = await client.callTool({ name, arguments: { authToken } });
      return result.content?.[0]?.text || "조회 결과가 없습니다.";
    }
  );
}

const getMyAppointments = wrapMcpToolAsGenkitTool(
  "get_my_appointments",
  "환자 본인의 다음 예약 일정을 조회한다. '예약', '진료 언제' 등을 물을 때 사용."
);
const getMyMedications = wrapMcpToolAsGenkitTool(
  "get_my_medications",
  "환자 본인의 오늘 복약 현황을 조회한다. '약 먹었나', '복용' 등을 물을 때 사용."
);
const getMyCaseResult = wrapMcpToolAsGenkitTool(
  "get_my_case_result",
  "환자 본인의 최근 확정 검사결과(조직형)를 조회한다. '검사결과', '진단' 등을 물을 때 사용."
);

// ── 일반 의학지식 tool (FAISS RAG, MCP 아님 — 내부 HTTP 호출) ────────

const searchGeneralKnowledge = ai.defineTool(
  {
    name: "search_general_knowledge",
    description:
      "폐암 관련 일반 의학지식(유전자, 치료법, 용어 등)을 검색한다. " +
      "환자 개인정보가 아닌 일반적인 질문일 때 사용.",
    inputSchema: z.object({ query: z.string() }),
    outputSchema: z.string(),
  },
  async ({ query }) => {
    const { data } = await axios.post(RAG_SEARCH_URL, { query, top_k: 3 }, { timeout: 15000 });
    if (!data.chunks?.length) return "관련 자료를 찾지 못했습니다.";
    return data.chunks.map((c) => `[출처: ${c.source}] ${c.text}`).join("\n\n");
  }
);

// ── 챗봇 Flow ─────────────────────────────────────────────────────

export const chatFlow = ai.defineFlow(
  {
    name: "patientChatFlow",
    inputSchema: z.object({ message: z.string(), authToken: z.string() }),
    outputSchema: z.object({ answer: z.string() }),
  },
  async ({ message, authToken }) => {
    const { text } = await ai.generate({
      system:
        "당신은 폐암 환자를 돕는 도우미입니다. " +
        "예약/복약/검사결과 등 개인정보 질문은 반드시 제공된 tool로 조회해서 답하고, " +
        "tool 호출 시 authToken 인자에는 항상 주어진 값을 그대로 사용하세요(절대 스스로 만들어내지 마세요). " +
        "그 외 일반 의학지식 질문은 search_general_knowledge tool의 검색결과 범위 내에서만 답하세요. " +
        "모든 답변 끝에는 참고정보이며 담당 의료진과 상의하라는 안내를 덧붙입니다.",
      prompt: `[authToken: ${authToken}]\n\n환자 질문: ${message}`,
      tools: [getMyAppointments, getMyMedications, getMyCaseResult, searchGeneralKnowledge],
    });

    return { answer: text };
  }
);
