import React, { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import axios from "axios";

export default function ChannelPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();
  const [members, setMembers] = useState<number>(0);
  //const [creatorId, setCreatorId] = useState<string>(""); 
  const [isCreator, setIsCreator] = useState<boolean>(false);

  useEffect(() => {
    const fetchChannelDetails = async () => {
      try {
        const response = await axios.get(`/api/channel/${channelId}`);
        const updatedMembers = response.data.members;
        if (updatedMembers !== members) {
          setMembers(updatedMembers);
        }
        const currentUserId = localStorage.getItem('userId');
        setIsCreator(currentUserId === response.data.creator);
      } catch (error) {
        console.error("Error fetching channel details:", error);
      }
    };
  
    fetchChannelDetails();
    const interval = setInterval(fetchChannelDetails, 5000);
    return () => clearInterval(interval);
  }, [channelId, members]);
   

  const handleLeave = async () => {
    await axios.post("/api/channel/leave", { channelId });
    navigate("/");
  };

  const handleTerminate = async () => {
    await axios.post("/api/channel/terminate", { channelId });
    navigate("/");
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader>
          <CardTitle className="text-2xl text-center">Channel Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-center">
          <div>
            <span className="font-semibold">Channel ID:</span>
            <span className="ml-2">{channelId}</span>
          </div>
          <div>
            <span className="font-semibold">Current Members:</span>
            <span className="ml-2">{members}</span>
          </div>
          {isCreator ? (
            <Button className="w-full" onClick={handleTerminate} variant="destructive">
              Terminate Channel
            </Button>
          ) : (
            <Button className="w-full" onClick={handleLeave}>
              Leave Channel
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
