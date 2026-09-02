import sys
from pathlib import Path

# agent/ modules are imported flat (e.g. `import auth`), matching how the
# app runs from that directory.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "agent"))
