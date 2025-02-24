import { BrowserRouter as Router, Route, Routes } from "react-router-dom";
import LandingPage from "@/pages/LandingPage";
import ChannelPage from "@/pages/ChannelPage";
import { Toaster } from "@/components/ui/sonner";

export default function App() {
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
