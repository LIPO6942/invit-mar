import sys
sys.stdout.reconfigure(encoding='utf-8')

with open('app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Remove old duplicate openWeddingSwitcherModal (lines 4027-4042 inclusive, 1-indexed)
start = 4026  # 0-indexed
end = 4042    # 0-indexed exclusive

print(f'Removing {end - start} lines ({start+1} to {end})')
new_lines = lines[:start] + lines[end:]

with open('app.js', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f'SUCCESS. New total: {len(new_lines)} lines')
