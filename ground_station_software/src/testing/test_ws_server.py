import dataclasses
import json
import logging
import random
import struct
import threading
import time

import pytest
from fastapi.testclient import TestClient

from ground_station_software.src.constants import HEADER, Packet
from ground_station_software.src.server.drivers import serial_ingestion
from ground_station_software.src.server.parsers import packet_parser
from ground_station_software.src.server.sockets import sources
from ground_station_software.src.server.sockets.app import create_app
from ground_station_software.src.server.sockets.commands import handle_request
from ground_station_software.src.server.sockets.config import (
    DEFAULT_SLOT_BY_PERIPHERAL,
    load_slot_configs,
    resolve_slot_map,
)
from ground_station_software.src.server.sockets.packager import DataPackager
from ground_station_software.src.server.sockets.registry import ConnectionRegistry
from ground_station_software.src.server.sockets.structured import StructuredPacket

SLOTS = {"reserved", "user1", "user2"}
TELEMETRY_KEYS = {"type", "seq", "t_ms", "slot", "peripheral_id", "src_seq", "data"}


def write_configs(tmp_path, user1_pid="1", user2_pid="2"):
    def doc(entry):
        return json.dumps({"version": "1.0", "configurations": [entry]})

    (tmp_path / "reserve.json").write_text(doc({"gps": "-1", "peripheral_count": "2"}))
    (tmp_path / "user1.json").write_text(doc({"peripheral_id": user1_pid, "graph_1_type": "bar"}))
    (tmp_path / "user2.json").write_text(doc({"peripheral_id": user2_pid, "graph_1_type": "pie"}))
    return tmp_path


def command(**overrides):
    msg = {"type": "command", "cmd_seq": 7, "target": "user1", "command": "[cmd]", "args": {}}
    msg.update(overrides)
    return msg


# --- config -----------------------------------------------------------------


def test_config_loads_each_slot(tmp_path):
    configs = load_slot_configs(write_configs(tmp_path))
    assert set(configs) == SLOTS
    assert configs["user1"]["graph_1_type"] == "bar"


def test_valid_config_ids_match_defaults(tmp_path):
    assert resolve_slot_map(load_slot_configs(write_configs(tmp_path))) == DEFAULT_SLOT_BY_PERIPHERAL


def test_valid_config_override_is_applied(tmp_path):
    slot_map = resolve_slot_map(load_slot_configs(write_configs(tmp_path, user1_pid="5", user2_pid="6")))
    assert slot_map == {0: "reserved", 5: "user1", 6: "user2"}


def test_duplicate_config_ids_keep_defaults_and_warn(tmp_path, caplog):
    configs = load_slot_configs(write_configs(tmp_path, user1_pid="1", user2_pid="1"))
    with caplog.at_level(logging.WARNING, logger="uvicorn.error"):
        slot_map = resolve_slot_map(configs)
    assert slot_map == DEFAULT_SLOT_BY_PERIPHERAL
    assert "conflicting peripheral_id" in caplog.text


def test_missing_config_file_gives_empty_slot(tmp_path, caplog):
    with caplog.at_level(logging.WARNING, logger="uvicorn.error"):
        configs = load_slot_configs(tmp_path)
    assert configs == {slot: {} for slot in SLOTS}


def test_real_userconfigs_load():
    configs = load_slot_configs()
    assert set(configs) == SLOTS
    assert set(resolve_slot_map(configs).values()) == SLOTS


# --- packager ---------------------------------------------------------------


def test_packager_tags_slot_and_counts_seq_across_slots():
    packager = DataPackager(DEFAULT_SLOT_BY_PERIPHERAL)
    msgs = [packager.package(StructuredPacket(pid, {"x": pid}, 10 + pid)) for pid in (0, 1, 2, 0)]
    assert [m["slot"] for m in msgs] == ["reserved", "user1", "user2", "reserved"]
    assert [m["seq"] for m in msgs] == [0, 1, 2, 3]
    assert set(msgs[0]) == TELEMETRY_KEYS
    assert msgs[1]["src_seq"] == 11 and msgs[1]["data"] == {"x": 1}


def test_packager_drops_unknown_peripheral():
    packager = DataPackager(DEFAULT_SLOT_BY_PERIPHERAL)
    assert packager.package(StructuredPacket(9, {})) is None
    assert packager.unknown == 1
    assert packager.package(StructuredPacket(0, {}))["seq"] == 0


# --- registry ---------------------------------------------------------------


