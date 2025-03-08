# LinkDrop - Secure P2P File Sharing

**LinkDrop** is a lightweight, secure, peer-to-peer (P2P) file-sharing system built with modern web technologies. It enables two users to share files directly between their browsers without centralized cloud storage, prioritizing privacy and simplicity. No registration is needed—just create or join a channel and start sharing.

## Current Status
LinkDrop is now fully functional! The channel management system is complete, and P2P file sharing via WebRTC is implemented, allowing seamless, secure file transfers between two users. From small PDFs to large videos, files are shared accurately with real-time UI updates.

---

## Features
- **Channel Creation**: Create secure channels with a unique ID and password.
- **Channel Joining**: Join a channel using the ID and password (max 2 members).
- **Real-Time Updates**: Member counts and channel status sync instantly via Socket.IO.
- **File Sharing**: Drop up to 3 files into a queue and send them securely via WebRTC.
  - Files transfer as chunks with progress tracking.
  - Receiver auto-downloads the file with correct format and size.
- **Secure Backend**: Passwords hashed with bcrypt, channel data stored in Redis.
- **Graceful UX**: Leave or terminate channels with real-time feedback and toast notifications.

## Tech Stack
- **Backend**: Node.js, Express, Socket.IO, Redis, bcrypt
- **Frontend**: React, TypeScript, Vite, Tailwind CSS (via shadcn/ui), react-dropzone
- **P2P**: WebRTC (RTCPeerConnection, RTCDataChannel) with STUN servers

---

## How It Works

### Backend
- **Server Setup**: Express with Socket.IO runs on port 5000 (configurable via `.env`), managing real-time communication.
- **Channel Management**:
  - Channels stored in Redis with `channelId`, hashed password, member count, and creator info.
  - Socket.IO rooms tie users to channels for updates.
- **Events**:
  - `createChannel`: Generates a `channelId` and adds the creator.
  - `joinChannel`: Validates password and joins if space exists (max 2).
  - `getChannel`: Fetches channel details.
  - `leaveChannel`/`terminateChannel`: Updates or deletes channels, notifying members.
  - **WebRTC Signaling**: `send-offer`, `send-answer`, `send-ice-candidate` exchange WebRTC metadata.

### Frontend
- **Routing**:
  - `/` (LandingPage): Create or join channels.
  - `/channel/:channelId` (ChannelPage): File-sharing interface.
- **Socket.IO**: Connects on app mount, handles channel updates and WebRTC signaling.
- **WebRTC**: 
  - `RTCPeerConnection` establishes P2P links when `members === 2`.
  - `RTCDataChannel` transfers file chunks securely.
- **UI**:
  - **LandingPage**: Modals for creating/joining channels with password input.
  - **ChannelPage**: Shows `channelId`, member count, and a dropzone for queuing and sending files.

---

## Current Flow
1. **Channel Setup**:
   - User A creates a channel with a password → Gets `channelId` → Navigates to `/channel/:channelId`.
   - User B joins with `channelId` and password → Both see `2/2` members.

2. **WebRTC Handshake**:
   - When `members === 2`, the joiner sends an SDP offer via Socket.IO.
   - Creator responds with an answer → ICE candidates exchange → P2P connection established.

3. **File Sharing**:
   - User A drops a file (e.g., `video.mp4`) → Queued with "Send" button.
   - Clicks "Send" → File splits into 16KB chunks → Sent via `RTCDataChannel` with indices.
   - User B sees the file in the queue as "Sent/Received" → Auto-downloads when complete.
   - Both users can send files bidirectionally.

4. **Channel Exit**:
   - User leaves → `leaveChannel` updates count or deactivates if empty → WebRTC closes.
   - Creator terminates → `terminateChannel` deletes the channel, ending all connections.

---

## Development Journey

### 1. Initial Approach and Issues Faced

