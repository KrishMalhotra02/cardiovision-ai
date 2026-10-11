import sys
import pandas as pd

path = sys.argv[1]
sheets = pd.read_excel(path, sheet_name=None)
print("Sheets:", {k: v.shape for k, v in sheets.items()})

df = next(iter(sheets.values()))
df.columns = [str(c).strip() for c in df.columns]
print("\nShape:", df.shape, "| duplicates:", df.duplicated().sum())
print("\nColumns & dtypes:\n", df.dtypes.to_string())

missing = df.isna().sum()
missing = missing[missing > 0]
print("\nMissing values:\n", missing.to_string() if len(missing) else "none")

for col in ["Cath", "LAD", "LCX", "RCA"]:
    if col in df:
        print(f"\n{col!r}:", df[col].value_counts(dropna=False).to_dict())
    else:
        print(f"\n{col!r}: NOT FOUND")

print("\nText columns:")
for c in df.select_dtypes(exclude="number"):
    print(f"  {c}: {df[c].value_counts(dropna=False).to_dict()}")