def test_registry_drops_oldest_when_full():
    registry = ConnectionRegistry(maxsize=2)
    q = registry.register()
    for i in range(3):
        registry.broadcast({"i": i})
    assert [q.get_nowait()["i"] for _ in range(q.qsize())] == [1, 2]


def test_registry_unregister():
    registry = ConnectionRegistry()
    q = registry.register()
    registry.unregister(q)
    registry.broadcast({"i": 0})
    assert len(registry) == 0 and q.empty()


# --- commands ---------------------------------------------------------------


def test_valid_command_is_acknowledged_not_sent():
    ack = handle_request(json.dumps(command()))
    assert ack == {"type": "command_ack", "cmd_seq": 7, "status": "not_sent", "reason": "uplink not implemented"}


def test_malformed_requests_are_rejected_without_raising():
    bad = [
        "not json",
        b"\xff\xfe",
        None,
        "[]",
        json.dumps({"type": "other"}),
        json.dumps(command(cmd_seq="7")),
        json.dumps(command(cmd_seq=True)),
        json.dumps(command(target="user9")),
        json.dumps(command(command="")),
        json.dumps(command(args=[1])),
    ]
    for raw in bad:
        ack = handle_request(raw)
        assert ack["type"] == "command_ack"
        assert ack["status"] == "rejected", raw


# --- websocket --------------------------------------------------------------


def fast(monkeypatch, drop=0.0):
    monkeypatch.setattr(sources, "SEND_HZ", 100.0)
    monkeypatch.setattr(sources, "DROP_PROB", drop)


def test_ws_sends_config_then_telemetry_from_all_slots(monkeypatch, tmp_path):
    fast(monkeypatch)
    app = create_app(config_dir=write_configs(tmp_path))
    with TestClient(app) as client, client.websocket_connect("/ws") as ws:
        config = ws.receive_json()
        msgs = [ws.receive_json() for _ in range(9)]

    assert config["type"] == "config"
    assert set(config["slots"]) == SLOTS
    assert config["slots"]["user1"]["graph_1_type"] == "bar"
    for m in msgs:
        assert m["type"] == "telemetry"
        assert set(m) == TELEMETRY_KEYS
    assert {m["slot"] for m in msgs} == SLOTS
    seqs = [m["seq"] for m in msgs]
    assert all(b > a for a, b in zip(seqs, seqs[1:]))


def receive_until(ws, msg_type, limit=200):
    for _ in range(limit):
        msg = ws.receive_json()
        if msg["type"] == msg_type:
            return msg
    raise AssertionError(f"no {msg_type} message within {limit} messages")


def test_ws_command_ack_and_connection_survives_bad_request(monkeypatch, tmp_path):
    fast(monkeypatch)
    app = create_app(config_dir=write_configs(tmp_path))
    with TestClient(app) as client, client.websocket_connect("/ws") as ws:
        ws.send_json(command(cmd_seq=42))
        ack = receive_until(ws, "command_ack")
        assert ack["cmd_seq"] == 42 and ack["status"] == "not_sent"

        ws.send_text("not json")
        assert receive_until(ws, "command_ack")["status"] == "rejected"

        # Still streaming after the bad request.
        assert receive_until(ws, "telemetry")["type"] == "telemetry"


def test_publish_from_another_thread_reaches_client(tmp_path):
    app = create_app(config_dir=write_configs(tmp_path), source_factory=None)
    with TestClient(app) as client, client.websocket_connect("/ws") as ws:
        assert ws.receive_json()["type"] == "config"
        pkt = StructuredPacket(2, {"[field_1]": 1.5}, 99)
        t = threading.Thread(target=app.state.publish, args=(pkt,))
        t.start()
        t.join()
        msg = ws.receive_json()

    assert msg["slot"] == "user2" and msg["src_seq"] == 99 and msg["data"] == {"[field_1]": 1.5}
    assert len(app.state.registry) == 0  # closed client no longer receives broadcasts


def test_drops_show_as_src_seq_gaps_not_seq_gaps(monkeypatch, tmp_path):
    random.seed(1234)
    fast(monkeypatch, drop=0.5)
    app = create_app(config_dir=write_configs(tmp_path))
    with TestClient(app) as client, client.websocket_connect("/ws") as ws:
        ws.receive_json()  # config
        msgs = [ws.receive_json() for _ in range(60)]

    seqs = [m["seq"] for m in msgs]
    assert all(b - a == 1 for a, b in zip(seqs, seqs[1:]))

    by_slot: dict[str, list[int]] = {}
    for m in msgs:
        by_slot.setdefault(m["slot"], []).append(m["src_seq"])
    gaps = [b - a > 1 for s in by_slot.values() for a, b in zip(s, s[1:])]
    assert any(gaps)


