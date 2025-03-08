import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useNavigate } from "react-router-dom"
import { v4 as uuidv4 } from "uuid"
import { toast } from "sonner"
import socket from "@/lib/socket"
import { ArrowRight, Lock, Share2 } from "lucide-react"

// Define response types
interface ChannelActionResponse {
  success: boolean
  channelId?: string
  error?: string
}

export default function LandingPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [isJoinOpen, setIsJoinOpen] = useState(false)
  const [password, setPassword] = useState("")
  const [channelId, setChannelId] = useState("")

  const userId = localStorage.getItem("userId") || uuidv4()
  localStorage.setItem("userId", userId)

  const navigate = useNavigate()

  const handleCreateChannel = () => {
    if (!password) {
      toast("Please enter a password to create a channel.")
      return
    }

    socket.emit("createChannel", { password, userId }, (response: ChannelActionResponse) => {
      if (response.success) {
        toast("Channel created successfully.")
        navigate(`/channel/${response.channelId}`)
        setIsCreateOpen(false)
      } else {
        toast(response.error || "Failed to create channel.")
      }
    })
  }

  const handleJoinChannel = () => {
    if (!channelId || !password) {
      toast("Both Channel ID and Password are required.")
      return
    }

    socket.emit("joinChannel", { channelId, password }, (response: ChannelActionResponse) => {
      if (response.success) {
        toast("Successfully joined the channel.")
        navigate(`/channel/${channelId}`)
        setIsJoinOpen(false)
      } else {
        toast(response.error || "Invalid Channel ID or Password.")
      }
    })
  }

  return (
    <div className="min-h-screen flex flex-col">
      <header className="container mx-auto py-6 px-4">
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-2">
            <Share2 className="h-6 w-6 text-primary" />
            <span className="font-bold text-xl">linkDrop</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center px-4 py-8 sm:py-12">
        <div className="max-w-4xl w-full mx-auto grid md:grid-cols-2 gap-8 md:gap-12 items-center">
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight text-gray-900 mb-4">
                Secure P2P file sharing
                <span className="text-primary"> made simple</span>
              </h1>
              <p className="text-base sm:text-lg text-gray-600">
                Share files directly between devices with end-to-end encryption. No registration, no storage limits, no
                tracking.
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="bg-primary/10 p-2 rounded-full shrink-0">
                  <Lock className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">End-to-end encrypted</h3>
                  <p className="text-sm text-gray-600">
                    Files are transferred directly between peers with no server storage
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="bg-primary/10 p-2 rounded-full shrink-0">
                  <Share2 className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-medium">No size limits</h3>
                  <p className="text-sm text-gray-600">Transfer files of any size without restrictions</p>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 sm:p-8 rounded-xl shadow-lg border border-gray-100">
            <div className="space-y-6">
              <h2 className="text-xl sm:text-2xl font-semibold text-center">Get Started</h2>

              <div className="grid gap-4">
                <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
                  <DialogTrigger asChild>
                    <Button size="lg" className="w-full gap-2 py-5 sm:py-6">
                      Create New Channel
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Create New Channel</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="password">Set Channel Password</Label>
                        <Input
                          id="password"
                          type="password"
                          placeholder="Enter secure password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </div>
                      <Button className="w-full" onClick={handleCreateChannel}>
                        Create Channel
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>

                <Dialog open={isJoinOpen} onOpenChange={setIsJoinOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline" size="lg" className="w-full gap-2 py-5 sm:py-6">
                      Join Existing Channel
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                      <DialogTitle>Join Existing Channel</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label htmlFor="channel">Channel ID</Label>
                        <Input
                          id="channel"
                          placeholder="Enter channel ID"
                          value={channelId}
                          onChange={(e) => setChannelId(e.target.value)}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="join-password">Channel Password</Label>
                        <Input
                          id="join-password"
                          type="password"
                          placeholder="Enter channel password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </div>
                      <Button className="w-full" onClick={handleJoinChannel}>
                        Join Channel
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

