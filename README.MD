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

## Increasing WebRTC File Transfer Speed in `linkDrop`

### 1. Initial Approach: Why It Was Slow

#### Description
In the initial implementation of `linkDrop`, files were transferred over a single WebRTC data channel by breaking them into fixed 16KB (16384 bytes) chunks. Each chunk was prefixed with a 4-byte index and sent sequentially, with a basic buffer check (`bufferedAmount > CHUNK_SIZE * 2`) that paused sending for 100ms if the buffer exceeded 32KB.

#### Why It Was Slow
- **Small Chunk Size (16KB)**:  
  For a 10MB (10,485,760 bytes) file, this required approximately 640 chunks. Each chunk sent incurred network and protocol overhead (e.g., SCTP framing, WebRTC signaling), multiplying latency costs—especially noticeable on high-latency networks (e.g., 50ms RTT).
- **Inefficient Buffer Management**:  
  The conservative buffer threshold (32KB) and fixed 100ms wait time often halted sending prematurely, even when the network could handle more data. This led to frequent pauses, underutilizing available bandwidth and extending transfer times for larger files (e.g., 5MB+).

#### Observed Impact
A 10MB file might take 15-20 seconds on a typical home network (10Mbps, 20ms latency), as the 640 messages compounded latency and buffer delays, limiting throughput to well below network capacity.

---

### 2. New Approach: How It Fixed the Issues

#### Description
We optimized the transfer process by implementing two key changes, dubbed **Approach 1 (Dynamic Chunk Size)** and **Approach 2 (Enhanced Buffer Management)**, applied to the existing single-channel WebRTC setup in `ChannelPage.tsx`.

- **Approach 1: Increased Chunk Size to 64KB**  
  - Replaced the fixed 16KB chunk size with a 64KB (65536 bytes) chunk size, a practical maximum based on WebRTC’s SCTP layer capabilities across browsers (Chrome, Firefox, Edge).
  - For a 10MB file, this reduced the number of chunks from 640 to approximately 160, cutting the number of messages sent by a factor of 4.

- **Approach 2: Enhanced Buffer Management**  
  - Adjusted the buffer threshold from `CHUNK_SIZE * 2` (32KB) to `CHUNK_SIZE * 4` (256KB), allowing more data to queue before pausing.
  - Introduced dynamic wait times: 50ms if `bufferedAmount ≤ CHUNK_SIZE * 8` (512KB), 200ms if higher, adapting to buffer load and reducing unnecessary delays.

#### How It Fixed the Issues
- **Fewer Chunks, Less Overhead**:  
  With 64KB chunks, each message carries 4x more data, slashing the number of network round trips and associated overhead. For a 10MB file, dropping from 640 to 160 messages directly reduces latency costs (e.g., from 12.8 seconds of 20ms RTTs to 3.2 seconds, theoretically).
- **Smoother Data Flow**:  
  The higher buffer threshold (256KB) and adaptive wait times keep the data channel active longer, better utilizing bandwidth. This minimizes pauses, ensuring the sender pushes data closer to the network’s capacity without overwhelming the receiver.

#### Performance Improvement
- **Quantitative Gains**:  
  - For a 10MB file, the chunk reduction (640 → 160) cuts message overhead by ~75%, potentially shaving 5-10 seconds off transfer time on a 20ms latency, 10Mbps network (e.g., from 15s to 5-10s).
  - Buffer tweaks add another 10-20% speed boost by reducing wait time overhead (e.g., cutting pauses from 64 seconds total—640 chunks * 100ms—to a fraction with fewer, shorter waits).
  - Combined, transfers are likely **30-50% faster**, with larger files (e.g., 50MB) seeing slightly greater relative gains due to sustained throughput.

---

## Final Flow
1. **Channel Setup**: User A creates, User B joins → `2/2` members.
2. **P2P Connection**: WebRTC links peers via Socket.IO signaling.
3. **File Sharing**: Drop files → Send chunks → Receive and download with correct format.
4. **Exit**: Leave or terminate → Connection closes cleanly.

**End Result**: A secure, private P2P file-sharing app where files flow directly between browsers, no server storage needed—perfect for quick, safe transfers.