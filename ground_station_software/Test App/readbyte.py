import serial
import time

ser = serial.Serial('COM3', 9600, timeout=1)
time.sleep(2)

while True:
    if ser.in_waiting  > 0:
        #currently unknown num of bytes being sent
        output = ser.readline().decode('utf-8').rstrip()
        #test
        print(output)



#two's complement checksum
def chksum(packet: bytes) -> int:

    #if packet is odd, add an empty bit to make it even (parity)
    #this means we LOST some data somewhere
    if len(packet) % 2 != 0:
        packet += b'\0'
    
    #array of unsigned shorts (2 bytes each)
    #byte string is therefore made of 16-bit ints
    res = sum(array.array("H", packet))

    #two's complement (-res == ~res + 1)
    return (-res) & 0xffff        



