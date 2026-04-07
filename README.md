# RemoteDesk – WebRTC Remote Desktop

A full-stack remote desktop application (AnyDesk/RustDesk-style) using:
- **WebRTC** for screen streaming and input control
- **React + Tailwind** frontend
- **Node.js + WebSocket** signaling server (Dockerized)
- **macOS native agent** (Python + PyObjC)
- **coturn** TURN server for NAT traversal

---

## Project Structure

```
/
├── client/          # React frontend (Vite)
├── server/          # Node.js signaling server + Dockerfile
├── mac-agent/       # macOS host controller (Python)
├── docker/          # docker-compose + TURN + nginx configs
├── .env             # Centralized configuration
└── README.md
```

---

## Quick Start (Local Development)

### 1. Configure environment

Edit `.env` in the root:
```env
VITE_BACKEND_URL=http://localhost:4000
VITE_WS_URL=ws://localhost:4000
PORT=4000
FRONTEND_URL=http://localhost:5173
```

### 2. Start the signaling server (Docker)

```bash
cd docker
docker compose up server
```

Or run locally:
```bash
cd server
npm install
npm run dev
```

### 3. Start the React frontend

```bash
cd client
npm install
npm run dev
# → http://localhost:5173
```

### 4. Open the app

- Go to `http://localhost:5173`
- Choose **Share My Screen** (Host) or **Connect to Screen** (Client)

---

## How Host / Client Connect

```
Host Browser ──── WebRTC Offer ────► Signaling Server ──► Client Browser
                 ◄── WebRTC Answer ──                   ◄──
                 ──── ICE Candidates ─────────────────────►
                 ◄─────────────── Direct P2P (WebRTC) ─────►
                   Video stream + Data channel (control)
```

1. **Host** opens `/host`, clicks "Start Sharing" → browser captures screen via `getDisplayMedia`
2. Host's session ID is shown (e.g. `ABCD-1234`)
3. **Client** opens `/client`, enters the session ID → connects via WebRTC
4. Client sees the live screen; all mouse/keyboard/scroll inputs are sent over the WebRTC data channel
5. On macOS, the **mac-agent** applies the control events natively via Quartz/CoreGraphics

---

## macOS Host Agent

The Python agent enables **native screen capture and real input injection**.

### Setup

```bash
cd mac-agent
bash setup.sh
```

This installs dependencies and guides you through granting:
- **Screen Recording** permission
- **Accessibility** permission

### Run

```bash
cd mac-agent
python3 agent.py ABCD-1234    # replace with your session ID
```

Or set `MAC_SESSION_ID=ABCD-1234` in `.env` and run without arguments.

The agent:
1. Connects to the signaling server
2. Registers the session ID as host
3. Listens for client control events on `ws://localhost:4001`
4. Applies mouse moves, clicks, scrolls, and key presses via CoreGraphics

---

## Mouse & Keyboard Control (Client)

The client frontend captures all input events efficiently:

| Event | Method |
|-------|--------|
| Mouse move | `requestAnimationFrame` throttle (max 1 event/frame ~60fps) |
| Mouse click | Immediate, per-button (left/middle/right) |
| Double click | Forwarded as `dblclick` |
| Right click | `contextmenu` event → forwarded |
| Scroll | rAF-throttled `wheel` event with `deltaX`/`deltaY` |
| Keyboard | `keydown`/`keyup` with all modifiers (ctrl, alt, shift, meta) |

All coordinates are normalized (0–1 ratios) so they work on any screen resolution.

---

## Docker Deployment

### Development

```bash
cd docker
docker compose up
```

### Production (VPS)

1. **Edit `.env`** with production URLs:
   ```env
   VITE_BACKEND_URL=https://your-domain.com
   VITE_WS_URL=wss://your-domain.com/ws
   FRONTEND_URL=https://your-domain.com
   TURN_SERVER=turn:your-domain.com:3478
   TURN_USERNAME=remoteuser
   TURN_PASSWORD=your_secure_password
   ```

2. **Edit `docker/turnserver.conf`** — set `external-ip=YOUR_VPS_PUBLIC_IP`

3. **Build frontend**:
   ```bash
   cd client && npm run build
   ```

4. **Start all services**:
   ```bash
   cd docker
   docker compose -f docker-compose.prod.yml up -d
   ```

5. **Set up SSL** (recommended: Certbot/Let's Encrypt):
   ```bash
   certbot --nginx -d your-domain.com
   ```

---

## Environment Variables Reference

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_BACKEND_URL` | HTTP backend URL | `http://localhost:4000` |
| `VITE_WS_URL` | WebSocket signaling URL | `ws://localhost:4000` |
| `VITE_TURN_SERVER` | TURN server URL | *(empty)* |
| `VITE_TURN_USERNAME` | TURN username | *(empty)* |
| `VITE_TURN_PASSWORD` | TURN password | *(empty)* |
| `PORT` | Signaling server port | `4000` |
| `FRONTEND_URL` | CORS allowed origin | `http://localhost:5173` |
| `SECRET_KEY` | JWT/token secret | *(set in prod)* |
| `TURN_USERNAME` | coturn username | `remoteuser` |
| `TURN_PASSWORD` | coturn password | `remotepassword` |
| `MAC_SESSION_ID` | macOS agent session ID | *(CLI arg)* |
| `AGENT_CONTROL_PORT` | Local control WS port | `4001` |

---

## Security Notes

- All WebRTC streams are **end-to-end encrypted** (DTLS-SRTP)
- TURN server credentials are only used for ICE; media never passes through in plain text
- Change `SECRET_KEY`, `TURN_PASSWORD` before production deployment
- The `denied-peer-ip` ranges in `turnserver.conf` prevent SSRF attacks
