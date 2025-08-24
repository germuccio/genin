#!/usr/bin/env python3

import re

# Read the file
with open('packages/api/src/minimal-server-clean.ts', 'r') as f:
    content = f.read()

# Remove the order conversion endpoints by finding their start and end
lines = content.split('\n')
new_lines = []
skip_until_closing = False
brace_count = 0
endpoint_start_patterns = [
    r"^app\.post\('/api/visma/orders/.*convert",
    r"^// Convert a Visma Order to"
]

i = 0
while i < len(lines):
    line = lines[i]
    
    # Check if this line starts an order conversion endpoint
    is_endpoint_start = any(re.search(pattern, line) for pattern in endpoint_start_patterns)
    
    if is_endpoint_start:
        # Skip this endpoint until we find the matching closing brace
        skip_until_closing = True
        brace_count = 0
        
        # If it's a comment, also skip the next line (the app.post)
        if line.startswith('//'):
            i += 1
            if i < len(lines):
                line = lines[i]
        
        # Count opening braces in the app.post line
        brace_count += line.count('{') - line.count('}')
        i += 1
        continue
    
    if skip_until_closing:
        brace_count += line.count('{') - line.count('}')
        if brace_count <= 0 and '});' in line:
            skip_until_closing = False
            i += 1
            continue
    
    if not skip_until_closing:
        new_lines.append(line)
    
    i += 1

# Write the cleaned content
with open('packages/api/src/minimal-server-clean.ts', 'w') as f:
    f.write('\n'.join(new_lines))

print("Removed order conversion endpoints from minimal-server-clean.ts")

