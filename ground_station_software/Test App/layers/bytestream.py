import serial

#object to connect to blackpill
class RealSerial:
    def __init__(self, port: str, baud: int = 9600, timeout: float = 1):
        self.ser = serial.Serial(port,baud, timeout=timeout)

    def read(self, n: int) -> bytes:
        return self.ser.read(n)
    
    def write(self, val: str):
        print(f'writing ts shit: "{val}"')

        val = b'val\n'

        return self.ser.write(val)

#object to test
class FakeSerial:
    def __init__(self, data: bytes):
        self.data = data
        self.index = 0
    
    def read(self, n: int) -> bytes:
        if self.index >= len(self.data):
            return b""
        
        chunk = self.data[self.index:self.index+n]
        self.index += n
        return chunk