// Web Worker that owns the Python runtime. The page talks to it through runner.js.
// It runs in its own thread, so an infinite loop here cannot freeze the page;
// runner.js simply terminates this worker when a run takes too long.
import { runInPyodide } from "./core.js";

let ready = null;

function load() {
  // Pyodide is served from our own site (public/pyodide), never from a CDN.
  const base = new URL("/pyodide/", self.location.origin).href;
  ready ??= import(/* @vite-ignore */ base + "pyodide.mjs").then(({ loadPyodide }) =>
    loadPyodide({ indexURL: base }),
  );
  return ready;
}

self.onmessage = async ({ data }) => {
  const { id, code, stdin } = data;
  try {
    const pyodide = await load();
    self.postMessage({ id, type: "started" });
    const { error } = await runInPyodide(pyodide, code, stdin, (text) =>
      self.postMessage({ id, type: "output", text }),
    );
    self.postMessage({ id, type: "done", error });
  } catch (e) {
    self.postMessage({ id, type: "done", error: "Python could not start: " + (e.message || e) });
  }
};
