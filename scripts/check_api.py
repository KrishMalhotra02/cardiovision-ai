"""CardioVision end-to-end local API smoke test. Python standard library only."""
import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

API = "http://127.0.0.1:8000"


def get(path):
    with urlopen(f"{API}{path}", timeout=12) as response:
        return json.load(response)


def main():
    try:
        health = get("/health")
        print("Health:", health)
        assert health["status"] == "ok"
        assert set(health["loaded_models"]) == {"CAD", "LAD", "LCX", "RCA"}
        assert health["feature_count"] == 55

        schema = get("/api/features")
        assert len(schema["features"]) == 55

        demo = get("/api/demo-case")
        assert len(demo["features"]) == 55

        payload = json.dumps({"features": demo["features"]}).encode()
        req = Request(
            f"{API}/api/predict",
            data=payload,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(req, timeout=60) as response:
            prediction = json.load(response)
        assert set(prediction["predictions"]) == {"CAD", "LAD", "LCX", "RCA"}

        print("\nPredictions from saved models:")
        for name, result in prediction["predictions"].items():
            print(f"{name}: {result['predicted_label']} (score={result['positive_probability']:.3f})")
        print("\nPASS: Backend, feature schema, demo case, and inference are working.")
    except (URLError, HTTPError, KeyError, AssertionError) as exc:
        print("\nFAIL: API not ready:", exc)
        print("Open another terminal in CardioAI and run:")
        print("source .venv/bin/activate")
        print("python -m uvicorn backend.app:app --host 127.0.0.1 --port 8000 --reload")
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
