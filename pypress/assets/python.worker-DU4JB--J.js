(function(){let e=null;function t(t){return e??=(async()=>{let e=await(await import(
/* @vite-ignore */
t+`pyodide.mjs`)).loadPyodide({indexURL:t});return e.runPython(`"""Runs one piece of player code safely and returns a JSON result.

Loaded by python.worker.ts inside Pyodide. It is plain Python, so the tests
also run it with the local python3 (tests/run_player_cli.py).

Protection (the JavaScript side adds a hard timeout on top):
  - a step budget via sys.settrace (stops infinite loops)
  - an output budget (stops print in a huge loop)
  - no import, open, eval, exec, input
"""
import builtins
import json
import sys
import traceback

PLAYER_FILE = "<player>"


class _StepLimit(Exception):
    pass


class _OutputLimit(Exception):
    pass


class _Paper:
    """Replacement for sys.stdout: everything printed lands on the paper."""

    def __init__(self, max_chars):
        self.parts = []
        self.size = 0
        self.max_chars = max_chars

    def write(self, text):
        self.size += len(text)
        if self.size > self.max_chars:
            raise _OutputLimit()
        self.parts.append(text)
        return len(text)

    def flush(self):
        pass


def _no_import(*args, **kwargs):
    raise ImportError("import is not available yet")


def _no_input(*args, **kwargs):
    raise RuntimeError("input() is not available yet")


_BLOCKED = (
    "open", "exec", "eval", "compile", "breakpoint", "help", "exit", "quit",
    "globals", "locals", "vars", "memoryview", "__loader__", "__spec__",
)


def _safe_builtins():
    safe = dict(builtins.__dict__)
    for name in _BLOCKED:
        safe.pop(name, None)
    safe["__import__"] = _no_import
    safe["input"] = _no_input
    return safe


def _player_line(tb):
    line = None
    for frame in traceback.extract_tb(tb):
        if frame.filename == PLAYER_FILE:
            line = frame.lineno
    return line


def _error(kind, message, line, raw):
    return {"type": kind, "message": message, "line": line, "raw": raw}


def run_player(code, max_steps=20000, max_chars=4000, given_json="{}"):
    paper = _Paper(max_chars)
    result = {"ok": True, "stdout": "", "error": None, "steps": 0}

    try:
        compiled = compile(code, PLAYER_FILE, "exec")
    except SyntaxError as e:  # includes IndentationError
        raw = "".join(traceback.format_exception_only(type(e), e))
        raw = raw.replace('File "<player>"', 'File "jouw code"')
        result["ok"] = False
        result["error"] = _error(type(e).__name__, e.msg, e.lineno, raw)
        return json.dumps(result)

    env = {"__builtins__": _safe_builtins(), "__name__": "__main__"}
    env.update(json.loads(given_json))
    steps = [0]

    def tracer(frame, event, arg):
        if frame.f_code.co_filename != PLAYER_FILE:
            return None
        if event == "line":
            steps[0] += 1
            if steps[0] > max_steps:
                raise _StepLimit()
        return tracer

    old_stdout = sys.stdout
    sys.stdout = paper
    sys.settrace(tracer)
    try:
        exec(compiled, env)
    except _StepLimit:
        result["ok"] = False
        result["error"] = _error("StepLimit", "too many steps", None, "")
    except _OutputLimit:
        result["ok"] = False
        result["error"] = _error("OutputLimit", "too much output", None, "")
    except BaseException as e:  # noqa: BLE001 - every player error is reported
        line = _player_line(e.__traceback__)
        raw = "Traceback (most recent call last):\\n"
        if line is not None:
            raw += f'  File "jouw code", line {line}\\n'
        raw += f"{type(e).__name__}: {e}\\n"
        result["ok"] = False
        result["error"] = _error(type(e).__name__, str(e), line, raw)
    finally:
        sys.settrace(None)
        sys.stdout = old_stdout

    result["stdout"] = "".join(paper.parts)
    result["steps"] = steps[0]
    return json.dumps(result)
`),e})(),e}self.onmessage=async e=>{let{id:n,type:r,indexURL:i,code:a,given:o,limits:s}=e.data;try{let e=await t(i);if(r===`warmup`){self.postMessage({id:n,warm:!0});return}let c=e.globals.get(`run_player`),l=c(a,s.maxSteps,s.maxOutputChars,JSON.stringify(o??{}));c.destroy(),self.postMessage({id:n,result:JSON.parse(l)})}catch(e){self.postMessage({id:n,fatal:String(e)})}}})();