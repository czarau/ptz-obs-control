<?php
// VISCA-over-TCP for PTZOptics 30X NDI cameras. Replaces the
// python/cam_control.py shell-out path that control_thumb.php was using —
// saves the ~100 ms Python interpreter cold-start per call and keeps the
// whole server-side stack in one language. No daemon to babysit.
//
// Wire format (PTZOptics — VISCA over TCP, port 5678):
//   command:   81 01 <body…> FF
//   inquiry:   81 09 <body…> FF
//
// Response shapes:
//   90 4y FF                 — ACK (3 bytes, command was queued)
//   90 5y FF                 — COMPLETE (3 bytes, command finished)
//   90 6y SS FF              — ERROR (4 bytes, SS = error code; e.g. 41 =
//                              "Command Not Executable" — focus-direct in AF)
//   90 50 .. .. .. .. .. FF  — query result (variable length)
//
// Bytes-per-int encoding ("zero-padded nibbles"): a 16-bit value is split
// into four bytes with the high nibble zeroed, e.g. 12345 (0x3039) →
// 03 00 03 09. Used for pan, tilt, zoom and focus values.
//
// Spec:
//   https://ptzoptics.com/wp-content/uploads/2020/11/PTZOptics-VISCA-over-IP-Rev-1_2-8-20.pdf

class Visca
{
    private $sock;
    private float $recvTimeout;
    private int $retries;

    public function __construct(string $ip, int $port = 5678,
                                float $connectTimeout = 1.5,
                                float $recvTimeout = 2.0,
                                int $retries = 2)
    {
        $this->recvTimeout = $recvTimeout;
        $this->retries     = max(1, $retries);

        $errno  = 0;
        $errstr = '';
        $this->sock = @stream_socket_client(
            "tcp://{$ip}:{$port}",
            $errno, $errstr,
            $connectTimeout
        );
        if (!$this->sock) {
            throw new RuntimeException("VISCA connect failed: {$errstr} ({$errno})");
        }
        // recv timeout via stream_set_timeout (split into seconds + microseconds).
        $secs  = (int) floor($recvTimeout);
        $usecs = (int) (($recvTimeout - $secs) * 1_000_000);
        stream_set_timeout($this->sock, $secs, $usecs);
        stream_set_blocking($this->sock, true);
    }

    public function close(): void
    {
        if ($this->sock) {
            @fclose($this->sock);
            $this->sock = null;
        }
    }

    public function __destruct() { $this->close(); }

    /**
     * Send a VISCA command and read its response.
     * @param string $hex  Command body in hex (no 81 / FF wrapping; spaces ok)
     * @param bool   $isQuery  Use 09 inquiry preamble instead of 01 command
     * @return string|null  'COMPLETE' / 'ERROR_xx' / raw response bytes / null
     */
    public function send(string $hex, bool $isQuery = false)
    {
        $preamble = chr(0x81) . chr($isQuery ? 0x09 : 0x01);
        $payload  = $preamble . self::hexToBytes($hex) . chr(0xFF);

        $lastError = null;
        for ($try = 0; $try < $this->retries; $try++) {
            try {
                $written = @fwrite($this->sock, $payload);
                if ($written === false || $written !== strlen($payload)) {
                    throw new RuntimeException('VISCA write failed');
                }
                $resp = $this->receive();
                if ($resp !== null) return $resp;
                if (!$isQuery) return null;
            } catch (\Throwable $e) {
                $lastError = $e;
            }
        }
        if ($lastError) throw $lastError;
        throw new RuntimeException("No VISCA response after {$this->retries} retries");
    }

    /** Read and parse the next VISCA frame from the socket. */
    private function receive()
    {
        $buf = '';
        while (true) {
            $byte = @fread($this->sock, 1);
            $meta = stream_get_meta_data($this->sock);
            if (!empty($meta['timed_out'])) {
                throw new RuntimeException('VISCA recv timeout');
            }
            if ($byte === false || $byte === '') {
                throw new RuntimeException('VISCA recv eof');
            }
            $buf .= $byte;

            if ($byte === "\xff") {
                $len = strlen($buf);
                $b0  = ord($buf[0]);
                $b1  = ord($buf[1]);

                // ACK (90 4y FF) — drop and keep listening for COMPLETE.
                if ($len === 3 && $b0 === 0x90 && $b1 >= 0x40 && $b1 <= 0x4F) {
                    $buf = '';
                    continue;
                }
                // COMPLETE (90 5y FF).
                if ($len === 3 && $b0 === 0x90 && $b1 >= 0x50 && $b1 <= 0x5F) {
                    return 'COMPLETE';
                }
                // ERROR (90 6y SS FF) — return ERROR_XX so the activity log
                // shows a human-readable code rather than raw hex.
                //   02 SYNTAX_ERROR
                //   03 Command Buffer Full
                //   04 Command Canceled
                //   05 No Socket
                //   41 Command Not Executable (focus-direct while AF on, etc.)
                if ($len === 4 && $b0 === 0x90 && $b1 >= 0x60 && $b1 <= 0x6F) {
                    return sprintf('ERROR_%02X', ord($buf[2]));
                }
                // Query result — variable length. Return raw bytes; query
                // helpers below decode the nibble-packed integers.
                return $buf;
            }
        }
    }

    /* --------- High-level inquiries (mirror cam_control.py) --------- */

    /** @return array{0:int,1:int} [pan, tilt] (signed 16-bit each) */
    public function getPanTilt(): array
    {
        $d = $this->send('06 12', true);
        if (!is_string($d) || strlen($d) !== 11) return [0, 0];
        if (ord($d[0]) !== 0x90 || ord($d[1]) !== 0x50) return [0, 0];
        return [
            self::nibblesToInt(substr($d, 2, 4), true),
            self::nibblesToInt(substr($d, 6, 4), true),
        ];
    }

