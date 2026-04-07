#!/usr/bin/env python3
"""
RemoteDesk macOS Host Agent
============================
Captures the macOS screen and applies remote control inputs (mouse/keyboard)
received over a WebSocket control channel.

Requirements:
  pip install websockets Pillow pyobjc-framework-Quartz pyobjc-framework-Cocoa

Permissions needed (System Settings):
  • Screen Recording  → add Terminal / Python
  • Accessibility     → add Terminal / Python (for injecting mouse/keyboard)
"""

import asyncio
import json
import os
import sys
import base64
import io
import time
import math
import threading
from pathlib import Path

# ── Load .env ────────────────────────────────────────────────────────────────
env_file = Path(__file__).parent.parent / '.env'
if env_file.exists():
    for line in env_file.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith('#') and '=' in line:
            k, _, v = line.partition('=')
            os.environ.setdefault(k.strip(), v.strip())

WS_URL    = os.environ.get('VITE_SIGNAL_URL', os.environ.get('VITE_WS_URL', 'ws://localhost:4000'))
SESSION_ID = os.environ.get('MAC_SESSION_ID', None)  # override via env or CLI arg

try:
    import websockets
    import Quartz
    import Quartz.CoreGraphics as CG
    from Cocoa import NSEvent
    from PIL import Image
except ImportError as e:
    print(f"[error] Missing dependency: {e}")
    print("Run: pip install websockets Pillow pyobjc-framework-Quartz pyobjc-framework-Cocoa")
    sys.exit(1)

# ─────────────────────────────────────────────────────────────────────────────
#  Screen capture
# ─────────────────────────────────────────────────────────────────────────────
def capture_screen_jpeg(quality: int = 40) -> bytes:
    """Capture main display and return JPEG bytes."""
    display_id = CG.CGMainDisplayID()
    image = CG.CGDisplayCreateImage(display_id)
    if not image:
        raise RuntimeError("CGDisplayCreateImage returned None. Grant Screen Recording permission.")

    width  = CG.CGImageGetWidth(image)
    height = CG.CGImageGetHeight(image)
    bpc    = CG.CGImageGetBitsPerComponent(image)
    bpr    = CG.CGImageGetBytesPerRow(image)

    data_provider = CG.CGImageGetDataProvider(image)
    raw_data = CG.CGDataProviderCopyData(data_provider)
    img = Image.frombytes('RGBA', (width, height), bytes(raw_data), 'raw', 'BGRA')
    img = img.convert('RGB')

    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=quality, optimize=True)
    return buf.getvalue()


# ─────────────────────────────────────────────────────────────────────────────
#  Remote control input injection
# ─────────────────────────────────────────────────────────────────────────────
BUTTON_MAP = {0: CG.kCGMouseButtonLeft, 1: CG.kCGMouseButtonCenter, 2: CG.kCGMouseButtonRight}

def screen_size():
    display_id = CG.CGMainDisplayID()
    return CG.CGDisplayPixelsWide(display_id), CG.CGDisplayPixelsHigh(display_id)


def apply_mouse_move(x_ratio: float, y_ratio: float):
    sw, sh = screen_size()
    px, py = int(x_ratio * sw), int(y_ratio * sh)
    pos = CG.CGPointMake(px, py)
    evt = CG.CGEventCreateMouseEvent(None, CG.kCGEventMouseMoved, pos, CG.kCGMouseButtonLeft)
    CG.CGEventPost(CG.kCGHIDEventTap, evt)


