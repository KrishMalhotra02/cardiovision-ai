
import json
from urllib.request import Request, urlopen

BASE_URL = "http://127.0.0.1:8000"

# 1. Get a sample clinical record.
with urlopen(f"{BASE_URL}/api/demo-case") as response:
    demo = json.load(response)

print("Demo case loaded.")
print("Feature count:", len(demo["features"]))

# 2. Send all 55 features to the prediction endpoint.
payload = json.dumps({
    "features": demo["features"]
}).encode("utf-8")

request = Request(
    f"{BASE_URL}/api/predict",
    data=payload,
    headers={"Content-Type": "application/json"},
    method="POST",
)

with urlopen(request) as response:
    result = json.load(response)

# 3. Verify all four predictions exist.
assert set(result["predictions"]) == {
    "CAD", "LAD", "LCX", "RCA"
}

print("\n=== CARDIOVISION AI PREDICTIONS ===")

for name, prediction in result["predictions"].items():
    print(
        f"{name}: {prediction['predicted_label']}"
        f" | Positive-class score: "
        f"{prediction['positive_probability']:.3f}"
        f" | Model: {prediction['model_type']}"
    )

print("\nAll four models responded successfully!")
