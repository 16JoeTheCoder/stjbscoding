// Runs one Python program inside an already-loaded Pyodide. Shared by the browser worker
// (worker.js) and the Node tests, so both behave the same.

const MAX_OUTPUT_CHARS = 100_000;

// stdin: list of lines that input() will return in order.
// write(text): receives printed output as it happens.
// Returns { error } where error is "" on success or a short traceback.
export async function runInPyodide(pyodide, code, stdin, write) {
  let written = 0;
  const out = (s) => {
    if (written > MAX_OUTPUT_CHARS) return;
    written += s.length + 1;
    write(written > MAX_OUTPUT_CHARS ? "\n[Output cut off: too much printed]\n" : s + "\n");
  };
  const lines = [...(stdin || [])];
  pyodide.setStdout({ batched: out });
  pyodide.setStderr({ batched: out });
  // Returning undefined ends input, so input() raises EOFError, which explainError() turns into a hint.
  pyodide.setStdin({ stdin: () => (lines.length ? lines.shift() : undefined), autoEOF: true });

  // A fresh namespace per run, so one program's variables never leak into the next.
  const globals = pyodide.globals.get("dict")();
  try {
    await pyodide.runPythonAsync(code, { globals, filename: "main.py" });
    return { error: "" };
  } catch (e) {
    return { error: explainError(String(e.message || e)) };
  } finally {
    globals.destroy();
  }
}

// Keep only the student's own frames (File "main.py") and the final error line.
export function explainError(message) {
  const lines = message.trimEnd().split("\n");
  const last = lines[lines.length - 1];
  const own = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('File "main.py"')) {
      own.push(lines[i].trim());
      if (lines[i + 1] && !lines[i + 1].trimStart().startsWith("File ")) own.push("  " + lines[i + 1].trim());
    }
  }
  let text = [...own, last].join("\n");
  if (last.startsWith("EOFError")) text += "\nThis program asks for input(). Type one answer per line in the Input box, then run again.";
  return text;
}
