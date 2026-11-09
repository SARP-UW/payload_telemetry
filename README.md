# payload_telemetry
Payload telemetry code development. Includes onboard firmware and ground station software.

Please run ground station software with following command:

python -m ground_station_software.src.main

# WebSocket server, from repo root
.\.venv\Scripts\python.exe -m uvicorn ground_station_software.src.server.sockets.app:app --port 8000
