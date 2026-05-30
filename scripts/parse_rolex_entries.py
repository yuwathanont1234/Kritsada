import re
import json

with open("/Users/kritsada/.gemini/antigravity/scratch/rolex_best_script.js", "r", encoding="utf-8") as f:
    js_content = f.read()

print(f"Loaded script of length {len(js_content)}")

# Let's find all entries in Script #5 matching the watch pattern
# Simple flat objects with "rmc" inside braces:
watch_entries = re.findall(r'\{[^{}]*"rmc"[^{}]*\}', js_content)
print(f"\nFound {len(watch_entries)} watch entries in Script #5!")

if watch_entries:
    print("\nWatch record #0 keys and content:")
    sample = watch_entries[0]
    print(sample)
    try:
        obj = json.loads(sample)
        print("Successfully parsed as JSON!")
        print(json.dumps(obj, indent=2, ensure_ascii=False))
    except Exception as e:
        print(f"JSON parsing failed: {e}")
        # Let's clean it up if it has trailing/leading characters
        cleaned = re.search(r'\{.*\}', sample).group(0)
        try:
            obj = json.loads(cleaned)
            print("Successfully parsed cleaned JSON!")
            print(json.dumps(obj, indent=2, ensure_ascii=False))
        except Exception as e2:
            print(f"Cleaned JSON parsing failed: {e2}")

# Let's check what keys exist across all entries
all_keys = set()
for entry in watch_entries:
    cleaned_match = re.search(r'\{.*\}', entry)
    if cleaned_match:
        try:
            obj = json.loads(cleaned_match.group(0))
            all_keys.update(obj.keys())
        except:
            pass

print(f"\nAll keys across parsed watch entries: {sorted(list(all_keys))}")
