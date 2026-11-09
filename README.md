# payload_telemetry
Payload telemetry code development. Includes onboard firmware and ground station software.

Please run ground station software with following command:

python -m ground_station_software.src.main

# WebSocket server, from repo root (mock data)
.\.venv\Scripts\python.exe -m uvicorn ground_station_software.src.server.sockets.app:app --port 8000

# WebSocket server reading the serial port (PowerShell; port is an example, GS_SERIAL_BAUD is optional)
# Don't run main.py at the same time: only one program can open the port.
$env:GS_SOURCE = "serial"; $env:GS_SERIAL_PORT = "COM6"
.\.venv\Scripts\python.exe -m uvicorn ground_station_software.src.server.sockets.app:app --port 8000
