import re

with open("/Users/kritsada/.gemini/antigravity/scratch/rolex_finder.html", "r", encoding="utf-8") as f:
    html = f.read()

# Let's find all script tags using a regex that captures attributes and contents
script_pattern = re.compile(r'<script([^>]*)>(.*?)</script>', re.DOTALL | re.IGNORECASE)
scripts = script_pattern.findall(html)
print(f"Found {len(scripts)} script tags in total.")

for idx, (attrs, content) in enumerate(scripts):
    rmc_count = content.count('"rmc"')
    rmc_colon_count = content.count('"rmc":')
    if rmc_count > 0 or rmc_colon_count > 0 or len(content) > 10000:
        print(f"Script #{idx}: length={len(content)}, attrs={attrs.strip() or 'None'}, '\"rmc\"' count={rmc_count}, '\"rmc\":' count={rmc_colon_count}")
