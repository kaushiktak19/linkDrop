import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Copy, Users, XCircle } from "lucide-react";
import { toast } from "sonner";
import socket from "@/lib/socket";

interface ChannelResponse {
  success: boolean;
  id?: string;
  members?: number;
  creator?: string;
  error?: string;
}

interface QueuedFile {
  id: string;
  name: string;
  size: number;
  progress: number;
  status: "queued" | "transferring" | "completed" | "cancelled";
  file: File;
}

export default function ChannelPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const [members, setMembers] = useState<number>(0);
  const [isCreator, setIsCreator] = useState<boolean>(false);
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [isConnected, setIsConnected] = useState(false);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const receivedChunks = useRef<{ [fileId: string]: { chunks: ArrayBuffer[]; total: number; name: string } }>({});

  useEffect(() => {
    if (!channelId) return;

    const fetchChannelDetails = () => {
      socket.emit("getChannel", { channelId }, (response: ChannelResponse) => {
        if (response.success) {
          setMembers(response.members || 0);
          const currentUserId = localStorage.getItem("userId");
          setIsCreator(currentUserId === response.creator);
        } else {
          toast(response.error || "This channel has been terminated.");
          navigate("/");
        }
      });
    };

    fetchChannelDetails();

    socket.on("channelUpdated", (data: { channelId: string; members: number }) => {
      if (data.channelId === channelId) {
        setMembers(data.members);
      }
    });

    socket.on("userLeft", (data: { channelId: string; members: number }) => {
      if (data.channelId === channelId) {
        setMembers(data.members);
      }
    });

    socket.on("channelDeleted", (data: { channelId: string }) => {
      if (data.channelId === channelId) {
        toast("Channel terminated.");
        navigate("/");
      }
    });

    return () => {
      socket.off("channelUpdated");
      socket.off("userLeft");
      socket.off("channelDeleted");
    };
  }, [channelId, navigate]);

  useEffect(() => {
    if (!channelId || members !== 2) return;

    socket.on("receive-offer", handleOffer);
    socket.on("receive-answer", handleAnswer);
    socket.on("receive-ice-candidate", handleIceCandidate);

    if (!peerConnectionRef.current) {
      createPeerConnection(!isCreator);
    }

    return () => {
      socket.off("receive-offer");
      socket.off("receive-answer");
      socket.off("receive-ice-candidate");
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close();
        peerConnectionRef.current = null;
        setIsConnected(false);
      }
    };
  }, [channelId, members, isCreator]);

  const createPeerConnection = (isOfferer: boolean) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("send-ice-candidate", { channelId, candidate: event.candidate });
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE Connection State: ${pc.iceConnectionState}`);
      if (pc.iceConnectionState === "connected") {
        console.log("Peers are fully connected!");
      } else if (pc.iceConnectionState === "failed") {
        toast("Connection failed. Please try again.");
      }
    };

    if (isOfferer) {
      const dc = pc.createDataChannel("fileTransfer");
      dataChannelRef.current = dc;
      setupDataChannel(dc);
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          socket.emit("send-offer", { channelId, offer: pc.localDescription });
        })
        .catch((error) => console.error("Error creating offer:", error));
    } else {
      pc.ondatachannel = (event) => {
        dataChannelRef.current = event.channel;
        setupDataChannel(event.channel);
      };
    }

    peerConnectionRef.current = pc;
  };

  const handleOffer = async (data: { offer: RTCSessionDescriptionInit; senderId: string }) => {
    if (!peerConnectionRef.current) {
      createPeerConnection(false);
    }
    const pc = peerConnectionRef.current!;
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("send-answer", { channelId, answer: pc.localDescription, receiverId: data.senderId });
    } catch (error) {
      console.error("Error handling offer:", error);
    }
  };

  const handleAnswer = async (data: { answer: RTCSessionDescriptionInit; senderId: string }) => {
    if (peerConnectionRef.current) {
      try {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
      } catch (error) {
        console.error("Error handling answer:", error);
      }
    }
  };

  const handleIceCandidate = async (data: { candidate: RTCIceCandidateInit }) => {
    if (peerConnectionRef.current) {
      try {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (error) {
        console.error("Error adding ICE candidate:", error);
      }
    }
  };

  const setupDataChannel = (dc: RTCDataChannel) => {
    dc.onopen = () => {
      console.log("Data channel opened");
      setIsConnected(true);
      toast("Connected to peer!");
    };
    dc.onclose = () => {
      console.log("Data channel closed");
      setIsConnected(false);
      toast("Disconnected from peer.");
    };
    dc.onmessage = (event) => {
      console.log("Received data on channel:", event.data);
      const message = JSON.parse(event.data);
      if (message.type === "metadata") {
        receivedChunks.current[message.fileId] = {
          chunks: [],
          total: message.totalChunks,
          name: message.fileName,
        };
      } else if (message.type === "chunk") {
        const fileData = receivedChunks.current[message.fileId];
        fileData.chunks.push(message.data);
        if (fileData.chunks.length === fileData.total) {
          const blob = new Blob(fileData.chunks);
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = fileData.name;
          a.click();
          URL.revokeObjectURL(url);
          toast("File received and downloaded!");
          setFiles((prev) => [
            ...prev,
            {
              id: Math.random().toString(36).substr(2, 9),
              name: fileData.name,
              size: blob.size,
              progress: 100,
              status: "completed",
              file: new File([blob], fileData.name),
            },
          ]);
          delete receivedChunks.current[message.fileId];
        }
      }
    };
    dc.onerror = (error) => {
      console.error("Data channel error:", error);
      toast("Error in data channel.");
    };
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    maxFiles: 3,
    onDrop: (acceptedFiles) => {
      const newFiles = acceptedFiles.map((file) => ({
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        size: file.size,
        progress: 0,
        status: "queued" as const,
        file,
      }));
      setFiles((prev) => [...prev, ...newFiles]);
    },
    disabled: members !== 2 || files.length >= 3,
  });

  const sendFile = async (id: string) => {
    const fileToSend = files.find((f) => f.id === id);
    if (
      fileToSend &&
      dataChannelRef.current &&
      dataChannelRef.current.readyState === "open"
    ) {
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: "transferring" } : f))
      );
      const CHUNK_SIZE = 16384; // 16KB chunks
      const fileReader = new FileReader();
      const fileId = Math.random().toString(36).substr(2, 9);
      const totalChunks = Math.ceil(fileToSend.size / CHUNK_SIZE);

      // Send metadata first
      const metadata = {
        type: "metadata",
        fileId,
        fileName: fileToSend.name,
        totalChunks,
      };
      dataChannelRef.current.send(JSON.stringify(metadata));
      console.log("Sent metadata:", metadata);

      let offset = 0;
      const sendNextChunk = () => {
        if (offset < fileToSend.size) {
          const chunk = fileToSend.file.slice(offset, offset + CHUNK_SIZE);
          fileReader.onload = () => {
            const chunkData = fileReader.result as ArrayBuffer;
            dataChannelRef.current!.send(
              JSON.stringify({
                type: "chunk",
                fileId,
                data: chunkData,
              })
            );
            console.log(`Sent chunk ${offset / CHUNK_SIZE + 1} of ${totalChunks}`);
            offset += CHUNK_SIZE;
            sendNextChunk();
          };
          fileReader.onerror = () => {
            console.error("Error reading chunk:", offset);
            toast("Error reading file chunk.");
            setFiles((prev) =>
              prev.map((f) => (f.id === id ? { ...f, status: "cancelled" } : f))
            );
          };
          fileReader.readAsArrayBuffer(chunk);
        } else {
          setFiles((prev) =>
            prev.map((f) =>
              f.id === id ? { ...f, status: "completed", progress: 100 } : f
            )
          );
          toast("File sent successfully!");
        }
      };
      sendNextChunk();
    } else {
      console.log("Cannot send file: Data channel not open or not initialized");
      toast("Cannot send file: No active peer connection.");
    }
  };

  const cancelFile = (id: string) => {
    setFiles((prev) => prev.filter((file) => file.id !== id));
  };

  const handleLeave = () => {
    socket.emit("leaveChannel", { channelId });
    toast("You have successfully left the channel.");
    navigate("/");
  };

  const handleTerminate = () => {
    socket.emit("terminateChannel", { channelId });
    toast("Channel terminated successfully.");
    navigate("/");
  };

  const copyChannelId = () => {
    navigator.clipboard.writeText(channelId || "");
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-lg shadow-sm p-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Channel ID:</span>
              <code className="bg-gray-100 px-2 py-1 rounded">{channelId}</code>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={copyChannelId}
              >
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex items-center gap-2 text-gray-500">
              <Users className="h-4 w-4" />
              <span className="text-sm">{members}/2</span>
            </div>
          </div>
          {isCreator ? (
            <Button variant="destructive" size="sm" onClick={handleTerminate}>
              Terminate Channel
            </Button>
          ) : (
            <Button size="sm" onClick={handleLeave}>
              Leave Channel
            </Button>
          )}
        </div>

        <div
          {...getRootProps()}
          className={`
            border-2 border-dashed rounded-lg p-8
            flex flex-col items-center justify-center
            transition-colors cursor-pointer
            ${isDragActive ? "border-primary bg-primary/5" : "border-gray-200 hover:border-primary/50"}
            ${members !== 2 || files.length >= 3 ? "opacity-50 cursor-not-allowed" : ""}
          `}
        >
          <input {...getInputProps()} />
          <div className="text-center space-y-2">
            {members === 2 ? (
              files.length < 3 ? (
                <>
                  <p className="text-gray-600">Drag & drop files here, or click to select</p>
                  <p className="text-sm text-gray-400">Max 3 files. Files will be shared securely via P2P.</p>
                </>
              ) : (
                <p className="text-sm text-red-500">Max 3 files in the queue. Cancel some to add more.</p>
              )
            ) : (
              <p className="text-sm text-red-500">Waiting for another member to join.</p>
            )}
          </div>
        </div>

        {files.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm divide-y">
            {files.map((file) => (
              <div key={file.id} className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <div className="flex items-center gap-2">
                      {file.status === "queued" && (
                        <Button
                          size="sm"
                          onClick={() => sendFile(file.id)}
                          disabled={!isConnected}
                        >
                          Send
                        </Button>
                      )}
                      {file.status === "transferring" && <p className="text-sm">Sending...</p>}
                      {file.status === "completed" && <p className="text-sm text-green-500">Sent/Received</p>}
                      {file.status === "cancelled" && <p className="text-sm text-red-500">Cancelled</p>}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        onClick={() => cancelFile(file.id)}
                      >
                        <XCircle className="h-4 w-4 text-gray-400" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}