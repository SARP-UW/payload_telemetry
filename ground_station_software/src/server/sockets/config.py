"""Loads the user configs (server side) and resolves which peripheral feeds which slot.

The config files in server/userconfigs/ are Thomas's; this module only reads them.
"""

import json
import logging
from pathlib import Path

logger = logging.getLogger("uvicorn.error")

CONFIG_DIR = Path(__file__).resolve().parent.parent / "userconfigs"

SLOT_FILES = {"reserved": "reserve.json", "user1": "user1.json", "user2": "user2.json"}

# Peripheral header indices from the firmware "Add Headers and Footers" slide.
DEFAULT_SLOT_BY_PERIPHERAL = {0: "reserved", 1: "user1", 2: "user2"}  # [confirm with Christian]


def load_slot_configs(config_dir: Path = CONFIG_DIR) -> dict[str, dict]:
    """Return each slot's first configuration entry, or {} if it can't be read.

    Only "configurations" is read, so a malformed "version" key doesn't matter.
    Values are passed through as-is (the files currently store numbers as strings).
    """
    configs: dict[str, dict] = {}
    for slot, name in SLOT_FILES.items():
        path = Path(config_dir) / name
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
            entry = doc["configurations"][0]
            configs[slot] = dict(entry) if isinstance(entry, dict) else {}
        except (OSError, ValueError, KeyError, IndexError, TypeError) as e:
            logger.warning("config: could not load %s (%s); slot %r has no config", name, e, slot)
            configs[slot] = {}
    return configs


def _as_peripheral_id(value: object) -> int | None:
    try:
        pid = int(value)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return None
    return pid if pid >= 0 else None


def resolve_slot_map(configs: dict[str, dict]) -> dict[int, str]:
    """Map peripheral_id -> slot.

    Starts from the firmware defaults. A slot's config peripheral_id overrides its
    default only if the result is still one peripheral per slot; otherwise a
    warning is logged and the defaults are used.
    """
    candidate = {slot: pid for pid, slot in DEFAULT_SLOT_BY_PERIPHERAL.items()}
    for slot, cfg in configs.items():
        pid = _as_peripheral_id(cfg.get("peripheral_id"))
        if slot in candidate and pid is not None:
            candidate[slot] = pid

    by_pid: dict[int, list[str]] = {}
    for slot, pid in candidate.items():
        by_pid.setdefault(pid, []).append(slot)
    conflicts = {pid: slots for pid, slots in by_pid.items() if len(slots) > 1}

    if conflicts:
        detail = ", ".join(f"peripheral {pid} claimed by {'/'.join(s)}" for pid, s in conflicts.items())
        logger.warning("config: conflicting peripheral_id in user configs (%s); using firmware defaults", detail)
        return dict(DEFAULT_SLOT_BY_PERIPHERAL)

    return {pid: slot for slot, pid in candidate.items()}
