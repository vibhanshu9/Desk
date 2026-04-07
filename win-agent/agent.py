import asyncio
import json
import pyautogui

try:
    import websockets
except ImportError:
    print("[error] You must 'pip install websockets pyautogui' before running the agent.")
    import sys
    sys.exit(1)

# Adjust the PyAutoGUI failsafe and pause if needed
pyautogui.FAILSAFE = False
pyautogui.PAUSE = 0.0

# Map JS key names to PyAutoGUI key names
KEY_MAP = {
    'Enter': 'enter',
    'Backspace': 'backspace',
    'Delete': 'delete',
    'Escape': 'esc',
    'Tab': 'tab',
    'ArrowLeft': 'left',
    'ArrowRight': 'right',
    'ArrowUp': 'up',
    'ArrowDown': 'down',
    'Shift': 'shift',
    'Control': 'ctrl',
    'Alt': 'alt',
    'Meta': 'win',
    ' ': 'space'
}

async def handle_control(websocket):
    print("[win-agent] Browser connected to Native Control Port.")
    sw, sh = pyautogui.size()
    
    async for message in websocket:
        try:
            data = json.loads(message)
            t = data.get('type')
            
            if t == 'mousemove':
                x, y = int(data['x'] * sw), int(data['y'] * sh)
                pyautogui.moveTo(x, y)
                
            elif t == 'mousedown':
                btn = 'left' if data.get('button', 0) == 0 else 'right'
                pyautogui.mouseDown(button=btn)
                
            elif t == 'mouseup':
                btn = 'left' if data.get('button', 0) == 0 else 'right'
                pyautogui.mouseUp(button=btn)
                
            elif t == 'click':
                btn = 'left' if data.get('button', 0) == 0 else 'right'
                pyautogui.click(button=btn)
                
            elif t == 'dblclick':
                pyautogui.doubleClick()
                
            elif t == 'scroll':
                dy = data.get('deltaY', 0)
                # PyAutoGUI scrolling direction / speed may need tuning
                pyautogui.scroll(int(-dy))
                
            elif t == 'keydown':
                raw_key = data.get('key', '')
                key = KEY_MAP.get(raw_key, raw_key.lower() if len(raw_key) == 1 else None)
                if key:
                    pyautogui.keyDown(key)
                    
            elif t == 'keyup':
                raw_key = data.get('key', '')
                key = KEY_MAP.get(raw_key, raw_key.lower() if len(raw_key) == 1 else None)
                if key:
                    pyautogui.keyUp(key)
                    
        except Exception as e:
            print(f"[win-agent] Error handling event: {e}")

async def main():
    async with websockets.serve(handle_control, "localhost", 4001):
        print("🚀 Windows Native Agent running.")
        print("   Listening for browser control inputs on ws://localhost:4001")
        await asyncio.Future()

if __name__ == "__main__":
    asyncio.run(main())
