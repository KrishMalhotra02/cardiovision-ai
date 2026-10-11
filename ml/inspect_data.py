
from pathlib import Path

import pandas as pd


PROJECT_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = PROJECT_DIR / "data" / "raw"


supported_extensions = {".csv", ".xlsx", ".xls"}

files = [
    file
    for file in DATA_DIR.iterdir()
    if file.is_file() and file.suffix.lower() in supported_extensions
]

if len(files) != 1:
    raise RuntimeError(
        f"Expected exactly one CSV or Excel file in {DATA_DIR}, "
        f"but found {len(files)}: {[f.name for f in files]}"
    )

file_path = files[0]


if file_path.suffix.lower() == ".csv":
    df = pd.read_csv(file_path)
else:
    df = pd.read_excel(file_path)

print("\n=== DATASET ===")
print("File:", file_path.name)
print("Rows and columns:", df.shape)
print("Duplicate rows:", df.duplicated().sum())

print("\n=== COLUMN NAMES ===")
for column in df.columns:
    print(repr(column))

print("\n=== DATA TYPES ===")
print(df.dtypes.to_string())

print("\n=== MISSING VALUES ===")
missing = df.isna().sum()
missing = missing[missing > 0]

print(missing.to_string() if not missing.empty else "None detected")

print("\n=== TARGET CANDIDATES ===")


column_lookup = {
    str(column).strip().lower(): column
    for column in df.columns
}

for name in ["cad", "lad", "lcx", "rca", "cath"]:
    original_name = column_lookup.get(name)

    if original_name is None:
        print(f"\n{name}: NOT FOUND")
    else:
        print(f"\n{original_name}:")
        print(df[original_name].value_counts(dropna=False).to_string())

print("\n=== FIRST FIVE ROWS ===")
print(df.head().to_string())

print("\nInspection completed.")
