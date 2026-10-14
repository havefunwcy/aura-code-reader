const vscode = require('vscode');

const WORK_CODE_SNIPPET = `# -*- coding: utf-8 -*-
"""
Microservice Performance Monitor & Connection Pool Manager
Environment: Production Cluster [us-east-1]
"""

import asyncio
import logging
from typing import Dict, Any, List

logger = logging.getLogger("TelemetryService")

class ConnectionPoolMonitor:
    def __init__(self, max_connections: int = 500, timeout_ms: int = 2500):
        self.max_connections = max_connections
        self.timeout_ms = timeout_ms
        self._active_pool: Dict[str, Any] = {}
        self._metrics_buffer: List[float] = []

    async def poll_cluster_health(self) -> Dict[str, Any]:
        """Periodically ping downstream microservices to evaluate latency percentiles."""
        logger.debug("Collecting p99 latency metrics across active replica set...")
        await asyncio.sleep(0.05)
        return {
            "status": "healthy",
            "active_sockets": len(self._active_pool),
            "p99_latency_ms": 14.2
        }

if __name__ == "__main__":
    monitor = ConnectionPoolMonitor()
    asyncio.run(monitor.poll_cluster_health())
`;

async function triggerBossKey() {
  try {
    // Open an untitled document with legitimate work code
    const doc = await vscode.workspace.openTextDocument({
      language: 'python',
      content: WORK_CODE_SNIPPET
    });
    await vscode.window.showTextDocument(doc, { preview: false });
    vscode.window.setStatusBarMessage('$(check) Cluster Health: All 32 pods online (0 alerts)', 6000);
  } catch (e) {
    // Fallback: close active tab
    vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  }
}

module.exports = {
  triggerBossKey
};