    public function getZoom(): int
    {
        $d = $this->send('04 47', true);
        if (!is_string($d) || strlen($d) !== 7) return 0;
        if (ord($d[0]) !== 0x90 || ord($d[1]) !== 0x50) return 0;
        return self::nibblesToInt(substr($d, 2, 4), false);
    }

    public function getFocus(): int
    {
        $d = $this->send('04 48', true);
        if (!is_string($d) || strlen($d) !== 7) return 0;
        if (ord($d[0]) !== 0x90 || ord($d[1]) !== 0x50) return 0;
        return self::nibblesToInt(substr($d, 2, 4), false);
    }

    /** @return string 'auto' | 'manual' | 'unknown' */
    public function getFocusMode(): string
    {
        $d = $this->send('04 38', true);
        if (!is_string($d) || strlen($d) !== 4) return 'unknown';
        if (ord($d[0]) !== 0x90 || ord($d[1]) !== 0x50) return 'unknown';
        $m = ord($d[2]);
        if ($m === 0x02) return 'auto';
        if ($m === 0x03) return 'manual';
        return 'unknown';
    }

    /** Reads pan, tilt, zoom and focus in one round of inquiries. */
    public function getAllPositions(): array
    {
        list($pan, $tilt) = $this->getPanTilt();
        return [
            'pan'   => $pan,
            'tilt'  => $tilt,
            'zoom'  => $this->getZoom(),
            'focus' => $this->getFocus(),
        ];
    }

    /* --------- Movement / setters --------- */

    public function setPanTiltPosition(int $pan, int $tilt,
                                       int $panSpeed = 0x14,
                                       int $tiltSpeed = 0x14)
    {
        $hex = sprintf(
            '06 02 %02x %02x %s %s',
            $panSpeed  & 0xFF,
            $tiltSpeed & 0xFF,
            self::intToNibbles($pan,  4),
            self::intToNibbles($tilt, 4)
        );
        return $this->send($hex);
    }

    public function setZoomPosition(int $zoom)   { return $this->send('04 47 ' . self::intToNibbles($zoom, 4)); }
    public function setFocusPosition(int $focus) { return $this->send('04 48 ' . self::intToNibbles($focus, 4)); }
    public function setFocusAuto()               { return $this->send('04 38 02'); }
    public function setFocusManual()             { return $this->send('04 38 03'); }
    public function focusOnePush()               { return $this->send('04 18 01'); }
    public function recallPreset(int $n)         { return $this->send(sprintf('04 3F 02 %02x', $n & 0xFF)); }
    public function setPresetSpeed(int $s)       { return $this->send(sprintf('06 01 %02x', $s & 0xFF)); }

    /* --------- Encoding helpers --------- */

    private static function hexToBytes(string $hex): string
    {
        $hex = preg_replace('/\s+/', '', $hex);
        $bin = @hex2bin($hex);
        if ($bin === false) {
            throw new RuntimeException("Bad VISCA hex: {$hex}");
        }
        return $bin;
    }

    /** int → space-separated VISCA "zero-padded nibble" bytes ("0p 0p 0p 0p"). */
    public static function intToNibbles(int $value, int $nibbles = 4): string
    {
        if ($value < 0) {
            $value = $value + (1 << ($nibbles * 4));
        }
        $mask = (1 << ($nibbles * 4)) - 1;
        $hex  = sprintf('%0' . $nibbles . 'x', $value & $mask);
        $out  = [];
        foreach (str_split($hex) as $c) $out[] = '0' . $c;
        return implode(' ', $out);
    }

    /** Decode VISCA "zero-padded nibble" bytes back to an int. */
    private static function nibblesToInt(string $bytes, bool $signed): int
    {
        $hex = '';
        $n   = strlen($bytes);
        for ($i = 0; $i < $n; $i++) {
            $hex .= sprintf('%x', ord($bytes[$i]) & 0x0F);
        }
        $val = (int) hexdec($hex);
        if ($signed) {
            $bits = $n * 4;
            if ($val >= (1 << ($bits - 1))) {
                $val -= (1 << $bits);
            }
        }
        return $val;
    }
}

/**
 * Open a VISCA connection, run $fn($visca), close cleanly, return result.
 * On connect or VISCA failure returns ['error' => ..., 'detail' => ...].
 * Other exceptions thrown inside $fn propagate after the socket is closed.
 */
function visca_run(array $endpoint, callable $fn)
{
    try {
        $v = new Visca($endpoint[0], (int)$endpoint[1]);
    } catch (\Throwable $e) {
        return ['error' => 'visca connect failed', 'detail' => $e->getMessage()];
    }
    try {
        return $fn($v);
    } catch (\Throwable $e) {
        return ['error' => 'visca op failed', 'detail' => $e->getMessage()];
    } finally {
        $v->close();
    }
}

/**
 * Coerce a VISCA response to something json_encode is happy with. SET
 * commands normally return 'COMPLETE' or 'ERROR_XX' (already strings), but
 * a malformed reply could come back as raw bytes — hex-encode those rather
 * than letting json_encode silently null them.
 */
function visca_jsonable($r)
{
    if ($r === null) return null;
    if (!is_string($r)) return (string)$r;
    // Tag obvious raw-byte responses so the activity log shows hex.
    if (strpos($r, 'COMPLETE') === 0 || strpos($r, 'ERROR_') === 0) return $r;
    if (preg_match('//u', $r)) return $r;
    return strtolower(bin2hex($r));
}
