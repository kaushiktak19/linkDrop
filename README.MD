# LinkDrop - Secure P2P File Sharing

**LinkDrop** is a lightweight, secure, peer-to-peer (P2P) file-sharing system built with modern web technologies. It enables two users to share files directly between their browsers without centralized cloud storage, prioritizing privacy and simplicity. No registration is required—just create or join a channel and start sharing.


[Try LinkDrop](https://link-drop.vercel.app/)

---

## Features
- **Channel Creation**: Generate secure channels with a unique ID and password.
- **Channel Joining**: Join a channel using the ID and password (max 2 members).
- **Real-Time Updates**: Member counts and channel status sync instantly via Socket.IO.
- **File Sharing**: Queue up to 3 files and send them securely via WebRTC.
  - Files transfer as chunks with progress tracking.
  - Receiver auto-downloads files in their original format and size.
- **Secure Backend**: Passwords hashed with bcrypt, channel data stored in Redis.
- **Graceful UX**: Leave or terminate channels with real-time feedback and toast notifications.

## Tech Stack
- **Backend**: Node.js, Express, Socket.IO, Redis, bcrypt
- **Frontend**: React, TypeScript, Vite, Tailwind CSS (via shadcn/ui), react-dropzone
- **P2P**: WebRTC (RTCPeerConnection, RTCDataChannel) with STUN/TURN servers
- **Deployment**:
  - **Backend**: Docker on AWS EC2, Nginx reverse proxy, Let’s Encrypt SSL
  - **Frontend**: Vercel

---

## How It Works

### Backend
- **Server Setup**: An Express server with Socket.IO runs in a Docker container on port 5000, proxied through Nginx on port 443 for HTTPS. Configuration is managed via environment variables (e.g., `REDIS_URL` in `.env`).
- **Channel Management**:
  - Channels are stored in Redis with `channelId`, hashed password, member count, and creator details.
  - Socket.IO rooms link users to channels for real-time updates.
- **Events**:
  - `createChannel`: Generates a `channelId` and registers the creator.
  - `joinChannel`: Validates the password and joins if space exists (max 2 members).
  - `getChannel`: Retrieves channel details.
  - `leaveChannel`/`terminateChannel`: Updates or deletes channels, notifying members.
  - **WebRTC Signaling**: `send-offer`, `send-answer`, `send-ice-candidate` facilitate P2P connections.

### Frontend
- **Routing**:
  - `/` (LandingPage): Interface to create or join channels.
  - `/channel/:channelId` (ChannelPage): File-sharing dashboard.
- **Socket.IO**: Establishes a connection on app mount, managing channel updates and WebRTC signaling.
- **WebRTC**:
  - `RTCPeerConnection` links peers when `members === 2`.
  - `RTCDataChannel` transfers file chunks securely.
- **UI**:
  - **LandingPage**: Modals for channel creation/joining with password input.
  - **ChannelPage**: Displays `channelId`, member count, and a dropzone for queuing and sending files.

---

## Deployment
- **Backend**:
  - Hosted on an AWS EC2 instance (`t2.micro`, Ubuntu).
  - Dockerized image: `kaushikt19/linkdrop-backend:latest`.
  - Nginx serves as a reverse proxy, terminating SSL at `https://linkdrop-backend.duckdns.org`.
  - SSL certificate from Let’s Encrypt, auto-renewed every 90 days.
  - Redis hosted on Upstash for channel data persistence.
- **Frontend**:
  - Deployed on Vercel at `https://link-drop.vercel.app/`.
  - Connects to the backend via Socket.IO over HTTPS.

## Current Flow
1. **Channel Setup**:
   - User A creates a channel with a password → Receives a `channelId` → Navigates to `/channel/:channelId`.
   - User B joins using the `channelId` and password → Both see `2/2` members.
2. **WebRTC Handshake**:
   - When `members === 2`, User B sends an SDP offer via Socket.IO.
   - User A responds with an answer → ICE candidates exchange → P2P connection established.
3. **File Sharing**:
   - User A drops a file (e.g., `video.mp4`) → Queued with a "Send" button.
   - Clicks "Send" → File splits into 64KB chunks → Sent via `RTCDataChannel` with indices.
   - User B sees the file as "Sent/Received" → Auto-downloads upon completion.
   - Bidirectional sharing supported.
4. **Channel Exit**:
   - User leaves → `leaveChannel` updates count or deactivates if empty → WebRTC closes.
   - Creator terminates → `terminateChannel` deletes the channel, ending all connections.

---

## Development Journey

### 1. Initial Approach and Issues Faced
#### Initial Approach
- Files were split into 16KB chunks, read as `ArrayBuffer`, wrapped in JSON (e.g., `{ type: "chunk", fileId, data }`), and sent via `dataChannel.send(JSON.stringify(...))`.
- Metadata (file name, total chunks) was sent separately.

#### Issues Faced
- **File Corruption**: Videos and PDFs often failed to open due to data corruption.
- **Size Reduction**: Large files shrank (e.g., 5MB → 4.8MB), indicating data loss.
- **Inconsistency**: Some files worked sporadically, but complex formats failed reliably.

#### Why These Issues Occurred
- **JSON Serialization**: Stringifying binary data corrupted it due to encoding mismatches.
- **Ordering**: Lack of explicit chunk indices risked misassembly.
- **Buffer Overflow**: No buffer control led to dropped data.

---

### 2. New Approach: Inspiration and Improvements
#### Inspiration
- Modeled after **Snapdrop**, which uses raw `ArrayBuffer` transfers and separate metadata for reliability.

#### New Approach
- **Raw Binary Chunks**: Sent as `ArrayBuffer` with a 4-byte index prefix, avoiding JSON for binary data.
- **Metadata**: Single JSON message with file details (name, size, type, total chunks).
- **Buffer Management**: Pauses sending if `dataChannel.bufferedAmount` exceeds `CHUNK_SIZE * 4` (256KB).
- **Reassembly**: Receiver stores chunks by index in an array, creating a `Blob` with correct MIME type.

#### Benefits
- **Integrity**: Eliminated corruption by avoiding JSON for binary data.
- **Order**: Indices ensured correct reassembly.
- **Reliability**: Buffer control prevented data loss, supporting large files.

---

## Increasing WebRTC File Transfer Speed
### 1. Initial Approach: Why It Was Slow
- **Small Chunks (16KB)**: Excessive messages (e.g., 640 for 10MB) increased latency overhead.
- **Buffer Management**: Fixed 32KB threshold and 100ms waits underutilized bandwidth.

### 2. New Approach: How It Improved
- **64KB Chunks**: Reduced messages (e.g., 160 for 10MB), cutting overhead by ~75%.
- **Dynamic Buffer**: 256KB threshold with adaptive waits (50ms/200ms) maximized throughput.
- **Result**: 30-50% faster transfers (e.g., 10MB in 5-10s vs. 15-20s).

---

## Final Flow
1. **Channel Setup**: Create/join → `2/2` members.
2. **P2P Connection**: WebRTC links via Socket.IO signaling.
3. **File Sharing**: Drop → Send chunks → Receive and download.
4. **Exit**: Leave/terminate → Connection closes cleanly.

**End Result**: A secure, private P2P file-sharing app—files flow directly between browsers, no server storage required.