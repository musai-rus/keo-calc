"""D3 synthetic exchange probe for the existing three-input Dynamo scaffold.

Bundled with d0_probe.py (guards) and client.py (process transport). It does not
extract Room inputs, accept evidence, write transactions or save the model.
"""
import hashlib


def run_d3(config, enabled, nonce, host_factory):
    required = {"schema", "documentGuard", "node_executable", "runner_path", "requests_path", "evidence_jsonl"}
    if not isinstance(config, dict) or set(config) != required or config["schema"] != "keo-dynamo-d3-config/v1":
        raise ProbeRefused("Unexpected D3 configuration")
    for key, ext in (("node_executable", ".exe"), ("runner_path", ".cjs"), ("requests_path", ".json"), ("evidence_jsonl", ".jsonl")):
        canonical_path(config[key], ext)
    guard = run_probe(config["documentGuard"], enabled, nonce, host_factory)
    result = {"schema": "keo-dynamo-d3-evidence/v1", "bundleSha256": globals().get("BUNDLE_SHA256", "unbundled"),
              "runNonce": str(nonce), "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "syntheticOnly": True, "geometryAccepted": False, "normativeAccepted": False,
              "modelWriteRequested": False, "status": guard["status"], "guard": guard}
    if guard["status"] != "READ_ONLY_OK":
        return result
    host = host_factory()
    try:
        if host.snapshot() != guard["after"]:
            raise ProbeRefused("Document changed before runner")
        if os.path.getsize(config["requests_path"]) > INPUT_LIMIT:
            raise ProbeRefused("Synthetic fixture file too large")
        with open(config["requests_path"], "rb") as stream:
            request_bytes = stream.read()
        requests = json.loads(request_bytes.decode("utf-8-sig"))
        if not isinstance(requests, list) or not 1 <= len(requests) <= 5:
            raise ProbeRefused("Expected 1 to 5 synthetic requests")
        if any(q.get("state", {}).get("meta", {}).get("code") != "SYNTHETIC" for q in requests):
            raise ProbeRefused("D3 probe accepts synthetic fixtures only")
        result["requestsSha256"] = hashlib.sha256(request_bytes).hexdigest()
        result["responses"] = [calculate(q, config["node_executable"], config["runner_path"], 10) for q in requests]
        result["status"] = "SYNTHETIC_REPLAY_OK" if all(r["ok"] for r in result["responses"]) else "ERROR"
    except Exception as exc:
        result.update(status="ERROR", reason=type(exc).__name__ + ": " + str(exc))
    finally:
        result["afterRunner"] = host.snapshot()
        result["documentUnchanged"] = result["afterRunner"] == guard["before"]
        if not result["documentUnchanged"]:
            result.update(status="ERROR", reason="Document changed during runner")
    return result


def d3_entry(inputs):
    if len(inputs) != 3:
        raise ProbeRefused("Expected config, Boolean enabled, nonce")
    canonical_path(inputs[0], ".json")
    if os.path.getsize(inputs[0]) > 65536:
        raise ProbeRefused("Configuration too large")
    with open(inputs[0], "r", encoding="utf-8-sig") as stream:
        config = json.load(stream)
    result = run_d3(config, inputs[1], inputs[2], RevitHost)
    output = config["evidence_jsonl"]
    if os.path.exists(output):
        if os.path.getsize(output) > 10 * 1024 * 1024:
            raise ProbeRefused("Evidence log too large")
        with open(output, "r", encoding="utf-8") as stream:
            for line in stream:
                if line.strip() and json.loads(line).get("schema") != result["schema"]:
                    raise ProbeRefused("Existing output is not D3 evidence")
    with open(output, "a", encoding="utf-8", newline="\n") as stream:
        stream.write(json.dumps(result, ensure_ascii=False, sort_keys=True) + "\n")
    # Keep the Watch compact; the full responses are in the explicit evidence log.
    return json.dumps({k: v for k, v in result.items() if k not in ("guard", "responses", "afterRunner")}, ensure_ascii=False, indent=2)


if "IN" in globals():
    try:
        OUT = d3_entry(IN)
    except Exception as exc:
        OUT = json.dumps({"schema": "keo-dynamo-d3-evidence/v1", "status": "ERROR", "reason": str(exc),
                          "geometryAccepted": False, "normativeAccepted": False}, ensure_ascii=False)