def apply_mouse_button(event_type_str: str, x_ratio: float, y_ratio: float, button: int):
    sw, sh = screen_size()
    px, py = int(x_ratio * sw), int(y_ratio * sh)
    pos = CG.CGPointMake(px, py)

    btn = BUTTON_MAP.get(button, CG.kCGMouseButtonLeft)

    type_map = {
        'mousedown': {
            CG.kCGMouseButtonLeft:   CG.kCGEventLeftMouseDown,
            CG.kCGMouseButtonRight:  CG.kCGEventRightMouseDown,
            CG.kCGMouseButtonCenter: CG.kCGEventOtherMouseDown,
        },
        'mouseup': {
            CG.kCGMouseButtonLeft:   CG.kCGEventLeftMouseUp,
            CG.kCGMouseButtonRight:  CG.kCGEventRightMouseUp,
            CG.kCGMouseButtonCenter: CG.kCGEventOtherMouseUp,
        },
    }
    evt_type = type_map.get(event_type_str, {}).get(btn, CG.kCGEventLeftMouseDown)
    evt = CG.CGEventCreateMouseEvent(None, evt_type, pos, btn)
    CG.CGEventPost(CG.kCGHIDEventTap, evt)


def apply_scroll(delta_x: float, delta_y: float):
    # Convert pixel delta to line-based scroll (wheel 1 = vertical, wheel 2 = horizontal)
    wheel1 = int(-delta_y / 20)
    wheel2 = int(-delta_x / 20)
    evt = CG.CGEventCreateScrollWheelEvent(None, CG.kCGScrollEventUnitLine, 2, wheel1, wheel2)
    CG.CGEventPost(CG.kCGHIDEventTap, evt)


# Key mapping (JS key → macOS virtual keycode)
KEY_CODE_MAP = {
    'a': 0,  'b': 11,  'c': 8,  'd': 2,  'e': 14, 'f': 3,  'g': 5,
    'h': 4,  'i': 34,  'j': 38, 'k': 40, 'l': 37, 'm': 46, 'n': 45,
    'o': 31, 'p': 35,  'q': 12, 'r': 15, 's': 1,  't': 17, 'u': 32,
    'v': 9,  'w': 13,  'x': 7,  'y': 16, 'z': 6,
    '0': 29, '1': 18,  '2': 19, '3': 20, '4': 21, '5': 23, '6': 22,
    '7': 26, '8': 28,  '9': 25,
    ' ': 49, 'Enter': 36, 'Backspace': 51, 'Tab': 48, 'Escape': 53,
    'Delete': 117, 'ArrowLeft': 123, 'ArrowRight': 124, 'ArrowDown': 125,
    'ArrowUp': 126, 'Home': 115, 'End': 119, 'PageUp': 116, 'PageDown': 121,
    'F1': 122, 'F2': 120, 'F3': 99, 'F4': 118, 'F5': 96, 'F6': 97,
    'F7': 98, 'F8': 100, 'F9': 101, 'F10': 109, 'F11': 103, 'F12': 111,
    'Meta': 55, 'Control': 59, 'Alt': 58, 'Shift': 56,
    '.': 47, ',': 43, ';': 41, "'": 39, '/': 44, '\\': 42,
    '[': 33, ']': 30, '`': 50, '-': 27, '=': 24,
}

def apply_key(key: str, down: bool, ctrl=False, alt=False, shift=False, meta=False):
    key_lower = key.lower() if len(key) == 1 else key
    key_code  = KEY_CODE_MAP.get(key_lower, KEY_CODE_MAP.get(key, None))
    if key_code is None:
        return

    flags = CG.kCGEventFlagMaskNonCoalesced
    if ctrl:  flags |= CG.kCGEventFlagMaskControl
    if alt:   flags |= CG.kCGEventFlagMaskAlternate
    if shift: flags |= CG.kCGEventFlagMaskShift
    if meta:  flags |= CG.kCGEventFlagMaskCommand

    evt_type = CG.kCGEventKeyDown if down else CG.kCGEventKeyUp
    evt = CG.CGEventCreateKeyboardEvent(None, key_code, down)
    CG.CGEventSetFlags(evt, flags)
    CG.CGEventPost(CG.kCGHIDEventTap, evt)


