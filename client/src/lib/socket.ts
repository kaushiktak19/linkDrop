import io from "socket.io-client";

// Replace with your backend URL (e.g., "http://localhost:5000" for development)
const socket = io("http://localhost:5000", {
  withCredentials: true, // If your backend requires credentials
});

export default socket;