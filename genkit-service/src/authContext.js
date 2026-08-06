import { AsyncLocalStorage } from "node:async_hooks";

const authStorage = new AsyncLocalStorage();

export function runWithAuthToken(authToken, callback) {
  return authStorage.run({ authToken }, callback);
}

export function getAuthToken() {
  const authToken = authStorage.getStore()?.authToken;
  if (!authToken) {
    throw new Error("인증 컨텍스트를 찾을 수 없습니다.");
  }
  return authToken;
}
