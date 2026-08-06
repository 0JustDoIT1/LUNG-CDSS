import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import axios from "axios";
import { z } from "zod";
import { formatCaseResult, formatMedications } from "./patientDataFormat.js";

const DJANGO_BASE_URL = process.env.DJANGO_INTERNAL_BASE_URL || "http://backend:8000";

function djangoClient(authToken) {
  return axios.create({
    baseURL: DJANGO_BASE_URL,
    timeout: 10000,
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

const server = new McpServer({ name: "lung-cdss-patient-data", version: "1.0.0" });
const internalAuthSchema = { authToken: z.string().min(1) };

function safeTool(handler) {
  return async (input) => {
    try {
      return await handler(input);
    } catch {
      return {
        isError: true,
        content: [{ type: "text", text: "환자 정보를 조회하지 못했습니다." }],
      };
    }
  };
}

server.registerTool(
  "get_my_appointments",
  {
    description: "로그인 환자 본인의 다음 예약 조회",
    inputSchema: internalAuthSchema,
  },
  safeTool(async ({ authToken }) => {
    const { data } = await djangoClient(authToken).get("/api/appointments/mine/");
    const upcoming = data.filter((appointment) =>
      ["confirmed", "reminded_d7", "reminded_d1"].includes(appointment.status)
    );
    if (upcoming.length === 0) {
      return { content: [{ type: "text", text: "예정된 예약이 없습니다." }] };
    }
    const next = upcoming.sort(
      (a, b) => new Date(a.confirmed_slot) - new Date(b.confirmed_slot)
    )[0];
    return {
      content: [{
        type: "text",
        text: `다음 예약: ${next.confirmed_slot}, ${next.department} ${next.doctor_name} 선생님`,
      }],
    };
  })
);

server.registerTool(
  "get_my_medications",
  {
    description: "로그인 환자 본인의 오늘 복약 조회",
    inputSchema: internalAuthSchema,
  },
  safeTool(async ({ authToken }) => {
    const { data } = await djangoClient(authToken).get("/api/medications/logs/today/");
    return { content: [{ type: "text", text: formatMedications(data) }] };
  })
);

server.registerTool(
  "get_my_case_result",
  {
    description: "로그인 환자에게 공개된 최근 확정 검사결과 조회",
    inputSchema: internalAuthSchema,
  },
  safeTool(async ({ authToken }) => {
    const { data } = await djangoClient(authToken).get("/api/cases/my-results/");
    return { content: [{ type: "text", text: formatCaseResult(data) }] };
  })
);

const transport = new StdioServerTransport();
await server.connect(transport);

async function shutdown() {
  await server.close().catch(() => {});
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);
