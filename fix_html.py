with open('app.js', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Remove lines 3830-3909 (0-indexed: 3829-3908)
start = 3829  # "  // Ensure Firebase is initialized"
end = 3909    # second closing "}"

new_lines = lines[:start] + lines[end:]

with open('app.js', 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f'Removed lines {start+1} to {end} ({end-start} lines)')
print(f'New total lines: {len(new_lines)}')
