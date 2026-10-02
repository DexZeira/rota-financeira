with open('src/components/connected-accounts.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# The file currently has:
# 1. if (!bankingIntegrationEnabled) early return - GOOD
# 2. Mock mode return starting at line ~169 - GOOD but incomplete
# 3. Then a huge return block that was the old mock mode - NEEDS REPLACEMENT

# Find the end of the current mock mode return and the start of the old return block
# The old return block starts with "<section className=\"connected-accounts\"" after the mock mode

# Let's find where the mock mode return ends and the old structure begins
# The mock mode return currently ends with ");" and then there's the old code

# Strategy: Find the "if (!bankingIntegrationEnabled)" and then replace everything after it
# with a complete conditional structure

# First, let's find the exact position after the bankingIntegrationEnabled check
idx_banking = content.find("if (!bankingIntegrationEnabled)")
if idx_banking == -1:
    print("ERROR: bankingIntegrationEnabled not found")
    exit(1)

# Find the end of that early return block
idx_after_early = content.find(");\n", idx_banking)
if idx_after_early == -1:
    print("ERROR: end of early return not found")
    exit(1)
idx_after_early += 2  # include the ); 

# Now we need to find where the old return block starts (the big one)
# It should be after "if (mode === 'mock')" block
idx_mock = content.find("// Mock mode - demo UI", idx_after_early)
if idx_mock == -1:
    idx_mock = content.find("if (mode === 'mock')", idx_after_early)
if idx_mock == -1:
    print("ERROR: mock mode not found")
    exit(1)

# Find the end of the mock mode return - it should end with ");"
# Then there's the old code that we need to replace
idx_mock_return_start = content.find("return (", idx_mock)
if idx_mock_return_start == -1:
    print("ERROR: mock return not found")
    exit(1)

# Find the end of the mock mode return - look for ");" at the right indentation
# This is tricky. Let's find the next major section after mock mode
# The old code after mock mode starts with the old return block

# Actually, let me take a different approach. Let me find the very last return statement
# in the function and work backwards.

# Find all "return (" occurrences after the banking check
returns = []
pos = idx_after_early
while True:
    idx = content.find("return (", pos)
    if idx == -1:
        break
    returns.append(idx)
    pos = idx + 1

print(f"Found {len(returns)} return statements after banking check")
for i, r in enumerate(returns):
    # Show context
    ctx = content[r:r+50]
    print(f"  {i}: pos={r}, ctx={repr(ctx)}")

# The last return should be the main one we want to replace
if returns:
    main_return = returns[-1]
    print(f"\nMain return at position {main_return}")

    # Find the matching closing ); for this return
    # This is complex due to nested returns. Let's find the end of the function.
    # The function ends with "};" or just "}"
    func_end = content.rfind("}")
    print(f"Function ends at {func_end}")

    # The main return should end before the function end
    # Let's extract the main return block
    main_block = content[main_return:func_end]
    print(f"Main block length: {len(main_block)}")

with open('src/components/connected-accounts.tsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

print(f"\nTotal lines: {len(lines)}")

# Find key line numbers
for i, line in enumerate(lines):
    if "if (!bankingIntegrationEnabled)" in line:
        print(f"Line {i+1}: bankingIntegrationEnabled check")
    if "if (mode === 'mock')" in line and "Mock mode" in line:
        print(f"Line {i+1}: Mock mode")
    if "return (" in line and "section" in lines[lines.index(line)+1] if lines.index(line)+1 < len(lines) else False:
        print(f"Line {i+1}: return with section")
    if "<section className=\"connected-accounts\"" in line:
        print(f"Line {i+1}: section connected-accounts")