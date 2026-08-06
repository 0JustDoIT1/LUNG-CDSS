import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { runWithAuthToken, getAuthToken } from "../src/authContext.js";
import { createMcpConnectionManager } from "../src/mcpConnectionManager.js";

const flowSource = await readFile(new URL("../src/flow.js", import.meta.url), "utf8");
const indexSource = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const mcpSource = await readFile(new URL("../src/mcpServer.js", import.meta.url), "utf8");
const mcpClientSource = await readFile(new URL("../src/mcpClient.js", import.meta.url), "utf8");

test("Gemini prompt와 model-visible schema에 인증 식별자가 없다", () => {
  assert.match(flowSource, /inputSchema: z\.object\(\{\}\)/);
  assert.doesNotMatch(flowSource, /prompt:\s*`[^`]*(authToken|patientId)/);
  assert.doesNotMatch(flowSource, /inputSchema:\s*z\.object\([^)]*(authToken|patientId)/);
});

test("동시 요청의 인증 context가 섞이지 않는다", async () => {
  let releaseFirst;
  const firstGate = new Promise((resolve) => { releaseFirst = resolve; });
  const seen = [];

  const first = runWithAuthToken("first-secret", async () => {
    await firstGate;
    seen.push(getAuthToken());
  });
  const second = runWithAuthToken("second-secret", async () => {
    seen.push(getAuthToken());
    releaseFirst();
  });

  await Promise.all([first, second]);
  assert.deepEqual(seen, ["second-secret", "first-secret"]);
});

test("환자 공개 결과 endpoint와 확정 필드만 사용한다", () => {
  assert.match(mcpSource, /\/api\/cases\/my-results\//);
  assert.doesNotMatch(mcpSource, /prediction_label/);
});

test("Genkit handler가 context JWT를 MCP client에 서버 코드로 주입한다", () => {
  assert.match(flowSource, /const authToken = getAuthToken\(\)/);
  assert.match(flowSource, /callMcpTool\(name, authToken\)/);
  assert.match(mcpClientSource, /client\.callTool\(request\)/);
  assert.match(mcpClientSource, /arguments: \{ authToken \}/);
  assert.doesNotMatch(mcpClientSource, /patientId/);
});

test("MCP server가 인증 header로 Django API를 호출한다", () => {
  assert.match(mcpSource, /Authorization: `Bearer \$\{authToken\}`/);
  assert.match(mcpSource, /\/api\/appointments\/mine\//);
  assert.match(mcpSource, /\/api\/medications\/logs\/today\//);
  assert.match(mcpSource, /\/api\/cases\/my-results\//);
});

test("MCP connect 실패는 캐시되지 않고 다음 요청에서 재연결된다", async () => {
  let attempts = 0;
  const manager = createMcpConnectionManager(async () => ({
    async connect() {
      attempts += 1;
      if (attempts === 1) throw new Error("expected connect failure");
    },
    async close() {},
  }));

  await assert.rejects(manager.getConnection(), /expected connect failure/);
  await manager.getConnection();
  assert.equal(attempts, 2);
});

test("502 응답은 내부 예외 문자열을 반환하지 않는다", () => {
  assert.match(indexSource, /CHATBOT_UPSTREAM_ERROR/);
  assert.doesNotMatch(indexSource, /String\s*\(\s*e\s*\)|detail\s*:/);
  assert.doesNotMatch(indexSource, /console\.error\([^\n]*,\s*e/);
});
