import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import  { v4 as uuidv4 } from "uuid";

export default function LandingPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [channelId, setChannelId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const userId = localStorage.getItem('userId') || uuidv4();
  localStorage.setItem('userId', userId);

  const navigate = useNavigate();

  const handleCreateChannel = async () => {
    if (!password) {
      setErrorMessage("Please enter a password");
      return;
    }

    try {
      const response = await axios.post("/api/channel/create", { password, userId });
      const { channelId } = response.data;
      navigate(`/channel/${channelId}`);
    } catch (error) {
      console.error("Error creating channel:", error);
      setErrorMessage("Failed to create channel. Try again later.");
    }
  };

  const handleJoinChannel = async () => {
    if (!channelId || !password) {
      setErrorMessage("Please enter both Channel ID and Password");
      return;
    }

    try {
      await axios.post("/api/channel/join", {
        channelId,
        password,
      });
      navigate(`/channel/${channelId}`);
    } catch (error) {
      console.error("Error joining channel:", error);
      setErrorMessage("Invalid Channel ID or Password");
      alert("Invalid Channel ID or Password")
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100 flex flex-col items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-md mx-auto">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tighter sm:text-5xl text-gray-900">linkDrop</h1>
          <p className="text-gray-500 md:text-lg">Secure P2P file sharing made simple. No registration required.</p>
        </div>

        <div className="text-red-500">{errorMessage}</div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
            <DialogTrigger asChild>
              <Button size="lg" className="text-base px-8 py-6 shadow-lg hover:shadow-xl transition-shadow">
                Create Channel
              </Button>
            </DialogTrigger>
            <DialogContent>
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
                  Create
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={isJoinOpen} onOpenChange={setIsJoinOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                size="lg"
                className="text-base px-8 py-6 shadow-lg hover:shadow-xl transition-shadow"
              >
                Join Channel
              </Button>
            </DialogTrigger>
            <DialogContent>
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
                  Join
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </div>
  );
}
