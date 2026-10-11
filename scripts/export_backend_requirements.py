"""Create a reproducible backend requirements file from THIS working venv."""
from importlib.metadata import version
from pathlib import Path

packages = ["fastapi", "uvicorn", "pandas", "numpy", "scikit-learn", "openpyxl", "joblib", "pydantic"]
output = Path(__file__).resolve().parent.parent / "backend" / "requirements.txt"
output.parent.mkdir(parents=True, exist_ok=True)
lines = []
for package in packages:
    lines.append(f"{package}=={version(package)}")
output.write_text("\n".join(lines) + "\n")
print(f"Written {output}")
print(output.read_text())
