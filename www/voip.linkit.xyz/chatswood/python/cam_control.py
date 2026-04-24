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

    @staticmethod
    def _int_to_nibbles(value, nibbles=4):
        """Split a signed int into VISCA zero-padded nibble bytes. Each hex
        digit becomes its own byte with high nibble 0 — e.g. 0x1F 0x3A →
        '01 0F 03 0A'. Negative values encoded as two's complement over the
        specified nibble width."""
        if value < 0:
            value = value + (1 << (nibbles * 4))
        hex_str = f'{value & ((1 << nibbles*4) - 1):0{nibbles}x}'
        return ' '.join(f'0{c}' for c in hex_str)

    def set_pantilt_position(self, pan, tilt, pan_speed=0x14, tilt_speed=0x14):
        # VISCA: 81 01 06 02 VV WW 0p 0p 0p 0p 0t 0t 0t 0t FF
        pan_nib  = self._int_to_nibbles(int(pan),  4)
        tilt_nib = self._int_to_nibbles(int(tilt), 4)
        return cam._send_command(f'06 02 {pan_speed:02x} {tilt_speed:02x} {pan_nib} {tilt_nib}')

    def set_zoom_position(self, zoom):
        # VISCA: 81 01 04 47 0z 0z 0z 0z FF
        return cam._send_command(f'04 47 {self._int_to_nibbles(int(zoom), 4)}')

    def set_focus_position(self, focus):
        # VISCA: 81 01 04 48 0f 0f 0f 0f FF  (camera must be in manual focus)
        return cam._send_command(f'04 48 {self._int_to_nibbles(int(focus), 4)}')

    def set_focus_auto(self):
        # VISCA: 81 01 04 38 02 FF  — continuous autofocus
        return cam._send_command('04 38 02')

    def set_focus_manual(self):
        # VISCA: 81 01 04 38 03 FF  — manual focus
        return cam._send_command('04 38 03')

    def focus_onepush(self):
        # VISCA: 81 01 04 18 01 FF  — one-push AF trigger (valid in manual mode)
        return cam._send_command('04 18 01')

# print("PTZ Optics Control v1.0")
# https://ptzoptics.com/wp-content/uploads/2020/11/PTZOptics-VISCA-over-IP-Rev-1_2-8-20.pdf

parser = argparse.ArgumentParser()
parser.add_argument("-i", "--ip", required=True)
parser.add_argument("-c", "--cmd", required=False)
parser.add_argument("-p", "--val", required=False)
parser.add_argument("-P", "--port", required=False, type=int, default=5678)
parser.add_argument("--pan",   type=int, required=False)
parser.add_argument("--tilt",  type=int, required=False)
parser.add_argument("--zoom",  type=int, required=False)
parser.add_argument("--focus", type=int, required=False)
args = parser.parse_args()

cam = CameraPTZOptics(args.ip, args.port)

# VISCA responses come back as either the string 'COMPLETE' / 'ERROR' or raw
# bytes when the camera returns something _receive_response doesn't classify
# (e.g. a 4-byte 90-60-XX-FF error which the existing length==3 check
# misses). Bytes blow up json.dumps, so normalise everything through this
# helper before stuffing into _out.
def _jsonable(r):
    if r is None or r == '':
        return None
    if isinstance(r, (bytes, bytearray)):
        return r.hex()
    return str(r)

response = ''
steps = []  # per-axis responses for goto_abs so we can see which step failed
focus_prior_mode = None  # 'auto' | 'manual' | 'unknown' — top-level of _out, not a step

if args.cmd == 'goto':
    #print("Sending To Preset 100...")
    cam.recall_preset(int(args.val))

if args.cmd == 'preset_speed':
    #print("Sending To Preset 100...")
    response = cam.set_preset_speed(int(args.val))

if args.cmd == 'focus_auto':
    response = cam.set_focus_auto()

if args.cmd == 'focus_manual':
    response = cam.set_focus_manual()

if args.cmd == 'focus_onepush':
    response = cam.focus_onepush()

if args.cmd == 'goto_abs':
    # Send the camera to an absolute pan/tilt/zoom/focus read from JSON
    # rather than an onboard preset slot. Immune to firmware preset wipes.
    # Any omitted axis is left untouched. Each axis's raw response is
    # recorded so the PHP / JS activity log can identify which step the
    # camera rejected (e.g. focus-direct while AF is on).
    if args.pan is not None and args.tilt is not None:
        r = cam.set_pantilt_position(args.pan, args.tilt)
        steps.append({"axis": "pantilt", "response": _jsonable(r)})
        response = r
    if args.zoom is not None:
        r = cam.set_zoom_position(args.zoom)
        steps.append({"axis": "zoom", "response": _jsonable(r)})
        response = r
    if args.focus is not None:
        # VISCA 04 48 (Focus Direct) only executes in manual-focus mode. If
        # the camera is currently in AF the command comes back "Command
        # Not Executable" (90 6y 41 FF). Strategy: remember the pre-recall
        # mode, force MF long enough to land the exact captured focus
        # value, then restore the original mode so AF-preferring operators
        # keep AF and MF-preferring ones keep MF. No silent mode-swap.
        #
        # The prior mode is a QUERY result (auto|manual|unknown), not a
        # command response — emit it at the top level of _out so the
        # "all steps should be COMPLETE" check doesn't flag it as a
        # failure.
        prior_mode = cam.get_focus_mode()
        focus_prior_mode = prior_mode
        r_mf = cam.set_focus_manual()
        steps.append({"axis": "focus_mode_mf", "response": _jsonable(r_mf)})
        r = cam.set_focus_position(args.focus)
        steps.append({"axis": "focus", "response": _jsonable(r)})
        response = r
        if prior_mode == 'auto':
            # Camera was in AF when the recall started — re-enable so
            # continuous autofocus resumes from the newly-framed shot.
            r_af = cam.set_focus_auto()
            steps.append({"axis": "focus_mode_restore", "response": _jsonable(r_af)})

#print("Getting PTZ Position...")
pan, tilt = cam.get_pantilt_position();
#print("Getting Zoom Position...")
zoom = cam.get_zoom_position();
#print("Getting Focus Position...")
focus = cam.get_focus_position();

import json as _json

_out = {
    "camera": args.ip,
    "pan":    pan,
    "tilt":   tilt,
    "zoom":   zoom,
    "focus":  focus,
}
safe_response = _jsonable(response)
if safe_response is not None:
    _out["response"] = safe_response
if steps:
    _out["steps"] = steps
if focus_prior_mode is not None:
    _out["focus_prior_mode"] = focus_prior_mode

print(_json.dumps(_out))
