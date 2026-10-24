import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time
import unittest
from client import calculate

HERE = Path(__file__).resolve().parent
NODE = shutil.which("node")
RUNNER = str(HERE / "runner.cjs")


class ClientTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.request = json.loads(subprocess.check_output([NODE, str(HERE / "fixtures.cjs")]))

    def call(self, **kwargs):
        return calculate(self.request, NODE, kwargs.pop("runner", RUNNER), **kwargs)

    def test_real_core_and_repeat(self):
        a = self.call()
        self.assertTrue(a["ok"], a)
        self.assertEqual(a, self.call())
        self.assertEqual(a["status"], "PENDING")

    def test_absolute_paths_and_bad_timeout(self):
        self.assertEqual(self.call(runner="runner.cjs")["errors"][0]["code"], "runtime-path")
        self.assertEqual(self.call(timeout_seconds=0)["errors"][0]["code"], "invalid-timeout")

    def test_cancel_before_launch(self):
        self.assertEqual(self.call(cancelled=lambda: True)["errors"][0]["code"], "cancelled")

    def helper(self, source, **kwargs):
        directory = Path(tempfile.mkdtemp(prefix="keo-Юникод ", dir=HERE))
        p = directory / "процесс с пробелом.cjs"
        try:
            p.write_text(source, encoding="utf-8")
            return self.call(runner=str(p), **kwargs)
        finally:
            p.unlink(missing_ok=True)
            directory.rmdir()

    def test_timeout_kills_process(self):
        start = time.monotonic()
        r = self.helper("setInterval(()=>{},1000)", timeout_seconds=.25)
        self.assertEqual(r["errors"][0]["code"], "timeout")
        self.assertLess(time.monotonic() - start, 4)

    def test_cancel_running_process(self):
        start = time.monotonic()
        r = self.helper("setInterval(()=>{},1000)", cancelled=lambda: time.monotonic() - start > .2)
        self.assertEqual(r["errors"][0]["code"], "cancelled")
        self.assertLess(time.monotonic() - start, 4)

    def test_malformed_output_and_nonzero_exit(self):
        r = self.helper("process.stdout.write('not json')")
        self.assertFalse(r["ok"])
        r = self.helper("console.log(JSON.stringify({schema:'keo-runner-preview/0.1',previewOnly:true,status:'ERROR',color:'gray'}));process.exitCode=7")
        self.assertEqual(r["errors"][0]["code"], "runner-exit")

    def test_spoofed_approval_rejected(self):
        r = self.helper("console.log(JSON.stringify({schema:'keo-runner-preview/0.1',ok:true,previewOnly:false,status:'PASS',color:'green'}))")
        self.assertEqual(r["errors"][0]["code"], "invalid-response")

    def test_output_limit(self):
        r = self.helper("process.stdout.write('x'.repeat(17*1024*1024))")
        self.assertEqual(r["errors"][0]["code"], "output-too-large")

    def test_invalid_numeric_input(self):
        r = calculate({"number": float("nan")}, NODE, RUNNER)
        self.assertFalse(r["ok"])

    def test_node_environment_does_not_inject_code(self):
        old = os.environ.get("NODE_OPTIONS")
        try:
            os.environ["NODE_OPTIONS"] = "--require this-file-does-not-exist"
            self.assertTrue(self.call()["ok"])
        finally:
            if old is None:
                os.environ.pop("NODE_OPTIONS", None)
            else:
                os.environ["NODE_OPTIONS"] = old


if __name__ == "__main__":
    unittest.main()
