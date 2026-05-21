import serial

class RealSerial:
    def __init__(self, port: str, baud: int = 9600, timeout: float = 1):
        """Initializes connection to serial port over USB

        Args:
            port (str): Specified COM port
            baud (int, optional): Specified baud rate in bits per second. Defaults to 9600.
            timeout (float, optional): Specfified timeout in seconds. Defaults to 1.
        """
        self.ser = serial.Serial(port,baud, timeout=timeout)

    def read(self, n: int) -> bytes:
        """Reads data over serial port

        Args:
            n (int): Specfied number of bytes to read

        Returns:
            bytes: Return in raw bytes
        """
        return self.ser.read(n)
    
    def write(self, val: str):
        """Writes data over serial port

        Args:
            val (str): Specified value to write 

        Returns:
            Output of given byte string over serial port
        """
        temp = f'{val}\n'.encode()

        return self.ser.write(temp)

class FakeSerial:
    def __init__(self, data: bytes):
        """Initializes a fake serial port over USB and generates a bytestream

        Args:
            data (bytes): Specified data to "generate" over the connection
        """
        self.data = data
        self.index = 0
    
    def read(self, n: int) -> bytes:
        """Emulates reading over serial port for testing

        Args:
            n (int): Specfied number of bytes to read

        Returns:
            bytes: Return in raw bytes
        """
        if self.index >= len(self.data):
            return b""
        
        chunk = self.data[self.index:self.index+n]
        self.index += n
        return chunk