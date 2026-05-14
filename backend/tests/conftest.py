from pathlib import Path
import sys


BACKEND_ROOT = Path(__file__).resolve().parents[1]
APP_DIR = BACKEND_ROOT / "app"

sys.path.insert(0, str(BACKEND_ROOT))

loaded_app = sys.modules.get("app")
if loaded_app is not None:
    locations = [Path(p).resolve() for p in getattr(loaded_app, "__path__", [])]
    module_file = getattr(loaded_app, "__file__", None)
    if module_file:
        locations.append(Path(module_file).resolve())

    is_local_app = any(path == APP_DIR or path.is_relative_to(APP_DIR) for path in locations)
    if not is_local_app:
        del sys.modules["app"]

assert APP_DIR.is_dir(), f"Expected backend app package at {APP_DIR}"
