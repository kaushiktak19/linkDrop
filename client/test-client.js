import { io } from "socket.io-client";

// First client
const socket1 = io('http://localhost:5000');

socket1.on('connect', () => {
  console.log('Client 1 connected:', socket1.id);

  // Set up listeners for Client 1
  socket1.on('channelUpdated', (data) => {
    console.log('Channel Updated Event (Client 1):', data);
  });
  socket1.on('receiveMessage', (data) => {
    console.log('Client 1 received:', data);
  });
  socket1.on('userLeft', (data) => {
    console.log('User Left Event (Client 1):', data);
  });
  socket1.on('channelDeleted', (data) => {
    console.log('Channel Deleted Event (Client 1):', data);
    socket1.disconnect();
  });
  socket1.on('disconnect', () => {
    console.log('Client 1 disconnected');
  });

  // Test createChannel
  socket1.emit('createChannel', { password: 'testpass', userId: 'user1' }, (response) => {
    console.log('Create Channel Response:', response);
    if (response.success) {
      const channelId = response.channelId;

      // Test getChannel
      socket1.emit('getChannel', { channelId }, (details) => {
        console.log('Channel Details:', details);

        // Second client
        const socket2 = io('http://localhost:5000');
        socket2.on('connect', () => {
          console.log('Client 2 connected:', socket2.id);

          // Set up listeners for Client 2
          socket2.on('receiveMessage', (data) => {
            console.log('Client 2 received:', data);
            // Test leaveChannel after receiving the message
            socket2.emit('leaveChannel', { channelId });
          });
          socket2.on('userLeft', (data) => {
            console.log('User Left Event (Client 2):', data);
            // Test terminateChannel after leaving
            socket1.emit('terminateChannel', { channelId });
          });
          socket2.on('channelDeleted', (data) => {
            console.log('Channel Deleted Event (Client 2):', data);
            socket2.disconnect();
          });
          socket2.on('disconnect', () => {
            console.log('Client 2 disconnected');
          });

          // Test joinChannel
          socket2.emit('joinChannel', { channelId, password: 'testpass' }, (joinResponse) => {
            console.log('Join Channel Response:', joinResponse);
            if (joinResponse.success) {
              // Test sendMessage after joining
              socket1.emit('sendMessage', { channelId, message: 'Hello from Client 1!' });
            }
          });
        });
      });
    }
  });
});

socket1.on('error', (err) => {
  console.error('Client 1 error:', err);
});