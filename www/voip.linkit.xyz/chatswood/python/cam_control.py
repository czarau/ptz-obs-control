# https://visca-over-ip.readthedocs.io/en/latest/camera.html
# visca-over-ip is UDP only so re-implemented here for TCP
import argparse
import sys
import time
import socket
from typing import Optional, Tuple

class CameraPTZOptics:
    def __init__(self, ip: str, port=5678):
        self._location = (ip, port)
        self._sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)  # TCP
        self._sock.connect((ip, port))
        #self._sock.settimeout(0.1)
        self._sock.settimeout(20)

        self.num_missed_responses = 0
        self.num_retries = 10

    def _send_command(self, command_hex: str, query=False) -> Optional[bytes]:
        payload_type = b'\x01\x00'
        preamble = b'\x81' + (b'\x09' if query else b'\x01')
        terminator = b'\xff'

        payload_bytes = preamble + bytearray.fromhex(command_hex) + terminator
        payload_length = len(payload_bytes).to_bytes(2, 'big')

        exception = None
        for retry_num in range(self.num_retries):

            message = preamble + bytearray.fromhex(command_hex) + terminator
            self._sock.sendall(message)

            try:
                response = self._receive_response()
            except ViscaException as exc:
                exception = exc
            else:
                if response is not None:
                    return response
                elif not query:
                    return None
        if exception:
            raise exception
        else:
            raise exception(f'Could not get a response after {self.num_retries} tries')

    def _receive_response(self) -> Optional[bytes]:
        ilen = 0
        response = b'';
        terminator = b'\xff'
        
        while True:
            try:
                byte = self._sock.recv(1)
                response += byte

                if byte == terminator:
                    if len(response) == 3 and response[0] == 0x90 and response[1] >= 0x40 and response[1] <= 0x4f and response[2] == 0xff:
                        #print("CMD ACKNOWLEDGED")
                        response = b''
                    elif len(response) == 3 and response[0] ==0x90 and response[1] >= 0x50 and response[1] <= 0x5f and response[2] == 0xff:
                        #print("CMD COMPLETE")                          
                        return 'COMPLETE'
                    elif len(response) == 3 and response[0] ==0x90 and response[1] >= 0x60 and response[1] <= 0x6f and response[2] == 0xff:
                        print(f"CMD ERROR!!: {len(response)} {response!r}") 
                        return 'ERROR'
                        # 90 60 02 FF SYNTAX_ERROR
                        # 90 60 03 FF Command Buffer Full
                        # 90 60 04 FF Command Canceled
                        # 90 6y 05 FF No Socket 
                        # 90 6y 41 FF Command Not Executable                        
                    else:
                        #print(f"CMD OTHER: {len(response)} {response!r}")           
                        return response

            except socket.timeout:  # Occasionally we don't get a response?
                self.num_missed_responses += 1
                break
            
        return response
            
    def close_connection(self):
        self._sock.close()
        
    @staticmethod
    def _zero_padded_bytes_to_int(zero_padded: bytes, signed=True) -> int:
        """:param zero_padded: bytes like this: 0x01020304
        """
        unpadded_bytes = bytes.fromhex(zero_padded.hex()[1::2])
        return int.from_bytes(unpadded_bytes, 'big', signed=signed)

    def get_pantilt_position(self) -> Tuple[int, int]:
        data = cam._send_command('06 12', query=True)
        pan = 0
        tilt = 0

        if len(data) == 11 and data[0] == 0x90 and data[1] == 0x50:
            #print(f"PTZ: {data!r}")
            pan = self._zero_padded_bytes_to_int(data[2:6]);
            tilt =  self._zero_padded_bytes_to_int(data[6:10]);
    
        return pan, tilt
        
    def get_focus_mode(self) -> str:
        data = cam._send_command('04 38', query=True) 

        if len(data) == 4 and data[0] == 0x90 and data[1] == 0x50 and data[2] == 0x02:
            return 'auto'
        if len(data) == 4 and data[0] == 0x90 and data[1] == 0x50 and data[2] == 0x03:
            return 'manual'

        return 'unknown'

    def get_zoom_position(self) -> int:
        data = cam._send_command('04 47', query=True) 
        zoom = 0
        
        if len(data) == 7 and data[0] == 0x90 and data[1] == 0x50:
            #print(f"Zoom: {data!r}")
            zoom = self._zero_padded_bytes_to_int(data[2:6], signed=False)
    
        return zoom
        
    def get_focus_position(self) -> int:
        data = cam._send_command('04 48', query=True) 
        focus = 0
        
        if len(data) == 7 and data[0] == 0x90 and data[1] == 0x50:
            #print(f"Zoom: {data!r}")
            focus = self._zero_padded_bytes_to_int(data[2:6], signed=False)
    
        return focus       

    def set_preset_speed(self, speed: int) -> str :
        # 0x01.. 0x18
        if speed < 16:
          return cam._send_command(f'06 01 0{speed:x}')
        else:
          return cam._send_command(f'06 01 {speed:x}')

    def recall_preset(self, preset_num: int):
        if preset_num < 16:
            data = cam._send_command(f'04 3F 02 0{preset_num:x}') 
        else:
            data = cam._send_command(f'04 3F 02 {preset_num:x}') 

# print("PTZ Optics Control v1.0")
# https://ptzoptics.com/wp-content/uploads/2020/11/PTZOptics-VISCA-over-IP-Rev-1_2-8-20.pdf

parser = argparse.ArgumentParser()
parser.add_argument("-i", "--ip", required=True)
parser.add_argument("-c", "--cmd", required=False)
parser.add_argument("-p", "--val", required=False)
args = parser.parse_args()

cam = CameraPTZOptics(args.ip, 5678)

response = '';

if args.cmd == 'goto':
    #print("Sending To Preset 100...")
    cam.recall_preset(int(args.val))
    
if args.cmd == 'preset_speed':
    #print("Sending To Preset 100...")
    response = cam.set_preset_speed(int(args.val))

#print("Getting PTZ Position...")
pan, tilt = cam.get_pantilt_position();
#print("Getting Zoom Position...")
zoom = cam.get_zoom_position();
#print("Getting Focus Position...")
focus = cam.get_focus_position();

print("{")
print(f"  camera: \"{args.ip}\",")

if response != '':
  print(f"  response: \"{response}\",")

print(f"  pan: {pan},")
print(f"  tilt: {tilt},")
print(f"  zoom: {zoom},")
print(f"  focus: {focus}")
print("}")
