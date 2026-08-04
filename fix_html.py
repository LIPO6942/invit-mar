with open('index.html', 'r', encoding='utf-8') as f:
    lines = f.readlines()

start = -1
end = -1
for i, line in enumerate(lines):
    if 'weddingProjectsList' in line and 'div' in line:
        start = i
    if start >= 0 and i > start and '</div>' in line:
        end = i
        break

print(f'start={start+1}, end={end+1}')
if start >= 0 and end >= 0:
    new_lines = lines[:start]
    new_lines.append('    <div id="weddingProjectsList" style="display:flex;flex-direction:column;gap:8px;margin-bottom:14px;">\r\n')
    new_lines.append('      <div style="text-align:center;padding:18px;color:#fff3ad;font-family:Amiri,serif;">&#x23F3; \u062c\u0627\u0631\u064a \u062a\u062d\u0645\u064a\u0644 \u0645\u0634\u0627\u0631\u064a\u0639 \u0627\u0644\u0632\u0641\u0627\u0641...</div>\r\n')
    new_lines.append('    </div>\r\n')
    new_lines.extend(lines[end+1:])
    with open('index.html', 'w', encoding='utf-8') as f:
        f.writelines(new_lines)
    print('SUCCESS')
