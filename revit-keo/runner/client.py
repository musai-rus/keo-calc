"""Local Python -> unchanged JS calculator. No Revit API, transactions or shell.

This client transports PREVIEW results only. It cannot approve BIM/norm evidence.
Use absolute paths to the installed Node executable and the packaged runner.
"""
import json
import math
import os
import subprocess
import tempfile
import time

SCHEMA = "keo-runner-preview/0.1"
INPUT_LIMIT = 2 * 1024 * 1024
OUTPUT_LIMIT = 16 * 1024 * 1024


def failure(code, detail):
    return {"schema": SCHEMA, "ok": False, "previewOnly": True,
            "status": "ERROR", "color": "gray", "previewImportJson": None,
            "errors": [{"code": code, "detail": detail}]}


def calculate(envelope, node_executable, runner_path, timeout_seconds=30,
              cancelled=None):
    """Cancellation callback is polled between waits (<=100 ms). No shell=True."""
    process = None
    try:
        if cancelled and cancelled():
            return failure("cancelled", "Отменено до запуска")
        if not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
            return failure("invalid-timeout", "Нужен положительный тайм-аут")
        for value in (node_executable, runner_path):
            if not os.path.isabs(value) or not os.path.isfile(value):
                return failure("runtime-path", "Нужны абсолютные пути к Node и runner")
        payload = json.dumps(envelope, ensure_ascii=False, allow_nan=False).encode("utf-8")
        if len(payload) > INPUT_LIMIT:
            return failure("input-too-large", "Превышен размер входного JSON")
        env = dict(os.environ)
        env.pop("NODE_OPTIONS", None)
        env.pop("NODE_PATH", None)
        with tempfile.TemporaryFile() as stdout, tempfile.TemporaryFile() as stderr:
            process = subprocess.Popen(
                [node_executable, runner_path], stdin=subprocess.PIPE,
                stdout=stdout, stderr=stderr, cwd=os.path.dirname(runner_path),
                shell=False, env=env,
                creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
            deadline = time.monotonic() + timeout_seconds
            first = True
            while True:
                if cancelled and cancelled():
                    return failure("cancelled", "Расчёт отменён; результат не принят")
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    return failure("timeout", "Расчёт превысил тайм-аут")
                if max(os.fstat(stdout.fileno()).st_size, os.fstat(stderr.fileno()).st_size) > OUTPUT_LIMIT:
                    return failure("output-too-large", "Превышен размер ответа")
                try:
                    process.communicate(input=payload if first else None, timeout=min(.1, remaining))
                    break
                except subprocess.TimeoutExpired:
                    first = False
            stdout.seek(0)
            raw = stdout.read(OUTPUT_LIMIT + 1)
            if len(raw) > OUTPUT_LIMIT or os.fstat(stderr.fileno()).st_size > OUTPUT_LIMIT:
                return failure("output-too-large", "Превышен размер ответа")
            response = json.loads(raw.decode("utf-8"))
            if not isinstance(response, dict) or response.get("schema") != SCHEMA:
                return failure("invalid-response", "Неизвестный протокол ответа")
            if response.get("previewOnly") is not True or response.get("color") != "gray" or response.get("status") not in ("PENDING", "ERROR"):
                return failure("invalid-response", "Runner не имеет права подтверждать результат Room")
            if process.returncode != 0:
                return failure("runner-exit", "Runner завершился с кодом %s: %s" %
                               (process.returncode, response.get("errors", [])))
            if response.get("ok") is not True:
                return failure("invalid-response", "Runner не подтвердил вычисление")
            result = response.get("coreResult", {})
            value = result.get("res", {}).get("eFinal")
            if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
                return failure("invalid-response", "Нет конечного значения КЕО")
            return response
    except (OSError, ValueError, TypeError) as error:
        return failure("client-error", str(error))
    finally:
        if process is not None:
            if process.poll() is None:
                process.kill()
            process.wait()
