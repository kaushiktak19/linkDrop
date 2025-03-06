# LinkDrop - Secure P2P File Sharing

**LinkDrop** is a lightweight, secure, peer-to-peer (P2P) file-sharing system built with modern web technologies. It allows two users to share files directly between their browsers without relying on centralized cloud storage, ensuring privacy and simplicity. No registration is required—just create or join a channel and start sharing.

## Current Status
As of now, LinkDrop provides a fully functional channel management system with a clean UI and real-time updates. The foundation for P2P file sharing via WebRTC is in place, but the actual file transfer implementation is still pending.

---

## Features (Implemented)
- **Channel Creation**: Users can create secure channels with a unique ID and password.
- **Channel Joining**: Others can join a channel using the ID and password, limited to 2 members.
- **Real-Time Updates**: Member counts and channel status sync instantly via Socket.IO.
- **File Queuing**: Users can drop up to 3 files into a queue, ready for transfer.
- **Secure Backend**: Passwords are hashed with bcrypt, and channel data is stored in Redis.
- **Graceful UX**: Leave or terminate channels with real-time feedback and toast notifications.

## Tech Stack
- **Backend**: Node.js, Express, Socket.IO, Redis, bcrypt
- **Frontend**: React, TypeScript, Vite, Tailwind CSS (via shadcn/ui), react-dropzone
- **Planned**: WebRTC for P2P file sharing

---

## How It Works (Current Implementation)

### Backend
- **Server Setup**: An Express server with Socket.IO runs on port 5000 (configurable via `.env`), handling real-time communication.
- **Channel Management**:
  - Channels are stored in Redis with a unique `channelId`, hashed password, member count, and creator info.
  - Socket.IO rooms tie users to channels for real-time updates.
- **Events**:
  - `createChannel`: Generates a `channelId` and adds the creator.
  - `joinChannel`: Validates password and joins if space exists (max 2 members).
  - `getChannel`: Fetches channel details.
  - `leaveChannel`/`terminateChannel`: Updates or deletes channels, notifying all members.

### Frontend
- **Routing**: 
  - `/` (LandingPage): Create or join channels.
  - `/channel/:channelId` (ChannelPage): File-sharing interface.
- **Socket.IO**: Connects on app mount, listens for channel updates (e.g., member changes, deletions).
- **UI**:
  - **LandingPage**: Modals for creating/joining channels with password input.
  - **ChannelPage**: Displays `channelId`, member count, and a dropzone for queuing files (max 3).

---

## Current Flow
1. **User A Creates a Channel**:
   - Enters a password → Socket.IO emits `createChannel` → Backend generates `channelId` → User A joins and navigates to `/channel/:channelId`.
2. **User B Joins**:
   - Inputs `channelId` and password → Socket.IO emits `joinChannel` → Backend validates → User B joins if correct and room isn’t full (2/2).
3. **Real-Time Sync**:
   - Both users see member count (e.g., 1/2 → 2/2) via `channelUpdated` events.
4. **File Queuing**:
   - When members reach 2, the dropzone activates → Users drag/drop files → Files queue up (name, size, status shown).
5. **Leave/Terminate**:
   - User leaves → `leaveChannel` updates member count or deactivates channel if empty.
   - Creator terminates → `terminateChannel` deletes the channel, kicking everyone out.

**What’s Happening**: Users can create/join channels and queue files, but no files are transferred yet—WebRTC is the missing piece.

---

## What’s Next?
The next step is integrating **WebRTC** for P2P file sharing. Here’s the plan:

1. **WebRTC Setup**:
   - Add `RTCPeerConnection` and `RTCDataChannel` in `ChannelPage.tsx` to connect peers when `members === 2`.
2. **Signaling**:
   - Extend Socket.IO (`socket.js`) with events: `send-offer`, `send-answer`, `send-ice-candidate` to exchange WebRTC metadata.
3. **File Transfer**:
   - Send queued files via `RTCDataChannel` in chunks, updating `progress` in the UI.
   - Receiver reassembles and offers a download link.
4. **Enhancements**:
   - Progress bars for transfers.
   - Error handling for WebRTC failures (e.g., network issues).
   - STUN/TURN server config for NAT traversal.

---

## Flow After Completion
Once WebRTC is implemented, here’s how LinkDrop will work:

1. **Channel Setup**:
   - User A creates a channel → Gets `channelId` and shares it.
   - User B joins with `channelId` and password → Both are in the channel (2/2).

2. **WebRTC Handshake**:
   - When `members === 2`, frontend initiates `RTCPeerConnection`.
   - User A sends an SDP offer via Socket.IO → User B responds with an answer → ICE candidates exchange → P2P link established.

3. **File Sharing**:
   - User A drops a file → Queued → `RTCDataChannel` sends chunks to User B.
   - User B sees progress → File completes → Downloads it.
   - Both can send files bidirectionally.

4. **Channel Exit**:
   - User leaves → WebRTC connection closes → Member count updates.
   - Creator terminates → Channel deletes, ending all connections.

**End Result**: A seamless, secure P2P file-sharing experience where files transfer directly between browsers, with no server storage.
