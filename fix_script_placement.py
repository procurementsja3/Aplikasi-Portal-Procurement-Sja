#!/usr/bin/env python3

with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Locate the end of </html>
html_end_tag = "</html>"
idx_html_end = content.find(html_end_tag)

if idx_html_end == -1:
    print("Error: </html> not found")
    exit(1)

# Extract dangling code after </html>
dangling_code = content[idx_html_end + len(html_end_tag):].strip()
content_clean = content[:idx_html_end + len(html_end_tag)]

print(f"Extracted {len(dangling_code)} chars of dangling code after </html>")

# 2. Insert the functions right after printActiveLabel()
anchor = """            setTimeout(() => {
                document.body.classList.remove('printing-label-active');
                if (printArea) printArea.innerHTML = '';
            }, 1200);
        }"""

if anchor not in content_clean:
    print("Error: anchor for printActiveLabel not found")
    exit(1)

replacement = anchor + "\n\n        " + dangling_code

content_final = content_clean.replace(anchor, replacement, 1)

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content_final)
print("Saved fixed index.html")

with open('sibikom.html', 'w', encoding='utf-8') as f:
    f.write(content_final)
print("Saved fixed sibikom.html")
