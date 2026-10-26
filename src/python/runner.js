// The one shared Python runtime for the whole site. Nothing is downloaded until the
// first Run. Runs are queued, so the curriculum validator can run many snippets in a row.
import { RUN_TIMEOUT_MS } from "../config.js";

let worker = null;
let warm = false;      // true once Python has loaded in the current worker
let nextId = 1;
let queue = Promise.resolve();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
    warm = false;
  }
  return worker;
}

// Runs code and resolves to { output, error, timedOut }.
// onStatus("loading" | "running") lets the page show a loading indicator.
// onOutput(text) streams printed output as it arrives.
export function runPython(code, { stdin = [], timeoutMs = RUN_TIMEOUT_MS, onStatus = () => {}, onOutput = () => {} } = {}) {
  const job = queue.then(() => runOne(code, stdin, timeoutMs, onStatus, onOutput));
  queue = job.catch(() => {});
  return job;
}

function runOne(code, stdin, timeoutMs, onStatus, onOutput) {
  return new Promise((resolve) => {
    const w = getWorker();
    const id = nextId++;
    let output = "";
    let timer = null;
    onStatus(warm ? "running" : "loading");

    const startTimer = () => {
      timer = setTimeout(() => {
        // The only way to stop a runaway program: throw the whole worker away.
        w.terminate();
        worker = null;
        finish({ output, error: `Stopped after ${timeoutMs / 1000} s. Check for a loop that never ends.`, timedOut: true });
      }, timeoutMs);
    };
    const finish = (result) => {
      clearTimeout(timer);
      w.removeEventListener("message", onMessage);
      resolve(result);
    };
    const onMessage = ({ data }) => {
      if (data.id !== id) return;
      if (data.type === "started") { warm = true; onStatus("running"); startTimer(); }
      if (data.type === "output") { output += data.text; onOutput(data.text); }
      if (data.type === "done") finish({ output, error: data.error, timedOut: false });
    };
    w.addEventListener("message", onMessage);
    w.postMessage({ id, code, stdin });
  });
}
