import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import LandingPage from "@/pages/LandingPage";
import ChannelPage from "@/pages/ChannelPage";
import { Toaster } from "@/components/ui/sonner";
import socket from "./lib/socket"; // Import the socket instance
import { useEffect } from "react";

export default function App() {
  useEffect(() => {
    // Connect to Socket.IO server when the app mounts
    socket.connect();

    // Clean up the connection when the app unmounts
    return () => {
      socket.disconnect();
    };
  }, []);

  return (
    <Router>
      <>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/channel/:channelId" element={<ChannelPage />} />
        </Routes>
        <Toaster />
      </>
    </Router>
  );
}