import { useEffect, useState, useRef } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { useDropzone } from "react-dropzone"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Copy, Users, XCircle, Upload, CheckCircle, AlertCircle, Share2, FileIcon, Clock } from "lucide-react"
import { toast } from "sonner"
import socket from "@/lib/socket"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

interface ChannelResponse {
  success: boolean
  id?: string
  members?: number
  creator?: string
  error?: string
}

interface QueuedFile {
  id: string
  name: string
  size: number
  progress: number
  status: "queued" | "transferring" | "sent" | "received" | "cancelled"
  file: File
  totalChunks?: number
}

export default function ChannelPage() {
  const { channelId } = useParams<{ channelId: string }>()
  const navigate = useNavigate()
  const [members, setMembers] = useState<number>(0)
  const [isCreator, setIsCreator] = useState<boolean>(false)
  const [files, setFiles] = useState<QueuedFile[]>([])
  const [isConnected, setIsConnected] = useState(false)
  const [isTransferring, setIsTransferring] = useState(false)

  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const dataChannelRef = useRef<RTCDataChannel | null>(null)
  const receivedChunks = useRef<{
    [fileId: string]: { chunks: ArrayBuffer[]; total: number; name: string; size: number; type: string }
  }>({})
  const abortTransferRef = useRef<{ [fileId: string]: boolean }>({}) // Track cancellation

  useEffect(() => {
    if (!channelId) return

    const fetchChannelDetails = () => {
      socket.emit("getChannel", { channelId }, (response: ChannelResponse) => {
        if (response.success) {
          setMembers(response.members || 0)
          const currentUserId = localStorage.getItem("userId")
          setIsCreator(currentUserId === response.creator)
        } else {
          toast("This channel has been terminated.")
          navigate("/")
        }
      })
    }

    fetchChannelDetails()

    socket.on("channelUpdated", (data: { channelId: string; members: number }) => {
      if (data.channelId === channelId) {
        setMembers(data.members)
      }
    })

    socket.on("userLeft", (data: { channelId: string; members: number }) => {
      if (data.channelId === channelId) {
        setMembers(data.members)
      }
    })

    socket.on("channelDeleted", (data: { channelId: string }) => {
      if (data.channelId === channelId) {
        toast("Channel terminated.")
        navigate("/")
      }
    })

    return () => {
      socket.off("channelUpdated")
      socket.off("userLeft")
      socket.off("channelDeleted")
    }
  }, [channelId, navigate])

  useEffect(() => {
    if (!channelId || members !== 2) return

    socket.on("receive-offer", handleOffer)
    socket.on("receive-answer", handleAnswer)
    socket.on("receive-ice-candidate", handleIceCandidate)

    if (!peerConnectionRef.current) {
      createPeerConnection(!isCreator)
    }

    return () => {
      socket.off("receive-offer")
      socket.off("receive-answer")
      socket.off("receive-ice-candidate")
      if (peerConnectionRef.current) {
        peerConnectionRef.current.close()
        peerConnectionRef.current = null
        setIsConnected(false)
        setIsTransferring(false)
      }
    }
  }, [channelId, members, isCreator])

  const createPeerConnection = (isOfferer: boolean) => {
    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    })

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        socket.emit("send-ice-candidate", { channelId, candidate: event.candidate })
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log(`ICE Connection State: ${pc.iceConnectionState}`)
      if (pc.iceConnectionState === "connected") {
        console.log("Peers are fully connected!")
      }
    }

    if (isOfferer) {
      const dc = pc.createDataChannel("fileTransfer")
      dataChannelRef.current = dc
      setupDataChannel(dc)
      pc.createOffer()
        .then((offer) => pc.setLocalDescription(offer))
        .then(() => {
          socket.emit("send-offer", { channelId, offer: pc.localDescription })
        })
        .catch((error) => console.error("Error creating offer:", error))
    } else {
      pc.ondatachannel = (event) => {
        dataChannelRef.current = event.channel
        setupDataChannel(event.channel)
      }
    }

    peerConnectionRef.current = pc
  }

  const handleOffer = async (data: { offer: RTCSessionDescriptionInit; senderId: string }) => {
    if (!peerConnectionRef.current) {
      createPeerConnection(false)
    }
    const pc = peerConnectionRef.current!
    try {
      await pc.setRemoteDescription(new RTCSessionDescription(data.offer))
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      socket.emit("send-answer", { channelId, answer: pc.localDescription, receiverId: data.senderId })
    } catch (error) {
      console.error("Error handling offer:", error)
    }
  }

  const handleAnswer = async (data: { answer: RTCSessionDescriptionInit; senderId: string }) => {
    if (peerConnectionRef.current) {
      try {
        await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer))
      } catch (error) {
        console.error("Error handling answer:", error)
      }
    }
  }

  const handleIceCandidate = async (data: { candidate: RTCIceCandidateInit }) => {
    if (peerConnectionRef.current) {
      try {
        await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate))
      } catch (error) {
        console.error("Error adding ICE candidate:", error)
      }
    }
  }

  const setupDataChannel = (dc: RTCDataChannel) => {
    dc.onopen = () => {
      console.log("Data channel opened")
      setIsConnected(true)
      toast("Connected to peer!")
    }
    dc.onclose = () => {
      console.log("Data channel closed")
      setIsConnected(false)
      setIsTransferring(false)
    }
    dc.onmessage = (event) => {
      const data = event.data
      if (typeof data === "string") {
        const message = JSON.parse(data)
        if (message.type === "metadata") {
          receivedChunks.current[message.fileId] = {
            chunks: new Array(message.totalChunks).fill(null),
            total: message.totalChunks,
            name: message.fileName,
            size: message.fileSize,
            type: message.fileType,
          }
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
          ])
          console.log("Received metadata:", message)
        } else if (message.type === "cancel") {
          const fileId = message.fileId
          setFiles((prev) => prev.filter((f) => f.id !== fileId))
          delete receivedChunks.current[fileId]
          console.log(`File ${fileId} cancelled by sender and removed from receiver queue`)
        }
      } else if (data instanceof ArrayBuffer) {
        const view = new DataView(data)
        const chunkIndex = view.getUint32(0)
        const chunkData = data.slice(4)
        const fileIds = Object.keys(receivedChunks.current)
        if (fileIds.length === 0) return
        const fileId = fileIds[fileIds.length - 1]
        const fileData = receivedChunks.current[fileId]
        fileData.chunks[chunkIndex] = chunkData
        console.log(`Received chunk ${chunkIndex + 1} of ${fileData.total}, size: ${chunkData.byteLength}`)

        const receivedCount = fileData.chunks.filter((chunk) => chunk !== null).length
        setFiles((prev) =>
          prev.map((f) =>
            f.id === fileId ? { ...f, progress: Math.round((receivedCount / fileData.total) * 100) } : f,
          ),
        )

        if (receivedCount === fileData.total) {
          const blob = new Blob(fileData.chunks, { type: fileData.type })
          console.log(`Reassembled file size: ${blob.size}, expected: ${fileData.size}`)
          if (blob.size === fileData.size) {
            const url = URL.createObjectURL(blob)
            const a = document.createElement("a")
            a.href = url
            a.download = fileData.name
            a.click()
            URL.revokeObjectURL(url)
            toast("File received and downloaded successfully!")
            setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, status: "received", progress: 100 } : f)))
            setTimeout(() => {
              setFiles((prev) => prev.filter((f) => f.id !== fileId))
              setIsTransferring(false)
            }, 5000)
          } else {
            toast("Received file is corrupted (size mismatch).")
            setIsTransferring(false)
          }
          delete receivedChunks.current[fileId]
        }
      }
    }
    dc.onerror = (error) => console.error("Data channel error:", error)
  }

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
      }))
      setFiles((prev) => [...prev, ...newFiles].slice(0, 3))
    },
    disabled: members !== 2 || files.length >= 3 || isTransferring,
  })

  const sendFile = async (id: string) => {
    const fileToSend = files.find((f) => f.id === id)
    if (fileToSend && dataChannelRef.current && dataChannelRef.current.readyState === "open" && !isTransferring) {
      setIsTransferring(true)
      setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, status: "transferring" } : f)))
      const CHUNK_SIZE = 65536 // 64KB as a practical maximum
      const fileReader = new FileReader()
      const fileId = fileToSend.id
      const totalChunks = Math.ceil(fileToSend.size / CHUNK_SIZE)

      const metadata = {
        type: "metadata",
        fileId,
        fileName: fileToSend.name,
        totalChunks,
        fileSize: fileToSend.size,
        fileType: fileToSend.file.type,
      }
      dataChannelRef.current.send(JSON.stringify(metadata))
      console.log("Sent metadata:", metadata)

      let offset = 0
      let chunkIndex = 0
      abortTransferRef.current[fileId] = false

      const sendNextChunk = () => {
        if (abortTransferRef.current[fileId]) {
          console.log(`Transfer aborted for file ${fileId}`)
          const cancelMessage = {
            type: "cancel",
            fileId,
          }
          dataChannelRef.current!.send(JSON.stringify(cancelMessage))
          console.log("Sent cancel message:", cancelMessage)
          setIsTransferring(false)
          return
        }

        if (offset < fileToSend.size) {
          const bufferedAmount = dataChannelRef.current!.bufferedAmount
          if (bufferedAmount > CHUNK_SIZE * 4) {
            // Enhanced buffer threshold
            const waitTime = bufferedAmount > CHUNK_SIZE * 8 ? 200 : 50 // Dynamic wait time
            console.log(`Buffer full (${bufferedAmount} bytes), waiting ${waitTime}ms`)
            setTimeout(sendNextChunk, waitTime)
            return
          }

          const chunk = fileToSend.file.slice(offset, offset + CHUNK_SIZE)
          fileReader.onload = () => {
            const chunkData = fileReader.result as ArrayBuffer
            const combinedBuffer = new ArrayBuffer(4 + chunkData.byteLength)
            const view = new DataView(combinedBuffer)
            view.setUint32(0, chunkIndex)
            new Uint8Array(combinedBuffer).set(new Uint8Array(chunkData), 4)
            dataChannelRef.current!.send(combinedBuffer)
            console.log(`Sent chunk ${chunkIndex + 1} of ${totalChunks}, size: ${chunkData.byteLength}`)
            offset += CHUNK_SIZE
            chunkIndex++
            setFiles((prev) =>
              prev.map((f) =>
                f.id === id ? { ...f, progress: Math.round((chunkIndex / totalChunks) * 100), totalChunks } : f,
              ),
            )
            sendNextChunk()
          }
          fileReader.onerror = () => {
            console.error("Error reading chunk at offset:", offset)
            setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, status: "cancelled" } : f)))
            setIsTransferring(false)
          }
          fileReader.readAsArrayBuffer(chunk)
        } else {
          setFiles((prev) => prev.map((f) => (f.id === id ? { ...f, status: "sent", progress: 100 } : f)))
          toast("File sent successfully!")
          setTimeout(() => {
            setFiles((prev) => prev.filter((f) => f.id !== id))
            setIsTransferring(false)
          }, 5000)
        }
      }
      sendNextChunk()
    } else {
      console.log("Send blocked:", { isConnected, isTransferring, readyState: dataChannelRef.current?.readyState })
    }
  }

  const cancelFile = (id: string) => {
    const file = files.find((f) => f.id === id)
    if (file?.status === "transferring") {
      abortTransferRef.current[id] = true // Signal to stop transfer
    }
    setFiles((prev) => prev.filter((file) => file.id !== id))
    setIsTransferring(false) // Reset transferring state immediately
  }

  const handleLeave = () => {
    socket.emit("leaveChannel", { channelId })
    toast("You have successfully left the channel.")
    navigate("/")
  }

  const handleTerminate = () => {
    socket.emit("terminateChannel", { channelId })
    toast("Channel terminated successfully.")
    navigate("/")
  }

  const copyChannelId = () => {
    navigator.clipboard.writeText(channelId || "")
    toast("Channel ID copied to clipboard")
  }

  const formatFileSize = (size: number) => {
    if (size < 1024) return `${size} B`
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
    return `${(size / (1024 * 1024)).toFixed(1)} MB`
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "queued":
        return <Clock className="h-4 w-4 text-gray-500" />
      case "transferring":
        return <Upload className="h-4 w-4 text-blue-500 animate-pulse" />
      case "sent":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "received":
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case "cancelled":
        return <AlertCircle className="h-4 w-4 text-red-500" />
      default:
        return null
    }
  }

  const getStatusText = (status: string) => {
    switch (status) {
      case "queued":
        return "Queued"
      case "transferring":
        return "Transferring..."
      case "sent":
        return "Sent"
      case "received":
        return "Received"
      case "cancelled":
        return "Cancelled"
      default:
        return ""
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-white border-b border-gray-200 py-4">
        <div className="container mx-auto px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Share2 className="h-5 w-5 text-primary" />
              <span className="font-bold">linkDrop</span>
            </div>

            <div className="flex items-center gap-2 sm:gap-4">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className="flex items-center gap-1 sm:gap-2 bg-gray-100 px-2 sm:px-3 py-1.5 rounded-full text-xs sm:text-sm">
                      <Users className="h-3 w-3 sm:h-4 sm:w-4 text-gray-600" />
                      <span className={members === 2 ? "text-green-600 font-medium" : "text-gray-600"}>
                        {members}/2
                      </span>
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    {members === 2 ? "Channel is active with 2 members" : "Waiting for another person to join"}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>

              {isCreator ? (
                <Button variant="destructive" size="sm" onClick={handleTerminate} className="text-xs sm:text-sm">
                  Terminate
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={handleLeave} className="text-xs sm:text-sm">
                  Leave
                </Button>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle>Channel Information</CardTitle>
                <Button variant="outline" size="sm" className="gap-2 w-full sm:w-auto" onClick={copyChannelId}>
                  <Copy className="h-4 w-4" />
                  Copy ID
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                <span className="text-sm font-medium">Channel ID:</span>
                <code className="bg-gray-100 px-2 py-1 rounded text-xs sm:text-sm break-all">{channelId}</code>
                <Badge variant={isConnected ? "default" : "secondary"} className="ml-auto">
                  {isConnected ? "Connected" : "Waiting for connection"}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>File Transfer</CardTitle>
            </CardHeader>
            <CardContent>
              <div
                {...getRootProps()}
                className={`
                  border-2 border-dashed rounded-lg p-4 sm:p-8
                  flex flex-col items-center justify-center
                  transition-all cursor-pointer
                  ${isDragActive ? "border-primary bg-primary/5" : "border-gray-200 hover:border-primary/50"}
                  ${members !== 2 || files.length >= 3 || isTransferring ? "opacity-50 cursor-not-allowed" : ""}
                `}
              >
                <input {...getInputProps()} />
                <div className="text-center space-y-3">
                  <div className="bg-primary/10 p-3 rounded-full mx-auto w-fit">
                    <Upload className="h-5 w-5 sm:h-6 sm:w-6 text-primary" />
                  </div>
                  {members === 2 ? (
                    files.length < 3 && !isTransferring ? (
                      <>
                        <p className="text-gray-700 font-medium text-sm sm:text-base">
                          Drag & drop files here, or tap to select
                        </p>
                        <p className="text-xs sm:text-sm text-gray-500">
                          Max 3 files. Only one file can transfer at a time.
                        </p>
                      </>
                    ) : (
                      <p className="text-xs sm:text-sm text-red-500 font-medium">
                        {isTransferring ? "Wait for current transfer to complete." : "Max 3 files in queue."}
                      </p>
                    )
                  ) : (
                    <p className="text-xs sm:text-sm text-amber-600 font-medium">Waiting for another member to join.</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          {files.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>File Queue</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {files.map((file) => (
                    <div key={file.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="bg-gray-100 p-2 rounded shrink-0 hidden sm:block">
                        <FileIcon className="h-5 w-5 text-gray-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2">
                            <div className="bg-gray-100 p-2 rounded shrink-0 sm:hidden">
                              <FileIcon className="h-4 w-4 text-gray-600" />
                            </div>
                            <div>
                              <p className="text-sm font-medium truncate">{file.name}</p>
                              <span className="text-xs text-gray-500">({formatFileSize(file.size)})</span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between sm:justify-end gap-2 mt-2 sm:mt-0">
                            <div className="flex items-center gap-1">
                              {getStatusIcon(file.status)}
                              <span className="text-xs font-medium">{getStatusText(file.status)}</span>
                            </div>
                            {file.status === "queued" && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-8"
                                onClick={() => sendFile(file.id)}
                                disabled={!isConnected || isTransferring}
                              >
                                Send
                              </Button>
                            )}
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => cancelFile(file.id)}>
                              <XCircle className="h-4 w-4 text-gray-400" />
                            </Button>
                          </div>
                        </div>
                        {(file.status === "transferring" || file.status === "sent" || file.status === "received") && (
                          <div className="flex items-center gap-2 mt-2">
                            <Progress value={file.progress} className="w-full h-2" />
                            <span className="text-xs text-gray-500 w-8 text-right">{file.progress}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {files.length === 0 && members === 2 && (
            <div className="text-center py-8 text-gray-500">
              <p>No files in queue. Drag and drop files to start sharing.</p>
            </div>
          )}
        </div>
      </main>

      <footer className="mt-auto py-3 border-t border-gray-200">
        <div className="container mx-auto px-4">
          <div className="text-center text-xs text-gray-500">
            <p>linkDrop</p>
          </div>
        </div>
      </footer>
    </div>
  )
}

