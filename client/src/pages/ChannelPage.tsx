import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Copy, Users, XCircle } from "lucide-react";
import { toast } from "sonner";
import socket from "@/lib/socket";

// Define the response type for getChannel
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
  status: "queued" | "transferring" | "pending" | "completed" | "cancelled";
}

export default function ChannelPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const [members, setMembers] = useState<number>(0);
  const [isCreator, setIsCreator] = useState<boolean>(false);
  const [files, setFiles] = useState<QueuedFile[]>([]);

  useEffect(() => {
    if (!channelId) return;

    // Fetch initial channel details
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

    // Set up real-time listeners
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

    // Cleanup listeners when component unmounts
    return () => {
      socket.off("channelUpdated");
      socket.off("userLeft");
      socket.off("channelDeleted");
    };
  }, [channelId, navigate]);

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

  // Dropzone Config with Restrictions
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    maxFiles: 3,
    onDrop: (acceptedFiles) => {
      const newFiles = acceptedFiles.map((file) => ({
        id: Math.random().toString(36).substr(2, 9),
        name: file.name,
        size: file.size,
        progress: 0,
        status: "queued" as const,
      }));
      setFiles((prev) => [...prev, ...newFiles]);
    },
    disabled: members !== 2 || files.length >= 3,
  });

  const cancelFile = (id: string) => {
    setFiles((prev) => prev.filter((file) => file.id !== id));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
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

        {/* Drop Zone */}
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

        {/* Queue Status */}
        {files.length > 0 && (
          <div className="bg-white rounded-lg shadow-sm divide-y">
            {files.map((file) => (
              <div key={file.id} className="p-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium truncate">{file.name}</p>
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}