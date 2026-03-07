const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server, {
    cors: {
        origin: ["http://localhost:8000", "http://127.0.0.1:8000"],
        methods: ["GET", "POST"]
    }
});
const path = require('path');

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Fallback to index.html for the main route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('add-object', (data) => {
        console.log(`Received add-object: ${data.type}`);
        socket.broadcast.emit('spawn-item', data);
    });

    socket.on('trigger-fire', () => {
        console.log('Fire triggered!');
        socket.broadcast.emit('start-fire');
    });

    socket.on('stop-fire', () => {
        console.log('Fire stopped!');
        socket.broadcast.emit('end-fire');
    });

    // Relay state updates from the simulation back to dashboard/control panel
    socket.on('state-update', (data) => {
        socket.broadcast.emit('state-update', data);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server listening on *: ${PORT}`);
    console.log(`Simulation Interface: http://localhost:${PORT}/`);
    console.log(`Control Panel:        http://localhost:${PORT}/control.html`);
});
