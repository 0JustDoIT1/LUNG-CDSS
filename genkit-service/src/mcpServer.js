/**
 * MCP 서버: 환자 개인데이터 조회 도구 3개를 노출한다.
 * 실제 Django REST API를 그대로 호출할 뿐 — 자체 DB 접근이나 비즈니스
 * 로직을 여기서 새로 만들지 않는다 (Django accounts/cases/appointments/
 * medications 앱에 이미 구현된 걸 그대로 재사용).
 *
 * 보안 핵심: patientId는 LLM이 만들어내는 값이 아니라, 도구 호출 시
 * 전달받은 authToken(사용자 본인의 JWT)을 그대로 Django에 넘겨서 Django가
 * 토큰에서 강제로 추출한다. LLM이 "다른 환자 ID"를 지어내도 Django가
 * 토큰의 실제 소유자 기준으로만 응답하므로 타 환자 데이터 조회가 원천 차단됨.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import axios from "axios";

const DJANGO_BASE_URL = process.env.DJANGO_INTERNAL_BASE_URL || "http://backend:8000";

function djangoClient(authToken) {
  return axios.create({
    baseURL: DJANGO_BASE_URL,
    timeout: 10000,
    headers: { Authorization: `Bearer ${authToken}` },
  });
}

const server = new McpServer({ name: "lung-cdss-patient-data", version: "1.0.0" });

server.registerTool(
  "get_my_appointments",
  {
    title: "내 예약 조회",
    description: "로그인한 환자 본인의 예약 목록을 조회한다. 다음 진료 일정을 물을 때 사용.",
    inputSchema: { authToken: z.string() },
  },
  async ({ authToken }) => {
    const { data } = await djangoClient(authToken).get("/api/appointments/mine/");
    const upcoming = data.filter((a) =>
      ["confirmed", "reminded_d7", "reminded_d1"].includes(a.status)
    );
    if (upcoming.length === 0) {
      return { content: [{ type: "text", text: "예정된 예약이 없습니다." }] };
    }
    const next = upcoming.sort((a, b) => new Date(a.confirmed_slot) - new Date(b.confirmed_slot))[0];
    return {
      content: [
        {
          type: "text",
          text: `다음 예약: ${next.confirmed_slot}, ${next.department} ${next.doctor_name} 선생님`,
        },
      ],
    };
  }
);

server.registerTool(
  "get_my_medications",
  {
    title: "내 오늘 복약 조회",
    description: "로그인한 환자 본인의 오늘 복약 일정과 복용 여부를 조회한다.",
    inputSchema: { authToken: z.string() },
  },
  async ({ authToken }) => {
    const { data } = await djangoClient(authToken).get("/api/medications/logs/today/");
    if (data.length === 0) {
      return { content: [{ type: "text", text: "오늘 등록된 복약 일정이 없습니다." }] };
    }
    const taken = data.filter((d) => d.taken).length;
    return { content: [{ type: "text", text: `오늘 복약 ${taken}/${data.length}건 완료.` }] };
  }
);

server.registerTool(
  "get_my_case_result",
  {
    title: "내 검사결과 조회",
    description: "로그인한 환자 본인의 가장 최근 확정된 검사결과(조직형)를 조회한다.",
    inputSchema: { authToken: z.string() },
  },
  async ({ authToken }) => {
    const { data } = await djangoClient(authToken).get("/api/cases/?status=confirmed");
    const results = Array.isArray(data) ? data : data.results || [];
    if (results.length === 0) {
      return { content: [{ type: "text", text: "아직 확인 가능한 검사결과가 없습니다." }] };
    }
    const latest = results[0];
    return {
      content: [
        { type: "text", text: `최근 확정 검사결과: ${latest.prediction_label || "확인중"}` },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
