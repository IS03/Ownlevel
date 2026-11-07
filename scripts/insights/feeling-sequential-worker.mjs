import { parentPort, workerData } from "node:worker_threads";
const { runSimulatedHistory } = await import(workerData.engineUrl);
parentPort.on("message", async task => {
  try { const value = await runSimulatedHistory(task.scenario, task.history, task.seed); parentPort.postMessage({ task, value }); }
  catch (error) { parentPort.postMessage({ task, error: error.stack ?? String(error) }); }
});