# --- serial source ----------------------------------------------------------

PARSED = Packet(7, 20.5, 47.6, -122.3, 1000.0, 1.7e9, 12.0)


class FakePort:
    """Serves chunks (after gate is set, if given), then reads time out: calls on_empty, returns b""."""

    def __init__(self, chunks, on_empty=lambda: None, gate=None):
        self.chunks = list(chunks)
        self.on_empty = on_empty
        self.gate = gate
        self.closed = False

    def read(self, n):
        if self.gate is not None:
            self.gate.wait(timeout=5)  # bounded, so a failing test can't hang the reader thread
        if self.chunks:
            return self.chunks.pop(0)
        self.on_empty()
        time.sleep(0.01)
        return b""

    def close(self):
        self.closed = True


class BrokenPort(FakePort):
    def read(self, n):
        raise OSError("device unplugged")


def stand_in_parser(monkeypatch):
    # The parser can't yet produce a packet from a real frame, so stand in for validate/parse.
    monkeypatch.setattr(serial_ingestion, "validate_packet", lambda raw: None)
    monkeypatch.setattr(packet_parser, "parse_packet", lambda raw: PARSED)


def test_serial_source_drops_bad_frames_without_stopping():
    header = struct.pack(">H", HEADER)
    junk = [
        b"\x00" * 34,  # wrong header
        header + b"\x00" * 32,  # right header, checksum can't match
        header + b"\x00" * 36,  # full-size frame, checksum can't match
        header,  # truncated
    ]
    published = []
    src = sources.SerialSource(published.append, "FAKE", open_port=lambda: FakePort(junk, src.stop))
    src.read_forever()

    assert published == []
    assert src.bad == len(junk) and src.good == 0


def test_serial_source_publishes_parsed_packet_as_reserved(monkeypatch):
    stand_in_parser(monkeypatch)
    published = []
    src = sources.SerialSource(published.append, "FAKE", open_port=lambda: FakePort([b"frame"], src.stop))
    src.read_forever()

    assert published == [StructuredPacket(0, dataclasses.asdict(PARSED), 7)]
    assert src.good == 1


def test_serial_source_reopens_after_port_errors(monkeypatch):
    monkeypatch.setattr(sources, "REOPEN_S", 0.0)
    ports = []
    attempts = 0

    def open_port():
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            raise OSError("port busy")
        port = BrokenPort([]) if attempts == 2 else FakePort([], src.stop)
        ports.append(port)
        return port

    src = sources.SerialSource(lambda pkt: None, "FAKE", open_port=open_port)
    src.read_forever()

    assert attempts == 3
    assert all(p.closed for p in ports)


def test_source_factory_from_env():
    assert sources.source_factory_from_env({}) is sources.MockSource
    assert sources.source_factory_from_env({"GS_SOURCE": "MOCK"}) is sources.MockSource

    factory = sources.source_factory_from_env(
        {"GS_SOURCE": "serial", "GS_SERIAL_PORT": "COM_TEST", "GS_SERIAL_BAUD": "1234"}
    )
    src = factory(lambda pkt: None)
    assert isinstance(src, sources.SerialSource)
    assert src._port == "COM_TEST" and src._baud == 1234

    for env in (
        {"GS_SOURCE": "serial"},
        {"GS_SOURCE": "radio"},
        {"GS_SOURCE": "serial", "GS_SERIAL_PORT": "COM_TEST", "GS_SERIAL_BAUD": "fast"},
    ):
        with pytest.raises(ValueError):
            sources.source_factory_from_env(env)


def test_ws_streams_from_serial_source(monkeypatch, tmp_path):
    stand_in_parser(monkeypatch)
    connected = threading.Event()  # hold the frames until the client is registered

    def factory(publish):
        return sources.SerialSource(publish, "FAKE", open_port=lambda: FakePort([b"frame"] * 3, gate=connected))

    app = create_app(config_dir=write_configs(tmp_path), source_factory=factory)
    with TestClient(app) as client, client.websocket_connect("/ws") as ws:
        assert ws.receive_json()["type"] == "config"
        connected.set()
        msgs = [ws.receive_json() for _ in range(3)]

    for m in msgs:
        assert m["slot"] == "reserved" and m["peripheral_id"] == 0 and m["src_seq"] == 7
        assert m["data"] == dataclasses.asdict(PARSED)
    assert [m["seq"] for m in msgs] == [0, 1, 2]
