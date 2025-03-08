import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress"; // shadcn/ui Progress component
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
  status: "queued" | "transferring" | "sent" | "received" | "cancelled";
  file: File;
  totalChunks?: number;
}

export default function ChannelPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const [members, setMembers] = useState<number>(0);
  const [isCreator, setIsCreator] = useState<boolean>(false);
  const [files, setFiles] = useState<QueuedFile[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isTransferring, setIsTransferring] = useState(false);

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const receivedChunks = useRef<{
    [fileId: string]: { chunks: ArrayBuffer[]; total: number; name: string; size: number; type: string };
  }>({});

  useEffect(() => {
    if (!channelId) return;

    const fetchChannelDetails = () => {
      socket.emit("getChannel", { channelId }, (response: ChannelResponse) => {
        if (response.success) {
          setMembers(response.members || 0);
          const currentUserId = localStorage.getItem("userId");
          setIsCreator(currentUserId === response.creator);
        } else {
          toast("This channel has been terminated.");
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
        setIsTransferring(false);
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
      setIsTransferring(false);
    };
    dc.onmessage = (event) => {
      const data = event.data;
      if (typeof data === "string") {
        const message = JSON.parse(data);
        if (message.type === "metadata") {
          receivedChunks.current[message.fileId] = {
            chunks: new Array(message.totalChunks).fill(null),
            total: message.totalChunks,
            name: message.fileName,
            size: message.fileSize,
            type: message.fileType,
          };
          setFiles((prev) => [
            ...prev,
            {
              id: message.fileId,
              name: message.fileName,
              size: message.fileSize,
              progress: 0,
              status: "transferring",
              file: new File([], message.fileName, { type: message.fileType }),
              totalChunks: message.totalChunks,
            },
          ]);
          console.log("Received metadata:", message);
        }
      } else if (data instanceof ArrayBuffer) {
        const view = new DataView(data);
        const chunkIndex = view.getUint32(0);
        const chunkData = data.slice(4);
        const fileIds = Object.keys(receivedChunks.current);
        if (fileIds.length === 0) return;
        const fileId = fileIds[fileIds.length - 1];
        const fileData = receivedChunks.current[fileId];
        fileData.chunks[chunkIndex] = chunkData;
        console.log(`Received chunk ${chunkIndex + 1} of ${fileData.total}, size: ${chunkData.byteLength}`);

        const receivedCount = fileData.chunks.filter((chunk) => chunk !== null).length;
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileId ? { ...f, progress: Math.round((receivedCount / fileData.total) * 100) } : f
          )
        );

        if (receivedCount === fileData.total) {
          const blob = new Blob(fileData.chunks, { type: fileData.type });
          console.log(`Reassembled file size: ${blob.size}, expected: ${fileData.size}`);
          if (blob.size === fileData.size) {
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = fileData.name;
            a.click();
            URL.revokeObjectURL(url);
            toast("File received and downloaded successfully!");
            setFiles((prev) =>
              prev.map((f) =>
                f.id === fileId ? { ...f, status: "received", progress: 100 } : f
              )
            );
            setTimeout(() => {
              setFiles((prev) => prev.filter((f) => f.id !== fileId));
              setIsTransferring(false);
            }, 5000);
          } else {
            toast("Received file is corrupted (size mismatch).");
            setIsTransferring(false);
          }
          delete receivedChunks.current[fileId];
        }
      }
    };
    dc.onerror = (error) => console.error("Data channel error:", error);
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
      setFiles((prev) => [...prev, ...newFiles].slice(0, 3));
    },
    disabled: members !== 2 || files.length >= 3 || isTransferring,
  });

  const sendFile = async (id: string) => {
    const fileToSend = files.find((f) => f.id === id);
    if (
      fileToSend &&
      dataChannelRef.current &&
      dataChannelRef.current.readyState === "open" &&
      !isTransferring
    ) {
      setIsTransferring(true);
      setFiles((prev) =>
        prev.map((f) => (f.id === id ? { ...f, status: "transferring" } : f))
      );
      const CHUNK_SIZE = 16384;
      const fileReader = new FileReader();
      const fileId = fileToSend.id;
      const totalChunks = Math.ceil(fileToSend.size / CHUNK_SIZE);

      const metadata = {
        type: "metadata",
        fileId,
        fileName: fileToSend.name,
        totalChunks,
        fileSize: fileToSend.size,
        fileType: fileToSend.file.type,
      };
      dataChannelRef.current.send(JSON.stringify(metadata));
      console.log("Sent metadata:", metadata);

      let offset = 0;
      let chunkIndex = 0;

      const sendNextChunk = () => {
        if (offset < fileToSend.size) {
          if (dataChannelRef.current!.bufferedAmount > CHUNK_SIZE * 2) {
            setTimeout(sendNextChunk, 100);
            return;
          }

          const chunk = fileToSend.file.slice(offset, offset + CHUNK_SIZE);
          fileReader.onload = () => {
            const chunkData = fileReader.result as ArrayBuffer;
            const combinedBuffer = new ArrayBuffer(4 + chunkData.byteLength);
            const view = new DataView(combinedBuffer);
            view.setUint32(0, chunkIndex);
            new Uint8Array(combinedBuffer).set(new Uint8Array(chunkData), 4);
            dataChannelRef.current!.send(combinedBuffer);
            console.log(`Sent chunk ${chunkIndex + 1} of ${totalChunks}, size: ${chunkData.byteLength}`);
            offset += CHUNK_SIZE;
            chunkIndex++;
            setFiles((prev) =>
              prev.map((f) =>
                f.id === id
                  ? { ...f, progress: Math.round((chunkIndex / totalChunks) * 100), totalChunks }
                  : f
              )
            );
            sendNextChunk();
          };
          fileReader.onerror = () => {
            console.error("Error reading chunk at offset:", offset);
            setFiles((prev) =>
              prev.map((f) => (f.id === id ? { ...f, status: "cancelled" } : f))
            );
            setIsTransferring(false);
          };
          fileReader.readAsArrayBuffer(chunk);
        } else {
          setFiles((prev) =>
            prev.map((f) => (f.id === id ? { ...f, status: "sent", progress: 100 } : f))
          );
          toast("File sent successfully!");
          setTimeout(() => {
            setFiles((prev) => prev.filter((f) => f.id !== id));
            setIsTransferring(false);
          }, 5000);
        }
      };
      sendNextChunk();
    } else {
      console.log("Send blocked:", { isConnected, isTransferring, readyState: dataChannelRef.current?.readyState });
    }
  };

  const cancelFile = (id: string) => {
    setFiles((prev) => prev.filter((file) => file.id !== id));
    if (files.find((f) => f.id === id)?.status === "transferring") {
      setIsTransferring(false);
    }
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
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={copyChannelId}>
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
            ${members !== 2 || files.length >= 3 || isTransferring ? "opacity-50 cursor-not-allowed" : ""}
          `}
        >
          <input {...getInputProps()} />
          <div className="text-center space-y-2">
            {members === 2 ? (
              files.length < 3 && !isTransferring ? (
                <>
                  <p className="text-gray-600">Drag & drop files here, or click to select</p>
                  <p className="text-sm text-gray-400">Max 3 files. Only one file can transfer at a time.</p>
                </>
              ) : (
                <p className="text-sm text-red-500">
                  {isTransferring ? "Wait for current transfer to complete." : "Max 3 files in queue."}
                </p>
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
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-medium truncate">{file.name}</p>
                    <div className="flex items-center gap-2">
                      {file.status === "queued" && (
                        <Button
                          size="sm"
                          onClick={() => sendFile(file.id)}
                          disabled={!isConnected || isTransferring}
                        >
                          Send
                        </Button>
                      )}
                      {file.status === "transferring" && (
                        <p className="text-sm text-blue-500">Transferring...</p>
                      )}
                      {file.status === "sent" && (
                        <p className="text-sm text-green-500">Sent</p>
                      )}
                      {file.status === "received" && (
                        <p className="text-sm text-green-500">Received</p>
                      )}
                      {file.status === "cancelled" && (
                        <p className="text-sm text-red-500">Cancelled</p>
                      )}
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
                  {(file.status === "transferring" || file.status === "sent" || file.status === "received") && (
                    <Progress value={file.progress} className="w-full" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}