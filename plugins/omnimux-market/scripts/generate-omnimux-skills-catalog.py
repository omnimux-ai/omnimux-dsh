import os
import json
import re
import yaml
from pathlib import Path

skills_root = Path("/Users/x/Desktop/Project/Github/OmniMux-skills/skills")

# Load existing catalog
catalog_path = Path("product/omnimux-dsh/plugins/omnimux-market/catalog/index.json")
with open(catalog_path, "r", encoding="utf-8") as f:
    catalog = json.load(f)

# Optional: Load market metadata from MiniMax local cache or fallback if available
market_meta_map = {}
cache_file = Path("/Users/x/Library/Application Support/@hilo/MiniMax Hub Global/Cache/Cache_Data/b5788dc9deadfee5_0")
# Also fetch from local running gateway if available
try:
    import urllib.request
    with urllib.request.urlopen("http://127.0.0.1:8001/api/skills/market?page=1&page_size=200", timeout=2) as r:
        mdata = json.loads(r.read().decode())
        for s in mdata.get("skills", []):
            market_meta_map[s["name"]] = s
except Exception as e:
    print(f"Note: gateway market fetch skipped: {e}")

FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)

generated_items = []

for skill_dir in sorted(skills_root.iterdir()):
    if not skill_dir.is_dir():
        continue
    skill_name = skill_dir.name
    item_id = f"sk-omx-{skill_name}"
    
    skill_md = skill_dir / "SKILL.md"
    meta_yaml = skill_dir / "meta.yaml"
    
    title = skill_name
    summary = ""
    tags = []
    
    # 1. First priority: Market metadata if present
    if skill_name in market_meta_map:
        s_meta = market_meta_map[skill_name]
        title = s_meta.get("displayNameZh") or s_meta.get("name") or title
        summary = s_meta.get("summaryZh") or s_meta.get("descCn") or s_meta.get("summary") or s_meta.get("description") or ""
        if s_meta.get("tagsCn"):
            tags = list(s_meta["tagsCn"])
        elif s_meta.get("tags"):
            tags = list(s_meta["tags"])
            
    # 2. Second priority: meta.yaml
    if meta_yaml.exists():
        try:
            m_text = meta_yaml.read_text(encoding="utf-8", errors="ignore")
            m_data = yaml.safe_load(m_text)
            if isinstance(m_data, dict):
                if title == skill_name:
                    title = m_data.get("displayNameZh") or m_data.get("displayName") or m_data.get("name") or title
                if not summary:
                    summary = m_data.get("summaryZh") or m_data.get("descCn") or m_data.get("summary") or m_data.get("description") or ""
                if not tags and m_data.get("tagsCn"):
                    tags = list(m_data["tagsCn"])
                elif not tags and m_data.get("tags"):
                    tags = list(m_data["tags"])
                if not tags and m_data.get("triggerWords"):
                    tags = [str(tw) for tw in m_data["triggerWords"][:3]]
        except Exception as e:
            pass

    # 3. Third priority: SKILL.md frontmatter and heading
    if skill_md.exists():
        try:
            md_text = skill_md.read_text(encoding="utf-8", errors="ignore")
            fm_match = FRONTMATTER_RE.match(md_text)
            if fm_match:
                fm_data = yaml.safe_load(fm_match.group(1))
                if isinstance(fm_data, dict):
                    if not summary and fm_data.get("description"):
                        summary = fm_data["description"]
                    if not tags and fm_data.get("trigger-words"):
                        tags = [str(tw) for tw in fm_data["trigger-words"][:3]]
            if title == skill_name:
                for line in md_text.splitlines():
                    if line.startswith("# "):
                        candidate_title = line[2:].strip().split("—")[0].split("-")[0].strip()
                        if candidate_title and len(candidate_title) <= 30:
                            title = candidate_title
                        break
        except Exception:
            pass

    # Fallback title formatting if still raw kebab
    if title == skill_name:
        title = skill_name.replace("-", " ").title()

    # Clean title
    title = str(title).replace("\n", " ").strip()
    if len(title) > 35:
        title = title[:35]
        
    # Clean summary
    summary = str(summary).replace("\n", " ").replace("\r", " ").strip()
    summary = re.sub(r"\s+", " ", summary)
    if len(summary) > 180:
        summary = summary[:177] + "..."
    if not summary:
        summary = f"{title} 技能，支持多模态生成与自动化创作流程。"

    # Category classification based on keywords/domain
    category = "sk-visual"
    s_lower = (skill_name + " " + title + " " + summary).lower()
    if any(w in s_lower for w in ["writing", "script", "screenwriter", "编剧", "短剧", "剧本", "字幕", "subtitle", "fragment", "写作", "doc", "story"]):
        category = "sk-writing"
    elif any(w in s_lower for w in ["ecommerce", "电商", "detail-page", "详情页", "商品图", "product-photography", "产品摄影", "彩妆"]):
        category = "sk-commerce"
    elif any(w in s_lower for w in ["ad-", "promo", "marketing", "营销", "广告", "social-caption", "社媒", "ugc", "koc", "brand-promo", "宣传"]):
        category = "sk-marketing"
    elif any(w in s_lower for w in ["audio", "music", "voice", "podcast", "asmr", "播客", "有声书", "配音", "音乐", "音色", "助眠", "说唱", "mv"]):
        category = "sk-office"
    elif any(w in s_lower for w in ["slides", "frontend", "code", "dev", "前端", "review"]):
        category = "sk-dev"

    clean_tags = []
    for t in tags:
        t_clean = str(t).strip()
        if t_clean and len(t_clean) <= 12 and t_clean not in clean_tags:
            clean_tags.append(t_clean)
    if not clean_tags:
        clean_tags = ["OmniMux", "多模态"]
    clean_tags = clean_tags[:4]

    item = {
        "id": item_id,
        "tab": "skills",
        "kind": "skill",
        "title": title,
        "subtitle": "",
        "summary": summary,
        "category": category,
        "tags": clean_tags,
        "skill": skill_name,
        "source": {
            "type": "git",
            "repo": "omnimux-ai/OmniMux-skills",
            "path": f"skills/{skill_name}",
            "ref": "main"
        }
    }
    generated_items.append(item)

print(f"Generated {len(generated_items)} items.")
print("Sample 5 items:")
for it in generated_items[:5]:
    print(json.dumps(it, indent=2, ensure_ascii=False))

# Filter out if any item_id already existed (replace or append)
merged_items = [it for it in catalog["items"] if not it["id"].startswith("sk-omx-")]
merged_items.extend(generated_items)
catalog["items"] = merged_items
catalog["generated_at"] = "2026-08-24T18:30:00.000Z"

with open(catalog_path, "w", encoding="utf-8") as f:
    json.dump(catalog, f, indent=2, ensure_ascii=False)
    f.write("\n")

print(f"Successfully wrote {len(merged_items)} items to {catalog_path}.")