#### Initial Approach
In the initial implementation of file sharing for `linkDrop`, we used WebRTC data channels with the following method:
- Files were split into 16KB chunks using `File.slice()` and read as `ArrayBuffer` with `FileReader`.
- Each chunk was wrapped in a JSON object (e.g., `{ type: "chunk", fileId, data: chunkData }`) and sent via `dataChannel.send(JSON.stringify(...))`.
- Metadata (file name, total chunks) was sent as a separate JSON message beforehand.
- The receiver parsed these JSON messages, extracted the chunk data, and reassembled them into a `Blob` for download.

#### Issues Faced
Despite chunking, we encountered persistent problems:
- **File Corruption**: Received files, especially videos and PDFs, were corrupted or unopenable, even if all chunks seemed to arrive.
- **Size Reduction**: Large files often ended up smaller than the original (e.g., a 5MB video became 4.8MB), indicating data loss.
- **Inconsistent Results**: Some files worked occasionally, but most complex formats (e.g., MP4) failed consistently.

#### Why These Issues Occurred
- **JSON Serialization of Binary Data**: Wrapping binary `ArrayBuffer` chunks in JSON and stringifying them corrupted the data, as JSON isn’t designed for raw binary content. This led to encoding/decoding mismatches.
- **Lack of Precise Ordering**: Although WebRTC ensures ordered delivery, relying on JSON parsing without explicit chunk indices risked misordering or missing data during reassembly.
- **No Buffer Control**: Sending chunks without checking the data channel’s buffer capacity caused potential overflows, dropping data silently.

---

### 2. New Approach: Inspiration and Improvements

#### Inspiration
We drew inspiration from **Snapdrop**, a WebRTC-based file sharing tool. Snapdrop sends file chunks as raw `ArrayBuffer` data directly through the data channel, avoiding JSON for binary content. It uses separate metadata for file details and ensures reliable transfers by managing chunk delivery, which influenced our redesign.

#### New Approach
We revamped the file sharing mechanism as follows:
- **Raw Binary Chunks**: Chunks are sent as raw `ArrayBuffer` with a 4-byte index prefix (e.g., `view.setUint32(0, chunkIndex)`), avoiding JSON for the binary data itself.
- **Metadata as JSON**: A single JSON message with file details (name, size, type, total chunks) is sent first to prepare the receiver.
- **Buffer Management**: Before sending each chunk, we check `dataChannel.bufferedAmount` and pause if it exceeds a threshold (e.g., `CHUNK_SIZE * 2`), ensuring no data is lost.
- **Ordered Reassembly**: The receiver extracts the chunk index, stores chunks in a pre-allocated array by index, and builds a `Blob` with the correct MIME type (e.g., `video/mp4`) once all chunks arrive.

#### How This Approach Was Better
- **Preserved Binary Integrity**: Sending raw `ArrayBuffer` chunks instead of JSON-stringified data eliminated encoding corruption, ensuring files stayed intact.
- **Guaranteed Order**: Embedding chunk indices in the binary data provided explicit ordering, preventing reassembly errors.
- **Reliable Large File Transfers**: Buffer management avoided overflows, ensuring all chunks of large files (e.g., videos) were delivered.
- **Correct File Typing**: Using the file’s MIME type in the `Blob` constructor ensured proper handling by browsers (e.g., playable videos).

#### How It Helped
- **Eliminated Corruption**: Files like PDFs and videos now transfer accurately and open without issues, matching their original content.
- **Fixed Size Reduction**: The received file size matches the original (e.g., a 5MB video stays 5MB), thanks to buffer control and complete chunk delivery.
- **Enhanced Reliability**: Inspired by Snapdrop’s raw binary approach, this method scaled to handle any file type or size, improving user trust and experience.

---

This shift from JSON-wrapped chunks to raw binary transmission with buffer management and explicit ordering resolved the initial issues, making `linkDrop`’s file sharing robust and dependable.

---

## Final Flow
1. **Channel Setup**: User A creates, User B joins → `2/2` members.
2. **P2P Connection**: WebRTC links peers via Socket.IO signaling.
3. **File Sharing**: Drop files → Send chunks → Receive and download with correct format.
4. **Exit**: Leave or terminate → Connection closes cleanly.

**End Result**: A secure, private P2P file-sharing app where files flow directly between browsers, no server storage needed—perfect for quick, safe transfers.