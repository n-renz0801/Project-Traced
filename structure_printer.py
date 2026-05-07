import os

SKIP = {"env", "__pycache__", ".git", ".venv", "node_modules"}

def print_tree(root=".", prefix=""):
    entries = sorted(os.listdir(root))
    for entry in entries:
        if entry in SKIP:
            continue
        path = os.path.join(root, entry)
        if os.path.isdir(path):
            print(f"{prefix}\\{entry}")
            print_tree(path, prefix + "   ")
        else:
            print(f"{prefix}| {entry}")

print_tree()