def handle_control(msg: dict):
    t = msg.get('type')
    try:
        if t == 'mousemove':
            apply_mouse_move(msg['x'], msg['y'])
        elif t in ('mousedown', 'mouseup'):
            apply_mouse_button(t, msg['x'], msg['y'], msg.get('button', 0))
        elif t == 'click':
            apply_mouse_button('mousedown', msg['x'], msg['y'], msg.get('button', 0))
            apply_mouse_button('mouseup',   msg['x'], msg['y'], msg.get('button', 0))
        elif t == 'dblclick':
            for _ in range(2):
                apply_mouse_button('mousedown', msg['x'], msg['y'], 0)
                apply_mouse_button('mouseup',   msg['x'], msg['y'], 0)
        elif t == 'scroll':
            apply_scroll(msg.get('deltaX', 0), msg.get('deltaY', 0))
        elif t == 'keydown':
            apply_key(msg['key'], True,  msg.get('ctrlKey'), msg.get('altKey'),
                      msg.get('shiftKey'), msg.get('metaKey'))
        elif t == 'keyup':
            apply_key(msg['key'], False, msg.get('ctrlKey'), msg.get('altKey'),
                      msg.get('shiftKey'), msg.get('metaKey'))
    except Exception as e:
        print(f"[control] Error handling {t}: {e}")


# ─────────────────────────────────────────────────────────────────────────────
#  WebSocket signaling agent
# ─────────────────────────────────────────────────────────────────────────────
async def run_agent(session_id: str):
    import websockets

    print(f"[agent] Connecting to signaling server: {WS_URL}")
    print(f"[agent] Session ID: {session_id}")

    async with websockets.connect(WS_URL) as ws:
        # Register as host
        await ws.send(json.dumps({'type': 'register-host', 'sessionId': session_id}))
        print(f"[agent] Registered as host. Share session ID: {session_id}")

        # Screen streaming task (sends JPEG frames over a separate control WS)
        # In this agent, we stream via a side-channel since WebRTC is browser-native.
        # The browser WebRTC handles the actual video; this agent handles:
        #   1. Receiving control events from the signaling server forwarded by clients
        #   2. For full native capture: run a local WS server that the browser host page connects to

        async for raw in ws:
            try:
                msg = json.loads(raw)
            except Exception:
                continue

            t = msg.get('type')

            if t == 'registered':
                print(f"[agent] ✓ Session registered on server")

            elif t == 'client-joined':
                print(f"[agent] Client joined: {msg.get('clientId')}")

            elif t == 'control':
                # Control events forwarded by signaling server
                handle_control(msg.get('data', {}))

            elif t == 'host-disconnected':
                print("[agent] Disconnected from server")
                break

            elif t == 'error':
                print(f"[agent] Server error: {msg.get('message')}")

    print("[agent] WebSocket closed.")


# ─────────────────────────────────────────────────────────────────────────────
#  Local WebSocket server for direct control channel (port 4001)
#  The browser's Host page can connect to ws://localhost:4001/control
#  to forward data-channel messages to the native agent.
# ─────────────────────────────────────────────────────────────────────────────
CONTROL_PORT = int(os.environ.get('AGENT_CONTROL_PORT', 4001))

async def control_server():
    import websockets

    async def handler(ws, path):
        print(f"[control-server] Browser connected")
        async for raw in ws:
            try:
                msg = json.loads(raw)
                handle_control(msg)
            except Exception as e:
                print(f"[control-server] parse error: {e}")

    async with websockets.serve(handler, 'localhost', CONTROL_PORT):
        print(f"[control-server] Listening on ws://localhost:{CONTROL_PORT}")
        await asyncio.Future()   # run forever


async def main():
    session_id = SESSION_ID or (sys.argv[1] if len(sys.argv) > 1 else None)
    if not session_id:
        # Generate a random one
        import random, string
        chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
        session_id = ''.join(random.choices(chars, k=4)) + '-' + ''.join(random.choices(chars, k=4))
        print(f"[agent] No session ID provided — generated: {session_id}")

    await asyncio.gather(
        run_agent(session_id),
        control_server(),
    )


if __name__ == '__main__':
    asyncio.run(main())
