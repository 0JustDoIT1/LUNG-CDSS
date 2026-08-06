export function createMcpConnectionManager(createConnection) {
  let activeConnection = null;
  let pendingConnection = null;

  async function getConnection() {
    if (activeConnection) return activeConnection;
    if (pendingConnection) return pendingConnection;

    pendingConnection = (async () => {
      const candidate = await createConnection();
      try {
        await candidate.connect();
        activeConnection = candidate;
        candidate.setOnClose?.(() => invalidate(candidate));
        return candidate;
      } catch (error) {
        await candidate.close?.().catch(() => {});
        throw error;
      }
    })();

    try {
      return await pendingConnection;
    } finally {
      pendingConnection = null;
    }
  }

  function invalidate(connection) {
    if (activeConnection === connection) activeConnection = null;
  }

  async function close() {
    const connection = activeConnection;
    activeConnection = null;
    if (connection) await connection.close().catch(() => {});
  }

  return { getConnection, invalidate, close };
}
